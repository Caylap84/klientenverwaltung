import type { Contract, HourEntry, YearMonth } from './types'
import { splitCents } from './money'
import { contractMonths } from './months'

function safeInt(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0
}

export function totalCents(c: Contract): number {
  const price = safeInt(c.priceCents)
  if (c.priceMode === 'total') return price
  const term = Number.isFinite(c.termMonths) && c.termMonths > 0 ? Math.floor(c.termMonths) : 0
  return price * term
}

export function monthAmounts(c: Contract): number[] {
  const months = contractMonths(c.startMonth, c.termMonths)
  if (c.priceMode === 'total') return splitCents(safeInt(c.priceCents), months.length)
  return months.map(() => safeInt(c.priceCents))
}

function isEmptyRow(h: HourEntry): boolean {
  return !h.done && h.date === '' && h.note === ''
}

export function syncHourRows(
  hours: HourEntry[],
  target: number,
  newId: () => string,
): HourEntry[] {
  const t = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0
  const rows = [...hours]
  while (rows.length < t) rows.push({ id: newId(), done: false, date: '', note: '' })
  for (let i = rows.length - 1; i >= 0 && rows.length > t; i--) {
    if (isEmptyRow(rows[i])) rows.splice(i, 1)
  }
  return rows
}

export function canChangeTerm(c: Contract, start: YearMonth | '', term: number): boolean {
  const allowed = new Set(contractMonths(start, term))
  return Object.keys(c.paid).every((ym) => allowed.has(ym))
}

export function newContract(clientId: string, id: string): Contract {
  return {
    id,
    clientId,
    startMonth: '',
    termMonths: 0,
    priceMode: 'monthly',
    priceCents: 0,
    hourlyCents: 0,
    plannedHours: 0,
    hours: [],
    paid: {},
  }
}
