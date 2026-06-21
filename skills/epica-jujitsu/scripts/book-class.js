#!/usr/bin/env node
/**
 * Book a BJJ class for a student on the gymdesk portal.
 *
 * Usage:
 *   node book-class.js --state-file /tmp/epica-cody-session.json --student cody --date 2026-06-15 [--weeks-ahead 0]
 *
 * --student: cody or leo - determines which class title is allowed:
 *   cody -> "Little Kids BJJ (ages 3-5)"
 *   leo  -> "Big Kids BJJ (ages 6-8)"
 * --date: YYYY-MM-DD of the class to book (must be in the displayed week; use --weeks-ahead to navigate forward)
 *
 * Exits 0 on success, 1 on failure.
 * Output: { "ok": true, "booked": true, "title": "...", "date": "..." }
 */

const { chromium } = require('playwright');
const fs = require('fs');

const SCHEDULE_URL = 'https://epicajiujitsu.gymdesk.com/members/schedule?bookable_only=1';

const STUDENT_CLASS_TITLES = {
  cody: 'Little Kids BJJ',
  leo: 'Big Kids BJJ',
};

async function main() {
  const stateFile = getArg('--state-file');
  const student = (getArg('--student') || '').toLowerCase();
  const date = getArg('--date');
  const weeksAhead = parseInt(getArg('--weeks-ahead') || '0', 10);

  if (!stateFile || !fs.existsSync(stateFile)) {
    out({ ok: false, error: 'state file missing; run login.js first' });
    process.exit(1);
  }
  const titleMatch = STUDENT_CLASS_TITLES[student];
  if (!titleMatch) {
    out({ ok: false, error: 'Pass --student cody or --student leo' });
    process.exit(1);
  }
  if (!date) {
    out({ ok: false, error: 'Pass --date YYYY-MM-DD' });
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

    const target = await findEvent(page, titleMatch, date);
    if (!target) {
      out({ ok: false, error: `No "${titleMatch}" class found on ${date}` });
      process.exit(1);
    }
    if (target.booked) {
      out({ ok: true, booked: true, alreadyBooked: true, title: target.title, date: target.date });
      return;
    }
    if (!target.bookable) {
      out({ ok: false, error: `Class on ${date} is not bookable` });
      process.exit(1);
    }

    // open the detail panel for this event and click "Book"
    await page.click(`[data-test-id="schedule-event"][data-event-id="${target.eventId}"][attr-date="${date}"]`);
    await page.waitForTimeout(1500);
    await page.$eval(
      '[data-test-id="schedule-event-details"] .details:visible .buttons a.button.book:not(.waitlist)',
      e => e.click()
    );
    await page.waitForTimeout(1500);

    // step 1 of the modal: "Continue"
    await page.$eval(
      '[data-test-id="schedule-book-modal"] .step.details .buttons a.button.next-step',
      e => e.click()
    );
    await page.waitForTimeout(1500);

    // step 2: "Confirm"
    await page.$eval(
      '[data-test-id="schedule-book-modal"] button[type="submit"]',
      e => e.click()
    );
    await page.waitForTimeout(3000);

    const confirmed = await page.$eval('[data-test-id="schedule-book-modal"]', el =>
      el.classList.contains('done') || !!el.querySelector('.booking-done')?.offsetParent
    ).catch(() => false);

    out({ ok: true, booked: true, title: target.title, date: target.date, confirmed });
  } catch (e) {
    out({ ok: false, error: e.message });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

async function findEvent(page, titleMatch, date) {
  const events = await page.$$eval('[data-test-id="schedule-event"]', els => els.map(el => {
    const info = JSON.parse(el.getAttribute('data-event-info'));
    return {
      title: info.title.trim(),
      date: info.date,
      eventId: el.getAttribute('data-event-id'),
      bookable: !!info.bookable,
      booked: !!info.mine,
    };
  }));
  return events.find(e => e.date === date && e.title.includes(titleMatch));
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

main();
