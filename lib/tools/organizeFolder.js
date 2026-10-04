import { runFileAction } from '@/lib/tools/fileActions';

/**
 * Live tool `organize_folder`: Folder organizer with preview, apply, and undo.
 */
export default {
  declaration: {
    name: 'organize_folder',
    description: 'Sorts the loose top-level files of a folder (e.g. "~/Downloads", or the Desktop at "~/Desktop") into sub-folders by type (Images, Videos, Audio, Documents, Spreadsheets, Presentations, Archives, Code, Installers, Fonts, 3D Models, Others) or, with group_by "date", into month folders like "2026-10 October" by last-modified date. Sub-folders, hidden files, and unfinished downloads are left alone. ALWAYS run mode "preview" first, tell the operator the plan, and run mode "apply" only after they explicitly confirm. Mode "undo" reverses the most recent organize.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: {
          type: 'STRING',
          description: 'Folder to organize (e.g. "~/Downloads"). Optional for mode "undo".',
        },
        mode: {
          type: 'STRING',
          description: 'preview (default, moves nothing), apply (moves files), or undo (reverses the last organize).',
          enum: ['preview', 'apply', 'undo'],
        },
        group_by: {
          type: 'STRING',
          description: 'type (default) or date (month folders). Use the same value for preview and apply.',
          enum: ['type', 'date'],
        },
      },
    },
  },

  run(args, ctx) {
    return runFileAction('organize_folder', args, `ORGANIZE ${(args.mode || 'preview').toUpperCase()}`, ctx);
  },
};
