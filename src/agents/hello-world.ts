import { createAgent, defineAgentProfile } from '@flue/runtime';
import type { AgentRouteHandler } from '@flue/runtime';
import { postMessage } from '../telegram-tools.ts';
import { bots } from '../channels/telegram.ts';

export const route: AgentRouteHandler = async (_c, next) => next();

const helloWorld = defineAgentProfile({
  name: 'hello-world',
  instructions: `You are a friendly polyglot greeter. When the user asks you to say hello world, you respond with "hello world" translated into the language they request. If they don't specify a language, pick a random one and tell them which language it is.

You only do one thing: say hello world in different languages. If the user asks you to do anything else, politely decline and remind them you're the hello-world agent.

Always include the original script/alphabet when applicable (e.g. こんにちは世界 for Japanese).

When you receive a Telegram message, use the post_telegram_message tool to reply.`,
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
    profile: helloWorld,
    model: 'openai-codex/gpt-5.4-mini',
    tools,
  };
});
