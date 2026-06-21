import { writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { loadConfig } from '../config.js';

const LABEL = 'com.piracy.gateway';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const PIRACY_DIR = join(homedir(), '.piracy');
const LOG_DIR = join(PIRACY_DIR, 'logs');
const PID_FILE = join(PIRACY_DIR, 'gateway.pid');

function npxPath(): string {
  try {
    return execSync('which npx', { encoding: 'utf-8' }).trim();
  } catch {
    return '/usr/local/bin/npx';
  }
}

function buildPlist(): string {
  const npx = npxPath();

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
    // Kill the entire process group so children don't outlive the leader
    process.kill(-pid, 'SIGTERM');
    console.log(`Gateway stopped (pid ${pid})`);
  } catch {
    console.log('Gateway was not running.');
  }
  await unlink(PID_FILE).catch(() => {});
}

export async function install() {
  if (existsSync(PLIST_PATH)) {
    console.log('Service already installed. Run `piracy uninstall` first to reinstall.');
    return;
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const plist = buildPlist();
  await writeFile(PLIST_PATH, plist);
  console.log(`Wrote ${PLIST_PATH}`);

  try {
    execSync(`launchctl bootstrap gui/$(id -u) "${PLIST_PATH}"`, { stdio: 'inherit' });
    console.log('Service installed and started.');
  } catch {
    console.log('Plist written. Load it with:');
    console.log(`  launchctl bootstrap gui/$(id -u) "${PLIST_PATH}"`);
  }

  console.log(`\nLogs: ${LOG_DIR}/`);
}

export async function uninstall() {
  if (!existsSync(PLIST_PATH)) {
    console.log('Service is not installed.');
    return;
  }

  try {
    execSync(`launchctl bootout gui/$(id -u)/${LABEL}`, { stdio: 'inherit' });
    console.log('Service stopped.');
  } catch {
    // already unloaded
  }

  await unlink(PLIST_PATH);
  console.log(`Removed ${PLIST_PATH}`);
}

export async function restart() {
  await stop();
  await start();
}

export async function serviceStatus() {
  try {
    const output = execSync(`launchctl print gui/$(id -u)/${LABEL} 2>&1`, { encoding: 'utf-8' });
    const stateLine = output.split('\n').find((l) => l.includes('state'));
    console.log(`Service: installed`);
    if (stateLine) console.log(stateLine.trim());
    console.log(`Plist: ${PLIST_PATH}`);
    console.log(`Logs: ${LOG_DIR}/`);
  } catch {
    if (existsSync(PLIST_PATH)) {
      console.log('Service: installed but not loaded');
    } else {
      console.log('Service: not installed');
    }
  }
}
