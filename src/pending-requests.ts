import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { getWorkspaceConfig } from './config.ts';
import { resolveWorkspace } from './workspace/index.ts';
import { parseFrontMatter } from './info-sources.ts';
import { createLogger } from './log.ts';

const log = createLogger('pending-requests');
const tracer = trace.getTracer('raven');

const PENDING_REQUESTS_FILE = 'PENDING_AGENT_REQUESTS.md';
const BLOCK_NAME = 'pending-agent-requests';

function stripTitle(content: string): string {
  return content.replace(/^#[^\n]*\n?/, '');
}

function buildBlock(content: string): string {
  const instructions = [
    'The following are in-progress requests you have to the user. Their reply may be in response to one of these — if so, use its instructions to complete the request and then remove it from the file.',
    'Your goal should be to complete these requests. If a request is not getting fulfilled, nudge the user.',
    'IMPORTANT: You must never deflect or ignore a new inbound request just because pending requests exist. It is perfectly fine — and expected — to have multiple open requests at the same time. Always handle new requests fully, in addition to any pending ones.',
    '',
    content,
  ].join('\n');
  return `<${BLOCK_NAME}>\n${instructions}\n</${BLOCK_NAME}>`;
}

export async function loadPendingRequests(): Promise<string | null> {
  return tracer.startActiveSpan('pending_requests.load', async (span) => {
    try {
      const wsConfig = getWorkspaceConfig();
      if (wsConfig.enabled === false) {
        span.setAttribute('raven.pending_requests.skipped', true);
        span.setAttribute('raven.pending_requests.skip_reason', 'workspace_disabled');
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
      }

      const workspaceDir = resolveWorkspace(wsConfig);
      const filePath = join(workspaceDir, PENDING_REQUESTS_FILE);
      span.setAttribute('raven.pending_requests.file', filePath);

      let content: string;
      try {
        content = await readFile(filePath, 'utf8');
      } catch {
        span.setAttribute('raven.pending_requests.found', false);
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
      }

      const { body } = parseFrontMatter(content);
      const trimmed = stripTitle(body).trim();
      if (!trimmed) {
        span.setAttribute('raven.pending_requests.found', true);
        span.setAttribute('raven.pending_requests.empty', true);
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
      }

      span.setAttribute('raven.pending_requests.found', true);
      span.setAttribute('raven.pending_requests.empty', false);
      span.setAttribute('raven.pending_requests.length', trimmed.length);
      span.setStatus({ code: SpanStatusCode.OK });

      log.debug('Loaded pending requests', { length: trimmed.length });
      return buildBlock(trimmed);
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}
