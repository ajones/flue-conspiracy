#!/usr/bin/env node
/**
 * Fetch class schedule from the Encore Gym parent portal.
 *
 * Usage:
 *   ENCOREGYM_EMAIL=... ENCOREGYM_PASSWORD=... node get-schedule.js [--state-file /tmp/encoregym-session.json]
 *
 * Outputs JSON: { ok: true, schedules: [...] } or { ok: false, error: "..." }
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DASHBOARD_URL = 'https://app.jackrabbitclass.com/jr4.0/ParentPortal/Dashboard?OrgId=500004';

async function main() {
  const stateFile = getArg('--state-file') || '/tmp/encoregym-session.json';

  if (!fs.existsSync(stateFile)) {
    const loginScript = path.join(__dirname, 'login.js');
    const result = JSON.parse(
      execSync(`node "${loginScript}" --state-file "${stateFile}"`, { env: process.env }).toString()
    );
    if (!result.ok) { out(result); process.exit(1); }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: stateFile });
  const page = await context.newPage();

  try {
    const schedulePromise = page.waitForResponse(
      res => res.url().includes('GetFamilyStudentSchedules'),
      { timeout: 15000 }
    );

    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (page.url().includes('Login')) {
      fs.unlinkSync(stateFile);
      out({ ok: false, error: 'Session expired — delete state file and retry' });
      process.exit(1);
    }

    const scheduleRes = await schedulePromise;
    const data = await scheduleRes.json();

    if (!data.success) {
      out({ ok: false, error: 'GetFamilyStudentSchedules API returned success=false' });
      process.exit(1);
    }

    out({
      ok: true,
      schedules: data.schedules.map(s => ({
        student: s.name,
        classes: s.classes.map(c => ({
          className: c.className,
          days: c.mtgDays,
          time: c.classTime,
          instructor: c.instructorName,
          location: c.location,
          status: c.status,
          enrollDate: c.enrollDate?.slice(0, 10),
        })),
        makeups: s.makeups,
        waitlists: s.waitlists,
      })),
    });
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

function out(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); }

main();
