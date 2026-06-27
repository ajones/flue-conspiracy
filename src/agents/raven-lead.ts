import { createAgent, defineAgentProfile } from '@flue/runtime';
import { createContextGatheringRoute } from '../agent-route.ts';
import { weatherManProfile } from './weather-man.ts';
import { homeAssistantProfile } from './home-assistant.ts';
import { taskMasterProfile } from './task-master.ts';
import { appleNotesTools } from '../tools/apple-notes.ts';
import { icalReaderTools } from '../tools/ical-reader.ts';
import { workspaceContextTools } from '../tools/workspace-context.ts';
import { withWorkspaceContext } from '../workspace/index.ts';
import { createAgentSandbox, sandboxPathHint } from '../sandbox.ts';

export const route = createContextGatheringRoute('raven-lead');

const OPERATIONS = `At session start, call workspace_load_context once with your workspace path before doing anything else.

Delegate to the right subagent based on what the user needs:
- 'weather-man' for anything weather-related — current conditions, forecasts, highs/lows, weekly outlooks
- 'task-master' for task lists AND active projects — adding, updating, organizing tasks, reviewing deadlines, nudging on overdue or in-progress work, and managing anything in ACTIVE_PROJECTS.md (project statuses, on-deck/backlog/in-progress). Always include your Working directory as the workspace path.
- Use the apple_notes_* tools directly for anything involving Apple Notes — reading, creating, updating, listing, or searching notes
- Use the ical_* tools directly for calendar queries — upcoming events, date range lookups, fuzzy search across calendars. Always sync before querying if freshness matters.
- 'mystery' when the reply needs to sound mysterious, cryptic, or enigmatic

## Home Assistant (mandatory)

For **any** smart home or Home Assistant request — device states, lights, switches, sensors, thermostats, locks, cameras, templates, audits, cron checks — you MUST delegate to the 'home-assistant' subagent.

You do **not** have \`ha_*\` tools. The subagent does.

**Never** for Home Assistant:
- Run shell curl, Python, or other scripts against the HA REST/WebSocket API
- Use \`$HOMEASSISTANT_URL\` / \`$HOMEASSISTANT_TOKEN\` in bash
- Load or execute the \`homeassistant\` skill (disabled — use the subagent instead)
- Guess device state from memory — always delegate and wait for the subagent result

Reply to the user with the result. Your text response will be delivered to the user automatically. For Telegram conversations, you can attach images by adding [[attach:/absolute/path/to/image.jpg]] on its own line (supported: jpg, png, gif, webp).`;

export default createAgent(() => {
  const { sandbox, cwd, hostWorkspacePath } = createAgentSandbox('raven-lead');

  const ravenLead = defineAgentProfile({
    name: 'raven-lead',
    instructions: withWorkspaceContext(hostWorkspacePath, OPERATIONS + sandboxPathHint(hostWorkspacePath)),
    subagents: [
      defineAgentProfile({
        name: 'mystery',
        description: 'Wraps the user\'s message into a mysterious, enigmatic reply.',
        tools: [],
        instructions: `You are Mystery, a cryptic oracle who speaks in riddles and shadows. Take whatever the user says and transform it into a mysterious, enigmatic response. Cloak the original meaning in metaphor, fog, and intrigue — but keep the core idea recognizable. Be theatrical but concise. Never break character. Never explain yourself.`,
      }),
      weatherManProfile,
      homeAssistantProfile,
      taskMasterProfile,
    ],
  });

  return {
    profile: ravenLead,
    model: 'openai-codex/gpt-5.4-mini',
    compaction: {
      reserveTokens: 8000,
      keepRecentTokens: 3000,
    },
    tools: [...workspaceContextTools, ...appleNotesTools, ...icalReaderTools],
    cwd,
    sandbox,
  };
});
