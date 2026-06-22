import { Hono } from 'hono';
import * as v from 'valibot';
import { CreateJobInput, UpdateJobInput } from './types.ts';
import { computeNextRun } from './cron.ts';
import * as db from './db.ts';
import type { Scheduler } from './engine.ts';

export function createJobRoutes(scheduler: Scheduler): Hono {
  const app = new Hono();

  app.get('/jobs', (c) => {
    const enabled = c.req.query('enabled');
    const tag = c.req.query('tag');
    const agent = c.req.query('agent');

    const filter: { enabled?: boolean; tag?: string; agent?: string } = {};
    if (enabled === 'true') filter.enabled = true;
    if (enabled === 'false') filter.enabled = false;
    if (tag) filter.tag = tag;
    if (agent) filter.agent = agent;

    return c.json(db.listJobs(Object.keys(filter).length > 0 ? filter : undefined));
  });

  app.post('/jobs', async (c) => {
    const body = await c.req.json();
    const result = v.safeParse(CreateJobInput, body);
    if (!result.success) {
      return c.json({ error: 'Validation failed', issues: v.flatten(result.issues) }, 400);
    }

    const input = result.output;

    if (db.getJobByName(input.name)) {
      return c.json({ error: `Job "${input.name}" already exists` }, 409);
    }

    let schedule = input.schedule;
    if (schedule.kind === 'relative') {
      schedule = { kind: 'at', at: new Date(Date.now() + schedule.delayMs).toISOString() };
    }
    const nextRunAt = input.enabled ? computeNextRun(schedule) : null;
    const resolvedInput = { ...input, schedule };

    const job = db.createJob(resolvedInput, nextRunAt);
    scheduler.reload();

    return c.json(job, 201);
  });

  app.get('/jobs/:idOrName', (c) => {
    const job = db.resolveJob(c.req.param('idOrName'));
    if (!job) return c.json({ error: 'Not found' }, 404);
    return c.json(job);
  });

  app.put('/jobs/:idOrName', async (c) => {
    const job = db.resolveJob(c.req.param('idOrName'));
    if (!job) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json();
    const result = v.safeParse(UpdateJobInput, body);
    if (!result.success) {
      return c.json({ error: 'Validation failed', issues: v.flatten(result.issues) }, 400);
    }

    const patch = result.output;
    let nextRunAt: number | null | undefined;

    if (patch.schedule || patch.enabled !== undefined) {
      const scheduleData = patch.schedule ?? job.scheduleData;
      const enabled = patch.enabled ?? job.enabled;
      nextRunAt = enabled ? computeNextRun(scheduleData) : null;
    }

    const updated = db.updateJob(job.id, patch, nextRunAt);
    scheduler.reload();

    return c.json(updated);
  });

  app.delete('/jobs/:idOrName', (c) => {
    const job = db.resolveJob(c.req.param('idOrName'));
    if (!job) return c.json({ error: 'Not found' }, 404);

    db.deleteJob(job.id);
    scheduler.reload();

    return c.json({ deleted: true, name: job.name });
  });

  app.post('/jobs/:idOrName/enable', (c) => {
    const job = db.resolveJob(c.req.param('idOrName'));
    if (!job) return c.json({ error: 'Not found' }, 404);

    db.setEnabled(job.id, true);
    const nextRunAt = computeNextRun(job.scheduleData);
    db.updateAfterRun(job.id, nextRunAt, job.lastRunAt ?? job.createdAt, job.lastStatus ?? 'ok', job.consecutiveErrors);
    scheduler.reload();

    return c.json({ enabled: true, name: job.name, nextRunAt });
  });

  app.post('/jobs/:idOrName/disable', (c) => {
    const job = db.resolveJob(c.req.param('idOrName'));
    if (!job) return c.json({ error: 'Not found' }, 404);

    db.setEnabled(job.id, false);
    db.updateAfterRun(job.id, null, job.lastRunAt ?? job.createdAt, job.lastStatus ?? 'ok', job.consecutiveErrors);
    scheduler.reload();

    return c.json({ enabled: false, name: job.name });
  });

  app.post('/jobs/:idOrName/trigger', async (c) => {
    const job = db.resolveJob(c.req.param('idOrName'));
    if (!job) return c.json({ error: 'Not found' }, 404);

    const name = await scheduler.triggerManual(job.id);
    return c.json({ triggered: true, name });
  });

  app.get('/jobs/:idOrName/runs', (c) => {
    const job = db.resolveJob(c.req.param('idOrName'));
    if (!job) return c.json({ error: 'Not found' }, 404);

    const limit = Number(c.req.query('limit') ?? '20');
    const status = c.req.query('status');
    return c.json(db.listRuns({ jobId: job.id, limit, status: status ?? undefined }));
  });

  app.get('/job-runs', (c) => {
    const limit = Number(c.req.query('limit') ?? '50');
    const status = c.req.query('status');
    return c.json(db.listRuns({ limit, status: status ?? undefined }));
  });

  return app;
}
