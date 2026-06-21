import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_SERVER = 'http://localhost:3583';
const LOG_DIR = join(homedir(), '.piracy', 'logs');

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

async function tailStderr(): Promise<void> {
  const logPath = join(LOG_DIR, 'stderr.log');
  let offset = 0;
  try {
    const info = await stat(logPath);
    offset = info.size;
  } catch {
    return;
  }

  const decoder = new TextDecoder();
  while (true) {
    try {
      const info = await stat(logPath);
      if (info.size > offset) {
        const fh = await open(logPath, 'r');
        const buf = Buffer.alloc(info.size - offset);
        await fh.read(buf, 0, buf.length, offset);
        await fh.close();
        process.stderr.write(decoder.decode(buf));
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
  console.log(`Tailing ${server}... (Ctrl+C to stop)\n`);

  tailStderr();

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
  console.log(`Streaming run ${runId}...\n`);
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
  console.log(`${time}  ${pad(status, 10)}  ${pad(agent, 15)}  ${instance ? instance + '  ' : ''}${id}`);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
