import { SpanStatusCode, context as otelContext, trace } from '@opentelemetry/api';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { trackAgentInstance } from '../agent-names.ts';
import { dispatchAndCollect } from '../dispatch-collect.ts';
import { classifyTurn, type ConversationMessage } from '../turn/index.ts';
import { createLogger } from '../log.ts';
import { gatherContext, spreadContext } from '../context.ts';
import { getImessageConfig, getImessageConversations, type ImessageConversationConfig } from '../config.ts';

type ImsgChat = {
  id: number;
  identifier?: string;
  guid?: string;
  name?: string;
  display_name?: string;
  is_group?: boolean;
  participants?: string[];
  service?: string;
};

type ImsgGroup = {
  id: number;
  identifier?: string;
  guid?: string;
  name?: string;
  display_name?: string;
  is_group?: boolean;
  participants?: string[];
  service?: string;
  account_id?: string;
  account_login?: string;
  last_addressed_handle?: string;
};

type ImsgEvent = Record<string, any>;

export interface ImessageConversationRef {
  chatId: number;
  identifier?: string;
  guid?: string;
  name?: string;
  participants?: string[];
  isGroup?: boolean;
}

const log = createLogger('imessage');
const tracer = trace.getTracer('raven');
const chatCache = new Map<number, ImsgChat>();
const groupCache = new Map<number, ImsgGroup>();
const assignedAgents = new Map<number, string>();
const messageHistory = new Map<number, ConversationMessage[]>();
let watchStarted = false;

const MAX_HISTORY = 20;
const AGENT_DISPLAY_NAME = 'Raven';

function pushHistory(chatId: number, msg: ConversationMessage) {
  let history = messageHistory.get(chatId);
  if (!history) {
    history = [];
    messageHistory.set(chatId, history);
  }
  history.push(msg);
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

function getHistory(chatId: number): ConversationMessage[] {
  return messageHistory.get(chatId) ?? [];
}

function getDbArgs(): string[] {
  const db = getImessageConfig().db;
  return db ? ['--db', db] : [];
}

function parseJsonLines<T>(stdout: string): T[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [parsed as T];
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function runImsg<T>(args: string[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    execFile('imsg', [...args, '--json'], { timeout: 20_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message));
        return;
      }
      try {
        resolve(parseJsonLines<T>(stdout));
      } catch (parseErr: any) {
        reject(new Error(`Failed to parse imsg output: ${parseErr.message}`));
      }
    });
  });
}

async function loadChats(): Promise<Map<number, ImsgChat>> {
  const chats = await runImsg<ImsgChat>(['chats', ...getDbArgs(), '--limit', '200']);
  chatCache.clear();
  for (const chat of chats) {
    if (typeof chat.id === 'number') {
      chatCache.set(chat.id, chat);
    }
  }
  return chatCache;
}

function identityMatches(chat: ImsgChat | ImsgGroup, conversation: ImessageConversationConfig): boolean {
  if (conversation.chatId !== undefined && conversation.chatId === chat.id) return true;
  if (conversation.identifier && (conversation.identifier === chat.identifier || conversation.identifier === chat.guid)) return true;
  if (conversation.guid && conversation.guid === chat.guid) return true;
  if (conversation.name && (conversation.name === chat.name || conversation.name === chat.display_name)) return true;
  return false;
}

async function loadAssignments(): Promise<void> {
  assignedAgents.clear();
  const conversations = getImessageConversations();
  if (conversations.length === 0) return;

  const chats = await loadChats();
  const unresolved: string[] = [];

  for (const conversation of conversations) {
    if (!conversation.agent) {
      throw new Error('Each imessage conversation must specify an agent');
    }

    const chat = [...chats.values()].find((candidate) => identityMatches(candidate, conversation));
    if (!chat) {
      unresolved.push(
        conversation.name ??
        conversation.identifier ??
        conversation.guid ??
        (conversation.chatId !== undefined ? `chatId:${conversation.chatId}` : 'unknown conversation'),
      );
      continue;
    }

    if (assignedAgents.has(chat.id)) {
      throw new Error(`Duplicate imessage conversation mapping for chat id ${chat.id}`);
    }

    assignedAgents.set(chat.id, conversation.agent);
  }

  if (unresolved.length > 0) {
    throw new Error(`Unresolved imessage conversations: ${unresolved.join(', ')}`);
  }
}

async function loadChat(chatId: number): Promise<ImsgGroup | undefined> {
  const cached = groupCache.get(chatId);
  if (cached) return cached;

  const groups = await runImsg<ImsgGroup>(['group', ...getDbArgs(), '--chat-id', String(chatId)]);
  const group = groups[0];
  if (group) {
    groupCache.set(chatId, group);
    const chat = chatCache.get(chatId);
    if (chat) {
      chatCache.set(chatId, {
        ...chat,
        identifier: group.identifier ?? chat.identifier,
        guid: group.guid ?? chat.guid,
        name: group.name ?? chat.name,
        display_name: group.display_name ?? chat.display_name,
        is_group: group.is_group ?? chat.is_group,
        participants: group.participants ?? chat.participants,
        service: group.service ?? chat.service,
      });
    }
  }
  return group;
}

function resolveChatFromCache(chatId: number): ImsgChat | undefined {
  return chatCache.get(chatId);
}

function resolveConversationRef(chatId: number): ImessageConversationRef {
  const cached = resolveChatFromCache(chatId);
  return {
    chatId,
    identifier: cached?.identifier,
    guid: cached?.guid,
    name: cached?.display_name ?? cached?.name,
    participants: cached?.participants,
    isGroup: cached?.is_group,
  };
}

function parseConversationKey(id: string): number | null {
  const match = id.match(/^imessage:chat:(\d+)$/);
  if (!match) return null;
  return Number(match[1]);
}

function extractText(event: ImsgEvent): string {
  return (
    event.text ??
    event.body ??
    event.message ??
    event.content ??
    event.summary ??
    ''
  );
}

function extractChatId(event: ImsgEvent): number | null {
  const candidates = [
    event.chat_id,
    event.chatId,
    event.chat?.id,
    event.message?.chat_id,
    event.message?.chatId,
    event.event?.chat_id,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isInteger(num) && num > 0) return num;
  }
  return null;
}

function extractChatIdentity(event: ImsgEvent): string | null {
  const candidates = [
    event.chat_guid,
    event.chatGuid,
    event.guid,
    event.chat?.guid,
    event.chat_identifier,
    event.chatIdentifier,
    event.identifier,
    event.chat?.identifier,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function findChatIdByIdentity(identity: string): number | null {
  for (const [chatId, chat] of chatCache.entries()) {
    if (chat.guid === identity || chat.identifier === identity) return chatId;
  }
  return null;
}

function normalizeEvent(event: ImsgEvent): ImsgEvent | null {
  if (!event || typeof event !== 'object') return null;
  let chatId = extractChatId(event);
  if (!chatId) {
    const identity = extractChatIdentity(event);
    if (identity) {
      chatId = findChatIdByIdentity(identity);
    }
  }
  if (!chatId) return null;

  return {
    chatId,
    messageId: event.id ?? event.message_id ?? event.messageId,
    text: extractText(event),
    sender: event.sender ?? event.from ?? event.author ?? event.reply_to_sender,
    attachments: event.attachments ?? [],
    createdAt: event.created_at ?? event.createdAt ?? event.timestamp,
    isFromMe: event.is_from_me ?? event.isFromMe ?? false,
    raw: event,
  };
}

async function handleEvent(event: ImsgEvent) {
  let normalized = normalizeEvent(event);
  if (!normalized) {
    await loadChats().catch((err: any) => {
      log.debug('chat preload failed during event handling', { error: err.message ?? String(err) });
    });
    normalized = normalizeEvent(event);
    if (!normalized) return;
  }

  const chatId = normalized.chatId;
  const configuredAgent = assignedAgents.get(chatId);
  if (!configuredAgent) {
    log.error('Ignoring unassigned imessage conversation', { chatId });
    return;
  }

  const span = tracer.startSpan('imessage.event', {
    attributes: {
      'raven.imessage.chat_id': chatId,
      'raven.imessage.is_from_me': normalized.isFromMe,
      'raven.imessage.sender': normalized.sender ?? 'unknown',
    },
  });

  try {
    const chat = resolveChatFromCache(chatId) ?? (await loadChats().then((m) => m.get(chatId)));
    const group = await loadChat(chatId).catch((err: any) => {
      log.debug('group lookup failed', { chatId, error: err.message ?? String(err) });
      return undefined;
    });

    const messageText = normalized.text ?? '';
    const senderName = normalized.sender ?? 'Unknown';
    const isGroup = group?.is_group ?? chat?.is_group ?? false;

    span.setAttribute('raven.imessage.is_group', isGroup);
    if (messageText) {
      span.setAttribute('raven.imessage.message', messageText.slice(0, 4000));
    }

    span.addEvent('message.received', {
      'raven.imessage.from': senderName,
      'raven.imessage.text_length': messageText.length,
      'raven.imessage.chat_name': group?.display_name ?? group?.name ?? chat?.display_name ?? chat?.name ?? '',
    });

    pushHistory(chatId, {
      role: normalized.isFromMe ? 'assistant' : 'user',
      name: normalized.isFromMe ? AGENT_DISPLAY_NAME : senderName,
      text: messageText,
    });

    if (!normalized.isFromMe && isGroup && messageText) {
      const participants = (group?.participants ?? chat?.participants ?? []).concat(AGENT_DISPLAY_NAME);
      const spanCtx = trace.setSpan(otelContext.active(), span);
      try {
        const turnResult = await otelContext.with(spanCtx, () =>
          classifyTurn(getHistory(chatId), {
            agentName: AGENT_DISPLAY_NAME,
            participants,
          }),
        );
        log.info('Turn classified', { chatId, result: turnResult, sender: senderName });

        span.addEvent('turn.classified', {
          'raven.turn.result': turnResult,
          'raven.turn.sender': senderName,
          'raven.turn.history_length': getHistory(chatId).length,
        });

        if (turnResult === 'none' || turnResult === 'unknown') {
          log.debug('Skipping dispatch — not our turn', { chatId, result: turnResult });
          span.setAttribute('raven.imessage.skipped', true);
          span.setAttribute('raven.imessage.skip_reason', turnResult);
          span.setStatus({ code: SpanStatusCode.OK });
          return;
        }
      } catch (err: any) {
        log.error('Turn classification failed, dispatching anyway', { chatId, error: err.message ?? String(err) });
        span.addEvent('turn.classification_error', {
          'raven.turn.error': err.message ?? String(err),
        });
      }
    }

    const convKey = `imessage:chat:${chatId}`;
    trackAgentInstance(convKey, configuredAgent);

    const ctx = await gatherContext({ text: normalized.text ?? '', agent: configuredAgent, conversationKey: convKey });

    span.addEvent('dispatching', {
      'raven.agent': configuredAgent,
      'raven.conversation': convKey,
    });

    const reply = await dispatchAndCollect({
      agent: configuredAgent,
      id: convKey,
      input: {
        type: 'imessage.message',
        chatId,
        messageId: normalized.messageId,
        chatIdentifier: group?.identifier ?? chat?.identifier,
        chatGuid: group?.guid ?? chat?.guid,
        chatName: group?.display_name ?? group?.name ?? chat?.display_name ?? chat?.name,
        isGroup,
        participants: group?.participants ?? chat?.participants ?? [],
        sender: normalized.sender,
        text: normalized.text,
        createdAt: normalized.createdAt,
        attachments: normalized.attachments,
        isFromMe: normalized.isFromMe,
        raw: normalized.raw,
        ...spreadContext(ctx),
      },
    }, otelContext.active());

    if (reply.dispatchId) {
      span.setAttribute('raven.imessage.dispatch_id', reply.dispatchId);
    }
    if (reply.text) {
      await sendImessageText(convKey, reply.text);
      pushHistory(chatId, { role: 'assistant', name: AGENT_DISPLAY_NAME, text: reply.text });
      span.addEvent('reply.sent', {
        'raven.imessage.reply_length': reply.text.length,
      });
    }

    span.setStatus({ code: SpanStatusCode.OK });
    log.debug('Dispatched imessage event', { chatId, convKey, dispatchId: reply.dispatchId });
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
}

function spawnWatch() {
  const args = ['watch', ...getDbArgs(), '--attachments', '--reactions', '--json'];
  const child = spawn('imsg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const watchLog = createLogger('imessage:watch');

  watchLog.info('Watch started', { pid: child.pid });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  const rl = createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as ImsgEvent;
      void handleEvent(event).catch((err: any) => {
        watchLog.error('Failed to dispatch imessage event', { error: err.message ?? String(err), line: line.slice(0, 200) });
      });
    } catch (err: any) {
      watchLog.debug('Ignoring non-JSON watch line', { line: line.slice(0, 200), error: err.message ?? String(err) });
    }
  });

  child.stderr.on('data', (chunk: string) => {
    const text = chunk.toString().trim();
    if (text) watchLog.debug('stderr', { text });
  });

  child.on('error', (err: Error) => {
    watchLog.error('Watch failed to start', { error: err.message });
    watchStarted = false;
  });

  child.on('exit', (code, signal) => {
    watchLog.error('Watch exited', { code, signal });
    if (watchStarted) {
      setTimeout(() => spawnWatch(), 5000);
    }
  });
}

export async function startWatching() {
  if (watchStarted) return;
  watchStarted = true;
  const conversations = getImessageConversations();
  if (conversations.length === 0) {
    log.info('No imessage conversations configured; watcher disabled');
    watchStarted = false;
    return;
  }

  await loadAssignments();

  loadChats().catch((err: any) => {
    log.error('Failed to preload imsg chats', { error: err.message ?? String(err) });
  });

  spawnWatch();
}

export async function resolveImessageConversation(id: string): Promise<ImessageConversationRef | null> {
  const chatId = parseConversationKey(id);
  if (!chatId) return null;
  if (!chatCache.has(chatId)) {
    await loadChats().catch(() => undefined);
  }
  await loadChat(chatId).catch(() => undefined);
  return resolveConversationRef(chatId);
}

export async function sendImessageText(id: string, text: string): Promise<{ messageId?: number }> {
  const chatId = parseConversationKey(id);
  if (!chatId) {
    throw new Error(`Unsupported imessage conversation key: ${id}`);
  }
  if (!assignedAgents.has(chatId)) {
    await loadAssignments();
  }
  if (!assignedAgents.has(chatId)) {
    throw new Error(`No imessage agent assignment found for chat id ${chatId}`);
  }

  const args = ['send', ...getDbArgs(), '--chat-id', String(chatId), '--text', text, '--json'];
  const messages = await runImsg<{ messageId?: number; id?: number }>(args);
  const message = messages[0];
  return { messageId: message?.messageId ?? message?.id };
}

export const channel = {
  routes: [{
    method: 'GET',
    path: '/health',
    handler() {
      return new Response('imessage channel is app-owned', { status: 200 });
    },
  }],
  conversationKey(ref: ImessageConversationRef): string {
    if (!Number.isSafeInteger(ref.chatId) || ref.chatId <= 0) {
      throw new Error('Invalid imessage conversation ref');
    }
    return `imessage:chat:${ref.chatId}`;
  },
  parseConversationKey(id: string): ImessageConversationRef {
    const chatId = parseConversationKey(id);
    if (!chatId) {
      throw new Error(`Unsupported imessage conversation key: ${id}`);
    }
    return resolveConversationRef(chatId);
  },
} as const;
