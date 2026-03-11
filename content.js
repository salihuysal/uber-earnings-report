/**
 * Content Script für Uber Earnings Report Generator
 * VERSION 4.0 - Mit Animation-Deaktivierung, Hover, Warten auf Daten
 */

(function() {
  'use strict';

  // =====================================================
  // STATE
  // =====================================================
  
  let isRunning = false;
  let shouldStop = false;
  let collectedData = {}; // { driverName: [{ period, fare, serviceFee, tip, ... }] }
  let filterDriverNames = []; // Developer-Filter: Nur diese Fahrer verarbeiten
  
  // Timing-Konfiguration (in ms) - STABIL
  const TIMING = {
    short: 150,        // Zwischen Klicks
    medium: 300,       // Nach Aktionen
    long: 500,         // Nach wichtigen Aktionen (Drawer, Expand)
    pageLoad: 700,     // Nach Zeitraumwechsel
    hover: 100,        // Hover-Zeit vor Klick
    waitForData: 2000, // Max Wartezeit auf Daten
    pollInterval: 50   // Polling-Intervall
  };
  
  // Drawer startet bei ca. 600px von links
  const DRAWER_LEFT_THRESHOLD = 600;

  // =====================================================
  // ANIMATION DEAKTIVIEREN
  // =====================================================
  
  function disableAnimations() {
    const existingStyle = document.getElementById('uber-report-no-animations');
    if (existingStyle) return;
    
    const style = document.createElement('style');
    style.id = 'uber-report-no-animations';
    style.innerHTML = `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
      }
    `;
    document.head.appendChild(style);
    console.log('[UberReport] Animationen deaktiviert');
  }
  
  function enableAnimations() {
    const style = document.getElementById('uber-report-no-animations');
    if (style) {
      style.remove();
      console.log('[UberReport] Animationen wieder aktiviert');
    }
  }
  
  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================
  
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function parseAmount(text) {
    if (!text) return 0;
    // Remove € symbol and whitespace
    let cleaned = text.replace(/[€\s]/g, '');
    // Handle European number format: 1.234,56 -> 1234.56
    if (cleaned.includes(',')) {
      // Remove thousands separator (.) and replace decimal comma with dot
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    const value = parseFloat(cleaned);
    return isNaN(value) ? 0 : value;
  }
  
  function sendProgress(data) {
    try {
      chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', ...data });
    } catch (e) {
      // Ignore if popup is closed
    }
  }
  
  function log(message) {
    console.log('[UberReport]', message);
    sendProgress({ log: message });
  }
  
  /**
   * Hover über ein Element (simuliert Mausbewegung)
   */
  async function hoverElement(element) {
    if (!element) return;
    
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // MouseEnter Event
    element.dispatchEvent(new MouseEvent('mouseenter', {
      bubbles: true,
      cancelable: true,
      clientX: centerX,
      clientY: centerY
    }));
    
    // MouseOver Event
    element.dispatchEvent(new MouseEvent('mouseover', {
      bubbles: true,
      cancelable: true,
      clientX: centerX,
      clientY: centerY
    }));
    
    // MouseMove Event
    element.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: centerX,
      clientY: centerY
    }));
    
    await sleep(TIMING.hover);
  }
  
  /**
   * Klick auf ein Element (simuliert vollständigen Mausklick)
   */
  async function clickElement(element) {
    if (!element) {
      console.warn('[UberReport] clickElement: Element ist null');
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Erst Hover
    await hoverElement(element);
    
    // MouseDown
    element.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: centerX,
      clientY: centerY
    }));
    
    await sleep(50);
    
    // MouseUp
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: centerX,
      clientY: centerY
    }));
    
    // Click Event
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: centerX,
      clientY: centerY
    }));
    
    console.log('[UberReport] clickElement: Klick ausgeführt auf', element.textContent?.substring(0, 40));
  }
  
  /**
   * Warte bis eine Bedingung erfüllt ist (mit Timeout)
   */
  async function waitForCondition(checkFn, maxWait = TIMING.waitForData) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      if (checkFn()) {
        return true;
      }
      await sleep(TIMING.pollInterval);
    }
    
    return false;
  }
  
  /**
   * Prüfe ob der Fahrer im Filter ist (oder Filter leer)
   */
  function isDriverInFilter(driverName) {
    if (!filterDriverNames || filterDriverNames.length === 0) {
      return true; // Kein Filter = alle Fahrer
    }
    
    const lowerName = driverName.toLowerCase();
    return filterDriverNames.some(filter => 
      lowerName.includes(filter.toLowerCase())
    );
  }

  // =====================================================
  // DOM HELPER FUNCTIONS
  // =====================================================
  
  /**
   * Finde einen Button anhand seines Text-Inhalts
   */
  function findButtonByText(container, textPatterns) {
    const buttons = (container || document).querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent || '';
      for (const pattern of textPatterns) {
        if (text.includes(pattern)) {
          return btn;
        }
      }
    }
    return null;
  }
  
  /**
   * Öffne das Zeitraum-Panel (2-Schritt-Prozess)
   */
  async function openPeriodPanel() {
    // Schritt 1: Klick auf Kalender-Button oben
    const calendarBtn = findButtonByText(document, ['Calendar', 'Kalender']);
    if (calendarBtn) {
      calendarBtn.click();
      await sleep(TIMING.medium);
    }
    
    // Schritt 2: Klick auf Dropdown im Panel
    const tabpanel = document.querySelector('[role="tabpanel"]');
    if (tabpanel) {
      const dropdownBtn = findButtonByText(tabpanel, ['AM', 'PM']);
      if (dropdownBtn) {
        dropdownBtn.click();
        await sleep(TIMING.medium);
        return true;
      }
    }
    return false;
  }
  
  /**
   * Hole alle verfügbaren Zeiträume
   */
  async function getAvailablePeriods() {
    await openPeriodPanel();
    
    const listbox = document.querySelector('[role="listbox"]');
    const periods = [];
    
    if (listbox) {
      const options = listbox.querySelectorAll('[role="option"]');
      options.forEach((opt, index) => {
        const text = opt.textContent.trim();
        if (text) {
          periods.push({ text, index, element: opt });
        }
      });
    }
    
    return periods;
  }
  
  /**
   * Schließe alle offenen Panels/Dropdowns
   */
  async function closeAllPanels() {
    // Methode 1: Klicke irgendwo auf der Seite (außerhalb des Panels)
    const mainContent = document.querySelector('[role="main"]') || document.body;
    mainContent.click();
    await sleep(200);
    
    // Methode 2: Mehrfach Escape drücken
    for (let i = 0; i < 3; i++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { 
        key: 'Escape', 
        bubbles: true,
        cancelable: true
      }));
      await sleep(150);
    }
    await sleep(TIMING.medium);
  }
  
  /**
   * Wähle einen Zeitraum aus
   */
  async function selectPeriod(periodIndex) {
    // Panel öffnen
    await openPeriodPanel();
    
    // Zeitraum auswählen
    const listbox = document.querySelector('[role="listbox"]');
    if (listbox) {
      const options = listbox.querySelectorAll('[role="option"]');
      if (options[periodIndex]) {
        options[periodIndex].click();
        await sleep(TIMING.pageLoad); // Warten auf Daten-Reload
        return true;
      }
    }
    
    await closeAllPanels();
    return false;
  }
  
  /**
   * Hole alle Fahrer aus der Tabelle
   */
  function getDriversFromTable() {
    const drivers = [];
    const rows = document.querySelectorAll('[role="row"]');
    
    for (const row of rows) {
      const cells = row.querySelectorAll('[role="gridcell"]');
      if (cells.length >= 6) {
        const nameCell = cells[0];
        const name = nameCell?.textContent?.trim();
        
        // Finde den Chevron-Button
        const lastCell = cells[cells.length - 1];
        const chevronBtn = lastCell?.querySelector('button');
        
        if (name && chevronBtn) {
          drivers.push({
            name: name,
            totalEarning: parseAmount(cells[1]?.textContent),
            refundsExpenses: parseAmount(cells[2]?.textContent),
            adjustments: parseAmount(cells[3]?.textContent),
            payout: parseAmount(cells[4]?.textContent),
            netEarnings: parseAmount(cells[5]?.textContent),
            chevronButton: chevronBtn
          });
        }
      }
    }
    
    return drivers;
  }
  
  /**
   * Öffne Drawer für einen Fahrer
   * Hover über Zeile → Klick → warten bis Drawer erscheint
   */
  async function openDriverDrawer(driver) {
    // 1. Finde die Tabellenzeile (row) des Fahrers
    const row = driver.chevronButton.closest('[role="row"]');
    
    if (row) {
      // 2. Hover über die Zeile (damit sie "aufleuchtet")
      await hoverElement(row);
      await sleep(TIMING.short); // Kurz warten nach Hover
    }
    
    // 3. Klick auf den Button (mit vollständigem MouseEvent)
    await clickElement(driver.chevronButton);
    
    // 4. Warte bis Drawer erscheint
    await sleep(TIMING.long);
    
    console.log('[UberReport] Drawer sollte jetzt offen sein');
    return true;
  }
  
  /**
   * Finde den Drawer-Container (auf der rechten Seite)
   */
  function findDrawerContainer() {
    // Der Drawer ist typischerweise ein Container auf der rechten Seite
    const allListitems = document.querySelectorAll('[role="listitem"]');
    
    for (const item of allListitems) {
      const rect = item.getBoundingClientRect();
      // Prüfe ob auf der rechten Seite der Seite (Drawer-Bereich)
      if (rect.left > window.innerWidth / 2) {
        // Finde den Parent-Container
        return item.closest('[role="generic"]')?.parentElement || item.parentElement;
      }
    }
    return null;
  }
  
  /**
   * Extrahiere Details aus dem geöffneten Drawer
   * VERSION 4.0: Mit Warten auf Daten
   */
  async function extractDriverDetails() {
    const details = {
      fare: 0,
      serviceFee: 0,
      tip: 0,
      promotions: 0,
      totalEarning: 0,
      refundsExpenses: 0,
      yourEarnings: 0,
      adjustments: 0,
      cashCollected: 0,
      payout: 0,
      netEarnings: 0
    };
    
    // Hilfsfunktion: Hole Drawer-Items
    function getDrawerItems() {
      const allListItems = document.querySelectorAll('[role="listitem"]');
      const drawerItems = [];
      
      for (const item of allListItems) {
        const rect = item.getBoundingClientRect();
        if (rect.left >= DRAWER_LEFT_THRESHOLD && rect.width > 50) {
          drawerItems.push(item);
        }
      }
      return drawerItems;
    }
    
    // Schritt 1: Warte bis Drawer-Items erscheinen
    const drawerAppeared = await waitForCondition(() => getDrawerItems().length > 0, 2000);
    if (!drawerAppeared) {
      console.error('[UberReport] ❌ Drawer erschien nicht!');
      return details;
    }

    let drawerItems = getDrawerItems();
    console.log('[UberReport] ✓ Drawer Items gefunden:', drawerItems.length);
    
    // Debug: Zeige alle Items
    drawerItems.forEach((item, idx) => {
      const btn = item.querySelector('button');
      if (btn) {
        console.log(`[UberReport] Item ${idx}: ${btn.textContent?.substring(0, 60)}...`);
      }
    });
    
    // Schritt 2: Finde "Total earnings" und expandiere es
    let foundTotalEarnings = false;
    for (const item of drawerItems) {
      const button = item.querySelector('button');
      if (!button) continue;
      
      const buttonText = (button.textContent || '').toLowerCase();
      
      if (buttonText.includes('total earning') || buttonText.includes('gesamtumsatz')) {
        foundTotalEarnings = true;
        console.log('[UberReport] Total earnings gefunden:', buttonText.substring(0, 50));
        
        // Prüfe ob es ein Expand-Icon gibt (img ODER svg)
        const expandIcon = item.querySelector('img[name="Expand"], svg[title="Expand"], [data-icon="expand"]');
        const svgTitle = item.querySelector('svg')?.getAttribute('title');
        const needsExpand = expandIcon || svgTitle === 'Expand';
        
        console.log('[UberReport] Expand nötig?', needsExpand, 'svgTitle:', svgTitle);
        
        // VOLLSTÄNDIGER KLICK mit MouseEvents
        console.log('[UberReport] Klicke auf Total earnings...');
        await clickElement(button);
        await sleep(TIMING.long); // Länger warten nach Expand
        
        // Warte bis Fare erscheint
        const fareFound = await waitForCondition(() => {
          const items = getDrawerItems();
          for (const i of items) {
            const btn = i.querySelector('button');
            if (btn) {
              const text = btn.textContent.toLowerCase();
              if (text.startsWith('fare') || text.startsWith('fahrtpreis')) {
                console.log('[UberReport] ✓ Fare gefunden!');
                return true;
              }
            }
          }
          return false;
        }, TIMING.waitForData);
        
        if (!fareFound) {
          console.warn('[UberReport] ⚠ Fare nicht gefunden nach Expand');
        }
        
        break;
      }
    }
    
    if (!foundTotalEarnings) {
      console.warn('[UberReport] ⚠ Total earnings nicht gefunden im Drawer!');
    }
    
    // Schritt 3: Kleine Pause für Rendering
    await sleep(TIMING.short);
    
    // Schritt 4: Lese alle Werte aus dem Drawer
    drawerItems = getDrawerItems();
    
    for (const item of drawerItems) {
      const button = item.querySelector('button');
      if (!button) continue;
      
      const buttonText = button.textContent || '';
      
      // Extrahiere den Betrag aus dem Button-Text
      const amountMatch = buttonText.match(/-?€[\d.,]+/);
      if (!amountMatch) continue;
      
      const amount = parseAmount(amountMatch[0]);
      const lowerText = buttonText.toLowerCase();
      
      // Kategorisiere basierend auf dem ERSTEN Wort im Button-Text
      if (lowerText.startsWith('fare') || lowerText.startsWith('fahrtpreis')) {
        details.fare = amount;
        console.log('[UberReport] Fare:', amount);
      } else if (lowerText.startsWith('service fee') || lowerText.startsWith('servicegebühr')) {
        details.serviceFee = amount;
        console.log('[UberReport] Service Fee:', amount);
      } else if (lowerText.startsWith('tip') || lowerText.startsWith('trinkgeld')) {
        details.tip = amount;
        console.log('[UberReport] Tip:', amount);
      } else if (lowerText.startsWith('promotion') || lowerText.startsWith('aktion')) {
        details.promotions = amount;
        console.log('[UberReport] Promotions:', amount);
      } else if (lowerText.startsWith('refund') || lowerText.startsWith('erstattung')) {
        details.refundsExpenses = amount;
      } else if (lowerText.startsWith('your earning') || lowerText.startsWith('deine einnahmen')) {
        details.yourEarnings = amount;
      } else if (lowerText.startsWith('adjustment') || lowerText.startsWith('anpassung')) {
        details.adjustments = amount;
      } else if (lowerText.startsWith('cash collected') || lowerText.startsWith('bar eingenommen') || lowerText.startsWith('bareinnahmen')) {
        details.cashCollected = amount;
      } else if (lowerText.startsWith('payout') || lowerText.startsWith('auszahlung')) {
        details.payout = amount;
      } else if (lowerText.startsWith('net earning') || lowerText.startsWith('nettoeinnahmen')) {
        details.netEarnings = amount;
      } else if (lowerText.startsWith('total earning') || lowerText.startsWith('gesamtumsatz')) {
        details.totalEarning = amount;
      }
    }
    
    console.log('[UberReport] Extrahierte Details:', details);
    return details;
  }
  
  /**
   * Schließe den Drawer
   */
  async function closeDrawer() {
    // Suche nach X-Button im Drawer-Bereich (rechte Seite, oben)
    const buttons = document.querySelectorAll('button');
    
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      // Button auf der rechten Seite, oben
      if (rect.right > window.innerWidth - 100 && rect.top < 100) {
        const svg = btn.querySelector('svg');
        const text = btn.textContent.trim();
        // Leerer Button mit SVG ist wahrscheinlich der Close-Button
        if (svg && text === '') {
          btn.click();
          await sleep(TIMING.short);
          return true;
        }
      }
    }
    
    // Fallback: Escape drücken
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(TIMING.short);
    return false;
  }
  
  /**
   * Prüfe ob es eine nächste Seite gibt
   */
  function hasNextPage() {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent || '';
      if (text.includes('Next') && !btn.disabled) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Gehe zur nächsten Seite
   */
  async function goToNextPage() {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent || '';
      if (text.includes('Next') && !btn.disabled) {
        btn.click();
        await sleep(TIMING.long);
        return true;
      }
    }
    return false;
  }
  
  /**
   * Gehe zur ersten Seite
   */
  async function goToFirstPage() {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent || '';
      if (text.includes('First') || text.includes('❮❮')) {
        btn.click();
        await sleep(TIMING.medium);
        return true;
      }
    }
    return false;
  }

  // =====================================================
  // MAIN EXTRACTION LOGIC
  // =====================================================
  
  async function extractAllData(selectedPeriodIndices = null, periodTexts = null, driverFilter = null) {
    isRunning = true;
    shouldStop = false;
    collectedData = {};
    
    // Setze Fahrer-Filter
    filterDriverNames = driverFilter || [];
    
    try {
      log('Starte Datenextraktion...');
      
      // Animationen deaktivieren für schnellere Verarbeitung
      disableAnimations();
      
      // Die Zeiträume wurden bereits im Popup geladen
      if (!selectedPeriodIndices || selectedPeriodIndices.length === 0) {
        throw new Error('Keine Zeiträume ausgewählt!');
      }
      
      // Erstelle periodsToProcess
      const periodsToProcess = selectedPeriodIndices.map((idx, i) => ({
        originalIndex: idx,
        text: periodTexts && periodTexts[i] ? periodTexts[i] : `Zeitraum ${idx + 1}`
      }));
      
      log(`Verarbeite ${periodsToProcess.length} Zeiträume`);
      
      if (filterDriverNames.length > 0) {
        log(`Filter aktiv: ${filterDriverNames.join(', ')}`);
      }
      
      // 2. Für jeden Zeitraum
      for (let pIdx = 0; pIdx < periodsToProcess.length && !shouldStop; pIdx++) {
        const period = periodsToProcess[pIdx];
        
        log(`\n=== Zeitraum ${pIdx + 1}/${periodsToProcess.length}: ${period.text} ===`);
        
        sendProgress({ 
          percent: Math.round((pIdx / periodsToProcess.length) * 100),
          status: `Zeitraum ${pIdx + 1}/${periodsToProcess.length}`
        });
        
        // Zeitraum auswählen
        await selectPeriod(period.originalIndex);
        
        // Zur ersten Seite gehen
        await goToFirstPage();
        await sleep(TIMING.medium);
        
        // 3. Alle Seiten durchlaufen
        let pageNum = 1;
        let hasMore = true;
        
        while (hasMore && !shouldStop) {
          log(`Seite ${pageNum}...`);
          
          // Hole Fahrer der aktuellen Seite
          const drivers = getDriversFromTable();
          log(`${drivers.length} Fahrer gefunden`);
          
          // 4. Für jeden Fahrer (mit Filter-Prüfung)
          for (let dIdx = 0; dIdx < drivers.length && !shouldStop; dIdx++) {
            const driver = drivers[dIdx];
            
            // Prüfe ob Fahrer im Filter ist
            if (!isDriverInFilter(driver.name)) {
              log(`  ⏭ ${driver.name} (übersprungen - nicht im Filter)`);
              continue;
            }
            
            log(`  → ${driver.name}`);
            
            // Drawer öffnen
            await openDriverDrawer(driver);
            
            // Details extrahieren
            const details = await extractDriverDetails();
            
            // In collectedData speichern
            if (!collectedData[driver.name]) {
              collectedData[driver.name] = [];
            }
            
            collectedData[driver.name].push({
              period: period.text,
              fare: details.fare,
              serviceFee: details.serviceFee,
              tip: details.tip,
              promotions: details.promotions,
              totalEarning: details.totalEarning || driver.totalEarning,
              refundsExpenses: details.refundsExpenses || driver.refundsExpenses,
              yourEarnings: details.yourEarnings,
              adjustments: details.adjustments || driver.adjustments,
              cashCollected: details.cashCollected,
              payout: details.payout || driver.payout,
              netEarnings: details.netEarnings || driver.netEarnings
            });
            
            // Drawer schließen
            await closeDrawer();
            await sleep(TIMING.short);
          }
          
          // Nächste Seite?
          if (hasNextPage()) {
            await goToNextPage();
            pageNum++;
          } else {
            hasMore = false;
          }
        }
      }
      
      log('\nDatenextraktion abgeschlossen!');
      
      sendProgress({ 
        percent: 100,
        status: 'Erstelle CSV-Dateien...'
      });
      
      // 5. CSV-Dateien erstellen
      const filesCreated = await createCSVFiles();
      
      log(`✅ ${filesCreated} Dateien exportiert!`);
      
      return {
        success: true,
        filesCreated: filesCreated,
        driversProcessed: Object.keys(collectedData).length
      };
      
    } catch (error) {
      log(`❌ Fehler: ${error.message}`);
      throw error;
    } finally {
      isRunning = false;
      // Animationen wieder aktivieren
      enableAnimations();
    }
  }

  // =====================================================
  // API-BASED EXTRACTION (GraphQL)
  // =====================================================

  const EARNER_QUERY = 'query getEarnerBreakdownsV2($supplierUuid: ID!, $timeRange: OneOfTimeRange__Input, $driverListOrPageOptions: DriverListOrPagination, $driverList: [ID!], $pageOptions: PaginationOption__Input, $locale: String, $excludeAdjustmentItems: Boolean) { getEarnerBreakdownsV2(supplierUuid: $supplierUuid, timeRange: $timeRange, driverList: $driverList, pageOptions: $pageOptions, driverListOrPageOptions: $driverListOrPageOptions, locale: $locale, excludeAdjustmentItems: $excludeAdjustmentItems) { earnerEarningsBreakdowns { earnerUuid earnerMetadata { name } netOutstanding { amountE5 } earnings { categoryName amount { amountE5 } children { categoryName amount { amountE5 } } } reimbursements { amount { amountE5 } } payouts { amount { amountE5 } children { categoryName amount { amountE5 } } } adjustmentsFromPreviousPeriods { amount { amountE5 } } } pageInfo { nextPageToken } } }';

  const TIME_WINDOWS_QUERY = 'query GetReportingTimeWindows($orgId: ID!) { getReportingTimeWindows(orgId: $orgId) { timeWindows { startTimeUnixMillis endTimeUnixMillis } } }';

  function fromE5(amountE5) {
    const val = parseInt(amountE5, 10);
    return isNaN(val) ? 0 : val / 100000;
  }

  function getSupplierUuid() {
    const match = window.location.href.match(/\/orgs\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  async function graphqlFetch(operationName, variables, query) {
    const resp = await fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'x' },
      credentials: 'include',
      body: JSON.stringify({ operationName, variables, query }),
    });
    if (!resp.ok) throw new Error(`GraphQL ${resp.status}: ${resp.statusText}`);
    return resp.json();
  }

  async function fetchTimeWindows(supplierUuid) {
    const json = await graphqlFetch('GetReportingTimeWindows', { orgId: supplierUuid }, TIME_WINDOWS_QUERY);
    const windows = json.data?.getReportingTimeWindows?.timeWindows || [];
    return windows.map(w => {
      const startMs = w.startTimeUnixMillis?.value || w.startTimeUnixMillis;
      const endMs = w.endTimeUnixMillis?.value || w.endTimeUnixMillis;
      const startDate = new Date(Number(startMs));
      const endDate = endMs ? new Date(Number(endMs)) : new Date();
      const fmt = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return {
        startTimeMs: String(startMs),
        endTimeMs: endMs ? String(endMs) : String(Date.now()),
        label: `${fmt(startDate)} - ${fmt(endDate)}`,
        isCurrent: !endMs,
      };
    });
  }

  async function fetchEarnerPage(supplierUuid, startTimeMs, endTimeMs, pageToken) {
    const json = await graphqlFetch('getEarnerBreakdownsV2', {
      supplierUuid,
      timeRange: {
        unixMilliOrDate: 'Unix_Time_Range',
        startTimeUnixMillis: startTimeMs,
        endTimeUnixMillis: endTimeMs,
      },
      driverListOrPageOptions: 'Page_Options',
      pageOptions: { pageSize: 10, pageToken: pageToken || '' },
      driverList: null,
      excludeAdjustmentItems: true,
    }, EARNER_QUERY);

    const data = json.data?.getEarnerBreakdownsV2;
    if (!data) throw new Error(json.errors?.[0]?.message || 'API error');
    return data;
  }

  function parseEarner(e) {
    const ec = e.earnings?.children || [];
    const pc = e.payouts?.children || [];
    const find = (arr, cat) => arr.find(c => c.categoryName === cat);
    return {
      name: e.earnerMetadata?.name || 'Unknown',
      fare: fromE5(find(ec, 'fare')?.amount?.amountE5),
      serviceFee: fromE5(find(ec, 'service_fee')?.amount?.amountE5),
      tip: fromE5(find(ec, 'tip')?.amount?.amountE5),
      promotions: fromE5(find(ec, 'promotion')?.amount?.amountE5),
      yourEarnings: fromE5(e.earnings?.amount?.amountE5) + fromE5(e.reimbursements?.amount?.amountE5),
      totalEarning: fromE5(e.earnings?.amount?.amountE5),
      refundsExpenses: fromE5(e.reimbursements?.amount?.amountE5),
      adjustments: fromE5(e.adjustmentsFromPreviousPeriods?.amount?.amountE5),
      cashCollected: fromE5(find(pc, 'cash_collected')?.amount?.amountE5),
      payout: fromE5(e.payouts?.amount?.amountE5),
      netEarnings: fromE5(e.netOutstanding?.amountE5),
    };
  }

  async function extractAllDataViaAPI(selectedPeriodIndices, periodTexts, driverFilter) {
    isRunning = true;
    shouldStop = false;
    collectedData = {};
    filterDriverNames = driverFilter || [];

    try {
      const supplierUuid = getSupplierUuid();
      if (!supplierUuid) throw new Error('Supplier UUID not found in URL');

      log('=== API-basierte Extraktion ===');
      log(`Supplier: ${supplierUuid}`);

      const timeWindows = await fetchTimeWindows(supplierUuid);
      log(`${timeWindows.length} Zeitfenster gefunden`);

      if (!selectedPeriodIndices || selectedPeriodIndices.length === 0) {
        throw new Error('Keine Zeiträume ausgewählt!');
      }

      for (let pIdx = 0; pIdx < selectedPeriodIndices.length && !shouldStop; pIdx++) {
        const windowIdx = selectedPeriodIndices[pIdx];
        const tw = timeWindows[windowIdx];
        if (!tw) { log(`Zeitfenster ${windowIdx} nicht gefunden, überspringe`); continue; }

        const periodLabel = periodTexts?.[pIdx] || tw.label;
        log(`\n=== Zeitraum ${pIdx + 1}/${selectedPeriodIndices.length}: ${periodLabel} ===`);

        sendProgress({
          percent: Math.round((pIdx / selectedPeriodIndices.length) * 100),
          status: `Zeitraum ${pIdx + 1}/${selectedPeriodIndices.length} (API)`,
        });

        let pageToken = '';
        let pageNum = 1;

        while (!shouldStop) {
          const data = await fetchEarnerPage(supplierUuid, tw.startTimeMs, tw.endTimeMs, pageToken);
          const earners = data.earnerEarningsBreakdowns || [];
          log(`Seite ${pageNum}: ${earners.length} Fahrer`);

          for (const earner of earners) {
            const parsed = parseEarner(earner);

            if (!isDriverInFilter(parsed.name)) continue;

            if (!collectedData[parsed.name]) collectedData[parsed.name] = [];
            collectedData[parsed.name].push({
              period: periodLabel,
              fare: parsed.fare,
              serviceFee: parsed.serviceFee,
              tip: parsed.tip,
              promotions: parsed.promotions,
              totalEarning: parsed.totalEarning,
              refundsExpenses: parsed.refundsExpenses,
              yourEarnings: parsed.yourEarnings,
              adjustments: parsed.adjustments,
              cashCollected: parsed.cashCollected,
              payout: parsed.payout,
              netEarnings: parsed.netEarnings,
            });
          }

          const nextToken = data.pageInfo?.nextPageToken;
          if (nextToken && earners.length > 0) {
            pageToken = nextToken;
            pageNum++;
          } else {
            break;
          }
        }
      }

      log(`\n${Object.keys(collectedData).length} Fahrer extrahiert via API`);
      sendProgress({ percent: 100, status: 'Erstelle CSV-Dateien...' });

      const filesCreated = await createCSVFiles();
      log(`${filesCreated} Dateien exportiert!`);

      return {
        success: true,
        filesCreated,
        driversProcessed: Object.keys(collectedData).length,
      };
    } catch (error) {
      log(`Fehler: ${error.message}`);
      throw error;
    } finally {
      isRunning = false;
    }
  }

  // =====================================================
  // CSV EXPORT
  // =====================================================
  
  function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
  
  async function createCSVFiles() {
    const driverNames = Object.keys(collectedData);
    let filesCreated = 0;
    
    const columns = ['zeitraum', 'fare', 'serviceFee', 'tip', 'promotions', 'totalEarning', 'refundsExpenses', 'yourEarnings', 'adjustments', 'cashCollected', 'payout', 'netEarnings'];
    const headers = {
      zeitraum: 'Zeitraum',
      fare: 'Fare',
      serviceFee: 'Service Fee',
      tip: 'Tip',
      promotions: 'Promotions',
      totalEarning: 'Total Earnings',
      refundsExpenses: 'Refunds & Expenses',
      yourEarnings: 'Your Earnings (Adjustments)',
      adjustments: 'Adjustments',
      cashCollected: 'Cash Collected',
      payout: 'Payout',
      netEarnings: 'Net Earnings'
    };
    
    for (const driverName of driverNames) {
      if (shouldStop) break;
      
      const driverData = collectedData[driverName];
      
      // Header
      let csv = columns.map(col => escapeCSV(headers[col])).join(';') + '\n';
      
      // Daten
      for (const row of driverData) {
        csv += columns.map(col => {
          if (col === 'zeitraum') return escapeCSV(row.period);
          const value = row[col];
          if (typeof value === 'number') {
            // Formatiere Zahlen mit Komma als Dezimaltrennzeichen
            return String(value.toFixed(2)).replace('.', ',');
          }
          return escapeCSV(value !== undefined ? value : '');
        }).join(';') + '\n';
      }
      
      // Dateiname
      const safeName = driverName
        .replace(/[^a-zA-Z0-9äöüÄÖÜß\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
      const date = new Date().toISOString().split('T')[0];
      const filename = `Uber_Reports/${safeName}_${date}.csv`;
      
      // Base64 encode mit BOM
      const BOM = '\uFEFF';
      const base64 = btoa(unescape(encodeURIComponent(BOM + csv)));
      
      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'DOWNLOAD_CSV',
            data: base64,
            filename: filename
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.success) {
              resolve();
            } else {
              reject(new Error(response?.error || 'Download failed'));
            }
          });
        });
        
        filesCreated++;
        log(`  ✓ ${driverName}`);
      } catch (error) {
        log(`  ✗ ${driverName}: ${error.message}`);
      }
      
      await sleep(100);
    }
    
    return filesCreated;
  }

  // =====================================================
  // MESSAGE HANDLERS
  // =====================================================
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'PING':
        sendResponse({ ready: true });
        break;
        
      case 'GET_PERIODS':
        (async () => {
          try {
            const periods = await getAvailablePeriods();
            await closeAllPanels();
            sendResponse({ periods: periods.map(p => ({ text: p.text, index: p.index })) });
          } catch (error) {
            sendResponse({ error: error.message });
          }
        })();
        return true;

      case 'GET_PERIODS_API':
        (async () => {
          try {
            const uuid = getSupplierUuid();
            if (!uuid) throw new Error('Supplier UUID not found');
            const windows = await fetchTimeWindows(uuid);
            sendResponse({ periods: windows.map((w, i) => ({ text: w.label, index: i })) });
          } catch (error) {
            sendResponse({ error: error.message });
          }
        })();
        return true;
        
      case 'START_EXTRACTION':
        if (message.useApi !== false) {
          extractAllDataViaAPI(message.selectedPeriods, message.periodTexts, message.driverFilter)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        } else {
          extractAllData(message.selectedPeriods, message.periodTexts, message.driverFilter)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        }
        return true;
        
      case 'STOP_EXTRACTION':
        shouldStop = true;
        sendResponse({ stopped: true });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
    
    return false;
  });

  // =====================================================
  // INIT
  // =====================================================
  
  console.log('🚀 Uber Earnings Report Generator v3.0 loaded');

})();
