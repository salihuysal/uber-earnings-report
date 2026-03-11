/**
 * Period selector module.
 *
 * All browser interactions go through the `browser` adapter object.
 * Supports both English and German UI on the Uber Supplier Portal.
 *
 * Browser adapter interface:
 *   browser.snapshot(opts?)       -> accessibility tree
 *   browser.click(ref, desc)      -> void
 *   browser.hover(ref, element)   -> void
 *   browser.pressKey(key)         -> void
 *   browser.waitFor(opts)         -> void
 *   browser.navigate(url)         -> void
 *   browser.fill(ref, val, desc)  -> void
 *   browser.log(msg)              -> void
 */

const { findButtonByText, findAllButtonsByText, findByRole, findNode, findNodes, snapshotSummary } = require('./helpers');
const CONFIG = require('./config');

/**
 * Find the date range button in the snapshot.
 * Works for both EN (contains AM/PM) and DE (24h format with date pattern).
 */
function findDateRangeButton(snapshot) {
  const ampmBtn = findButtonByText(snapshot, ['AM', 'PM']);
  if (ampmBtn) return ampmBtn;

  return findNode(snapshot, (n) =>
    (n.role === 'button' || n.role === 'link') &&
    n.name &&
    CONFIG.datePattern.test(n.name)
  );
}

/**
 * Find all date range buttons in the snapshot (EN + DE).
 */
function findAllDateRangeButtons(snapshot) {
  const results = [];
  const ampmButtons = findAllButtonsByText(snapshot, ['AM', 'PM']);
  if (ampmButtons.length > 0) return ampmButtons;

  return findNodes(snapshot, (n) =>
    (n.role === 'button' || n.role === 'link') &&
    n.name &&
    CONFIG.datePattern.test(n.name)
  );
}

/**
 * Find the custom range tab (supports EN "Custom range" and DE "Benutzerdefinierter Bereich").
 */
function findCustomRangeTab(snapshot) {
  return findNode(snapshot, (n) => {
    if (n.role !== 'tab') return false;
    if (!n.name) return false;
    const lower = n.name.toLowerCase();
    return CONFIG.labels.customRange.some((label) => lower.includes(label.toLowerCase()));
  });
}

/**
 * Open the period dropdown panel.
 * The Uber earnings page requires two clicks:
 * 1. Click the date range button in the top bar
 * 2. Click the inner period dropdown (second date button)
 *
 * @param {object} browser - Browser adapter
 * @returns {boolean} true if dropdown opened successfully
 */
async function openPeriodPanel(browser) {
  const snapshot = await browser.snapshot();
  browser.log(`[openPeriodPanel] Snapshot: ${JSON.stringify(snapshotSummary(snapshot))}`);

  const dateRangeBtn = findDateRangeButton(snapshot);
  if (!dateRangeBtn) {
    browser.log('[openPeriodPanel] FEHLER: Datums-Button nicht gefunden');
    return false;
  }

  browser.log(`[openPeriodPanel] Datums-Button gefunden: "${dateRangeBtn.name}"`);
  await browser.click(dateRangeBtn.ref, 'Date range button');
  await browser.waitFor({ time: CONFIG.timing.medium });

  const snapshot2 = await browser.snapshot();
  const allDateButtons = findAllDateRangeButtons(snapshot2);
  browser.log(`[openPeriodPanel] ${allDateButtons.length} Datums-Buttons nach Klick`);

  const innerDropdown = allDateButtons.length > 1 ? allDateButtons[1] : null;
  if (!innerDropdown) {
    browser.log('[openPeriodPanel] FEHLER: Innerer Dropdown nicht gefunden');
    return false;
  }

  await browser.click(innerDropdown.ref, 'Period dropdown');
  await browser.waitFor({ time: CONFIG.timing.medium });
  return true;
}

/**
 * Get all available settlement periods from the dropdown.
 *
 * @param {object} browser - Browser adapter
 * @returns {Array<{text: string, index: number, ref: string}>}
 */
async function getAvailablePeriods(browser) {
  const opened = await openPeriodPanel(browser);
  if (!opened) {
    browser.log('[getAvailablePeriods] Konnte Panel nicht öffnen');
    return [];
  }

  const snapshot = await browser.snapshot();

  const listbox = findNode(snapshot, (n) => n.role === 'listbox');
  if (!listbox) {
    browser.log('[getAvailablePeriods] Listbox nicht gefunden');
    return [];
  }

  const options = findByRole(listbox, 'option');
  const periods = options
    .map((opt, index) => ({
      text: (opt.name || '').trim(),
      index,
      ref: opt.ref,
    }))
    .filter((p) => p.text);

  browser.log(`[getAvailablePeriods] ${periods.length} Zeiträume gefunden`);
  return periods;
}

/**
 * Close all open panels/dropdowns by pressing Escape multiple times.
 *
 * @param {object} browser - Browser adapter
 */
async function closeAllPanels(browser) {
  for (let i = 0; i < 3; i++) {
    await browser.pressKey('Escape');
    await browser.waitFor({ time: 0.15 });
  }
  await browser.waitFor({ time: CONFIG.timing.medium });
}

/**
 * Select a specific period by its index in the dropdown.
 *
 * @param {object} browser - Browser adapter
 * @param {number} periodIndex - Zero-based index of the period to select
 * @returns {boolean} true if selection succeeded
 */
async function selectPeriod(browser, periodIndex) {
  const opened = await openPeriodPanel(browser);
  if (!opened) return false;

  const snapshot = await browser.snapshot();
  const listbox = findNode(snapshot, (n) => n.role === 'listbox');
  if (!listbox) return false;

  const options = findByRole(listbox, 'option');
  if (periodIndex >= options.length) {
    browser.log(`[selectPeriod] Index ${periodIndex} außerhalb (${options.length} verfügbar)`);
    return false;
  }

  const option = options[periodIndex];
  await browser.click(option.ref, `Period: ${option.name}`);
  await browser.waitFor({ time: CONFIG.timing.pageLoad });

  return true;
}

/**
 * Select a custom date range via the "Custom range" tab in the date picker.
 * Supports both EN and DE tab labels.
 *
 * @param {object} browser - Browser adapter
 * @param {string} startDate - Start date string in YYYY/MM/DD format
 * @param {string} endDate - End date string in YYYY/MM/DD format
 * @returns {boolean} true if range was applied successfully
 */
async function selectCustomRange(browser, startDate, endDate) {
  async function openCustomRangeTab() {
    const snap = await browser.snapshot();
    const dateRangeBtn = findDateRangeButton(snap);
    if (!dateRangeBtn) {
      browser.log('[selectCustomRange] Datums-Button nicht gefunden');
      return false;
    }
    await browser.click(dateRangeBtn.ref, 'Date range button');
    await browser.waitFor({ time: CONFIG.timing.medium });

    const snap2 = await browser.snapshot();
    const customTab = findCustomRangeTab(snap2);
    if (!customTab) {
      browser.log('[selectCustomRange] Custom-Range-Tab nicht gefunden');
      await closeAllPanels(browser);
      return false;
    }
    browser.log(`[selectCustomRange] Tab gefunden: "${customTab.name}"`);
    await browser.click(customTab.ref, 'Custom range tab');
    await browser.waitFor({ time: CONFIG.timing.medium });
    return true;
  }

  if (!await openCustomRangeTab()) return false;

  let snap = await browser.snapshot();
  let dateInputs = findNodes(snap, (n) => n.role === 'textbox');
  browser.log(`[selectCustomRange] ${dateInputs.length} Textfelder gefunden`);
  if (dateInputs.length < 2) {
    browser.log(`[selectCustomRange] FEHLER: Erwartet 2 Datumseingaben, gefunden ${dateInputs.length}`);
    await closeAllPanels(browser);
    return false;
  }

  await browser.fill(dateInputs[0].ref, startDate, 'Start date');
  await browser.waitFor({ time: CONFIG.timing.afterPeriodChange });

  if (!await openCustomRangeTab()) return false;

  snap = await browser.snapshot();
  dateInputs = findNodes(snap, (n) => n.role === 'textbox');
  if (dateInputs.length < 2) {
    browser.log(`[selectCustomRange] FEHLER: Datumseingaben nach Neuöffnung: ${dateInputs.length}`);
    await closeAllPanels(browser);
    return false;
  }

  await browser.fill(dateInputs[1].ref, endDate, 'End date');
  await browser.waitFor({ time: CONFIG.timing.afterPeriodChange });

  await closeAllPanels(browser);
  await browser.waitFor({ time: CONFIG.timing.afterPeriodChange });

  browser.log(`[selectCustomRange] Bereich angewendet: ${startDate} – ${endDate}`);
  return true;
}

module.exports = {
  openPeriodPanel,
  getAvailablePeriods,
  closeAllPanels,
  selectPeriod,
  selectCustomRange,
};
