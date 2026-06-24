import * as v from 'valibot';

// --- Schedule types ---

export const CronSchedule = v.object({
  kind: v.literal('cron'),
  expr: v.string(),
  tz: v.optional(v.string()),
});

export const EverySchedule = v.object({
  kind: v.literal('every'),
  everyMs: v.pipe(v.number(), v.minValue(1000)),
  anchorMs: v.optional(v.number()),
});

export const AtSchedule = v.object({
  kind: v.literal('at'),
  at: v.string(),
});

export const RelativeSchedule = v.object({
  kind: v.literal('relative'),
  delayMs: v.pipe(v.number(), v.minValue(1000)),
});

const DayOfWeek = v.picklist(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const WeekdaySchedule = v.object({
  kind: v.literal('weekday'),
  days: v.optional(v.array(DayOfWeek)),
  everyNDays: v.optional(v.pipe(v.number(), v.minValue(1))),
  timeOfDay: v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/)),
  tz: v.optional(v.string()),
  skipHolidays: v.optional(v.boolean()),
});

export const Schedule = v.variant('kind', [
  CronSchedule,
  EverySchedule,
  AtSchedule,
  RelativeSchedule,
  WeekdaySchedule,
]);

export type Schedule = v.InferOutput<typeof Schedule>;

// --- Pre-flight scripts ---

export const ScriptDef = v.object({
  key: v.pipe(v.string(), v.minLength(1)),
  description: v.string(),
  command: v.pipe(v.string(), v.minLength(1)),
  timeout: v.pipe(v.number(), v.minValue(1000), v.maxValue(300_000)),
  injection: v.picklist(['before', 'after']),
  failureMessage: v.string(),
});

export type ScriptDef = v.InferOutput<typeof ScriptDef>;

// --- Context gathering config ---

export const ContextConfig = v.object({
  vault: v.optional(v.boolean(), false),
  infoSources: v.optional(v.boolean(), false),
  pendingRequests: v.optional(v.boolean(), false),
  memory: v.optional(v.boolean(), false),
});

export type ContextConfig = v.InferOutput<typeof ContextConfig>;

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  vault: false,
  infoSources: false,
  pendingRequests: false,
  memory: false,
};

// --- Job creation input ---

export const CreateJobInput = v.pipe(
  v.object({
    name: v.pipe(v.string(), v.minLength(1), v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)),
    agent: v.pipe(v.string(), v.minLength(1)),
    prompt: v.optional(v.string(), ''),
    promptFile: v.optional(v.string()),
    resultPreference: v.pipe(v.string(), v.minLength(1)),
    target: v.pipe(v.string(), v.minLength(1)),
    schedule: Schedule,
    description: v.optional(v.string(), ''),
    enabled: v.optional(v.boolean(), true),
    scripts: v.optional(v.array(ScriptDef), []),
    deleteAfterRun: v.optional(v.boolean(), false),
    maxRetries: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
    retryDelayMs: v.optional(v.pipe(v.number(), v.minValue(1000)), 60_000),
    concurrencyKey: v.optional(v.string()),
    maxConcurrency: v.optional(v.pipe(v.number(), v.minValue(1)), 1),
    runTimeoutMs: v.optional(v.pipe(v.number(), v.minValue(5000)), 600_000),
    tags: v.optional(v.array(v.string()), []),
    context: v.optional(ContextConfig),
  }),
  v.check(
    (input) => !!(input.prompt || input.promptFile),
    'Either prompt or promptFile must be provided',
  ),
);

export type CreateJobInput = v.InferOutput<typeof CreateJobInput>;

// --- Job update input (all optional) ---

export const UpdateJobInput = v.object({
  agent: v.optional(v.pipe(v.string(), v.minLength(1))),
  prompt: v.optional(v.string()),
  promptFile: v.optional(v.nullable(v.string())),
  resultPreference: v.optional(v.pipe(v.string(), v.minLength(1))),
  target: v.optional(v.pipe(v.string(), v.minLength(1))),
  schedule: v.optional(Schedule),
  description: v.optional(v.string()),
  enabled: v.optional(v.boolean()),
  scripts: v.optional(v.array(ScriptDef)),
  deleteAfterRun: v.optional(v.boolean()),
  maxRetries: v.optional(v.pipe(v.number(), v.minValue(0))),
  retryDelayMs: v.optional(v.pipe(v.number(), v.minValue(1000))),
  concurrencyKey: v.optional(v.nullable(v.string())),
  maxConcurrency: v.optional(v.pipe(v.number(), v.minValue(1))),
  runTimeoutMs: v.optional(v.pipe(v.number(), v.minValue(5000))),
  tags: v.optional(v.array(v.string())),
  context: v.optional(v.nullable(ContextConfig)),
});

export type UpdateJobInput = v.InferOutput<typeof UpdateJobInput>;

// --- Database row types ---

export interface JobRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  agent: string;
  prompt: string;
  promptFile: string | null;
  resultPreference: string;
  target: string;
  scripts: ScriptDef[];
  scheduleKind: string;
  scheduleData: Schedule;
  deleteAfterRun: boolean;
  maxRetries: number;
  retryDelayMs: number;
  concurrencyKey: string | null;
  maxConcurrency: number;
  runTimeoutMs: number;
  contextConfig: ContextConfig;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastStatus: string | null;
  consecutiveErrors: number;
}

export interface JobRunRow {
  id: string;
  jobId: string;
  jobName: string;
  status: 'running' | 'ok' | 'error' | 'skipped' | 'retrying';
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  dispatchId: string | null;
  errorMessage: string | null;
  assembledPrompt: string | null;
  nextRunAt: number | null;
  retryAttempt: number;
}

// --- Script execution result ---

export interface ScriptResult {
  key: string;
  description: string;
  injection: 'before' | 'after';
  ok: boolean;
  output: string;
  failureMessage: string;
}
