// PWA check (not part of `npm test`).
// Run:  npm run build && npm run preview -- --port 4173   (in one shell)
//       node tests/pwa/pwa-check.mjs [baseUrl]            (in another)
// Needs the `playwright` package with Chromium installed.
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/opt/node22/lib/node_modules/playwright'))
}

const base = process.argv[2] ?? 'http://localhost:4173/'
const origin = new URL(base).origin
const ok = (m) => console.log('OK  ' + m)

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
const external = []
const failed = []
page.on('request', (r) => {
  if (!r.url().startsWith(origin) && !/^(data|blob|about):/.test(r.url())) external.push(r.url())
})
page.on('requestfailed', (r) => {
  if (!r.url().startsWith(origin)) failed.push(r.url())
})

try {
  // (1) manifest + icons
  const mres = await context.request.get(new URL('manifest.webmanifest', base).href)
  assert.equal(mres.status(), 200)
  const m = await mres.json()
  assert.equal(m.name, 'Klientenverwaltung')
  assert.equal(m.display, 'standalone')
  assert.equal(m.lang, 'de')
  assert.equal(m.start_url, './')
  assert.equal(m.scope, './')
  assert.ok(m.icons.some((i) => i.sizes === '192x192'))
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && !i.purpose))
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'))
  for (const i of m.icons) {
    const r = await context.request.get(new URL(i.src, base).href)
    assert.equal(r.status(), 200, i.src)
    assert.match(r.headers()['content-type'], /image\/png/, i.src)
  }
  ok(`manifest "${m.name}", standalone, ${m.icons.length} icons (200, image/png)`)

  // (2) service worker active
  await page.goto(base)
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated')
  ok('service worker activated')

  // create a client via UI
  await page.goto(base + '#/klienten')
  await page.getByRole('button', { name: 'Neuer Klient' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Offline Testklient')
  await page.getByLabel('Name', { exact: true }).blur()
  await page.waitForTimeout(800)
  ok('client created online')

  // (3) reload online (cache warm), then offline
  await page.reload()
  await page.waitForLoadState('networkidle')
  await context.setOffline(true)
  await page.goto(base + '#/klienten')
  await page.reload()
  await page.getByRole('heading', { name: 'Klienten', level: 1 }).waitFor()
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).waitFor()
  await page.getByText('Offline Testklient').waitFor()
  ok('offline reload renders heading, nav and IndexedDB client')

  // fresh navigation to the root path while offline
  await page.goto(base)
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).waitFor()
  ok('offline navigation to start URL works')

  // (4) no external requests
  assert.deepEqual(external, [], 'external requests: ' + external.join(', '))
  assert.deepEqual(failed, [], 'failed external requests: ' + failed.join(', '))
  ok('no external or failed external requests')
  console.log('PWA CHECK PASSED')
} catch (e) {
  console.error('FAIL ' + e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
