import { describe, it, expect } from 'vitest'
import { parseEuroToCents, formatEuro, splitCents } from './money'

describe('parseEuroToCents', () => {
  it('parst deutsche Eingaben', () => {
    expect(parseEuroToCents('1.234,56')).toBe(123456)
    expect(parseEuroToCents('12,5')).toBe(1250)
    expect(parseEuroToCents('100')).toBe(10000)
  })
  it('Punkt: Tausendertrenner nur bei Dreiergruppen, sonst Dezimalpunkt', () => {
    expect(parseEuroToCents('1.234')).toBe(123400)
    expect(parseEuroToCents('1.234.567')).toBe(123456700)
    expect(parseEuroToCents('12.5')).toBe(1250)
    expect(parseEuroToCents('12.50')).toBe(1250)
    expect(parseEuroToCents('0.99')).toBe(99)
    expect(parseEuroToCents('12,50')).toBe(1250)
    expect(parseEuroToCents('1.234,5')).toBe(123450)
  })
  it('Fehlformen ergeben 0', () => {
    for (const bad of ['1..2', '1.2.3', '12.345,6.7', '1.2345', '.5', '1,2,3', '12.'])
      expect(parseEuroToCents(bad)).toBe(0)
  })
  it('liefert 0 bei ungültiger Eingabe', () => {
    expect(parseEuroToCents('')).toBe(0)
    expect(parseEuroToCents('abc')).toBe(0)
    expect(parseEuroToCents('-5')).toBe(0)
  })
})

describe('formatEuro', () => {
  it('formatiert deutsch', () => {
    const out = formatEuro(123456)
    expect(out).toMatch(/^1\.234,56[\u00a0\u202f]\u20ac$/)
    expect(out).not.toContain('\u0020')
  })
})

describe('splitCents', () => {
  it('verteilt Rest auf den letzten Teil', () => {
    expect(splitCents(10000, 3)).toEqual([3333, 3333, 3334])
  })
  it('leer bei 0 Teilen', () => {
    expect(splitCents(500, 0)).toEqual([])
  })
  it('Summe bleibt erhalten', () => {
    for (const n of [0, 1, 99, 10000, 123457])
      for (const k of [1, 2, 3, 7, 12])
        expect(splitCents(n, k).reduce((a, b) => a + b, 0)).toBe(n)
  })
})
