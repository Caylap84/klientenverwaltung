import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, createClient, createContract, updateContract, getMeta, setMeta } from './repository'
import {
  BackupError, backupFileName, buildBackup, exportBackup, parseBackup,
  describeDifference, importBackup, restoreSafetyCopy, bytesToBase64, base64ToBytes,
} from './backup'

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await clearAll()
})

async function seed() {
  const cid = await createClient({ name: 'Anna', notes: 'Notiz' })
  const kid = await createContract(cid)
  await updateContract(kid, {
    startMonth: '2026-01', termMonths: 6, priceCents: 10000,
    hours: [{ id: 'h1', done: true, date: '2026-02-03', note: 'x' }],
    paid: { '2026-01': { paidOn: '2026-01-15' } },
  })
  await db.pdfs.add({
    id: 'p1', clientId: cid, name: 'a.pdf', addedAt: '2026-01-01T00:00:00.000Z',
    type: 'application/pdf', size: 4,
  })
  await db.pdfData.add({ id: 'p1', data: new Uint8Array([1, 2, 3, 255]) })
  return cid
}

describe('backupFileName', () => {
  it('lokales Datum, null-aufgefüllt', () => {
    expect(backupFileName(new Date(2026, 9, 28))).toBe('klienten-sicherung-2026-10-28.json')
    expect(backupFileName(new Date(2026, 0, 5))).toBe('klienten-sicherung-2026-01-05.json')
  })
})

describe('Base64', () => {
  it('5-MB-Array ohne Stack-Überlauf', () => {
    const big = new Uint8Array(5 * 1024 * 1024)
    for (let i = 0; i < big.length; i++) big[i] = i % 251
    const back = base64ToBytes(bytesToBase64(big))
    expect(back.length).toBe(big.length)
    expect(back[big.length - 1]).toBe(big[big.length - 1])
    expect(back[123456]).toBe(big[123456])
  })
})

describe('Round-trip', () => {
  it('Klient, Vertrag und PDF-Bytes bleiben identisch', async () => {
    await seed()
    const clients = await db.clients.toArray()
    const contracts = await db.contracts.toArray()
    const { blob } = await exportBackup()
    await clearAll()
    await importBackup(parseBackup(await blob.text()))
    expect(await db.clients.toArray()).toEqual(clients)
    expect(await db.contracts.toArray()).toEqual(contracts)
    const pdf = (await db.pdfs.get('p1'))!
    expect(Array.from((await db.pdfData.get('p1'))!.data)).toEqual([1, 2, 3, 255])
    expect(pdf.size).toBe(4)
    expect(pdf.type).toBe('application/pdf')
    expect(pdf.name).toBe('a.pdf')
  })

  it('leerer Klient übersteht den Round-trip', async () => {
    const id = await createClient()
    const before = await db.clients.toArray()
    const { blob } = await exportBackup()
    await clearAll()
    await importBackup(parseBackup(await blob.text()))
    expect(await db.clients.toArray()).toEqual(before)
    expect((await db.clients.get(id))!.name).toBe('')
  })
})

describe('exportBackup', () => {
  it('setzt lastExportAt und dirty=false; Dateiname passt', async () => {
    await createClient()
    expect(await getMeta('dirty')).toBe(true)
    const { fileName } = await exportBackup()
    expect(await getMeta('dirty')).toBe(false)
    const last = await getMeta<string>('lastExportAt')
    expect(new Date(last!).toISOString()).toBe(last)
    expect(fileName).toMatch(/^klienten-sicherung-\d{4}-\d{2}-\d{2}\.json$/)
  })
})

describe('parseBackup', () => {
  const valid = () => ({
    format: 'klientenverwaltung', version: 1, exportedAt: '2026-10-28T10:00:00.000Z',
    clients: [], contracts: [], pdfs: [],
  })
  const pdf = (dataBase64: unknown) => ({
    id: 'p', clientId: 'c', name: 'n', addedAt: 'x', type: '', dataBase64,
  })

  it('akzeptiert gültige Datei', () => {
    expect(parseBackup(JSON.stringify(valid())).version).toBe(1)
  })

  const bad: Array<[string, string]> = [
    ['kein JSON', 'das ist kein json'],
    ['leeres Objekt', '{}'],
    ['Array', '[]'],
    ['null', 'null'],
    ['format falsch', JSON.stringify({ ...valid(), format: 'x' })],
    ['version 2', JSON.stringify({ ...valid(), version: 2 })],
    ['version 0', JSON.stringify({ ...valid(), version: 0 })],
    ['exportedAt fehlt', JSON.stringify({ ...valid(), exportedAt: 5 })],
    ['clients kein Array', JSON.stringify({ ...valid(), clients: {} })],
    ['contracts kein Array', JSON.stringify({ ...valid(), contracts: null })],
    ['pdfs kein Array', JSON.stringify({ ...valid(), pdfs: 'x' })],
    ['Klient ohne id', JSON.stringify({ ...valid(), clients: [{ name: 'a' }] })],
    ['Vertrag ohne id', JSON.stringify({ ...valid(), contracts: [{ id: 1 }] })],
    ['PDF Base64 !!!', JSON.stringify({ ...valid(), pdfs: [pdf('!!!')] })],
    ['PDF Base64 Padding', JSON.stringify({ ...valid(), pdfs: [pdf('QUJDR')] })],
    ['PDF Base64 kein String', JSON.stringify({ ...valid(), pdfs: [pdf(5)] })],
    ['PDF ohne name', JSON.stringify({ ...valid(), pdfs: [{ ...pdf('QQ=='), name: undefined }] })],
  ]
  for (const [label, text] of bad) {
    it(`wirft BackupError: ${label}`, () => {
      expect(() => parseBackup(text)).toThrow(BackupError)
    })
  }

  it('neuere Version: deutsche Meldung', () => {
    expect(() => parseBackup(JSON.stringify({ ...valid(), version: 2 }))).toThrow(/neueren Version/)
  })

  it('Fehlschlag beim Parsen verändert die DB nicht', async () => {
    await seed()
    const before = await db.clients.toArray()
    expect(() => parseBackup('{}')).toThrow(BackupError)
    expect(await db.clients.toArray()).toEqual(before)
    expect(await db.pdfs.count()).toBe(1)
  })
})

describe('importBackup / Sicherheitskopie', () => {
  it('legt safetyCopy an, restoreSafetyCopy stellt alten Stand wieder her', async () => {
    await seed()
    const oldClients = await db.clients.toArray()
    const other = await buildBackup()
    other.clients = [{ ...other.clients[0], id: 'neu', name: 'Neu' }]
    other.contracts = []
    other.pdfs = []
    await importBackup(other)
    expect((await db.clients.toArray()).map((c) => c.id)).toEqual(['neu'])
    expect(await db.pdfs.count()).toBe(0)
    expect(await getMeta('dirty')).toBe(false)
    expect(await getMeta('safetyCopy')).toBeTruthy()

    expect(await restoreSafetyCopy()).toBe(true)
    expect(await db.clients.toArray()).toEqual(oldClients)
    expect(await db.contracts.count()).toBe(1)
    expect(Array.from((await db.pdfData.get('p1'))!.data)).toEqual([1, 2, 3, 255])
    expect(await getMeta('dirty')).toBe(true)
  })

  it('restoreSafetyCopy ohne Kopie liefert false und ändert nichts', async () => {
    await seed()
    expect(await restoreSafetyCopy()).toBe(false)
    expect(await db.clients.count()).toBe(1)
  })

  it('Importfehler lässt den alten Stand unverändert', async () => {
    await seed()
    await setMeta('dirty', true)
    const oldClients = await db.clients.toArray()
    const oldContracts = await db.contracts.toArray()
    const file = await buildBackup()
    file.clients = [{ ...file.clients[0], id: 'neu' }]
    vi.spyOn(db.contracts, 'bulkAdd').mockRejectedValue(new Error('Schreibfehler'))
    await expect(importBackup(file)).rejects.toThrow()
    vi.restoreAllMocks()
    expect(await db.clients.toArray()).toEqual(oldClients)
    expect(await db.contracts.toArray()).toEqual(oldContracts)
    expect(Array.from((await db.pdfData.get('p1'))!.data)).toEqual([1, 2, 3, 255])
    expect(await getMeta('dirty')).toBe(true)
  })
})

describe('Sicherheitskopie: Tausch und Schutz', () => {
  async function fileWith(name: string) {
    const f = await buildBackup()
    f.clients = [{ ...f.clients[0], id: 'a-' + name, name }]
    f.contracts = []
    f.pdfs = []
    return f
  }

  it('ungültiger/fehlschlagender Import behält die gute Sicherheitskopie', async () => {
    await seed()
    const original = await db.clients.toArray()
    await importBackup(await fileWith('A'))
    const copyBefore = await getMeta('safetyCopy')
    const bad = await fileWith('B')
    ;(bad.clients[0] as unknown as Record<string, unknown>).status = 'kaputt'
    await expect(importBackup(bad)).rejects.toThrow(BackupError)
    expect(await getMeta('safetyCopy')).toEqual(copyBefore)

    const pdfsBefore = [await db.pdfs.count(), await db.pdfData.count()]
    vi.spyOn(db.pdfData, 'bulkAdd').mockRejectedValue(new Error('Schreibfehler'))
    await expect(importBackup(await fileWith('C'))).rejects.toThrow()
    vi.restoreAllMocks()
    expect([await db.pdfs.count(), await db.pdfData.count()]).toEqual(pdfsBefore)
    expect(await getMeta('safetyCopy')).toEqual(copyBefore)
    expect((await db.clients.toArray()).map((c) => c.name)).toEqual(['A'])

    expect(await restoreSafetyCopy()).toBe(true)
    expect(await db.clients.toArray()).toEqual(original)
  })

  it('Wiederherstellen ist ein Tausch und selbst umkehrbar', async () => {
    await seed()
    const original = await db.clients.toArray()
    await importBackup(await fileWith('A'))
    expect(await restoreSafetyCopy()).toBe(true)
    expect(await db.clients.toArray()).toEqual(original)
    const copy = await getMeta<{ clients: { name: string }[] }>('safetyCopy')
    expect(copy!.clients.map((c) => c.name)).toEqual(['A'])
    expect(await restoreSafetyCopy()).toBe(true)
    expect((await db.clients.toArray()).map((c) => c.name)).toEqual(['A'])
  })
})

describe('strenge Validierung', () => {
  const base = () => ({
    format: 'klientenverwaltung', version: 1, exportedAt: '2026-10-28T10:00:00.000Z',
    clients: [{ id: 'c', name: '', address: '', email: '', phone: '', status: 'aktiv', notes: '', log: [] }],
    contracts: [{
      id: 'k', clientId: 'c', startMonth: '', termMonths: 6, priceMode: 'monthly',
      priceCents: 0, hourlyCents: 0, plannedHours: 0, hours: [], paid: {},
    }],
    pdfs: [{ id: 'p', clientId: 'c', name: 'n', addedAt: 'x', type: '', dataBase64: 'QQ==' }],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mut = (fn: (b: any) => void) => { const b = base(); fn(b); return JSON.stringify(b) }

  it('gültige Basis wird akzeptiert', () => {
    expect(() => parseBackup(JSON.stringify(base()))).not.toThrow()
  })

  const bad: Array<[string, string]> = [
    ['doppelte Klienten-IDs', mut((b) => b.clients.push({ ...b.clients[0] }))],
    ['doppelte Vertrags-IDs', mut((b) => b.contracts.push({ ...b.contracts[0] }))],
    ['doppelte PDF-IDs', mut((b) => b.pdfs.push({ ...b.pdfs[0] }))],
    ['Vertrag ohne hours', mut((b) => delete b.contracts[0].hours)],
    ['paid kein Objekt', mut((b) => (b.contracts[0].paid = []))],
    ['termMonths keine Zahl', mut((b) => (b.contracts[0].termMonths = '6'))],
    ['priceMode falsch', mut((b) => (b.contracts[0].priceMode = 'x'))],
    ['Status ungültig', mut((b) => (b.clients[0].status = 'weg'))],
    ['log kein Array', mut((b) => (b.clients[0].log = {}))],
    ['Vertrag ohne Klient', mut((b) => (b.contracts[0].clientId = 'zz'))],
    ['PDF ohne Klient', mut((b) => (b.pdfs[0].clientId = 'zz'))],
    ['PDF type numerisch', mut((b) => (b.pdfs[0].type = 5))],
  ]
  for (const [label, text] of bad) {
    it(`wirft BackupError: ${label}`, () => {
      expect(() => parseBackup(text)).toThrow(BackupError)
    })
  }

  it('importBackup(ungültig) direkt: DB und safetyCopy unverändert', async () => {
    await seed()
    await importBackup(await buildBackup())
    const clients = await db.clients.toArray()
    const contracts = await db.contracts.toArray()
    const pdfCount = await db.pdfs.count()
    const copy = await getMeta('safetyCopy')
    const invalid = JSON.parse(mut((b) => (b.contracts[0].clientId = 'zz')))
    await expect(importBackup(invalid)).rejects.toThrow(BackupError)
    expect(await db.clients.toArray()).toEqual(clients)
    expect(await db.contracts.toArray()).toEqual(contracts)
    expect(await db.pdfs.count()).toBe(pdfCount)
    expect(await getMeta('safetyCopy')).toEqual(copy)
  })
})

describe('describeDifference', () => {
  it('fileIsOlder wenn Datei vor lokalem lastExportAt', async () => {
    await createClient()
    await setMeta('lastExportAt', '2026-10-28T10:00:00.000Z')
    const file = await buildBackup()
    file.exportedAt = '2026-10-27T10:00:00.000Z'
    const d = await describeDifference(file)
    expect(d).toEqual({
      fileExportedAt: file.exportedAt, fileClients: 1, localClients: 1,
      localLastExportAt: '2026-10-28T10:00:00.000Z', fileIsOlder: true,
    })
    file.exportedAt = '2026-10-29T10:00:00.000Z'
    expect((await describeDifference(file)).fileIsOlder).toBe(false)
  })

  it('ohne lokalen Export: fileIsOlder false', async () => {
    const file = await buildBackup()
    const d = await describeDifference(file)
    expect(d.fileIsOlder).toBe(false)
    expect(d.localLastExportAt).toBeUndefined()
  })
})

describe('PDF-Metadaten und Bytes getrennt', () => {
  it('size wird beim Import aus den Bytes berechnet, nicht aus der Datei', async () => {
    await seed()
    const f = await buildBackup()
    ;(f.pdfs[0] as unknown as Record<string, unknown>).size = 999999
    await importBackup(f)
    expect((await db.pdfs.get('p1'))!.size).toBe(4)
    expect(await db.pdfData.count()).toBe(1)
  })

  it('Sicherung enthält kein size-Feld, Format bleibt dataBase64', async () => {
    await seed()
    const f = await buildBackup()
    expect(Object.keys(f.pdfs[0]).sort()).toEqual(['addedAt', 'clientId', 'dataBase64', 'id', 'name', 'type'])
    expect(f.pdfs[0].dataBase64).toBe(bytesToBase64(new Uint8Array([1, 2, 3, 255])))
  })

  it('fehlgeschlagener Import lässt pdfs und pdfData unverändert', async () => {
    await seed()
    const f = await buildBackup()
    f.pdfs[0].dataBase64 = bytesToBase64(new Uint8Array([9, 9]))
    vi.spyOn(db.pdfData, 'bulkAdd').mockRejectedValue(new Error('Schreibfehler'))
    await expect(importBackup(f)).rejects.toThrow()
    vi.restoreAllMocks()
    expect((await db.pdfs.get('p1'))!.size).toBe(4)
    expect(Array.from((await db.pdfData.get('p1'))!.data)).toEqual([1, 2, 3, 255])
  })
})
