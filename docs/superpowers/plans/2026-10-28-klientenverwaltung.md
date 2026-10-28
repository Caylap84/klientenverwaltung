# Klientenverwaltung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine offline-fähige Klientenverwaltung (PWA + Windows-EXE) für eine Einzelperson mit Verträgen, Stunden, Honorar-Abhaken, PDFs, Monatsübersicht und Sicherungsdatei.

**Architecture:** Drei Schichten: reine Rechenlogik (`src/domain`), Speicher in IndexedDB über Dexie plus Sicherungsdatei (`src/storage`), React-Oberfläche (`src/ui`). Die Windows-EXE (Tauri) bettet dieselbe Web-App ein.

**Tech Stack:** React 18, TypeScript, Vite, Dexie + dexie-react-hooks, react-router-dom (HashRouter), vite-plugin-pwa, Vitest + fake-indexeddb + Testing Library, Playwright, Tauri v2, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-28-klientenverwaltung-design.md`

## Global Constraints

- Oberfläche komplett auf Deutsch, Monatsnamen deutsch ("März 2026").
- **Keine Pflichtfelder**; jedes Feld darf leer bleiben. Klient ohne Namen wird als "Unbenannter Klient" angezeigt.
- Geldbeträge intern als ganzzahlige Cent; der letzte Monat übernimmt den Rest (100 € / 3 = 33,33 / 33,33 / 33,34).
- Keine Netzwerkzugriffe, keine Statistik-Dienste, kein Login.
- Statuswerte exakt: `aktiv` | `pausiert` | `archiviert`. Nur `aktiv` zählt in der Übersicht.
- Sicherungsdatei: `klienten-sicherung-JJJJ-MM-TT.json`, Formatversion, Zeitstempel, PDFs als Base64.
- Import ersetzt den lokalen Stand vollständig, mit automatischer Sicherheitskopie; bei Fehler bleibt der alte Stand.
- Bestätigung nötig bei: Klient löschen, Import, Verkürzen/Verschieben einer Laufzeit.
- Laufzeit/Start dürfen nicht so geändert werden, dass ein bereits bezahlter Monat außerhalb der Vertragsmonate läge.
- Hash-Routing (`/#/…`), damit PWA und Tauri ohne Server-Rewrites laufen.

## Review Focus

- Leerer Klient (alle Felder leer) lässt sich anlegen, listen, öffnen und exportieren ohne Fehler. → Task 5, 7
- Eurobeträge in Formen wie `1.234,56`, `12,5`, `100`, ``, `abc`, `-5` ergeben 0 oder den richtigen Wert, nie `NaN`. → Task 2
- Vertrag ohne Startmonat oder mit Laufzeit 0 hat keine Monate und stürzt weder in Übersicht noch Zeitleiste ab. → Task 3, 4
- Vertrag über den Jahreswechsel (Nov → Feb) und Monatswechsel in der Übersicht liefern die richtigen Monate. → Task 2, 4
- Fehlerhafte, fremde oder zu neue Sicherungsdatei (kein JSON, falsche Version, kaputtes Base64) wird abgelehnt und verändert nichts. → Task 6

---

## Dateistruktur

```
package.json, vite.config.ts, tsconfig.json, index.html, .gitignore
src/domain/types.ts        Typen (Client, Contract, HourEntry, …)
src/domain/money.ts        Cent-Parsing, Formatierung, Aufteilung
src/domain/months.ts       YearMonth-Hilfen, Monatsnamen
src/domain/contract.ts     Preise, Vertragsmonate, Stundenzeilen, Laufzeit-Regel
src/domain/overview.ts     Monatsübersicht, Vertragszeitleiste
src/storage/db.ts          Dexie-Schema
src/storage/repository.ts  Anlegen/Ändern/Löschen, Dirty-Flag
src/storage/backup.ts      Export, Prüfen, Import, Sicherheitskopie
src/ui/App.tsx, Layout.tsx, routes
src/ui/pages/OverviewPage.tsx, ClientListPage.tsx, ClientPage.tsx, BackupPage.tsx
src/ui/client/ProfileTab.tsx, ContractsTab.tsx, NotesTab.tsx, PdfTab.tsx
tests/e2e/main-flow.spec.ts
src-tauri/…, .github/workflows/build-windows.yml
```

---

### Task 1: Projektgerüst und Werkzeuge

**Files:**
- Create: Vite-Projekt (`react-ts`-Template) im Repo-Root, `.gitignore` (`node_modules`, `dist`, `src-tauri/target`), `vitest.config.ts`, `src/test-setup.ts`
- Test: `src/smoke.test.tsx`

**Interfaces:**
- Produces: Skripte `npm test` (= `vitest run`), `npm run build`, `npm run dev`.

- [ ] **Step 1:** Vite `react-ts` im Root einrichten (Template in temporärem Ordner erzeugen und kopieren, `docs/` bleibt unberührt). Abhängigkeiten: `dexie dexie-react-hooks react-router-dom`; Dev: `vitest jsdom @testing-library/react @testing-library/jest-dom fake-indexeddb`. Vitest mit `environment: 'jsdom'` und `setupFiles` (lädt `fake-indexeddb/auto` und jest-dom).
- [ ] **Step 2:** Test `smoke.test.tsx` schreiben: mit `expect(1 + 1).toBe(2)`, damit der Runner nachweislich läuft.
- [ ] **Step 3:** Run `npm test` → PASS; `npm run build` → erfolgreich.
- [ ] **Step 4:** Commit `chore: scaffold vite react-ts with vitest`.

---

### Task 2: Domain – Typen, Geld, Monate

**Files:**
- Create: `src/domain/types.ts`, `src/domain/money.ts`, `src/domain/months.ts`
- Test: `src/domain/money.test.ts`, `src/domain/months.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  type YearMonth = string            // 'YYYY-MM'
  type Status = 'aktiv' | 'pausiert' | 'archiviert'
  interface HourEntry { id: string; done: boolean; date: string; note: string }  // date: 'YYYY-MM-DD' oder ''
  interface LogEntry { id: string; date: string; text: string }
  interface Client { id: string; name: string; address: string; email: string; phone: string;
                     status: Status; notes: string; log: LogEntry[]; createdAt: string; updatedAt: string }
  interface Contract { id: string; clientId: string; startMonth: YearMonth | ''; termMonths: number;
                       priceMode: 'monthly' | 'total'; priceCents: number; hourlyCents: number;
                       plannedHours: number; hours: HourEntry[]; paid: Record<YearMonth, { paidOn: string }> }
  interface PdfDoc { id: string; clientId: string; name: string; addedAt: string; data: Blob }
  ```
- Produces (`money.ts`): `parseEuroToCents(input: string): number`, `formatEuro(cents: number): string`, `splitCents(totalCents: number, parts: number): number[]`.
- Produces (`months.ts`): `addMonths(ym: YearMonth, n: number): YearMonth`, `monthLabel(ym: YearMonth): string`, `contractMonths(start: YearMonth | '', term: number): YearMonth[]`, `currentMonth(now?: Date): YearMonth`.

- [ ] **Step 1:** Tests `money.test.ts`: `parseEuroToCents('1.234,56') === 123456`, `('12,5') === 1250`, `('100') === 10000`, `('') === 0`, `('abc') === 0`, `('-5') === 0`; `formatEuro(123456) === '1.234,56 €'`; `splitCents(10000, 3)` gleich `[3333, 3333, 3334]`; `splitCents(500, 0)` gleich `[]`; Summe von `splitCents(n, k)` immer `n`.
- [ ] **Step 2:** Tests `months.test.ts`: `monthLabel('2026-03') === 'März 2026'`; `addMonths('2026-11', 3) === '2027-02'`; `addMonths('2026-01', -1) === '2025-12'`; `contractMonths('2026-11', 4)` gleich `['2026-11','2026-12','2027-01','2027-02']`; `contractMonths('', 6)` und `contractMonths('2026-03', 0)` gleich `[]`; `currentMonth(new Date(2026, 9, 28)) === '2026-10'`.
- [ ] **Step 3:** Run → FAIL. Typen und Funktionen implementieren (deutsches Komma/Punkt-Parsing; Monatsnamen per Tabelle, nicht per `Intl`, damit Tests plattformunabhängig sind; `formatEuro` via `Intl.NumberFormat('de-DE')`).
- [ ] **Step 4:** Run `npm test` → PASS. Commit `feat: domain types, money and month helpers`.

---

### Task 3: Domain – Vertragslogik

**Files:**
- Create: `src/domain/contract.ts`
- Test: `src/domain/contract.test.ts`

**Interfaces:**
- Consumes: `Contract`, `HourEntry`, `YearMonth`, `splitCents`, `contractMonths`.
- Produces:
  ```ts
  totalCents(c: Contract): number            // monthly: priceCents * termMonths; total: priceCents
  monthAmounts(c: Contract): number[]        // je Vertragsmonat; monthly: gleich; total: splitCents
  syncHourRows(hours: HourEntry[], target: number, newId: () => string): HourEntry[]
  canChangeTerm(c: Contract, start: YearMonth | '', term: number): boolean
  newContract(clientId: string, id: string): Contract
  ```

- [ ] **Step 1:** Tests: `totalCents` bei `monthly 10000 € × 6 = 60000 €`; bei `total` unverändert; `termMonths: 0` → 0. `monthAmounts` für `total 10000`, 3 Monate gleich `[3333,3333,3334]`; bei `monthly 5000`, 2 Monate gleich `[5000,5000]`; Länge immer gleich `contractMonths(...).length` (leer ohne Startmonat). `syncHourRows([], 3)` liefert 3 leere Zeilen; Reduzieren von 5 auf 2 entfernt nur leere Zeilen von hinten, eine abgehakte oder beschriebene Zeile an Position 4 bleibt (Ergebnis dann länger als Ziel); negatives Ziel verhält sich wie 0. `canChangeTerm`: Vertrag 2026-03/6 Monate mit `paid['2026-07']` → Verkürzen auf 3 Monate `false`, auf 5 `true`; Start auf `2026-05` verschieben (bei bezahltem `2026-03`) `false`; ohne bezahlte Monate immer `true`.
- [ ] **Step 2:** Run → FAIL. Implementieren; `canChangeTerm` prüft, dass jeder Schlüssel in `paid` in `contractMonths(start, term)` liegt.
- [ ] **Step 3:** Run → PASS. Commit `feat: contract pricing, hour rows and term guard`.

---

### Task 4: Domain – Übersicht und Zeitleiste

**Files:**
- Create: `src/domain/overview.ts`
- Test: `src/domain/overview.test.ts`

**Interfaces:**
- Consumes: `Client`, `Contract`, `monthAmounts`, `contractMonths`.
- Produces:
  ```ts
  interface OpenItem { clientId: string; contractId: string; cents: number }
  interface MonthOverview { activeClients: number; expectedCents: number; receivedCents: number; openCents: number; openItems: OpenItem[] }
  monthOverview(clients: Client[], contracts: Contract[], month: YearMonth): MonthOverview
  interface TimelineRow { month: YearMonth; label: string; cents: number; paid: boolean }
  contractTimeline(c: Contract): TimelineRow[]
  ```

- [ ] **Step 1:** Tests: zwei aktive Klienten mit je einem Vertrag 100 €/Monat im Mai, einer bezahlt → `expected 20000`, `received 10000`, `open 10000`, `openItems` enthält nur den offenen. Pausierter und archivierter Klient zählen weder in `activeClients` noch in die Summen. Vertrag 2026-11/4 Monate: Übersicht für `2027-01` enthält den Vertrag, für `2027-03` nicht. Vertrag ohne Startmonat und Vertrag mit Laufzeit 0 erzeugen keine Beträge und keinen Fehler. `contractTimeline` liefert pro Monat `label` ("November 2026"), den Betrag aus `monthAmounts` und `paid` aus `c.paid`. Beträge aus Cent-Rest (100 €/3): letzter Monat 33,34.
- [ ] **Step 2:** Run → FAIL. Implementieren.
- [ ] **Step 3:** Run → PASS. Commit `feat: month overview and contract timeline`.

---

### Task 5: Speicher – Datenbank und Repository

**Files:**
- Create: `src/storage/db.ts`, `src/storage/repository.ts`
- Test: `src/storage/repository.test.ts`

**Interfaces:**
- Consumes: Typen aus Task 2, `newContract`.
- Produces:
  ```ts
  db: Dexie  // Tabellen: clients(id), contracts(id, clientId), pdfs(id, clientId), meta(key)
  interface Meta { key: string; value: unknown }   // Schlüssel: 'dirty' (boolean), 'lastExportAt' (string), 'safetyCopy' (BackupFile|null)
  createClient(init?: Partial<Client>): Promise<string>
  updateClient(id: string, patch: Partial<Client>): Promise<void>   // setzt updatedAt
  deleteClient(id: string): Promise<void>                           // löscht auch Verträge und PDFs
  createContract(clientId: string): Promise<string>
  updateContract(id: string, patch: Partial<Contract>): Promise<void>
  deleteContract(id: string): Promise<void>
  addPdf(clientId: string, file: File): Promise<string>
  deletePdf(id: string): Promise<void>
  getMeta<T>(key: string): Promise<T | undefined>; setMeta(key: string, value: unknown): Promise<void>
  ```
  Jeder schreibende Aufruf setzt `meta.dirty = true`.

- [ ] **Step 1:** Tests (mit `fake-indexeddb`, DB vor jedem Test leeren): `createClient()` ohne Argumente legt einen Klienten mit leeren Feldern, Status `aktiv` an. `updateClient` ändert `updatedAt`. `deleteClient` entfernt dessen Verträge und PDFs, lässt die eines anderen Klienten unberührt. `createContract` erzeugt einen Vertrag mit leeren Werten. Jede Schreiboperation setzt `dirty` auf `true`.
- [ ] **Step 2:** Run → FAIL. Implementieren; IDs per `crypto.randomUUID()`; Löschen und Schreiben mit mehreren Tabellen in einer Dexie-Transaktion.
- [ ] **Step 3:** Run → PASS. Commit `feat: dexie storage and repository`.

---

### Task 6: Speicher – Sicherungsdatei

**Files:**
- Create: `src/storage/backup.ts`
- Test: `src/storage/backup.test.ts`

**Interfaces:**
- Consumes: `db`, `getMeta`/`setMeta` aus Task 5.
- Produces:
  ```ts
  interface BackupFile { format: 'klientenverwaltung'; version: 1; exportedAt: string;
                         clients: Client[]; contracts: Contract[];
                         pdfs: Array<Omit<PdfDoc, 'data'> & { dataBase64: string }> }
  class BackupError extends Error {}
  backupFileName(now?: Date): string                       // 'klienten-sicherung-2026-10-28.json'
  buildBackup(): Promise<BackupFile>
  exportBackup(): Promise<{ fileName: string; blob: Blob }> // setzt lastExportAt, dirty=false
  parseBackup(text: string): BackupFile                    // wirft BackupError
  describeDifference(file: BackupFile): Promise<{ fileExportedAt: string; fileClients: number; localClients: number; localLastExportAt?: string; fileIsOlder: boolean }>
  importBackup(file: BackupFile): Promise<void>            // Sicherheitskopie, dann Ersetzen in einer Transaktion
  restoreSafetyCopy(): Promise<boolean>
  ```

- [ ] **Step 1:** Tests: `backupFileName(new Date(2026,9,28)) === 'klienten-sicherung-2026-10-28.json'`. Round-trip: Klient + Vertrag (mit Stunden und bezahltem Monat) + PDF mit Bytes `[1,2,3,255]` exportieren, DB leeren, importieren → alles identisch, PDF-Bytes gleich. Leerer Klient (alle Felder leer) übersteht den Round-trip. `parseBackup` wirft `BackupError` bei: kein JSON, `{}`, `format` falsch, `version: 2`, `clients` kein Array, PDF mit ungültigem Base64. Fehlschlag beim Parsen verändert die DB nicht. `importBackup` legt vorher `safetyCopy` an; `restoreSafetyCopy()` stellt den Stand vor dem Import wieder her und liefert `true`, ohne Kopie `false`. `importBackup` mit einem (gemockten) Schreibfehler lässt den alten Stand unverändert. `describeDifference.fileIsOlder` ist `true`, wenn `exportedAt` der Datei vor `lastExportAt` des lokalen Standes liegt. `exportBackup` setzt `dirty` auf `false`.
- [ ] **Step 2:** Run → FAIL. Implementieren; Base64 per `FileReader`/`btoa` in Blöcken (große PDFs dürfen den Stack nicht sprengen – Test mit 5-MB-Array).
- [ ] **Step 3:** Run → PASS. Commit `feat: backup export/import with safety copy`.

---

### Task 7: UI – Rahmen, Klientenliste, Profil (Stammdaten, Status, Löschen)

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/Layout.tsx`, `src/ui/pages/ClientListPage.tsx`, `src/ui/pages/ClientPage.tsx`, `src/ui/client/ProfileTab.tsx`, `src/ui/ui.css`
- Modify: `src/main.tsx` (HashRouter)
- Test: `src/ui/pages/ClientListPage.test.tsx`, `src/ui/client/ProfileTab.test.tsx`

**Interfaces:**
- Consumes: Repository (Task 5), `dexie-react-hooks` `useLiveQuery`.
- Produces: Routen `/` (Übersicht), `/klienten`, `/klienten/:id`, `/sicherung`; `clientDisplayName(c: Client): string` ("Unbenannter Klient" bei leerem Namen); Layout mit unterer Leiste auf schmalen, Seitenleiste auf breiten Bildschirmen (CSS-Media-Query ab 768 px). Das Klientenprofil bekommt Reiter `Stammdaten | Verträge | Notizen | PDFs`; spätere Tasks füllen die anderen Reiter.

- [ ] **Step 1:** Tests: Liste zeigt "Unbenannter Klient" für leeren Klienten; Suchfeld filtert nach Name; Statusfilter blendet andere Status aus; Button "Neuer Klient" legt einen Klienten an und navigiert zum Profil. Profil: Statuswechsel auf `pausiert` wird gespeichert; Löschen verlangt Bestätigung (`window.confirm` oder Dialog), ohne Bestätigung bleibt der Klient bestehen, mit Bestätigung ist er weg und die Liste leer.
- [ ] **Step 2:** Run → FAIL. Implementieren; Eingaben speichern beim Verlassen des Feldes (onBlur), damit nichts verloren geht.
- [ ] **Step 3:** Run → PASS; `npm run dev` kurz starten und Liste/Profil im Browser ansehen. Commit `feat: layout, client list and profile`.

---

### Task 8: UI – Verträge, Stunden, Monate

**Files:**
- Create: `src/ui/client/ContractsTab.tsx`, `src/ui/client/ContractCard.tsx`
- Test: `src/ui/client/ContractsTab.test.tsx`

**Interfaces:**
- Consumes: `updateContract`, `createContract`, `deleteContract`, `totalCents`, `monthAmounts`, `syncHourRows`, `canChangeTerm`, `contractTimeline`, `formatEuro`, `parseEuroToCents`.
- Produces: Reiter "Verträge" – pro Vertrag: Startmonat (`<input type="month">`), Laufzeit, Preis-Umschalter "Monatspreis/Gesamtpreis" mit abgeleiteter Anzeige des jeweils anderen Wertes, Stundenpreis, Stundenanzahl, Stundenzeilen (Häkchen, Datum, Notiz), Zeitleiste mit Häkchen "Honorar eingegangen" (+ optional Eingangsdatum), Summe der Stunden über alle Verträge im Reiterkopf ("x von y Stunden").

- [ ] **Step 1:** Tests: Eingabe Monatspreis `100` bei 6 Monaten zeigt Gesamtpreis `600,00 €`; Umschalten auf Gesamtpreis `100` bei 3 Monaten zeigt Monatsbeträge 33,33/33,33/33,34 in der Zeitleiste. Stundenanzahl 3 erzeugt 3 Zeilen; Stunde abhaken + Datum + Notiz werden gespeichert. Verkürzen der Laufzeit unter einen bezahlten Monat wird abgelehnt (Meldung), Verkürzen sonst mit Bestätigung. Mehrere Verträge am selben Klienten funktionieren. Vertrag ohne Startmonat zeigt "Startmonat wählen" statt Zeitleiste und stürzt nicht ab. Honorar-Häkchen speichert in `contract.paid[month]`.
- [ ] **Step 2:** Run → FAIL. Implementieren.
- [ ] **Step 3:** Run → PASS. Commit `feat: contracts tab with hours and payment months`.

---

### Task 9: UI – Notizen, Dokumentation, PDFs

**Files:**
- Create: `src/ui/client/NotesTab.tsx`, `src/ui/client/PdfTab.tsx`
- Test: `src/ui/client/NotesTab.test.tsx`, `src/ui/client/PdfTab.test.tsx`

**Interfaces:**
- Consumes: `updateClient`, `addPdf`, `deletePdf`, `db.pdfs`.
- Produces: Reiter "Notizen" (Freitext `notes` + Liste datierter Dokumentationseinträge hinzufügen/bearbeiten/löschen, neueste oben); Reiter "PDFs" (Hinzufügen per Dateiauswahl `accept="application/pdf"`, Liste mit Name und Datum, Öffnen/Herunterladen über `URL.createObjectURL`, Löschen mit Bestätigung).

- [ ] **Step 1:** Tests: Notiztext wird nach Blur gespeichert; Dokumentationseintrag hinzufügen erscheint oben mit heutigem Datum; Eintrag löschen entfernt ihn. PDF hinzufügen legt Eintrag an (Name = Dateiname, auch mit Umlauten und Leerzeichen); Nicht-PDF-Datei wird abgelehnt mit Meldung; PDF löschen entfernt es aus der Datenbank.
- [ ] **Step 2:** Run → FAIL. Implementieren.
- [ ] **Step 3:** Run → PASS. Commit `feat: notes, documentation log and pdf storage`.

---

### Task 10: UI – Übersicht

**Files:**
- Create: `src/ui/pages/OverviewPage.tsx`
- Test: `src/ui/pages/OverviewPage.test.tsx`

**Interfaces:**
- Consumes: `monthOverview`, `currentMonth`, `addMonths`, `monthLabel`, `formatEuro`, `updateContract`.
- Produces: Startseite mit Anzahl aktiver Klienten, "Erwartet / Eingegangen / Offen" für den gewählten Monat, Monatsblättern per Pfeil (Standard `currentMonth()`), Liste offener Einträge je Klient (Name, Betrag), ein Tipp hakt den Monat als bezahlt ab (`paid[month] = { paidOn: heute }`) und der Eintrag verschwindet aus der Liste.

- [ ] **Step 1:** Tests: Bei Seed-Daten (zwei aktive Klienten, einer pausiert) zeigt die Seite "2" aktive Klienten und die richtigen Summen; Pfeil vor/zurück wechselt den Monat (Dezember → Januar des Folgejahres); Abhaken verschiebt Betrag von Offen nach Eingegangen; leere Datenbank zeigt 0 und 0,00 € ohne Fehler.
- [ ] **Step 2:** Run → FAIL. Implementieren.
- [ ] **Step 3:** Run → PASS. Commit `feat: overview page`.

---

### Task 11: UI – Sicherung

**Files:**
- Create: `src/ui/pages/BackupPage.tsx`
- Test: `src/ui/pages/BackupPage.test.tsx`

**Interfaces:**
- Consumes: `exportBackup`, `parseBackup`, `describeDifference`, `importBackup`, `restoreSafetyCopy`, `BackupError`, `getMeta`.
- Produces: Seite "Sicherung": Button "Exportieren" (löst Download der Datei per `<a download>` aus), Anzeige "Letzter Export: …" und Hinweis "Ungesicherte Änderungen" wenn `dirty`; Button "Importieren" (Dateiauswahl `.json`) → Vergleichsdialog (Datei- gegen lokaler Stand, Warnung bei älterer Datei) → Bestätigen/Abbrechen; Button "Stand vor letztem Import wiederherstellen". Fehler werden als lesbare deutsche Meldung angezeigt.

- [ ] **Step 1:** Tests: Export-Klick erzeugt Datei mit korrektem Namen und löscht den Hinweis "Ungesicherte Änderungen". Import einer gültigen Datei zeigt Vergleich, nach Abbrechen bleibt der Stand unverändert, nach Bestätigen ist er ersetzt. Import einer kaputten Datei zeigt eine Fehlermeldung, Stand unverändert. Ältere Datei zeigt Warnung.
- [ ] **Step 2:** Run → FAIL. Implementieren.
- [ ] **Step 3:** Run → PASS. Commit `feat: backup page`.

---

### Task 12: PWA

**Files:**
- Modify: `vite.config.ts`, `index.html`
- Create: `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`

**Interfaces:**
- Produces: installierbare, offline-fähige App (Name "Klientenverwaltung", `display: standalone`, `lang: de`, `start_url: './'`, `scope: './'`), Precaching aller Build-Dateien über `vite-plugin-pwa`, `base: './'` in Vite.

- [ ] **Step 1:** `vite-plugin-pwa` installieren und konfigurieren; Icons erzeugen (einfaches Monogramm "K").
- [ ] **Step 2:** `npm run build && npm run preview`; mit Playwright (Chromium) prüfen: Manifest erreichbar, Service Worker registriert, nach `context.setOffline(true)` lädt die Seite weiterhin.
- [ ] **Step 3:** Commit `feat: installable offline pwa`.

---

### Task 13: End-to-End-Test

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/main-flow.spec.ts`

**Interfaces:**
- Consumes: gebaute App über `vite preview`.

- [ ] **Step 1:** Test "Hauptablauf": Klient anlegen (nur Name) → Vertrag 2026-03, 3 Monate, Gesamtpreis 100 € → Stunde abhaken → ersten Monat abhaken → Übersicht für März 2026 zeigt Eingegangen 33,33 € und Offen 66,67 € → Export (Download erfassen) → Klient löschen → Import derselben Datei → Klient wieder da mit abgehakten Werten.
- [ ] **Step 2:** `npx playwright test` → PASS. Commit `test: end-to-end main flow`.

---

### Task 14: Windows-EXE (Tauri) und Build-Pipeline

**Files:**
- Create: `src-tauri/` (Tauri v2), `.github/workflows/build-windows.yml`
- Modify: `package.json` (Skripte `tauri`, `tauri:build`)

**Interfaces:**
- Consumes: gebaute Web-App (`dist`).
- Produces: Windows-Installer/EXE als Artefakt des GitHub-Actions-Laufs (Runner `windows-latest`, Auslöser `workflow_dispatch` und Tag `v*`).

- [ ] **Step 1:** Tauri v2 einrichten (`frontendDist: ../dist`, Fenstertitel "Klientenverwaltung", keine Netzwerkberechtigungen, `devUrl` für `npm run dev`).
- [ ] **Step 2:** Workflow: Node + Rust installieren, `npm ci`, `npm test`, `npm run tauri:build`, Artefakt hochladen.
- [ ] **Step 3:** Auf Linux `npm run build` und `cargo check` für `src-tauri` ausführen (soweit möglich). Die tatsächliche EXE entsteht erst im GitHub-Lauf; Ergebnis nach dem ersten Lauf prüfen.
- [ ] **Step 4:** **Bekanntes Risiko:** Der Datei-Download per `<a download>` und die Dateiauswahl funktionieren in WebView2 voraussichtlich, sind aber auf Windows nicht in dieser Umgebung prüfbar. Falls der Download dort fehlschlägt, `tauri-plugin-dialog` und `tauri-plugin-fs` ergänzen und in `BackupPage` eine kleine Weiche (`'__TAURI__' in window`) einbauen. Dem Nutzer nach dem ersten Build einen Prüfpunkt "Export und Import auf Windows testen" nennen.
- [ ] **Step 5:** Commit `feat: tauri windows build and github actions`.

---

## Selbstprüfung

- **Spec-Abdeckung:** Stammdaten/Status/Löschen (T5, T7); Notizen/Dokumentation/PDFs (T9); mehrere Verträge, Laufzeit, Preise beidseitig (T3, T8); Stunden (T3, T8); Honorar-Häkchen (T8, T10); Zeitleiste (T4, T8); Übersicht (T4, T10); Sicherung/Import/Sicherheitskopie (T6, T11); PWA (T12); EXE (T14); keine Pflichtfelder (T5, T7, Review Focus); Bestätigungen und Laufzeit-Regel (T3, T7, T8, T11).
- **Typen:** `Contract`, `HourEntry`, `YearMonth` und die Funktionsnamen aus T2–T6 sind in T7–T11 unverändert verwendet.
- **Verhältnis:** Die Rechenlogik hat eigene Tests je Funktion; UI-Tasks beschreiben Verhalten statt Code.
