import { getAccessToken } from './auth/tokens.ts';
import { logModelCall } from './model-observer.ts';

const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses';

export interface CodexImage {
  data: string;
  mimeType: string;
}

type TextPart = { type: 'input_text'; text: string };
type ImagePart = { type: 'input_image'; image_url: string };
export type ContentPart = TextPart | ImagePart;

export function buildInputContent(prompt: string, images?: CodexImage[]): string | ContentPart[] {
  if (!images || images.length === 0) return prompt;
  return [
    { type: 'input_text', text: prompt },
    ...images.map((img) => ({
      type: 'input_image' as const,
      image_url: `data:${img.mimeType};base64,${img.data}`,
    })),
  ];
}

export interface CodexCallOptions {
  model?: string;
  instructions: string;
  prompt: string;
  images?: CodexImage[];
  format?: 'json_object' | 'text';
  reasoning?: { effort: 'low' | 'medium' | 'high' };
  store?: boolean;
  agent?: string;
  purpose?: string;
}

export async function callCodex(options: CodexCallOptions): Promise<string> {
  const {
    model = 'gpt-5.4-mini',
    instructions,
    prompt,
    images,
    format,
    reasoning,
    store = false,
    agent,
    purpose,
  } = options;

  const token = await getAccessToken();
  logModelCall({ model, provider: 'openai-codex', agent, purpose });

  const content = buildInputContent(prompt, images);

  const response = await fetch(CODEX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      instructions,
      input: [{ role: 'user', content }],
      ...(format ? { text: { format: { type: format } } } : {}),
      ...(reasoning ? { reasoning } : {}),
      store,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Codex call failed (${response.status}): ${text}`);
  }

  if (!response.body) {
    throw new Error('Codex response missing body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let currentEvent = '';
  let closed = false;
  let raw = '';

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
        // ignore malformed SSE chunks
      }

      if (currentEvent === 'control') {
        try {
          const control = JSON.parse(rawData) as { streamClosed?: boolean };
          if (control.streamClosed) closed = true;
        } catch {
          // ignore malformed control frames
        }
      }
    }
  }

  return raw;
}
