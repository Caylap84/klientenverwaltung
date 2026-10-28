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
})
