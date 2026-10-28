import type { Client, Contract } from '../domain/types'
import { newContract } from '../domain/contract'
import { db } from './db'

export { db }
export type { Meta } from './db'

const newId = () => globalThis.crypto.randomUUID()
const now = () => new Date().toISOString()
const markDirty = () => db.meta.put({ key: 'dirty', value: true })

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export async function createClient(init: Partial<Client> = {}): Promise<string> {
  const id = newId()
  const ts = now()
  const client: Client = {
    name: '', address: '', email: '', phone: '', status: 'aktiv', notes: '', log: [],
    createdAt: ts, updatedAt: ts,
    ...init,
    id,
  }
  await db.transaction('rw', db.clients, db.meta, async () => {
    await db.clients.add(client)
    await markDirty()
  })
  return id
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<void> {
  await db.transaction('rw', db.clients, db.meta, async () => {
    await db.clients.update(id, { ...patch, id, updatedAt: now() })
    await markDirty()
  })
}

export async function deleteClient(id: string): Promise<void> {
  await db.transaction('rw', db.clients, db.contracts, db.pdfs, db.meta, async () => {
    await db.contracts.where('clientId').equals(id).delete()
    await db.pdfs.where('clientId').equals(id).delete()
    await db.clients.delete(id)
    await markDirty()
  })
}

export async function createContract(clientId: string): Promise<string> {
  const id = newId()
  await db.transaction('rw', db.contracts, db.meta, async () => {
    await db.contracts.add(newContract(clientId, id))
    await markDirty()
  })
  return id
}

export async function updateContract(id: string, patch: Partial<Contract>): Promise<void> {
  await db.transaction('rw', db.contracts, db.meta, async () => {
    await db.contracts.update(id, { ...patch, id })
    await markDirty()
  })
}

export async function deleteContract(id: string): Promise<void> {
  await db.transaction('rw', db.contracts, db.meta, async () => {
    await db.contracts.delete(id)
    await markDirty()
  })
}

export async function addPdf(clientId: string, file: File): Promise<string> {
  const id = newId()
  const data = new Blob([await file.arrayBuffer()], { type: file.type })
  await db.transaction('rw', db.pdfs, db.meta, async () => {
    await db.pdfs.add({ id, clientId, name: file.name, addedAt: now(), data })
    await markDirty()
  })
  return id
}

export async function deletePdf(id: string): Promise<void> {
  await db.transaction('rw', db.pdfs, db.meta, async () => {
    await db.pdfs.delete(id)
    await markDirty()
  })
}
