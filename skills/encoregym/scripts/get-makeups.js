#!/usr/bin/env node
/**
 * Fetch absences eligible for makeup + available makeup slots from Encore Gym.
 *
 * Usage:
 *   ENCOREGYM_EMAIL=... ENCOREGYM_PASSWORD=... node get-makeups.js [--state-file /tmp/encoregym-session.json]
 *
 * Outputs JSON: { ok: true, makeups: [...], availableSlots: [...] } or { ok: false, error: "..." }
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ABSENCES_URL = 'https://app.jackrabbitclass.com/jr4.0/ParentPortal/Absences?OrgID=500004';

async function main() {
  const stateFile = getArg('--state-file') || '/tmp/encoregym-session.json';

  if (!fs.existsSync(stateFile)) {
    login(stateFile);
  }

  let result;
  try {
    result = await fetchMakeups(stateFile);
  } catch (e) {
    if (e.message === 'SESSION_EXPIRED') {
      fs.unlinkSync(stateFile);
      login(stateFile);
      result = await fetchMakeups(stateFile);
    } else {
      throw e;
    }
  }

  out(result);
}

function login(stateFile) {
  const loginScript = path.join(__dirname, 'login.js');
  const result = JSON.parse(
    execSync(`node "${loginScript}" --state-file "${stateFile}"`, { env: process.env }).toString()
  );
  if (!result.ok) { out(result); process.exit(1); }
}

async function fetchMakeups(stateFile) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: stateFile });
  const page = await context.newPage();

  try {
    const absencesPromise = page.waitForResponse(
      res => res.url().includes('GetAbsences'), { timeout: 15000 }
    );
    absencesPromise.catch(() => {}); // avoid unhandled rejection if we bail before awaiting

    await page.goto(ABSENCES_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (page.url().includes('Login')) {
      throw new Error('SESSION_EXPIRED');
    }

    const absencesRes = await absencesPromise;
    const absencesData = await absencesRes.json();
    if (!absencesData.success) {
      out({ ok: false, error: 'GetAbsences returned success=false' });
      process.exit(1);
    }

    const absences = absencesData.pastAbsences?.absences ?? [];
    const eligible = absences.filter(a => a.eligibleForMakeup && !a.madeUp);

    // Click the first "Schedule Makeup" button to trigger GetAvailableMakeups
    let availableSlots = [];
    if (eligible.length > 0) {
      const slotsPromise = page.waitForResponse(
        res => res.url().includes('GetAvailableMakeups'), { timeout: 10000 }
      );
      await page.locator('.link-schedule-makeup').first().click();
      const slotsRes = await slotsPromise;
      const slotsData = await slotsRes.json();
      availableSlots = (slotsData.availableMakeups ?? []).map(s => ({
        className: s.className.trim(),
        dateTime: s.dateTime,
        date: s.meetDate?.slice(0, 10),
        startTime: s.startTime,
        openings: s.openings,
        location: s.classLocation,
        classId: s.classId,
      }));
    }

    return {
      ok: true,
      orgAllowsMakeups: absencesData.pastAbsences?.orgAllowsMakeups ?? false,
      makeups: eligible.map(a => ({
        attendanceId: a.attendanceId,
        student: a.student?.name,
        missedClass: a.missedClassName,
        missedDate: a.date?.slice(0, 10),
        makeupExpiresDate: a.makeupExpirationDate?.slice(0, 10),
        makeupScheduled: a.makeupClassName ?? null,
      })),
      availableSlots,
    };
  } catch (e) {
    if (e.message === 'SESSION_EXPIRED') throw e;
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

function out(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); }

main();
