// =========================================
// DOM Elements
// =========================================
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const steps = document.querySelectorAll('.step');

const btnLaunch = document.getElementById('btnLaunch');
const btnCheckLogin = document.getElementById('btnCheckLogin');
const loginStatus = document.getElementById('loginStatus');

const periodList = document.getElementById('periodList');
const btnLoadPeriods = document.getElementById('btnLoadPeriods');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnSelectNone = document.getElementById('btnSelectNone');
const btnModeSettlement = document.getElementById('btnModeSettlement');
const btnModeMonth = document.getElementById('btnModeMonth');
const settlementMode = document.getElementById('settlementMode');
const monthMode = document.getElementById('monthMode');
const selMonth = document.getElementById('selMonth');
const selYear = document.getElementById('selYear');
const monthHint = document.getElementById('monthHint');
const chkDriverFilter = document.getElementById('chkDriverFilter');
const driverList = document.getElementById('driverList');
const driverCheckboxes = document.getElementById('driverCheckboxes');
const btnReloadDrivers = document.getElementById('btnReloadDrivers');
const btnSelectAllDrivers = document.getElementById('btnSelectAllDrivers');
const btnSelectNoDrivers = document.getElementById('btnSelectNoDrivers');
const driverCount = document.getElementById('driverCount');
const txtOutputDir = document.getElementById('txtOutputDir');
const btnChooseDir = document.getElementById('btnChooseDir');
const btnBackToLogin = document.getElementById('btnBackToLogin');
const btnStartExtraction = document.getElementById('btnStartExtraction');

const revenueFields = document.getElementById('revenueFields');
const revenueSummary = document.getElementById('revenueSummary');
const btnResetFormula = document.getElementById('btnResetFormula');

const step3Title = document.getElementById('step3Title');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const dataTableContainer = document.getElementById('dataTableContainer');
const dataTableBody = document.getElementById('dataTableBody');
const logArea = document.getElementById('logArea');
const resultsSection = document.getElementById('resultsSection');
const resultCount = document.getElementById('resultCount');
const resultDir = document.getElementById('resultDir');
const btnOpenDir = document.getElementById('btnOpenDir');
const btnBackToPeriods = document.getElementById('btnBackToPeriods');

const btnClearSession = document.getElementById('btnClearSession');

const updateBanner = document.getElementById('updateBanner');
const btnInstallUpdate = document.getElementById('btnInstallUpdate');

// =========================================
// State
// =========================================
let periods = [];
let outputDir = '';
let logLines = [];
let periodMode = 'settlement';
let cachedDrivers = [];
let driversLoaded = false;

const REVENUE_FIELDS = [
  { key: 'fare', label: 'Fahrtpreis (Fare)' },
  { key: 'serviceFee', label: 'Servicegebühr (Service Fee)' },
  { key: 'tip', label: 'Trinkgeld (Tip)' },
  { key: 'promotions', label: 'Aktionen (Promotions)' },
  { key: 'totalEarning', label: 'Total Earnings' },
  { key: 'refundsExpenses', label: 'Refunds & Expenses' },
  { key: 'yourEarnings', label: 'Your Earnings (Adj.)' },
  { key: 'adjustments', label: 'Adjustments' },
  { key: 'cashCollected', label: 'Cash Collected' },
  { key: 'payout', label: 'Payout' },
  { key: 'netEarnings', label: 'Net Earnings' },
];

const DEFAULT_FORMULA = { fare: '+', serviceFee: '-' };

let revenueFormula = loadFormula();

// =========================================
// Step Navigation
// =========================================
function showStep(n) {
  step1.classList.toggle('hidden', n !== 1);
  step2.classList.toggle('hidden', n !== 2);
  step3.classList.toggle('hidden', n !== 3);

  steps.forEach((s) => {
    const sn = parseInt(s.dataset.step);
    s.classList.toggle('active', sn === n);
    s.classList.toggle('done', sn < n);
  });

  if (n === 2) {
    loadCachedDrivers();
    if (!driversLoaded) {
      loadDriversFromPortal();
    }
  }
}

// =========================================
// Step 1: Login
// =========================================
btnLaunch.addEventListener('click', async () => {
  btnLaunch.disabled = true;
  loginStatus.classList.remove('hidden');
  loginStatus.querySelector('span').textContent = 'Browser wird gestartet...';

  try {
    const { hadSession } = await window.api.launchBrowser();
    btnCheckLogin.classList.remove('hidden');
    btnClearSession.classList.remove('hidden');
    if (hadSession) {
      loginStatus.querySelector('span').textContent = 'Session wiederhergestellt. Prüfe Login...';
      setTimeout(async () => {
        try {
          btnCheckLogin.disabled = true;
          const { loggedIn } = await window.api.checkLogin();
          if (loggedIn) {
            loginStatus.querySelector('span').textContent = 'Navigiere zur Earnings-Seite...';
            await window.api.goToEarnings();
            showStep(2);
          } else {
            loginStatus.querySelector('span').textContent = 'Session abgelaufen. Bitte erneut anmelden.';
          }
        } catch (e) {
          loginStatus.querySelector('span').textContent = 'Bitte manuell auf "Weiter" klicken.';
        } finally {
          btnCheckLogin.disabled = false;
        }
      }, 3000);
    } else {
      loginStatus.querySelector('span').textContent = 'Browser ist offen. Bitte melde dich an.';
    }
  } catch (err) {
    loginStatus.querySelector('span').textContent = 'Fehler: ' + err.message;
  } finally {
    btnLaunch.disabled = false;
  }
});

btnClearSession.addEventListener('click', async () => {
  await window.api.clearSession();
  loginStatus.querySelector('span').textContent = 'Session gelöscht. Bitte melde dich erneut an.';
});

btnCheckLogin.addEventListener('click', async () => {
  btnCheckLogin.disabled = true;
  loginStatus.querySelector('span').textContent = 'Prüfe Anmeldestatus...';

  try {
    const { loggedIn } = await window.api.checkLogin();

    if (!loggedIn) {
      loginStatus.querySelector('span').textContent = 'Noch nicht angemeldet. Bitte zuerst im Browser einloggen.';
      btnCheckLogin.disabled = false;
      return;
    }

    loginStatus.querySelector('span').textContent = 'Angemeldet! Navigiere zur Earnings-Seite...';
    await window.api.goToEarnings();

    showStep(2);
  } catch (err) {
    loginStatus.querySelector('span').textContent = 'Fehler: ' + err.message;
  } finally {
    btnCheckLogin.disabled = false;
  }
});

// =========================================
// Driver Cache
// =========================================
function loadCachedDrivers() {
  try {
    const cached = localStorage.getItem('cachedDrivers');
    if (cached) {
      cachedDrivers = JSON.parse(cached);
      renderDriverList();
    }
  } catch (e) {
    cachedDrivers = [];
  }
}

async function loadDriversFromPortal() {
  btnReloadDrivers.disabled = true;
  btnReloadDrivers.textContent = 'Lade...';
  driverCheckboxes.innerHTML = '<div class="loading"><div class="spinner"></div><span>Lade Fahrer...</span></div>';

  try {
    const result = await window.api.getDrivers();
    cachedDrivers = result.drivers;
    localStorage.setItem('cachedDrivers', JSON.stringify(cachedDrivers));
    driversLoaded = true;
    renderDriverList();
  } catch (err) {
    driverCheckboxes.innerHTML =
      '<div class="loading"><span>Fehler: ' + err.message + '</span></div>';
  } finally {
    btnReloadDrivers.disabled = false;
    btnReloadDrivers.textContent = 'Fahrer laden';
  }
}

function renderDriverList() {
  if (cachedDrivers.length === 0) {
    driverCheckboxes.innerHTML = '<div class="loading"><span>Keine Fahrer gefunden</span></div>';
    driverCount.textContent = '';
    return;
  }

  driverCheckboxes.innerHTML = cachedDrivers
    .map(
      (name) => `
    <label class="driver-item">
      <input type="checkbox" data-driver="${name}" checked>
      <span>${name}</span>
    </label>
  `
    )
    .join('');

  driverCount.textContent = `${cachedDrivers.length} Fahrer`;
}

function getSelectedDrivers() {
  if (!chkDriverFilter.checked) return [];
  const checked = driverCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
  return [...checked].map((cb) => cb.dataset.driver);
}

chkDriverFilter.addEventListener('change', () => {
  driverList.classList.toggle('hidden', !chkDriverFilter.checked);
});

btnReloadDrivers.addEventListener('click', () => {
  loadDriversFromPortal();
});

btnSelectAllDrivers.addEventListener('click', () => {
  driverCheckboxes.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
});

btnSelectNoDrivers.addEventListener('click', () => {
  driverCheckboxes.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
});

// =========================================
// Step 2: Period Selection
// =========================================
function renderPeriods() {
  if (periods.length === 0) {
    periodList.innerHTML = '<div class="loading"><span>Keine Zeiträume gefunden.</span></div>';
    return;
  }

  periodList.innerHTML = periods
    .map(
      (p, i) => `
    <label class="period-item">
      <input type="checkbox" data-index="${i}" checked>
      <span>${p.text}</span>
    </label>
  `
    )
    .join('');
}

btnLoadPeriods.addEventListener('click', async () => {
  btnLoadPeriods.disabled = true;
  periodList.innerHTML = '<div class="loading"><div class="spinner"></div><span>Lade Zeiträume...</span></div>';

  try {
    const result = await window.api.getPeriods();
    periods = result.periods;
    renderPeriods();
  } catch (err) {
    periodList.innerHTML =
      '<div class="loading"><span>Fehler: ' + err.message + '</span></div>';
  } finally {
    btnLoadPeriods.disabled = false;
  }
});

btnSelectAll.addEventListener('click', () => {
  periodList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
});

btnSelectNone.addEventListener('click', () => {
  periodList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
});

// =========================================
// Mode Toggle: Settlement vs. Month
// =========================================
function initYearDropdown() {
  const currentYear = new Date().getFullYear();
  selYear.innerHTML = '';
  for (let y = currentYear; y >= currentYear - 2; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    selYear.appendChild(opt);
  }
}

function updateMonthHint() {
  const m = parseInt(selMonth.value);
  const y = parseInt(selYear.value);
  const lastDay = new Date(y, m, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  monthHint.textContent = `Zeitraum: ${pad(1)}.${pad(m)}.${y} – ${pad(lastDay)}.${pad(m)}.${y}`;
}

function setMode(mode) {
  periodMode = mode;
  btnModeSettlement.classList.toggle('active', mode === 'settlement');
  btnModeMonth.classList.toggle('active', mode === 'month');
  settlementMode.classList.toggle('hidden', mode !== 'settlement');
  monthMode.classList.toggle('hidden', mode !== 'month');
  if (mode === 'month') {
    initYearDropdown();
    updateMonthHint();
  }
}

btnModeSettlement.addEventListener('click', () => setMode('settlement'));
btnModeMonth.addEventListener('click', () => setMode('month'));
selMonth.addEventListener('change', updateMonthHint);
selYear.addEventListener('change', updateMonthHint);

btnChooseDir.addEventListener('click', async () => {
  const result = await window.api.chooseDirectory();
  if (!result.canceled) {
    outputDir = result.path;
    txtOutputDir.value = result.path;
  }
});

btnBackToLogin.addEventListener('click', () => showStep(1));

// =========================================
// Revenue Formula
// =========================================
function loadFormula() {
  try {
    const saved = localStorage.getItem('revenueFormula');
    if (saved) return JSON.parse(saved);
  } catch (e) { /* use default */ }
  return { ...DEFAULT_FORMULA };
}

function saveFormula() {
  localStorage.setItem('revenueFormula', JSON.stringify(revenueFormula));
}

function renderRevenueFields() {
  revenueFields.innerHTML = REVENUE_FIELDS.map((f) => {
    const sign = revenueFormula[f.key] || '';
    const label = sign === '+' ? '+' : sign === '-' ? '\u2212' : '\u00B7';
    return `
      <div class="revenue-row">
        <span class="field-name">${f.label}</span>
        <button class="revenue-toggle" data-field="${f.key}" data-sign="${sign}">${label}</button>
      </div>
    `;
  }).join('');

  revenueFields.querySelectorAll('.revenue-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      const current = revenueFormula[field] || '';
      const next = current === '' ? '+' : current === '+' ? '-' : '';
      if (next === '') {
        delete revenueFormula[field];
      } else {
        revenueFormula[field] = next;
      }
      saveFormula();
      renderRevenueFields();
      updateRevenueSummary();
    });
  });

  updateRevenueSummary();
}

function updateRevenueSummary() {
  const parts = [];
  for (const f of REVENUE_FIELDS) {
    const sign = revenueFormula[f.key];
    if (sign === '+') parts.push(`+ ${f.label}`);
    else if (sign === '-') parts.push(`\u2212 ${f.label}`);
  }
  if (parts.length === 0) {
    revenueSummary.textContent = 'Keine Felder ausgewählt';
  } else {
    let text = parts[0].startsWith('+') ? parts[0].substring(2) : parts[0];
    for (let i = 1; i < parts.length; i++) {
      text += ' ' + parts[i];
    }
    revenueSummary.textContent = `= Umsatz: ${text}`;
  }
}

btnResetFormula.addEventListener('click', () => {
  revenueFormula = { ...DEFAULT_FORMULA };
  saveFormula();
  renderRevenueFields();
});

renderRevenueFields();

// =========================================
// Start Extraction
// =========================================
btnStartExtraction.addEventListener('click', async () => {
  const driverFilter = chkDriverFilter.checked ? getSelectedDrivers() : [];

  let extractionOpts;
  let progressLabel;

  if (periodMode === 'month') {
    const month = parseInt(selMonth.value);
    const year = parseInt(selYear.value);
    extractionOpts = {
      customRange: { month, year },
      driverFilter,
      outputDir: outputDir || undefined,
      revenueFormula: { ...revenueFormula },
    };
    const monthNames = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    progressLabel = `${monthNames[month]} ${year}`;
  } else {
    const selectedIndices = [];
    periodList.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
      selectedIndices.push(parseInt(cb.dataset.index));
    });

    if (selectedIndices.length === 0) {
      alert('Bitte mindestens einen Zeitraum auswählen.');
      return;
    }

    extractionOpts = {
      periodIndices: selectedIndices,
      driverFilter,
      outputDir: outputDir || undefined,
      revenueFormula: { ...revenueFormula },
    };
    progressLabel = `${selectedIndices.length} Zeiträume`;
  }

  showStep(3);
  logLines = [];
  logArea.innerHTML = '';
  dataTableBody.innerHTML = '';
  dataTableContainer.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  btnBackToPeriods.classList.add('hidden');
  progressSection.classList.remove('hidden');
  step3Title.textContent = 'Extraktion läuft...';
  progressFill.style.width = '0%';
  progressText.textContent = progressLabel;

  try {
    const result = await window.api.startExtraction(extractionOpts);

    progressFill.style.width = '100%';

    if (result.success) {
      step3Title.textContent = 'Extraktion abgeschlossen!';
      progressText.textContent = 'Fertig';
      resultCount.textContent = result.filesCreated;
      resultDir.textContent = result.collectedData
        ? `${Object.keys(result.collectedData).length} Fahrer verarbeitet`
        : '';
      resultsSection.classList.remove('hidden');
    } else {
      step3Title.textContent = 'Fehler bei der Extraktion';
      progressText.textContent = result.error || 'Unbekannter Fehler';
    }
  } catch (err) {
    step3Title.textContent = 'Fehler';
    progressText.textContent = err.message;
  } finally {
    btnBackToPeriods.classList.remove('hidden');
  }
});

btnBackToPeriods.addEventListener('click', () => showStep(2));

// =========================================
// Live Data Table
// =========================================
function formatDE(v) {
  if (typeof v !== 'number') return '';
  return v.toFixed(2).replace('.', ',');
}

function calculateUmsatz(row) {
  let result = 0;
  for (const [field, sign] of Object.entries(revenueFormula)) {
    const val = typeof row[field] === 'number' ? row[field] : 0;
    if (sign === '+') result += val;
    else if (sign === '-') result -= val;
  }
  return result;
}

window.api.onExtractionRow((data) => {
  const tr = document.createElement('tr');
  tr.className = 'highlight';
  const umsatz = calculateUmsatz(data);
  tr.innerHTML = `
    <td>${data.driverName || ''}</td>
    <td>${data.period || ''}</td>
    <td>${formatDE(data.fare)}</td>
    <td>${formatDE(data.serviceFee)}</td>
    <td>${formatDE(data.promotions)}</td>
    <td>${formatDE(data.tip)}</td>
    <td>${formatDE(umsatz)}</td>
    <td>${formatDE(data.payout)}</td>
  `;
  dataTableBody.appendChild(tr);
  dataTableContainer.scrollTop = dataTableContainer.scrollHeight;
});

// =========================================
// Log
// =========================================
window.api.onLog((msg) => {
  const line = document.createElement('div');
  line.className = 'log-line';
  if (msg.includes('ERROR')) line.classList.add('error');
  if (msg.includes('Done') || msg.includes('Fertig')) line.classList.add('success');
  line.textContent = msg;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;

  const periodMatch = msg.match(/Period (\d+)\/(\d+)/);
  if (periodMatch) {
    const current = parseInt(periodMatch[1]);
    const total = parseInt(periodMatch[2]);
    progressFill.style.width = `${(current / total) * 100}%`;
    progressText.textContent = `${current} / ${total} Zeiträume`;
  }
});

// =========================================
// Open Directory
// =========================================
btnOpenDir.addEventListener('click', () => {
  window.api.openDirectory(outputDir);
});

// =========================================
// Display app version & set default directory
// =========================================
window.api.getVersion().then(v => {
  document.getElementById('version').textContent = `v${v}`;
});

window.api.getDefaultDir().then(dir => {
  if (!outputDir) {
    outputDir = dir;
    txtOutputDir.value = dir;
  }
});

// =========================================
// Auto Update
// =========================================
window.api.onUpdateAvailable((version) => {
  updateBanner.classList.remove('hidden');
  updateBanner.querySelector('span').textContent = `Update v${version} wird heruntergeladen...`;
});

window.api.onUpdateProgress((percent) => {
  updateBanner.querySelector('span').textContent = `Update wird heruntergeladen... ${percent}%`;
});

window.api.onUpdateDownloaded((version) => {
  updateBanner.querySelector('span').textContent = `Update v${version} bereit – jetzt installieren?`;
  btnInstallUpdate.classList.remove('hidden');
});

btnInstallUpdate.addEventListener('click', () => {
  window.api.installUpdate();
});
