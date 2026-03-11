/**
 * Pagination module for navigating multi-page driver tables.
 */

const { findButtonByText } = require('./helpers');
const CONFIG = require('./config');

/**
 * Check if a "Next" button exists and is not disabled.
 *
 * @param {object} snapshot - Accessibility tree
 * @returns {string|null} ref of the Next button, or null if not available
 */
function getNextPageRef(snapshot) {
  const btn = findButtonByText(snapshot, CONFIG.labels.next);
  if (!btn) return null;
  if (btn.states && btn.states.includes('disabled')) return null;
  return btn.ref;
}

/**
 * Check if a "First" page button exists.
 *
 * @param {object} snapshot - Accessibility tree
 * @returns {string|null} ref of the First button, or null
 */
function getFirstPageRef(snapshot) {
  const btn = findButtonByText(snapshot, CONFIG.labels.first);
  if (!btn) return null;
  if (btn.states && btn.states.includes('disabled')) return null;
  return btn.ref;
}

/**
 * Navigate to the first page of the table.
 *
 * @param {object} browser - Browser adapter
 * @returns {boolean} true if navigated
 */
async function goToFirstPage(browser) {
  const snapshot = await browser.snapshot();
  const ref = getFirstPageRef(snapshot);
  if (!ref) return false;

  await browser.click(ref, 'First page button');
  await browser.waitFor({ time: CONFIG.timing.medium });
  return true;
}

/**
 * Navigate to the next page.
 *
 * @param {object} browser - Browser adapter
 * @returns {boolean} true if there was a next page and we navigated to it
 */
async function goToNextPage(browser) {
  const snapshot = await browser.snapshot();
  const ref = getNextPageRef(snapshot);
  if (!ref) return false;

  await browser.click(ref, 'Next page button');
  await browser.waitFor({ time: CONFIG.timing.long });
  return true;
}

/**
 * Check if the current page has more pages after it.
 *
 * @param {object} browser - Browser adapter
 * @returns {boolean}
 */
async function hasNextPage(browser) {
  const snapshot = await browser.snapshot();
  return getNextPageRef(snapshot) !== null;
}

module.exports = {
  getNextPageRef,
  getFirstPageRef,
  goToFirstPage,
  goToNextPage,
  hasNextPage,
};
