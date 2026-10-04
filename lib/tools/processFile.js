import { postJson } from '@/lib/tools/http';

/**
 * Live tool `process_file` (Phase 8.9): images, PDFs, spreadsheets, audio / video.
 */
export default {
  declaration: {
    name: 'process_file',
    description: 'Works on a file inside the allowed folders; the file type decides what is possible. IMAGES: info, resize (width / height), compress (quality), convert (format), ocr (read the text), describe (or answer a question about it). PDFs: info, text (optional pages), summarize (or answer a question, citing pages; scanned PDFs work too), extract_pages (pages like "2-4, 7" into a new PDF). SPREADSHEETS (CSV, TSV, XLSX): stats, preview, filter (column + operator + value), sort (sort_by + order), export (to csv / xlsx, with any filter / sort applied); set save to keep a filtered or sorted result. AUDIO / VIDEO: info, trim (start / end like "1:30"), extract_audio (format), transcribe (saves a transcript). Results go next to the original under a new name and can be undone. Uploaded files live in "~/Documents/Ultron Uploads".',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'The file, e.g. "~/Downloads/report.pdf".' },
        action: {
          type: 'STRING',
          description: 'What to do (see the description for which actions fit which file type).',
          enum: ['info', 'resize', 'compress', 'convert', 'ocr', 'describe', 'text', 'summarize', 'extract_pages', 'stats', 'preview', 'filter', 'sort', 'export', 'trim', 'extract_audio', 'transcribe'],
        },
        width: { type: 'NUMBER', description: 'resize: target width in pixels.' },
        height: { type: 'NUMBER', description: 'resize: target height in pixels.' },
        quality: { type: 'NUMBER', description: 'compress / convert: quality 20-95.' },
        format: { type: 'STRING', description: 'convert: jpg, png, webp, avif, tiff, gif. export: csv or xlsx. extract_audio: mp3, m4a, wav.' },
        question: { type: 'STRING', description: 'describe / summarize: a specific question to answer about the file.' },
        pages: { type: 'STRING', description: 'PDF pages, e.g. "1-3, 5".' },
        sheet: { type: 'STRING', description: 'Excel sheet name (default: the first).' },
        column: { type: 'STRING', description: 'filter: column name.' },
        operator: { type: 'STRING', description: 'filter: =, !=, >, >=, <, <=, contains, starts_with.', enum: ['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts_with'] },
        value: { type: 'STRING', description: 'filter: value to compare with.' },
        sort_by: { type: 'STRING', description: 'sort / export: column to sort by.' },
        order: { type: 'STRING', description: 'asc or desc.', enum: ['asc', 'desc'] },
        save: { type: 'BOOLEAN', description: 'filter / sort: also write the result to a new file.' },
        start: { type: 'STRING', description: 'trim: start time (seconds, m:ss, or h:mm:ss).' },
        end: { type: 'STRING', description: 'trim: end time.' },
        precise: { type: 'BOOLEAN', description: 'trim: frame-accurate (slower, re-encodes).' },
      },
      required: ['path', 'action'],
    },
  },

  async run(args, ctx) {
    ctx.log(`[FILE PROCESSOR] ${String(args.action || 'info').toUpperCase()} "${args.path}"...`);
    let result = { success: false, message: 'Failed to contact the file processor.' };
    try {
      result = await postJson('/api/file-processor', args, { 'x-gemini-api-key': ctx.apiKey() });
    } catch (err) {
      console.error('[tools/process_file] Error:', err);
    }
    ctx.log(`[FILE PROCESSOR] ${result.success ? 'Done' : 'Failed'}: ${String(result.message).slice(0, 300)}`);
    return result;
  },
};
