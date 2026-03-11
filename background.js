/**
 * Background Service Worker für Uber Earnings Report Generator
 */

// Listener für Nachrichten vom Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_EXCEL') {
    downloadFile(message.data, message.filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('Download error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }
  
  if (message.type === 'DOWNLOAD_CSV') {
    downloadFile(message.data, message.filename, 'text/csv;charset=utf-8')
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('Download error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }
  
  if (message.type === 'GET_STATUS') {
    sendResponse({ ready: true });
    return true;
  }
});

/**
 * Download Datei über Data URL
 */
async function downloadFile(base64Data, filename, mimeType) {
  const dataUrl = `data:${mimeType};base64,${base64Data}`;
  
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        console.log('Download started:', downloadId, filename);
        resolve(downloadId);
      }
    });
  });
}

// Extension installiert/aktualisiert
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Uber Earnings Report Generator installiert:', details.reason);
});
