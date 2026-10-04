import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateText } from '@/lib/geminiText';
import { ProcessError, requireInput, outputPath, recordOutput, formatBytes, requireKey } from '@/lib/fileProcessor/common';

/**
 * Audio / video (Phase 8.9): info via ffprobe, trim and audio extraction via ffmpeg, and
 * transcription via Gemini (audio compressed to mono 16 kHz MP3, sent in 15-minute chunks).
 */

const execFileAsync = promisify(execFile);
export const MEDIA_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', 'mpeg', 'mpg', 'wmv'];
const CHUNK_SECONDS = 15 * 60;
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

async function ffmpeg(args) {
  try {
    await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
  } catch (err) {
    if (err.code === 'ENOENT') throw new ProcessError('ffmpeg is not installed (e.g. "sudo apt install ffmpeg").');
    throw new ProcessError(`ffmpeg failed: ${(err.stderr || err.message).toString().trim().split('\n').at(-1).slice(0, 200)}`);
  }
}

export async function probe(target) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', target], { timeout: 30000 });
    return JSON.parse(stdout);
  } catch (err) {
    if (err.code === 'ENOENT') throw new ProcessError('ffprobe is not installed (it comes with ffmpeg).');
    throw new ProcessError('This file could not be read as audio or video.');
  }
}

/**
 * "90", "1:30", "01:02:03", "1m30s" -> seconds.
 */
export function parseTime(value, label) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  let seconds = null;
  if (/^\d+(\.\d+)?$/.test(text)) seconds = Number(text);
  else if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(text)) seconds = text.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
  else {
    const match = text.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/);
    if (match && (match[1] || match[2] || match[3])) seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  }
  if (seconds === null || Number.isNaN(seconds)) throw new ProcessError(`"${value}" is not a time for ${label} (use seconds, mm:ss, or hh:mm:ss).`);
  return seconds;
}

const clock = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

export async function processMedia(action, target, options, apiKey) {
  const { size, ext } = requireInput(target, MEDIA_EXTENSIONS);
  const info = await probe(target);
  const duration = Number(info.format?.duration || 0);
  const video = info.streams?.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const audio = info.streams?.find((s) => s.codec_type === 'audio');

  switch (action) {
    case 'info': {
      const fps = video?.avg_frame_rate && video.avg_frame_rate !== '0/0' ? Math.round(parseFraction(video.avg_frame_rate)) : null;
      return {
        message: `${video ? 'Video' : 'Audio'} file, ${clock(duration)} long, ${formatBytes(size)}.${video ? ` Video: ${video.codec_name} ${video.width}×${video.height}${fps ? ` at ${fps} fps` : ''}.` : ''}${audio ? ` Audio: ${audio.codec_name}, ${audio.channels} channel(s), ${audio.sample_rate} Hz.` : ' No audio track.'}`,
        duration_seconds: Math.round(duration),
      };
    }

    case 'trim': {
      const start = parseTime(options.start, 'the start') ?? 0;
      const end = parseTime(options.end, 'the end') ?? duration;
      if (end <= start) throw new ProcessError('The end must be after the start.');
      if (start >= duration) throw new ProcessError(`The file is only ${clock(duration)} long.`);
      const out = outputPath(target, `-trim-${clock(start).replace(/:/g, '.')}-${clock(Math.min(end, duration)).replace(/:/g, '.')}`, ext);
      // Stream copy is instant but cuts on keyframes; precise mode re-encodes
      const codec = options.precise ? [] : ['-c', 'copy'];
      await ffmpeg(['-ss', String(start), '-to', String(end), '-i', target, ...codec, '-avoid_negative_ts', 'make_zero', out]);
      return { message: `Trimmed ${clock(start)}–${clock(Math.min(end, duration))} into ${recordOutput(out)}${options.precise ? '' : ' (cut on the nearest keyframes; ask for a precise trim if it is off by a moment)'}.`, output: out };
    }

    case 'extract_audio': {
      if (!audio) throw new ProcessError('This file has no audio track.');
      const format = String(options.format || 'mp3').toLowerCase();
      const codecs = { mp3: ['-c:a', 'libmp3lame', '-q:a', '2'], m4a: ['-c:a', 'aac', '-b:a', '192k'], wav: ['-c:a', 'pcm_s16le'] };
      if (!codecs[format]) throw new ProcessError('Extract audio as mp3, m4a, or wav.');
      const out = outputPath(target, '-audio', format);
      await ffmpeg(['-i', target, '-vn', ...codecs[format], out]);
      return { message: `Extracted the audio to ${recordOutput(out)} (${formatBytes(fs.statSync(out).size)}).`, output: out };
    }

    case 'transcribe': {
      if (!audio) throw new ProcessError('This file has no audio track to transcribe.');
      requireKey(apiKey, 'Transcription');
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-transcribe-'));
      try {
        await ffmpeg(['-i', target, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', '-f', 'segment', '-segment_time', String(CHUNK_SECONDS), path.join(work, 'part-%03d.mp3')]);
        const parts = fs.readdirSync(work).filter((f) => f.endsWith('.mp3')).sort();
        const sections = [];
        for (const [index, part] of parts.entries()) {
          const offset = index * CHUNK_SECONDS;
          const data = fs.readFileSync(path.join(work, part)).toString('base64');
          const text = await generateText({
            apiKey,
            timeoutMs: 5 * 60 * 1000,
            prompt: `Transcribe this audio verbatim in its original language. Start a new paragraph with a [m:ss] timestamp roughly every 30 seconds or at each change of speaker, counting from ${clock(offset)} (this is part ${index + 1} of ${parts.length}). Label speakers as Speaker 1, Speaker 2 when there is more than one. Output only the transcript; if there is no speech, reply exactly: NO SPEECH.`,
            attachments: [{ inlineData: { mimeType: 'audio/mp3', data } }],
          });
          if (!/^NO SPEECH\.?$/i.test(text.trim())) sections.push(text.trim());
        }
        if (!sections.length) return { message: 'No speech was found in the recording.' };
        const transcript = sections.join('\n\n');
        const out = outputPath(target, '-transcript', 'txt');
        fs.writeFileSync(out, `${transcript}\n`, 'utf-8');
        return {
          message: `Transcribed ${clock(duration)} of audio (${parts.length} part(s)); saved ${recordOutput(out)}.`,
          transcript: transcript.slice(0, 8000),
          truncated: transcript.length > 8000,
          output: out,
        };
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
      }
    }

    default:
      throw new ProcessError('Audio / video support: info, trim, extract_audio, transcribe.');
  }
}

function parseFraction(text) {
  const [a, b] = String(text).split('/').map(Number);
  return b ? a / b : a;
}
