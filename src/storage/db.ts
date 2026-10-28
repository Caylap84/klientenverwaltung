import Dexie, { type Table } from 'dexie'
import type { Client, Contract, PdfDoc, PdfData } from '../domain/types'

// Schlüssel: 'dirty' (boolean), 'lastExportAt' (string), 'stateAt' (string, Zeitstempel des Datenstands
// dieses Geräts: letzter Export, Import oder Wiederherstellung), 'safetyCopy' (BackupFile | null; ihr
// exportedAt ist der stateAt des ersetzten Stands)
export interface Meta {
  key: string
  value: unknown
}

export class KlientenDb extends Dexie {
  clients!: Table<Client, string>
  contracts!: Table<Contract, string>
  pdfs!: Table<PdfDoc, string>
  pdfData!: Table<PdfData, string>
  meta!: Table<Meta, string>

  constructor(name = 'klientenverwaltung') {
    super(name)
    this.version(1).stores({
      clients: 'id',
      contracts: 'id, clientId',
      pdfs: 'id, clientId',
      pdfData: 'id',
      meta: 'key',
    })
  }
}

export const db = new KlientenDb()
