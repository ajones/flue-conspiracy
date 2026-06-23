import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../log.ts';

const log = createLogger('skills');

export interface DiscoveredSkill {
  name: string;
  description: string;
  body: string;
  directory: string;
  skillMdPath: string;
}

const SKILLS_ROOT = join(process.cwd(), 'skills');

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.replace(/^﻿/, '').match(
    /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/,
  );
  if (!match) return { meta: {}, body: raw.trim() };

  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const val = line.slice(sep + 1).trim();
    if (key) meta[key] = val;
  }
  return { meta, body: (match[2] ?? '').trim() };
}

function walk(dir: string, prefix: string[]): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    const segments = [...prefix, entry];
    const candidates = [join(full, 'SKILL.md'), join(full, 'skill.md')];

    for (const skillMdPath of candidates) {
      try {
        const raw = readFileSync(skillMdPath, 'utf8');
        const { meta, body } = parseFrontmatter(raw);
        skills.push({
          name: segments.join(':'),
          description: meta.description ?? '',
          body,
          directory: full,
          skillMdPath,
        });
        break;
      } catch {
        // try next candidate
      }
    }

    skills.push(...walk(full, segments));
  }

  return skills;
}

let cached: Map<string, DiscoveredSkill> | null = null;

export function loadSkills(): Map<string, DiscoveredSkill> {
  if (cached) return cached;
  const list = walk(SKILLS_ROOT, []);
  cached = new Map(list.map((s) => [s.name, s]));
  log.info('Discovered skills', { count: list.length, skills: list.map((s) => s.name) });
  return cached;
}

export function getSkillDefinitions(): { name: string; description: string }[] {
  return [...loadSkills().values()].map((s) => ({
    name: s.name,
    description: s.description,
  }));
}
