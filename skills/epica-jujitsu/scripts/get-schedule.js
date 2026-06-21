#!/usr/bin/env node
/**
 * Fetch the BJJ class schedule for a student (Cody or Leo) from the gymdesk portal,
 * including booking status for each class.
 *
 * Usage:
 *   node get-schedule.js --state-file /tmp/epica-cody-session.json [--weeks-ahead 0]
 *
 * --weeks-ahead: how many weeks forward from the current week to read (0 = this week).
 * Exits 0 on success, 1 on failure (e.g. expired session -> state file is deleted).
 *
 * Output:
 *   { "ok": true, "classes": [ { title, date, time, eventId, bookable, booked, bookingId, canCancel } ] }
 */

const { chromium } = require('playwright');
const fs = require('fs');

const SCHEDULE_URL = 'https://epicajiujitsu.gymdesk.com/members/schedule?bookable_only=1';

async function main() {
  const stateFile = getArg('--state-file');
  const weeksAhead = parseInt(getArg('--weeks-ahead') || '0', 10);

  if (!stateFile || !fs.existsSync(stateFile)) {
    out({ ok: false, error: 'state file missing; run login.js first' });
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: stateFile });
  const page = await context.newPage();

  try {
    await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    if (page.url().includes('/login')) {
      fs.unlinkSync(stateFile);
      out({ ok: false, error: 'session expired; state file removed, re-run login.js' });
      process.exit(1);
    }

    for (let i = 0; i < weeksAhead; i++) {
      await page.click('a.next');
      await page.waitForTimeout(1500);
    }

    const classes = await page.$$eval('[data-test-id="schedule-event"]', els => els.map(el => {
      const info = JSON.parse(el.getAttribute('data-event-info'));
      return {
        title: info.title.trim(),
        date: info.date,
        time: info.ts ? info.ts.split(' ')[1] : null,
        eventId: el.getAttribute('data-event-id'),
        bookable: !!info.bookable,
        booked: !!info.mine,
        bookingId: info.mine || null,
        canCancel: !!info.can_cancel,
      };
    }));

    out({ ok: true, classes });
  } catch (e) {
    out({ ok: false, error: e.message });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

main();
