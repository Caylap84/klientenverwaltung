import type { Client, Contract, YearMonth } from './types'
import { monthAmounts } from './contract'
import { contractMonths, monthLabel } from './months'

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
