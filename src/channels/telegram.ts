import { dispatch } from '@flue/runtime';
import { createTelegramChannel, type TelegramChannel, type TelegramConversationRef } from '@flue/telegram';
import { Api } from 'grammy';
import type { Message, Update } from 'grammy/types';
import { getTelegramBots, getMemoryConfig, getMemoryScope, type TelegramBotConfig } from '../config.ts';
import { classifySkills, formatSkillContext } from '../skills/index.ts';
import { trackAgentInstance } from '../agent-names.ts';
import { isMemoryAvailable, recallMemory } from '../memory/index.ts';
import { createLogger } from '../log.ts';

export interface TelegramBot {
  config: TelegramBotConfig;
  client: Api;
  channel: TelegramChannel;
}

function handleUpdate(bot: TelegramBotConfig, client: Api, channel: TelegramChannel) {
  const tgLog = createLogger(`telegram:${bot.name}`);

  return async (update: Update) => {
    const incoming = update.message ?? update.channel_post ?? update.business_message;
    if (incoming) {
      const conversation = conversationFromMessage(incoming);
      const text = incoming.text ?? incoming.caption ?? '';
      const from = incoming.from?.username ?? incoming.from?.first_name ?? 'unknown';

      tgLog.info('Message received', { updateId: update.update_id, from, text: text.slice(0, 80) });

      const result = text
        ? await classifySkills(text).catch(() => ({ enabled: [], disabled: [], reasoning: '' } as const))
        : { enabled: [], disabled: [], reasoning: '' };
      const skillContext = formatSkillContext(result);

      if (result.enabled.length > 0) {
        tgLog.debug('Skills matched', { skills: result.enabled.map((s) => s.name), reasoning: result.reasoning });
      }

      const convKey = channel.conversationKey(conversation);
      trackAgentInstance(convKey, bot.agent);

      let memoryContext: string | undefined;
      if (text && isMemoryAvailable()) {
        const memConfig = getMemoryConfig();
        const scope = getMemoryScope(bot.agent);
        const scopeKey = scope === 'agent' ? bot.agent : `${bot.agent}:${convKey}`;
        const recalled = await recallMemory(memConfig, scopeKey, text);
        if (recalled) {
          memoryContext = recalled;
          tgLog.debug('Memory recalled', { count: recalled.split('\n').length, query: text.slice(0, 50) });
        }
      }

      tgLog.debug('Dispatching to agent', { agent: bot.agent, convKey });

      await dispatch({
        agent: bot.agent,
        id: convKey,
        input: {
          type: 'telegram.message',
          updateId: update.update_id,
          text,
          from: incoming.from ? {
            id: incoming.from.id,
            firstName: incoming.from.first_name,
            ...(incoming.from.last_name ? { lastName: incoming.from.last_name } : {}),
            ...(incoming.from.username ? { username: incoming.from.username } : {}),
          } : undefined,
          chatId: incoming.chat.id,
          ...(skillContext ? { skillContext } : {}),
          ...(memoryContext ? { memoryContext } : {}),
        },
      });
      return;
    }

    if (update.callback_query) {
      const query = update.callback_query;
      tgLog.info('Callback query', { updateId: update.update_id, data: query.data });
      await client.answerCallbackQuery(query.id);
      if (!query.message) return;
      const cbConvKey = channel.conversationKey(conversationFromMessage(query.message));
      trackAgentInstance(cbConvKey, bot.agent);
      await dispatch({
        agent: bot.agent,
        id: cbConvKey,
        input: {
          type: 'telegram.callback_query',
          updateId: update.update_id,
          data: query.data,
          from: query.from ? {
            id: query.from.id,
            firstName: query.from.first_name,
            ...(query.from.last_name ? { lastName: query.from.last_name } : {}),
            ...(query.from.username ? { username: query.from.username } : {}),
          } : undefined,
        },
      });
    }
  };
}

function createBot(bot: TelegramBotConfig): TelegramBot {
  const client = new Api(bot.botToken);

  const channel: TelegramChannel = createTelegramChannel({
    secretToken: bot.webhookSecret ?? 'polling-mode',

    async webhook({ update }) {
      await handleUpdate(bot, client, channel)(update);
      return undefined;
    },
  });

  return { config: bot, client, channel };
}

function conversationFromMessage(message: Message): TelegramConversationRef {
  const topic = {
    ...(message.message_thread_id === undefined
      ? {}
      : { messageThreadId: message.message_thread_id }),
    ...(message.direct_messages_topic?.topic_id === undefined
      ? {}
      : { directMessagesTopicId: message.direct_messages_topic.topic_id }),
  };
  return message.business_connection_id
    ? {
        type: 'business-chat',
        businessConnectionId: message.business_connection_id,
        chatId: message.chat.id,
        ...topic,
      }
    : { type: 'chat', chatId: message.chat.id, ...topic };
}

const botConfigs = getTelegramBots().filter((b) => b.botToken);
export const bots = botConfigs.map(createBot);

const defaultChannel: TelegramChannel = bots[0]?.channel ?? createTelegramChannel({
  secretToken: 'unconfigured',
  async webhook() {
    return new Response('No telegram bots configured', { status: 503 });
  },
});

export const channel: TelegramChannel = defaultChannel;

export function startPolling() {
  const pollingBots = bots.filter((b) => (b.config.mode ?? 'poll') === 'poll');

  for (const bot of pollingBots) {
    const tgLog = createLogger(`telegram:${bot.config.name}`);
    const handler = handleUpdate(bot.config, bot.client, bot.channel);
    let offset = 0;

    const poll = async () => {
      while (true) {
        try {
          const updates = await bot.client.getUpdates({
            offset,
            timeout: 30,
            allowed_updates: ['message', 'callback_query', 'channel_post', 'business_message'],
          });

          for (const update of updates) {
            offset = update.update_id + 1;
            handler(update).catch((err) => {
              tgLog.error('Update handler failed', { updateId: update.update_id, error: err.message ?? String(err) });
            });
          }
        } catch (err: any) {
          tgLog.error('Polling error', { error: err.message ?? String(err) });
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    };

    bot.client.deleteWebhook().then(() => {
      tgLog.info('Polling started', { agent: bot.config.agent });
      poll();
    }).catch((err: any) => {
      tgLog.error('Failed to clear webhook', { error: err.message ?? String(err) });
    });
  }
}
