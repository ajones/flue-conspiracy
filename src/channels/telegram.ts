import { SpanStatusCode, context as otelContext, trace } from '@opentelemetry/api';
import { createTelegramChannel, type TelegramChannel, type TelegramConversationRef } from '@flue/telegram';
import { Api, GrammyError, InputFile } from 'grammy';
import type { Message, Update } from 'grammy/types';
import { getTelegramBots, type TelegramBotConfig } from '../config.ts';
import { trackAgentInstance, registerAgentResolver } from '../agent-names.ts';
import { gatherContext, spreadContext } from '../context.ts';
import { dispatchAndCollect, type CollectedReply } from '../dispatch-collect.ts';
import { recordSessionCommandSpan, tryHandleSessionCommand } from '../session-commands.ts';
import { validateImagePaths } from '../telegram-attachments.ts';
import { TELEGRAM_PARSE_MODE, toTelegramMarkdown } from '../telegram-format.ts';
import { createLogger } from '../log.ts';
import { pickWorkingOnItMessage } from '../working-on-it.ts';

export interface TelegramBot {
  config: TelegramBotConfig;
  client: Api;
  channel: TelegramChannel;
}

const tracer = trace.getTracer('raven');

function sendOptions(ref: TelegramConversationRef) {
  return {
    ...(ref.type === 'business-chat' ? { business_connection_id: ref.businessConnectionId } : {}),
    ...(ref.messageThreadId !== undefined ? { message_thread_id: ref.messageThreadId } : {}),
    ...('directMessagesTopicId' in ref && ref.directMessagesTopicId !== undefined
      ? { direct_messages_topic_id: ref.directMessagesTopicId }
      : {}),
  };
}

function isMarkdownParseError(err: unknown): boolean {
  return err instanceof GrammyError && err.error_code === 400;
}

async function sendFormattedMessage(
  client: Api,
  chatId: number,
  text: string,
  opts: ReturnType<typeof sendOptions>,
): Promise<void> {
  const formatted = toTelegramMarkdown(text);
  try {
    await client.sendMessage(chatId, formatted, { ...opts, parse_mode: TELEGRAM_PARSE_MODE });
  } catch (err) {
    if (!isMarkdownParseError(err)) throw err;
    await client.sendMessage(chatId, text, opts);
  }
}

async function sendFormattedPhoto(
  client: Api,
  chatId: number,
  photo: InputFile,
  caption: string | undefined,
  opts: ReturnType<typeof sendOptions>,
): Promise<void> {
  if (!caption) {
    await client.sendPhoto(chatId, photo, opts);
    return;
  }

  const formatted = toTelegramMarkdown(caption);
  try {
    await client.sendPhoto(chatId, photo, {
      ...opts,
      caption: formatted,
      parse_mode: TELEGRAM_PARSE_MODE,
    });
  } catch (err) {
    if (!isMarkdownParseError(err)) throw err;
    await client.sendPhoto(chatId, photo, { ...opts, caption });
  }
}

async function sendFormattedMediaGroup(
  client: Api,
  chatId: number,
  paths: string[],
  caption: string | undefined,
  opts: ReturnType<typeof sendOptions>,
): Promise<void> {
  const formattedCaption = caption ? toTelegramMarkdown(caption) : undefined;
  const media = paths.map((path, i) => ({
    type: 'photo' as const,
    media: new InputFile(path),
    ...(i === 0 && formattedCaption ? { caption: formattedCaption } : {}),
  }));

  try {
    await client.sendMediaGroup(chatId, media, {
      ...opts,
      ...(formattedCaption ? { parse_mode: TELEGRAM_PARSE_MODE } : {}),
    });
  } catch (err) {
    if (!isMarkdownParseError(err) || !caption) throw err;
    await client.sendMediaGroup(chatId, paths.map((path, i) => ({
      type: 'photo' as const,
      media: new InputFile(path),
      ...(i === 0 ? { caption } : {}),
    })), opts);
  }
}

async function sendReplyToConversation(
  client: Api,
  ref: TelegramConversationRef,
  reply: Pick<CollectedReply, 'text' | 'imagePaths'>,
): Promise<void> {
  const opts = sendOptions(ref);
  const paths = reply.imagePaths.length > 0 ? validateImagePaths(reply.imagePaths) : [];

  if (paths.length === 0) {
    if (reply.text) await sendFormattedMessage(client, ref.chatId, reply.text, opts);
    return;
  }

  if (paths.length === 1) {
    await sendFormattedPhoto(client, ref.chatId, new InputFile(paths[0]), reply.text || undefined, opts);
    return;
  }

  await sendFormattedMediaGroup(client, ref.chatId, paths, reply.text || undefined, opts);
}

function handleUpdate(bot: TelegramBotConfig, client: Api, channel: TelegramChannel) {
  const tgLog = createLogger(`telegram:${bot.name}`);

  return async (update: Update) => {
    await tracer.startActiveSpan('telegram.update', {
      attributes: {
        'raven.telegram.bot': bot.name,
        'raven.telegram.update_id': update.update_id,
      },
    }, async (span) => {
      try {
        const incoming = update.message ?? update.channel_post ?? update.business_message;
        if (incoming) {
          const conversation = conversationFromMessage(incoming);
          const text = incoming.text ?? incoming.caption ?? '';
          const from = incoming.from?.username ?? incoming.from?.first_name ?? 'unknown';

          tgLog.info('Message received', { updateId: update.update_id, from, text: text.slice(0, 80) });
          span.addEvent('message.received', {
            'raven.telegram.from': from,
            'raven.telegram.text_length': text.length,
          });
          if (text) {
            span.setAttribute('raven.telegram.message', text.slice(0, 4000));
          }

          const convKey = channel.conversationKey(conversation);
          trackAgentInstance(convKey, bot.agent);

          const cmd = await tryHandleSessionCommand(text, bot.agent, convKey);
          if (cmd.handled) {
            recordSessionCommandSpan(span, cmd);
            await client.sendMessage(incoming.chat.id, cmd.message, sendOptions(conversation));
            span.setStatus({ code: SpanStatusCode.OK });
            return;
          }

          const ctx = await gatherContext({ text, agent: bot.agent, conversationKey: convKey });

          tgLog.debug('Dispatching to agent', { agent: bot.agent, convKey });
          span.addEvent('dispatching', {
            'raven.agent': bot.agent,
            'raven.conversation': convKey,
          });

          const reply = await dispatchAndCollect({
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
              ...spreadContext(ctx),
            },
          }, {
            parentContext: otelContext.active(),
            onRootPromptStart: () => {
              sendFormattedMessage(client, conversation.chatId, pickWorkingOnItMessage(), sendOptions(conversation))
                .catch((err) => tgLog.error('Working-on-it send failed', { error: (err as Error).message }));
            },
          });
          if (reply.text || reply.imagePaths.length > 0) {
            await sendReplyToConversation(client, conversation, reply);
            if (reply.imagePaths.length > 0) {
              span.addEvent('reply.images_sent', { 'raven.telegram.image_count': reply.imagePaths.length });
            }
          }
          span.setStatus({ code: SpanStatusCode.OK });
          return;
        }

        if (update.callback_query) {
          const query = update.callback_query;
          tgLog.info('Callback query', { updateId: update.update_id, data: query.data });
          await client.answerCallbackQuery(query.id);
          if (!query.message) return;
          const cbConversation = conversationFromMessage(query.message);
          const cbConvKey = channel.conversationKey(cbConversation);
          trackAgentInstance(cbConvKey, bot.agent);
          span.addEvent('callback.received', {
            'raven.telegram.callback_data': query.data ?? '',
            'raven.conversation': cbConvKey,
          });
          const cbReply = await dispatchAndCollect({
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
          }, {
            parentContext: otelContext.active(),
            onRootPromptStart: () => {
              sendFormattedMessage(client, cbConversation.chatId, pickWorkingOnItMessage(), sendOptions(cbConversation))
                .catch((err) => tgLog.error('Working-on-it send failed', { error: (err as Error).message }));
            },
          });
          if (cbReply.text || cbReply.imagePaths.length > 0) {
            await sendReplyToConversation(client, cbConversation, cbReply);
          }
          span.setStatus({ code: SpanStatusCode.OK });
        }
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        span.end();
      }
    });
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

if (bots.length === 1) {
  const singleAgent = bots[0].config.agent;
  registerAgentResolver((id) => id.startsWith('telegram:') ? singleAgent : undefined);
}

const defaultChannel: TelegramChannel = bots[0]?.channel ?? createTelegramChannel({
  secretToken: 'unconfigured',
  async webhook() {
    return new Response('No telegram bots configured', { status: 503 });
  },
});

export const channel: TelegramChannel = defaultChannel;

export async function sendTelegramReply(
  id: string,
  reply: Pick<CollectedReply, 'text' | 'imagePaths'>,
): Promise<void> {
  if (bots.length === 0) throw new Error('No telegram bots configured');
  const ref = bots[0].channel.parseConversationKey(id);
  await sendReplyToConversation(bots[0].client, ref, reply);
}

export async function sendTelegramText(id: string, text: string): Promise<void> {
  await sendTelegramReply(id, { text, imagePaths: [] });
}

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
