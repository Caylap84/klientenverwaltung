# Klientenverwaltung

Kleine Offline-App (PWA) zur Verwaltung von Klienten im Stimmtraining: Stammdaten, Verträge mit
Laufzeit und Preis, geplante und erledigte Stunden, Honorareingänge pro Monat, Notizen,
Dokumentation und PDFs. Alle Daten liegen nur lokal im Browser (IndexedDB) des jeweiligen Geräts.
Für Windows gibt es zusätzlich eine EXE (Tauri), siehe [docs/windows-build.md](docs/windows-build.md).

## Entwicklung

```bash
npm install        # Abhängigkeiten installieren
npm run dev        # Entwicklungsserver starten (Adresse wird angezeigt)
npm test           # Unit- und Komponententests (Vitest)
npm run test:e2e   # baut die App und prüft den Hauptablauf im Browser (Playwright)
npm run build      # Produktionsversion nach dist/ bauen
```

## Als App installieren (PWA)

Die Installation („Zum Startbildschirm hinzufügen“ bzw. „App installieren“) ist nur über eine
HTTPS-Adresse möglich. Dazu muss der Inhalt von `dist/` auf einem Webserver mit HTTPS liegen
(z. B. GitHub Pages oder Netlify). Über `npm run dev` oder eine lokale IP-Adresse ohne HTTPS lässt
sich die App nicht installieren.

## Sicherungen

Unter **Sicherung** exportierst du alle Daten als JSON-Datei. Sie wird als Download gespeichert
(Android/Chrome: Ordner „Downloads“) und sollte von dort in einen Cloud-Ordner verschoben werden.
Auf einem anderen Gerät importierst du diese Datei; der Import ersetzt alle Daten dort, der
vorherige Stand bleibt als Sicherheitskopie erhalten. Die Datei ist nicht verschlüsselt – nur in
einem gut geschützten Cloud-Ordner (starkes Passwort, Zwei-Faktor-Anmeldung) ablegen.
