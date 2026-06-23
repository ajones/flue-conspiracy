import type { ChildProcess } from 'node:child_process';
import type { MemoryConfig } from '../config.js';
import { spawnAgentMemory, waitForReady } from './process.js';
import { createLogger } from '../log.js';

export { recallMemory, saveMemory } from './tools.js';

const log = createLogger('memory');

let child: ChildProcess | null = null;
let ready = false;

function cleanup() {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
  }
}

export async function initMemory(config: MemoryConfig): Promise<void> {
  const url = config.url ?? 'http://localhost:3111';

  try {
    const res = await fetch(`${url}/agentmemory/health`);
    if (res.ok) {
      ready = true;
      log.info('Ready (existing instance)', { url });
      return;
    }
  } catch {
    // no existing instance, spawn one
  }

  log.info('Starting agentmemory...');
  child = spawnAgentMemory(config);

  process.on('exit', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  try {
    await waitForReady(config);
    ready = true;
    log.info('Ready');
  } catch (err) {
    log.error('Failed to start', { error: String(err) });
    child.kill('SIGTERM');
    child = null;
  }
}

export function isMemoryAvailable(): boolean {
  return ready && (child === null || child.exitCode === null);
}
