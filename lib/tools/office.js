import { postJson } from '@/lib/tools/http';

/**
 * Live tool `office` (Phase 15): Word, Excel, and PowerPoint on Windows; LibreOffice on Linux.
 */
export default {
  declaration: {
    name: 'office',
    description:
      'Works in Word, Excel, and PowerPoint (Microsoft Office on Windows; LibreOffice Writer, Calc, and Impress on Linux), in the copy already open or a new one, bringing it to the front. Actions: status (which apps and documents are open), new (blank document / workbook / presentation; on Linux text or rows given here are written into the new file), open (a file), write_text (Word: at the cursor, or at the end with position "end"; PowerPoint: into the selected text box), write_cells (Excel: rows starting at `cell` or the selected cell), add_slide (PowerPoint: a new slide with title and text), read (the open document\'s text, cells, or slides; Windows only), save, save_as (a path; never replaces an existing file unless the operator agreed and overwrite is true), close (the active document; refused with unsaved changes unless the operator said to discard them; the app closes with its last document). Prefer this over typing for Office documents.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Office action.',
          enum: ['status', 'new', 'open', 'write_text', 'write_cells', 'add_slide', 'read', 'save', 'save_as', 'close'],
        },
        app: {
          type: 'STRING',
          description: 'word, excel, or powerpoint (also: document, spreadsheet, presentation).',
          enum: ['word', 'excel', 'powerpoint'],
        },
        text: {
          type: 'STRING',
          description: 'write_text / new: the text, exactly as dictated (\\n for new paragraphs). add_slide: the slide body (\\n between bullet points).',
        },
        rows: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'write_cells / new (Excel): one string per row, cells separated by " | ", e.g. ["Item | Price", "Tea | 40", "Total | =SUM(B2:B2)"]. Numbers stay numbers; "=..." is a formula.',
        },
        cell: {
          type: 'STRING',
          description: 'write_cells: top-left cell such as "A1" (default: the selected cell).',
        },
        sheet: {
          type: 'STRING',
          description: 'write_cells: sheet name (default: the active sheet).',
        },
        title: {
          type: 'STRING',
          description: 'add_slide: the slide title. new (Linux): the document title / file name.',
        },
        position: {
          type: 'STRING',
          description: 'write_text: cursor (default) or end.',
          enum: ['cursor', 'end'],
        },
        path: {
          type: 'STRING',
          description: 'open / save_as: the file, e.g. "~/Documents/Report.docx", or just a name ("Budget" saves to Documents with the right extension; ".pdf" exports a PDF).',
        },
        overwrite: {
          type: 'BOOLEAN',
          description: 'save_as: replace an existing file (only after the operator agreed).',
        },
        discard_changes: {
          type: 'BOOLEAN',
          description: 'close: close without saving (only when the operator said to discard the changes).',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    ctx.log(`[OFFICE] ${(args.action || 'status').toUpperCase().replace('_', ' ')}${args.app ? ` (${args.app})` : ''}...`);
    let result = { success: false, message: 'Failed to contact the Office bridge.' };
    try {
      result = await postJson('/api/office', args);
    } catch (err) {
      console.error('[tools/office] Office error:', err);
    }
    ctx.log(`[OFFICE] ${result.success ? 'Done' : 'Failed'}: ${result.message}`);
    return result;
  },
};
