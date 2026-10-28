import { describe, it, expect } from 'vitest'
import { monthOverview, contractTimeline, overdueItems } from './overview'
import { newContract } from './contract'
import type { Client, Contract, Status } from './types'

function client(id: string, status: Status = 'aktiv'): Client {
  return { id, name: id, address: '', email: '', phone: '', status, notes: '', log: [], createdAt: '', updatedAt: '' }
}
function contract(id: string, clientId: string, start: string, term: number, price = 10000): Contract {
  return { ...newContract(clientId, id), startMonth: start, termMonths: term, priceCents: price }
}

describe('monthOverview', () => {
  it('sums expected, received and open for active clients', () => {
    const c1 = contract('k1', 'a', '2026-05', 1)
    c1.paid['2026-05'] = { paidOn: '2026-05-10' }
    const c2 = contract('k2', 'b', '2026-05', 1)
    const o = monthOverview([client('a'), client('b')], [c1, c2], '2026-05')
    expect(o.activeClients).toBe(2)
    expect(o.expectedCents).toBe(20000)
    expect(o.receivedCents).toBe(10000)
    expect(o.openCents).toBe(10000)
    expect(o.openItems).toEqual([{ clientId: 'b', contractId: 'k2', cents: 10000 }])
  })

  it('ignores paused and archived clients', () => {
    const o = monthOverview(
      [client('a'), client('p', 'pausiert'), client('r', 'archiviert')],
      [contract('k1', 'a', '2026-05', 1), contract('k2', 'p', '2026-05', 1), contract('k3', 'r', '2026-05', 1)],
      '2026-05',
    )
    expect(o.activeClients).toBe(1)
    expect(o.expectedCents).toBe(10000)
  })

  it('handles contracts crossing a year boundary', () => {
    const cs = [client('a')]
    const k = [contract('k1', 'a', '2026-11', 4)]
    expect(monthOverview(cs, k, '2027-01').expectedCents).toBe(10000)
    expect(monthOverview(cs, k, '2027-03').expectedCents).toBe(0)
    expect(monthOverview(cs, k, '2027-03').openItems).toEqual([])
  })

  it('ignores contracts without start, term 0 and orphans without error', () => {
    const o = monthOverview(
      [client('a')],
      [contract('k1', 'a', '', 3), contract('k2', 'a', '2026-05', 0), contract('k3', 'zzz', '2026-05', 1)],
      '2026-05',
    )
    expect(o).toEqual({ activeClients: 1, expectedCents: 0, receivedCents: 0, openCents: 0, openItems: [] })
  })

  it('does not mutate inputs', () => {
    const cs = [client('a')]
    const k = [contract('k1', 'a', '2026-05', 1)]
    const snap = JSON.stringify([cs, k])
    monthOverview(cs, k, '2026-05')
    expect(JSON.stringify([cs, k])).toBe(snap)
  })
})

describe('contractTimeline', () => {
  it('lists label, amount and paid per month', () => {
    const c = contract('k', 'a', '2026-11', 4)
    c.paid['2026-12'] = { paidOn: '2026-12-01' }
    const t = contractTimeline(c)
    expect(t.map((r) => r.label)).toEqual(['November 2026', 'Dezember 2026', 'Januar 2027', 'Februar 2027'])
    expect(t.map((r) => r.paid)).toEqual([false, true, false, false])
    expect(t.every((r) => r.cents === 10000)).toBe(true)
  })

  it('puts the cent remainder in the last month', () => {
    const c = { ...contract('k', 'a', '2026-01', 3), priceMode: 'total' as const, priceCents: 10000 }
    expect(contractTimeline(c).map((r) => r.cents)).toEqual([3333, 3333, 3334])
  })

  it('returns empty for invalid contracts', () => {
    expect(contractTimeline(contract('k', 'a', '', 3))).toEqual([])
    expect(contractTimeline(contract('k', 'a', '2026-01', 0))).toEqual([])
  })
})

describe('overdueItems', () => {
  const total = (id: string, clientId: string, start: string, term: number, price: number): Contract =>
    ({ ...contract(id, clientId, start, term, price), priceMode: 'total' })

  it('lists unpaid months strictly before today with the right cents (remainder on the last month)', () => {
    const k = total('k1', 'a', '2026-03', 3, 10000)
    const items = overdueItems([client('a')], [k], '2026-06')
    expect(items).toEqual([
      { clientId: 'a', contractId: 'k1', month: '2026-03', cents: 3333 },
      { clientId: 'a', contractId: 'k1', month: '2026-04', cents: 3333 },
      { clientId: 'a', contractId: 'k1', month: '2026-05', cents: 3334 },
    ])
  })

  it('omits paid months, the current month and future months', () => {
    const k = contract('k1', 'a', '2026-03', 6)
    k.paid['2026-03'] = { paidOn: '2026-03-02' }
    const items = overdueItems([client('a')], [k], '2026-05')
    expect(items.map((i) => i.month)).toEqual(['2026-04'])
  })

  it('ignores paused and archived clients', () => {
    const items = overdueItems(
      [client('a'), client('p', 'pausiert'), client('r', 'archiviert')],
      [contract('k1', 'a', '2026-01', 1), contract('k2', 'p', '2026-01', 1), contract('k3', 'r', '2026-01', 1)],
      '2026-05',
    )
    expect(items.map((i) => i.clientId)).toEqual(['a'])
  })

  it('works across the year boundary', () => {
    const items = overdueItems([client('a')], [contract('k1', 'a', '2026-11', 4)], '2027-01')
    expect(items.map((i) => i.month)).toEqual(['2026-11', '2026-12'])
  })

  it('ignores orphan contracts and contracts without start month or term', () => {
    const items = overdueItems(
      [client('a')],
      [contract('k1', 'ghost', '2026-01', 2), contract('k2', 'a', '', 3), contract('k3', 'a', '2026-01', 0)],
      '2026-05',
    )
    expect(items).toEqual([])
  })

  it('sorts by month, then client name, then contract id', () => {
    const items = overdueItems(
      [client('b'), client('a')],
      [contract('k3', 'a', '2026-02', 1), contract('k2', 'b', '2026-01', 1), contract('k1', 'b', '2026-02', 1), contract('k0', 'a', '2026-02', 1)],
      '2026-05',
    )
    expect(items.map((i) => `${i.month}/${i.clientId}/${i.contractId}`))
      .toEqual(['2026-01/b/k2', '2026-02/a/k0', '2026-02/a/k3', '2026-02/b/k1'])
  })

  it('returns [] for an invalid today and does not mutate input', () => {
    const cs = [client('a')]
    const ks = [contract('k1', 'a', '2026-01', 2)]
    const before = JSON.stringify([cs, ks])
    expect(overdueItems(cs, ks, '')).toEqual([])
    expect(overdueItems(cs, ks, 'quatsch')).toEqual([])
    overdueItems(cs, ks, '2026-05')
    expect(JSON.stringify([cs, ks])).toBe(before)
  })

  it('never yields NaN cents for broken prices', () => {
    const k = contract('k1', 'a', '2026-01', 2, Number.NaN)
    const items = overdueItems([client('a')], [k], '2026-05')
    expect(items.every((i) => Number.isFinite(i.cents))).toBe(true)
  })
})
