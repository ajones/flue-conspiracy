import { trace, context as otelContext, SpanStatusCode } from '@opentelemetry/api';
import { dispatch } from '@flue/runtime';
import { computeNextRun } from './cron.ts';
import * as db from './db.ts';
import { runScripts, assemblePrompt } from './scripts.ts';
import type { JobRow } from './types.ts';
import { createLogger } from '../log.ts';
import { trackDispatchContext, untrackDispatchContext } from '../instrumentation.js';
import { trackAgentInstance } from '../agent-names.ts';

const log = createLogger('scheduler');
const tracer = trace.getTracer('raven');

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

    log.info('Started');
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    log.info('Stopped', { inFlight: this.running.size });
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
      log.warn('Recovered stale run', { runId: run.id, job: run.jobName });
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
        log.error('Unhandled error firing job', { job: job.name, error: (err as Error).message ?? String(err) });
      });
    }

    this.scheduleNextWake();
  }

  private async fire(job: JobRow, retryAttempt = 0): Promise<void> {
    await tracer.startActiveSpan('job', {
      attributes: {
        'raven.job.name': job.name,
        'raven.job.id': job.id,
        'raven.job.agent': job.agent,
        'raven.job.target': job.target,
        'raven.service.name': job.name,
        ...(retryAttempt > 0 ? { 'raven.job.retry_attempt': retryAttempt } : {}),
      },
    }, async (jobSpan) => {
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
        log.info('Firing job', { job: job.name, agent: job.agent, target: job.target });

        const prompt = job.promptFile
          ? await tracer.startActiveSpan('promptFile', {
              attributes: {
                'raven.job.prompt_file': job.promptFile,
              },
            }, async (span) => {
              try {
                const proc = Bun.spawn(['markupdown', job.promptFile!], {
                  stdout: 'pipe',
                  stderr: 'pipe',
                });
                const [exitCode, stdout, stderr] = await Promise.all([
                  proc.exited,
                  new Response(proc.stdout).text(),
                  new Response(proc.stderr).text(),
                ]);
                if (exitCode !== 0) {
                  throw new Error(`markupdown failed (exit ${exitCode}): ${stderr.trim()}`);
                }
                const rendered = stdout.trim();
                span.setAttribute('raven.job.prompt_file.length', rendered.length);
                span.setStatus({ code: SpanStatusCode.OK });
                return rendered;
              } catch (err) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
                throw err;
              } finally {
                span.end();
              }
            })
          : job.prompt;

        const scriptResults = await runScripts(job.scripts);
        const assembled = assemblePrompt(prompt, job.resultPreference, scriptResults);

        trackAgentInstance(job.target, job.agent);
        const ctx = otelContext.active();
        const receipt = await dispatch({
          agent: job.agent,
          id: job.target,
          input: {
            type: 'scheduler.job',
            jobName: job.name,
            message: assembled,
          },
        });
        const dispatchId = (receipt as any)?.dispatchId as string | undefined;
        if (dispatchId) trackDispatchContext(dispatchId, ctx);

        db.getDb().prepare(
          'UPDATE raven_job_runs SET assembled_prompt = ?, dispatch_id = ? WHERE id = ?'
        ).run(assembled, (receipt as any)?.dispatchId ?? null, runId);

        db.finishRun(runId, 'ok');
        this.advanceJob(job, 'ok');
        log.info('Job dispatched OK', { job: job.name });
        jobSpan.setStatus({ code: SpanStatusCode.OK });
      } catch (err: any) {
        const msg = err.message ?? String(err);
        db.finishRun(runId, 'error', msg);
        log.error('Job failed', { job: job.name, error: msg });
        jobSpan.setStatus({ code: SpanStatusCode.ERROR, message: msg });
        jobSpan.recordException(msg);

        const errors = job.consecutiveErrors + 1;
        db.updateAfterRun(
          job.id,
          computeNextRun(job.scheduleData),
          Date.now(),
          'error',
          errors,
        );

        if (job.maxRetries > 0 && retryAttempt < job.maxRetries) {
          log.warn('Retrying job', { job: job.name, delayMs: job.retryDelayMs, attempt: retryAttempt + 1, maxRetries: job.maxRetries });
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
        jobSpan.end();
      }
    });
  }

  private advanceJob(job: JobRow, status: string): void {
    const isOneShot = job.scheduleData.kind === 'at' || job.scheduleData.kind === 'relative';

    if (isOneShot && job.deleteAfterRun && status === 'ok') {
      db.deleteJob(job.id);
      log.info('Deleted one-shot job', { job: job.name });
      return;
    }

    if (isOneShot) {
      db.setEnabled(job.id, false);
      db.updateAfterRun(job.id, null, Date.now(), status, 0);
      log.info('Disabled one-shot job', { job: job.name });
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
      log.error('Manual trigger failed', { job: job.name, error: (err as Error).message ?? String(err) });
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
        log.info('Pruned old runs', { count: pruned });
      }
      setTimeout(doPrune, interval);
    };
    setTimeout(doPrune, interval);
  }
}
