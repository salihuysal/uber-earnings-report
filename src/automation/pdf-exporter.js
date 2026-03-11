/**
 * PDF export module.
 *
 * Generates PDF reports per driver with columns:
 *   F (Fahrtpreis/Fare), T (Trinkgeld/Tip), U (Umsatz/Revenue), C (Cashout/Payout)
 * Uses pdfkit for PDF generation.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { sanitizeFilename, todayString } = require('./helpers');
const { calculateRevenue } = require('./csv-exporter');
const CONFIG = require('./config');

const PAGE_MARGIN = 40;
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 28;
const FONT_SIZE = 9;
const HEADER_FONT_SIZE = 10;
const TITLE_FONT_SIZE = 14;
const SUBTITLE_FONT_SIZE = 10;

function formatDE(value) {
  if (typeof value !== 'number') return '';
  return value.toFixed(2).replace('.', ',');
}

/**
 * Build and write a PDF file for a single driver.
 *
 * @param {string} filepath - Destination path
 * @param {string} driverName - Driver's full name
 * @param {Array<object>} rows - Data rows with period, fare, tip, payout, etc.
 * @param {object} revenueFormula - Revenue formula for Umsatz calculation
 */
function buildDriverPDF(filepath, driverName, rows, revenueFormula) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    });

    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const cols = CONFIG.pdfExport.columns;
    const pageWidth = 595.28 - PAGE_MARGIN * 2;
    const totalDefinedWidth = cols.reduce((s, c) => s + c.width, 0);
    const scale = pageWidth / totalDefinedWidth;
    const colWidths = cols.map((c) => c.width * scale);

    // Title
    doc.fontSize(TITLE_FONT_SIZE).font('Helvetica-Bold');
    doc.text(driverName, PAGE_MARGIN, PAGE_MARGIN);
    doc.fontSize(SUBTITLE_FONT_SIZE).font('Helvetica');
    doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, PAGE_MARGIN, PAGE_MARGIN + 20);
    doc.moveDown(1.5);

    let y = doc.y;

    // Table header
    drawRow(doc, y, colWidths, cols.map((c) => c.header), true);
    y += HEADER_HEIGHT;

    // Totals accumulators
    const totals = { fare: 0, tip: 0, umsatz: 0, cashout: 0 };

    for (const row of rows) {
      if (y + ROW_HEIGHT > doc.page.height - PAGE_MARGIN - ROW_HEIGHT - 10) {
        doc.addPage();
        y = PAGE_MARGIN;
        drawRow(doc, y, colWidths, cols.map((c) => c.header), true);
        y += HEADER_HEIGHT;
      }

      const umsatz = calculateRevenue(row, revenueFormula);
      const values = cols.map((c) => {
        if (c.key === 'zeitraum') return row.period || '';
        if (c.key === 'fare') return formatDE(row.fare);
        if (c.key === 'tip') return formatDE(row.tip);
        if (c.key === 'umsatz') return formatDE(umsatz);
        if (c.key === 'cashout') return formatDE(row.payout);
        return '';
      });

      totals.fare += row.fare || 0;
      totals.tip += row.tip || 0;
      totals.umsatz += umsatz || 0;
      totals.cashout += row.payout || 0;

      drawRow(doc, y, colWidths, values, false);
      y += ROW_HEIGHT;
    }

    // Totals row
    if (y + ROW_HEIGHT > doc.page.height - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    doc
      .moveTo(PAGE_MARGIN, y)
      .lineTo(PAGE_MARGIN + pageWidth, y)
      .lineWidth(1)
      .stroke('#000000');
    y += 2;

    const totalValues = cols.map((c) => {
      if (c.key === 'zeitraum') return 'Summe';
      if (c.key === 'fare') return formatDE(totals.fare);
      if (c.key === 'tip') return formatDE(totals.tip);
      if (c.key === 'umsatz') return formatDE(totals.umsatz);
      if (c.key === 'cashout') return formatDE(totals.cashout);
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
 *
 * @param {object} collectedData - Map of driverName -> [{ period, fare, ... }]
 * @param {string} [outputDir] - Destination directory
 * @param {object} [revenueFormula] - Revenue formula for Umsatz
 * @returns {Promise<{filesCreated: number, outputDir: string}>}
 */
async function exportAllPDF(collectedData, outputDir, revenueFormula) {
  const dir = outputDir || path.join(process.cwd(), CONFIG.csvExport.subfolder);
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
