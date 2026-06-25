import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { createLogger } from './log.ts';
import type { VaultEntry } from './config.ts';

const execFileAsync = promisify(execFile);
const log = createLogger('vault-checker');
const tracer = trace.getTracer('raven');

const MAX_RESULTS = 3;
const MAX_QUERY_CHARS = 500;
const QMD_TIMEOUT_MS = 25_000;
const VAULT_LOAD_TIMEOUT_MS = 30_000;
const DEFAULT_MATCH_THRESHOLD = 0.09;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function resolveThreshold(vault: VaultEntry): number {
  if (typeof vault.matchThreshold === 'number' && Number.isFinite(vault.matchThreshold)) {
    return vault.matchThreshold;
  }
  return DEFAULT_MATCH_THRESHOLD;
}

async function runQmd(args: string[]): Promise<string> {
  log.debug('Running qmd', { args });
  const { stdout, stderr } = await execFileAsync('qmd', args, {
    maxBuffer: 1024 * 1024,
    timeout: QMD_TIMEOUT_MS,
  });
  if (stderr?.trim()) {
    log.info('qmd stderr', { stderr: stderr.trim() });
  }
  return stdout;
}

interface QmdResult {
  title?: string;
  file?: string;
  snippet?: string;
  text?: string;
  score?: number;
  explain?: { rrf?: { baseScore?: number; totalScore?: number } };
}

function getScore(result: QmdResult): number | null {
  const base = result.explain?.rrf?.baseScore;
  if (typeof base === 'number') return base;
  const total = result.explain?.rrf?.totalScore;
  if (typeof total === 'number') return total;
  return typeof result.score === 'number' ? result.score : null;
}

function formatResults(results: QmdResult[]): string {
  return results.map((r, i) => {
    const title = r.title ?? r.file ?? `Result ${i + 1}`;
    const file = r.file ?? 'unknown-file';
    const score = getScore(r);
    const scoreStr = typeof score === 'number' ? score.toFixed(3) : 'n/a';
    const snippet = (r.snippet?.trim() ?? r.text?.trim()) || '';
    const lines = [`- [${scoreStr}] ${title}`, `  - file: "${file}"`];
    if (snippet) lines.push(`  - snippet: ${snippet}`);
    return lines.join('\n');
  }).join('\n\n');
}

async function queryVault(
  queryText: string,
  vault: VaultEntry,
): Promise<QmdResult[] | null> {
  const threshold = resolveThreshold(vault);

  const normalized = queryText
    .replace(/\s+/g, ' ')
    .replace(/['"`]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_CHARS);

  if (!normalized) {
    log.info('Skipping query: no usable text');
    return null;
  }

  const args = [
    'query', normalized,
    '-c', vault.collection,
    '-n', String(MAX_RESULTS),
    '--json', '--explain', '--no-rerank',
  ];

  const stdout = await runQmd(args);
  let parsed: QmdResult[];
  try {
    parsed = JSON.parse(stdout);
  } catch {
    log.error('Failed to parse qmd output', { stdout: stdout.slice(0, 500) });
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    log.info('No matches returned', { collection: vault.collection });
    return null;
  }

  const strong = parsed.filter((r) => {
    const score = getScore(r);
    return typeof score === 'number' && score >= threshold;
  });

  if (strong.length === 0) {
    log.info('No matches above threshold', {
      collection: vault.collection,
      total: parsed.length,
      threshold,
    });
    return null;
  }

  return strong;
}

async function loadVaultContextInner(
  queryText: string,
  vaults: VaultEntry[],
  span: { setAttribute(name: string, value: string | number | boolean): void; setStatus(status: { code: SpanStatusCode; message?: string }): void },
): Promise<string | null> {
  if (vaults.length === 0) {
    span.setAttribute('raven.vault.skipped', true);
    span.setStatus({ code: SpanStatusCode.OK });
    return null;
  }

  if (!queryText.trim()) {
    log.info('Skipping: empty query text');
    span.setStatus({ code: SpanStatusCode.OK });
    return null;
  }

  span.setAttribute('raven.vault.collections', vaults.map((v) => v.collection).join(','));
  log.info('Querying vault', { collections: vaults.map((v) => v.collection) });

  const allResults: QmdResult[][] = [];

  for (const vault of vaults) {
    try {
      const results = await queryVault(queryText, vault);
      if (results) allResults.push(results);
    } catch (err) {
      log.error('Query failed', { collection: vault.collection, error: String(err) });
    }
  }

  if (allResults.length === 0) {
    log.info('No vault matches');
    span.setStatus({ code: SpanStatusCode.OK });
    return null;
  }

  const formatted = allResults.map(formatResults).join('\n\n');
  const note = [
    'These documents have a high likelihood of being relevant to the conversation.',
    'Read them before crafting a reply to the user.',
    'The vault is intended to build an ever-increasing, improving, self-referential body of curated knowledge.',
    "If you discover information has changed or you learn new information about this topic,",
    "after completing the user's request offer to update the doc. Only offer this if it is relevant.",
  ].join(' ');

  const block = `<vault-context>\n${note}\n\n${formatted}\n</vault-context>`;
  log.info('Vault matches found', { resultSets: allResults.length, length: block.length });
  span.setAttribute('raven.vault.result_sets', allResults.length);
  span.setAttribute('raven.vault.length', block.length);
  span.setStatus({ code: SpanStatusCode.OK });
  return block;
}

export async function loadVaultContext(
  queryText: string,
  vaults: VaultEntry[],
): Promise<string | null> {
  return tracer.startActiveSpan('vault_checker.load', async (span) => {
    try {
      return await withTimeout(
        loadVaultContextInner(queryText, vaults, span),
        VAULT_LOAD_TIMEOUT_MS,
        'vault_checker.load',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Vault context failed', { error: msg });
      span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
      span.recordException(err instanceof Error ? err : new Error(msg));
      return null;
    } finally {
      span.end();
    }
  });
}
