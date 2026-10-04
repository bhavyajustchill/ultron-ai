import { runFileAction } from '@/lib/tools/fileActions';

/**
 * Live tool `file_operations`: Sandboxed file create / read / write / edit / open.
 */
export default {
  declaration: {
    name: 'file_operations',
    description: 'Creates, reads, edits, and opens files and folders inside the operator\'s allowed workspace folders. Actions: list_directory (folder contents), read_file (text only), create_folder, create_file (fails if the file exists), write_file (replaces the whole file; previous version is backed up), append_file (adds text to the end), replace_in_file (exact find-and-replace; previous version is backed up), open_path (opens a file or folder in its default app, or in the code editor with app "code"). There is no delete action.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'The file action to perform.',
          enum: [
            'list_directory',
            'read_file',
            'create_folder',
            'create_file',
            'write_file',
            'append_file',
            'replace_in_file',
            'open_path',
          ],
        },
        path: {
          type: 'STRING',
          description: 'Target file or folder path. Use "~" for the home folder (e.g. "~/Desktop/project-notes/todo.md").',
        },
        content: {
          type: 'STRING',
          description: 'Text content for create_file, write_file, or append_file.',
        },
        find: {
          type: 'STRING',
          description: 'replace_in_file only: the exact existing text to replace, copied from read_file output.',
        },
        replace: {
          type: 'STRING',
          description: 'replace_in_file only: the replacement text (empty string removes the found text).',
        },
        replace_all: {
          type: 'BOOLEAN',
          description: 'replace_in_file only: replace every occurrence instead of requiring exactly one match.',
        },
        app: {
          type: 'STRING',
          description: 'open_path only: "default" (system default app) or "code" (open in the code editor).',
          enum: ['default', 'code'],
        },
      },
      required: ['action', 'path'],
    },
  },

  run(args, ctx) {
    return runFileAction(args.action || '', args, (args.action || '').toUpperCase(), ctx);
  },
};
