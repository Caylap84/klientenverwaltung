export type YearMonth = string // 'YYYY-MM'
export type Status = 'aktiv' | 'pausiert' | 'archiviert'

export interface HourEntry {
  id: string
  done: boolean
  date: string // 'YYYY-MM-DD' oder ''
  note: string
}

export interface LogEntry {
  id: string
  date: string
  text: string
}

export interface Client {
  id: string
  name: string
  address: string
  email: string
  phone: string
  status: Status
  notes: string
  log: LogEntry[]
  createdAt: string
  updatedAt: string
}

export interface Contract {
  id: string
  clientId: string
  startMonth: YearMonth | ''
  termMonths: number
  priceMode: 'monthly' | 'total'
  priceCents: number
  hourlyCents: number
  plannedHours: number
  hours: HourEntry[]
  paid: Record<YearMonth, { paidOn: string }>
}

export interface PdfDoc {
  id: string
  clientId: string
  name: string
  addedAt: string
  data: Blob
}
