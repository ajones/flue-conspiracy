import { computeNextRun, isWeekend, dateInTz, nextDayAt } from '../cron.ts';

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean) {
  if (cond) { console.log(`✅  ${label}`); passed++; }
  else       { console.log(`❌  ${label}`); failed++; }
}

function approxEq(a: number, b: number, toleranceMs = 5000): boolean {
  return Math.abs(a - b) < toleranceMs;
}

// ---------------------------------------------------------------------------
// isWeekend
// ---------------------------------------------------------------------------

console.log('--- isWeekend ---');
// Jan 4 2026 = Sunday, Jan 3 = Saturday, Jan 5 = Monday
ok('Sunday → true',  isWeekend(new Date('2026-01-04T12:00:00Z')));
ok('Saturday → true', isWeekend(new Date('2026-01-03T12:00:00Z')));
ok('Monday → false', !isWeekend(new Date('2026-01-05T12:00:00Z')));
ok('Friday → false', !isWeekend(new Date('2026-01-09T12:00:00Z')));

// ---------------------------------------------------------------------------
// dateInTz — returns a Date whose "UTC" fields reflect the local wall clock
// ---------------------------------------------------------------------------

console.log('\n--- dateInTz ---');
{
  // 2026-01-05T20:00:00Z is 12:00 PM PST (UTC-8)
  const utc = new Date('2026-01-05T20:00:00Z');
  const local = dateInTz(utc, 'America/Los_Angeles');
  ok('LA hour is 12', local.getHours() === 12);
  ok('LA date is Jan 5', local.getDate() === 5);
}
{
  // 2026-01-05T04:00:00Z is 8:00 PM PST previous day? No — 4am UTC = 8pm PST Jan 4
  const utc = new Date('2026-01-05T04:00:00Z');
  const local = dateInTz(utc, 'America/Los_Angeles');
  ok('LA hour is 20 (8pm)', local.getHours() === 20);
  ok('LA date is Jan 4', local.getDate() === 4);
}

// ---------------------------------------------------------------------------
// nextDayAt (tz-aware path)
// ---------------------------------------------------------------------------

console.log('\n--- nextDayAt (with tz) ---');
const TZ = 'America/Los_Angeles';
{
  // from = 2026-01-05T20:00:00Z = 12:00 noon PST
  // timeOfDay = '14:00' → 2pm PST today, offset = +2h → 2026-01-05T22:00:00Z
  const from = new Date('2026-01-05T20:00:00Z');
  const result = nextDayAt(from, '14:00', TZ);
  ok('14:00 is 2h ahead → same day', approxEq(result.getTime(), new Date('2026-01-05T22:00:00Z').getTime()));
}
{
  // from = 2026-01-05T20:00:00Z = 12:00 noon PST
  // timeOfDay = '09:00' → 9am PST, already past → advance to tomorrow 9am = +21h
  const from = new Date('2026-01-05T20:00:00Z');
  const result = nextDayAt(from, '09:00', TZ);
  ok('09:00 already past → next day', approxEq(result.getTime(), new Date('2026-01-06T17:00:00Z').getTime()));
}

// ---------------------------------------------------------------------------
// computeNextRun — 'at'
// ---------------------------------------------------------------------------

console.log('\n--- computeNextRun: at ---');
{
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const result = computeNextRun({ kind: 'at', at: future });
  ok('future at → returns timestamp', result !== null && result > Date.now());
}
{
  const past = new Date(Date.now() - 3_600_000).toISOString();
  const result = computeNextRun({ kind: 'at', at: past });
  ok('past at → null', result === null);
}

// ---------------------------------------------------------------------------
// computeNextRun — 'relative'
// ---------------------------------------------------------------------------

console.log('\n--- computeNextRun: relative ---');
{
  const after = new Date('2026-06-01T12:00:00Z');
  const delay = 300_000; // 5 minutes
  const result = computeNextRun({ kind: 'relative', delayMs: delay }, after);
  ok('relative → now + delay', result === after.getTime() + delay);
}

// ---------------------------------------------------------------------------
// computeNextRun — 'every'
// ---------------------------------------------------------------------------

console.log('\n--- computeNextRun: every ---');
{
  const anchor = new Date('2026-01-01T00:00:00Z').getTime();
  const interval = 3_600_000; // 1 hour
  // after = anchor + 90 min → next is anchor + 2h
  const after = new Date(anchor + 90 * 60 * 1000);
  const result = computeNextRun({ kind: 'every', everyMs: interval, anchorMs: anchor }, after);
  ok('every: picks next interval boundary', result === anchor + 2 * interval);
}
{
  // anchor in the future → returns anchor directly
  const anchor = new Date(Date.now() + 3_600_000).getTime();
  const result = computeNextRun({ kind: 'every', everyMs: 60_000, anchorMs: anchor });
  ok('every: future anchor → returns anchor', result === anchor);
}

// ---------------------------------------------------------------------------
// computeNextRun — 'cron'
// ---------------------------------------------------------------------------

console.log('\n--- computeNextRun: cron ---');
{
  // "0 9 * * *" at 07:00 → next fire is 09:00 same day
  const after = new Date('2026-01-05T07:00:00-08:00'); // 7am PST
  const result = computeNextRun(
    { kind: 'cron', expr: '0 9 * * *', tz: 'America/Los_Angeles' },
    after,
  );
  const expected = new Date('2026-01-05T09:00:00-08:00').getTime();
  ok('cron: next 9am same day', result === expected);
}
{
  // "0 9 * * *" at 10:00 → next fire is 09:00 next day
  const after = new Date('2026-01-05T10:00:00-08:00'); // 10am PST
  const result = computeNextRun(
    { kind: 'cron', expr: '0 9 * * *', tz: 'America/Los_Angeles' },
    after,
  );
  const expected = new Date('2026-01-06T09:00:00-08:00').getTime();
  ok('cron: already past 9am → next day', result === expected);
}

// ---------------------------------------------------------------------------
// computeNextRun — 'weekday' (Mon–Fri, skips weekend)
// ---------------------------------------------------------------------------

console.log('\n--- computeNextRun: weekday ---');
{
  // Sat Jan 3 2026 9am PST → first weekday is Mon Jan 5 at 07:00 PST
  const after = new Date('2026-01-03T17:00:00Z'); // 9am PST
  const result = computeNextRun(
    { kind: 'weekday', timeOfDay: '07:00', tz: TZ },
    after,
  );
  const expected = new Date('2026-01-05T15:00:00Z').getTime(); // Mon 7am PST = 15:00 UTC
  ok('weekday: skips Sat+Sun, lands Mon', result === expected);
}
{
  // Mon Jan 5 2026 7am PST, timeOfDay 09:00 → same day at 9am PST
  const after = new Date('2026-01-05T15:00:00Z'); // 7am PST
  const result = computeNextRun(
    { kind: 'weekday', timeOfDay: '09:00', tz: TZ },
    after,
  );
  const expected = new Date('2026-01-05T17:00:00Z').getTime(); // 9am PST = 17:00 UTC
  ok('weekday: same day when time is ahead', result === expected);
}
{
  // Specific days: only ['wed'], from Mon Jan 5 → next is Wed Jan 7 at 9am PST
  const after = new Date('2026-01-05T15:00:00Z'); // Mon 7am PST
  const result = computeNextRun(
    { kind: 'weekday', days: ['wed'], timeOfDay: '09:00', tz: TZ },
    after,
  );
  const expected = new Date('2026-01-07T17:00:00Z').getTime(); // Wed 9am PST
  ok('weekday: specific day list skips to Wed', result === expected);
}
{
  // skipHolidays: Jan 1 2026 is a federal holiday; from Dec 31 2025 → should land Jan 2
  // Jan 2 is a Friday (Jan 1 Thu, Dec 31 Wed)
  const after = new Date('2025-12-31T19:00:00Z'); // Dec 31 11am PST
  const result = computeNextRun(
    { kind: 'weekday', timeOfDay: '09:00', tz: TZ, skipHolidays: true },
    after,
  );
  const expected = new Date('2026-01-02T17:00:00Z').getTime(); // Fri Jan 2 9am PST
  ok('weekday: skipHolidays skips Jan 1', result === expected);
}

// ---------------------------------------------------------------------------

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
