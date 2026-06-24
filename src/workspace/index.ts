import { mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { WorkspaceConfig } from '../config.js';
import { createLogger } from '../log.js';

const log = createLogger('workspace');

const DEFAULT_DIR = '.workspace';
const SYSTEM_FILES = ['IDENTITY.md', 'AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md'] as const;

export function findProjectRoot(): string {
  let dir = import.meta.dirname;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  return import.meta.dirname;
}

function getRoot(config: WorkspaceConfig): string {
  const rel = config.dir ?? DEFAULT_DIR;
  return resolve(findProjectRoot(), rel);
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

export function loadWorkspaceSystemContext(workspacePath: string): string | null {
  const parts: string[] = [];
  for (const filename of SYSTEM_FILES) {
    const filePath = join(workspacePath, filename);
    if (existsSync(filePath)) {
      parts.push(readFileSync(filePath, 'utf8'));
    }
  }
  if (parts.length === 0) return null;
  return parts.join('\n\n---\n\n');
}

export function withWorkspaceContext(workspacePath: string | undefined, operations: string): string {
  if (!workspacePath) return operations;
  const ctx = loadWorkspaceSystemContext(workspacePath);
  if (!ctx) return operations;
  return `${ctx}\n\n---\n\n${operations}`;
}
