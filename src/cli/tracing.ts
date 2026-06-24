import { existsSync, openSync, unlinkSync } from 'node:fs';
import { mkdir, writeFile, readFile, unlink, chmod, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createConnection } from 'node:net';
import { spawn, execSync } from 'node:child_process';
import { loadConfig } from '../config.ts';

const RAVEN_DIR = join(homedir(), '.raven');
const BIN_DIR = join(RAVEN_DIR, 'bin');
const LOG_DIR = join(RAVEN_DIR, 'logs');
const JAEGER_DATA_DIR = join(RAVEN_DIR, 'jaeger');
const JAEGER_CONFIG_PATH = join(RAVEN_DIR, 'jaeger.yaml');
const PID_FILE = join(RAVEN_DIR, 'jaeger.pid');
const JAEGER_BIN = join(BIN_DIR, 'jaeger');
const UI_URL = 'http://localhost:16686';
const JAEGER_VERSION = '2.19.0';
const DEFAULT_RETENTION_DAYS = 7;

function getPlatformAsset(): string {
  const os = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  return `jaeger-${JAEGER_VERSION}-${os}-${arch}.tar.gz`;
}

async function download(): Promise<void> {
  const asset = getPlatformAsset();
  const url = `https://github.com/jaegertracing/jaeger/releases/download/v${JAEGER_VERSION}/${asset}`;

  console.log(`Downloading Jaeger v${JAEGER_VERSION}...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  await mkdir(BIN_DIR, { recursive: true });
  const tarball = join(BIN_DIR, asset);
  await Bun.write(tarball, await res.arrayBuffer());

  const tmpDir = join(BIN_DIR, '_extract');
  await mkdir(tmpDir, { recursive: true });
  const proc = Bun.spawn(['tar', 'xzf', tarball, '-C', tmpDir], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  await proc.exited;

  const find = Bun.spawn(['find', tmpDir, '-name', 'jaeger', '-type', 'f'], {
    stdout: 'pipe',
  });
  const found = (await new Response(find.stdout).text()).trim().split('\n').filter(Boolean);
  if (found.length === 0) throw new Error('Could not find jaeger binary in release archive');

  await rename(found[0], JAEGER_BIN);
  await chmod(JAEGER_BIN, 0o755);

  Bun.spawn(['rm', '-rf', tmpDir, tarball], { stdout: 'ignore', stderr: 'ignore' });
  console.log(`Installed to ${JAEGER_BIN}`);
}

function getRetentionHours(): number {
  const config = loadConfig();
  const days = config.traceRetentionDays ?? DEFAULT_RETENTION_DAYS;
  return days * 24;
}

async function writeJaegerConfig(): Promise<void> {
  const retentionHours = getRetentionHours();
  const keysDir = join(JAEGER_DATA_DIR, 'keys');
  const valuesDir = join(JAEGER_DATA_DIR, 'values');
  await mkdir(keysDir, { recursive: true });
  await mkdir(valuesDir, { recursive: true });

  const config = `extensions:
  jaeger_storage:
    backends:
      main_store:
        badger:
          directories:
            keys: ${keysDir}
            values: ${valuesDir}
          ephemeral: false
  jaeger_query:
    storage:
      traces: main_store
      traces_archive: main_store

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:

exporters:
  jaeger_storage_exporter:
    trace_storage: main_store

service:
  telemetry:
    metrics:
      level: none
  extensions: [jaeger_storage, jaeger_query]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [jaeger_storage_exporter]
`;

  await writeFile(JAEGER_CONFIG_PATH, config);
}

export async function isJaegerRunning(): Promise<boolean> {
  if (!existsSync(PID_FILE)) return false;
  const pid = parseInt(await readFile(PID_FILE, 'utf-8'), 10);
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    await unlink(PID_FILE).catch(() => {});
    return false;
  }
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: '127.0.0.1' });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.setTimeout(500, () => { sock.destroy(); resolve(false); });
  });
}

function clearStaleLock(): void {
  const lockFile = join(JAEGER_DATA_DIR, 'keys', 'LOCK');
  if (existsSync(lockFile)) {
    try { unlinkSync(lockFile); } catch {}
  }
}

export async function startJaeger(): Promise<void> {
  if (await isJaegerRunning()) return;

  if (await isPortInUse(4317)) {
    return;
  }

  if (!existsSync(JAEGER_BIN)) {
    await download();
  }

  await writeJaegerConfig();
  clearStaleLock();

  await mkdir(LOG_DIR, { recursive: true });
  const outFd = openSync(join(LOG_DIR, 'jaeger-stdout.log'), 'a');
  const errFd = openSync(join(LOG_DIR, 'jaeger-stderr.log'), 'a');

  const child = spawn(JAEGER_BIN, ['--config', JAEGER_CONFIG_PATH], {
    stdio: ['ignore', outFd, errFd],
    detached: true,
  });

  child.unref();

  if (!child.pid) {
    console.error('Failed to start trace collector');
    return;
  }

  await new Promise((r) => setTimeout(r, 500));
  try {
    process.kill(child.pid, 0);
  } catch {
    console.error(`Jaeger exited immediately. Check ${join(LOG_DIR, 'jaeger-stderr.log')}`);
    return;
  }

  await writeFile(PID_FILE, String(child.pid));
}

export async function stopJaeger(): Promise<void> {
  if (!existsSync(PID_FILE)) return;

  const pid = parseInt(await readFile(PID_FILE, 'utf-8'), 10);
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
  await unlink(PID_FILE).catch(() => {});
}

function openUI(): void {
  if (process.platform === 'darwin') {
    execSync(`open ${UI_URL}`);
  } else {
    execSync(`xdg-open ${UI_URL}`);
  }
  console.log(`Opened ${UI_URL}`);
}

function parseTraceId(input: string): string {
  if (/^[a-f0-9]+$/i.test(input)) return input;

  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/trace\/([a-f0-9]+)/i);
    if (match) return match[1];
  } catch {}

  throw new Error(`Could not extract trace ID from: ${input}`);
}

const PROMPT_ATTRS = [
  'flue.task.prompt', 'flue.task.result',
  'flue.turn.input', 'flue.turn.output',
  'flue.operation.result', 'flue.workflow.payload', 'flue.workflow.result',
  'flue.tool.arguments', 'flue.tool.result',
];

const useColor = process.stdout.isTTY ?? false;

const c = useColor
  ? {
      reset: '\x1b[0m',
      dim: '\x1b[2m',
      bold: '\x1b[1m',
      cyan: '\x1b[36m',
      yellow: '\x1b[33m',
      green: '\x1b[32m',
      magenta: '\x1b[35m',
      blue: '\x1b[34m',
      white: '\x1b[37m',
    }
  : {
      reset: '', dim: '', bold: '', cyan: '', yellow: '',
      green: '', magenta: '', blue: '', white: '',
    };

function tryParseJson(value: string): unknown | undefined {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch {}
  return undefined;
}

function formatValue(value: string): string {
  const parsed = tryParseJson(value);
  if (parsed !== undefined) return colorizeJson(parsed, 0);

  const unescaped = value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const reparsed = tryParseJson(unescaped);
  if (reparsed !== undefined) return colorizeJson(reparsed, 0);

  return unescaped;
}

function colorizeJson(value: unknown, depth: number): string {
  const indent = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);

  if (value === null) return `${c.dim}null${c.reset}`;
  if (typeof value === 'boolean') return `${c.yellow}${value}${c.reset}`;
  if (typeof value === 'number') return `${c.yellow}${value}${c.reset}`;

  if (typeof value === 'string') {
    const nested = tryParseJson(value);
    if (nested !== undefined) return colorizeJson(nested, depth);

    if (value.includes('\n')) {
      const lines = value.split('\n').map((line) => `${inner}${c.green}${line}${c.reset}`);
      return `${c.green}│${c.reset}\n${lines.join('\n')}`;
    }
    return `${c.green}"${value}"${c.reset}`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return `${c.dim}[]${c.reset}`;
    const items = value.map((v) => `${inner}${colorizeJson(v, depth + 1)}`);
    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${c.dim}{}${c.reset}`;
    const lines = entries.map(
      ([k, v]) => `${inner}${c.cyan}"${k}"${c.reset}: ${colorizeJson(v, depth + 1)}`,
    );
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }

  return String(value);
}

interface TraceInfo {
  traceID: string;
  operation: string;
  service: string;
  startTime: number;
  duration: number;
  spanCount: number;
  tags: Record<string, string>;
}

async function fetchTraces(limit: number): Promise<TraceInfo[]> {
  const apiBase = process.env.JAEGER_API ?? 'http://localhost:16686';
  const servicesRes = await fetch(`${apiBase}/api/services`);
  if (!servicesRes.ok) {
    console.error(`Failed to fetch services: ${servicesRes.status}`);
    process.exit(1);
  }
  const { data: services } = (await servicesRes.json()) as { data: string[] };
  const ours = services.filter((s) => s !== 'jaeger');

  const seen = new Set<string>();
  const traces: TraceInfo[] = [];

  await Promise.all(
    ours.map(async (service) => {
      const res = await fetch(
        `${apiBase}/api/traces?service=${encodeURIComponent(service)}&limit=${limit}&lookback=72h`,
      );
      if (!res.ok) return;
      const body = (await res.json()) as { data: Array<{ traceID: string; spans: any[]; processes: Record<string, { serviceName: string }> }> };
      for (const trace of body.data ?? []) {
        if (seen.has(trace.traceID)) continue;
        seen.add(trace.traceID);

        const root = trace.spans.find(
          (s: any) => !s.references?.length || s.references.every((r: any) => r.spanID === '0000000000000000'),
        ) ?? trace.spans[0];
        if (!root) continue;

        const tagMap: Record<string, string> = {};
        for (const t of root.tags ?? []) tagMap[t.key] = t.value;

        const serviceNames = new Set<string>();
        for (const p of Object.values(trace.processes ?? {})) serviceNames.add(p.serviceName);
        serviceNames.delete('jaeger');

        traces.push({
          traceID: trace.traceID,
          operation: root.operationName,
          service: tagMap['raven.service.name'] ?? tagMap['raven.job.name'] ?? [...serviceNames][0] ?? 'raven',
          startTime: root.startTime,
          duration: root.duration,
          spanCount: trace.spans.length,
          tags: tagMap,
        });
      }
    }),
  );

  traces.sort((a, b) => b.startTime - a.startTime);
  return traces.slice(0, limit);
}

function formatDuration(us: number): string {
  if (us < 1000) return `${us}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(0)}ms`;
  return `${(us / 1_000_000).toFixed(1)}s`;
}

function formatTime(us: number): string {
  const d = new Date(us / 1000);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 86_400_000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderList(traces: TraceInfo[], selected: number): string {
  const lines: string[] = [];
  lines.push(`${c.bold}Recent traces${c.reset} ${c.dim}(${traces.length})${c.reset}\n`);

  for (let i = 0; i < traces.length; i++) {
    const t = traces[i];
    const cursor = i === selected ? `${c.cyan}❯${c.reset}` : ' ';
    const highlight = i === selected;
    const name = highlight
      ? `${c.bold}${c.white}${t.service}${c.reset}`
      : `${c.white}${t.service}${c.reset}`;
    const op = `${c.dim}${t.operation}${c.reset}`;
    const time = `${c.dim}${formatTime(t.startTime)}${c.reset}`;
    const dur = `${c.yellow}${formatDuration(t.duration)}${c.reset}`;
    const spans = `${c.dim}${t.spanCount} spans${c.reset}`;
    const jobName = t.tags['raven.job.name'];
    const extra = jobName && jobName !== t.service ? ` ${c.magenta}[${jobName}]${c.reset}` : '';

    lines.push(`  ${cursor} ${name} ${op}${extra}  ${dur}  ${spans}  ${time}`);
  }

  lines.push(`\n${c.dim}↑/↓ select  enter view  q quit${c.reset}`);
  return lines.join('\n');
}

async function selectTrace(traces: TraceInfo[]): Promise<string | null> {
  if (!process.stdin.isTTY) {
    for (const t of traces) {
      console.log(`${t.traceID}  ${t.service}  ${t.operation}  ${formatDuration(t.duration)}  ${formatTime(t.startTime)}`);
    }
    return null;
  }

  let selected = 0;
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const clear = () => {
    process.stdout.write(`\x1b[${traces.length + 4}A\x1b[J`);
  };

  process.stdout.write(renderList(traces, selected) + '\n');

  return new Promise((resolve) => {
    const onData = (data: Buffer) => {
      const key = data.toString();
      if (key === '\x1b[A' || key === 'k') {
        selected = Math.max(0, selected - 1);
        clear();
        process.stdout.write(renderList(traces, selected) + '\n');
      } else if (key === '\x1b[B' || key === 'j') {
        selected = Math.min(traces.length - 1, selected + 1);
        clear();
        process.stdout.write(renderList(traces, selected) + '\n');
      } else if (key === '\r' || key === '\n') {
        cleanup();
        resolve(traces[selected].traceID);
      } else if (key === 'q' || key === '\x1b' || key === '\x03') {
        cleanup();
        resolve(null);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      clear();
    };

    process.stdin.on('data', onData);
  });
}

async function list(): Promise<void> {
  if (!(await isJaegerRunning())) {
    console.error('Jaeger is not running. Start it first with: raven start');
    process.exit(1);
  }

  const traces = await fetchTraces(20);
  if (traces.length === 0) {
    console.log('No recent traces found.');
    return;
  }

  const traceId = await selectTrace(traces);
  if (traceId) return show(traceId);
}

function paginate(output: string): void {
  if (!process.stdout.isTTY) {
    process.stdout.write(output);
    return;
  }

  const pager = spawn('less', ['-R'], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  pager.stdin!.write(output);
  pager.stdin!.end();

  pager.on('exit', (code) => process.exit(code ?? 0));
}

async function show(input: string): Promise<void> {
  let traceId: string;
  try {
    traceId = parseTraceId(input);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const apiBase = process.env.JAEGER_API ?? 'http://localhost:16686';
  const res = await fetch(`${apiBase}/api/traces/${traceId}`);
  if (!res.ok) {
    console.error(`Failed to fetch trace ${traceId}: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const body = (await res.json()) as {
    data: Array<{
      spans: Array<{
        operationName: string;
        spanID: string;
        tags: Array<{ key: string; value: string; type: string }>;
      }>;
    }>;
  };

  const spans = body.data?.[0]?.spans ?? [];
  if (spans.length === 0) {
    console.error(`No spans found for trace ${traceId}`);
    process.exit(1);
  }

  const parts: string[] = [];

  for (const span of spans) {
    const attrs = span.tags.filter((t) => PROMPT_ATTRS.includes(t.key));
    if (attrs.length === 0) continue;

    const rule = `${c.dim}${'─'.repeat(60)}${c.reset}`;
    parts.push(`\n${rule}`);
    parts.push(`${c.bold}${c.magenta}span${c.reset}: ${c.white}${span.operationName}${c.reset} ${c.dim}(${span.spanID})${c.reset}`);
    parts.push(rule);

    for (const attr of attrs) {
      parts.push(`\n  ${c.bold}${c.blue}[${attr.key}]${c.reset}\n`);
      parts.push(formatValue(attr.value));
    }
  }

  paginate(parts.join('\n') + '\n');
}

export async function tracing(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'open') {
    if (!(await isJaegerRunning())) {
      console.error('Jaeger is not running. Start it first with: raven start');
      process.exit(1);
    }
    return openUI();
  }

  if (sub === 'show') {
    if (!args[1]) {
      console.error('Usage: raven tracing show <traceId|url>');
      process.exit(1);
    }
    return show(args[1]);
  }

  if (sub === 'list' || !sub) {
    return list();
  }

  console.log(`Usage:
  raven tracing                   List recent traces (interactive)
  raven tracing list              List recent traces (interactive)
  raven tracing open              Open the trace viewer in the browser
  raven tracing show <id|url>     Show trace prompts and results`);
}
