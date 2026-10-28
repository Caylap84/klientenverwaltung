# Klientenverwaltung – Design

Datum: 2026-10-28

## Ziel

Eine App für eine einzelne Person (Selbstständige/r), um Klienten, Verträge, Stunden und Honorareingänge zu verwalten. Läuft als installierbare Web-App (PWA) auf Android und Windows, zusätzlich als Windows-EXE. Alle Daten bleiben lokal beim Nutzer; der Abgleich zwischen Geräten erfolgt über eine Sicherungsdatei, die im Cloud-Ordner des Nutzers liegt.

## Festgelegte Rahmenbedingungen

- Ein Nutzer, kein Login, keine Mehrbenutzer-Funktion.
- Keine Server, keine Netzwerkzugriffe, keine Statistik-Dienste (nur zum Installieren der App nötig).
- Abgleich auf **allen** Geräten manuell: Exportieren schreibt eine Datei, Importieren liest sie ein.
- Import **ersetzt** den lokalen Stand vollständig (kein Zusammenführen). Vorher wird automatisch eine Sicherheitskopie angelegt.
- **Keine Pflichtfelder.** Alle Felder dürfen leer bleiben.
- Technik: React + TypeScript + Vite, IndexedDB, PWA-Plugin, Windows-EXE mit Tauri (Build per GitHub Actions auf einem Windows-Runner).
- Sprache der Oberfläche: Deutsch, Monatsnamen deutsch.

## Datenmodell

**Klient**
- Stammdaten: Name, Adresse, E-Mail, Telefon.
- Status: `aktiv` | `pausiert` | `archiviert`, jederzeit änderbar.
- Allgemeine Notizen: ein Freitextfeld.
- Dokumentation: datierte Einträge (Datum + Text).
- PDF-Dokumente: beliebig viele, mit Name und Hinzufügedatum.
- Löschen entfernt den Klienten samt Verträgen, Stunden, Monaten, Notizen und PDFs, nur nach Bestätigung.
- Ist kein Name eingetragen, wird "Unbenannter Klient" angezeigt.

**Vertrag** (beliebig viele pro Klient)
- Start-Monat, Laufzeit in Monaten (z. B. "März 2026, 6 Monate").
- Preis: Eingabe wahlweise als **Monatspreis** oder **Gesamtpreis**; der jeweils andere Wert wird berechnet. Zusätzlich **Stundenpreis**.
- Vereinbarte **Stundenanzahl** (pro Vertrag).
- Fehlende Werte zählen als 0 bzw. leer.

**Stunden:** Pro Vertrag so viele Stundenzeilen wie vereinbart. Jede Zeile: Häkchen, Datum, Notiz. Wird die Stundenzahl geändert, werden nur leere, nicht abgehakte Zeilen entfernt; abgehakte oder beschriebene Zeilen bleiben erhalten.

**Vertragsmonate:** Ergeben sich aus Start und Laufzeit, mit Monatsnamen (z. B. "März 2026"). Jeder Monat hat ein Häkchen "Honorar eingegangen", optional mit Eingangsdatum.

## Berechnungen

- Geldbeträge intern in Cent (ganzzahlig).
- Gesamtpreis geteilt durch Monate: Der letzte Monat übernimmt den Rest (100 € / 3 = 33,33 / 33,33 / 33,34).
- **Monatsübersicht** für einen wählbaren Monat (Standard: aktueller Monat):
  - Erwartet = Summe der Monatsbeträge aller Vertragsmonate aktiver Klienten in diesem Monat.
  - Eingegangen = Summe der abgehakten davon.
  - Offen = Erwartet − Eingegangen.
  - Pausierte und archivierte Klienten zählen nicht mit.
- **Vertragsverlauf pro Klient:** Zeitleiste über alle Vertragsmonate mit Betrag und Status bezahlt/offen.

## Bildschirme

Handy: untere Navigationsleiste. PC: Seitenleiste.

1. **Übersicht:** Anzahl aktiver Klienten; erwartet/eingegangen/offen des gewählten Monats; Monatsblättern per Pfeil; Liste der offenen Monate je Klient mit direktem Abhaken.
2. **Klientenliste:** Suche, Statusfilter.
3. **Klientenprofil** mit Reitern: Stammdaten, Verträge (Stunden, Monate, Preise, Zeitleiste über die Gesamtlaufzeit; Summe der Stunden über alle Verträge), Notizen & Dokumentation, PDFs. Status oben umschaltbar.
4. **Sicherung:** Exportieren, Importieren, Datum des letzten Exports, Hinweis auf ungesicherte Änderungen.

## Architektur

Drei getrennte Schichten:

- **Rechenlogik:** reine Funktionen (Preise, Vertragsmonate, Übersichtssummen), ohne Bezug zu UI oder Speicher; einzeln testbar.
- **Speicher:** IndexedDB inkl. PDFs; getrennt davon Export/Import der Sicherungsdatei.
- **Oberfläche:** React-Komponenten, die nur anzeigen und Eingaben weiterreichen.

Die Windows-EXE (Tauri) bettet dieselbe Web-App ein und enthält keine zusätzliche Fachlogik.

## Sicherungsdatei

Eine Datei `klienten-sicherung-JJJJ-MM-TT.json` mit Formatversion, Zeitstempel und allen Daten; PDFs als Base64 eingebettet.

**Import:**
1. Datei validieren; ungültige Datei wird abgelehnt, lokaler Stand bleibt unverändert.
2. Vergleich anzeigen: Zeitstempel und Klientenanzahl Datei gegen lokal; Warnung, wenn die Datei älter ist.
3. Nach Bestätigung automatische Sicherheitskopie des lokalen Stands, dann Ersetzen. Bei einem Fehler bleibt der alte Stand erhalten.

Die Datei ist unverschlüsselt; Schutz entspricht dem des Cloud-Kontos. Passwortverschlüsselung ist nicht Teil der ersten Version.

## Fehlerbehandlung

- Keine Pflichtfelder.
- Bestätigung erforderlich bei: Löschen, Importieren, Verkürzen einer Laufzeit.
- Eine Laufzeit kann nicht unter die Zahl bereits als bezahlt abgehakter Monate verkürzt werden.

## Tests

- Unit-Tests für die Rechenlogik (Preisumrechnung, Cent-Rest, Vertragsmonate, Übersichtssummen, Statusfilter).
- Unit-Tests für Export/Import inkl. Hin- und Rückweg mit PDFs, ungültiger Datei und Fehlerfall.
- Einige End-to-End-Tests im Browser für die Hauptabläufe (Klient anlegen, Vertrag anlegen, Stunde und Monat abhaken, Übersicht, Export/Import).

## Außerhalb des Umfangs (erste Version)

Automatische Synchronisation, Zusammenführen von Änderungen, Passwortverschlüsselung, Mehrbenutzerbetrieb, Rechnungserstellung.
