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
    type: 'application/pdf', data: new Uint8Array([1, 2, 3, 255]),
  })
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
    expect(Array.from(pdf.data)).toEqual([1, 2, 3, 255])
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
    expect(Array.from((await db.pdfs.get('p1'))!.data)).toEqual([1, 2, 3, 255])
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
    expect(Array.from((await db.pdfs.get('p1'))!.data)).toEqual([1, 2, 3, 255])
    expect(await getMeta('dirty')).toBe(true)
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
