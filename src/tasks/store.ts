import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const TASKS_FILENAME = 'tasks.json';

export type TaskStatus = 'open' | 'completed';

export interface TaskList {
  id: string;
  title: string;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  due?: string;
  parentId?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TasksFile {
  version: 1;
  lists: TaskList[];
  tasks: Task[];
}

function tasksPath(workspace: string): string {
  return join(workspace, TASKS_FILENAME);
}

function defaultFile(): TasksFile {
  return {
    version: 1,
    lists: [{ id: 'default', title: 'Tasks' }],
    tasks: [],
  };
}

export async function readTasksFile(workspace: string): Promise<TasksFile> {
  const path = tasksPath(workspace);
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as TasksFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.lists) || !Array.isArray(parsed.tasks)) {
      throw new Error(`Invalid ${TASKS_FILENAME} format`);
    }
    return parsed;
  } catch (err: any) {
    if (err.code === 'ENOENT') return defaultFile();
    throw err;
  }
}

export async function writeTasksFile(workspace: string, data: TasksFile): Promise<void> {
  const path = tasksPath(workspace);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
}

function touch(task: Task): void {
  task.updatedAt = new Date().toISOString();
}

export function findTask(data: TasksFile, taskId: string): Task | undefined {
  return data.tasks.find((t) => t.id === taskId);
}

export function findList(data: TasksFile, listId: string): TaskList | undefined {
  return data.lists.find((l) => l.id === listId);
}

export function nextPosition(data: TasksFile, listId: string, parentId?: string): number {
  const siblings = data.tasks.filter(
    (t) => t.listId === listId && (t.parentId ?? undefined) === (parentId ?? undefined),
  );
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((t) => t.position)) + 1;
}

export interface ListTasksFilter {
  listId?: string;
  status?: TaskStatus;
  dueBefore?: string;
  dueAfter?: string;
  includeCompleted?: boolean;
}

export function listTasks(data: TasksFile, filter: ListTasksFilter = {}): Task[] {
  let tasks = data.tasks;

  if (filter.listId) tasks = tasks.filter((t) => t.listId === filter.listId);
  if (filter.status) tasks = tasks.filter((t) => t.status === filter.status);
  else if (!filter.includeCompleted) tasks = tasks.filter((t) => t.status !== 'completed');

  if (filter.dueBefore) tasks = tasks.filter((t) => t.due && t.due <= filter.dueBefore!);
  if (filter.dueAfter) tasks = tasks.filter((t) => t.due && t.due >= filter.dueAfter!);

  return [...tasks].sort((a, b) => {
    if (a.listId !== b.listId) return a.listId.localeCompare(b.listId);
    if ((a.parentId ?? '') !== (b.parentId ?? '')) return (a.parentId ?? '').localeCompare(b.parentId ?? '');
    return a.position - b.position;
  });
}

export interface AddTaskInput {
  listId?: string;
  title: string;
  notes?: string;
  due?: string;
  parentId?: string;
}

export function addTask(data: TasksFile, input: AddTaskInput): Task {
  const listId = input.listId ?? 'default';
  if (!findList(data, listId)) {
    throw new Error(`Unknown list: ${listId}`);
  }
  if (input.parentId && !findTask(data, input.parentId)) {
    throw new Error(`Unknown parent task: ${input.parentId}`);
  }

  const now = new Date().toISOString();
  const task: Task = {
    id: randomUUID(),
    listId,
    title: input.title,
    notes: input.notes,
    status: 'open',
    due: input.due,
    parentId: input.parentId,
    position: nextPosition(data, listId, input.parentId),
    createdAt: now,
    updatedAt: now,
  };
  data.tasks.push(task);
  return task;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  due?: string | null;
  status?: TaskStatus;
  listId?: string;
  parentId?: string | null;
  position?: number;
}

export function updateTask(data: TasksFile, taskId: string, input: UpdateTaskInput): Task {
  const task = findTask(data, taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);

  if (input.listId !== undefined) {
    if (!findList(data, input.listId)) throw new Error(`Unknown list: ${input.listId}`);
    task.listId = input.listId;
  }
  if (input.title !== undefined) task.title = input.title;
  if (input.notes !== undefined) task.notes = input.notes;
  if (input.due !== undefined) task.due = input.due ?? undefined;
  if (input.parentId !== undefined) task.parentId = input.parentId ?? undefined;
  if (input.position !== undefined) task.position = input.position;

  if (input.status !== undefined) {
    task.status = input.status;
    if (input.status === 'completed') {
      task.completedAt = new Date().toISOString();
    } else {
      task.completedAt = undefined;
    }
  }

  touch(task);
  return task;
}

export function deleteTask(data: TasksFile, taskId: string): void {
  const idx = data.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) throw new Error(`Unknown task: ${taskId}`);
  data.tasks.splice(idx, 1);
  data.tasks = data.tasks.filter((t) => t.parentId !== taskId);
}

export function addList(data: TasksFile, title: string, id?: string): TaskList {
  const list: TaskList = { id: id ?? randomUUID(), title };
  data.lists.push(list);
  return list;
}
