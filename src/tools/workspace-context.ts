import { defineTool } from '@flue/runtime';
import { createLogger } from '../log.ts';
import { formatWorkspaceContext, loadWorkspaceContext } from '../workspace/index.ts';

const log = createLogger('workspace-context');

const loadContext = defineTool({
  name: 'workspace_load_context',
  description:
    'Load workspace context files in one call: IDENTITY.md, AGENTS.md, SOUL.md, USER.md, TOOLS.md, and memory logs for today and yesterday. Missing files are skipped without error. Call once at session start instead of reading each file separately.',
  parameters: {
    type: 'object',
    properties: {
      workspace: {
        type: 'string',
        description: 'Absolute path to the workspace directory (your Working directory).',
      },
      include_long_term_memory: {
        type: 'boolean',
        description: 'Also load MEMORY.md. Use in main/direct sessions only.',
      },
      tz: {
        type: 'string',
        description: 'IANA timezone for memory/YYYY-MM-DD.md dates. Default: America/Los_Angeles.',
      },
    },
    required: ['workspace'],
    additionalProperties: false,
  },
  async execute(input: Record<string, unknown>) {
    const { workspace, include_long_term_memory, tz } = input as {
      workspace: string;
      include_long_term_memory?: boolean;
      tz?: string;
    };
    log.info('workspace_load_context', {
      workspace,
      includeLongTermMemory: include_long_term_memory,
    });
    const result = loadWorkspaceContext(workspace, {
      includeLongTermMemory: include_long_term_memory,
      tz,
    });
    return formatWorkspaceContext(result);
  },
});

export const workspaceContextTools = [loadContext];
