#!/usr/bin/env node
/**
 * Blue Apron Order Scraper
 *
 * Logs into Blue Apron using credentials from an env-style file,
 * then navigates to /orders and extracts upcoming meal info.
 *
 * Usage:
 *   node get-orders.js <credentials-json-path>
 *
 * Credentials file format:
 *   EMAIL=...
 *   PASSWORD=...
 *
 * Environment variables:
 *   HEADLESS=false    Show the browser window
 *   WAIT_TIME=5000    Wait time in ms after page loads (default 5000)
 *   SCREENSHOT_PATH   Save a screenshot to this path
 *
 * Output: JSON to stdout with structured order details.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const credsPath = process.argv[2];
const headless = process.env.HEADLESS !== 'false';
const waitTime = parseInt(process.env.WAIT_TIME || '5000');
const screenshotPath = process.env.SCREENSHOT_PATH || null;

function formatUpcomingOrder(order) {
    const lines = [];
    const headerParts = [order.dateLabel || order.cycleDate || 'Upcoming order'];
    const status = order.statusLabel || '';
    const isNormal = !status || status.toUpperCase() === 'CONFIRMED';
    if (!isNormal) headerParts.push(status.toLowerCase());
    if (typeof order.itemCount === 'number' && isNormal) {
        headerParts.push(`${order.itemCount} items`);
    }
    lines.push(headerParts.join(' — '));
    for (const item of order.items) {
        if (typeof item === 'string') {
            lines.push(`- ${item}`);
        } else if (item && typeof item === 'object') {
            const label = item.subtitle ? `${item.name} ${item.subtitle}` : item.name;
            const calories = typeof item.calories === 'number' ? ` — ${item.calories} cal` : '';
            lines.push(`- ${label}${calories}`);
        }
    }
    return lines.join('\n');
}

function formatDateLabel(date) {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Los_Angeles',
    }).format(new Date(`${date}T00:00:00-07:00`));
}

function normalizeUpcomingOrders(payload) {
    const orders = [];
    if (!payload || !Array.isArray(payload.orders)) return orders;

    for (const entry of payload.orders) {
        const cart = entry && entry.auto_ship_cart;
        if (!cart) continue;
        orders.push({
            cartId: cart.cart_id || '',
            cycleId: cart.cycle_id || '',
            cycleStartDate: cart.cycle_start_date || '',
            cycleEndDate: cart.cycle_end_date || '',
            deliveryDate: cart.delivery_date || '',
            cutoffTime: cart.cutoff_time || '',
            status: cart.status || '',
            totalQuantity: typeof cart.total_quantity === 'number' ? cart.total_quantity : null,
            items: Array.isArray(cart.sellable_items)
                ? cart.sellable_items
                    .map((sellable) => {
                        const item = sellable && sellable.item;
                        if (!item) return null;
                        return {
                            name: item.product_name || '',
                            subtitle: item.product_subtitle || '',
                            productType: item.product_type || '',
                            quantity: typeof sellable.quantity === 'number' ? sellable.quantity : 1,
                            calories: null,
                        };
                    })
                    .filter(Boolean)
                : [],
        });
    }

    return orders;
}

function extractCaloriesFromMenuText(menuText, itemName, itemSubtitle) {
    if (!menuText || !itemName) return null;

    const normalizedText = menuText.replace(/\s+/g, ' ');
    const normalizedName = itemName.replace(/\s+/g, ' ').trim();
    const normalizedSubtitle = (itemSubtitle || '').replace(/\s+/g, ' ').trim();
    const searchTarget = normalizedSubtitle
        ? `${normalizedName} ${normalizedSubtitle}`
        : normalizedName;

    const lowerText = normalizedText.toLowerCase();
    const lowerTarget = searchTarget.toLowerCase();
    const idx = lowerText.indexOf(lowerTarget);
    if (idx === -1) return null;

    const windowText = normalizedText.slice(idx, idx + 500);
    const match = windowText.match(/(\d{2,4})\s*cal\b/i);
    if (!match) return null;

    const calories = Number.parseInt(match[1], 10);
    return Number.isFinite(calories) ? calories : null;
}

async function enrichOrdersWithCalories(context, upcomingOrders) {
    const orderPages = new Map();
    const page = await context.newPage();

    try {
        for (const order of upcomingOrders) {
            if (!order.cycleStartDate || !Array.isArray(order.items) || order.items.length === 0) {
                continue;
            }

            let menuText = orderPages.get(order.cycleStartDate);
            if (!menuText) {
                const menuUrl = `https://www.blueapron.com/menu?cycle_date=${order.cycleStartDate}&from=autoship_success`;
                await page.goto(menuUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                });
                await page.waitForTimeout(waitTime);
                menuText = await page.evaluate(() => document.body.innerText);
                orderPages.set(order.cycleStartDate, menuText);
            }

            for (const item of order.items) {
                item.calories = extractCaloriesFromMenuText(menuText, item.name, item.subtitle);
            }
        }
    } finally {
        await page.close();
    }
}

if (!credsPath) {
    console.error('Usage: node get-orders.js <credentials-json-path>');
    process.exit(1);
}

// Parse env-style credentials file (KEY=VALUE, one per line)
const creds = {};
try {
    const lines = readFileSync(credsPath, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        // Strip surrounding quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        // Normalize key: strip common prefixes and lowercase
        const normalizedKey = key.replace(/^BLUEAPRON_/i, '').toLowerCase();
        creds[normalizedKey] = val;
    }
} catch (e) {
    console.error(`Failed to read credentials from ${credsPath}: ${e.message}`);
    process.exit(1);
}

if (!creds.email || !creds.password) {
    console.error('Credentials file must contain EMAIL and PASSWORD lines.');
    process.exit(1);
}

(async () => {
    const startTime = Date.now();

    const browser = await chromium.launch({
        headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    });

    // Hide automation markers
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
    });

    const page = await context.newPage();

    try {
        // Step 1: Go to Blue Apron homepage
        console.error('Navigating to Blue Apron...');
        await page.goto('https://www.blueapron.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await page.waitForTimeout(3000);

        // Dismiss cookie consent banner if present (it overlays the page)
        try {
            const acceptBtn = await page.$('button:has-text("Accept"), #onetrust-accept-btn-handler, button:has-text("Accept All")');
            if (acceptBtn && await acceptBtn.isVisible()) {
                await acceptBtn.click();
                console.error('Dismissed cookie consent banner');
                await page.waitForTimeout(1000);
            }
        } catch (_) {}

        // Step 2: Click the login link/button to trigger the JS popup
        console.error('Clicking login to open popup...');
        await page.click('a:has-text("Login"), a[href*="sign_in"], button:has-text("Login"), button:has-text("Log In"), a:has-text("Log In"), [data-testid="login"]');
        await page.waitForTimeout(3000);

        // Step 3: Wait for the login popup/modal to appear, then fill credentials
        console.error('Waiting for login popup...');

        // The popup may use generic input elements — wait for it to render
        await page.waitForTimeout(3000);

        // Try multiple strategies to find and fill the email field
        const emailSelectors = [
            'input[type="email"]',
            'input[name="user[email]"]',
            '#user_email',
            'input[placeholder*="mail" i]',
            'input[placeholder*="Email" i]',
            'input[aria-label*="mail" i]',
            'input[aria-label*="Email" i]',
            'input[name*="email" i]',
        ];
        const passwordSelectors = [
            'input[type="password"]',
            'input[name="user[password]"]',
            '#user_password',
            'input[placeholder*="assword" i]',
            'input[aria-label*="assword" i]',
            'input[name*="password" i]',
        ];

        let emailFilled = false;
        for (const sel of emailSelectors) {
            try {
                const el = await page.$(sel);
                if (el && await el.isVisible()) {
                    await el.fill(creds.email);
                    console.error(`Filled email using: ${sel}`);
                    emailFilled = true;
                    break;
                }
            } catch (_) {}
        }
        if (!emailFilled) {
            console.error('Could not find email input, trying visible text inputs...');
            // Fall back: fill the first two visible text/email inputs
            const visibleInputs = await page.$$('input:visible');
            if (visibleInputs.length >= 2) {
                await visibleInputs[0].fill(creds.email);
                await visibleInputs[1].fill(creds.password);
                console.error('Filled using first two visible inputs');
            }
        }

        let passwordFilled = false;
        if (emailFilled) {
            for (const sel of passwordSelectors) {
                try {
                    const el = await page.$(sel);
                    if (el && await el.isVisible()) {
                        await el.fill(creds.password);
                        console.error(`Filled password using: ${sel}`);
                        passwordFilled = true;
                        break;
                    }
                } catch (_) {}
            }
        }

        await page.waitForTimeout(1000);

        // Submit the login form inside the popup
        // The navbar "Login" button matches first but is behind an overlay,
        // so target the submit button near the password field instead
        try {
            await page.click('button[type="submit"]', { timeout: 5000 });
        } catch (_) {
            // If that fails, try clicking the Login button inside the form via JS
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                // Find a Login button that's inside the popup (near the password input)
                const loginBtn = buttons.find(b => {
                    const text = b.textContent.trim();
                    return (text === 'Login' || text === 'Log in' || text === 'Sign in') &&
                           b.closest('form, [role="dialog"], [class*="modal"]');
                }) || buttons.find(b => b.textContent.trim() === 'Login' && b.offsetParent !== null);
                if (loginBtn) loginBtn.click();
            });
        }
        console.error('Submitted login form, waiting for redirect...');
        await page.waitForTimeout(waitTime);

        // Step 3: Navigate to orders page
        console.error('Navigating to orders page...');

        const upcomingResponsePromise = page.waitForResponse(
            (resp) => resp.url().includes('/ajax/v2/order/upcoming?'),
            { timeout: 30000 }
        );

        await page.goto('https://www.blueapron.com/orders', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });

        const upcomingResponse = await upcomingResponsePromise;
        const upcomingPayload = await upcomingResponse.json();
        await page.waitForTimeout(waitTime);

        const upcomingOrders = normalizeUpcomingOrders(upcomingPayload);

        const result = {
            title: await page.title(),
            url: page.url(),
        };

        result.upcomingOrders = upcomingOrders.map((order) => ({
            ...order,
            dateLabel: order.deliveryDate ? formatDateLabel(order.deliveryDate) : '',
            statusLabel: order.status || '',
            itemCount: order.totalQuantity,
            cutoffLabel: order.cutoffTime || '',
        }));

        await enrichOrdersWithCalories(context, result.upcomingOrders);
        result.summary = result.upcomingOrders.map(formatUpcomingOrder).join('\n\n');

        // Optional screenshot
        if (screenshotPath) {
            try {
                await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10000 });
                console.error(`Screenshot saved: ${screenshotPath}`);
                result.screenshot = screenshotPath;
            } catch (e) {
                console.error(`Screenshot failed: ${e.message}`);
            }
        }

        result.elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

        // Output result as JSON to stdout
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error(`Error: ${error.message}`);
        // Try to capture what we can
        try {
            const emergencyResult = await page.evaluate(() => ({
                title: document.title,
                url: window.location.href,
                content: document.body.innerText.substring(0, 5000),
            }));
            emergencyResult.error = error.message;
            console.log(JSON.stringify(emergencyResult, null, 2));
        } catch (_) {
            console.log(JSON.stringify({ error: error.message }));
        }
    } finally {
        await browser.close();
    }
})();
