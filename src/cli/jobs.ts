import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { getGatewayUrl } from '../config.ts';

const USAGE = `raven jobs — manage scheduled jobs

Commands:
  raven jobs list              List all jobs
  raven jobs schedule          Show day-view schedule timeline (TUI)
  raven jobs create <file>     Create a job from a JSON file (or - for stdin)
  raven jobs show <name>       Show job details + recent runs
  raven jobs enable <name>     Enable a job
  raven jobs disable <name>    Disable a job
  raven jobs delete <name>     Delete a job
  raven jobs trigger <name>    Trigger a manual run
  raven jobs history [name]    Show execution history

Flags:
  --enabled         Only show enabled jobs (list)
  --disabled        Only show disabled jobs (list)
  --json            Output raw JSON (all commands)
  -n <count>        Number of results (history, default: 20)
`;

async function api(path: string, opts?: RequestInit) {
  const base = getGatewayUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/api${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts?.headers },
    });
  } catch {
    console.error(`Gateway is not running at ${base}. Start it with: raven start`);
    process.exit(1);
  }
  const body = await res.json();
  if (!res.ok) {
    console.error(`Error ${res.status}:`, body.error ?? body);
    process.exit(1);
  }
  return body;
}

function json(data: any): void {
  console.log(JSON.stringify(data));
}

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSchedule(job: any): string {
  const s = job.scheduleData;
  switch (s.kind) {
    case 'cron': return `cron: ${s.expr}`;
    case 'every': {
      const mins = s.everyMs / 60_000;
      if (mins < 60) return `every ${mins}m`;
      const hrs = mins / 60;
      if (hrs < 24) return `every ${hrs}h`;
      return `every ${hrs / 24}d`;
    }
    case 'at': return `at: ${formatDate(new Date(s.at).getTime())}`;
    case 'weekday': {
      if (s.days) return `weekday: ${s.days.join(',')} @ ${s.timeOfDay}`;
      return `every ${s.everyNDays ?? 1} biz day(s) @ ${s.timeOfDay}`;
    }
    default: return s.kind;
  }
}

async function list(args: string[], asJson: boolean) {
  const { values } = parseArgs({
    args,
    options: {
      enabled: { type: 'boolean' },
      disabled: { type: 'boolean' },
    },
    strict: false,
  });

  let query = '';
  if (values.enabled) query = '?enabled=true';
  else if (values.disabled) query = '?enabled=false';

  const jobs = await api(`/jobs${query}`);

  if (asJson) return json({ jobs });

  if (jobs.length === 0) {
    console.log('No jobs found.');
    return;
  }

  const nameW = Math.max(4, ...jobs.map((j: any) => j.name.length));
  const agentW = Math.max(5, ...jobs.map((j: any) => j.agent.length));

  console.log(
    'EN'.padEnd(3) +
    'NAME'.padEnd(nameW + 2) +
    'AGENT'.padEnd(agentW + 2) +
    'SCHEDULE'.padEnd(28) +
    'NEXT RUN'.padEnd(20) +
    'LAST'
  );

  for (const job of jobs) {
    const en = job.enabled ? '\x1b[32m●\x1b[0m ' : '\x1b[90m○\x1b[0m ';
    console.log(
      en +
      job.name.padEnd(nameW + 2) +
      job.agent.padEnd(agentW + 2) +
      formatSchedule(job).padEnd(28) +
      formatDate(job.nextRunAt).padEnd(20) +
      (job.lastStatus ?? '—')
    );
  }

  console.log(`\n${jobs.length} job(s)`);
}

async function show(name: string, asJson: boolean) {
  const job = await api(`/jobs/${name}`);
  const runs = await api(`/jobs/${name}/runs?limit=5`);

  if (asJson) return json({ job, runs });

  console.log(`\x1b[1m${job.name}\x1b[0m`);
  console.log(`  Agent:       ${job.agent}`);
  console.log(`  Target:      ${job.target}`);
  console.log(`  Enabled:     ${job.enabled}`);
  console.log(`  Schedule:    ${formatSchedule(job)}`);
  console.log(`  Next run:    ${formatDate(job.nextRunAt)}`);
  console.log(`  Last run:    ${formatDate(job.lastRunAt)} (${job.lastStatus ?? '—'})`);
  console.log(`  Errors:      ${job.consecutiveErrors}`);
  if (job.promptFile) console.log(`  Prompt file: ${job.promptFile}`);
  if (job.description) console.log(`  Description: ${job.description}`);
  if (job.tags.length) console.log(`  Tags:        ${job.tags.join(', ')}`);
  if (job.scripts.length) {
    console.log(`  Scripts:     ${job.scripts.length}`);
    for (const s of job.scripts) {
      console.log(`    - ${s.key}: ${s.description} (${s.injection})`);
    }
  }

  console.log(`\n  Prompt:\n    ${job.prompt.split('\n').join('\n    ')}`);
  console.log(`\n  Result Preference:\n    ${job.resultPreference.split('\n').join('\n    ')}`);

  if (runs.length > 0) {
    console.log(`\n  Recent runs:`);
    for (const run of runs) {
      const dur = run.durationMs ? `${run.durationMs}ms` : '...';
      const err = run.errorMessage ? ` — ${run.errorMessage}` : '';
      console.log(`    ${formatDate(run.startedAt)}  ${run.status.padEnd(8)} ${dur}${err}`);
    }
  }
}

async function enable(name: string, asJson: boolean) {
  const result = await api(`/jobs/${name}/enable`, { method: 'POST' });
  if (asJson) return json(result);
  console.log(`Enabled ${result.name}. Next run: ${formatDate(result.nextRunAt)}`);
}

async function disable(name: string, asJson: boolean) {
  const result = await api(`/jobs/${name}/disable`, { method: 'POST' });
  if (asJson) return json(result);
  console.log(`Disabled ${result.name}.`);
}

async function deleteJob(name: string, asJson: boolean) {
  const result = await api(`/jobs/${name}`, { method: 'DELETE' });
  if (asJson) return json(result);
  console.log(`Deleted ${result.name}.`);
}

async function trigger(name: string, asJson: boolean) {
  const result = await api(`/jobs/${name}/trigger`, { method: 'POST' });
  if (asJson) return json(result);
  console.log(`Triggered ${result.name}.`);
}

async function create(args: string[], asJson: boolean) {
  const file = args[0];
  if (!file) { console.error('Usage: raven jobs create <file.json>  (or - for stdin)'); process.exit(1); }

  let raw: string;
  if (file === '-') {
    raw = await Bun.stdin.text();
  } else {
    raw = readFileSync(file, 'utf-8');
  }

  const body = JSON.parse(raw);

  // Try gateway first, fall back to direct DB access
  const base = getGatewayUrl();
  try {
    const res = await fetch(`${base}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) {
      console.error(`Error ${res.status}:`, result.error ?? result);
      process.exit(1);
    }
    if (asJson) return json(result);
    console.log(`Created job "${result.name}". Next run: ${formatDate(result.nextRunAt)}`);
    return;
  } catch {
    // Gateway not running — write directly to DB
  }

  const { safeParse, flatten } = await import('valibot');
  const { CreateJobInput } = await import('../scheduler/types.ts');
  const { computeNextRun } = await import('../scheduler/cron.ts');
  const db = await import('../scheduler/db.ts');

  const parsed = safeParse(CreateJobInput, body);
  if (!parsed.success) {
    console.error('Validation failed:', flatten(parsed.issues));
    process.exit(1);
  }

  const input = parsed.output;
  if (db.getJobByName(input.name)) {
    console.error(`Job "${input.name}" already exists.`);
    process.exit(1);
  }

  let schedule = input.schedule;
  if (schedule.kind === 'relative') {
    schedule = { kind: 'at', at: new Date(Date.now() + schedule.delayMs).toISOString() };
  }
  const nextRunAt = input.enabled ? computeNextRun(schedule) : null;
  const job = db.createJob({ ...input, schedule }, nextRunAt);

  if (asJson) return json(job);
  console.log(`Created job "${job.name}". Next run: ${formatDate(job.nextRunAt)}`);
}

async function history(args: string[], asJson: boolean) {
  const { positionals, values } = parseArgs({
    args,
    options: { n: { type: 'string', short: 'n' } },
    allowPositionals: true,
    strict: false,
  });

  const name = positionals[0];
  const limit = values.n ? Number(values.n) : 20;

  let runs;
  if (name) {
    runs = await api(`/jobs/${name}/runs?limit=${limit}`);
  } else {
    runs = await api(`/job-runs?limit=${limit}`);
  }

  if (asJson) return json(runs);

  if (runs.length === 0) {
    console.log('No run history.');
    return;
  }

  const nameW = Math.max(4, ...runs.map((r: any) => r.jobName.length));

  console.log(
    'JOB'.padEnd(nameW + 2) +
    'STATUS'.padEnd(10) +
    'STARTED'.padEnd(20) +
    'DURATION'.padEnd(12) +
    'ERROR'
  );

  for (const run of runs) {
    const dur = run.durationMs != null ? `${run.durationMs}ms` : '—';
    const err = run.errorMessage ? run.errorMessage.slice(0, 60) : '';
    console.log(
      run.jobName.padEnd(nameW + 2) +
      run.status.padEnd(10) +
      formatDate(run.startedAt).padEnd(20) +
      dur.padEnd(12) +
      err
    );
  }
}

export async function jobs(args: string[]) {
  const jsonIdx = args.indexOf('--json');
  const asJson = jsonIdx !== -1;
  const cleanArgs = asJson ? [...args.slice(0, jsonIdx), ...args.slice(jsonIdx + 1)] : args;

  const [sub, ...rest] = cleanArgs;

  if (!sub || sub === 'help' || sub === '--help') {
    console.log(USAGE);
    return;
  }

  if (sub === 'list' || sub === 'ls') return list(rest, asJson);
  if (sub === 'schedule') {
    const { jobsScheduleTui } = await import('./jobs-schedule-tui.ts');
    return jobsScheduleTui();
  }
  if (sub === 'create') return create(rest, asJson);
  if (sub === 'show') {
    if (!rest[0]) { console.error('Usage: raven jobs show <name>'); process.exit(1); }
    return show(rest[0], asJson);
  }
  if (sub === 'enable') {
    if (!rest[0]) { console.error('Usage: raven jobs enable <name>'); process.exit(1); }
    return enable(rest[0], asJson);
  }
  if (sub === 'disable') {
    if (!rest[0]) { console.error('Usage: raven jobs disable <name>'); process.exit(1); }
    return disable(rest[0], asJson);
  }
  if (sub === 'delete' || sub === 'rm') {
    if (!rest[0]) { console.error('Usage: raven jobs delete <name>'); process.exit(1); }
    return deleteJob(rest[0], asJson);
  }
  if (sub === 'trigger' || sub === 'run') {
    if (!rest[0]) { console.error('Usage: raven jobs trigger <name>'); process.exit(1); }
    return trigger(rest[0], asJson);
  }
  if (sub === 'history' || sub === 'hist') return history(rest, asJson);

  console.error(`Unknown jobs command: ${sub}\n`);
  console.log(USAGE);
  process.exit(1);
}
