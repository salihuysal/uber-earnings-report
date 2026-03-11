#!/usr/bin/env node
/**
 * Temporary CLI runner for Uber Earnings extraction
 * 
 * This script uses Playwright to automate the Uber Supplier Portal.
 * You need to install Playwright first:
 *   npm install playwright
 * 
 * Usage:
 *   node run-extraction.js
 */

const { chromium } = require('playwright');
const { runExtraction } = require('./src/run');

// Create a Playwright browser adapter
function createPlaywrightAdapter(page) {
  return {
    async navigate(url) {
      await page.goto(url, { waitUntil: 'networkidle' });
    },

    async snapshot() {
      const snapshot = await page.accessibility.snapshot();
      return snapshot;
    },

    async click(ref, element) {
      // Playwright accessibility refs are not directly usable
      // We need to implement a workaround
      throw new Error('Playwright adapter needs implementation - use Cursor Browser for now');
    },

    async hover(ref, element) {
      throw new Error('Playwright adapter needs implementation - use Cursor Browser for now');
    },

    async pressKey(key) {
      await page.keyboard.press(key);
    },

    async waitFor(opts) {
      if (opts.time) {
        await page.waitForTimeout(opts.time * 1000);
      } else if (opts.text) {
        await page.waitForSelector(`text=${opts.text}`, { timeout: opts.timeout || 30000 });
      }
    },

    log(msg) {
      console.log(`[UberReport] ${msg}`);
    },
  };
}

async function main() {
  console.log('⚠️  IMPORTANT: This script requires manual login!');
  console.log('The browser will open - please log in to Uber Supplier Portal manually.');
  console.log('Once logged in and on the earnings page, press ENTER to continue...\n');

  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100 
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to login page
  await page.goto('https://supplier.uber.com');
  
  // Wait for user to press ENTER
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
  });

  console.log('\n⚠️  NOTE: Playwright adapter is not fully implemented yet.');
  console.log('For now, please use the Cursor IDE browser automation (via AI agent).');
  console.log('\nTo run the full automation:');
  console.log('  1. Say "run the extraction" to the AI agent');
  console.log('  2. The agent will use the Cursor browser to automate everything');
  console.log('  3. CSV files will be exported to ./Uber_Reports/\n');

  await browser.close();
}

main().catch(console.error);
