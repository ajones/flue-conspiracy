import { mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { WorkspaceConfig } from '../config.js';
import { createLogger } from '../log.js';

const log = createLogger('workspace');

const DEFAULT_DIR = '.workspace';
export const SYSTEM_FILES = ['IDENTITY.md', 'AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md'] as const;

const DEFAULT_TZ = 'America/Los_Angeles';

export interface WorkspaceContextOptions {
  includeLongTermMemory?: boolean;
  tz?: string;
}

export interface LoadedWorkspaceFile {
  path: string;
  content: string;
}

export interface WorkspaceContextResult {
  loaded: LoadedWorkspaceFile[];
  missing: string[];
}

function localDateInTz(daysAgo: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  const d = Number(parts.find((p) => p.type === 'day')!.value);
  return new Date(Date.UTC(y, m - 1, d - daysAgo)).toISOString().slice(0, 10);
}

function readIfExists(workspacePath: string, relPath: string, loaded: LoadedWorkspaceFile[], missing: string[]): void {
  const filePath = join(workspacePath, relPath);
  if (existsSync(filePath)) {
    loaded.push({ path: relPath, content: readFileSync(filePath, 'utf8') });
  } else {
    missing.push(relPath);
  }
}

export function loadWorkspaceContext(workspacePath: string, options: WorkspaceContextOptions = {}): WorkspaceContextResult {
  const tz = options.tz ?? DEFAULT_TZ;
  const loaded: LoadedWorkspaceFile[] = [];
  const missing: string[] = [];

  for (const filename of SYSTEM_FILES) {
    readIfExists(workspacePath, filename, loaded, missing);
  }

  for (let daysAgo = 0; daysAgo < 2; daysAgo++) {
    readIfExists(workspacePath, `memory/${localDateInTz(daysAgo, tz)}.md`, loaded, missing);
  }

  if (options.includeLongTermMemory) {
    readIfExists(workspacePath, 'MEMORY.md', loaded, missing);
  }

  return { loaded, missing };
}

export function formatWorkspaceContext(result: WorkspaceContextResult): string {
  if (result.loaded.length === 0) {
    const skipped = result.missing.length > 0 ? ` Skipped (not found): ${result.missing.join(', ')}.` : '';
    return `_No workspace context files found.${skipped}_`;
  }

  const sections = result.loaded.map(({ path, content }) => `# ${path}\n\n${content}`);
  let out = sections.join('\n\n---\n\n');
  if (result.missing.length > 0) {
    out += `\n\n---\n\n_Skipped (not found): ${result.missing.join(', ')}_`;
  }
  return out;
}

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
  const result = loadWorkspaceContext(workspacePath);
  if (result.loaded.length === 0) return null;
  return result.loaded.map(({ content }) => content).join('\n\n---\n\n');
}

export function withWorkspaceContext(workspacePath: string | undefined, operations: string): string {
  if (!workspacePath) return operations;
  const ctx = loadWorkspaceSystemContext(workspacePath);
  if (!ctx) return operations;
  return `${ctx}\n\n---\n\n${operations}`;
}
