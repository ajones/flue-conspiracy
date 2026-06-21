import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, unlink, chmod, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

const PIRACY_DIR = join(homedir(), '.piracy');
const BIN_DIR = join(PIRACY_DIR, 'bin');
const PID_FILE = join(PIRACY_DIR, 'jaeger.pid');
const JAEGER_BIN = join(BIN_DIR, 'jaeger');
const UI_URL = 'http://localhost:16686';
const JAEGER_VERSION = '2.19.0';

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

  // Extract to a temp dir, then find and move the jaeger binary
  const tmpDir = join(BIN_DIR, '_extract');
  await mkdir(tmpDir, { recursive: true });
  const proc = Bun.spawn(['tar', 'xzf', tarball, '-C', tmpDir], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  await proc.exited;

  // Find the jaeger binary wherever it landed
  const find = Bun.spawn(['find', tmpDir, '-name', 'jaeger', '-type', 'f'], {
    stdout: 'pipe',
  });
  const found = (await new Response(find.stdout).text()).trim().split('\n').filter(Boolean);
  if (found.length === 0) throw new Error('Could not find jaeger binary in release archive');

  await rename(found[0], JAEGER_BIN);
  await chmod(JAEGER_BIN, 0o755);

  // Cleanup
  Bun.spawn(['rm', '-rf', tmpDir, tarball], { stdout: 'ignore', stderr: 'ignore' });
  console.log(`Installed to ${JAEGER_BIN}`);
}

async function isRunning(): Promise<boolean> {
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

async function start(): Promise<void> {
  if (await isRunning()) {
    console.log(`Trace viewer already running at ${UI_URL}`);
    return;
  }

  if (!existsSync(JAEGER_BIN)) {
    await download();
  }

  await mkdir(PIRACY_DIR, { recursive: true });

  const child = spawn(JAEGER_BIN, [], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, SPAN_STORAGE_TYPE: 'memory' },
  });

  child.unref();

  if (child.pid) {
    await writeFile(PID_FILE, String(child.pid));
    console.log(`Trace viewer started at ${UI_URL} (pid ${child.pid})`);
  } else {
    console.error('Failed to start trace viewer');
    process.exit(1);
  }
}

async function stop(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.log('Trace viewer is not running.');
    return;
  }

  const pid = parseInt(await readFile(PID_FILE, 'utf-8'), 10);
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Trace viewer stopped (pid ${pid})`);
  } catch {
    console.log('Trace viewer was not running.');
  }
  await unlink(PID_FILE).catch(() => {});
}

async function status(): Promise<void> {
  if (await isRunning()) {
    const pid = parseInt(await readFile(PID_FILE, 'utf-8'), 10);
    console.log(`Trace viewer running at ${UI_URL} (pid ${pid})`);
  } else {
    console.log('Trace viewer is not running.');
  }
}

export async function tracing(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'start') return start();
  if (sub === 'stop') return stop();
  if (sub === 'status') return status();

  console.log(`Usage:
  piracy tracing start    Start the local trace viewer
  piracy tracing stop     Stop the trace viewer
  piracy tracing status   Check if the trace viewer is running`);
}
