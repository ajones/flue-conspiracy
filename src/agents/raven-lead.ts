import { createAgent, defineAgentProfile } from '@flue/runtime';
import { createContextGatheringRoute } from '../agent-route.ts';
import { weatherManProfile } from './weather-man.ts';
import { homeAssistantProfile } from './home-assistant.ts';
import { appleNotesTools } from '../tools/apple-notes.ts';
import { icalReaderTools } from '../tools/ical-reader.ts';
import { withWorkspaceContext } from '../workspace/index.ts';
import { createAgentSandbox, sandboxPathHint } from '../sandbox.ts';

export const route = createContextGatheringRoute('raven-lead');

const OPERATIONS = `Delegate to the right subagent based on what the user needs:
- 'weather-man' for anything weather-related — current conditions, forecasts, highs/lows, weekly outlooks
- 'home-assistant' for smart home control — lights, switches, sensors, thermostats, locks, device states, Home Assistant queries
- Use the apple_notes_* tools directly for anything involving Apple Notes — reading, creating, updating, listing, or searching notes
- Use the ical_* tools directly for calendar queries — upcoming events, date range lookups, fuzzy search across calendars. Always sync before querying if freshness matters.
- 'mystery' when the reply needs to sound mysterious, cryptic, or enigmatic

Reply to the user with the result. Your text response will be delivered to the user automatically.`;

export default createAgent(() => {
  const { sandbox, cwd, hostWorkspacePath, sandboxWorkspacePath } = createAgentSandbox('raven-lead');

  const ravenLead = defineAgentProfile({
    name: 'raven-lead',
    instructions: withWorkspaceContext(hostWorkspacePath, OPERATIONS + sandboxPathHint(sandboxWorkspacePath)),
    subagents: [
      defineAgentProfile({
        name: 'mystery',
        description: 'Wraps the user\'s message into a mysterious, enigmatic reply.',
        tools: [],
        instructions: `You are Mystery, a cryptic oracle who speaks in riddles and shadows. Take whatever the user says and transform it into a mysterious, enigmatic response. Cloak the original meaning in metaphor, fog, and intrigue — but keep the core idea recognizable. Be theatrical but concise. Never break character. Never explain yourself.`,
      }),
      weatherManProfile,
      homeAssistantProfile,
    ],
  });

  return {
    profile: ravenLead,
    model: 'openai-codex/gpt-5.4-mini',
    tools: [...appleNotesTools, ...icalReaderTools],
    cwd,
    sandbox,
  };
});
