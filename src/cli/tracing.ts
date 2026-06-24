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

export async function tracing(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'open') {
    if (!(await isJaegerRunning())) {
      console.error('Jaeger is not running. Start it first with: raven start');
      process.exit(1);
    }
    return openUI();
  }

  console.log(`Usage:
  raven tracing open     Open the trace viewer in the browser`);
}
