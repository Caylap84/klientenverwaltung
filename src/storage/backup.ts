import type { Client, Contract, PdfDoc } from '../domain/types'
import { db, getMeta, setMeta } from './repository'

export interface BackupFile {
  format: 'klientenverwaltung'
  version: 1
  exportedAt: string
  clients: Client[]
  contracts: Contract[]
  pdfs: Array<Omit<PdfDoc, 'data'> & { dataBase64: string }>
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
  const [clients, contracts, pdfs] = await Promise.all([
    db.clients.toArray(),
    db.contracts.toArray(),
    db.pdfs.toArray(),
  ])
  return {
    format: 'klientenverwaltung',
    version: 1,
    exportedAt: new Date().toISOString(),
    clients,
    contracts,
    pdfs: pdfs.map(({ data, ...rest }) => ({ ...rest, dataBase64: bytesToBase64(data) })),
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
  for (const item of [...clients, ...contracts]) {
    if (!isObj(item) || typeof item.id !== 'string') throw new BackupError(INVALID)
  }
  for (const p of pdfs) {
    if (
      !isObj(p) ||
      typeof p.id !== 'string' || typeof p.clientId !== 'string' ||
      typeof p.name !== 'string' || typeof p.addedAt !== 'string' ||
      typeof p.dataBase64 !== 'string' || !isBase64(p.dataBase64)
    ) {
      throw new BackupError(INVALID)
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

// Ersetzt Klienten, Verträge und PDFs atomar in einer Transaktion.
async function replaceAll(file: BackupFile, dirty: boolean): Promise<void> {
  const valid = validateBackup(file)
  // Dekodieren vor der Transaktion: Fehler hier berühren die Daten nicht.
  const pdfs: PdfDoc[] = valid.pdfs.map(({ dataBase64, ...rest }) => ({
    ...rest,
    data: base64ToBytes(dataBase64),
  }))
  await db.transaction('rw', db.clients, db.contracts, db.pdfs, db.meta, async () => {
    await db.clients.clear()
    await db.contracts.clear()
    await db.pdfs.clear()
    await db.clients.bulkAdd(valid.clients)
    await db.contracts.bulkAdd(valid.contracts)
    await db.pdfs.bulkAdd(pdfs)
    await setMeta('dirty', dirty)
  })
}

export async function importBackup(file: BackupFile): Promise<void> {
  // Zuerst die Sicherheitskopie des aktuellen Stands, dann ersetzen.
  await setMeta('safetyCopy', await buildBackup())
  await replaceAll(file, false)
}

export async function restoreSafetyCopy(): Promise<boolean> {
  const copy = await getMeta<BackupFile | null>('safetyCopy')
  if (!copy) return false
  await replaceAll(copy, true)
  return true
}
