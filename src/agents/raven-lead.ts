import { createAgent, defineAgentProfile } from '@flue/runtime';
import type { AgentRouteHandler } from '@flue/runtime';
import { weatherManProfile } from './weather-man.ts';
import { homeAssistantProfile } from './home-assistant.ts';
import { appleNotesTools } from '../tools/apple-notes.ts';
import { icalReaderTools } from '../tools/ical-reader.ts';
import { getWorkspaceConfig } from '../config.ts';
import { resolveAgentWorkspace } from '../workspace/index.ts';
import { withSoul } from './souls/index.ts';

export const route: AgentRouteHandler = async (_c, next) => next();

const ravenLead = defineAgentProfile({
  name: 'raven-lead',
  instructions: withSoul('raven-lead', `Delegate to the right subagent based on what the user needs:
- 'weather-man' for anything weather-related — current conditions, forecasts, highs/lows, weekly outlooks
- 'home-assistant' for smart home control — lights, switches, sensors, thermostats, locks, device states, Home Assistant queries
- Use the apple_notes_* tools directly for anything involving Apple Notes — reading, creating, updating, listing, or searching notes
- Use the ical_* tools directly for calendar queries — upcoming events, date range lookups, fuzzy search across calendars. Always sync before querying if freshness matters.
- 'mystery' when the reply needs to sound mysterious, cryptic, or enigmatic

Reply to the user with the result. Your text response will be delivered to the user automatically.

If memoryContext is provided in the input, use it as relevant background from previous conversations.

If infoSources is provided in the input, treat it as authoritative guidance on where different kinds of information live and how to access or treat each source.

If vaultContext is provided in the input, it contains documents from the knowledge vault that are likely relevant to the conversation. Read them before replying. If you discover the information has changed or you learn something new about a topic covered in the vault, offer to update the relevant doc after completing the user's request.`),
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

export default createAgent(() => {
  const wsConfig = getWorkspaceConfig();
  if (wsConfig.enabled !== false) {
    resolveAgentWorkspace(wsConfig, 'raven-lead');
  }

  return {
    profile: ravenLead,
    model: 'openai-codex/gpt-5.4-mini',
    tools: [...appleNotesTools, ...icalReaderTools],
  };
});
