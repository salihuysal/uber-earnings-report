/**
 * Uber Earnings Report - Automation Orchestrator
 *
 * This is the main entry point for the extraction workflow.
 * It coordinates all modules: period selection, driver extraction,
 * pagination, and CSV export.
 *
 * PHASE 1 USAGE (Cursor Browser):
 *   The AI agent imports this module and calls runExtraction() with a
 *   browser adapter that wraps Cursor IDE Browser MCP tool calls.
 *
 * PHASE 2 USAGE (Electron + Playwright):
 *   Replace the browser adapter with a Playwright-based implementation.
 *   All other code stays the same.
 *
 * Browser Adapter Interface:
 *   browser.navigate(url)          - Navigate to a URL
 *   browser.snapshot(opts?)        - Get accessibility tree snapshot
 *   browser.click(ref, desc)       - Click an element by ref
 *   browser.hover(ref, desc)       - Hover over an element by ref
 *   browser.pressKey(key)          - Press a keyboard key
 *   browser.waitFor(opts)          - Wait for time/text/textGone
 *   browser.log(msg)               - Log a message
 */

const { getAvailablePeriods, selectPeriod, closeAllPanels, selectCustomRange } = require('./automation/period-selector');
const { processDriversOnPage } = require('./automation/driver-extractor');
const { goToFirstPage, goToNextPage, hasNextPage } = require('./automation/pagination');
const { exportAllCSV } = require('./automation/csv-exporter');
const { exportAllPDF } = require('./automation/pdf-exporter');
const { runApiExtraction, extractSupplierUuid } = require('./automation/api-extractor');
const CONFIG = require('./automation/config');

/**
 * Merge driver data maps. Each map is { driverName: [rows] }.
 */
function mergeDriverData(target, source) {
  for (const [name, rows] of Object.entries(source)) {
    if (!target[name]) {
      target[name] = [];
    }
    target[name].push(...rows);
  }
}

/**
 * Run the full extraction workflow.
 *
 * @param {object} browser - Browser adapter (see interface above)
 * @param {object} options
 * @param {number[]} [options.periodIndices] - Which periods to extract (indices). If null, extracts all.
 * @param {object}  [options.customRange] - Custom month range: { month, year }
 * @param {string[]} [options.driverFilter] - Optional driver name filter fragments
 * @param {string}  [options.outputDir] - CSV output directory
 * @returns {object} { success, filesCreated, driversProcessed, collectedData }
 */
async function runExtraction(browser, options = {}) {
  const { periodIndices, customRange, driverFilter, outputDir, revenueFormula, onDriverExtracted } = options;
  const collectedData = {};

  try {
    browser.log('=== Uber Earnings Report Extraction ===');

    if (driverFilter && driverFilter.length > 0) {
      browser.log(`Driver filter active: ${driverFilter.join(', ')}`);
    }

    if (customRange) {
      // Custom month range mode
      const { month, year } = customRange;
      const pad = (n) => String(n).padStart(2, '0');
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${year}/${pad(month)}/01`;
      const endDate = `${year}/${pad(month)}/${pad(lastDay)}`;
      const rangeLabel = `01.${pad(month)}.${year} - ${pad(lastDay)}.${pad(month)}.${year}`;

      browser.log(`Custom range: ${rangeLabel}`);
      browser.log('Setting custom date range in picker...');

      const applied = await selectCustomRange(browser, startDate, endDate);
      if (!applied) {
        throw new Error('Could not apply custom date range.');
      }

      await browser.waitFor({ time: CONFIG.timing.medium });
      await goToFirstPage(browser);
      await browser.waitFor({ time: CONFIG.timing.medium });

      let pageNum = 1;
      let hasMore = true;

      while (hasMore) {
        browser.log(`Page ${pageNum}...`);

        const pageResults = await processDriversOnPage(browser, rangeLabel, driverFilter || [], onDriverExtracted);
        mergeDriverData(collectedData, pageResults);

        if (await hasNextPage(browser)) {
          await goToNextPage(browser);
          pageNum++;
        } else {
          hasMore = false;
        }
      }
    } else {
      // Settlement window mode
      browser.log('Loading available periods...');
      const periods = await getAvailablePeriods(browser);
      await closeAllPanels(browser);

      if (periods.length === 0) {
        throw new Error('No periods found. Make sure you are on the Earnings page.');
      }

      browser.log(`Found ${periods.length} periods`);

      const indicesToProcess = periodIndices || periods.map((_, i) => i);
      const periodsToProcess = indicesToProcess
        .filter((i) => i < periods.length)
        .map((i) => ({ index: i, text: periods[i].text }));

      browser.log(`Processing ${periodsToProcess.length} periods`);

      for (let pIdx = 0; pIdx < periodsToProcess.length; pIdx++) {
        const period = periodsToProcess[pIdx];
        browser.log(`\n--- Period ${pIdx + 1}/${periodsToProcess.length}: ${period.text} ---`);

        await selectPeriod(browser, period.index);
        await goToFirstPage(browser);
        await browser.waitFor({ time: CONFIG.timing.medium });

        let pageNum = 1;
        let hasMore = true;

        while (hasMore) {
          browser.log(`Page ${pageNum}...`);

          const pageResults = await processDriversOnPage(browser, period.text, driverFilter || [], onDriverExtracted);
          mergeDriverData(collectedData, pageResults);

          if (await hasNextPage(browser)) {
            await goToNextPage(browser);
            pageNum++;
          } else {
            hasMore = false;
          }
        }
      }
    }

    // Export CSV + PDF files
    browser.log('\n=== Dateien exportieren (CSV + PDF) ===');
    const driversProcessed = Object.keys(collectedData).length;
    const csvResult = exportAllCSV(collectedData, outputDir, revenueFormula);
    browser.log(`${csvResult.filesCreated} CSV-Dateien exportiert`);

    const pdfResult = await exportAllPDF(collectedData, outputDir, revenueFormula);
    browser.log(`${pdfResult.filesCreated} PDF-Dateien exportiert`);

    const totalFiles = csvResult.filesCreated + pdfResult.filesCreated;
    browser.log(`Fertig! ${totalFiles} Dateien nach ${csvResult.outputDir}`);
    browser.log(`${driversProcessed} Fahrer verarbeitet`);

    return {
      success: true,
      filesCreated: totalFiles,
      driversProcessed,
      collectedData,
    };
  } catch (error) {
    browser.log(`ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message,
      collectedData,
    };
  }
}

/**
 * Create a Cursor Browser MCP adapter.
 *
 * This adapter wraps the CallMcpTool calls into the browser interface
 * that all automation modules expect. The `callMcp` function is injected
 * by the AI agent at runtime.
 *
 * @param {function} callMcp - Function that calls an MCP tool: (toolName, args) => result
 * @returns {object} Browser adapter
 */
function createCursorBrowserAdapter(callMcp) {
  return {
    async navigate(url) {
      return callMcp('browser_navigate', { url });
    },

    async snapshot(opts = {}) {
      return callMcp('browser_snapshot', opts);
    },

    async click(ref, element) {
      return callMcp('browser_click', { ref, element });
    },

    async hover(ref, element) {
      return callMcp('browser_hover', { ref, element });
    },

    async fill(ref, value) {
      return callMcp('browser_fill', { ref, value });
    },

    async pressKey(key) {
      return callMcp('browser_press_key', { key });
    },

    async waitFor(opts) {
      return callMcp('browser_wait_for', opts);
    },

    log(msg) {
      console.log(`[UberReport] ${msg}`);
    },
  };
}

/**
 * Run extraction using the GraphQL API directly.
 * Much faster than DOM scraping: ~2 seconds for all drivers vs minutes.
 *
 * @param {function} fetchFn - fetch function (same-origin in browser, or node-fetch with cookies)
 * @param {object} options
 * @param {string} options.supplierUuid - Organization UUID (from URL /orgs/{uuid}/...)
 * @param {string} options.startTimeMs - Start time in unix milliseconds
 * @param {string} options.endTimeMs - End time in unix milliseconds
 * @param {string} options.periodLabel - Label for the period column in CSV
 * @param {string[]} [options.driverFilter] - Optional driver name filter fragments
 * @param {string} [options.outputDir] - CSV output directory
 * @param {object} [options.revenueFormula] - Revenue formula
 * @param {function} [options.onDriverExtracted] - Callback per driver
 * @returns {object} { success, filesCreated, driversProcessed, collectedData }
 */
async function runApiBasedExtraction(fetchFn, options = {}) {
  const {
    supplierUuid,
    startTimeMs,
    endTimeMs,
    periodLabel,
    driverFilter,
    outputDir,
    revenueFormula,
    onDriverExtracted,
    log = console.log,
  } = options;

  try {
    const collectedData = await runApiExtraction(fetchFn, {
      supplierUuid,
      startTimeMs,
      endTimeMs,
      periodLabel: periodLabel || `${new Date(Number(startTimeMs)).toLocaleDateString('de-DE')} - ${new Date(Number(endTimeMs)).toLocaleDateString('de-DE')}`,
      driverFilter,
      log,
      onDriverExtracted,
    });

    log('\n=== Dateien exportieren (CSV + PDF) ===');
    const driversProcessed = Object.keys(collectedData).length;
    const csvResult = exportAllCSV(collectedData, outputDir, revenueFormula);
    log(`${csvResult.filesCreated} CSV-Dateien exportiert`);

    const pdfResult = await exportAllPDF(collectedData, outputDir, revenueFormula);
    log(`${pdfResult.filesCreated} PDF-Dateien exportiert`);

    const totalFiles = csvResult.filesCreated + pdfResult.filesCreated;
    log(`Fertig! ${totalFiles} Dateien nach ${csvResult.outputDir}`);
    log(`${driversProcessed} Fahrer verarbeitet`);

    return {
      success: true,
      filesCreated: totalFiles,
      driversProcessed,
      collectedData,
    };
  } catch (error) {
    log(`ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message,
      collectedData: {},
    };
  }
}

module.exports = {
  runExtraction,
  runApiBasedExtraction,
  createCursorBrowserAdapter,
  mergeDriverData,
};
