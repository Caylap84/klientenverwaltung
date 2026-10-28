import { beforeEach, describe, expect, it } from 'vitest'
import {
  db, createClient, updateClient, deleteClient, createContract, updateContract,
  deleteContract, addPdf, deletePdf, getPdfData, getMeta, setMeta,
} from './repository'

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

beforeEach(clearAll)

describe('repository', () => {
  it('createClient() ohne Argumente: leere Felder, Status aktiv', async () => {
    const id = await createClient()
    const c = await db.clients.get(id)
    expect(c).toMatchObject({
      id, name: '', address: '', email: '', phone: '', status: 'aktiv', notes: '', log: [],
    })
    expect(new Date(c!.createdAt).toISOString()).toBe(c!.createdAt)
    expect(new Date(c!.updatedAt).toISOString()).toBe(c!.updatedAt)
  })

  it('createClient übernimmt init', async () => {
    const id = await createClient({ name: 'Müller' })
    expect((await db.clients.get(id))!.name).toBe('Müller')
  })

  it('updateClient ändert updatedAt und Felder', async () => {
    const id = await createClient()
    const before = (await db.clients.get(id))!
    await new Promise((r) => setTimeout(r, 5))
    await updateClient(id, { name: 'Anna' })
    const after = (await db.clients.get(id))!
    expect(after.name).toBe('Anna')
    expect(after.updatedAt).not.toBe(before.updatedAt)
    expect(after.createdAt).toBe(before.createdAt)
  })

  it('deleteClient entfernt Verträge und PDFs, andere Klienten bleiben', async () => {
    const a = await createClient()
    const b = await createClient()
    await createContract(a)
    await createContract(b)
    await addPdf(a, new File(['x'], 'a.pdf'))
    await addPdf(b, new File(['y'], 'b.pdf'))
    expect(await db.pdfData.count()).toBe(2)
    await deleteClient(a)
    expect(await db.pdfData.count()).toBe(1)
    expect(await db.clients.get(a)).toBeUndefined()
    expect(await db.contracts.where('clientId').equals(a).count()).toBe(0)
    expect(await db.pdfs.where('clientId').equals(a).count()).toBe(0)
    expect(await db.clients.get(b)).toBeDefined()
    expect(await db.contracts.where('clientId').equals(b).count()).toBe(1)
    expect(await db.pdfs.where('clientId').equals(b).count()).toBe(1)
  })

  it('createContract erzeugt Vertrag mit leeren Werten', async () => {
    const a = await createClient()
    const id = await createContract(a)
    expect(await db.contracts.get(id)).toMatchObject({
      id, clientId: a, startMonth: '', termMonths: 0, priceMode: 'monthly',
      priceCents: 0, hourlyCents: 0, plannedHours: 0, hours: [], paid: {},
    })
  })

  it('updateContract und deleteContract', async () => {
    const a = await createClient()
    const id = await createContract(a)
    await updateContract(id, { priceCents: 500 })
    expect((await db.contracts.get(id))!.priceCents).toBe(500)
    await deleteContract(id)
    expect(await db.contracts.get(id)).toBeUndefined()
  })

  it('addPdf speichert Bytes, Namen und addedAt; deletePdf löscht', async () => {
    const a = await createClient()
    const bytes = new Uint8Array([1, 2, 3, 255])
    const id = await addPdf(a, new File([bytes], 'Vertrag Müller.pdf', { type: 'application/pdf' }))
    const p = (await db.pdfs.get(id))!
    expect(p.name).toBe('Vertrag Müller.pdf')
    expect(p.clientId).toBe(a)
    expect(p.type).toBe('application/pdf')
    expect(new Date(p.addedAt).toISOString()).toBe(p.addedAt)
    expect(p.size).toBe(4)
    expect(Array.from((await getPdfData(id))!)).toEqual([1, 2, 3, 255])
    await deletePdf(id)
    expect(await db.pdfs.get(id)).toBeUndefined()
    expect(await getPdfData(id)).toBeUndefined()
  })

  it('setMeta/getMeta, setMeta setzt dirty nicht', async () => {
    expect(await getMeta('lastExportAt')).toBeUndefined()
    await setMeta('lastExportAt', '2026-01-01')
    expect(await getMeta('lastExportAt')).toBe('2026-01-01')
    expect(await getMeta('dirty')).toBeUndefined()
  })

  it.each([
    ['createClient', async () => { await createClient() }],
    ['updateClient', async () => { await updateClient(await createClient(), { name: 'x' }); await setMeta('dirty', false); await updateClient((await db.clients.toCollection().first())!.id, { name: 'y' }) }],
    ['deleteClient', async () => { const c = await createClient(); await setMeta('dirty', false); await deleteClient(c) }],
    ['createContract', async () => { const c = await createClient(); await setMeta('dirty', false); await createContract(c) }],
    ['updateContract', async () => { const k = await createContract(await createClient()); await setMeta('dirty', false); await updateContract(k, { priceCents: 1 }) }],
    ['deleteContract', async () => { const k = await createContract(await createClient()); await setMeta('dirty', false); await deleteContract(k) }],
    ['addPdf', async () => { const c = await createClient(); await setMeta('dirty', false); await addPdf(c, new File(['x'], 'a.pdf')) }],
    ['deletePdf', async () => { const p = await addPdf(await createClient(), new File(['x'], 'a.pdf')); await setMeta('dirty', false); await deletePdf(p) }],
  ])('%s setzt dirty = true', async (_n, op) => {
    await op()
    expect(await getMeta<boolean>('dirty')).toBe(true)
  })
})
