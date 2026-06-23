import { defineTool } from '@flue/runtime';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { createLogger } from '../log.ts';

const log = createLogger('ical-reader');

const SKILL_DIR = join(process.cwd(), 'skills', 'ical-reader');

function runBun(script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('bun', ['run', script, ...args], { cwd: SKILL_DIR, timeout: 60_000 }, (err, stdout, stderr) => {
      if (err) {
        log.error('ical script failed', { script, error: err.message, stderr });
        return reject(new Error(`ical-reader error (${script}): ${err.message}`));
      }
      resolve(stdout.trim());
    });
  });
}

const syncCalendars = defineTool({
  name: 'ical_sync',
  description: 'Fetch and cache iCal feeds. Syncs all calendars by default, or specify calendar names to sync selectively.',
  parameters: {
    type: 'object',
    properties: {
      calendars: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of calendar names to sync. Omit to sync all.',
      },
    },
    additionalProperties: false,
  },
  async execute({ calendars }: { calendars?: string[] }) {
    log.info('ical_sync', { calendars: calendars ?? 'all' });
    const args: string[] = [];
    if (calendars) {
      for (const name of calendars) {
        args.push('--calendar', name);
      }
    }
    const result = await runBun('ical-sync', args);
    log.info('ical_sync done');
    return result;
  },
});

const queryEvents = defineTool({
  name: 'ical_query',
  description: 'Query calendar events. Modes: --range (date range), --fuzzy-range (range + text search), --next (upcoming window), --last (most recent match). Times are returned in the timezone specified by tz_convert (defaults to America/Los_Angeles).',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['range', 'fuzzy-range', 'next', 'last'],
        description: 'Query mode',
      },
      from: {
        type: 'string',
        description: 'Start date/time ISO or YYYY-MM-DD (for range/fuzzy-range)',
      },
      to: {
        type: 'string',
        description: 'End date/time ISO or YYYY-MM-DD (for range/fuzzy-range)',
      },
      next_days: {
        type: 'number',
        description: 'Number of days ahead (for --next mode)',
      },
      time_range: {
        type: 'string',
        enum: ['today', 'tomorrow', 'this_week'],
        description: 'Named time range (for --next mode, alternative to next_days)',
      },
      query: {
        type: 'string',
        description: 'Fuzzy text search across summary, location, description',
      },
      calendars: {
        type: 'array',
        items: { type: 'string' },
        description: 'Restrict to specific calendar names',
      },
      limit: {
        type: 'number',
        description: 'Max events to return',
      },
      all_day: {
        type: 'boolean',
        description: 'Filter to all-day (true) or timed (false) events only',
      },
      sort: {
        type: 'string',
        enum: ['start_asc', 'start_desc'],
        description: 'Sort order (default: start_asc)',
      },
      tz_convert: {
        type: 'string',
        description: 'IANA timezone for output (default: America/Los_Angeles)',
      },
    },
    required: ['mode'],
    additionalProperties: false,
  },
  async execute({ mode, from, to, next_days, time_range, query, calendars, limit, all_day, sort, tz_convert }: {
    mode: string;
    from?: string;
    to?: string;
    next_days?: number;
    time_range?: string;
    query?: string;
    calendars?: string[];
    limit?: number;
    all_day?: boolean;
    sort?: string;
    tz_convert?: string;
  }) {
    log.info('ical_query', { mode, from, to, next_days, time_range, query });
    const args = [`--${mode}`];
    if (from) args.push('--from', from);
    if (to) args.push('--to', to);
    if (next_days !== undefined) args.push('--next-days', String(next_days));
    if (time_range) args.push('--time-range', time_range);
    if (query) args.push('--query', query);
    if (calendars) {
      for (const name of calendars) {
        args.push('--calendar', name);
      }
    }
    if (limit !== undefined) args.push('--limit', String(limit));
    if (all_day !== undefined) args.push('--all-day', String(all_day));
    if (sort) args.push('--sort', sort);
    args.push('--tz-convert', tz_convert ?? 'America/Los_Angeles');
    const result = await runBun('ical-query', args);
    log.info('ical_query done', { mode });
    return result;
  },
});

const addCalendar = defineTool({
  name: 'ical_add',
  description: 'Register a new iCal feed by its secret URL. The URL is stored securely and never returned.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Secret iCal URL',
      },
      name: {
        type: 'string',
        description: 'Unique human-friendly calendar name',
      },
      details: {
        type: 'string',
        description: 'Optional metadata (free text or JSON)',
      },
    },
    required: ['url', 'name'],
    additionalProperties: false,
  },
  async execute({ url, name, details }: { url: string; name: string; details?: string }) {
    log.info('ical_add', { name });
    const args = ['--url', url, '--name', name];
    if (details) args.push('--details', details);
    const result = await runBun('ical-add', args);
    log.info('ical_add done', { name });
    return result;
  },
});

export const icalReaderTools = [syncCalendars, queryEvents, addCalendar];
