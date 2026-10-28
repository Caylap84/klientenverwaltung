import { describe, it, expect } from 'vitest'
import { addMonths, monthLabel, contractMonths, currentMonth } from './months'

describe('months', () => {
  it('monthLabel', () => expect(monthLabel('2026-03')).toBe('März 2026'))
  it('addMonths', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
  it('contractMonths', () => {
    expect(contractMonths('2026-11', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(contractMonths('', 6)).toEqual([])
    expect(contractMonths('2026-03', 0)).toEqual([])
  })
  it('currentMonth', () => expect(currentMonth(new Date(2026, 9, 28))).toBe('2026-10'))
  it('ungültige Monate ergeben leer', () => {
    for (const bad of ['abc', '2026', '2026-13', '2026-00']) {
      expect(contractMonths(bad, 3)).toEqual([])
      expect(monthLabel(bad)).toBe('')
      expect(addMonths(bad, 2)).toBe(bad)
    }
  })
})

import { isIsoDate, isYearMonth } from './months'

describe('isYearMonth / isIsoDate', () => {
  it('isYearMonth', () => {
    expect(isYearMonth('2026-03')).toBe(true)
    for (const bad of ['', '03/2026', '2026-13', '2026-00', '2026-3', '2026-03-01']) expect(isYearMonth(bad)).toBe(false)
  })
  it('isIsoDate', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2024-02-29')).toBe(true)
    for (const bad of ['', '2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-04-00', '1.4.2026', '2026-3-1']) expect(isIsoDate(bad)).toBe(false)
  })
})
