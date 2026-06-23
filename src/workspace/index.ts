import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WorkspaceConfig } from '../config.js';
import { createLogger } from '../log.js';

const log = createLogger('workspace');

const DEFAULT_DIR = '.workspace';

function getRoot(config: WorkspaceConfig): string {
  const rel = config.dir ?? DEFAULT_DIR;
  return resolve(import.meta.dirname, '..', '..', rel);
}

function initWorkspace(root: string): void {
  mkdirSync(root, { recursive: true });
  log.info('Initialized workspace', { root });
}

export function resolveWorkspace(config: WorkspaceConfig): string {
  const root = getRoot(config);
  if (!existsSync(root)) {
    initWorkspace(root);
  }
  return root;
}

export function resolveAgentWorkspace(config: WorkspaceConfig, agentName: string): string {
  const root = resolveWorkspace(config);
  const agentDir = join(root, agentName);
  if (!existsSync(agentDir)) {
    initWorkspace(agentDir);
  }
  return agentDir;
}

export function listWorkspaceContents(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }) as string[];
}
