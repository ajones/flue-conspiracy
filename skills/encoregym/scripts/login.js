#!/usr/bin/env node
/**
 * Login to Encore Gym parent portal and save session state.
 *
 * Usage:
 *   ENCOREGYM_EMAIL=foo@bar.com ENCOREGYM_PASSWORD=secret node login.js [--state-file /tmp/encoregym-session.json]
 *
 * Exits 0 on success, 1 on failure.
 * Outputs JSON: { ok: true, stateFile: "..." } or { ok: false, error: "..." }
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORTAL_URL = 'https://app.jackrabbitclass.com/jr3.0/ParentPortal/Login?orgId=500004';

async function main() {
  const email = process.env.ENCOREGYM_EMAIL;
  const password = process.env.ENCOREGYM_PASSWORD;

  if (!email || !password) {
    out({ ok: false, error: 'ENCOREGYM_EMAIL and ENCOREGYM_PASSWORD must be set' });
    process.exit(1);
  }

  const stateFile = getArg('--state-file') || '/tmp/encoregym-session.json';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.fill('#UserName', email);
    await page.fill('#Password', password);
    await page.click('#btn-signin');

    await page.waitForURL('**/Dashboard**', { timeout: 15000 });


    await context.storageState({ path: stateFile });
    out({ ok: true, stateFile, url: page.url() });
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
