/**
 * Configuration for Uber Earnings Report Automation
 * Consolidated from the original extension's config.js and content.js TIMING constants.
 */

const CONFIG = {
  urls: {
    base: 'https://supplier.uber.com',
    earningsPattern: '/earnings',
  },

  timing: {
    short: 0.15,
    medium: 0.3,
    long: 0.5,
    pageLoad: 0.7,
    hover: 0.1,
    waitForData: 2,
    pollInterval: 0.05,
    afterPeriodChange: 1.5,
    betweenDrivers: 0.3,
    maxWaitForElement: 10,
  },

  labels: {
    totalEarning: ['total earning', 'gesamtumsatz'],
    fare: ['fare', 'fahrtpreis'],
    serviceFee: ['service fee', 'servicegebühr'],
    tip: ['tip', 'trinkgeld'],
    promotions: ['promotion', 'aktion'],
    refundsExpenses: ['refund', 'erstattung'],
    yourEarnings: ['your earning', 'deine einnahmen'],
    adjustments: ['adjustment', 'anpassung'],
    cashCollected: ['cash collected', 'bar eingenommen', 'bareinnahmen'],
    payout: ['payout', 'auszahlung'],
    netEarnings: ['net earning', 'nettoeinnahmen'],
    calendar: ['Calendar', 'Kalender'],
    next: ['Next', 'Weiter', 'Nächste'],
    first: ['First', 'Erste', '❮❮'],
    expand: ['Expand', 'Erweitern'],
    close: ['Close', 'Schließen'],
    settlementWindow: ['Settlement window', 'Abrechnungsfenster'],
    customRange: ['Custom range', 'Benutzerdefinierter Bereich', 'Benutzerdefiniert'],
    chevron: ['Chevron right small', 'Chevron rechts klein'],
  },

  datePattern: /\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/,

  revenueFormula: {
    fare: '+',
    serviceFee: '-',
  },

  csvExport: {
    subfolder: 'Uber_Reports',
    separator: ';',
    decimalSeparator: ',',
    bom: '\uFEFF',
    columns: [
      'zeitraum',
      'fare',
      'serviceFee',
      'tip',
      'promotions',
      'totalEarning',
      'refundsExpenses',
      'yourEarnings',
      'adjustments',
      'cashCollected',
      'payout',
      'netEarnings',
    ],
    headers: {
      zeitraum: 'Zeitraum',
      fare: 'Fahrtpreis (Fare)',
      serviceFee: 'Servicegebühr',
      tip: 'Trinkgeld',
      promotions: 'Aktionen/Promotions',
      totalEarning: 'Total Earnings',
      refundsExpenses: 'Refunds & Expenses',
      yourEarnings: 'Your Earnings (Adjustments)',
      adjustments: 'Adjustments',
      cashCollected: 'Cash Collected',
      payout: 'Payout',
      netEarnings: 'Net Earnings',
    },
  },

  pdfExport: {
    columns: [
      { key: 'zeitraum', header: 'Zeitraum', width: 150 },
      { key: 'fare', header: 'F (Fahrtpreis)', width: 90 },
      { key: 'tip', header: 'T (Trinkgeld)', width: 90 },
      { key: 'umsatz', header: 'U (Umsatz)', width: 90 },
      { key: 'cashout', header: 'C (Cashout)', width: 90 },
    ],
  },
};

module.exports = CONFIG;
