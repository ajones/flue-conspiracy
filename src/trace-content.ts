import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { findProjectRoot } from './workspace/index.ts';

const TRACE_CONTENT_REL = join('.data', 'trace-content');

export function getTraceContentDir(): string {
  return join(findProjectRoot(), TRACE_CONTENT_REL);
}

export const ATTR_MAX_LENGTH = 16_000;
export const SPILL_SUFFIX = '.spill';

export const LARGE_ATTRS = new Set([
  'flue.turn.input', 'flue.turn.output',
  'flue.task.prompt', 'flue.task.result',
  'flue.tool.arguments', 'flue.tool.result',
  'flue.operation.result', 'flue.workflow.payload', 'flue.workflow.result',
]);

export function spillAttrKey(attr: string): string {
  return `${attr}${SPILL_SUFFIX}`;
}

function traceContentRelPath(traceId: string, spanId: string, attr: string): string {
  return join(TRACE_CONTENT_REL, traceId, spanId, `${attr}.txt`);
}

export function resolveTraceContentPath(path: string): string {
  return isAbsolute(path) ? path : join(findProjectRoot(), path);
}

export function spillTraceContent(traceId: string, spanId: string, attr: string, content: string): string {
  const relPath = traceContentRelPath(traceId, spanId, attr);
  const absPath = resolveTraceContentPath(relPath);
  mkdirSync(join(getTraceContentDir(), traceId, spanId), { recursive: true });
  writeFileSync(absPath, content, 'utf-8');
  return relPath;
}

export function readTraceContent(path: string): string | null {
  for (const candidate of [resolveTraceContentPath(path), path]) {
    try {
      return readFileSync(candidate, 'utf-8');
    } catch {
      // try next candidate (supports legacy absolute paths)
    }
  }
  return null;
}

export function compactLargeAttributes(
  traceId: string,
  spanId: string,
  attrs: Record<string, unknown>,
): { attrs: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const out: Record<string, unknown> = { ...attrs };

  for (const [k, v] of Object.entries(attrs)) {
    if (!LARGE_ATTRS.has(k) || typeof v !== 'string' || v.length <= ATTR_MAX_LENGTH) continue;

    const spillPath = spillTraceContent(traceId, spanId, k, v);
    out[k] = `${v.slice(0, ATTR_MAX_LENGTH)}... [truncated ${v.length - ATTR_MAX_LENGTH} chars; full content at ${spillPath}]`;
    out[spillAttrKey(k)] = spillPath;
    changed = true;
  }

  return { attrs: changed ? out : attrs, changed };
}

export function pruneTraceContent(retentionDays: number): void {
  const dir = getTraceContentDir();
  if (!existsSync(dir)) return;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const traceId of readdirSync(dir)) {
    const traceDir = join(dir, traceId);
    try {
      if (statSync(traceDir).mtimeMs < cutoff) {
        rmSync(traceDir, { recursive: true, force: true });
      }
    } catch {
      // ignore races with concurrent writes
    }
  }
}
