import { relative, isAbsolute } from 'node:path';
import { findProjectRoot } from './workspace/index.ts';

const RM_PATH_RE = /\brm\s+(?:(?:-[a-zA-Z]+\s+)*)(\S+)/g;

const projectRoot = findProjectRoot();

function shortenPath(p: string): string {
  return isAbsolute(p) ? relative(projectRoot, p) : p;
}

export function extractRmPaths(command: string): string[] {
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  RM_PATH_RE.lastIndex = 0;
  while ((m = RM_PATH_RE.exec(command)) !== null) {
    const p = m[1];
    if (p && !p.startsWith('-')) paths.push(p);
  }
  return paths;
}

export function formatFileAudit(ops: Map<string, 'M' | 'D'>): string {
  if (ops.size === 0) return '';
  return [...ops.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, label]) => `${label} ${shortenPath(file)}`)
    .join('\n');
}
