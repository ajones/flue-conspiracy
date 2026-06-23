import { isatty } from 'node:tty';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const envLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const threshold = LEVELS[envLevel as Level] ?? LEVELS.info;
const jsonMode = process.env.LOG_FORMAT === 'json';
const color = !jsonMode && isatty(1);

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const LEVEL_STYLE: Record<Level, { badge: string; color: string }> = {
  debug: { badge: 'DBG', color: '\x1b[36m' },
  info:  { badge: 'INF', color: '\x1b[32m' },
  warn:  { badge: 'WRN', color: '\x1b[33m' },
  error: { badge: 'ERR', color: '\x1b[31m' },
};

function ts(): string {
  return new Date().toISOString();
}

function formatPlain(level: Level, scope: string, msg: string, extra?: Record<string, unknown>): string {
  const { badge, color: c } = LEVEL_STYLE[level];
  const time = ts();
  if (color) {
    const extraStr = extra ? ` ${DIM}${JSON.stringify(extra)}${RESET}` : '';
    return `${DIM}${time}${RESET} ${c}${badge}${RESET} ${BOLD}${scope}${RESET} ${msg}${extraStr}`;
  }
  const extraStr = extra ? ` ${JSON.stringify(extra)}` : '';
  return `${time} ${badge} ${scope} ${msg}${extraStr}`;
}

function formatJson(level: Level, scope: string, msg: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ time: ts(), level, scope, msg, ...extra });
}

const fmt = jsonMode ? formatJson : formatPlain;

function emit(level: Level, scope: string, msg: string, extra?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;
  const line = fmt(level, scope, msg, extra);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  child(sub: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, extra) => emit('debug', scope, msg, extra),
    info:  (msg, extra) => emit('info', scope, msg, extra),
    warn:  (msg, extra) => emit('warn', scope, msg, extra),
    error: (msg, extra) => emit('error', scope, msg, extra),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}

export const log = createLogger('raven');
