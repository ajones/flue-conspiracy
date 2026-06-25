import { getAccessToken } from '../auth/tokens.ts';
import { createLogger } from '../log.ts';
import { logModelCall } from '../model-observer.ts';
import { SpanStatusCode, trace } from '@opentelemetry/api';

const log = createLogger('turn');
const tracer = trace.getTracer('raven');

export type TurnResult = 'agent' | 'helpful' | 'unknown' | 'none';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  name: string;
  text: string;
}

export interface TurnClassifierOptions {
  agentName: string;
  participants?: string[];
  model?: string;
}

const SKILL_TRIGGER_RE = /(?:^|\s)\/[A-Za-z][A-Za-z0-9_-]*(?!\/)\b/m;
const PATH_LIKE_RE = /\S\/\S/;
const REACTION_RE = /^(?:liked|loved|laughed at|reacted(?: [^ ]+)? to|disliked|emphasized)\b/i;

function hasSkillTrigger(text: string): boolean {
  const trimmed = (text ?? '').trim();
  if (PATH_LIKE_RE.test(trimmed)) return false;
  return SKILL_TRIGGER_RE.test(trimmed);
}

function isReaction(text: string): boolean {
  return REACTION_RE.test((text ?? '').trim());
}

function formatMessages(messages: ConversationMessage[]): string {
  return messages
    .filter((m) => m.text.length > 0)
    .map((m) => `${m.name}: ${m.text}`)
    .join('\n');
}

function buildPrompt(
  agentName: string,
  participants: string[] | undefined,
  messages: ConversationMessage[],
): string {
  const sections: string[] = [];

  sections.push(`You are determining whether an AI agent named ${agentName} should reply to the latest message in a group conversation.

Agent: ${agentName}

Evaluate the full conversation, but weight the latest message most heavily. Consider recent unanswered messages when they are relevant context.

Treat the latest message as addressed to a named person only when that person is explicitly named or identified. Do not "correct" a different name into ${agentName}.

Output "${agentName}" if:
- The latest message is clearly directed at ${agentName} by name or explicit request.
- The latest message contains a slash command (e.g. "/bill", "/summarize") — slash commands are agent skills and always require an agent reply.
- The latest message is a short reaction or affirmation to an earlier message directed at ${agentName}, and ${agentName} has not yet replied.
- The latest message is a reaction to a question or request ${agentName} just asked.
- The latest message is a substantive follow-up that adds context, correction, or a constraint to an earlier request directed at ${agentName}, even without repeating the name.

Output HELPFUL if the latest message is an open question or statement directed at the group where an AI assistant could genuinely add value — a factual question anyone could answer, an open brainstorm, casual social commentary, or shared content with no specific addressee where the agent could offer analysis or summarization. The message must not name a specific person to do something.

Output UNKNOWN if it is genuinely unclear whether any reply is needed — a statement with no question, a reaction to something unrelated to ${agentName}, or chatter at a natural pause.

Output NONE if:
- The latest message asks or directs a specific named person (not ${agentName}) to do something.
- The latest message is directed at a specific named person other than ${agentName}.
- The latest message is a direct reply to another human's message and does not explicitly address ${agentName}.
- The latest message is a short acknowledgment or closing phrase after ${agentName} just replied — "thanks", "perfect", "got it", "sounds good", "ok".
- The latest message is a direct answer ("yes", "no") to a question ${agentName} just asked — the exchange is complete.
- The latest message uses "anyone else", "someone else" immediately after ${agentName} acted.
- The latest message is a reaction (emoji, "liked", "laughed at") to any message.
- The conversation is clearly human-to-human chatter with no invitation for broader participation.

When in doubt between ${agentName} and HELPFUL, prefer HELPFUL.
When in doubt between HELPFUL and UNKNOWN, prefer HELPFUL.
When in doubt between UNKNOWN and NONE, prefer UNKNOWN.`);

  if (participants?.length) {
    sections.push(`Speakers: ${participants.join(', ')}\n---`);
  }
  sections.push(formatMessages(messages));

  return sections.join('\n\n');
}

function normalizeResult(raw: string, agentName: string): TurnResult {
  const cleaned = raw.trim().toUpperCase();
  if (cleaned === agentName.toUpperCase() || cleaned.includes(agentName.toUpperCase())) return 'agent';
  if (cleaned === 'HELPFUL' || cleaned.includes('HELPFUL')) return 'helpful';
  if (cleaned === 'UNKNOWN' || cleaned.includes('UNKNOWN')) return 'unknown';
  if (cleaned === 'NONE' || cleaned.includes('NONE')) return 'none';
  return 'unknown';
}

export async function classifyTurn(
  messages: ConversationMessage[],
  options: TurnClassifierOptions,
): Promise<TurnResult> {
  const { agentName, participants, model = 'gpt-5.4-mini' } = options;

  if (messages.length === 0) {
    return 'none';
  }

  const latest = messages[messages.length - 1];

  // Reactions are never the agent's turn (unless replying to an agent question)
  if (latest && latest.role === 'user' && isReaction(latest.text)) {
    const prior = messages.length >= 2 ? messages[messages.length - 2] : undefined;
    if (!prior || prior.role !== 'assistant') {
      return 'none';
    }
  }

  // Skill triggers always mean it's the agent's turn
  if (latest && latest.role === 'user' && hasSkillTrigger(latest.text)) {
    return 'agent';
  }

  const prompt = buildPrompt(agentName, participants, messages);

  return await tracer.startActiveSpan('turn.classify', async (span) => {
    span.setAttribute('raven.turn.model', model);
    span.setAttribute('raven.turn.agent_name', agentName);
    span.setAttribute('raven.turn.message_count', messages.length);

    try {
      const token = await getAccessToken();
      logModelCall({
        model,
        provider: 'openai-codex',
        agent: agentName,
        purpose: 'turn-classify',
      });
      let raw = '';
      const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          instructions: 'You are a turn classifier for group conversations. Respond only with valid JSON.',
          input: [{ role: 'user', content: prompt }],
          text: { format: { type: 'json_object' } },
          reasoning: { effort: 'low' },
          store: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        span.recordException(text);
        span.setStatus({ code: SpanStatusCode.ERROR, message: `Turn classifier failed (${response.status})` });
        log.error('Turn classifier call failed', { status: response.status, body: text.slice(0, 200) });
        throw new Error(`Turn classifier failed (${response.status}): ${text}`);
      }

      if (!response.body) {
        throw new Error('Turn classifier stream missing response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let currentEvent = '';
      let closed = false;

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith('data:')) continue;

          const rawData = line.slice(5).trim();
          if (!rawData) continue;

          try {
            const parsed = JSON.parse(rawData) as
              | { type?: string; delta?: string }
              | Array<{ type?: string; delta?: string }>;
            const events = Array.isArray(parsed) ? parsed : [parsed];
            for (const event of events) {
              if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
                raw += event.delta;
              }
            }
          } catch {
            // Ignore malformed SSE data chunks.
          }

          if (currentEvent === 'control') {
            try {
              const control = JSON.parse(rawData) as { streamClosed?: boolean };
              if (control.streamClosed) closed = true;
            } catch {
              // Ignore malformed control frames.
            }
          }
        }
      }

      raw ||= '{}';
      let parsed: { turn?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        span.addEvent('turn.classified', { 'raven.turn.raw': raw });
        span.setAttribute('raven.turn.result', 'invalid-json');
        span.setStatus({ code: SpanStatusCode.OK });
        log.warn('Turn classifier returned invalid JSON', { raw: raw.slice(0, 200) });
        return 'unknown' as TurnResult;
      }

      const result = normalizeResult(parsed.turn ?? '', agentName);

      span.addEvent('turn.classified', {
        'raven.turn.raw': parsed.turn ?? '',
        'raven.turn.result': result,
      });
      span.setAttribute('raven.turn.result', result);
      span.setStatus({ code: SpanStatusCode.OK });

      log.info('Turn classified', { result, raw: parsed.turn });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}
