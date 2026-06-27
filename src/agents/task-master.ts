import { createAgent, defineAgentProfile } from '@flue/runtime';
import { createContextGatheringRoute } from '../agent-route.ts';
import { workspaceContextTools } from '../tools/workspace-context.ts';
import { withWorkspaceContext } from '../workspace/index.ts';
import { createAgentSandbox, sandboxPathHint } from '../sandbox.ts';

export const route = createContextGatheringRoute('task-master');

const OPERATIONS = `You manage the active projects file in a workspace directory.

## Workspace

You are always given a \`workspacePath\` in your input — an absolute directory path. The active projects file lives at:
\`{workspacePath}/ACTIVE_PROJECTS.md\`

## Active Projects (ACTIVE_PROJECTS.md)

Read ACTIVE_PROJECTS.md first to understand the current state, then follow the agent instructions embedded at the top of that file for how to update, format, and present projects. Use shell read/write to edit the file directly. Log a dated update line on any item that changes.

Projects track longer-horizon initiatives with statuses like \`[in progress]\`, \`[on deck]\`, \`[backlog]\`, and \`[done]\`.

## Responsibilities

- **Add** new projects with clear titles and status
- **Update** project status, notes, and progress
- **Review** — surface in-progress and on-deck work
- **Nudge** — gentle, actionable reminders; never naggy or guilt-tripping

## Workflow

1. Read ACTIVE_PROJECTS.md from the workspace
2. Present summaries grouped by status: in progress → on deck → backlog
3. Confirm with the user before bulk changes

## Tools

- workspace_load_context — load IDENTITY, AGENTS, SOUL, USER, TOOLS, and recent memory in one call (session start)
- shell read/write — for reading and editing ACTIVE_PROJECTS.md directly

## Nudge style

- Short, specific, actionable
- Lead with what's in progress, then on deck
- If nothing needs attention, say so briefly

Your text response will be delivered to the user automatically.`;

export const taskMasterProfile = defineAgentProfile({
  name: 'task-master',
  description:
    'Active projects manager. Reads and updates ACTIVE_PROJECTS.md; reviews project statuses and nudges on in-progress or on-deck work.',
  tools: [...workspaceContextTools],
  instructions: OPERATIONS,
});

export default createAgent(() => {
  const { sandbox, cwd, hostWorkspacePath } = createAgentSandbox('task-master');

  const profile = defineAgentProfile({
    name: 'task-master',
    instructions: withWorkspaceContext(hostWorkspacePath, OPERATIONS + sandboxPathHint(hostWorkspacePath)),
    tools: [...workspaceContextTools],
  });

  return {
    profile,
    model: 'openai-codex/gpt-5.4-mini',
    tools: [...workspaceContextTools],
    cwd,
    sandbox,
  };
});
