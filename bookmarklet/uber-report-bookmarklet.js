/**
 * Uber Earnings Report Generator - Bookmarklet Version
 * 
 * INSTALLATION:
 * 1. Erstelle ein neues Lesezeichen in Chrome
 * 2. Name: "Uber Report Generator"
 * 3. URL: Kopiere den Inhalt aus "bookmarklet-code.txt"
 * 
 * BENUTZUNG:
 * 1. Öffne das Uber Supplier Portal
 * 2. Gehe zur Earnings-Seite
 * 3. Öffne das Zeitraum-Dropdown
 * 4. Klicke auf das Lesezeichen
 */

(function() {
  'use strict';

  // =====================================================
  // KONFIGURATION (anpassbar)
  // =====================================================
  
  const CONFIG = {
    labels: {
      fare: { en: "Fare", de: "Fahrtpreis" },
      serviceFee: { en: "Service fee", de: "Servicegebühr" },
      tip: { en: "Tip", de: "Trinkgeld" },
      promotions: { en: "Promotions", de: "Aktionen" },
      totalEarning: { en: "Total earning", de: "Gesamtumsatz" },
      refundsExpenses: { en: "Refunds & expenses", de: "Erstattungen" },
      yourEarnings: { en: "Your earnings", de: "Deine Einnahmen" },
      adjustments: { en: "Adjustments", de: "Anpassungen" },
      cashCollected: { en: "Cash collected", de: "Bar eingenommen" },
      payout: { en: "Payout", de: "Auszahlung" }
    },
    timing: {
      afterClick: 500,
      betweenDrivers: 300,
      afterPeriodChange: 1500
    },
    export: {
      filePrefix: "Uber_Earnings_",
      columns: ["zeitraum", "fare", "serviceFee", "tip", "promotions", "totalEarning", "refundsExpenses", "yourEarnings", "adjustments", "cashCollected", "payout", "netEarnings"],
      columnHeaders: {
        zeitraum: "Zeitraum",
        fare: "Fahrtpreis",
        serviceFee: "Servicegebühr",
        tip: "Trinkgeld",
        promotions: "Promotions",
        totalEarning: "Gesamtumsatz",
        refundsExpenses: "Erstattungen",
        yourEarnings: "Deine Einnahmen (Anpassungen)",
        adjustments: "Anpassungen",
        cashCollected: "Bar eingenommen",
        payout: "Auszahlung",
        netEarnings: "Nettoeinnahmen"
      }
    }
  };

  // =====================================================
  // UI OVERLAY
  // =====================================================
  
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'uber-report-overlay';
    overlay.innerHTML = `
      <style>
        #uber-report-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        #uber-report-modal {
          background: #fff;
          border-radius: 16px;
          padding: 32px;
          max-width: 450px;
          width: 90%;
          text-align: center;
          box-shadow: 0 25px 80px rgba(0,0,0,0.4);
        }
        #uber-report-modal h2 {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: #000;
        }
        #uber-report-modal .subtitle {
          font-size: 14px;
          color: #666;
          margin-bottom: 24px;
        }
        #uber-report-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #eee;
          border-top-color: #000;
          border-radius: 50%;
          animation: uber-spin 1s linear infinite;
          margin: 0 auto 24px;
        }
        @keyframes uber-spin { to { transform: rotate(360deg); } }
        #uber-report-progress {
          background: #eee;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        #uber-report-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #00b37a, #00d68f);
          width: 0%;
          transition: width 0.3s ease;
        }
        #uber-report-status {
          font-size: 13px;
          color: #666;
          margin-bottom: 8px;
        }
        #uber-report-log {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 12px;
          max-height: 150px;
          overflow-y: auto;
          text-align: left;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 11px;
          color: #333;
          margin-top: 16px;
        }
        #uber-report-log .success { color: #00875a; }
        #uber-report-log .error { color: #de350b; }
        #uber-report-buttons {
          margin-top: 20px;
          display: flex;
          gap: 10px;
          justify-content: center;
        }
        #uber-report-buttons button {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        #uber-report-start {
          background: #000;
          color: #fff;
        }
        #uber-report-start:hover { background: #333; }
        #uber-report-cancel {
          background: #eee;
          color: #333;
        }
        #uber-report-cancel:hover { background: #ddd; }
        #uber-report-close {
          background: #00b37a;
          color: #fff;
          display: none;
        }
        #uber-report-close:hover { background: #009966; }
      </style>
      <div id="uber-report-modal">
        <h2>📊 Uber Earnings Report</h2>
        <p class="subtitle">Automatischer Excel-Export</p>
        <div id="uber-report-spinner" style="display:none;"></div>
        <div id="uber-report-progress" style="display:none;">
          <div id="uber-report-progress-bar"></div>
        </div>
        <div id="uber-report-status">Bereit zum Starten</div>
        <div id="uber-report-log"></div>
        <div id="uber-report-buttons">
          <button id="uber-report-start">▶ Report generieren</button>
          <button id="uber-report-cancel">✕ Schließen</button>
          <button id="uber-report-close">✓ Fertig</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    document.getElementById('uber-report-cancel').onclick = () => {
      shouldStop = true;
      overlay.remove();
    };
    
    document.getElementById('uber-report-close').onclick = () => overlay.remove();
    document.getElementById('uber-report-start').onclick = startExtraction;
    
    return overlay;
  }
  
  function updateProgress(percent, status) {
    const bar = document.getElementById('uber-report-progress-bar');
    const statusEl = document.getElementById('uber-report-status');
    if (bar) bar.style.width = percent + '%';
    if (statusEl) statusEl.textContent = status;
  }
  
  function addLog(message, type = '') {
    const log = document.getElementById('uber-report-log');
    if (log) {
      const entry = document.createElement('div');
      entry.className = type;
      entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }
  }
  
  function showSpinner(show) {
    const spinner = document.getElementById('uber-report-spinner');
    const progress = document.getElementById('uber-report-progress');
    if (spinner) spinner.style.display = show ? 'block' : 'none';
    if (progress) progress.style.display = show ? 'block' : 'none';
  }

  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================
  
  let shouldStop = false;
  let collectedData = {};
  
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function parseAmount(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[€\s]/g, '').replace(',', '.');
    const value = parseFloat(cleaned);
    return isNaN(value) ? 0 : value;
  }

  // =====================================================
  // DOM EXTRACTION
  // =====================================================
  
  function getAvailablePeriods() {
    const periods = [];
    const listbox = document.querySelector('[role="listbox"][aria-label="Menu"]');
    if (listbox) {
      const options = listbox.querySelectorAll('[role="option"]');
      options.forEach(option => {
        const text = option.textContent.trim();
        if (text) periods.push({ text, element: option });
      });
    }
    return periods;
  }
  
  function getDriversFromTable() {
    const drivers = [];
    const grid = document.querySelector('[role="grid"]');
    if (!grid) return drivers;
    
    const rowgroup = grid.querySelector('[role="rowgroup"]');
    if (!rowgroup) return drivers;
    
    const rows = rowgroup.querySelectorAll('[role="row"]');
    rows.forEach((row, index) => {
      const cells = row.querySelectorAll('[role="gridcell"]');
      if (cells.length >= 6) {
        drivers.push({
          index,
          name: cells[0]?.textContent?.trim() || `Fahrer_${index + 1}`,
          totalEarning: parseAmount(cells[1]?.textContent),
          refundsExpenses: parseAmount(cells[2]?.textContent),
          adjustments: parseAmount(cells[3]?.textContent),
          payout: parseAmount(cells[4]?.textContent),
          netEarnings: parseAmount(cells[5]?.textContent),
          rowElement: row,
          expandButton: cells[6]?.querySelector('button')
        });
      }
    });
    return drivers;
  }
  
  async function expandDriverDetails(driver) {
    if (driver.expandButton) {
      driver.expandButton.click();
      await sleep(CONFIG.timing.afterClick);
    }
  }
  
  async function extractDetailData() {
    const details = { fare: 0, serviceFee: 0, tip: 0, promotions: 0, yourEarnings: 0, cashCollected: 0 };
    const listItems = document.querySelectorAll('[role="listitem"]');
    const labels = CONFIG.labels;

    const sectionsToExpand = [
      { en: 'Total earning', de: 'Gesamtumsatz' },
      { en: 'Adjustments', de: 'Anpassungen' },
      { en: 'Payout', de: 'Auszahlung' },
    ];

    for (const section of sectionsToExpand) {
      for (const item of listItems) {
        const text = item.textContent;
        const button = item.querySelector('button');
        if (button && (text.includes(section.en) || text.includes(section.de))) {
          button.click();
          await sleep(CONFIG.timing.afterClick);
          break;
        }
      }
    }

    const allItems = document.querySelectorAll('[role="listitem"], li');
    for (const detailItem of allItems) {
      const detailText = detailItem.textContent;
      const amountMatch = detailText.match(/[€]?\s*([-]?\d+[.,]?\d*)/);
      const amount = amountMatch ? parseAmount(amountMatch[0]) : 0;

      if (detailText.includes(labels.fare.en) || detailText.includes(labels.fare.de)) {
        details.fare = amount;
      } else if (detailText.includes(labels.serviceFee.en) || detailText.includes(labels.serviceFee.de)) {
        details.serviceFee = amount;
      } else if (detailText.includes(labels.tip.en) || detailText.includes(labels.tip.de)) {
        details.tip = amount;
      } else if (detailText.includes(labels.promotions.en) || detailText.includes(labels.promotions.de)) {
        details.promotions = amount;
      } else if (detailText.includes(labels.yourEarnings.en) || detailText.includes(labels.yourEarnings.de)) {
        details.yourEarnings = amount;
      } else if (detailText.includes(labels.cashCollected.en) || detailText.includes(labels.cashCollected.de)) {
        details.cashCollected = amount;
      }
    }

    return details;
  }
  
  function hasNextPage() {
    const nextBtn = document.querySelector('[data-testid="next-button"]');
    return nextBtn && !nextBtn.disabled;
  }
  
  async function clickNextPage() {
    const nextBtn = document.querySelector('[data-testid="next-button"]');
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.click();
      await sleep(CONFIG.timing.afterClick);
      return true;
    }
    return false;
  }
  
  async function selectPeriod(periodOption) {
    const dropdownBtn = document.querySelector('[role="tabpanel"] button');
    if (dropdownBtn) {
      dropdownBtn.click();
      await sleep(300);
    }
    
    if (periodOption.element) {
      periodOption.element.click();
    } else {
      const options = document.querySelectorAll('[role="option"]');
      for (const opt of options) {
        if (opt.textContent.includes(periodOption.text)) {
          opt.click();
          break;
        }
      }
    }
    await sleep(CONFIG.timing.afterPeriodChange);
  }

  // =====================================================
  // CSV EXPORT (keine externe Bibliothek nötig)
  // =====================================================
  
  function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
  
  function createCSVForDriver(driverName, data) {
    const headers = CONFIG.export.columnHeaders;
    const columns = CONFIG.export.columns;
    
    // Header row
    let csv = columns.map(col => escapeCSV(headers[col] || col)).join(';') + '\n';
    
    // Data rows
    for (const row of data) {
      csv += columns.map(col => {
        if (col === 'zeitraum') return escapeCSV(row.period);
        const value = row[col];
        // Format numbers with comma as decimal separator for German Excel
        if (typeof value === 'number') {
          return String(value).replace('.', ',');
        }
        return escapeCSV(value !== undefined ? value : '');
      }).join(';') + '\n';
    }
    
    return csv;
  }
  
  function downloadCSV(driverName, csvContent) {
    const safeName = driverName.replace(/[^a-zA-Z0-9äöüÄÖÜß\s]/g, '').replace(/\s+/g, '_');
    const date = new Date().toISOString().split('T')[0];
    const filename = `${CONFIG.export.filePrefix}${safeName}_${date}.csv`;
    
    // Add BOM for Excel UTF-8 compatibility
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // =====================================================
  // API EXTRACTION (GraphQL)
  // =====================================================

  const EARNER_QUERY = 'query getEarnerBreakdownsV2($supplierUuid: ID!, $timeRange: OneOfTimeRange__Input, $driverListOrPageOptions: DriverListOrPagination, $driverList: [ID!], $pageOptions: PaginationOption__Input, $locale: String, $excludeAdjustmentItems: Boolean) { getEarnerBreakdownsV2(supplierUuid: $supplierUuid, timeRange: $timeRange, driverList: $driverList, pageOptions: $pageOptions, driverListOrPageOptions: $driverListOrPageOptions, locale: $locale, excludeAdjustmentItems: $excludeAdjustmentItems) { earnerEarningsBreakdowns { earnerMetadata { name } netOutstanding { amountE5 } earnings { categoryName amount { amountE5 } children { categoryName amount { amountE5 } } } reimbursements { amount { amountE5 } } payouts { amount { amountE5 } children { categoryName amount { amountE5 } } } adjustmentsFromPreviousPeriods { amount { amountE5 } } } pageInfo { nextPageToken } } }';
  const TW_QUERY = 'query GetReportingTimeWindows($orgId: ID!) { getReportingTimeWindows(orgId: $orgId) { timeWindows { startTimeUnixMillis endTimeUnixMillis } } }';

  function fromE5(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : n / 100000; }
  function getSupplierUuid() { const m = window.location.href.match(/\/orgs\/([a-f0-9-]+)/); return m ? m[1] : null; }

  async function gqlFetch(op, vars, query) {
    const r = await fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'x' },
      credentials: 'include',
      body: JSON.stringify({ operationName: op, variables: vars, query }),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  }

  async function fetchTimeWindows(uuid) {
    const json = await gqlFetch('GetReportingTimeWindows', { orgId: uuid }, TW_QUERY);
    return (json.data?.getReportingTimeWindows?.timeWindows || []).map(w => {
      const s = w.startTimeUnixMillis?.value || w.startTimeUnixMillis;
      const e = w.endTimeUnixMillis?.value || w.endTimeUnixMillis;
      const fmt = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return {
        startMs: String(s),
        endMs: e ? String(e) : String(Date.now()),
        label: `${fmt(new Date(Number(s)))} - ${fmt(new Date(e ? Number(e) : Date.now()))}`,
      };
    });
  }

  function parseEarnerApi(e) {
    const ec = e.earnings?.children || [], pc = e.payouts?.children || [];
    const f = (arr, cat) => arr.find(c => c.categoryName === cat);
    return {
      name: e.earnerMetadata?.name || 'Unknown',
      fare: fromE5(f(ec, 'fare')?.amount?.amountE5),
      serviceFee: fromE5(f(ec, 'service_fee')?.amount?.amountE5),
      tip: fromE5(f(ec, 'tip')?.amount?.amountE5),
      promotions: fromE5(f(ec, 'promotion')?.amount?.amountE5),
      yourEarnings: fromE5(e.earnings?.amount?.amountE5) + fromE5(e.reimbursements?.amount?.amountE5),
      totalEarning: fromE5(e.earnings?.amount?.amountE5),
      refundsExpenses: fromE5(e.reimbursements?.amount?.amountE5),
      adjustments: fromE5(e.adjustmentsFromPreviousPeriods?.amount?.amountE5),
      cashCollected: fromE5(f(pc, 'cash_collected')?.amount?.amountE5),
      payout: fromE5(e.payouts?.amount?.amountE5),
      netEarnings: fromE5(e.netOutstanding?.amountE5),
    };
  }

  // =====================================================
  // MAIN EXTRACTION (API-based)
  // =====================================================
  
  async function startExtraction() {
    shouldStop = false;
    collectedData = {};
    
    const startBtn = document.getElementById('uber-report-start');
    const cancelBtn = document.getElementById('uber-report-cancel');
    const closeBtn = document.getElementById('uber-report-close');
    
    startBtn.style.display = 'none';
    cancelBtn.textContent = '⏹ Abbrechen';
    showSpinner(true);
    
    try {
      const uuid = getSupplierUuid();
      if (!uuid) throw new Error('Supplier UUID nicht in URL gefunden!');

      addLog('Lade Zeitfenster via API...');
      const timeWindows = await fetchTimeWindows(uuid);
      addLog(`${timeWindows.length} Zeitfenster gefunden`);

      for (let twIdx = 0; twIdx < timeWindows.length && !shouldStop; twIdx++) {
        const tw = timeWindows[twIdx];
        const progress = ((twIdx + 1) / timeWindows.length) * 100;
        updateProgress(progress, `Zeitraum ${twIdx + 1}/${timeWindows.length}: ${tw.label}`);
        addLog(`Lade: ${tw.label}`);

        let pageToken = '';
        let pageNum = 1;
        while (!shouldStop) {
          const json = await gqlFetch('getEarnerBreakdownsV2', {
            supplierUuid: uuid,
            timeRange: { unixMilliOrDate: 'Unix_Time_Range', startTimeUnixMillis: tw.startMs, endTimeUnixMillis: tw.endMs },
            driverListOrPageOptions: 'Page_Options',
            pageOptions: { pageSize: 10, pageToken },
            driverList: null,
            excludeAdjustmentItems: true,
          }, EARNER_QUERY);

          const data = json.data?.getEarnerBreakdownsV2;
          if (!data) throw new Error(json.errors?.[0]?.message || 'API Fehler');
          const earners = data.earnerEarningsBreakdowns || [];
          addLog(`Seite ${pageNum}: ${earners.length} Fahrer`);

          for (const earner of earners) {
            const p = parseEarnerApi(earner);
            if (!collectedData[p.name]) collectedData[p.name] = [];
            collectedData[p.name].push({
              period: tw.label,
              fare: p.fare, serviceFee: p.serviceFee, tip: p.tip,
              promotions: p.promotions, totalEarning: p.totalEarning,
              refundsExpenses: p.refundsExpenses, yourEarnings: p.yourEarnings,
              adjustments: p.adjustments, cashCollected: p.cashCollected,
              payout: p.payout, netEarnings: p.netEarnings,
            });
          }

          const next = data.pageInfo?.nextPageToken;
          if (next && earners.length > 0) { pageToken = next; pageNum++; }
          else break;
        }
      }
      
      const driverNames = Object.keys(collectedData);
      addLog(`Erstelle ${driverNames.length} CSV-Dateien...`, 'success');
      
      for (const driverName of driverNames) {
        const csv = createCSVForDriver(driverName, collectedData[driverName]);
        downloadCSV(driverName, csv);
        addLog(`✓ ${driverName}`, 'success');
        await sleep(200);
      }
      
      updateProgress(100, 'Fertig!');
      addLog(`✅ ${driverNames.length} Dateien erfolgreich erstellt!`, 'success');
      
      cancelBtn.style.display = 'none';
      closeBtn.style.display = 'inline-block';
      
    } catch (error) {
      addLog(`❌ Fehler: ${error.message}`, 'error');
      updateProgress(0, 'Fehler aufgetreten');
      startBtn.style.display = 'inline-block';
      startBtn.textContent = '🔄 Erneut versuchen';
    } finally {
      showSpinner(false);
    }
  }

  // =====================================================
  // INITIALIZATION
  // =====================================================
  
  // Check if we're on the right page
  if (!window.location.href.includes('supplier.uber.com')) {
    alert('⚠️ Bitte öffne zuerst das Uber Supplier Portal!\n\nhttps://supplier.uber.com');
    return;
  }
  
  if (!window.location.href.includes('/earnings')) {
    alert('⚠️ Bitte navigiere zur "Earnings" / "Umsätze" Seite!');
    return;
  }
  
  // Remove existing overlay if present
  const existing = document.getElementById('uber-report-overlay');
  if (existing) existing.remove();
  
  // Create and show overlay
  createOverlay();
  
  console.log('🚀 Uber Earnings Report Generator geladen');
  
})();
