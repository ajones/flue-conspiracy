import { defineTool } from '@flue/runtime';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getWorkspaceConfig, isSkillEnabled } from '../config.ts';
import { classifySkills, formatSkillContext } from '../skills/classify.ts';
import { findProjectRoot, resolveAgentWorkspace } from '../workspace/index.ts';

interface SkillEntry {
  name: string;
  description: string;
  dir: string;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const lines = match[1].split('\n');
  const result: Record<string, string> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(' ') || line.startsWith('\t') || !line.includes(':')) {
      i++;
      continue;
    }
    const colonIdx = line.indexOf(':');
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (rawValue === '>') {
      const parts: string[] = [];
      i++;
      while (i < lines.length && (lines[i].startsWith(' ') || lines[i].startsWith('\t'))) {
        parts.push(lines[i].trim());
        i++;
      }
      result[key] = parts.join(' ');
    } else {
      result[key] = rawValue;
      i++;
    }
  }

  return result;
}

function readSkillsDir(dir: string, agentName: string | undefined): SkillEntry[] {
  if (!existsSync(dir)) return [];

  const entries: SkillEntry[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const content = readFileSync(skillFile, 'utf8');
    const fm = parseFrontmatter(content);
    const name = fm['name'] ?? entry.name;
    const description = fm['description'] ?? '';

    if (!isSkillEnabled(name, agentName)) continue;

    entries.push({ name, description, dir: join(dir, entry.name) });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function formatEntries(label: string, entries: SkillEntry[]): string {
  if (entries.length === 0) return `## ${label}\n\n(none)`;
  const lines = entries.map((e) => `- **${e.name}** (${e.dir}): ${e.description}`);
  return `## ${label}\n\n${lines.join('\n')}`;
}

function createSkillsTools(agentName: string) {
  const findSkill = defineTool({
    name: 'skills_find',
    description:
      'Find skills relevant to a query using AI classification. Returns skill file paths to read and apply. Respects per-agent skill config from raven.json5.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The message or task description to find relevant skills for.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(input: Record<string, unknown>) {
      const { query } = input as { query: string };
      const result = await classifySkills(query, { agentName });
      if (result.enabled.length === 0 && result.disabled.length === 0) {
        return `No relevant skills found.\n\nReasoning: ${result.reasoning}`;
      }
      return formatSkillContext(result);
    },
  });

  const listSkills = defineTool({
    name: 'skills_list',
    description:
      'List available skills, filtered by the skills config in raven.json5. Returns project-level and workspace-level skills with their names and descriptions.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async execute(_input: Record<string, unknown>) {
      const projectRoot = findProjectRoot();
      const projectSkillsDir = join(projectRoot, 'skills');
      const projectSkills = readSkillsDir(projectSkillsDir, agentName);

      const wsConfig = getWorkspaceConfig();
      let workspaceSkills: SkillEntry[] = [];
      if (wsConfig.enabled !== false) {
        const agentWorkspace = resolveAgentWorkspace(wsConfig, agentName);
        const wsSkillsDir = join(agentWorkspace, 'skills');
        workspaceSkills = readSkillsDir(wsSkillsDir, agentName);
      }

      return [
        formatEntries('Project Skills', projectSkills),
        formatEntries('Workspace Skills', workspaceSkills),
      ].join('\n\n');
    },
  });

  return [findSkill, listSkills];
}

export { createSkillsTools };
