import { NextResponse } from 'next/server';
import {
  TodoError,
  addTodos,
  clearDoneTodos,
  describeTodos,
  listTodos,
  removeTodo,
  restoreTodos,
  renameTodo,
  setTodoStatus,
  statusWord,
} from '@/lib/todoList';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: /api/todos (Phase 15)
 * GET returns the to-do list (display order) with counts. POST { action } changes it and returns the
 * new list, for the HUD's TASKS panel and the `todo_list` live tool:
 *   add { items | text, status? } · status { id | match, status } · rename { id | match, text }
 *   remove { id | match } · clear_done · restore { undo_id } (the panel's UNDO) · list
 */
export async function GET(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  return NextResponse.json({ success: true, ...listTodos() });
}

export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // Empty or invalid body
  }

  const reply = (message, extra = {}) => {
    const list = listTodos();
    return NextResponse.json({ success: true, message, ...extra, ...list, summary: describeTodos(list.todos) });
  };

  try {
    switch (body.action) {
      case 'list': {
        const { todos } = listTodos();
        return reply(describeTodos(todos));
      }
      case 'add': {
        const { added, skipped } = addTodos(body);
        const parts = [];
        if (added.length) parts.push(`Added ${added.map((t) => `"${t.text}"`).join(', ')}${body.status === 'doing' ? ' (in progress)' : ''}.`);
        if (skipped.length) parts.push(`Already on the list: ${skipped.map((t) => `"${t}"`).join(', ')}.`);
        return reply(parts.join(' '), { added: added.map((t) => t.id) });
      }
      case 'status': {
        const { todo, previous } = setTodoStatus(body);
        const message = previous === todo.status
          ? `"${todo.text}" was already ${statusWord(todo.status)}.`
          : `"${todo.text}" is now ${statusWord(todo.status)}.`;
        return reply(message, { id: todo.id });
      }
      case 'rename': {
        const { todo, previous } = renameTodo(body);
        return reply(`Renamed "${previous}" to "${todo.text}".`, { id: todo.id });
      }
      case 'remove': {
        const { todo, undo_id: undoId } = removeTodo(body);
        return reply(`Removed "${todo.text}" (say "undo" to bring it back).`, { id: todo.id, undo_id: undoId });
      }
      case 'clear_done': {
        const { removed, undo_id: undoId } = clearDoneTodos();
        return reply(removed.length
          ? `Cleared ${removed.length} finished task${removed.length === 1 ? '' : 's'} (say "undo" to bring them back).`
          : 'There were no finished tasks to clear.', undoId ? { undo_id: undoId } : {});
      }
      case 'restore': {
        const { restored } = restoreTodos(body.undo_id);
        return reply(`Put back ${restored} task${restored === 1 ? '' : 's'}.`);
      }
      default:
        return NextResponse.json({ success: false, message: `Unknown to-do action "${body.action}".` }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof TodoError) return NextResponse.json({ success: false, message: error.message });
    console.error('[/api/todos] failed:', error);
    return NextResponse.json({ success: false, message: `The to-do list could not be changed: ${error.message}` }, { status: 500 });
  }
}
