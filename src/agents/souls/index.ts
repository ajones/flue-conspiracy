import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const soulsDir = dirname(fileURLToPath(import.meta.url));
const cache = new Map<string, string | null>();

export function loadSoul(name: string): string | null {
  if (cache.has(name)) return cache.get(name)!;
  const path = join(soulsDir, `${name}.md`);
  if (!existsSync(path)) {
    cache.set(name, null);
    return null;
  }
  const content = readFileSync(path, 'utf8');
  cache.set(name, content);
  return content;
}

export function withSoul(name: string, operations: string): string {
  const soul = loadSoul(name);
  if (!soul) return operations;
  return `${soul}\n\n---\n\n${operations}`;
}
