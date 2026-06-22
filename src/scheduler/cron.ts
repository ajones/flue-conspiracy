import { CronExpressionParser } from 'cron-parser';
import type { Schedule } from './types.js';

const US_FEDERAL_HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-10-12',
  '2026-11-11', '2026-11-26', '2026-12-25',
];

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function isHoliday(date: Date): boolean {
  const iso = date.toISOString().slice(0, 10);
  return US_FEDERAL_HOLIDAYS_2026.includes(iso);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function dateInTz(date: Date, tz: string): Date {
  const s = date.toLocaleString('en-US', { timeZone: tz });
  return new Date(s);
}

function nextDayAt(from: Date, timeOfDay: string, tz?: string): Date {
  const [hh, mm] = timeOfDay.split(':').map(Number);
  const target = new Date(from);
  target.setHours(hh, mm, 0, 0);

  if (tz) {
    const localNow = dateInTz(from, tz);
    const localTarget = new Date(localNow);
    localTarget.setHours(hh, mm, 0, 0);
    if (localTarget <= localNow) {
      localTarget.setDate(localTarget.getDate() + 1);
    }
    const offset = localTarget.getTime() - localNow.getTime();
    return new Date(from.getTime() + offset);
  }

  if (target <= from) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

export function computeNextRun(schedule: Schedule, after?: Date): number | null {
  const now = after ?? new Date();

  switch (schedule.kind) {
    case 'cron': {
      const expr = CronExpressionParser.parse(schedule.expr, {
        currentDate: now,
        tz: schedule.tz,
      });
      return expr.next().toDate().getTime();
    }

    case 'every': {
      const anchor = schedule.anchorMs ?? now.getTime();
      const elapsed = now.getTime() - anchor;
      if (elapsed < 0) return anchor;
      const periods = Math.ceil(elapsed / schedule.everyMs);
      let next = anchor + periods * schedule.everyMs;
      if (next <= now.getTime()) {
        next = anchor + (periods + 1) * schedule.everyMs;
      }
      return next;
    }

    case 'at': {
      const t = new Date(schedule.at).getTime();
      return t > now.getTime() ? t : null;
    }

    case 'relative': {
      return now.getTime() + schedule.delayMs;
    }

    case 'weekday': {
      const tz = schedule.tz;
      let candidate = nextDayAt(now, schedule.timeOfDay, tz);

      for (let i = 0; i < 400; i++) {
        const local = tz ? dateInTz(candidate, tz) : candidate;
        const dayName = DAY_NAMES[local.getDay()];

        if (schedule.days) {
          if (!schedule.days.includes(dayName as any)) {
            candidate = new Date(candidate.getTime() + 86_400_000);
            continue;
          }
        } else {
          if (isWeekend(local)) {
            candidate = new Date(candidate.getTime() + 86_400_000);
            continue;
          }
        }

        if (schedule.skipHolidays && isHoliday(local)) {
          candidate = new Date(candidate.getTime() + 86_400_000);
          continue;
        }

        if (schedule.everyNDays && schedule.everyNDays > 1) {
          const base = after ?? new Date();
          const daysSince = Math.floor((candidate.getTime() - base.getTime()) / 86_400_000);
          if (daysSince > 0 && daysSince % schedule.everyNDays !== 0) {
            candidate = new Date(candidate.getTime() + 86_400_000);
            continue;
          }
        }

        return candidate.getTime();
      }

      return null;
    }
  }
}
