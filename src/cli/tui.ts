import { randomUUID } from 'node:crypto';
import { getGatewayUrl } from '../config.ts';

const BASE_URL = getGatewayUrl();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const CLR = '\x1b[K';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function moveTo(r: number, c: number) {
  return `\x1b[${r};${c}H`;
}

function wrapText(text: string, width: number): string[] {
  if (width < 1) width = 1;
  const result: string[] = [];
  for (const line of text.split('\n')) {
    if (line.length === 0) { result.push(''); continue; }
    let rest = line;
    while (rest.length > width) {
      let b = rest.lastIndexOf(' ', width);
      if (b <= 0) b = width;
      result.push(rest.slice(0, b));
      rest = rest.slice(b).replace(/^ /, '');
    }
    result.push(rest);
  }
  return result;
}

class Tui {
  private agent: string;
  private instanceId: string;
  private messages: Message[] = [];
  private input = '';
  private cursor = 0;
  private busy = false;
  private renderQueued = false;
  private loadingFrame = 0;
  private loadingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(agent: string) {
    this.agent = agent;
    this.instanceId = `tui:${randomUUID()}`;
  }

  private get rows() { return process.stdout.rows || 24; }
  private get cols() { return process.stdout.columns || 80; }

  start() {
    process.stdout.write('\x1b[?1049h\x1b[?25h');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (d) => this.onKey(d));
    process.stdout.on('resize', () => this.render());
    this.render();
  }

  private exit() {
    this.stopLoadingAnimation();
    process.stdout.write('\x1b[?25h\x1b[?1049l');
    process.stdin.setRawMode(false);
    process.exit(0);
  }

  private startLoadingAnimation() {
    if (this.loadingTimer) return;
    this.loadingFrame = 0;
    this.loadingTimer = setInterval(() => {
      this.loadingFrame = (this.loadingFrame + 1) % 3;
      this.render();
    }, 400);
  }

  private stopLoadingAnimation() {
    if (!this.loadingTimer) return;
    clearInterval(this.loadingTimer);
    this.loadingTimer = null;
  }

  private loadingDots() {
    return '.'.repeat((this.loadingFrame % 3) + 1);
  }

  private queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    setTimeout(() => {
      this.renderQueued = false;
      this.render();
    }, 16);
  }

  private render() {
    const { rows, cols } = this;
    const msgAreaHeight = rows - 3;
    const contentWidth = cols - 4;

    const lines: string[] = [];
    for (const m of this.messages) {
      if (m.role === 'assistant' && m.content === '' && this.busy) {
        lines.push(`${CYAN}▸ ${DIM}${this.loadingDots()}${RESET}`);
      } else {
        const pfx = m.role === 'user' ? `${GREEN}▹ ${RESET}` : `${CYAN}▸ ${RESET}`;
        const wrapped = wrapText(m.content, contentWidth);
        for (let i = 0; i < wrapped.length; i++) {
          lines.push(i === 0 ? pfx + wrapped[i] : '  ' + wrapped[i]);
        }
      }
      lines.push('');
    }

    const visible = lines.slice(-msgAreaHeight);
    let out = moveTo(1, 1);

    out += `${BOLD}raven${RESET} ${DIM}— ${CYAN}${this.agent}${RESET}${CLR}\n`;

    for (let i = 0; i < msgAreaHeight; i++) {
      out += (i < visible.length ? visible[i] : '') + CLR + '\n';
    }

    out += `${DIM}${'─'.repeat(cols)}${RESET}\n`;
    out += `${GREEN}${BOLD}▹ ${RESET}${this.input}${CLR}`;
    out += moveTo(rows, 3 + this.cursor) + '\x1b[?25h';

    process.stdout.write(out);
  }

  private onKey(data: Buffer) {
    const s = data.toString();

    if (s === '\x03' || s === '\x04') return this.exit();

    if (s === '\r') {
      if (this.busy) return;
      const text = this.input.trim();
      if (!text) return;
      if (text === '/quit' || text === '/exit' || text === '/q') return this.exit();
      if (text === '/clear') {
        this.messages = [];
        this.input = '';
        this.cursor = 0;
        return this.render();
      }
      this.input = '';
      this.cursor = 0;
      this.messages.push({ role: 'user', content: text });
      this.render();
      this.send(text);
      return;
    }

    if (s === '\x7f' || s === '\b') {
      if (this.cursor > 0) {
        this.input = this.input.slice(0, this.cursor - 1) + this.input.slice(this.cursor);
        this.cursor--;
        this.render();
      }
      return;
    }

    if (s === '\x1b[3~') {
      if (this.cursor < this.input.length) {
        this.input = this.input.slice(0, this.cursor) + this.input.slice(this.cursor + 1);
        this.render();
      }
      return;
    }

    if (s === '\x1b[D' && this.cursor > 0) { this.cursor--; return this.render(); }
    if (s === '\x1b[C' && this.cursor < this.input.length) { this.cursor++; return this.render(); }
    if (s === '\x01') { this.cursor = 0; return this.render(); }
    if (s === '\x05') { this.cursor = this.input.length; return this.render(); }
    if (s === '\x15') { this.input = this.input.slice(this.cursor); this.cursor = 0; return this.render(); }

    if (s.startsWith('\x1b')) return;

    this.input = this.input.slice(0, this.cursor) + s + this.input.slice(this.cursor);
    this.cursor += s.length;
    this.render();
  }

  private async send(text: string) {
    this.busy = true;
    this.messages.push({ role: 'assistant', content: '' });
    const lastIdx = this.messages.length - 1;
    this.startLoadingAnimation();
    this.render();

    try {
      const url = `${BASE_URL}/agents/${this.agent}/${this.instanceId}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.messages[lastIdx].content = `Error ${res.status}: ${body}`;
        this.busy = false;
        this.stopLoadingAnimation();
        this.render();
        return;
      }

      const offset = res.headers.get('Stream-Next-Offset') ?? '-1';
      await this.readStream(offset, lastIdx);
    } catch {
      this.messages[lastIdx].content = `Gateway is not running at ${BASE_URL}. Start it with: raven start`;
    }

    this.busy = false;
    this.stopLoadingAnimation();
    this.render();
  }

  private async readStream(offset: string, lastIdx: number) {
    const url = `${BASE_URL}/agents/${this.agent}/${this.instanceId}?offset=${encodeURIComponent(offset)}&live=sse`;
    const res = await fetch(url, { headers: { 'Accept': 'text/event-stream' } });

    if (!res.ok || !res.body) {
      this.messages[lastIdx].content = '(no response)';
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let closed = false;
    let currentEvent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      let changed = false;
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5);

        if (currentEvent === 'data') {
          let events: any[];
          try { events = JSON.parse(raw); } catch { continue; }
          if (!Array.isArray(events)) continue;
          for (const ev of events) {
            if (ev.type === 'text_delta') {
              if (this.messages[lastIdx].content === '') this.stopLoadingAnimation();
              this.messages[lastIdx].content += ev.text;
              changed = true;
            } else if (ev.type === 'idle') {
              closed = true;
            }
          }
        } else if (currentEvent === 'control') {
          try {
            if (JSON.parse(raw).streamClosed) closed = true;
          } catch {}
        }
      }

      if (changed) this.queueRender();
      if (closed) break;
    }

    this.render();
  }
}

async function resolveAgent(requested?: string): Promise<string> {
  if (requested) return requested;
  try {
    const res = await fetch(`${BASE_URL}/openapi.json`);
    if (res.ok) {
      const spec = (await res.json()) as any;
      for (const p of Object.keys(spec.paths ?? {})) {
        const m = p.match(/^\/agents\/([^/{}]+)\//);
        if (m) return m[1];
      }
    }
  } catch {}
  return 'raven-lead';
}

export async function tui(args: string[]) {
  try {
    await fetch(`${BASE_URL}/openapi.json`, { signal: AbortSignal.timeout(2000) });
  } catch {
    console.error(`Gateway is not running at ${BASE_URL}. Start it with: raven start`);
    process.exit(1);
  }
  const agent = await resolveAgent(args[0]);
  new Tui(agent).start();
}
