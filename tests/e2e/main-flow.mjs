// E2E main flow (not part of `npm test`). Run: npm run test:e2e   (or: node tests/e2e/main-flow.mjs <baseUrl>)
// Uses the pre-installed `playwright` library (no @playwright/test).
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/opt/node22/lib/node_modules/playwright'))
}

const base = process.argv[2] ?? 'http://localhost:4173/'
const T = 10000
const NAME = 'Anna Beispiel'
const PDF_NAME = 'Vertrag Müller.pdf'
const NOTE = 'Allgemeine Notiz zu Anna'
const LOG = 'Erstgespräch geführt'
const HOUR_NOTE = 'Kennenlernen'
const HOUR_DATE = '2026-03-05'

// Minimal valid 1-page PDF
function makePdf() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ]
  let out = '%PDF-1.4\n'
  const offs = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  offs.forEach((o) => { out += String(o).padStart(10, '0') + ' 00000 n \n' })
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

// expect-style polling helper
async function eventually(fn, msg, ms = T) {
  const end = Date.now() + ms
  let last
  for (;;) {
    try { await fn(); return } catch (e) { last = e }
    if (Date.now() > end) throw new Error(`${msg}: ${last?.message ?? last}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({ acceptDownloads: true })
const page = await context.newPage()
const consoleProblems = []
page.on('console', (m) => { if (m.type() === 'error') consoleProblems.push(`console.error: ${m.text()}`) })
page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${e.message}`))
page.setDefaultTimeout(T)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klienten-e2e-'))
let step = 0
async function run(title, fn) {
  step += 1
  try {
    await fn()
  } catch (e) {
    e.message = `Schritt ${step} (${title}) fehlgeschlagen: ${e.message}`
    throw e
  }
  console.log(`OK  Schritt ${step}: ${title}`)
}

const nav = (name) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name, exact: true })
const stat = (label) => page.locator('dl.stats .stat').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd')
const text = async (loc) => ((await loc.textContent()) ?? '').replace(/\s+/g, ' ').trim()
// Euro formatting may use a (narrow) no-break space; normalise for comparison
const norm = (s) => s.replace(/[  ]/g, ' ')
async function expectStat(label, want) {
  await eventually(async () => assert.equal(norm(await text(stat(label))), want), `Kennzahl "${label}"`)
}
async function expectMonth(month, expected, received, open) {
  await page.goto(`${base}#/?monat=${month}`)
  await page.getByRole('heading', { level: 1, name: 'Übersicht' }).waitFor()
  await expectStat('Erwartet', expected)
  if (received !== undefined) await expectStat('Eingegangen', received)
  if (open !== undefined) await expectStat('Offen', open)
}
async function fill(label, value, opts = {}) {
  const f = (opts.scope ?? page).getByLabel(label, { exact: true })
  await f.fill(value)
  await f.blur()
  return f
}
const tab = (name) => page.getByRole('tab', { name, exact: true })

try {
  await run('Übersicht leer', async () => {
    await page.goto(base)
    await page.getByRole('heading', { level: 1, name: 'Übersicht' }).waitFor()
    await expectStat('Aktive Klienten', '0')
    await expectStat('Erwartet', '0,00 €')
  })

  await run('Klient anlegen (nur Name)', async () => {
    await nav('Klienten').click()
    await page.getByRole('button', { name: 'Neuer Klient' }).click()
    await fill('Name', NAME)
    await page.getByRole('heading', { level: 1, name: NAME }).waitFor()
    assert.equal(await page.getByRole('radio', { name: 'Aktiv' }).isChecked(), true, 'Status aktiv')
  })

  const card = page.locator('fieldset.contract')
  await run('Vertrag, Stunde und Monat abhaken', async () => {
    await tab('Verträge').click()
    await page.getByRole('button', { name: 'Vertrag hinzufügen' }).click()
    await card.waitFor()
    await fill('Startmonat', '2026-03', { scope: card })
    await fill('Laufzeit in Monaten', '3', { scope: card })
    const total = card.getByRole('radio', { name: 'Gesamtpreis' })
    await total.click() // controlled input: state flips after the async DB write
    await eventually(async () => assert.equal(await total.isChecked(), true), 'Gesamtpreis gewählt')
    await fill('Preis in € gesamt', '100', { scope: card })
    await fill('Geplante Stunden', '2', { scope: card })
    await eventually(async () => {
      assert.match(await text(card.locator('p.derived').first()), /33,33.*33,34/)
    }, 'Monatspreis 33,33 bis 33,34')
    const items = card.getByRole('list', { name: 'Zeitleiste' }).getByRole('listitem')
    await eventually(async () => {
      assert.equal(await items.count(), 3)
      assert.match(norm(await text(items.nth(0))), /März 2026 · 33,33 €/)
      assert.match(norm(await text(items.nth(1))), /April 2026 · 33,33 €/)
      assert.match(norm(await text(items.nth(2))), /Mai 2026 · 33,34 €/)
    }, 'Zeitleiste 33,33 / 33,33 / 33,34')
    await card.getByRole('checkbox', { name: 'Stunde 1 erledigt' }).click()
    await fill('Datum Stunde 1', HOUR_DATE, { scope: card })
    await fill('Notiz Stunde 1', HOUR_NOTE, { scope: card })
    await items.nth(0).getByRole('checkbox', { name: 'Honorar eingegangen' }).click()
    await eventually(async () => {
      assert.equal(await card.getByRole('checkbox', { name: 'Stunde 1 erledigt' }).isChecked(), true)
      assert.equal(await items.nth(0).getByRole('checkbox', { name: 'Honorar eingegangen' }).isChecked(), true)
      assert.match(await text(card.locator('p.derived').nth(1)), /1 von 2 Stunden/)
    }, 'Haken gespeichert')
  })

  await run('Notizen und PDF', async () => {
    await tab('Notizen').click()
    await fill('Notizen', NOTE)
    await page.getByRole('button', { name: 'Eintrag hinzufügen' }).click()
    await fill('Eintrag', LOG)
    await tab('PDFs').click()
    await page.getByLabel('PDF hinzufügen').setInputFiles({ name: PDF_NAME, mimeType: 'application/pdf', buffer: makePdf() })
    await page.locator('ul.pdf-list').getByText(PDF_NAME, { exact: true }).waitFor()
    // Notizen persisted?
    await tab('Notizen').click()
    await eventually(async () => {
      assert.equal(await page.getByLabel('Notizen', { exact: true }).inputValue(), NOTE)
      assert.equal(await page.getByLabel('Eintrag', { exact: true }).inputValue(), LOG)
    }, 'Notizen gespeichert')
  })

  await run('Übersicht Mär/Apr/Mai 2026', async () => {
    await expectMonth('2026-03', '33,33 €', '33,33 €', '0,00 €')
    await expectStat('Aktive Klienten', '1')
    await expectMonth('2026-04', '33,33 €', '0,00 €', '33,33 €')
    await expectMonth('2026-05', '33,34 €')
  })

  const file = path.join(tmp, 'sicherung.json')
  await run('Export', async () => {
    await nav('Sicherung').click()
    await page.getByRole('heading', { level: 1, name: 'Sicherung' }).waitFor()
    await page.getByText('Ungesicherte Änderungen').waitFor()
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportieren', exact: true }).click(),
    ])
    assert.match(dl.suggestedFilename(), /^klienten-sicherung-\d{4}-\d{2}-\d{2}\.json$/)
    await dl.saveAs(file)
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(data.format, 'klientenverwaltung')
    assert.equal(data.version, 1)
    assert.equal(data.clients.length, 1)
    assert.equal(data.contracts.length, 1)
    assert.equal(data.pdfs.length, 1)
    assert.ok(typeof data.pdfs[0].dataBase64 === 'string' && data.pdfs[0].dataBase64.length > 0, 'dataBase64 nicht leer')
    await page.getByText('Ungesicherte Änderungen').waitFor({ state: 'detached' })
  })

  await run('Klient löschen', async () => {
    await nav('Klienten').click()
    await page.getByRole('link', { name: new RegExp(NAME) }).click()
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Klient löschen' }).click()
    await page.getByText('Keine Klienten gefunden.').waitFor()
    await nav('Übersicht').click()
    await expectStat('Aktive Klienten', '0')
  })

  async function verifyClient() {
    await nav('Klienten').click()
    await page.getByRole('link', { name: new RegExp(NAME) }).click()
    await page.getByRole('heading', { level: 1, name: NAME }).waitFor()
    await tab('Verträge').click()
    const c = page.locator('fieldset.contract')
    await c.waitFor()
    assert.equal(await c.getByLabel('Startmonat', { exact: true }).inputValue(), '2026-03')
    assert.equal(await c.getByLabel('Laufzeit in Monaten', { exact: true }).inputValue(), '3')
    assert.equal(await c.getByRole('radio', { name: 'Gesamtpreis' }).isChecked(), true)
    const items = c.getByRole('list', { name: 'Zeitleiste' }).getByRole('listitem')
    assert.equal(await items.count(), 3, '3 Monate')
    assert.equal(await items.nth(0).getByRole('checkbox', { name: 'Honorar eingegangen' }).isChecked(), true, 'März bezahlt')
    assert.equal(await items.nth(1).getByRole('checkbox', { name: 'Honorar eingegangen' }).isChecked(), false)
    assert.equal(await c.getByRole('checkbox', { name: 'Stunde 1 erledigt' }).isChecked(), true)
    assert.equal(await c.getByRole('checkbox', { name: 'Stunde 2 erledigt' }).isChecked(), false)
    assert.equal(await c.getByLabel('Datum Stunde 1', { exact: true }).inputValue(), HOUR_DATE)
    assert.equal(await c.getByLabel('Notiz Stunde 1', { exact: true }).inputValue(), HOUR_NOTE)
    await tab('Notizen').click()
    assert.equal(await page.getByLabel('Notizen', { exact: true }).inputValue(), NOTE)
    assert.equal(await page.getByLabel('Eintrag', { exact: true }).inputValue(), LOG)
    await tab('PDFs').click()
    await page.locator('ul.pdf-list').getByText(PDF_NAME, { exact: true }).waitFor()
    await expectMonth('2026-03', '33,33 €', '33,33 €', '0,00 €')
    await expectMonth('2026-04', '33,33 €', '0,00 €', '33,33 €')
  }

  await run('Import und Prüfung der Daten', async () => {
    await nav('Sicherung').click()
    await page.getByLabel('Sicherung importieren').setInputFiles(file)
    await page.getByRole('region', { name: 'Import bestätigen' }).waitFor()
    await page.getByRole('button', { name: 'Jetzt importieren (ersetzt alle Daten)' }).click()
    await page.getByText(/Import abgeschlossen/).waitFor()
    await verifyClient()
  })

  await run('Neu laden, Daten bleiben erhalten', async () => {
    await page.reload()
    await verifyClient()
  })

  await run('Keine Konsolenfehler', async () => {
    assert.deepEqual(consoleProblems, [])
  })
  console.log('E2E PASSED')
} catch (e) {
  console.error(e.message)
  if (consoleProblems.length) console.error('Konsole:\n' + consoleProblems.join('\n'))
  try { await page.screenshot({ path: path.join(tmp, 'failure.png') }); console.error(`Screenshot: ${path.join(tmp, 'failure.png')}`) } catch { /* ignore */ }
  process.exitCode = 1
} finally {
  await browser.close()
  if (process.exitCode !== 1) fs.rmSync(tmp, { recursive: true, force: true })
}
