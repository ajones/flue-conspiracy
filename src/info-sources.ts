import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { getWorkspaceConfig } from './config.ts';
import { resolveAgentWorkspace } from './workspace/index.ts';
import { createLogger } from './log.ts';

const log = createLogger('info-sources');
const tracer = trace.getTracer('raven');

const INFO_SOURCES_FILE = 'LOCATIONS.md';
const DEFAULT_BLOCK_NAME = 'info-sources';

const DEFAULT_LOCATIONS_MD = `---
version: 0.0.1
purpose: >
  Describes where different kinds of information live in this workspace,
  how those sources should be treated, and what role each plays. Injected
  into agent context before each dispatch.
body_format: >
  List information sources one per section using plain prose or bullet points.
  Separate logical groups with --- dividers. Each entry should describe what
  kind of information lives there and how the model should access or treat it.
block_name: info-sources
wrap: true
---
`;

interface FrontMatter {
  meta: Record<string, string | boolean>;
  body: string;
}

export function parseFrontMatter(content: string): FrontMatter {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const body = match[2].trim();
  const meta: Record<string, string | boolean> = {};
  const lines = match[1].split('\n');
  let i = 0;

  while (i < lines.length) {
    const keyMatch = lines[i].match(/^(\w+):\s*(.*)/);
    if (keyMatch) {
      const [, key, rest] = keyMatch;
      const scalar = rest.trim();
      if (scalar === '>' || scalar === '|') {
        const chunks: string[] = [];
        i++;
        while (i < lines.length && (lines[i].startsWith('  ') || lines[i] === '')) {
          chunks.push(lines[i].trimStart());
          i++;
        }
        meta[key] = scalar === '|' ? chunks.join('\n') : chunks.join(' ').trim();
        continue;
      } else if (scalar === 'true') {
        meta[key] = true;
      } else if (scalar === 'false') {
        meta[key] = false;
      } else {
        meta[key] = scalar;
      }
    }
    i++;
  }

  return { meta, body };
}

function buildBlock(content: string, blockName: string): string {
  return `<${blockName}>\n${content}\n</${blockName}>`;
}

export async function loadInfoSources(agentName: string): Promise<string | null> {
  return tracer.startActiveSpan('info_sources.load', async (span) => {
    try {
      const wsConfig = getWorkspaceConfig();
      if (wsConfig.enabled === false) {
        span.setAttribute('raven.info_sources.skipped', true);
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
      }

      const workspaceDir = resolveAgentWorkspace(wsConfig, agentName);
      const filePath = join(workspaceDir, INFO_SOURCES_FILE);
      span.setAttribute('raven.info_sources.path', filePath);

      let content: string;
      try {
        content = await readFile(filePath, 'utf8');
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          log.info('LOCATIONS.md not found — creating default', { dir: workspaceDir });
          await writeFile(filePath, DEFAULT_LOCATIONS_MD, 'utf8');
          span.addEvent('info_sources.created_default');
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
      }

      const trimmed = content.trim();
      if (trimmed.length === 0) {
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
      }

      const { meta, body } = parseFrontMatter(trimmed);
      if (!body) {
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
      }

      const wrap = meta.wrap !== false;
      if (!wrap) {
        log.debug('Injecting info sources (unwrapped)');
        span.setAttribute('raven.info_sources.length', body.length);
        span.setAttribute('raven.info_sources.wrapped', false);
        span.setStatus({ code: SpanStatusCode.OK });
        return body;
      }

      const blockName = typeof meta.block_name === 'string' ? meta.block_name : DEFAULT_BLOCK_NAME;
      const block = buildBlock(body, blockName);
      log.debug('Injecting info sources', { blockName, length: block.length });
      span.setAttribute('raven.info_sources.length', block.length);
      span.setAttribute('raven.info_sources.wrapped', true);
      span.setAttribute('raven.info_sources.block_name', blockName);
      span.setStatus({ code: SpanStatusCode.OK });
      return block;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}
