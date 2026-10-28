import type { Client, Contract, PdfDoc } from '../domain/types'
import { db, getMeta, setMeta } from './repository'

export interface BackupFile {
  format: 'klientenverwaltung'
  version: 1
  exportedAt: string
  clients: Client[]
  contracts: Contract[]
  pdfs: Array<Omit<PdfDoc, 'size'> & { dataBase64: string }>
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

const INVALID = 'Die Datei ist keine gültige Sicherung.'
const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)))
  }
  return btoa(parts.join(''))
}

// Linear (kein Gruppen-Backtracking), damit auch große Dateien nicht den Stack sprengen.
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/
const isBase64 = (s: string) => s.length % 4 === 0 && BASE64_RE.test(s)

export function base64ToBytes(b64: string): Uint8Array {
  if (!isBase64(b64)) throw new BackupError(INVALID)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `klienten-sicherung-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`
}

export async function buildBackup(): Promise<BackupFile> {
  const [clients, contracts, pdfs, blobs] = await db.transaction(
    'r', db.clients, db.contracts, db.pdfs, db.pdfData,
    () => Promise.all([
      db.clients.toArray(),
      db.contracts.toArray(),
      db.pdfs.toArray(),
      db.pdfData.toArray(),
    ]),
  )
  const bytes = new Map(blobs.map((b) => [b.id, b.data]))
  return {
    format: 'klientenverwaltung',
    version: 1,
    exportedAt: new Date().toISOString(),
    clients,
    contracts,
    pdfs: pdfs.map(({ size: _size, ...rest }) => ({
      ...rest,
      dataBase64: bytesToBase64(bytes.get(rest.id) ?? new Uint8Array()),
    })),
  }
}

export async function exportBackup(): Promise<{ fileName: string; blob: Blob }> {
  const file = await buildBackup()
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  await db.transaction('rw', db.meta, async () => {
    await setMeta('lastExportAt', file.exportedAt)
    await setMeta('dirty', false)
  })
  return { fileName: backupFileName(), blob }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Strukturprüfung; wirft ausschließlich BackupError.
function validateBackup(data: unknown): BackupFile {
  if (!isObj(data) || data.format !== 'klientenverwaltung') throw new BackupError(INVALID)
  if (typeof data.version === 'number' && data.version > 1) {
    throw new BackupError('Diese Sicherung stammt aus einer neueren Version.')
  }
  if (data.version !== 1) throw new BackupError('Die Version dieser Sicherung wird nicht unterstützt.')
  if (typeof data.exportedAt !== 'string') throw new BackupError(INVALID)
  const { clients, contracts, pdfs } = data
  if (!Array.isArray(clients) || !Array.isArray(contracts) || !Array.isArray(pdfs)) {
    throw new BackupError(INVALID)
  }
  const isStr = (v: unknown): v is string => typeof v === 'string'
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const fail = (): never => {
    throw new BackupError(INVALID)
  }
  const uniqueIds = (items: unknown[]) => {
    const seen = new Set<string>()
    for (const it of items) {
      const id = (it as Record<string, unknown>).id as string
      if (seen.has(id)) throw new BackupError('Die Sicherung enthält doppelte Einträge.')
      seen.add(id)
    }
    return seen
  }
  const STATUS = ['aktiv', 'pausiert', 'archiviert']
  for (const c of clients) {
    if (
      !isObj(c) || !isStr(c.id) || !isStr(c.name) || !isStr(c.address) || !isStr(c.email) ||
      !isStr(c.phone) || !isStr(c.notes) || !STATUS.includes(c.status as string) ||
      !Array.isArray(c.log)
    ) fail()
  }
  for (const k of contracts) {
    if (
      !isObj(k) || !isStr(k.id) || !isStr(k.clientId) || !Array.isArray(k.hours) ||
      !isObj(k.paid) || !isNum(k.termMonths) || !isNum(k.priceCents) ||
      !isNum(k.hourlyCents) || !isNum(k.plannedHours) ||
      (k.priceMode !== 'monthly' && k.priceMode !== 'total') || !isStr(k.startMonth)
    ) fail()
  }
  for (const p of pdfs) {
    if (
      !isObj(p) || !isStr(p.id) || !isStr(p.clientId) || !isStr(p.name) ||
      !isStr(p.addedAt) || !isStr(p.type) || !isStr(p.dataBase64) || !isBase64(p.dataBase64)
    ) fail()
  }
  const clientIds = uniqueIds(clients)
  uniqueIds(contracts)
  uniqueIds(pdfs)
  for (const x of [...contracts, ...pdfs]) {
    if (!clientIds.has((x as { clientId: string }).clientId)) {
      throw new BackupError('Die Sicherung enthält Daten ohne zugehörigen Klienten.')
    }
  }
  return data as unknown as BackupFile
}

export function parseBackup(text: string): BackupFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError(INVALID)
  }
  try {
    return validateBackup(data)
  } catch (e) {
    if (e instanceof BackupError) throw e
    throw new BackupError(INVALID)
  }
}

export async function describeDifference(file: BackupFile): Promise<{
  fileExportedAt: string
  fileClients: number
  localClients: number
  localLastExportAt?: string
  fileIsOlder: boolean
}> {
  const localClients = await db.clients.count()
  const localLastExportAt = await getMeta<string>('lastExportAt')
  const fileIsOlder =
    localLastExportAt !== undefined &&
    new Date(file.exportedAt).getTime() < new Date(localLastExportAt).getTime()
  return {
    fileExportedAt: file.exportedAt,
    fileClients: file.clients.length,
    localClients,
    ...(localLastExportAt !== undefined ? { localLastExportAt } : {}),
    fileIsOlder,
  }
}

// Ersetzt Klienten, Verträge und PDFs atomar in einer Transaktion. In derselben
// Transaktion wird der ersetzte Stand als Sicherheitskopie abgelegt: sie wird
// also nur festgeschrieben, wenn der Austausch gelingt.
async function replaceAll(file: BackupFile, dirty: boolean): Promise<void> {
  const valid = validateBackup(file)
  // Dekodieren vor der Transaktion: Fehler hier berühren die Daten nicht.
  const decoded = valid.pdfs.map(({ dataBase64, ...rest }) => ({ rest, data: base64ToBytes(dataBase64) }))
  // size wird immer aus den dekodierten Bytes berechnet, nie aus der Datei übernommen.
  const pdfs: PdfDoc[] = decoded.map(({ rest, data }) => ({ ...rest, size: data.byteLength }))
  const blobs = decoded.map(({ rest, data }) => ({ id: rest.id, data }))
  await db.transaction('rw', db.clients, db.contracts, db.pdfs, db.pdfData, db.meta, async () => {
    const previous = await buildBackup()
    await db.clients.clear()
    await db.contracts.clear()
    await db.pdfs.clear()
    await db.pdfData.clear()
    await db.clients.bulkAdd(valid.clients)
    await db.contracts.bulkAdd(valid.contracts)
    await db.pdfs.bulkAdd(pdfs)
    await db.pdfData.bulkAdd(blobs)
    await setMeta('safetyCopy', previous)
    await setMeta('dirty', dirty)
  })
}

export async function importBackup(file: BackupFile): Promise<void> {
  await replaceAll(file, false)
}

// Tausch: der ersetzte Stand wird zur neuen Sicherheitskopie (Wiederherstellen ist umkehrbar).
export async function restoreSafetyCopy(): Promise<boolean> {
  const copy = await getMeta<BackupFile | null>('safetyCopy')
  if (!copy) return false
  await replaceAll(copy, true)
  return true
}
