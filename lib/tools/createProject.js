import { postJson } from '@/lib/tools/http';

/**
 * Live tool `create_project`: Background project scaffolding with the operator's generators.
 */
export default {
  declaration: {
    name: 'create_project',
    description: 'Scaffolds a new software project as a background job using the operator\'s preferred generators: node-express (Node.js Express API via @bhavyajustchill/init: JavaScript MVC or TypeScript modular), admin-panel (React + Tailwind + shadcn admin template via @bhavyajustchill/init), nextjs (create-next-app), react (Vite, JavaScript), flutter (flutter create). Returns immediately with a job id; a [PROJECT UPDATE] message arrives when it finishes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        template: {
          type: 'STRING',
          description: 'Project template.',
          enum: ['node-express', 'admin-panel', 'nextjs', 'react', 'flutter'],
        },
        name: {
          type: 'STRING',
          description: 'Project name (converted to kebab-case, or snake_case for Flutter).',
        },
        location: {
          type: 'STRING',
          description: 'Parent folder for the project (default "~/dev").',
        },
        language: {
          type: 'STRING',
          description: 'node-express and nextjs only: js (default) or ts. React projects are always JavaScript.',
          enum: ['js', 'ts'],
        },
        install_dependencies: {
          type: 'BOOLEAN',
          description: 'Install dependencies after generating (default true).',
        },
      },
      required: ['template', 'name'],
    },
  },

  async run(args, ctx) {
    ctx.log(`[PROJECT] Requesting ${args.template || '?'} project "${args.name || ''}"...`);
    let result = { success: false, message: 'Failed to contact the project scaffolder.' };
    try {
      result = await postJson('/api/projects', args);
    } catch (err) {
      console.error('[tools/create_project] Scaffolding error:', err);
    }
    if (!result.success) {
      ctx.log(`[PROJECT] Failed: ${result.message}`);
      return { status: 'FAILED', message: result.message };
    }
    const { job } = result;
    ctx.log(`[PROJECT] Scaffolding ${job.templateLabel} at ${job.path} in the background...`);
    ctx.watchProjectJob(job.id);
    return {
      status: 'STARTED',
      job_id: job.id,
      path: job.path,
      template: job.templateLabel,
      message:
        'Scaffolding is running in the background (usually 10 seconds to 3 minutes). A [PROJECT UPDATE] message will arrive when it finishes; tell the operator you are on it.',
    };
  },
};
