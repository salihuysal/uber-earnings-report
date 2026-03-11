/**
 * Driver data extraction module.
 *
 * Handles reading the driver table, opening/closing drawers,
 * expanding "Total earnings", and extracting detailed amounts.
 */

const {
  findByRole,
  findNode,
  findNodes,
  findButtonByText,
  findAllButtonsByText,
  parseAmount,
  extractAmount,
  categorizeEarningLabel,
  isDriverInFilter,
  deduplicateName,
  snapshotSummary,
} = require('./helpers');
const CONFIG = require('./config');

const CELLS_PER_DRIVER = 7;

/**
 * Parse the driver table from a snapshot and return structured driver data.
 *
 * The accessibility snapshot shows gridcells as a flat list (not nested in rows).
 * Each driver occupies 7 consecutive gridcells:
 *   [name, totalEarning, refundsExpenses, adjustments, payout, netEarnings, chevron]
 *
 * The standalone "Chevron right small" buttons (outside gridcells) correspond 1:1
 * with each driver row and are the actual clickable elements for opening drawers.
 *
 * @param {object} snapshot - Accessibility tree from browser.snapshot()
 * @returns {Array<{name, totalEarning, refundsExpenses, adjustments, payout, netEarnings, chevronRef}>}
 */
function parseDriverTable(snapshot, logger) {
  const log = logger || (() => {});
  const drivers = [];
  const allGridCells = findByRole(snapshot, 'gridcell');
  const chevronButtons = findAllButtonsByText(snapshot, CONFIG.labels.chevron);

  log(`[parseDriverTable] ${allGridCells.length} Gridcells, ${chevronButtons.length} Chevron-Buttons`);

  for (let i = 0; i + CELLS_PER_DRIVER - 1 < allGridCells.length; i += CELLS_PER_DRIVER) {
    const nameCell = allGridCells[i];
    const name = deduplicateName(nameCell.name || '');

    const lowerName = name.toLowerCase();
    if (!name || CONFIG.labels.chevron.some(c => lowerName.includes(c.toLowerCase())) || name.startsWith('€')) continue;

    const driverIndex = drivers.length;
    const chevronRef = chevronButtons[driverIndex]?.ref || null;

    drivers.push({
      name,
      totalEarning: parseAmount(allGridCells[i + 1]?.name),
      refundsExpenses: parseAmount(allGridCells[i + 2]?.name),
      adjustments: parseAmount(allGridCells[i + 3]?.name),
      payout: parseAmount(allGridCells[i + 4]?.name),
      netEarnings: parseAmount(allGridCells[i + 5]?.name),
      chevronRef,
    });
  }

  return drivers;
}

/**
 * Open the detail drawer for a driver.
 * Clicks the standalone chevron button corresponding to this driver.
 *
 * @param {object} browser - Browser adapter
 * @param {object} driver - Driver object from parseDriverTable
 */
async function openDriverDrawer(browser, driver) {
  if (!driver.chevronRef) {
    browser.log(`No chevron button found for ${driver.name}`);
    return;
  }

  await browser.click(driver.chevronRef, `Open drawer for ${driver.name}`);
  await browser.waitFor({ time: CONFIG.timing.long });
}

/**
 * Extract earnings details from the opened drawer.
 *
 * The drawer shows buttons like:
 *   "Total earnings €69.92 Down Small" (collapsed/expanded)
 *   "Fare €69.92 Down Small"           (appears after expanding Total earnings)
 *   "Service fee -€10.00 Down Small"
 *   "Refunds & expenses €0.00 Down Small"
 *   etc.
 *
 * We need to:
 * 1. Find and click "Total earnings" to expand sub-items (Fare, Service Fee, Tip, Promotions)
 * 2. Read all button values from the expanded drawer
 *
 * @param {object} browser - Browser adapter
 * @returns {object} { fare, serviceFee, tip, promotions, totalEarning, refundsExpenses, adjustments, payout, netEarnings }
 */
async function extractDriverDetails(browser) {
  const details = {
    fare: 0,
    serviceFee: 0,
    tip: 0,
    promotions: 0,
    totalEarning: 0,
    refundsExpenses: 0,
    yourEarnings: 0,
    adjustments: 0,
    cashCollected: 0,
    payout: 0,
    netEarnings: 0,
  };

  await browser.waitFor({ time: CONFIG.timing.long });
  let snapshot = await browser.snapshot();
  browser.log(`[extractDriverDetails] Snapshot: ${JSON.stringify(snapshotSummary(snapshot))}`);

  const sectionsToExpand = [
    { labels: CONFIG.labels.totalEarning, name: 'Total Earnings' },
    { labels: CONFIG.labels.adjustments, name: 'Adjustments' },
    { labels: CONFIG.labels.payout, name: 'Payout' },
    { labels: CONFIG.labels.refundsExpenses, name: 'Refunds & Expenses' },
  ];

  for (const section of sectionsToExpand) {
    const btn = findButtonByText(snapshot, section.labels);
    if (btn && btn.ref) {
      const btnName = btn.name || '';
      const hasDownArrow = /down\s*small|abwärts\s*klein/i.test(btnName);
      if (hasDownArrow) {
        browser.log(`[extractDriverDetails] Expanding ${section.name}: "${btnName}"`);
        await browser.click(btn.ref, `Expand ${section.name}`);
        await browser.waitFor({ time: CONFIG.timing.medium });
        snapshot = await browser.snapshot();
      }
    }
  }

  const allButtons = findByRole(snapshot, 'button');
  let matched = 0;
  for (const btn of allButtons) {
    if (!btn.name) continue;
    if (!btn.name.includes('Down Small') && !btn.name.includes('Abwärts Klein') && !btn.name.includes('Down small')
        && !btn.name.includes('Up Small') && !btn.name.includes('Aufwärts Klein') && !btn.name.includes('Up small')) continue;

    const amountMatch = btn.name.match(/-?€[\d.,]+/);
    if (!amountMatch) {
      browser.log(`[extractDriverDetails] Button ohne Betrag: "${btn.name}"`);
      continue;
    }

    const amount = parseAmount(amountMatch[0]);
    const category = categorizeEarningLabel(btn.name);

    if (category) {
      details[category] = amount;
      matched++;
    } else {
      browser.log(`[extractDriverDetails] Unbekannte Kategorie: "${btn.name}" -> ${amountMatch[0]}`);
    }
  }

  browser.log(`[extractDriverDetails] ${matched} Werte: Total=${details.totalEarning}, Fare=${details.fare}, Fee=${details.serviceFee}, Tip=${details.tip}, Promo=${details.promotions}, Refund=${details.refundsExpenses}, YourEarn=${details.yourEarnings}, Adj=${details.adjustments}, Cash=${details.cashCollected}, Pay=${details.payout}, Net=${details.netEarnings}`);
  return details;
}

/**
 * Close the drawer by clicking the "Close" button or pressing Escape.
 *
 * @param {object} browser - Browser adapter
 */
async function closeDrawer(browser) {
  const snapshot = await browser.snapshot();
  const closeBtn = findButtonByText(snapshot, CONFIG.labels.close);
  if (closeBtn) {
    await browser.click(closeBtn.ref, 'Close drawer');
  } else {
    await browser.pressKey('Escape');
  }
  await browser.waitFor({ time: CONFIG.timing.short });
}

/**
 * Process all drivers on the current page.
 * Opens each driver's drawer, extracts details, and collects them.
 *
 * @param {object} browser - Browser adapter
 * @param {string} periodText - Name of the current period (for data recording)
 * @param {string[]} driverFilter - Optional list of driver name fragments to filter by
 * @param {function} [onDriverExtracted] - Callback called after each driver: ({driverName, period, ...details})
 * @returns {object} Map of driverName -> [{period, fare, serviceFee, ...}]
 */
async function processDriversOnPage(browser, periodText, driverFilter, onDriverExtracted) {
  const snapshot = await browser.snapshot();
  browser.log(`[processDriversOnPage] Snapshot: ${JSON.stringify(snapshotSummary(snapshot))}`);
  const drivers = parseDriverTable(snapshot, (msg) => browser.log(msg));
  const results = {};

  browser.log(`[processDriversOnPage] ${drivers.length} Fahrer auf Seite`);

  for (const driver of drivers) {
    if (!isDriverInFilter(driver.name, driverFilter)) {
      browser.log(`  Skipping ${driver.name} (not in filter)`);
      continue;
    }

    browser.log(`  Processing: ${driver.name}`);

    await openDriverDrawer(browser, driver);
    const details = await extractDriverDetails(browser);

    if (!results[driver.name]) {
      results[driver.name] = [];
    }

    const row = {
      period: periodText,
      fare: details.fare,
      serviceFee: details.serviceFee,
      tip: details.tip,
      promotions: details.promotions,
      totalEarning: details.totalEarning || driver.totalEarning,
      refundsExpenses: details.refundsExpenses || driver.refundsExpenses,
      yourEarnings: details.yourEarnings,
      adjustments: details.adjustments || driver.adjustments,
      cashCollected: details.cashCollected,
      payout: details.payout || driver.payout,
      netEarnings: details.netEarnings || driver.netEarnings,
    };

    results[driver.name].push(row);

    if (onDriverExtracted) {
      onDriverExtracted({ driverName: driver.name, ...row });
    }

    await closeDrawer(browser);
    await browser.waitFor({ time: CONFIG.timing.betweenDrivers });
  }

  return results;
}

/**
 * Get all driver names from the current page's table.
 * Iterates through all pages to collect a complete list.
 *
 * @param {object} browser - Browser adapter
 * @returns {string[]} List of unique driver names
 */
async function getDriverNames(browser) {
  const { goToFirstPage, hasNextPage, goToNextPage } = require('./pagination');
  const allNames = new Set();

  await goToFirstPage(browser);
  await browser.waitFor({ time: CONFIG.timing.medium });

  let pageNum = 1;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await browser.snapshot();
    const drivers = parseDriverTable(snapshot, (msg) => browser.log(msg));
    browser.log(`[getDriverNames] Seite ${pageNum}: ${drivers.length} Fahrer gefunden`);

    for (const d of drivers) {
      if (d.name) allNames.add(d.name);
    }

    if (await hasNextPage(browser)) {
      await goToNextPage(browser);
      pageNum++;
    } else {
      hasMore = false;
    }
  }

  const names = [...allNames].sort();
  browser.log(`[getDriverNames] Gesamt: ${names.length} eindeutige Fahrer`);
  return names;
}

module.exports = {
  parseDriverTable,
  openDriverDrawer,
  extractDriverDetails,
  closeDrawer,
  processDriversOnPage,
  getDriverNames,
};
