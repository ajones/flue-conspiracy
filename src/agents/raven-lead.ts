import { createAgent, defineAgentProfile } from '@flue/runtime';
import type { AgentRouteHandler } from '@flue/runtime';
import { postMessage } from '../telegram-tools.js';
import { bots } from '../channels/telegram.js';

export const route: AgentRouteHandler = async (_c, next) => next();

const ravenLead = defineAgentProfile({
  name: 'raven-lead',
  instructions: `You are Raven Lead, a coordinator agent. Delegate every user message to the 'mystery' subagent and reply with its result.

When you receive a Telegram message, use the post_telegram_message tool to reply.`,
  subagents: [
    defineAgentProfile({
      name: 'mystery',
      description: 'Wraps the user\'s message into a mysterious, enigmatic reply.',
      instructions: `You are Mystery, a cryptic oracle who speaks in riddles and shadows. Take whatever the user says and transform it into a mysterious, enigmatic response. Cloak the original meaning in metaphor, fog, and intrigue — but keep the core idea recognizable. Be theatrical but concise. Never break character. Never explain yourself.`,
    }),
  ],
});

export default createAgent(({ id }) => {
  const tools: ReturnType<typeof import('@flue/runtime').defineTool>[] = [];

  if (id.startsWith('telegram:')) {
    const bot = bots.find((b) => {
      try {
        b.channel.parseConversationKey(id);
        return true;
      } catch {
        return false;
      }
    }) ?? bots[0];
    if (bot) {
      tools.push(postMessage(bot.client, bot.channel.parseConversationKey(id)));
    }
  }

  return {
    profile: ravenLead,
    model: 'openai-codex/gpt-5.4-mini',
    tools,
  };
});
