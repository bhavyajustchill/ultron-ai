import { postJson } from '@/lib/tools/http';

const STATUS_FOR = { start: 'doing', done: 'done', reopen: 'todo' };

/**
 * Live tool `todo_list` (Phase 15): the operator's to-do list, the same one the HUD's TASKS panel
 * shows. Tasks are named by a few of their words; several matches come back so Ultron can ask.
 * Removing and clearing tasks are undoable ("undo").
 */
export default {
  declaration: {
    name: 'todo_list',
    description:
      'The operator\'s to-do list, shown in the HUD\'s TASKS panel. add puts one or more tasks on it (items); list says what is in progress, to do, and done today; start marks a task in progress; done ticks it off; reopen puts a finished task back to do; rename rewords one; remove deletes one; clear_done removes all finished tasks (remove and clear_done can be undone with undo_last_action); show / hide opens or closes the TASKS panel. Name an existing task with a few words from it (task); if several match, the candidates come back, so ask which. Keep tasks short and in the operator\'s words ("Buy milk", "Call the bank about the card"). For an alert at a time, use reminders instead.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'What to do.',
          enum: ['add', 'list', 'start', 'done', 'reopen', 'rename', 'remove', 'clear_done', 'show', 'hide'],
        },
        items: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'add: the tasks to add, one short task per entry.',
        },
        task: {
          type: 'STRING',
          description: 'start / done / reopen / rename / remove: a few words from the task (e.g. "milk").',
        },
        id: {
          type: 'STRING',
          description: 'The exact task id, when an earlier call returned candidates and the operator picked one.',
        },
        text: {
          type: 'STRING',
          description: 'rename: the new wording of the task.',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const action = args.action || 'list';
    const store = ctx.store.getState();

    if (action === 'show' || action === 'hide') {
      store.setIsTodoOpen(action === 'show');
      if (action === 'show') await store.loadTodos();
      const { todos } = ctx.store.getState();
      const open = todos.filter((t) => t.status !== 'done').length;
      const message = action === 'show' ? `The TASKS panel is open (${open} open task${open === 1 ? '' : 's'}).` : 'The TASKS panel is closed.';
      ctx.log(`[TASKS] ${message}`);
      return { success: true, message };
    }

    const body = { action, id: args.id, match: args.task };
    if (action === 'add') {
      body.items = Array.isArray(args.items) && args.items.length ? args.items : [args.text || args.task].filter(Boolean);
    } else if (STATUS_FOR[action]) {
      body.action = 'status';
      body.status = STATUS_FOR[action];
    } else if (action === 'rename') {
      body.text = args.text;
    }

    ctx.log(`[TASKS] ${action.toUpperCase().replace('_', ' ')}${args.task ? ` ("${args.task}")` : ''}...`);
    let result = { success: false, message: 'The to-do list could not be reached.' };
    try {
      result = await postJson('/api/todos', body);
    } catch (err) {
      console.error('[tools/todo_list] Error:', err);
    }
    if (Array.isArray(result.todos)) ctx.store.setState({ todos: result.todos, todoCounts: result.counts });
    ctx.log(`[TASKS] ${result.message}`);
    // The panel already shows the list; Ultron only needs the outcome and a summary to speak from
    return { success: result.success, message: result.message, ...(result.summary ? { list: result.summary } : {}) };
  },
};
