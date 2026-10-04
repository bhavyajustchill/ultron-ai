import { runFileAction } from '@/lib/tools/fileActions';

/**
 * Live tool `create_document`: Markdown to PDF / DOCX documents in the workspace.
 */
export default {
  declaration: {
    name: 'create_document',
    description: 'Creates a formatted PDF or Word (DOCX) document inside the allowed workspace folders. Write the content as markdown: "#"/"##"/"###" headings, "-" bullets, "1." numbered items, **bold**, *italic*, `code`, and "---" dividers. Fails if the file exists unless overwrite is true (the old version is backed up).',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Where to save the document, e.g. "~/Documents/reports/weekly-summary.pdf". The extension is added if missing.',
        },
        format: {
          type: 'STRING',
          description: 'Document format: pdf (default) or docx (Microsoft Word).',
          enum: ['pdf', 'docx'],
        },
        title: {
          type: 'STRING',
          description: 'Optional document title shown at the top.',
        },
        content: {
          type: 'STRING',
          description: 'The full document body in markdown.',
        },
        overwrite: {
          type: 'BOOLEAN',
          description: 'Replace an existing file at this path (only after the operator agrees).',
        },
      },
      required: ['path', 'content'],
    },
  },

  run(args, ctx) {
    return runFileAction('create_document', args, `CREATE ${(args.format || 'pdf').toUpperCase()} DOCUMENT`, ctx);
  },
};
