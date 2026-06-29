#!/usr/bin/env node
/**
 * X (Twitter) Profile Image Scraper
 *
 * Intercepts X's internal GraphQL API calls to extract image posts
 * from a public profile. Supports optional cookie-based auth for
 * accounts requiring login.
 *
 * Usage:
 *   node get-x-profile-images.js <username-or-url> [cookies-json-path]
 *
 * Examples:
 *   node get-x-profile-images.js the_frog_mage
 *   node get-x-profile-images.js https://x.com/the_frog_mage
 *   node get-x-profile-images.js the_frog_mage ~/.x-cookies.json
 *
 * Cookies file: exported from browser as JSON (array of cookie objects).
 *   Use a browser extension like "EditThisCookie" or "Cookie-Editor" to export.
 *
 * Environment variables:
 *   HEADLESS=false     Show browser window
 *   WAIT_TIME=8000     Wait after page load (ms)
 *   MAX_IMAGES=20      Max images to return (default 20)
 *   SCREENSHOT_PATH    Save a screenshot to this path
 *
 * Output: JSON to stdout with image URLs and tweet permalinks.
 */

const playwrightPath = require('path').join(
    require('os').homedir(),
    'local/raven/flue-conspiracy/skills/playwright-scraper/node_modules/playwright'
);
const { chromium } = require(playwrightPath);
const fs = require('fs');

const arg1 = process.argv[2];
const cookiesPath = process.argv[3] || null;
const headless = process.env.HEADLESS !== 'false';
const waitTime = parseInt(process.env.WAIT_TIME || '8000');
const maxImages = parseInt(process.env.MAX_IMAGES || '20');
const screenshotPath = process.env.SCREENSHOT_PATH || null;

if (!arg1) {
    console.error('Usage: node get-x-profile-images.js <username-or-url> [cookies-json-path]');
    process.exit(1);
}

function resolveProfileUrl(arg) {
    if (arg.startsWith('http')) return arg;
    const username = arg.replace(/^@/, '');
    return `https://x.com/${username}`;
}

function extractImagesFromGraphQL(json) {
    const results = [];
    try {
        // X uses `timeline` (not `timeline_v2`) for unauthenticated responses
        const instructions =
            json?.data?.user?.result?.timeline?.timeline?.instructions ||
            json?.data?.user?.result?.timeline_v2?.timeline?.instructions ||
            [];

        for (const instruction of instructions) {
            // Regular entries array
            for (const entry of (instruction?.entries || [])) {
                walkEntry(entry, results);
            }
            // Pinned tweet (single entry under `entry` key)
            if (instruction?.entry) {
                walkEntry(instruction.entry, results);
            }
        }
    } catch (_) {}
    return results;
}

function walkEntry(entry, results) {
    const content = entry?.content;
    if (!content) return;

    // Single tweet item
    const itemContent = content?.itemContent || content?.items?.[0]?.item?.itemContent;
    if (itemContent) processTweetResult(itemContent?.tweet_results?.result, results);

    // Module entries (grid view)
    for (const item of (content?.items || [])) {
        processTweetResult(item?.item?.itemContent?.tweet_results?.result, results);
    }
}

function processTweetResult(tweetResult, results) {
    if (!tweetResult) return;
    const legacy = tweetResult?.legacy || tweetResult?.tweet?.legacy;
    const core = tweetResult?.core || tweetResult?.tweet?.core;
    if (!legacy) return;

    const media = legacy?.extended_entities?.media || legacy?.entities?.media || [];
    if (!media.length) return;

    // screen_name lives in core (not legacy) for unauthenticated responses
    const username =
        core?.user_results?.result?.core?.screen_name ||
        core?.user_results?.result?.legacy?.screen_name ||
        '';
    const tweetId = legacy?.id_str || '';
    const tweetUrl = username && tweetId
        ? `https://x.com/${username}/status/${tweetId}`
        : null;
    const createdAt = legacy?.created_at || '';

    for (const m of media) {
        if (m.type !== 'photo') continue;
        const imageUrl = m.media_url_https
            ? `${m.media_url_https}?format=jpg&name=large`
            : m.media_url_https;
        results.push({ imageUrl, tweetUrl, username, tweetId, createdAt });
    }
}

(async () => {
    const startTime = Date.now();
    const profileUrl = resolveProfileUrl(arg1);
    const collectedImages = [];
    const seenTweetIds = new Set();

    const browser = await chromium.launch({
        headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
        locale: 'en-US',
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
    });

    if (cookiesPath) {
        try {
            const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
            await context.addCookies(cookies);
            console.error(`Loaded ${cookies.length} cookies from ${cookiesPath}`);
        } catch (e) {
            console.error(`Warning: could not load cookies: ${e.message}`);
        }
    }

    const page = await context.newPage();

    // Intercept X GraphQL responses for timeline/media endpoints
    page.on('response', async (response) => {
        const url = response.url();
        if (
            !url.includes('/graphql/') ||
            (!url.includes('UserMedia') && !url.includes('UserTweets') && !url.includes('UserWithProfileEdgeTypesQuery'))
        ) return;

        try {
            const json = await response.json();
            const images = extractImagesFromGraphQL(json);
            for (const img of images) {
                if (!seenTweetIds.has(img.tweetId)) {
                    seenTweetIds.add(img.tweetId);
                    collectedImages.push(img);
                }
            }
        } catch (_) {}
    });

    console.error(`Navigating to ${profileUrl}...`);
    try {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.error(`Navigation error: ${e.message}`);
    }

    // Try to navigate to /media tab for image-only content
    const mediaUrl = profileUrl.replace(/\/$/, '') + '/media';
    console.error(`Navigating to media tab: ${mediaUrl}...`);
    try {
        await page.goto(mediaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.error(`Media tab navigation error: ${e.message}`);
    }

    console.error(`Waiting ${waitTime}ms for content to load...`);
    await page.waitForTimeout(waitTime);

    // Scroll to trigger more API calls
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(2000);
    }

    if (screenshotPath) {
        try {
            await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 10000 });
            console.error(`Screenshot saved: ${screenshotPath}`);
        } catch (e) {
            console.error(`Screenshot failed: ${e.message}`);
        }
    }

    // Check if we hit a login wall
    const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
    const loginWall = pageText.includes('Sign in to X') || pageText.includes('Log in to X') ||
        pageText.includes('Don\'t have an account?');

    await browser.close();

    const limited = collectedImages.slice(0, maxImages);

    const result = {
        profileUrl,
        imageCount: limited.length,
        loginWall,
        images: limited,
        elapsedSeconds: ((Date.now() - startTime) / 1000).toFixed(2),
    };

    if (loginWall && limited.length === 0) {
        result.hint = 'X requires login to view media. Pass a cookies JSON file as the second argument.';
    }

    console.log(JSON.stringify(result, null, 2));
})();
