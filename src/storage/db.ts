import Dexie, { type Table } from 'dexie'
import type { Client, Contract, PdfDoc } from '../domain/types'

// Schlüssel: 'dirty' (boolean), 'lastExportAt' (string), 'safetyCopy' (BackupFile | null)
export interface Meta {
  key: string
  value: unknown
}

export class KlientenDb extends Dexie {
  clients!: Table<Client, string>
  contracts!: Table<Contract, string>
  pdfs!: Table<PdfDoc, string>
  meta!: Table<Meta, string>

  constructor(name = 'klientenverwaltung') {
    super(name)
    this.version(1).stores({
      clients: 'id',
      contracts: 'id, clientId',
      pdfs: 'id, clientId',
      meta: 'key',
    })
  }
}

export const db = new KlientenDb()
