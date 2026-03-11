/**
 * PDF export module.
 *
 * Generates landscape A4 PDF reports per driver.
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

const PDF_COLUMNS = [
  { key: 'zeitraum', header: 'Zeitraum', weight: 2.2 },
  { key: 'fare', header: 'Fahrtpreis', weight: 1 },
  { key: 'serviceFee', header: 'Servicegebühr', weight: 1 },
  { key: 'promotions', header: 'Aktionen', weight: 1 },
  { key: 'tip', header: 'Trinkgeld', weight: 1 },
  { key: 'umsatz', header: 'Umsatz', weight: 1 },
  { key: 'payout', header: 'Payout', weight: 1 },
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

/**
 * Build and write a landscape PDF file for a single driver.
 */
function buildDriverPDF(filepath, driverName, rows, revenueFormula) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    });

    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const pageWidth = LANDSCAPE_WIDTH - PAGE_MARGIN * 2;
    const totalWeight = PDF_COLUMNS.reduce((s, c) => s + c.weight, 0);
    const colWidths = PDF_COLUMNS.map(c => (c.weight / totalWeight) * pageWidth);

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
    drawRow(doc, y, colWidths, PDF_COLUMNS.map(c => c.header), true);
    y += HEADER_HEIGHT;

    const totals = { fare: 0, serviceFee: 0, promotions: 0, tip: 0, umsatz: 0, payout: 0 };

    for (const row of rows) {
      if (y + ROW_HEIGHT > LANDSCAPE_HEIGHT - PAGE_MARGIN - ROW_HEIGHT - 10) {
        doc.addPage();
        y = PAGE_MARGIN;
        drawRow(doc, y, colWidths, PDF_COLUMNS.map(c => c.header), true);
        y += HEADER_HEIGHT;
      }

      const umsatz = calculateRevenue(row, revenueFormula);
      const values = PDF_COLUMNS.map(c => {
        if (c.key === 'zeitraum') return row.period || '';
        if (c.key === 'fare') return formatDE(row.fare);
        if (c.key === 'serviceFee') return formatDE(row.serviceFee);
        if (c.key === 'promotions') return formatDE(row.promotions);
        if (c.key === 'tip') return formatDE(row.tip);
        if (c.key === 'umsatz') return formatDE(umsatz);
        if (c.key === 'payout') return formatDE(row.payout);
        return '';
      });

      totals.fare += row.fare || 0;
      totals.serviceFee += row.serviceFee || 0;
      totals.promotions += row.promotions || 0;
      totals.tip += row.tip || 0;
      totals.umsatz += umsatz || 0;
      totals.payout += row.payout || 0;

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

    const totalValues = PDF_COLUMNS.map(c => {
      if (c.key === 'zeitraum') return 'Summe';
      if (c.key === 'fare') return formatDE(totals.fare);
      if (c.key === 'serviceFee') return formatDE(totals.serviceFee);
      if (c.key === 'promotions') return formatDE(totals.promotions);
      if (c.key === 'tip') return formatDE(totals.tip);
      if (c.key === 'umsatz') return formatDE(totals.umsatz);
      if (c.key === 'payout') return formatDE(totals.payout);
      return '';
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
async function exportAllPDF(collectedData, outputDir, revenueFormula) {
  const dir = outputDir || path.join(process.cwd(), 'Ubergo');
  fs.mkdirSync(dir, { recursive: true });

  const date = todayString();
  let filesCreated = 0;

  for (const [driverName, rows] of Object.entries(collectedData)) {
    const safeName = sanitizeFilename(driverName);
    const filename = `${safeName}_${date}.pdf`;
    const filepath = path.join(dir, filename);

    await buildDriverPDF(filepath, driverName, rows, revenueFormula);
    filesCreated++;
    console.log(`  [PDF] ${driverName} -> ${filename}`);
  }

  return { filesCreated, outputDir: dir };
}

module.exports = {
  buildDriverPDF,
  exportAllPDF,
};
