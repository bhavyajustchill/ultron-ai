import fs from 'fs';
import sharp from 'sharp';
import { generateText } from '@/lib/geminiText';
import { ProcessError, requireInput, outputPath, recordOutput, formatBytes, requireKey } from '@/lib/fileProcessor/common';

/**
 * Images (Phase 8.9): info, resize, compress, convert with sharp; OCR and questions via Gemini vision.
 */

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'bmp', 'svg'];
const OUTPUT_FORMATS = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', avif: 'avif', tiff: 'tiff', gif: 'gif' };
const VISION_MAX_EDGE = 2048;

function encoderFor(ext) {
  const format = OUTPUT_FORMATS[ext];
  if (!format) throw new ProcessError(`Images can be saved as ${Object.keys(OUTPUT_FORMATS).join(', ')}.`);
  return format;
}

function applyFormat(pipeline, format, quality) {
  if (format === 'jpeg') return pipeline.jpeg({ quality: quality ?? 82, mozjpeg: true });
  if (format === 'webp') return pipeline.webp({ quality: quality ?? 80 });
  if (format === 'avif') return pipeline.avif({ quality: quality ?? 55 });
  if (format === 'png') return quality ? pipeline.png({ quality, palette: true, compressionLevel: 9 }) : pipeline.png({ compressionLevel: 9 });
  return pipeline.toFormat(format);
}

async function visionPrompt(target, prompt, apiKey) {
  requireKey(apiKey, 'Reading an image');
  // Large photos are scaled down first: plenty for reading text, far smaller to send
  const jpeg = await sharp(target).rotate().resize({ width: VISION_MAX_EDGE, height: VISION_MAX_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  return generateText({ apiKey, prompt, attachments: [{ inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }] });
}

export async function processImage(action, target, options, apiKey) {
  const { size, ext } = requireInput(target, IMAGE_EXTENSIONS);
  const meta = await sharp(target).metadata();
  const dims = `${meta.width}×${meta.height}`;

  switch (action) {
    case 'info':
      return { message: `${meta.format?.toUpperCase()} image, ${dims} pixels, ${formatBytes(size)}${meta.hasAlpha ? ', with transparency' : ''}.`, width: meta.width, height: meta.height, format: meta.format, bytes: size };

    case 'resize': {
      const width = options.width ? Math.round(Number(options.width)) : null;
      const height = options.height ? Math.round(Number(options.height)) : null;
      if (!width && !height) throw new ProcessError('Give a width and/or height in pixels.');
      if ((width && (width < 1 || width > 20000)) || (height && (height < 1 || height > 20000))) throw new ProcessError('Sizes must be between 1 and 20000 pixels.');
      const outExt = ext === 'jpeg' ? 'jpg' : OUTPUT_FORMATS[ext] ? ext : 'png';
      const out = outputPath(target, `-${width || 'auto'}x${height || 'auto'}`, outExt);
      const info = await applyFormat(sharp(target).rotate().resize({ width: width || undefined, height: height || undefined, fit: options.fit === 'cover' ? 'cover' : 'inside' }), encoderFor(outExt)).toFile(out);
      return { message: `Resized ${dims} to ${info.width}×${info.height}: saved ${recordOutput(out)} (${formatBytes(info.size)}).`, output: out };
    }

    case 'compress': {
      const quality = Math.min(95, Math.max(20, Math.round(Number(options.quality) || 70)));
      const outExt = ['png', 'webp', 'avif', 'jpg', 'jpeg'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg';
      const out = outputPath(target, '-compressed', outExt);
      const info = await applyFormat(sharp(target).rotate(), encoderFor(outExt), quality).toFile(out);
      if (info.size >= size) {
        fs.unlinkSync(out);
        return { message: `Compressing at quality ${quality} would not make ${formatBytes(size)} smaller; the image is already well compressed. Try converting to WebP or AVIF instead.` };
      }
      return { message: `Compressed ${formatBytes(size)} → ${formatBytes(info.size)} (${Math.round((1 - info.size / size) * 100)}% smaller): saved ${recordOutput(out)}.`, output: out };
    }

    case 'convert': {
      const outExt = String(options.format || '').toLowerCase().replace(/^\./, '');
      const format = encoderFor(outExt);
      const out = outputPath(target, '', outExt === 'jpeg' ? 'jpg' : outExt);
      const info = await applyFormat(sharp(target, { animated: format === 'gif' || format === 'webp' }).rotate(), format, options.quality ? Number(options.quality) : undefined).toFile(out);
      return { message: `Converted to ${outExt.toUpperCase()}: saved ${recordOutput(out)} (${formatBytes(info.size)}).`, output: out };
    }

    case 'ocr': {
      const text = await visionPrompt(target, 'Transcribe all text in this image exactly as written, keeping line breaks and reading order. Output only the text. If there is no readable text, reply exactly: NO TEXT FOUND.', apiKey);
      const empty = /^NO TEXT FOUND\.?$/i.test(text.trim());
      return { message: empty ? 'No readable text was found in the image.' : `Read ${text.length} characters of text from the image.`, text: empty ? '' : text.slice(0, 20000) };
    }

    case 'describe': {
      const answer = await visionPrompt(target, options.question ? `Answer about this image: ${options.question}` : 'Describe this image in 2-4 sentences: subject, setting, notable details, and any visible text.', apiKey);
      return { message: answer.slice(0, 4000) };
    }

    default:
      throw new ProcessError(`Images support: info, resize, compress, convert, ocr, describe.`);
  }
}
