import { dispatch } from '@flue/runtime';
import { computeNextRun } from './cron.js';
import * as db from './db.js';
import { runScripts, assemblePrompt } from './scripts.js';
import type { JobRow } from './types.js';

export interface SchedulerConfig {
  maxConcurrent: number;
  runRetentionDays: number;
  defaultTimezone: string;
  catchUpMissed: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  maxConcurrent: 5,
  runRetentionDays: 30,
  defaultTimezone: 'America/Los_Angeles',
  catchUpMissed: true,
};

export class Scheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = new Map<string, string>();
  private config: SchedulerConfig;
  private started = false;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    db.getDb();
    this.recoverStaleRuns();
    this.recomputeAllNextRuns();
    this.scheduleNextWake();
    this.schedulePrune();

    console.log('[scheduler] Started');
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    console.log(`[scheduler] Stopped (${this.running.size} jobs still in flight)`);
  }

  reload(): void {
    if (!this.started) return;
    this.recomputeAllNextRuns();
    this.scheduleNextWake();
  }

  private recoverStaleRuns(): void {
    const stale = db.getStaleRunning();
    for (const run of stale) {
      db.finishRun(run.id, 'error', 'Gateway restarted while job was running');
      console.log(`[scheduler] Marked stale run ${run.id} (${run.jobName}) as error`);
    }
  }

  private recomputeAllNextRuns(): void {
    const jobs = db.getAllEnabledJobs();
    const now = new Date();

    for (const job of jobs) {
      const next = computeNextRun(job.scheduleData, now);
      if (next !== job.nextRunAt) {
        db.updateAfterRun(
          job.id,
          next,
          job.lastRunAt ?? job.createdAt,
          job.lastStatus ?? 'ok',
          job.consecutiveErrors,
        );
      }
    }
  }

  private scheduleNextWake(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const next = db.getNextWakeTime();
    if (next === null) return;

    const delay = Math.max(0, next - Date.now());
    this.timer = setTimeout(() => this.wake(), delay);
  }

  private async wake(): Promise<void> {
    this.timer = null;
    if (!this.started) return;

    const now = Date.now();
    const dueJobs = db.getDueJobs(now);

    const available = this.config.maxConcurrent - this.running.size;
    const batch = dueJobs.slice(0, Math.max(0, available));

    for (const job of batch) {
      if (job.concurrencyKey && this.running.has(job.concurrencyKey)) {
        const runId = crypto.randomUUID();
        db.insertRun({
          id: runId,
          jobId: job.id,
          jobName: job.name,
          status: 'skipped',
          startedAt: now,
          dispatchId: null,
          errorMessage: `Skipped: concurrency key "${job.concurrencyKey}" already running`,
          assembledPrompt: null,
          nextRunAt: null,
          retryAttempt: 0,
        });
        db.finishRun(runId, 'skipped');
        this.advanceJob(job, 'skipped');
        continue;
      }

      this.fire(job).catch((err) => {
        console.error(`[scheduler] Unhandled error firing ${job.name}:`, err);
      });
    }

    this.scheduleNextWake();
  }

  private async fire(job: JobRow, retryAttempt = 0): Promise<void> {
    const runId = crypto.randomUUID();
    const now = Date.now();

    if (job.concurrencyKey) {
      this.running.set(job.concurrencyKey, job.id);
    }

    db.insertRun({
      id: runId,
      jobId: job.id,
      jobName: job.name,
      status: 'running',
      startedAt: now,
      dispatchId: null,
      errorMessage: null,
      assembledPrompt: null,
      nextRunAt: null,
      retryAttempt,
    });

    try {
      console.log(`[scheduler] Firing ${job.name} → ${job.agent} @ ${job.target}`);

      const scriptResults = await runScripts(job.scripts);
      const assembled = assemblePrompt(job.prompt, job.resultPreference, scriptResults);

      const receipt = await dispatch({
        agent: job.agent,
        id: job.target,
        input: {
          type: 'scheduler.job',
          jobName: job.name,
          message: assembled,
        },
      });

      db.getDb().prepare(
        'UPDATE piracy_job_runs SET assembled_prompt = ?, dispatch_id = ? WHERE id = ?'
      ).run(assembled, (receipt as any)?.id ?? null, runId);

      db.finishRun(runId, 'ok');
      this.advanceJob(job, 'ok');
      console.log(`[scheduler] ${job.name} dispatched OK`);
    } catch (err: any) {
      const msg = err.message ?? String(err);
      db.finishRun(runId, 'error', msg);
      console.error(`[scheduler] ${job.name} failed:`, msg);

      const errors = job.consecutiveErrors + 1;
      db.updateAfterRun(
        job.id,
        computeNextRun(job.scheduleData),
        Date.now(),
        'error',
        errors,
      );

      if (job.maxRetries > 0 && retryAttempt < job.maxRetries) {
        console.log(`[scheduler] Retrying ${job.name} in ${job.retryDelayMs}ms (attempt ${retryAttempt + 1}/${job.maxRetries})`);
        setTimeout(() => {
          const fresh = db.getJob(job.id);
          if (fresh && fresh.enabled) {
            this.fire(fresh, retryAttempt + 1);
          }
        }, job.retryDelayMs);
      }
    } finally {
      if (job.concurrencyKey) {
        this.running.delete(job.concurrencyKey);
      }
    }
  }

  private advanceJob(job: JobRow, status: string): void {
    const isOneShot = job.scheduleData.kind === 'at' || job.scheduleData.kind === 'relative';

    if (isOneShot && job.deleteAfterRun && status === 'ok') {
      db.deleteJob(job.id);
      console.log(`[scheduler] Deleted one-shot job ${job.name}`);
      return;
    }

    if (isOneShot) {
      db.setEnabled(job.id, false);
      db.updateAfterRun(job.id, null, Date.now(), status, 0);
      console.log(`[scheduler] Disabled one-shot job ${job.name}`);
      return;
    }

    const next = computeNextRun(job.scheduleData);
    db.updateAfterRun(
      job.id,
      next,
      Date.now(),
      status,
      status === 'ok' ? 0 : job.consecutiveErrors,
    );
  }

  async triggerManual(jobId: string): Promise<string> {
    const job = db.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    this.fire(job).catch((err) => {
      console.error(`[scheduler] Manual trigger of ${job.name} failed:`, err);
    });

    return job.name;
  }

  private schedulePrune(): void {
    const interval = 6 * 60 * 60 * 1000;
    const doPrune = () => {
      if (!this.started) return;
      const cutoff = this.config.runRetentionDays * 24 * 60 * 60 * 1000;
      const pruned = db.pruneRuns(cutoff);
      if (pruned > 0) {
        console.log(`[scheduler] Pruned ${pruned} old run records`);
      }
      setTimeout(doPrune, interval);
    };
    setTimeout(doPrune, interval);
  }
}
