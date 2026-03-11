/**
 * Konfigurationsdatei für Uber Earnings Report Generator
 * 
 * Diese Datei kann vom Kunden angepasst werden, falls sich die Labels
 * auf der Uber-Seite ändern.
 * 
 * HINWEIS: Nach Änderungen muss die Extension in Chrome neu geladen werden:
 * 1. chrome://extensions öffnen
 * 2. Bei dieser Extension auf "Neu laden" klicken
 */

const UBER_CONFIG = {
  // =====================================================
  // SPRACH-LABELS (Deutsch und Englisch)
  // =====================================================
  labels: {
    // Navigation
    earnings: {
      en: "Earnings",
      de: "Umsätze"
    },
    
    // Hauptkategorien in der Übersicht
    totalEarning: {
      en: "Total earning",
      de: "Gesamtumsatz"
    },
    refundsExpenses: {
      en: "Refunds & expenses",
      de: "Erstattungen & Ausgaben"
    },
    adjustments: {
      en: "Adjustments from previous periods",
      de: "Anpassungen aus vorherigen Zeiträumen"
    },
    yourEarnings: {
      en: "Your earnings",
      de: "Deine Einnahmen"
    },
    payout: {
      en: "Payout",
      de: "Auszahlung"
    },
    cashCollected: {
      en: "Cash collected",
      de: "Bar eingenommen"
    },
    netEarnings: {
      en: "Net earnings",
      de: "Nettoeinnahmen"
    },
    
    // Detail-Kategorien unter "Total earning"
    fare: {
      en: "Fare",
      de: "Fahrtpreis"
    },
    serviceFee: {
      en: "Service fee",
      de: "Servicegebühr"
    },
    tip: {
      en: "Tip",
      de: "Trinkgeld"
    },
    promotions: {
      en: "Promotions",
      de: "Aktionen"
    },
    
    // Tabellen-Header
    driverName: {
      en: "Driver name",
      de: "Fahrername"
    },
    
    // Navigation Buttons
    next: {
      en: "Next",
      de: "Weiter"
    },
    prev: {
      en: "Prev",
      de: "Zurück"
    },
    first: {
      en: "First",
      de: "Erste"
    }
  },

  // =====================================================
  // SELEKTOREN (CSS-Selektoren für DOM-Elemente)
  // Nur ändern, wenn sich die Seitenstruktur ändert!
  // =====================================================
  selectors: {
    // Tabelle mit Fahrern
    driverTable: '[role="grid"]',
    driverRow: '[role="row"]',
    driverRowGroup: '[role="rowgroup"]',
    gridCell: '[role="gridcell"]',
    
    // Expand-Buttons
    expandButton: 'button[name*="Expand"], button svg[title="Expand"]',
    chevronButton: 'button[class*="Chevron"], button:has(svg)',
    
    // Pagination
    nextButton: '[data-testid="next-button"], button:contains("Next")',
    prevButton: 'button:contains("Prev")',
    
    // Zeitraum-Dropdown
    settlementDropdown: '[role="listbox"][aria-label="Menu"]',
    settlementOption: '[role="option"]',
    dateRangeButton: 'button[class*="Chevron down"]',
    
    // Detailansicht
    detailPanel: '[role="listitem"]',
    listItem: 'li, [role="listitem"]'
  },

  // =====================================================
  // EXPORT-EINSTELLUNGEN
  // =====================================================
  export: {
    // Zielordner für Excel-Dateien (relativ zum Download-Ordner)
    // Leer lassen für Standard-Download-Ordner
    subfolder: "Uber_Reports",
    
    // Dateiname-Präfix
    filePrefix: "Uber_Earnings_",
    
    // Datumsformat im Dateinamen
    dateFormat: "YYYY-MM-DD",
    
    // Excel-Spalten in der Reihenfolge
    columns: [
      "zeitraum",
      "fare",
      "serviceFee", 
      "tip",
      "promotions",
      "totalEarning",
      "refundsExpenses",
      "yourEarnings",
      "adjustments",
      "cashCollected",
      "payout",
      "netEarnings"
    ],
    
    // Spaltenüberschriften (können angepasst werden)
    columnHeaders: {
      zeitraum: "Zeitraum",
      fare: "Fahrtpreis (Fare)",
      serviceFee: "Servicegebühr",
      tip: "Trinkgeld",
      promotions: "Aktionen/Promotions",
      totalEarning: "Gesamtumsatz",
      refundsExpenses: "Erstattungen & Ausgaben",
      yourEarnings: "Deine Einnahmen (Anpassungen)",
      adjustments: "Anpassungen",
      cashCollected: "Bar eingenommen",
      payout: "Auszahlung",
      netEarnings: "Nettoeinnahmen"
    }
  },

  // =====================================================
  // TIMING-EINSTELLUNGEN (in Millisekunden)
  // Bei langsamen Internetverbindungen erhöhen
  // =====================================================
  timing: {
    // Wartezeit nach Klick auf Element
    afterClick: 500,
    
    // Wartezeit nach Seitenladen
    afterPageLoad: 1000,
    
    // Wartezeit zwischen Mitarbeitern
    betweenDrivers: 300,
    
    // Wartezeit nach Zeitraum-Wechsel
    afterPeriodChange: 1500,
    
    // Maximale Wartezeit für Element-Erscheinen
    maxWaitForElement: 10000
  }
};

// Export für Content Script
if (typeof window !== 'undefined') {
  window.UBER_CONFIG = UBER_CONFIG;
}
