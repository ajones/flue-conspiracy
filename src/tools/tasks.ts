import { defineTool } from '@flue/runtime';
import { createLogger } from '../log.ts';
import {
  TASKS_FILENAME,
  addList,
  addTask,
  deleteTask,
  listTasks,
  readTasksFile,
  updateTask,
  writeTasksFile,
} from '../tasks/store.ts';

const log = createLogger('tasks');

const listLists = defineTool({
  name: 'tasks_list_lists',
  description: `List task lists in the workspace. Reads ${TASKS_FILENAME}.`,
  parameters: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Absolute path to the workspace directory containing tasks.json.',
      },
    },
    required: ['workspace'],
    additionalProperties: false,
  },
  async execute(input: Record<string, unknown>) {
    const { workspace } = input as { workspace: string };
    log.info('tasks_list_lists', { workspace });
    const data = await readTasksFile(workspace);
    return JSON.stringify(data.lists, null, 2);
  },
});

const listTasksTool = defineTool({
  name: 'tasks_list',
  description: `List tasks from the workspace ${TASKS_FILENAME}. Filter by list, status, or due date.`,
  parameters: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Absolute path to the workspace directory.',
      },
      list_id: {
        type: 'string',
        description: 'Filter to a specific list ID.',
      },
      status: {
        type: 'string',
        enum: ['open', 'completed'],
        description: 'Filter by status.',
      },
      include_completed: {
        type: 'boolean',
        description: 'Include completed tasks when status is not set. Default false.',
      },
      due_before: {
        type: 'string',
        description: 'Include tasks with due date on or before this YYYY-MM-DD.',
      },
      due_after: {
        type: 'string',
        description: 'Include tasks with due date on or after this YYYY-MM-DD.',
      },
    },
    required: ['workspace'],
    additionalProperties: false,
  },
  async execute(input: Record<string, unknown>) {
    const { workspace, list_id, status, include_completed, due_before, due_after } = input as {
      workspace: string;
      list_id?: string;
      status?: 'open' | 'completed';
      include_completed?: boolean;
      due_before?: string;
      due_after?: string;
    };
    log.info('tasks_list', { workspace, list_id, status });
    const data = await readTasksFile(workspace);
    const tasks = listTasks(data, {
      listId: list_id,
      status,
      includeCompleted: include_completed,
      dueBefore: due_before,
      dueAfter: due_after,
    });
    return JSON.stringify(tasks, null, 2);
  },
});

const addTaskTool = defineTool({
  name: 'tasks_add',
  description: 'Add a new task to the workspace task list.',
  parameters: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Absolute path to the workspace directory.',
      },
      title: {
        type: 'string',
        description: 'Task title.',
      },
      list_id: {
        type: 'string',
        description: 'List ID. Defaults to "default".',
      },
      notes: {
        type: 'string',
        description: 'Optional notes.',
      },
      due: {
        type: 'string',
        description: 'Due date as YYYY-MM-DD.',
      },
      parent_id: {
        type: 'string',
        description: 'Optional parent task ID for subtasks.',
      },
    },
    required: ['workspace', 'title'],
    additionalProperties: false,
  },
  async execute(input: Record<string, unknown>) {
    const { workspace, title, list_id, notes, due, parent_id } = input as {
      workspace: string;
      title: string;
      list_id?: string;
      notes?: string;
      due?: string;
      parent_id?: string;
    };
    log.info('tasks_add', { workspace, title, list_id });
    const data = await readTasksFile(workspace);
    const task = addTask(data, { listId: list_id, title, notes, due, parentId: parent_id });
    await writeTasksFile(workspace, data);
    return JSON.stringify(task, null, 2);
  },
});

const updateTaskTool = defineTool({
  name: 'tasks_update',
  description: 'Update an existing task (title, notes, due date, status, list, or position).',
  parameters: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Absolute path to the workspace directory.',
      },
      task_id: {
        type: 'string',
        description: 'Task ID.',
      },
      title: {
        type: 'string',
        description: 'New title.',
      },
      notes: {
        type: 'string',
        description: 'New notes.',
      },
      due: {
        type: 'string',
        description: 'New due date (YYYY-MM-DD), or empty string to clear.',
      },
      status: {
        type: 'string',
        enum: ['open', 'completed'],
        description: 'Task status.',
      },
      list_id: {
        type: 'string',
        description: 'Move to a different list.',
      },
      parent_id: {
        type: 'string',
        description: 'Parent task ID, or empty string for top level.',
      },
      position: {
        type: 'number',
        description: 'Sort position among siblings.',
      },
    },
    required: ['workspace', 'task_id'],
    additionalProperties: false,
  },
  async execute(input: Record<string, unknown>) {
    const { workspace, task_id, title, notes, due, status, list_id, parent_id, position } = input as {
      workspace: string;
      task_id: string;
      title?: string;
      notes?: string;
      due?: string;
      status?: 'open' | 'completed';
      list_id?: string;
      parent_id?: string;
      position?: number;
    };
    log.info('tasks_update', { workspace, task_id, status });
    const data = await readTasksFile(workspace);
    const task = updateTask(data, task_id, {
      title,
      notes,
      due: due === '' ? null : due,
      status,
      listId: list_id,
      parentId: parent_id === '' ? null : parent_id,
      position,
    });
    await writeTasksFile(workspace, data);
    return JSON.stringify(task, null, 2);
  },
});

const deleteTaskTool = defineTool({
  name: 'tasks_delete',
  description: 'Delete a task and its subtasks from the workspace.',
  parameters: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Absolute path to the workspace directory.',
      },
      task_id: {
        type: 'string',
        description: 'Task ID.',
      },
    },
    required: ['workspace', 'task_id'],
    additionalProperties: false,
  },
  async execute(input: Record<string, unknown>) {
    const { workspace, task_id } = input as { workspace: string; task_id: string };
    log.info('tasks_delete', { workspace, task_id });
    const data = await readTasksFile(workspace);
    deleteTask(data, task_id);
    await writeTasksFile(workspace, data);
    return JSON.stringify({ deleted: true, task_id });
  },
});

const addListTool = defineTool({
  name: 'tasks_add_list',
  description: 'Create a new task list in the workspace.',
  parameters: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Absolute path to the workspace directory.',
      },
      title: {
        type: 'string',
        description: 'List title.',
      },
      list_id: {
        type: 'string',
        description: 'Optional list ID. Generated if omitted.',
      },
    },
    required: ['workspace', 'title'],
    additionalProperties: false,
  },
  async execute(input: Record<string, unknown>) {
    const { workspace, title, list_id } = input as { workspace: string; title: string; list_id?: string };
    log.info('tasks_add_list', { workspace, title });
    const data = await readTasksFile(workspace);
    const list = addList(data, title, list_id);
    await writeTasksFile(workspace, data);
    return JSON.stringify(list, null, 2);
  },
});

export const taskTools = [
  listLists,
  listTasksTool,
  addTaskTool,
  updateTaskTool,
  deleteTaskTool,
  addListTool,
];
