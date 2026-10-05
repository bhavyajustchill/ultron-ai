import fs from 'fs';
import path from 'path';
import { listUndo, pushUndo, takeUndo } from '@/lib/undoJournal';

/**
 * The operator's to-do list (Phase 15): tasks in data/todos.json, each "todo", "doing" (in
 * progress), or "done". The HUD's TASKS panel and the `todo_list` live tool share it through
 * /api/todos. Writes are atomic (temp file + rename) and synchronous, so requests never
 * interleave; removing or clearing tasks is undoable ("undo").
 *
 * Test override: JARVIS_TODOS_FILE.
 */

export const TODOS_FILE = path.resolve(/*turbopackIgnore: true*/ process.env.JARVIS_TODOS_FILE || path.join(process.cwd(), 'data', 'todos.json'));

export const TODO_STATUSES = ['todo', 'doing', 'done'];
export const MAX_TODOS = 300;
export const MAX_TODO_CHARS = 200;
const STATUS_WORDS = { todo: 'to do', doing: 'in progress', done: 'done' };

export class TodoError extends Error {}

// ---------------------------------------------------------------------------
// File access
// ---------------------------------------------------------------------------

function readList() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(TODOS_FILE, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { todos: [] };
    console.error('[todoList] Could not read the to-do list:', err.message);
    return { todos: [], unreadable: true };
  }
  const todos = Array.isArray(raw?.todos) ? raw.todos : [];
  return { todos: todos.filter((t) => t && typeof t.id === 'string' && typeof t.text === 'string') };
}

function writeList(list) {
  if (list.unreadable) throw new TodoError('The to-do list file could not be read, so it was not overwritten.');
  fs.mkdirSync(path.dirname(TODOS_FILE), { recursive: true });
  const tmp = `${TODOS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, todos: list.todos }, null, 1), 'utf-8');
  fs.renameSync(tmp, TODOS_FILE);
}

function updateList(change) {
  const list = readList();
  const result = change(list);
  writeList(list);
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const newTodoId = () => `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const normalize = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const quoted = (todo) => `"${todo.text}"`;

function cleanText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new TodoError('A task needs some text.');
  if (clean.length > MAX_TODO_CHARS) throw new TodoError(`Tasks are kept under ${MAX_TODO_CHARS} characters; say it more briefly.`);
  return clean;
}

const order = { doing: 0, todo: 1, done: 2 };
const timeOf = (value) => new Date(value || 0).getTime();

/**
 * The display order: in progress first, then to do (oldest first, as added), then done (newest first).
 */
export function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    if (a.status !== b.status) return order[a.status] - order[b.status];
    if (a.status === 'done') return timeOf(b.done_at) - timeOf(a.done_at);
    return timeOf(a.created_at) - timeOf(b.created_at);
  });
}

export function countTodos(todos) {
  const counts = { todo: 0, doing: 0, done: 0 };
  for (const todo of todos) counts[todo.status] = (counts[todo.status] || 0) + 1;
  return { ...counts, open: counts.todo + counts.doing, total: todos.length };
}

/**
 * Finds one task by id, or by words from its text. `prefer` lists the statuses to try first (for
 * example open tasks when ticking one off). Several equally good matches → TodoError listing them.
 */
function findTodo(todos, { id, match }, prefer = TODO_STATUSES) {
  if (id) {
    const byId = todos.find((t) => t.id === id);
    if (!byId) throw new TodoError('That task is no longer on the list.');
    return byId;
  }
  const query = normalize(match);
  if (!query) throw new TodoError('Say which task (a few words from it).');
  const words = query.split(' ');
  const score = (todo) => {
    const text = normalize(todo.text);
    if (text === query) return 3;
    if (text.includes(query)) return 2;
    return words.every((w) => text.includes(w)) ? 1 : 0;
  };
  const pools = [todos.filter((t) => prefer.includes(t.status)), todos];
  for (const pool of pools) {
    const scored = pool.map((todo) => ({ todo, score: score(todo) })).filter((s) => s.score > 0);
    if (!scored.length) continue;
    const best = Math.max(...scored.map((s) => s.score));
    const top = scored.filter((s) => s.score === best);
    if (top.length === 1) return top[0].todo;
    throw new TodoError(`Several tasks match "${match}": ${top.slice(0, 5).map((s) => quoted(s.todo)).join(', ')}. Which one?`);
  }
  throw new TodoError(`No task on the list matches "${match}".`);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function listTodos() {
  const { todos } = readList();
  return { todos: sortTodos(todos), counts: countTodos(todos) };
}

/**
 * Adds one or more tasks (`items`, or a single `text`). Open tasks with the same wording are skipped.
 */
export function addTodos({ items, text, status = 'todo' }) {
  const wanted = (Array.isArray(items) && items.length ? items : [text]).map(cleanText);
  const initial = status === 'doing' ? 'doing' : 'todo';
  return updateList((list) => {
    const added = [];
    const skipped = [];
    for (const entry of wanted) {
      const key = normalize(entry);
      const existing = list.todos.find((t) => t.status !== 'done' && normalize(t.text) === key);
      if (existing || added.some((t) => normalize(t.text) === key)) {
        skipped.push(entry);
        continue;
      }
      if (list.todos.length >= MAX_TODOS) throw new TodoError(`The list is full (${MAX_TODOS} tasks); clear some finished ones first.`);
      const now = new Date().toISOString();
      const todo = { id: newTodoId(), text: entry, status: initial, created_at: now, updated_at: now, done_at: null };
      list.todos.push(todo);
      added.push(todo);
    }
    return { added, skipped };
  });
}

/**
 * Moves a task to "todo", "doing", or "done".
 */
export function setTodoStatus({ id, match, status }) {
  if (!TODO_STATUSES.includes(status)) throw new TodoError(`Unknown task status "${status}".`);
  // Ticking off or starting looks at open tasks first; reopening looks at finished ones first
  const prefer = status === 'todo' ? ['done', 'doing'] : ['doing', 'todo'];
  return updateList((list) => {
    const todo = findTodo(list.todos, { id, match }, prefer);
    const previous = todo.status;
    const now = new Date().toISOString();
    todo.status = status;
    todo.updated_at = now;
    todo.done_at = status === 'done' ? (previous === 'done' ? todo.done_at : now) : null;
    return { todo, previous };
  });
}

export function renameTodo({ id, match, text }) {
  const clean = cleanText(text);
  return updateList((list) => {
    const todo = findTodo(list.todos, { id, match });
    const previous = todo.text;
    todo.text = clean;
    todo.updated_at = new Date().toISOString();
    return { todo, previous };
  });
}

/**
 * Removes one task (undoable).
 */
export function removeTodo({ id, match }) {
  return updateList((list) => {
    const todo = findTodo(list.todos, { id, match });
    list.todos = list.todos.filter((t) => t.id !== todo.id);
    const undo = pushUndo(`removed the task ${quoted(todo)}`, 'todo_changed', { before: [todo] });
    return { todo, undo_id: undo.id };
  });
}

/**
 * Removes every finished task (undoable).
 */
export function clearDoneTodos() {
  return updateList((list) => {
    const done = list.todos.filter((t) => t.status === 'done');
    if (!done.length) return { removed: [] };
    list.todos = list.todos.filter((t) => t.status !== 'done');
    const undo = pushUndo(`cleared ${done.length} finished task${done.length === 1 ? '' : 's'}`, 'todo_changed', { before: done });
    return { removed: done, undo_id: undo.id };
  });
}

/**
 * Undo record replay: puts removed tasks back (and drops any listed in remove_ids).
 */
export function revertTodos({ before = [], remove_ids: removeIds = [] }) {
  return updateList((list) => {
    const remove = new Set(removeIds);
    list.todos = list.todos.filter((t) => !remove.has(t.id));
    for (const record of before) {
      const index = list.todos.findIndex((t) => t.id === record.id);
      if (index >= 0) list.todos[index] = record;
      else list.todos.push(record);
    }
    return { restored: before.length, removed: removeIds.length };
  });
}

/**
 * The TASKS panel's UNDO: reverts one removal by its undo record, if it is still on the undo stack.
 */
export function restoreTodos(undoId) {
  // Only a to-do record may be taken off the stack here
  const listed = listUndo().find((entry) => entry.id === undoId);
  const entry = listed?.kind === 'todo_changed' ? takeUndo(undoId) : null;
  if (!entry) throw new TodoError('That can no longer be undone.');
  return revertTodos(entry.data);
}

/**
 * One spoken-style line about the list ("2 open: in progress "x"; to do "y". 1 done.").
 */
export function describeTodos(todos) {
  const counts = countTodos(todos);
  if (!counts.total) return 'The to-do list is empty.';
  const sorted = sortTodos(todos);
  const names = (status) => sorted.filter((t) => t.status === status).map(quoted);
  const parts = [];
  if (counts.doing) parts.push(`in progress: ${names('doing').join(', ')}`);
  if (counts.todo) parts.push(`to do: ${names('todo').join(', ')}`);
  const open = counts.open ? `${counts.open} open task${counts.open === 1 ? '' : 's'} (${parts.join('; ')}).` : 'No open tasks.';
  const today = new Date().toDateString();
  const doneToday = sorted.filter((t) => t.status === 'done' && new Date(t.done_at).toDateString() === today);
  const done = counts.done ? ` ${counts.done} done${doneToday.length ? `, ${doneToday.length} of them today (${doneToday.slice(0, 5).map(quoted).join(', ')})` : ''}.` : '';
  return `${open}${done}`;
}

export const statusWord = (status) => STATUS_WORDS[status] || status;
