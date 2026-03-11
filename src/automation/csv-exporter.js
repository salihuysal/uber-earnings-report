/**
 * CSV export module.
 *
 * Generates semicolon-separated CSV files with German number formatting (comma decimals)
 * and writes them to the filesystem. One file per driver.
 * Supports a configurable "Umsatz" (revenue) column based on a formula.
 */

const fs = require('fs');
const path = require('path');
const { sanitizeFilename, todayString } = require('./helpers');
const CONFIG = require('./config');

/**
 * Escape a value for CSV (semicolon-separated).
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Format a number for German CSV (dot as thousands, comma as decimal).
 */
function formatNumber(value) {
  if (typeof value !== 'number') return '';
  return value.toFixed(2).replace('.', CONFIG.csvExport.decimalSeparator);
}

/**
 * Calculate revenue from a data row using the configured formula.
 * Formula is an object like { totalEarning: '+', payout: '-' }.
 */
function calculateRevenue(row, formula) {
  if (!formula || Object.keys(formula).length === 0) return null;
  let revenue = 0;
  for (const [field, sign] of Object.entries(formula)) {
    const val = typeof row[field] === 'number' ? Math.abs(row[field]) : 0;
    if (sign === '+') revenue += val;
    else if (sign === '-') revenue -= val;
  }
  return revenue;
}

/**
 * Build a CSV string from a driver's data rows.
 *
 * @param {Array<object>} rows - Array of { period, fare, serviceFee, tip, promotions, ... }
 * @param {object} [revenueFormula] - Revenue formula: { field: '+'/'-' }
 * @returns {string} CSV content (without BOM)
 */
function buildCSV(rows, revenueFormula) {
  const { columns, headers, separator } = CONFIG.csvExport;
  const hasRevenue = revenueFormula && Object.keys(revenueFormula).length > 0;

  const allColumns = [...columns];
  const allHeaders = { ...headers };
  if (hasRevenue) {
    allColumns.push('umsatz');
    allHeaders.umsatz = 'Umsatz';
  }

  const headerLine = allColumns.map((col) => escapeCSV(allHeaders[col])).join(separator);
  const dataLines = rows.map((row) =>
    allColumns
      .map((col) => {
        if (col === 'zeitraum') return escapeCSV(row.period);
        if (col === 'umsatz') return formatNumber(calculateRevenue(row, revenueFormula));
        const value = row[col];
        return typeof value === 'number' ? formatNumber(value) : escapeCSV(value ?? '');
      })
      .join(separator)
  );

  return headerLine + '\n' + dataLines.join('\n') + '\n';
}

/**
 * Write all collected data to CSV files, one per driver.
 *
 * @param {object} collectedData - Map of driverName -> [{ period, fare, ... }]
 * @param {string} [outputDir] - Destination directory (defaults to ./Uber_Reports)
 * @param {object} [revenueFormula] - Revenue formula: { field: '+'/'-' }
 * @returns {{filesCreated: number, outputDir: string}}
 */
function exportAllCSV(collectedData, outputDir, revenueFormula) {
  const dir = outputDir || path.join(process.cwd(), CONFIG.csvExport.subfolder);
  fs.mkdirSync(dir, { recursive: true });

  const date = todayString();
  let filesCreated = 0;

  for (const [driverName, rows] of Object.entries(collectedData)) {
    const csv = buildCSV(rows, revenueFormula);
    const safeName = sanitizeFilename(driverName);
    const filename = `${safeName}_${date}.csv`;
    const filepath = path.join(dir, filename);

    fs.writeFileSync(filepath, CONFIG.csvExport.bom + csv, 'utf-8');
    filesCreated++;
    console.log(`  [CSV] ${driverName} -> ${filename}`);
  }

  return { filesCreated, outputDir: dir };
}

module.exports = {
  escapeCSV,
  formatNumber,
  calculateRevenue,
  buildCSV,
  exportAllCSV,
};
