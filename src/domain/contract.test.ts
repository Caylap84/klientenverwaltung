import { describe, it, expect } from 'vitest'
import { totalCents, monthAmounts, syncHourRows, canChangeTerm, newContract } from './contract'
import type { Contract, HourEntry } from './types'

function make(over: Partial<Contract> = {}): Contract {
  return { ...newContract('c1', 'k1'), ...over }
}

const ids = () => {
  let n = 0
  return () => `id${++n}`
}

describe('totalCents', () => {
  it('monthly multiplies by term', () => {
    expect(totalCents(make({ priceMode: 'monthly', priceCents: 10000, termMonths: 6 }))).toBe(60000)
  })
  it('total stays unchanged', () => {
    expect(totalCents(make({ priceMode: 'total', priceCents: 10000, termMonths: 6 }))).toBe(10000)
  })
  it('term 0 gives 0 for monthly', () => {
    expect(totalCents(make({ priceMode: 'monthly', priceCents: 10000, termMonths: 0 }))).toBe(0)
  })
  it('NaN price gives 0', () => {
    expect(totalCents(make({ priceMode: 'total', priceCents: NaN }))).toBe(0)
    expect(totalCents(make({ priceMode: 'monthly', priceCents: NaN, termMonths: 3 }))).toBe(0)
  })
})

describe('monthAmounts', () => {
  it('total is split with remainder in last month', () => {
    expect(
      monthAmounts(make({ priceMode: 'total', priceCents: 10000, startMonth: '2026-01', termMonths: 3 })),
    ).toEqual([3333, 3333, 3334])
  })
  it('monthly is equal', () => {
    expect(
      monthAmounts(make({ priceMode: 'monthly', priceCents: 5000, startMonth: '2026-01', termMonths: 2 })),
    ).toEqual([5000, 5000])
  })
  it('empty without start month', () => {
    expect(monthAmounts(make({ priceMode: 'monthly', priceCents: 5000, termMonths: 2 }))).toEqual([])
    expect(monthAmounts(make({ priceMode: 'total', priceCents: 5000, termMonths: 2 }))).toEqual([])
  })
  it('NaN price yields zeros, no NaN', () => {
    expect(
      monthAmounts(make({ priceMode: 'total', priceCents: NaN, startMonth: '2026-01', termMonths: 2 })),
    ).toEqual([0, 0])
  })
})

describe('syncHourRows', () => {
  it('creates empty rows', () => {
    const rows = syncHourRows([], 3, ids())
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => !r.done && r.date === '' && r.note === '')).toBe(true)
  })
  it('reduces only empty rows from the back', () => {
    const hours: HourEntry[] = [0, 1, 2, 3, 4].map((i) => ({ id: `h${i}`, done: false, date: '', note: '' }))
    hours[4] = { ...hours[4], done: true }
    const out = syncHourRows(hours, 0, ids())
    expect(out.map((h) => h.id)).toEqual(['h4'])
  })
  it('keeps described row too', () => {
    const hours: HourEntry[] = [0, 1, 2, 3, 4].map((i) => ({ id: `h${i}`, done: false, date: '', note: '' }))
    hours[4] = { ...hours[4], note: 'x' }
    expect(syncHourRows(hours, 0, ids())).toHaveLength(1)
  })
  it('negative or NaN target behaves like 0', () => {
    expect(syncHourRows([], -3, ids())).toEqual([])
    expect(syncHourRows([], NaN, ids())).toEqual([])
  })
})

describe('canChangeTerm', () => {
  const c = make({ startMonth: '2026-03', termMonths: 6, paid: { '2026-07': { paidOn: '2026-07-01' } } })
  it('blocks shortening past paid month', () => {
    expect(canChangeTerm(c, '2026-03', 3)).toBe(false)
  })
  it('allows shortening to 5', () => {
    expect(canChangeTerm(c, '2026-03', 5)).toBe(true)
  })
  it('blocks moving start past paid month', () => {
    const p = make({ startMonth: '2026-03', termMonths: 6, paid: { '2026-03': { paidOn: '2026-03-01' } } })
    expect(canChangeTerm(p, '2026-05', 6)).toBe(false)
  })
  it('always true without paid months', () => {
    expect(canChangeTerm(make({ startMonth: '2026-03', termMonths: 6 }), '', 0)).toBe(true)
  })
})

describe('newContract', () => {
  it('returns empty values', () => {
    expect(newContract('cl', 'id')).toEqual({
      id: 'id', clientId: 'cl', startMonth: '', termMonths: 0, priceMode: 'monthly',
      priceCents: 0, hourlyCents: 0, plannedHours: 0, hours: [], paid: {},
    })
  })
})
