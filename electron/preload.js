const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getDefaultDir: () => ipcRenderer.invoke('get-default-dir'),
  launchBrowser: () => ipcRenderer.invoke('launch-browser'),
  checkLogin: () => ipcRenderer.invoke('check-login'),
  goToEarnings: () => ipcRenderer.invoke('go-to-earnings'),
  getPeriods: () => ipcRenderer.invoke('get-periods'),
  getDrivers: () => ipcRenderer.invoke('get-drivers'),
  startExtraction: (opts) => ipcRenderer.invoke('start-extraction', opts),
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  openDirectory: (path) => ipcRenderer.invoke('open-directory', path),
  clearSession: () => ipcRenderer.invoke('clear-session'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  onLog: (callback) => ipcRenderer.on('log', (_event, msg) => callback(msg)),
  onExtractionRow: (callback) => ipcRenderer.on('extraction-row', (_event, data) => callback(data)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, version) => callback(version)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_event, percent) => callback(percent)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, version) => callback(version)),
});
