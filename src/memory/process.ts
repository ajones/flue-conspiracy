import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryConfig } from '../config.js';
import { createLogger } from '../log.js';

const log = createLogger('memory');
const DEFAULT_URL = 'http://localhost:3111';
const DATA_DIR = join(import.meta.dirname, '..', '..', '.data', 'agentmemory');

export function spawnAgentMemory(config: MemoryConfig): ChildProcess {
  mkdirSync(DATA_DIR, { recursive: true });

  const child = spawn('bunx', ['@agentmemory/agentmemory'], {
    cwd: DATA_DIR,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      AGENTMEMORY_AUTO_COMPRESS: 'false',
      EMBEDDING_PROVIDER: 'local',
      AGENTMEMORY_TOOLS: 'core',
    },
  });

  child.on('error', (err) => {
    log.error('Failed to spawn agentmemory', { error: err.message });
  });

  child.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM') {
      log.error('agentmemory exited unexpectedly', { code, signal });
    }
  });

  return child;
}

export async function waitForReady(config: MemoryConfig, timeoutMs = 30_000): Promise<void> {
  const url = config.url ?? DEFAULT_URL;
  const start = Date.now();
  let delay = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/agentmemory/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 3000);
  }

  throw new Error(`[memory] agentmemory not ready after ${timeoutMs}ms at ${url}`);
}
