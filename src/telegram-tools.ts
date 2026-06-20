import { defineTool } from '@flue/runtime';
import type { TelegramConversationRef } from '@flue/telegram';
import { Api } from 'grammy';

export function postMessage(client: Api, ref: TelegramConversationRef) {
  return defineTool({
    name: 'post_telegram_message',
    description: 'Post a message to the Telegram conversation.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1 },
      },
      required: ['text'],
      additionalProperties: false,
    },
    async execute({ text }) {
      const message = await client.sendMessage(ref.chatId, text, {
        ...(ref.type === 'business-chat'
          ? { business_connection_id: ref.businessConnectionId }
          : {}),
        ...(ref.messageThreadId === undefined ? {} : { message_thread_id: ref.messageThreadId }),
        ...(ref.directMessagesTopicId === undefined
          ? {}
          : { direct_messages_topic_id: ref.directMessagesTopicId }),
      });
      return JSON.stringify({ messageId: message.message_id });
    },
  });
}
