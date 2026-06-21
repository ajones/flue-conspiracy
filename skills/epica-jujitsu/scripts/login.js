#!/usr/bin/env node
/**
 * Login to the Epica Jiu Jitsu gymdesk parent portal and save session state.
 *
 * Usage:
 *   EPICAJUJITSU_EMAIL=foo@bar.com EPICAJUJITSU_PASSWORD=secret node login.js --student cody|leo [--state-file /tmp/epica-cody-session.json]
 *
 * Exits 0 on success, 1 on failure.
 * Outputs JSON: { ok: true, stateFile: "..." } or { ok: false, error: "..." }
 */

const { chromium } = require('playwright');

const LOGIN_URL = 'https://epicajiujitsu.gymdesk.com/login';

const STUDENT_USER_IDS = {
  cody: '11285024',
  leo: '9905449',
};

async function main() {
  const email = process.env.EPICAJUJITSU_EMAIL;
  const password = process.env.EPICAJUJITSU_PASSWORD;

  if (!email || !password) {
    out({ ok: false, error: 'EPICAJUJITSU_EMAIL and EPICAJUJITSU_PASSWORD must be set' });
    process.exit(1);
  }

  const student = (getArg('--student') || '').toLowerCase();
  const userId = STUDENT_USER_IDS[student];
  if (!userId) {
    out({ ok: false, error: 'Pass --student cody or --student leo' });
    process.exit(1);
  }

  if (student === 'leo') {
    out({
      ok: false,
      error: "Leo's profile has its own separate gymdesk login password (the shared account password fails with 'Password does not match' when selecting Leo Jones). This skill cannot currently log in as Leo. Log in manually at https://epicajiujitsu.gymdesk.com/login to manage Leo's bookings.",
      loginUrl: 'https://epicajiujitsu.gymdesk.com/login',
    });
    process.exit(1);
  }

  const stateFile = getArg('--state-file') || `/tmp/epica-${student}-session.json`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // step 1: email + password (member radio is selected by default)
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // step 2: select which student is logging in, then submit again
    await page.$eval(`input[name="user_id"][value="${userId}"]`, (el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('button[type="submit"]');
    await page.waitForURL('**/members**', { timeout: 15000 });

    await context.storageState({ path: stateFile });
    out({ ok: true, stateFile, url: page.url(), student });
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
