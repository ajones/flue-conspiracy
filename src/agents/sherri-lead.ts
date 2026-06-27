import { createAgent, defineAgentProfile } from '@flue/runtime';
import { createContextGatheringRoute } from '../agent-route.ts';
import { workspaceContextTools } from '../tools/workspace-context.ts';
import { withWorkspaceContext } from '../workspace/index.ts';
import { createAgentSandbox, sandboxPathHint } from '../agent-system-context.ts';

export const route = createContextGatheringRoute('sherri-lead');

const OPERATIONS = `At session start, call workspace_load_context once with your workspace path before doing anything else.

Reply to the user with the result. Your text response will be delivered to the user automatically. For Telegram conversations, you can attach images by adding [[attach:/absolute/path/to/image.jpg]] on its own line (supported: jpg, png, gif, webp).`;

export default createAgent(() => {
  const { sandbox, cwd, hostWorkspacePath } = createAgentSandbox('sherri-lead');

  const sherriLead = defineAgentProfile({
    name: 'sherri-lead',
    instructions: withWorkspaceContext(hostWorkspacePath, OPERATIONS + sandboxPathHint(hostWorkspacePath)),
  });

  return {
    profile: sherriLead,
    model: 'openai-codex/gpt-5.4-mini',
    compaction: {
      reserveTokens: 8000,
      keepRecentTokens: 3000,
    },
    tools: [...workspaceContextTools],
    cwd,
    sandbox,
  };
});
