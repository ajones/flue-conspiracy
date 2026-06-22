import { writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { loadConfig } from '../config.ts';
import { startJaeger, stopJaeger } from './tracing.ts';

const LABEL = 'com.piracy.gateway';
const JAEGER_LABEL = 'com.piracy.jaeger';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const JAEGER_PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${JAEGER_LABEL}.plist`);
const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const PIRACY_DIR = join(homedir(), '.piracy');
const LOG_DIR = join(PIRACY_DIR, 'logs');
const PID_FILE = join(PIRACY_DIR, 'gateway.pid');
const JAEGER_BIN = join(PIRACY_DIR, 'bin', 'jaeger');
const JAEGER_CONFIG = join(PIRACY_DIR, 'jaeger.yaml');

function npxPath(): string {
  try {
    return execSync('which npx', { encoding: 'utf-8' }).trim();
  } catch {
    return '/usr/local/bin/npx';
  }
}

function buildPlist(): string {
  const npx = npxPath();
  const { port } = loadConfig();

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${npx}</string>
    <string>flue</string>
    <string>dev</string>
    <string>--port</string>
    <string>${port}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(LOG_DIR, 'stdout.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(LOG_DIR, 'stderr.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>`;
}

async function isRunning(): Promise<number | null> {
  if (!existsSync(PID_FILE)) return null;
  const pid = parseInt(await readFile(PID_FILE, 'utf-8'), 10);
  try {
    // Check the entire process group — catches children that outlive the group leader
    process.kill(-pid, 0);
    return pid;
  } catch {
    await unlink(PID_FILE).catch(() => {});
    return null;
  }
}

export async function start() {
  const { port } = loadConfig();

  const pid = await isRunning();
  if (pid) {
    console.log(`Gateway already running (pid ${pid}) at http://localhost:${port}`);
    return;
  }

  await startJaeger();

  mkdirSync(LOG_DIR, { recursive: true });

  // Atomic PID file creation to prevent races between concurrent `start` calls
  let fd: number;
  try {
    fd = openSync(PID_FILE, 'wx');
  } catch {
    const racePid = await isRunning();
    console.log(`Gateway already running${racePid ? ` (pid ${racePid})` : ''} at http://localhost:${port}`);
    return;
  }

  const npx = npxPath();
  const outFd = openSync(join(LOG_DIR, 'stdout.log'), 'a');
  const errFd = openSync(join(LOG_DIR, 'stderr.log'), 'a');

  const child = spawn(npx, ['flue', 'dev', '--port', String(port)], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', outFd, errFd],
    detached: true,
    env: { ...process.env },
  });

  child.unref();
  closeSync(outFd);
  closeSync(errFd);

  if (child.pid) {
    writeSync(fd, String(child.pid));
    closeSync(fd);
    console.log(`Gateway started (pid ${child.pid}) at http://localhost:${port}`);
    console.log(`Logs: ${LOG_DIR}/`);
  } else {
    closeSync(fd);
    await unlink(PID_FILE).catch(() => {});
    console.error('Failed to start gateway.');
    process.exit(1);
  }
}

export async function stop() {
  const pid = await isRunning();
  if (!pid) {
    console.log('Gateway is not running.');
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
    console.log(`Gateway stopped (pid ${pid})`);
  } catch {
    console.log('Gateway was not running.');
  }
  await unlink(PID_FILE).catch(() => {});
  await stopJaeger();
}

function buildJaegerPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${JAEGER_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${JAEGER_BIN}</string>
    <string>--config</string>
    <string>${JAEGER_CONFIG}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(LOG_DIR, 'jaeger-stdout.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(LOG_DIR, 'jaeger-stderr.log')}</string>
</dict>
</plist>`;
}

export async function install() {
  if (existsSync(PLIST_PATH)) {
    console.log('Service already installed. Run `piracy uninstall` first to reinstall.');
    return;
  }

  mkdirSync(LOG_DIR, { recursive: true });

  // Ensure Jaeger is downloaded and config is written
  await startJaeger();
  await stopJaeger();

  const plist = buildPlist();
  await writeFile(PLIST_PATH, plist);
  console.log(`Wrote ${PLIST_PATH}`);

  const jaegerPlist = buildJaegerPlist();
  await writeFile(JAEGER_PLIST_PATH, jaegerPlist);
  console.log(`Wrote ${JAEGER_PLIST_PATH}`);

  try {
    execSync(`launchctl bootstrap gui/$(id -u) "${JAEGER_PLIST_PATH}"`, { stdio: 'inherit' });
    execSync(`launchctl bootstrap gui/$(id -u) "${PLIST_PATH}"`, { stdio: 'inherit' });
    console.log('Services installed and started.');
  } catch {
    console.log('Plists written. Load them with:');
    console.log(`  launchctl bootstrap gui/$(id -u) "${JAEGER_PLIST_PATH}"`);
    console.log(`  launchctl bootstrap gui/$(id -u) "${PLIST_PATH}"`);
  }

  console.log(`\nLogs: ${LOG_DIR}/`);
}

export async function uninstall() {
  if (!existsSync(PLIST_PATH) && !existsSync(JAEGER_PLIST_PATH)) {
    console.log('Service is not installed.');
    return;
  }

  try {
    execSync(`launchctl bootout gui/$(id -u)/${LABEL}`, { stdio: 'inherit' });
  } catch {
    // already unloaded
  }
  try {
    execSync(`launchctl bootout gui/$(id -u)/${JAEGER_LABEL}`, { stdio: 'inherit' });
  } catch {
    // already unloaded
  }

  if (existsSync(PLIST_PATH)) await unlink(PLIST_PATH);
  if (existsSync(JAEGER_PLIST_PATH)) await unlink(JAEGER_PLIST_PATH);
  console.log('Services removed.');
}

export async function restart() {
  await stop();
  await start();
}

export async function serviceStatus() {
  const { port } = loadConfig();

  // Launch agent status
  try {
    const output = execSync(`launchctl print gui/$(id -u)/${LABEL} 2>&1`, { encoding: 'utf-8' });
    const stateLine = output.split('\n').find((l) => l.includes('state'));
    console.log(`Launch agent: installed`);
    if (stateLine) console.log(`  ${stateLine.trim()}`);
    console.log(`  Plist: ${PLIST_PATH}`);
  } catch {
    if (existsSync(PLIST_PATH)) {
      console.log('Launch agent: installed but not loaded');
    } else {
      console.log('Launch agent: not installed');
    }
  }

  // Gateway process status
  const pid = await isRunning();
  if (pid) {
    console.log(`Gateway process: running (pid ${pid})`);
  } else {
    console.log('Gateway process: not running');
  }

  // HTTP health check
  try {
    const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) });
    console.log(`Gateway HTTP: responding on port ${port} (${res.status})`);
  } catch {
    console.log(`Gateway HTTP: not responding on port ${port}`);
  }

  console.log(`Logs: ${LOG_DIR}/`);
}
