import Database, { type Database as DatabaseInstance } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { JobRow, JobRunRow, CreateJobInput, UpdateJobInput, Schedule, ScriptDef } from './types.ts';

const DATA_DIR = resolve(import.meta.dirname, '..', '..', '.data');
const DB_PATH = resolve(DATA_DIR, 'scheduler.db');
let db: DatabaseInstance | null = null;

export function getDb(): DatabaseInstance {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    ensureTables(db);
  }
  return db;
}

function ensureTables(db: DatabaseInstance) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS raven_jobs (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL UNIQUE,
      description       TEXT NOT NULL DEFAULT '',
      enabled           INTEGER NOT NULL DEFAULT 1,
      agent             TEXT NOT NULL,
      prompt            TEXT NOT NULL,
      result_preference TEXT NOT NULL,
      target            TEXT NOT NULL,
      scripts           TEXT NOT NULL DEFAULT '[]',
      schedule_kind     TEXT NOT NULL,
      schedule_data     TEXT NOT NULL,
      delete_after_run  INTEGER NOT NULL DEFAULT 0,
      max_retries       INTEGER NOT NULL DEFAULT 0,
      retry_delay_ms    INTEGER NOT NULL DEFAULT 60000,
      concurrency_key   TEXT,
      tags              TEXT NOT NULL DEFAULT '[]',
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      next_run_at       INTEGER,
      last_run_at       INTEGER,
      last_status       TEXT,
      consecutive_errors INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_raven_jobs_next_run
      ON raven_jobs(next_run_at) WHERE enabled = 1 AND next_run_at IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_raven_jobs_name
      ON raven_jobs(name);

    CREATE TABLE IF NOT EXISTS raven_job_runs (
      id               TEXT PRIMARY KEY,
      job_id           TEXT NOT NULL REFERENCES raven_jobs(id) ON DELETE CASCADE,
      job_name         TEXT NOT NULL,
      status           TEXT NOT NULL,
      started_at       INTEGER NOT NULL,
      finished_at      INTEGER,
      duration_ms      INTEGER,
      dispatch_id      TEXT,
      error_message    TEXT,
      assembled_prompt TEXT,
      next_run_at      INTEGER,
      retry_attempt    INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_raven_job_runs_job
      ON raven_job_runs(job_id, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_raven_job_runs_started
      ON raven_job_runs(started_at DESC);
  `);
}

function rowToJob(row: any): JobRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: !!row.enabled,
    agent: row.agent,
    prompt: row.prompt,
    resultPreference: row.result_preference,
    target: row.target,
    scripts: JSON.parse(row.scripts) as ScriptDef[],
    scheduleKind: row.schedule_kind,
    scheduleData: JSON.parse(row.schedule_data) as Schedule,
    deleteAfterRun: !!row.delete_after_run,
    maxRetries: row.max_retries,
    retryDelayMs: row.retry_delay_ms,
    concurrencyKey: row.concurrency_key,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
    consecutiveErrors: row.consecutive_errors,
  };
}

function rowToRun(row: any): JobRunRow {
  return {
    id: row.id,
    jobId: row.job_id,
    jobName: row.job_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    dispatchId: row.dispatch_id,
    errorMessage: row.error_message,
    assembledPrompt: row.assembled_prompt,
    nextRunAt: row.next_run_at,
    retryAttempt: row.retry_attempt,
  };
}

export function listJobs(filter?: { enabled?: boolean; tag?: string; agent?: string }): JobRow[] {
  const db = getDb();
  let sql = 'SELECT * FROM raven_jobs WHERE 1=1';
  const params: any[] = [];

  if (filter?.enabled !== undefined) {
    sql += ' AND enabled = ?';
    params.push(filter.enabled ? 1 : 0);
  }
  if (filter?.agent) {
    sql += ' AND agent = ?';
    params.push(filter.agent);
  }

  sql += ' ORDER BY name ASC';
  const rows = db.prepare(sql).all(...params);
  let jobs = rows.map(rowToJob);

  if (filter?.tag) {
    jobs = jobs.filter(j => j.tags.includes(filter.tag!));
  }

  return jobs;
}

export function getJob(id: string): JobRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM raven_jobs WHERE id = ?').get(id);
  return row ? rowToJob(row) : null;
}

export function getJobByName(name: string): JobRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM raven_jobs WHERE name = ?').get(name);
  return row ? rowToJob(row) : null;
}

export function resolveJob(idOrName: string): JobRow | null {
  return getJob(idOrName) ?? getJobByName(idOrName);
}

export function createJob(input: CreateJobInput, nextRunAt: number | null): JobRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO raven_jobs (
      id, name, description, enabled, agent, prompt, result_preference, target,
      scripts, schedule_kind, schedule_data, delete_after_run, max_retries,
      retry_delay_ms, concurrency_key, tags, created_at, updated_at, next_run_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.name, input.description, input.enabled ? 1 : 0,
    input.agent, input.prompt, input.resultPreference, input.target,
    JSON.stringify(input.scripts), input.schedule.kind, JSON.stringify(input.schedule),
    input.deleteAfterRun ? 1 : 0, input.maxRetries,
    input.retryDelayMs, input.concurrencyKey ?? null, JSON.stringify(input.tags),
    now, now, nextRunAt,
  );

  return getJob(id)!;
}

export function updateJob(id: string, patch: UpdateJobInput, nextRunAt?: number | null): JobRow | null {
  const db = getDb();
  const existing = getJob(id);
  if (!existing) return null;

  const sets: string[] = ['updated_at = ?'];
  const params: any[] = [Date.now()];

  if (patch.agent !== undefined) { sets.push('agent = ?'); params.push(patch.agent); }
  if (patch.prompt !== undefined) { sets.push('prompt = ?'); params.push(patch.prompt); }
  if (patch.resultPreference !== undefined) { sets.push('result_preference = ?'); params.push(patch.resultPreference); }
  if (patch.target !== undefined) { sets.push('target = ?'); params.push(patch.target); }
  if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description); }
  if (patch.enabled !== undefined) { sets.push('enabled = ?'); params.push(patch.enabled ? 1 : 0); }
  if (patch.scripts !== undefined) { sets.push('scripts = ?'); params.push(JSON.stringify(patch.scripts)); }
  if (patch.deleteAfterRun !== undefined) { sets.push('delete_after_run = ?'); params.push(patch.deleteAfterRun ? 1 : 0); }
  if (patch.maxRetries !== undefined) { sets.push('max_retries = ?'); params.push(patch.maxRetries); }
  if (patch.retryDelayMs !== undefined) { sets.push('retry_delay_ms = ?'); params.push(patch.retryDelayMs); }
  if (patch.concurrencyKey !== undefined) { sets.push('concurrency_key = ?'); params.push(patch.concurrencyKey); }
  if (patch.tags !== undefined) { sets.push('tags = ?'); params.push(JSON.stringify(patch.tags)); }
  if (patch.schedule !== undefined) {
    sets.push('schedule_kind = ?', 'schedule_data = ?');
    params.push(patch.schedule.kind, JSON.stringify(patch.schedule));
  }
  if (nextRunAt !== undefined) {
    sets.push('next_run_at = ?');
    params.push(nextRunAt);
  }

  params.push(id);
  db.prepare(`UPDATE raven_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  return getJob(id);
}

export function deleteJob(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM raven_jobs WHERE id = ?').run(id);
  return result.changes > 0;
}

export function setEnabled(id: string, enabled: boolean): void {
  const db = getDb();
  db.prepare('UPDATE raven_jobs SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, Date.now(), id);
}

export function updateAfterRun(
  id: string,
  nextRunAt: number | null,
  lastRunAt: number,
  lastStatus: string,
  consecutiveErrors: number,
): void {
  const db = getDb();
  db.prepare(`
    UPDATE raven_jobs
    SET next_run_at = ?, last_run_at = ?, last_status = ?,
        consecutive_errors = ?, updated_at = ?
    WHERE id = ?
  `).run(nextRunAt, lastRunAt, lastStatus, consecutiveErrors, Date.now(), id);
}

export function getDueJobs(now: number): JobRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM raven_jobs WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?'
  ).all(now);
  return rows.map(rowToJob);
}

export function getNextWakeTime(): number | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT MIN(next_run_at) as next FROM raven_jobs WHERE enabled = 1 AND next_run_at IS NOT NULL'
  ).get() as any;
  return row?.next ?? null;
}

export function getAllEnabledJobs(): JobRow[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM raven_jobs WHERE enabled = 1').all();
  return rows.map(rowToJob);
}

// --- Run history ---

export function insertRun(run: Omit<JobRunRow, 'finishedAt' | 'durationMs'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO raven_job_runs (
      id, job_id, job_name, status, started_at, dispatch_id,
      error_message, assembled_prompt, next_run_at, retry_attempt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id, run.jobId, run.jobName, run.status, run.startedAt,
    run.dispatchId, run.errorMessage, run.assembledPrompt,
    run.nextRunAt, run.retryAttempt,
  );
}

export function finishRun(runId: string, status: string, errorMessage?: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    UPDATE raven_job_runs
    SET status = ?, finished_at = ?, duration_ms = (? - started_at), error_message = COALESCE(?, error_message)
    WHERE id = ?
  `).run(status, now, now, errorMessage ?? null, runId);
}

export function listRuns(opts?: { jobId?: string; limit?: number; status?: string }): JobRunRow[] {
  const db = getDb();
  let sql = 'SELECT * FROM raven_job_runs WHERE 1=1';
  const params: any[] = [];

  if (opts?.jobId) {
    sql += ' AND job_id = ?';
    params.push(opts.jobId);
  }
  if (opts?.status) {
    sql += ' AND status = ?';
    params.push(opts.status);
  }

  sql += ' ORDER BY started_at DESC LIMIT ?';
  params.push(opts?.limit ?? 50);

  return db.prepare(sql).all(...params).map(rowToRun);
}

export function getStaleRunning(): JobRunRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM raven_job_runs WHERE status = 'running'")
    .all().map(rowToRun);
}

export function pruneRuns(olderThanMs: number): number {
  const db = getDb();
  const cutoff = Date.now() - olderThanMs;
  const result = db.prepare('DELETE FROM raven_job_runs WHERE started_at < ?').run(cutoff);
  return result.changes;
}
