/**
 * Popup Script für Uber Earnings Report Generator v2.0
 * Mit Zeitraum-Auswahl
 */

// DOM Elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const statusDescription = document.getElementById('statusDescription');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const logContainer = document.getElementById('logContainer');
const periodsSection = document.getElementById('periodsSection');
const periodsList = document.getElementById('periodsList');
const selectedCount = document.getElementById('selectedCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const selectNoneBtn = document.getElementById('selectNoneBtn');

// Driver Filter Elements
const filterToggle = document.getElementById('filterToggle');
const filterContent = document.getElementById('filterContent');
const driverFilterInput = document.getElementById('driverFilterInput');
const filterTags = document.getElementById('filterTags');

// State
let isRunning = false;
let currentTabId = null;
let availablePeriods = [];
let selectedPeriods = [];
let driverFilter = []; // Array of driver names to filter

/**
 * Initialize popup
 */
async function init() {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    
    // Check if we're on Uber Supplier Portal
    if (!tab.url.includes('supplier.uber.com')) {
      setStatus('error', 'Falsche Seite', 
        'Bitte öffne das Uber Supplier Portal (supplier.uber.com) und navigiere zur Earnings-Seite.');
      periodsSection.classList.add('hidden');
      return;
    }
    
    if (!tab.url.includes('/earnings')) {
      setStatus('error', 'Earnings-Seite öffnen', 
        'Bitte klicke auf "Earnings" / "Umsätze" im Menü.');
      periodsSection.classList.add('hidden');
      return;
    }
    
    // Check connection and load periods
    setStatus('ready', 'Lade Zeiträume...', 'Bitte warten...');
    
    try {
      const response = await sendToContent({ type: 'GET_PERIODS' });
      
      if (response && response.periods && response.periods.length > 0) {
        availablePeriods = response.periods;
        selectedPeriods = [...availablePeriods.map((_, i) => i)]; // Alle ausgewählt
        renderPeriods();
        updateSelectedCount();
        
        setStatus('ready', 'Bereit', 
          `${availablePeriods.length} Zeiträume gefunden. Wähle die gewünschten Zeiträume aus.`);
        startBtn.disabled = false;
      } else {
        throw new Error('Keine Zeiträume gefunden');
      }
    } catch (error) {
      console.error('Error loading periods:', error);
      setStatus('error', 'Fehler beim Laden', 
        'Konnte Zeiträume nicht laden. Bitte lade die Seite neu (F5).');
      periodsList.innerHTML = '<p style="padding: 10px; text-align: center; color: #666;">Fehler beim Laden</p>';
    }
    
  } catch (error) {
    console.error('Init error:', error);
    setStatus('error', 'Fehler', error.message);
  }
}

/**
 * Render period checkboxes
 */
function renderPeriods() {
  periodsList.innerHTML = '';
  
  availablePeriods.forEach((period, index) => {
    const item = document.createElement('div');
    item.className = 'period-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `period-${index}`;
    checkbox.checked = selectedPeriods.includes(index);
    checkbox.addEventListener('change', () => togglePeriod(index));
    
    const label = document.createElement('label');
    label.htmlFor = `period-${index}`;
    label.textContent = period.text;
    label.title = period.text; // Tooltip für lange Texte
    
    item.appendChild(checkbox);
    item.appendChild(label);
    item.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        togglePeriod(index);
      }
    });
    
    periodsList.appendChild(item);
  });
}

/**
 * Toggle period selection
 */
function togglePeriod(index) {
  if (selectedPeriods.includes(index)) {
    selectedPeriods = selectedPeriods.filter(i => i !== index);
  } else {
    selectedPeriods.push(index);
    selectedPeriods.sort((a, b) => a - b);
  }
  updateSelectedCount();
}

/**
 * Update selected count display
 */
function updateSelectedCount() {
  selectedCount.textContent = `${selectedPeriods.length} von ${availablePeriods.length} ausgewählt`;
  startBtn.disabled = selectedPeriods.length === 0;
}

/**
 * Select all periods
 */
function selectAll() {
  selectedPeriods = availablePeriods.map((_, i) => i);
  renderPeriods();
  updateSelectedCount();
}

/**
 * Select no periods
 */
function selectNone() {
  selectedPeriods = [];
  renderPeriods();
  updateSelectedCount();
}

/**
 * Set status display
 */
function setStatus(type, title, description) {
  statusIndicator.className = 'status-indicator ' + type;
  statusText.textContent = title;
  statusDescription.textContent = description;
}

/**
 * Send message to content script
 */
async function sendToContent(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(currentTabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Add log entry
 */
function addLog(message, type = 'info') {
  logContainer.classList.remove('hidden');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * Start extraction
 */
async function startExtraction() {
  if (isRunning || selectedPeriods.length === 0) return;
  
  isRunning = true;
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  progressSection.classList.add('active');
  periodsSection.classList.add('hidden');
  logContainer.innerHTML = '';
  
  setStatus('running', 'Läuft...', 'Daten werden extrahiert. Bitte das Browserfenster nicht schließen.');
  addLog(`Starte Extraktion für ${selectedPeriods.length} Zeiträume...`);
  
  try {
    // Listen for progress updates
    chrome.runtime.onMessage.addListener(handleProgressUpdate);
    
    // Send selected period indices, texts, and driver filter to content script
    const periodTexts = selectedPeriods.map(idx => availablePeriods[idx]?.text || '');
    const activeFilter = filterToggle.checked ? driverFilter : [];
    
    const response = await sendToContent({ 
      type: 'START_EXTRACTION',
      selectedPeriods: selectedPeriods,
      periodTexts: periodTexts,
      driverFilter: activeFilter
    });
    
    if (response.success) {
      setStatus('ready', 'Abgeschlossen!', 
        `${response.filesCreated} CSV-Dateien wurden erfolgreich erstellt.`);
      addLog(`✅ Fertig! ${response.filesCreated} Dateien exportiert.`, 'success');
    } else {
      throw new Error(response.error || 'Unbekannter Fehler');
    }
    
  } catch (error) {
    console.error('Extraction error:', error);
    setStatus('error', 'Fehler', error.message);
    addLog('❌ Fehler: ' + error.message, 'error');
  } finally {
    isRunning = false;
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    chrome.runtime.onMessage.removeListener(handleProgressUpdate);
  }
}

/**
 * Handle progress updates from content script
 */
function handleProgressUpdate(message) {
  if (message.type === 'PROGRESS_UPDATE') {
    if (message.percent !== undefined) {
      progressFill.style.width = message.percent + '%';
    }
    if (message.status) {
      progressText.textContent = message.status;
    }
    if (message.log) {
      addLog(message.log, message.logType || 'info');
    }
  }
}

/**
 * Stop extraction
 */
async function stopExtraction() {
  if (!isRunning) return;
  
  try {
    await sendToContent({ type: 'STOP_EXTRACTION' });
    addLog('⏹ Abgebrochen durch Benutzer.', 'error');
  } catch (error) {
    console.error('Stop error:', error);
  }
  
  isRunning = false;
  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  periodsSection.classList.remove('hidden');
  setStatus('ready', 'Abgebrochen', 'Die Extraktion wurde abgebrochen.');
}

// =====================================================
// Driver Filter Functions
// =====================================================

/**
 * Toggle filter section visibility
 */
function toggleFilterSection() {
  if (filterToggle.checked) {
    filterContent.classList.remove('hidden');
  } else {
    filterContent.classList.add('hidden');
    // Clear filter when disabled
    driverFilter = [];
    renderFilterTags();
  }
}

/**
 * Add a driver name to the filter
 */
function addDriverToFilter(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  
  // Check if already exists (case insensitive)
  const exists = driverFilter.some(f => f.toLowerCase() === trimmed.toLowerCase());
  if (!exists) {
    driverFilter.push(trimmed);
    renderFilterTags();
  }
  
  // Clear input
  driverFilterInput.value = '';
}

/**
 * Remove a driver name from the filter
 */
function removeDriverFromFilter(index) {
  driverFilter.splice(index, 1);
  renderFilterTags();
}

/**
 * Render filter tags
 */
function renderFilterTags() {
  filterTags.innerHTML = '';
  
  driverFilter.forEach((name, index) => {
    const tag = document.createElement('span');
    tag.className = 'filter-tag';
    tag.textContent = name;
    tag.title = 'Klicken zum Entfernen';
    tag.addEventListener('click', () => removeDriverFromFilter(index));
    filterTags.appendChild(tag);
  });
}

/**
 * Handle input keydown (semicolon or comma to add)
 */
function handleFilterInput(e) {
  if (e.key === ';' || e.key === ',') {
    e.preventDefault();
    addDriverToFilter(driverFilterInput.value);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    addDriverToFilter(driverFilterInput.value);
  } else if (e.key === 'Backspace' && driverFilterInput.value === '' && driverFilter.length > 0) {
    // Remove last tag when backspace on empty input
    removeDriverFromFilter(driverFilter.length - 1);
  }
}

// Event Listeners
startBtn.addEventListener('click', startExtraction);
stopBtn.addEventListener('click', stopExtraction);
selectAllBtn.addEventListener('click', selectAll);
selectNoneBtn.addEventListener('click', selectNone);
filterToggle.addEventListener('change', toggleFilterSection);
driverFilterInput.addEventListener('keydown', handleFilterInput);

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
