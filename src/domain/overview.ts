import type { Client, Contract, YearMonth } from './types'
import { monthAmounts } from './contract'
import { contractMonths, isYearMonth, monthLabel } from './months'
import { clientDisplayName } from '../ui/clientName'

export interface OpenItem { clientId: string; contractId: string; cents: number }
export interface MonthOverview {
  activeClients: number
  expectedCents: number
  receivedCents: number
  openCents: number
  openItems: OpenItem[]
}
export interface TimelineRow { month: YearMonth; label: string; cents: number; paid: boolean }

export function monthOverview(clients: Client[], contracts: Contract[], month: YearMonth): MonthOverview {
  const active = new Set(clients.filter((c) => c.status === 'aktiv').map((c) => c.id))
  let expectedCents = 0
  let receivedCents = 0
  const openItems: OpenItem[] = []
  for (const c of contracts) {
    if (!active.has(c.clientId)) continue
    const idx = contractMonths(c.startMonth, c.termMonths).indexOf(month)
    if (idx < 0) continue
    const cents = monthAmounts(c)[idx] ?? 0
    expectedCents += cents
    if (c.paid[month]) receivedCents += cents
    else openItems.push({ clientId: c.clientId, contractId: c.id, cents })
  }
  return {
    activeClients: active.size,
    expectedCents,
    receivedCents,
    openCents: expectedCents - receivedCents,
    openItems,
  }
}

export function contractTimeline(c: Contract): TimelineRow[] {
  const amounts = monthAmounts(c)
  return contractMonths(c.startMonth, c.termMonths).map((month, i) => ({
    month,
    label: monthLabel(month),
    cents: amounts[i] ?? 0,
    paid: Boolean(c.paid[month]),
  }))
}

export interface OverdueItem { clientId: string; contractId: string; month: YearMonth; cents: number }

/** Unbezahlte Vertragsmonate aktiver Klienten, die vor `today` (Kalendermonat) liegen; älteste zuerst. */
export function overdueItems(clients: Client[], contracts: Contract[], today: YearMonth): OverdueItem[] {
  if (!isYearMonth(today)) return []
  const names = new Map(clients.filter((c) => c.status === 'aktiv').map((c) => [c.id, clientDisplayName(c)]))
  const items: OverdueItem[] = []
  for (const c of contracts) {
    if (!names.has(c.clientId)) continue
    const amounts = monthAmounts(c)
    contractMonths(c.startMonth, c.termMonths).forEach((month, i) => {
      if (month < today && !c.paid[month]) {
        items.push({ clientId: c.clientId, contractId: c.id, month, cents: amounts[i] ?? 0 })
      }
    })
  }
  const name = (id: string) => names.get(id) ?? ''
  return items.sort((a, b) =>
    (a.month < b.month ? -1 : a.month > b.month ? 1 : 0)
    || name(a.clientId).localeCompare(name(b.clientId), 'de')
    || (a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0))
}
