const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { createPlaywrightAdapter } = require('./playwright-adapter');
const { exportAllPDF } = require('../src/automation/pdf-exporter');

let mainWindow;
let automationBrowser = null;
let automationPage = null;
let adapter = null;
let isExtracting = false;
let isInstallingUpdate = false;
let downloadedUpdateFile = null;

function getSessionPath() {
  return path.join(app.getPath('userData'), 'session.json');
}

async function saveSession() {
  if (!automationPage) return;
  try {
    await automationPage.context().storageState({ path: getSessionPath() });
  } catch (e) { /* ignore if context already closed */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'icons', 'icon128.svg'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = process.platform !== 'darwin';
  autoUpdater.checkForUpdates().catch(() => {});
});

app.on('window-all-closed', async () => {
  if (isInstallingUpdate) {
    app.quit();
    return;
  }
  await cleanupBrowser();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

async function cleanupBrowser() {
  if (automationBrowser) {
    await saveSession();
    try { await automationBrowser.close(); } catch (e) {}
    automationBrowser = null;
    automationPage = null;
    adapter = null;
  }
}

// =========================================
// IPC: App version & default directory
// =========================================
ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('get-default-dir', () => {
  return path.join(app.getPath('documents'), 'Ubergo');
});

// =========================================
// IPC: Launch browser for manual login
// =========================================
ipcMain.handle('launch-browser', async () => {
  await cleanupBrowser();

  const { chromium } = require('playwright-core');

  let executablePath;
  try {
    const { executablePath: ep } = require('playwright-core/lib/server');
    executablePath = ep;
  } catch (e) {
    const possiblePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    executablePath = possiblePaths.find((p) => fs.existsSync(p));
  }

  automationBrowser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    executablePath,
    args: ['--start-maximized'],
  });

  const contextOptions = {
    viewport: null,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const sessionPath = getSessionPath();
  if (fs.existsSync(sessionPath)) {
    contextOptions.storageState = sessionPath;
  }

  const context = await automationBrowser.newContext(contextOptions);

  automationPage = await context.newPage();
  adapter = createPlaywrightAdapter(automationPage, (msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log', msg);
    }
  });

  const hasSession = fs.existsSync(sessionPath);

  if (hasSession) {
    await automationPage.goto('https://supplier.uber.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });
  } else {
    await automationPage.goto('https://supplier.uber.com');
  }

  return { success: true, hadSession: hasSession };
});

// =========================================
// IPC: Check if user is logged in and on earnings page
// =========================================
ipcMain.handle('check-login', async () => {
  if (!automationPage) return { loggedIn: false };

  const url = automationPage.url();
  const isLoggedIn = url.includes('supplier.uber.com') && !url.includes('auth');

  if (isLoggedIn) {
    await saveSession();
  }

  return { loggedIn: isLoggedIn, url };
});

// =========================================
// IPC: Navigate to earnings page
// =========================================
ipcMain.handle('go-to-earnings', async () => {
  if (!automationPage) throw new Error('Browser not launched');

  const currentUrl = automationPage.url();
  
  // Check if already on earnings page
  if (currentUrl.includes('/earnings')) {
    await automationPage.waitForTimeout(1000);
    return { success: true, alreadyThere: true };
  }

  const orgMatch = currentUrl.match(/\/orgs\/([^/]+)/);
  const orgId = orgMatch ? orgMatch[1] : '';

  if (orgId) {
    await automationPage.goto(`https://supplier.uber.com/orgs/${orgId}/earnings`, { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });
  } else {
    await automationPage.goto('https://supplier.uber.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });
    await automationPage.waitForTimeout(2000);
    const newUrl = automationPage.url();
    const newOrgMatch = newUrl.match(/\/orgs\/([^/]+)/);
    if (newOrgMatch) {
      await automationPage.goto(`https://supplier.uber.com/orgs/${newOrgMatch[1]}/earnings`, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
    }
  }

  await automationPage.waitForTimeout(2000);
  return { success: true, alreadyThere: false };
});

// =========================================
// Helper: Extract supplier UUID from page URL
// =========================================
function getSupplierUuid() {
  if (!automationPage) return null;
  const match = automationPage.url().match(/\/orgs\/([a-f0-9-]+)/);
  return match ? match[1] : null;
}

// =========================================
// IPC: Get available periods (via GraphQL API)
// =========================================
ipcMain.handle('get-periods', async () => {
  if (!automationPage) {
    throw new Error('Browser nicht bereit. Bitte zuerst den Browser öffnen und anmelden.');
  }

  const uuid = getSupplierUuid();
  if (!uuid) throw new Error('Supplier UUID nicht in URL gefunden. Bitte zur Earnings-Seite navigieren.');

  console.log('[get-periods] Lade Zeitfenster via API für', uuid);

  const periods = await automationPage.evaluate(async (orgId) => {
    const resp = await fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'x' },
      credentials: 'include',
      body: JSON.stringify({
        operationName: 'GetReportingTimeWindows',
        variables: { orgId },
        query: 'query GetReportingTimeWindows($orgId: ID!) { getReportingTimeWindows(orgId: $orgId) { timeWindows { startTimeUnixMillis endTimeUnixMillis } } }',
      }),
    });
    const json = await resp.json();
    const windows = json.data?.getReportingTimeWindows?.timeWindows || [];
    const fmt = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return windows.map((w, i) => {
      const s = w.startTimeUnixMillis?.value || w.startTimeUnixMillis;
      const e = w.endTimeUnixMillis?.value || w.endTimeUnixMillis;
      return {
        text: fmt(new Date(Number(s))) + ' - ' + fmt(new Date(e ? Number(e) : Date.now())),
        index: i,
        startTimeMs: String(s),
        endTimeMs: e ? String(e) : String(Date.now()),
        isCurrent: !e,
      };
    });
  }, uuid);

  console.log(`[get-periods] ${periods.length} Zeiträume via API geladen`);
  return { periods };
});

// =========================================
// IPC: Get driver names (via GraphQL API)
// =========================================
ipcMain.handle('get-drivers', async () => {
  if (!automationPage) {
    throw new Error('Browser nicht bereit. Bitte zuerst den Browser öffnen und anmelden.');
  }

  const uuid = getSupplierUuid();
  if (!uuid) throw new Error('Supplier UUID nicht gefunden.');

  const drivers = await automationPage.evaluate(async (orgId) => {
    const query = 'query getEarnerBreakdownsV2($supplierUuid: ID!, $timeRange: OneOfTimeRange__Input, $driverListOrPageOptions: DriverListOrPagination, $driverList: [ID!], $pageOptions: PaginationOption__Input, $locale: String, $excludeAdjustmentItems: Boolean) { getEarnerBreakdownsV2(supplierUuid: $supplierUuid, timeRange: $timeRange, driverList: $driverList, pageOptions: $pageOptions, driverListOrPageOptions: $driverListOrPageOptions, locale: $locale, excludeAdjustmentItems: $excludeAdjustmentItems) { earnerEarningsBreakdowns { earnerMetadata { name } } pageInfo { nextPageToken } } }';

    const twResp = await fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'x' },
      credentials: 'include',
      body: JSON.stringify({
        operationName: 'GetReportingTimeWindows',
        variables: { orgId },
        query: 'query GetReportingTimeWindows($orgId: ID!) { getReportingTimeWindows(orgId: $orgId) { timeWindows { startTimeUnixMillis endTimeUnixMillis } } }',
      }),
    });
    const twJson = await twResp.json();
    const windows = twJson.data?.getReportingTimeWindows?.timeWindows || [];
    const last = windows[windows.length - 1];
    if (!last) return [];
    const startMs = String(last.startTimeUnixMillis?.value || last.startTimeUnixMillis);
    const endMs = last.endTimeUnixMillis ? String(last.endTimeUnixMillis?.value || last.endTimeUnixMillis) : String(Date.now());

    const names = new Set();
    let pageToken = '';
    while (true) {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'x' },
        credentials: 'include',
        body: JSON.stringify({
          operationName: 'getEarnerBreakdownsV2',
          variables: {
            supplierUuid: orgId,
            timeRange: { unixMilliOrDate: 'Unix_Time_Range', startTimeUnixMillis: startMs, endTimeUnixMillis: endMs },
            driverListOrPageOptions: 'Page_Options',
            pageOptions: { pageSize: 10, pageToken },
            driverList: null, excludeAdjustmentItems: true,
          },
          query,
        }),
      });
      const json = await resp.json();
      const data = json.data?.getEarnerBreakdownsV2;
      if (!data) break;
      for (const e of (data.earnerEarningsBreakdowns || [])) {
        if (e.earnerMetadata?.name) names.add(e.earnerMetadata.name);
      }
      const next = data.pageInfo?.nextPageToken;
      if (next && (data.earnerEarningsBreakdowns || []).length > 0) pageToken = next;
      else break;
    }
    return [...names].sort();
  }, uuid);

  console.log(`[get-drivers] ${drivers.length} Fahrer via API geladen`);
  return { drivers };
});

// =========================================
// IPC: Start extraction (via GraphQL API)
// =========================================
ipcMain.handle('start-extraction', async (_event, { periodIndices, customRange, driverFilter, outputDir, revenueFormula, exportColumns }) => {
  if (!automationPage) throw new Error('Browser not ready');
  if (isExtracting) throw new Error('Extraction already in progress');

  isExtracting = true;
  const logToRenderer = (msg) => {
    console.log(`[UberReport] ${msg}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log', msg);
    }
  };

  try {
    const uuid = getSupplierUuid();
    if (!uuid) throw new Error('Supplier UUID nicht gefunden.');

    logToRenderer('=== API-basierte Extraktion ===');
    logToRenderer(`Supplier: ${uuid}`);

    const formulaDesc = revenueFormula && Object.keys(revenueFormula).length > 0
      ? Object.entries(revenueFormula).map(([k, s]) => `${s}${k}`).join(' ')
      : '(keine Formel)';
    logToRenderer(`Umsatzformel: ${formulaDesc}`);

    // Step 1: Get time windows
    const timeWindows = await automationPage.evaluate(async (orgId) => {
      const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'x' },
        credentials: 'include',
        body: JSON.stringify({
          operationName: 'GetReportingTimeWindows',
          variables: { orgId },
          query: 'query GetReportingTimeWindows($orgId: ID!) { getReportingTimeWindows(orgId: $orgId) { timeWindows { startTimeUnixMillis endTimeUnixMillis } } }',
        }),
      });
      const json = await resp.json();
      const windows = json.data?.getReportingTimeWindows?.timeWindows || [];
      const fmt = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return windows.map(w => {
        const s = w.startTimeUnixMillis?.value || w.startTimeUnixMillis;
        const e = w.endTimeUnixMillis?.value || w.endTimeUnixMillis;
        return {
          startMs: String(s),
          endMs: e ? String(e) : String(Date.now()),
          label: fmt(new Date(Number(s))) + ' - ' + fmt(new Date(e ? Number(e) : Date.now())),
        };
      });
    }, uuid);

    logToRenderer(`${timeWindows.length} Zeitfenster geladen`);

    // Step 2: Determine which windows to process
    let windowsToProcess;
    if (customRange) {
      const { month, year } = customRange;
      const pad = n => String(n).padStart(2, '0');
      const startOfMonth = new Date(year, month - 1, 1).getTime();
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).getTime();
      const lastDay = new Date(year, month, 0).getDate();
      const rangeLabel = `01.${pad(month)}.${year} - ${pad(lastDay)}.${pad(month)}.${year}`;

      windowsToProcess = timeWindows
        .filter(tw => {
          const twStart = Number(tw.startMs);
          const twEnd = Number(tw.endMs);
          return twStart < endOfMonth && twEnd > startOfMonth;
        })
        .map(tw => ({ ...tw, label: rangeLabel }));

      if (windowsToProcess.length === 0) {
        windowsToProcess = [{ startMs: String(startOfMonth), endMs: String(endOfMonth), label: rangeLabel }];
      }

      logToRenderer(`Custom Range: ${rangeLabel} (${windowsToProcess.length} Zeitfenster)`);
    } else if (periodIndices && periodIndices.length > 0) {
      windowsToProcess = periodIndices
        .filter(i => i < timeWindows.length)
        .map(i => timeWindows[i]);
      logToRenderer(`${windowsToProcess.length} Zeiträume ausgewählt`);
    } else {
      windowsToProcess = timeWindows;
      logToRenderer(`Alle ${timeWindows.length} Zeiträume`);
    }

    // Step 3: Fetch earner data for each time window
    const collectedData = {};
    let totalFetched = 0;

    for (let twIdx = 0; twIdx < windowsToProcess.length; twIdx++) {
      const tw = windowsToProcess[twIdx];
      logToRenderer(`\n--- Period ${twIdx + 1}/${windowsToProcess.length}: ${tw.label} ---`);

      const earners = await automationPage.evaluate(async ({ orgId, startMs, endMs }) => {
        const query = 'query getEarnerBreakdownsV2($supplierUuid: ID!, $timeRange: OneOfTimeRange__Input, $driverListOrPageOptions: DriverListOrPagination, $driverList: [ID!], $pageOptions: PaginationOption__Input, $locale: String, $excludeAdjustmentItems: Boolean) { getEarnerBreakdownsV2(supplierUuid: $supplierUuid, timeRange: $timeRange, driverList: $driverList, pageOptions: $pageOptions, driverListOrPageOptions: $driverListOrPageOptions, locale: $locale, excludeAdjustmentItems: $excludeAdjustmentItems) { earnerEarningsBreakdowns { earnerMetadata { name } netOutstanding { amountE5 } earnings { categoryName amount { amountE5 } children { categoryName amount { amountE5 } } } reimbursements { amount { amountE5 } } payouts { amount { amountE5 } children { categoryName amount { amountE5 } } } adjustmentsFromPreviousPeriods { amount { amountE5 } } } pageInfo { nextPageToken } } }';
        const fromE5 = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n / 100000; };
        const all = [];
        let pageToken = '';
        while (true) {
          const resp = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'x' },
            credentials: 'include',
            body: JSON.stringify({
              operationName: 'getEarnerBreakdownsV2',
              variables: {
                supplierUuid: orgId,
                timeRange: { unixMilliOrDate: 'Unix_Time_Range', startTimeUnixMillis: startMs, endTimeUnixMillis: endMs },
                driverListOrPageOptions: 'Page_Options',
                pageOptions: { pageSize: 10, pageToken },
                driverList: null, excludeAdjustmentItems: true,
              },
              query,
            }),
          });
          const json = await resp.json();
          const data = json.data?.getEarnerBreakdownsV2;
          if (!data) break;
          const earners = data.earnerEarningsBreakdowns || [];
          for (const e of earners) {
            const ec = e.earnings?.children || [], pc = e.payouts?.children || [];
            const f = (arr, cat) => arr.find(c => c.categoryName === cat);
            all.push({
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
            });
          }
          const next = data.pageInfo?.nextPageToken;
          if (next && earners.length > 0) pageToken = next; else break;
        }
        return all;
      }, { orgId: uuid, startMs: tw.startMs, endMs: tw.endMs });

      logToRenderer(`${earners.length} Fahrer geladen`);

      for (const earner of earners) {
        if (driverFilter && driverFilter.length > 0) {
          const lower = earner.name.toLowerCase();
          if (!driverFilter.some(f => lower.includes(f.toLowerCase()))) continue;
        }

        const row = {
          period: tw.label,
          fare: earner.fare,
          serviceFee: earner.serviceFee,
          tip: earner.tip,
          promotions: earner.promotions,
          totalEarning: earner.totalEarning,
          refundsExpenses: earner.refundsExpenses,
          yourEarnings: earner.yourEarnings,
          adjustments: earner.adjustments,
          cashCollected: earner.cashCollected,
          payout: earner.payout,
          netEarnings: earner.netEarnings,
        };

        if (!collectedData[earner.name]) collectedData[earner.name] = [];
        collectedData[earner.name].push(row);
        totalFetched++;

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('extraction-row', { driverName: earner.name, ...row });
        }
      }
    }

    // Step 4: Export PDF files
    logToRenderer('\n=== PDF-Dateien exportieren ===');
    const driversProcessed = Object.keys(collectedData).length;
    const defaultDir = outputDir || path.join(app.getPath('documents'), 'Ubergo');

    let pdfFiles = 0;
    let exportDir = defaultDir;
    try {
      const pdfResult = await exportAllPDF(collectedData, defaultDir, revenueFormula, exportColumns);
      pdfFiles = pdfResult.filesCreated;
      exportDir = pdfResult.outputDir;
      logToRenderer(`${pdfFiles} PDF-Dateien exportiert`);
    } catch (e) {
      logToRenderer(`PDF-Export Fehler: ${e.message}`);
    }

    logToRenderer(`\nFertig! ${pdfFiles} Dateien nach ${exportDir}`);
    logToRenderer(`${driversProcessed} Fahrer, ${totalFetched} Datensätze verarbeitet`);

    return {
      success: true,
      filesCreated: pdfFiles,
      driversProcessed,
      collectedData,
    };
  } catch (error) {
    logToRenderer(`ERROR: ${error.message}`);
    return { success: false, error: error.message, collectedData: {} };
  } finally {
    isExtracting = false;
  }
});

// =========================================
// IPC: Choose output directory
// =========================================
ipcMain.handle('choose-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Exportverzeichnis wählen',
  });

  if (result.canceled) return { canceled: true };
  return { path: result.filePaths[0] };
});

// =========================================
// IPC: Open directory in finder/explorer
// =========================================
ipcMain.handle('open-directory', async (_event, dirPath) => {
  shell.openPath(dirPath);
});

// =========================================
// IPC: Clear saved session
// =========================================
ipcMain.handle('clear-session', async () => {
  const sessionPath = getSessionPath();
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
  return { success: true };
});

// =========================================
// Auto-updater events
// =========================================
autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log(`[Updater] Update available: v${info.version}`);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info.version);
  }
});

autoUpdater.on('update-not-available', () => {
  console.log('[Updater] App is up to date.');
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', Math.round(progress.percent));
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log(`[Updater] Update downloaded: v${info.version}`);
  downloadedUpdateFile = info.downloadedFile || null;
  console.log(`[Updater] Downloaded file: ${downloadedUpdateFile}`);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info.version);
  }
});

autoUpdater.on('error', (err) => {
  console.log('[Updater] Error:', err.message);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

ipcMain.handle('install-update', async () => {
  isInstallingUpdate = true;
  automationBrowser = null;
  automationPage = null;
  adapter = null;

  if (process.platform === 'darwin') {
    return await installUpdateMac();
  }

  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (e) {
      console.log('[Updater] quitAndInstall failed:', e.message);
    }
  }, 300);

  setTimeout(() => {
    console.log('[Updater] Force exit fallback');
    app.exit(0);
  }, 5000);

  return { installing: true };
});

async function installUpdateMac() {
  const { exec } = require('child_process');

  let zipPath = downloadedUpdateFile;

  if (!zipPath || !fs.existsSync(zipPath)) {
    const cacheName = app.getName() + '-updater';
    const cacheDir = path.join(app.getPath('cache'), cacheName);
    const fallback = path.join(cacheDir, 'update.zip');
    if (fs.existsSync(fallback)) {
      zipPath = fallback;
    }
  }

  if (!zipPath || !fs.existsSync(zipPath)) {
    console.log('[Updater] No downloaded update file found');
    return { error: 'Update-Datei nicht gefunden. Bitte App manuell neu installieren.' };
  }

  const appBundlePath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '');
  const appDir = path.dirname(appBundlePath);
  const appBaseName = path.basename(appBundlePath);
  const tempDir = path.join(app.getPath('temp'), 'uber-update-' + Date.now());

  console.log(`[Updater] Manual macOS update: zip=${zipPath}, app=${appBundlePath}, temp=${tempDir}`);

  const script = `#!/bin/bash
sleep 2
mkdir -p "${tempDir}"
unzip -o -q "${zipPath}" -d "${tempDir}"
APP_NAME=$(ls -d "${tempDir}"/*.app 2>/dev/null | head -1)
if [ -z "$APP_NAME" ]; then
  rm -rf "${tempDir}"
  exit 1
fi
rm -rf "${appBundlePath}"
cp -R "$APP_NAME" "${appDir}/"
xattr -cr "${appDir}/${appBaseName}"
open "${appDir}/${appBaseName}"
rm -rf "${tempDir}"
`;

  const scriptPath = path.join(app.getPath('temp'), 'uber-update.sh');
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  const child = exec(`bash "${scriptPath}"`, { detached: true, stdio: 'ignore' });
  child.unref();

  setTimeout(() => {
    app.exit(0);
  }, 500);

  return { installing: true };
}

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { version: result?.updateInfo?.version || null };
  } catch (e) {
    return { version: null, error: e.message };
  }
});
