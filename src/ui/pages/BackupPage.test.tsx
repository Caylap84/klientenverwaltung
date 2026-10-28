import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createClient, db, getMeta, setMeta } from '../../storage/repository'
import { buildBackup, exportBackup, importBackup } from '../../storage/backup'
import BackupPage from './BackupPage'

let downloads: Array<{ name: string; blob: Blob }>
let blobsByUrl: Map<string, Blob>

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  downloads = []
  blobsByUrl = new Map()
  let n = 0
  URL.createObjectURL = vi.fn((b: Blob) => {
    const u = `blob:test/${n++}`
    blobsByUrl.set(u, b)
    return u
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: blobsByUrl.get(this.href)! })
  })
})
afterEach(() => vi.restoreAllMocks())

function renderPage() {
  return render(
    <MemoryRouter>
      <BackupPage />
    </MemoryRouter>,
  )
}

const names = async () => (await db.clients.toArray()).map((c) => c.name).sort()

/** Echte Sicherung der aktuellen DB als File; DB danach unverändert (außer Meta). */
async function makeFile(fileName = 'sicherung.json'): Promise<File> {
  const { blob } = await exportBackup()
  return new File([await blob.text()], fileName, { type: 'application/json' })
}

const input = () => screen.getByLabelText('Sicherung importieren') as HTMLInputElement

async function pick(file: File) {
  const user = userEvent.setup({ applyAccept: false })
  await user.upload(input(), file)
}

describe('BackupPage', () => {
  it('zeigt "Noch nie exportiert" und den Hinweis auf ungesicherte Änderungen', async () => {
    await createClient({ name: 'Anna' })
    renderPage()
    expect(await screen.findByText('Noch nie exportiert')).toBeInTheDocument()
    expect(await screen.findByText(/Ungesicherte Änderungen/)).toBeInTheDocument()
  })

  it('Export lädt Datei mit richtigem Namen herunter und löscht den Hinweis', async () => {
    await createClient({ name: 'Anna' })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/Ungesicherte Änderungen/)
    await user.click(screen.getByRole('button', { name: 'Exportieren' }))
    const ok = await screen.findByText(/^Sicherung gespeichert: /)
    expect(downloads).toHaveLength(1)
    expect(downloads[0].name).toMatch(/^klienten-sicherung-\d{4}-\d{2}-\d{2}\.json$/)
    expect(ok).toHaveTextContent(downloads[0].name)
    expect(JSON.parse(await downloads[0].blob.text()).clients).toHaveLength(1)
    await waitFor(() => expect(screen.queryByText(/Ungesicherte Änderungen/)).not.toBeInTheDocument())
    expect(screen.queryByText('Noch nie exportiert')).not.toBeInTheDocument()
    expect(screen.getByText(/^Letzter Export: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} Uhr$/)).toBeInTheDocument()
    expect(await getMeta('dirty')).toBe(false)
  })

  it('Hinweis erscheint live, sobald Daten geändert werden', async () => {
    renderPage()
    await screen.findByText('Noch nie exportiert')
    expect(screen.queryByText(/Ungesicherte Änderungen/)).not.toBeInTheDocument()
    await createClient({ name: 'Neu' })
    expect(await screen.findByText(/Ungesicherte Änderungen/)).toBeInTheDocument()
  })

  it('Import: Vergleich, Abbrechen lässt alles unverändert, Bestätigen ersetzt', async () => {
    await createClient({ name: 'Alt 1' })
    const file = await makeFile()
    await createClient({ name: 'Neu 2' })
    await createClient({ name: 'Neu 3' })
    const before = await buildBackup()
    const user = userEvent.setup({ applyAccept: false })
    renderPage()
    await user.upload(input(), file)
    const panel = await screen.findByRole('region', { name: 'Import bestätigen' })
    expect(within(panel).getByText(/Datei: exportiert am .*, 1 Klient/)).toBeInTheDocument()
    expect(within(panel).getByText(/^Dieses Gerät: Stand \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} Uhr, letzter Export \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} Uhr, 3 Klienten$/)).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('region', { name: 'Import bestätigen' })).not.toBeInTheDocument()
    expect(input().value).toBe('')
    const after = await buildBackup()
    expect({ ...after, exportedAt: '' }).toEqual({ ...before, exportedAt: '' })
    expect(await getMeta('safetyCopy')).toBeUndefined()

    await user.upload(input(), file)
    await user.click(await screen.findByRole('button', { name: 'Jetzt importieren (ersetzt alle Daten)' }))
    expect(await screen.findByText('Import abgeschlossen: 1 Klient')).toBeInTheDocument()
    expect(await names()).toEqual(['Alt 1'])
    expect(await getMeta('dirty')).toBe(false)
    expect(await getMeta('safetyCopy')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Import bestätigen' })).not.toBeInTheDocument()
  })

  it('dieselbe Datei kann zweimal importiert werden', async () => {
    await createClient({ name: 'Eins' })
    const file = await makeFile()
    const user = userEvent.setup({ applyAccept: false })
    renderPage()
    for (let i = 0; i < 2; i++) {
      await user.upload(input(), file)
      await user.click(await screen.findByRole('button', { name: 'Jetzt importieren (ersetzt alle Daten)' }))
      await screen.findByText('Import abgeschlossen: 1 Klient')
      await waitFor(() => expect(input().value).toBe(''))
      expect(await names()).toEqual(['Eins'])
      if (i === 0) await createClient({ name: 'Zwischendurch' })
    }
  })

  const badFiles: Array<[string, string, RegExp]> = [
    ['kein JSON', 'das ist kein json', /keine gültige Sicherung/],
    ['falsches JSON', JSON.stringify({ hallo: 1 }), /keine gültige Sicherung/],
    [
      'neuere Version',
      JSON.stringify({ format: 'klientenverwaltung', version: 2, exportedAt: 'x', clients: [], contracts: [], pdfs: [] }),
      /neueren Version/,
    ],
  ]
  for (const [label, text, msg] of badFiles) {
    it(`fehlerhafte Datei (${label}): deutscher Fehler, Daten und Sicherheitskopie unberührt`, async () => {
      await createClient({ name: 'Bleibt' })
      await setMeta('safetyCopy', { marker: 1 })
      const before = await buildBackup()
      renderPage()
      await pick(new File([text], 'x.json', { type: 'application/json' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(msg)
      expect(screen.queryByRole('region', { name: 'Import bestätigen' })).not.toBeInTheDocument()
      expect(input().value).toBe('')
      expect({ ...(await buildBackup()), exportedAt: '' }).toEqual({ ...before, exportedAt: '' })
      expect(await getMeta('safetyCopy')).toEqual({ marker: 1 })
    })
  }

  it('zu große Datei wird vor dem Lesen abgelehnt', async () => {
    renderPage()
    const big = new File(['{}'], 'gross.json', { type: 'application/json' })
    Object.defineProperty(big, 'size', { value: 501 * 1024 * 1024 })
    const spy = vi.spyOn(big, 'text')
    await pick(big)
    expect(await screen.findByRole('alert')).toHaveTextContent(/zu groß/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('ältere Datei zeigt die Warnung', async () => {
    await createClient({ name: 'A' })
    const old = await makeFile()
    await new Promise((r) => setTimeout(r, 15))
    await exportBackup()
    renderPage()
    await pick(old)
    const panel = await screen.findByRole('region', { name: 'Import bestätigen' })
    expect(within(panel).getByText(/Diese Datei ist älter als der Stand dieses Geräts \(letzter Export oder Import\)\. Beim Import gehen neuere Änderungen verloren\./)).toBeInTheDocument()
    expect(within(panel).queryByText(/ungesicherte Änderungen, die beim Import/)).not.toBeInTheDocument()
  })

  it('neuere Datei zeigt keine AltersWarnung; ungesicherte Änderungen zeigen die Zusatzwarnung', async () => {
    await createClient({ name: 'A' })
    const file = await makeFile()
    await createClient({ name: 'B' })
    renderPage()
    await pick(file)
    const panel = await screen.findByRole('region', { name: 'Import bestätigen' })
    expect(within(panel).queryByText(/älter als der Stand dieses Geräts/)).not.toBeInTheDocument()
    expect(within(panel).getByText('Dieses Gerät hat ungesicherte Änderungen, die beim Import verloren gehen.')).toBeInTheDocument()
  })

  it('nach Import einer neueren Datei: eigene ältere Datei zeigt die Warnung, Stand wird angezeigt', async () => {
    await createClient({ name: 'B' })
    const own = await makeFile('eigene.json')
    const parsedOwn = JSON.parse(await own.text())
    const newer = { ...parsedOwn, exportedAt: new Date(Date.parse(parsedOwn.exportedAt) + 86_400_000).toISOString() }
    await importBackup(newer)
    renderPage()
    const d = new Date(newer.exportedAt)
    const pad = (n: number) => String(n).padStart(2, '0')
    const shown = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`
    expect(await screen.findByText(`Stand dieses Geräts: ${shown}`)).toBeInTheDocument()
    await pick(own)
    const panel = await screen.findByRole('region', { name: 'Import bestätigen' })
    expect(within(panel).getByText(/älter als der Stand dieses Geräts/)).toBeInTheDocument()
    expect(within(panel).getByText(new RegExp(`^Dieses Gerät: Stand ${shown}`))).toBeInTheDocument()
  })

  it('Wiederherstellen erscheint nur mit Sicherheitskopie und tauscht die Stände', async () => {
    await createClient({ name: 'Vorher' })
    renderPage()
    await screen.findByText('Noch nie exportiert')
    expect(screen.queryByRole('button', { name: 'Stand vor dem letzten Import wiederherstellen' })).not.toBeInTheDocument()

    const file = await makeFile()
    await createClient({ name: 'Nachher' })
    const parsed = JSON.parse(await file.text())
    await importBackup(parsed)
    expect(await names()).toEqual(['Vorher'])

    const user = userEvent.setup()
    const btn = await screen.findByRole('button', { name: 'Stand vor dem letzten Import wiederherstellen' })
    await user.click(btn)
    const panel = await screen.findByRole('region', { name: 'Wiederherstellen bestätigen' })
    expect(panel).toHaveTextContent(/zur neuen Sicherheitskopie/)
    await user.click(within(panel).getByRole('button', { name: 'Abbrechen' }))
    expect(await names()).toEqual(['Vorher'])

    await user.click(screen.getByRole('button', { name: 'Stand vor dem letzten Import wiederherstellen' }))
    await user.click(await screen.findByRole('button', { name: 'Jetzt wiederherstellen' }))
    expect(await screen.findByText(/^Stand wiederhergestellt/)).toBeInTheDocument()
    expect(await names()).toEqual(['Nachher', 'Vorher'])
    expect(await getMeta('dirty')).toBe(true)
    expect(await screen.findByText(/Ungesicherte Änderungen/)).toBeInTheDocument()
  })

  describe('Speicherstatus', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'storage')
    const mockStorage = (value: unknown) => Object.defineProperty(navigator, 'storage', { value, configurable: true })
    afterEach(() => {
      if (original) Object.defineProperty(navigator, 'storage', original)
      else delete (navigator as unknown as Record<string, unknown>).storage
    })

    it('dauerhaft gesichert', async () => {
      mockStorage({ persisted: vi.fn(async () => true) })
      renderPage()
      expect(await screen.findByText('Speicher: dauerhaft gesichert')).toBeInTheDocument()
    })

    it('nicht garantiert', async () => {
      mockStorage({ persisted: vi.fn(async () => false) })
      renderPage()
      expect(await screen.findByText('Speicher: vom Browser nicht garantiert – exportiere regelmäßig')).toBeInTheDocument()
    })

    it('ohne API keine Zeile', async () => {
      mockStorage(undefined)
      renderPage()
      await screen.findByText('Noch nie exportiert')
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.queryByText(/^Speicher:/)).not.toBeInTheDocument()
    })
  })

  it('Export-Fehler wird auf Deutsch als Alert gezeigt', async () => {
    vi.spyOn(db.clients, 'toArray').mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Exportieren' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Export fehlgeschlagen/)
    expect(downloads).toHaveLength(0)
  })
})
