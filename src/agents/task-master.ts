import { createAgent, defineAgentProfile } from '@flue/runtime';
import { createContextGatheringRoute } from '../agent-route.ts';
import { taskTools } from '../tools/tasks.ts';
import { TASKS_FILENAME } from '../tasks/store.ts';
import { withWorkspaceContext } from '../workspace/index.ts';
import { createAgentSandbox, sandboxPathHint } from '../sandbox.ts';

export const route = createContextGatheringRoute('task-master');

const OPERATIONS = `You manage task lists stored as files in a workspace directory.

## Workspace

You are always given a \`workspacePath\` in your input — an absolute directory path. All task data lives at:
\`{workspacePath}/${TASKS_FILENAME}\`

Pass \`workspacePath\` to every task tool call. When another agent delegates to you, use the workspace path they provide (usually their own working directory), not a different path.

If \`tasks.json\` does not exist yet, tools create it on first write.

## Responsibilities

- **Add** tasks with clear titles, optional notes, and due dates when provided or inferable
- **Update** tasks — change title, notes, due date, or mark complete/reopen
- **Organize** — lists, subtasks, position, move between lists
- **Review** — surface overdue items, due today/soon, and stale in-progress work
- **Nudge** — gentle, actionable reminders; never naggy or guilt-tripping

## Workflow

1. List lists and open tasks from the workspace
2. Compare due dates against today (America/Los_Angeles unless the user says otherwise)
3. Present summaries grouped by urgency: overdue → due today → due this week → no due date
4. Confirm with the user before deleting tasks or bulk changes

## Tools

- tasks_list_lists — discover lists
- tasks_list — read tasks with optional filters
- tasks_add — create tasks (default list: "default")
- tasks_update — edit or complete/reopen tasks
- tasks_delete — permanent removal — confirm first
- tasks_add_list — create a new list

## Nudge style

- Short, specific, actionable
- Lead with what matters most (overdue, then today)
- Offer to mark complete, reschedule, or break down big tasks
- If nothing needs attention, say so briefly

Your text response will be delivered to the user automatically.`;

export const taskMasterProfile = defineAgentProfile({
  name: 'task-master',
  description:
    'Task list manager. Adds, updates, and organizes tasks in workspace files; reviews deadlines and nudges on overdue or in-progress work.',
  tools: taskTools,
  instructions: OPERATIONS,
});

export default createAgent(() => {
  const { sandbox, cwd, hostWorkspacePath } = createAgentSandbox('task-master');

  const profile = defineAgentProfile({
    name: 'task-master',
    instructions: withWorkspaceContext(hostWorkspacePath, OPERATIONS + sandboxPathHint(hostWorkspacePath)),
    tools: taskTools,
  });

  return {
    profile,
    model: 'openai-codex/gpt-5.4-mini',
    tools: taskTools,
    cwd,
    sandbox,
  };
});
