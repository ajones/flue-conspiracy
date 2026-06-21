import { dispatch } from '@flue/runtime';
import { createTelegramChannel, type TelegramChannel, type TelegramConversationRef } from '@flue/telegram';
import { Api } from 'grammy';
import type { Message, Update } from 'grammy/types';
import { getTelegramBots, type TelegramBotConfig } from '../config.js';
import { classifySkills, formatSkillContext } from '../skills/index.js';

export interface TelegramBot {
  config: TelegramBotConfig;
  client: Api;
  channel: TelegramChannel;
}

function handleUpdate(bot: TelegramBotConfig, client: Api, channel: TelegramChannel) {
  return async (update: Update) => {
    const incoming = update.message ?? update.channel_post ?? update.business_message;
    if (incoming) {
      const conversation = conversationFromMessage(incoming);
      const text = incoming.text ?? incoming.caption ?? '';
      const result = text
        ? await classifySkills(text)
        : { enabled: [], disabled: [], reasoning: '' };
      const skillContext = formatSkillContext(result);

      await dispatch({
        agent: bot.agent,
        id: channel.conversationKey(conversation),
        input: {
          type: 'telegram.message',
          updateId: update.update_id,
          message: incoming,
          ...(skillContext ? { skillContext } : {}),
        },
      });
      return;
    }

    if (update.callback_query) {
      const query = update.callback_query;
      await client.answerCallbackQuery(query.id);
      if (!query.message) return;
      await dispatch({
        agent: bot.agent,
        id: channel.conversationKey(conversationFromMessage(query.message)),
        input: {
          type: 'telegram.callback_query',
          updateId: update.update_id,
          data: query.data,
          from: query.from,
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
            const msg = update.message?.text ?? update.callback_query?.data ?? '(no text)';
            console.log(`[telegram:${bot.config.name}] update ${update.update_id}: ${msg}`);
            handler(update).catch((err) => {
              console.error(`[telegram:${bot.config.name}] Error handling update ${update.update_id}:`, err);
            });
          }
        } catch (err) {
          console.error(`[telegram:${bot.config.name}] Polling error:`, err);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    };

    bot.client.deleteWebhook().then(() => {
      console.log(`[telegram:${bot.config.name}] Polling started → agent "${bot.config.agent}"`);
      poll();
    }).catch((err) => {
      console.error(`[telegram:${bot.config.name}] Failed to clear webhook:`, err);
    });
  }
}
