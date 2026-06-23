import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_SERVER = 'http://localhost:3583';
const LOG_DIR = join(homedir(), '.raven', 'logs');

let useColor = !!process.stdout.isTTY || process.env.FORCE_COLOR === '1';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const BLUE = '\x1b[34m';

const STATUS_COLORS: Record<string, string> = {
  completed: GREEN,
  running: CYAN,
  pending: YELLOW,
  failed: RED,
  error: RED,
  cancelled: DIM,
};

const BADGE_COLORS: Record<string, string> = {
  DBG: CYAN,
  INF: GREEN,
  WRN: YELLOW,
  ERR: RED,
};

const LOG_RE = /^(\S+) (DBG|INF|WRN|ERR) (\S+) (.*)$/;

function colorizeLine(line: string): string {
  if (!useColor) return line;
  const m = line.match(LOG_RE);
  if (!m) return line;
  const [, time, badge, scope, rest] = m;
  const bc = BADGE_COLORS[badge] ?? '';
  const extraIdx = rest.indexOf(' {');
  let msg: string;
  let extra: string;
  if (extraIdx !== -1) {
    msg = rest.slice(0, extraIdx);
    extra = ` ${DIM}${rest.slice(extraIdx + 1)}${RESET}`;
  } else {
    msg = rest;
    extra = '';
  }
  return `${DIM}${time}${RESET} ${bc}${badge}${RESET} ${BOLD}${scope}${RESET} ${msg}${extra}`;
}

function c(code: string, text: string): string {
  return useColor ? `${code}${text}${RESET}` : text;
}

interface Run {
  runId?: string;
  id?: string;
  agentName?: string;
  status?: string;
  createdAt?: string;
  completedAt?: string;
  instanceId?: string;
  [key: string]: unknown;
}

export async function logs(args: string[]): Promise<void> {
  if (args.includes('--nocolor')) useColor = false;
  const follow = args.includes('-f') || args.includes('--follow');
  const serverIdx = args.indexOf('--server');
  const server = serverIdx !== -1 ? (args[serverIdx + 1] ?? DEFAULT_SERVER) : DEFAULT_SERVER;
  const limitIdx = args.indexOf('-n');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] ?? '20', 10) : 20;

  const runId = args.find((a) => !a.startsWith('-') && a !== args[serverIdx + 1] && a !== args[limitIdx + 1]);

  if (runId) {
    await tailRun(server, runId);
    return;
  }

  if (follow) {
    await tailAll(server);
  } else {
    await showRecent(server, limit);
  }
}

async function showRecent(server: string, limit: number): Promise<void> {
  const res = await fetch(`${server}/api/runs?limit=${limit}`).catch(() => null);
  if (!res || !res.ok) {
    console.error(`Could not reach server at ${server} — is flue dev running?`);
    process.exit(1);
  }

  const body = await res.json() as { runs?: Run[] } | Run[];
  const runs = Array.isArray(body) ? body : (body.runs ?? []);
  if (runs.length === 0) {
    console.log('No runs found.');
    return;
  }

  for (const run of runs) {
    printRun(run);
  }
}

async function tailLogFile(logPath: string, dest: NodeJS.WritableStream): Promise<void> {
  let offset = 0;
  try {
    const info = await stat(logPath);
    offset = info.size;
  } catch {
    return;
  }

  const decoder = new TextDecoder();
  let partial = '';
  while (true) {
    try {
      const info = await stat(logPath);
      if (info.size > offset) {
        const fh = await open(logPath, 'r');
        const buf = Buffer.alloc(info.size - offset);
        await fh.read(buf, 0, buf.length, offset);
        await fh.close();
        const chunk = partial + decoder.decode(buf);
        const lines = chunk.split('\n');
        partial = lines.pop() ?? '';
        for (const line of lines) {
          if (line) dest.write(colorizeLine(line) + '\n');
        }
        offset = info.size;
      }
    } catch {
      // log file may not exist yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function tailAll(server: string): Promise<void> {
  const seen = new Set<string>();
  console.log(`${c(CYAN, `Tailing ${server}...`)} ${c(DIM, '(Ctrl+C to stop)')}\n`);

  tailLogFile(join(LOG_DIR, 'stdout.log'), process.stdout);
  tailLogFile(join(LOG_DIR, 'stderr.log'), process.stderr);

  while (true) {
    try {
      const res = await fetch(`${server}/api/runs?limit=50`);
      if (res.ok) {
        const body = await res.json() as { runs?: Run[] } | Run[];
        const runs = Array.isArray(body) ? body : (body.runs ?? []);
        for (const run of runs) {
          const id = run.runId ?? run.id ?? '';
          if (id && !seen.has(id)) {
            seen.add(id);
            printRun(run);
          }
        }
      }
    } catch {
      // server might be restarting
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function tailRun(server: string, runId: string): Promise<void> {
  console.log(`${c(CYAN, `Streaming run ${runId}...`)}\n`);
  try {
    const res = await fetch(`${server}/runs/${runId}`, {
      headers: { Accept: 'text/event-stream' },
    });

    if (!res.ok) {
      console.error(`Run not found (${res.status})`);
      process.exit(1);
    }

    if (!res.body) {
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stdout.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function printRun(run: Run): void {
  const id = run.runId ?? run.id ?? '?';
  const time = run.createdAt ? new Date(run.createdAt).toLocaleTimeString() : '?';
  const agent = run.agentName ?? '?';
  const status = run.status ?? '?';
  const instance = run.instanceId ?? '';
  const sc = STATUS_COLORS[status] ?? '';
  console.log(
    `${c(DIM, time)}  ${c(sc || BOLD, pad(status, 10))}  ${c(MAGENTA, pad(agent, 15))}  ${instance ? c(BLUE, instance) + '  ' : ''}${c(DIM, id)}`,
  );
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
