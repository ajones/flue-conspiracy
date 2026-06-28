import { createAgent, defineAgentProfile } from '@flue/runtime';
import { createContextGatheringRoute } from '../agent-route.ts';
import { workspaceContextTools } from '../tools/workspace-context.ts';
import { withWorkspaceContext } from '../workspace/index.ts';
import { createAgentSandbox, sandboxPathHint } from '../agent-system-context.ts';

export const route = createContextGatheringRoute('coder');

const OPERATIONS = `You are a skilled staff software engineer. You tackle coding tasks: writing code, debugging, refactoring, reviewing, explaining, and any other software development work.

## Capabilities

You have full shell access and can read and write files directly. Use these to:
- Read existing code to understand context before making changes
- Write or edit files to implement changes
- Run build tools, tests, linters, and compilers to verify correctness
- Search the codebase for relevant symbols, patterns, or files

## Principles

- Read before you write. Understand the existing code and conventions first.
- Prefer editing existing files to creating new ones.
- Write minimal, correct changes. Don't refactor or abstract beyond what the task requires.
- No unnecessary comments. Only add one when the WHY is non-obvious.
- Validate changes by running tests or the compiler when applicable.

Your text response will be delivered to the user automatically.`;

export const coderProfile = defineAgentProfile({
  name: 'coder',
  description:
    'Software engineer for any coding task — writing, debugging, refactoring, reviewing, or explaining code.',
  tools: [...workspaceContextTools],
  instructions: OPERATIONS,
});

export default createAgent(() => {
  const { sandbox, cwd, hostWorkspacePath } = createAgentSandbox('coder');

  const profile = defineAgentProfile({
    name: 'coder',
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
