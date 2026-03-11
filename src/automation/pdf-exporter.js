/**
 * PDF export module.
 *
 * Generates landscape A4 PDF reports per driver with configurable columns.
 * Uses pdfkit for PDF generation.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { sanitizeFilename, todayString } = require('./helpers');
const { calculateRevenue } = require('./csv-exporter');

const PAGE_MARGIN = 28;
const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 24;
const FONT_SIZE = 8;
const HEADER_FONT_SIZE = 8.5;
const TITLE_FONT_SIZE = 13;
const SUBTITLE_FONT_SIZE = 9;
const FORMULA_FONT_SIZE = 7;

const LANDSCAPE_WIDTH = 841.89;
const LANDSCAPE_HEIGHT = 595.28;

const DEFAULT_COLUMNS = [
  { key: 'zeitraum', label: 'Zeitraum' },
  { key: 'fare', label: 'Fahrtpreis' },
  { key: 'serviceFee', label: 'Servicegebühr' },
  { key: 'promotions', label: 'Aktionen' },
  { key: 'tip', label: 'Trinkgeld' },
  { key: 'umsatz', label: 'Umsatz' },
  { key: 'payout', label: 'Payout' },
];

const FIELD_LABELS = {
  fare: 'Fahrtpreis',
  serviceFee: 'Servicegebühr',
  tip: 'Trinkgeld',
  promotions: 'Aktionen',
  totalEarning: 'Total Earnings',
  refundsExpenses: 'Refunds & Expenses',
  yourEarnings: 'Your Earnings',
  adjustments: 'Adjustments',
  cashCollected: 'Cash Collected',
  payout: 'Payout',
  netEarnings: 'Net Earnings',
};

function formatDE(value) {
  if (typeof value !== 'number') return '';
  return value.toFixed(2).replace('.', ',');
}

function buildFormulaText(revenueFormula) {
  if (!revenueFormula || Object.keys(revenueFormula).length === 0) return '';
  const parts = [];
  for (const [field, sign] of Object.entries(revenueFormula)) {
    const label = FIELD_LABELS[field] || field;
    parts.push(`${sign === '+' ? '+' : '−'} ${label}`);
  }
  let text = parts.join(' ');
  if (text.startsWith('+ ')) text = text.substring(2);
  return `Umsatz = ${text}`;
}

function getCellValue(row, key, umsatz) {
  if (key === 'zeitraum') return row.period || '';
  if (key === 'umsatz') return formatDE(umsatz);
  const val = row[key];
  return typeof val === 'number' ? formatDE(val) : '';
}

function getNumericValue(row, key, umsatz) {
  if (key === 'umsatz') return umsatz || 0;
  if (key === 'zeitraum') return 0;
  return typeof row[key] === 'number' ? row[key] : 0;
}

/**
 * Build and write a landscape PDF file for a single driver.
 */
function buildDriverPDF(filepath, driverName, rows, revenueFormula, columns) {
  return new Promise((resolve, reject) => {
    const cols = columns && columns.length > 0 ? columns : DEFAULT_COLUMNS;

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    });

    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const pageWidth = LANDSCAPE_WIDTH - PAGE_MARGIN * 2;
    const weights = cols.map(c => c.key === 'zeitraum' ? 2.2 : 1);
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    const colWidths = weights.map(w => (w / totalWeight) * pageWidth);
    const headers = cols.map(c => c.label || FIELD_LABELS[c.key] || c.key);

    // Title
    doc.fontSize(TITLE_FONT_SIZE).font('Helvetica-Bold');
    doc.text(driverName, PAGE_MARGIN, PAGE_MARGIN);

    doc.fontSize(SUBTITLE_FONT_SIZE).font('Helvetica');
    doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, PAGE_MARGIN, PAGE_MARGIN + 18);

    // Formula note
    const formulaText = buildFormulaText(revenueFormula);
    if (formulaText) {
      doc.fontSize(FORMULA_FONT_SIZE).font('Helvetica-Oblique').fillColor('#666666');
      doc.text(formulaText, PAGE_MARGIN, PAGE_MARGIN + 30);
      doc.fillColor('#000000');
      doc.moveDown(0.3);
    }

    let y = PAGE_MARGIN + (formulaText ? 44 : 36);

    // Table header
    drawRow(doc, y, colWidths, headers, true);
    y += HEADER_HEIGHT;

    // Totals accumulator
    const totals = {};
    for (const c of cols) totals[c.key] = 0;

    for (const row of rows) {
      if (y + ROW_HEIGHT > LANDSCAPE_HEIGHT - PAGE_MARGIN - ROW_HEIGHT - 10) {
        doc.addPage();
        y = PAGE_MARGIN;
        drawRow(doc, y, colWidths, headers, true);
        y += HEADER_HEIGHT;
      }

      const umsatz = calculateRevenue(row, revenueFormula);
      const values = cols.map(c => getCellValue(row, c.key, umsatz));

      for (const c of cols) {
        totals[c.key] += getNumericValue(row, c.key, umsatz);
      }

      drawRow(doc, y, colWidths, values, false);
      y += ROW_HEIGHT;
    }

    // Totals row
    if (y + ROW_HEIGHT > LANDSCAPE_HEIGHT - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    doc
      .moveTo(PAGE_MARGIN, y)
      .lineTo(PAGE_MARGIN + pageWidth, y)
      .lineWidth(1)
      .stroke('#000000');
    y += 2;

    const totalValues = cols.map(c => {
      if (c.key === 'zeitraum') return 'Summe';
      return formatDE(totals[c.key]);
    });
    drawRow(doc, y, colWidths, totalValues, true);

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

function drawRow(doc, y, colWidths, values, isHeader) {
  const fontSize = isHeader ? HEADER_FONT_SIZE : FONT_SIZE;
  const font = isHeader ? 'Helvetica-Bold' : 'Helvetica';

  if (isHeader) {
    doc.save();
    doc.rect(PAGE_MARGIN, y, colWidths.reduce((a, b) => a + b, 0), HEADER_HEIGHT)
      .fill('#f0f0f0');
    doc.restore();
  }

  doc.fontSize(fontSize).font(font);
  let x = PAGE_MARGIN;
  const textY = y + (isHeader ? (HEADER_HEIGHT - fontSize) / 2 : (ROW_HEIGHT - fontSize) / 2);

  for (let i = 0; i < values.length; i++) {
    const align = i === 0 ? 'left' : 'right';
    const padding = 4;
    const textWidth = colWidths[i] - padding * 2;

    doc.text(values[i], x + padding, textY, {
      width: textWidth,
      align,
      lineBreak: false,
    });
    x += colWidths[i];
  }

  if (!isHeader) {
    doc.save();
    doc.moveTo(PAGE_MARGIN, y + ROW_HEIGHT)
      .lineTo(PAGE_MARGIN + colWidths.reduce((a, b) => a + b, 0), y + ROW_HEIGHT)
      .lineWidth(0.3)
      .stroke('#e0e0e0');
    doc.restore();
  }
}

/**
 * Export all collected data to PDF files, one per driver.
 */
async function exportAllPDF(collectedData, outputDir, revenueFormula, exportColumns) {
  const dir = outputDir || path.join(process.cwd(), 'Ubergo');
  fs.mkdirSync(dir, { recursive: true });

  const date = todayString();
  let filesCreated = 0;

  for (const [driverName, rows] of Object.entries(collectedData)) {
    const safeName = sanitizeFilename(driverName);
    const filename = `${safeName}_${date}.pdf`;
    const filepath = path.join(dir, filename);

    await buildDriverPDF(filepath, driverName, rows, revenueFormula, exportColumns);
    filesCreated++;
    console.log(`  [PDF] ${driverName} -> ${filename}`);
  }

  return { filesCreated, outputDir: dir };
}

module.exports = {
  buildDriverPDF,
  exportAllPDF,
};
