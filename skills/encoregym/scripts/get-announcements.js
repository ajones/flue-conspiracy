#!/usr/bin/env node
/**
 * Fetch the latest announcement from the Encore Gym parent portal.
 *
 * Usage:
 *   ENCOREGYM_EMAIL=... ENCOREGYM_PASSWORD=... node get-announcements.js [--state-file /tmp/encoregym-session.json]
 *
 * Outputs JSON: { ok: true, announcement: { date, text } } or { ok: false, error: "..." }
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NEWS_URL = 'https://app.jackrabbitclass.com/jr4.0/ParentPortal/News?OrgID=500004';

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
    // Intercept GetAlertData for the hasNewAnnouncement flag
    const alertPromise = page.waitForResponse(
      res => res.url().includes('GetAlertData'),
      { timeout: 15000 }
    );

    await page.goto(NEWS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (page.url().includes('Login')) {
      fs.unlinkSync(stateFile);
      out({ ok: false, error: 'Session expired — delete state file and retry' });
      process.exit(1);
    }

    const alertRes = await alertPromise;
    const alertData = await alertRes.json();

    // The date is shown in the page title area; content lives in #sec-view-container
    const date = await page.$eval(
      '.page-header-subtitle, [class*="date"], [class*="Date"]',
      el => el.innerText.trim()
    ).catch(() => null);

    const text = await page.$eval(
      '#sec-view-container',
      el => el.innerText.trim()
    ).catch(() => null);

    out({
      ok: true,
      hasNewAnnouncement: alertData.hasNewAnnouncement ?? false,
      newMessageCount: alertData.newMessageAlertCount ?? 0,
      announcement: text ? { date, text } : null,
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
