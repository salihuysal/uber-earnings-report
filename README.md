# Uber Earnings Report Generator

Eine Chrome-Extension zur automatischen Generierung von Excel-Reports aus dem Uber Supplier Portal.

## 📋 Funktionen

- **Automatische Datenextraktion**: Extrahiert alle Earnings-Daten für jeden Mitarbeiter
- **Mehrere Zeiträume**: Verarbeitet alle verfügbaren Settlement-Perioden
- **Excel-Export**: Erstellt eine separate Excel-Datei pro Mitarbeiter
- **Konfigurierbar**: Labels und Einstellungen können angepasst werden
- **Deutsch & Englisch**: Unterstützt beide Sprachversionen des Uber Portals

## 🚀 Installation

### Schritt 1: Extension in Chrome laden

1. Öffne Google Chrome
2. Gib in die Adressleiste ein: `chrome://extensions`
3. Aktiviere oben rechts den **"Entwicklermodus"** (Developer mode)
4. Klicke auf **"Entpackte Erweiterung laden"** (Load unpacked)
5. Wähle den Ordner `uber_automatisierung` aus
6. Die Extension erscheint nun in deiner Toolbar

### Schritt 2: Extension anpinnen (optional, aber empfohlen)

1. Klicke auf das Puzzle-Symbol in der Chrome-Toolbar
2. Suche "Uber Earnings Report Generator"
3. Klicke auf das Pin-Symbol, um die Extension anzupinnen

## 📖 Benutzung

### Vor dem Start

1. Melde dich im [Uber Supplier Portal](https://supplier.uber.com) an
2. Navigiere zur **"Earnings"** / **"Umsätze"** Seite
3. **Wichtig**: Öffne das Zeitraum-Dropdown, damit alle verfügbaren Perioden sichtbar sind

### Report generieren

1. Klicke auf das Extension-Icon in der Toolbar
2. Prüfe die Statusanzeige (sollte "Bereit" zeigen)
3. Klicke auf **"Report generieren"**
4. Warte, bis alle Daten extrahiert wurden
5. Die Excel-Dateien werden automatisch heruntergeladen

### Wo finde ich die Dateien?

Die Excel-Dateien werden in deinem Download-Ordner gespeichert unter:
```
Downloads/Uber_Reports/Uber_Earnings_[Fahrername]_[Datum].xlsx
```

## ⚙️ Konfiguration

Die Datei `config.js` enthält alle anpassbaren Einstellungen:

### Labels anpassen

Falls sich die Bezeichnungen auf der Uber-Seite ändern, können diese in der Konfiguration angepasst werden:

```javascript
labels: {
  fare: {
    en: "Fare",      // Englische Bezeichnung
    de: "Fahrtpreis" // Deutsche Bezeichnung
  },
  // ...
}
```

### Timing anpassen

Bei langsamer Internetverbindung können die Wartezeiten erhöht werden:

```javascript
timing: {
  afterClick: 500,        // Wartezeit nach Klick (ms)
  afterPeriodChange: 1500 // Wartezeit nach Zeitraum-Wechsel (ms)
}
```

### Export-Einstellungen

```javascript
export: {
  subfolder: "Uber_Reports",     // Unterordner für Downloads
  filePrefix: "Uber_Earnings_",  // Präfix für Dateinamen
}
```

## 📊 Excel-Datei Struktur

Jede Excel-Datei enthält folgende Spalten:

| Spalte | Beschreibung |
|--------|--------------|
| Zeitraum | Der Settlement-Zeitraum |
| Fahrtpreis (Fare) | Einnahmen aus Fahrten |
| Servicegebühr | Uber-Servicegebühr |
| Trinkgeld | Erhaltene Trinkgelder |
| Aktionen/Promotions | Bonus-Zahlungen |
| Gesamtumsatz | Summe aller Einnahmen |
| Erstattungen & Ausgaben | Rückerstattungen |
| Anpassungen | Korrekturen aus Vorperioden |
| Auszahlung | Bereits ausgezahlter Betrag |
| Nettoeinnahmen | Finale Summe |

## 🔧 Fehlerbehebung

### "Keine Zeiträume gefunden"
- Öffne das Zeitraum-Dropdown auf der Earnings-Seite
- Lade die Seite neu (F5) und versuche es erneut

### "Content Script nicht geladen"
- Lade die Uber-Seite neu (F5)
- Stelle sicher, dass du auf der Earnings-Seite bist
- Prüfe in `chrome://extensions` ob die Extension aktiv ist

### "Download fehlgeschlagen"
- Prüfe die Chrome Download-Einstellungen
- Stelle sicher, dass der Download-Ordner beschreibbar ist

## 🔒 Datenschutz

- **Lokale Verarbeitung**: Alle Daten werden nur in deinem Browser verarbeitet
- **Keine Serverübertragung**: Es werden keine Daten an externe Server gesendet
- **Keine Tracking**: Die Extension sammelt keine Nutzerdaten

## 📁 Projektstruktur

```
uber_automatisierung/
├── manifest.json      # Extension-Konfiguration
├── config.js          # Anpassbare Einstellungen
├── popup.html         # Benutzeroberfläche
├── popup.js           # Popup-Logik
├── content.js         # Haupt-Extraktionslogik
├── content.css        # Styling für Overlay
├── background.js      # Download-Handler
├── icons/             # Extension-Icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── lib/
│   └── xlsx.full.min.js  # Excel-Bibliothek
└── README.md          # Diese Datei
```

## 📄 Lizenz

Dieses Projekt wurde speziell für die Nutzung mit dem Uber Supplier Portal erstellt.

---

Bei Fragen oder Problemen wende dich an den Entwickler.
