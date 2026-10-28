import { describe, it, expect } from 'vitest'
import { parseEuro, parseEuroToCents, formatEuro, splitCents, MAX_EURO_CENTS } from './money'

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

describe('parseEuro (streng)', () => {
  it('leer oder nur Leerzeichen ergibt 0', () => {
    expect(parseEuro('')).toBe(0)
    expect(parseEuro('   ')).toBe(0)
  })
  it('gültige Eingaben ergeben Cent', () => {
    expect(parseEuro('12.50')).toBe(1250)
    expect(parseEuro('1.234,56')).toBe(123456)
    expect(parseEuro('12,5')).toBe(1250)
    expect(parseEuro('12,50')).toBe(1250)
    expect(parseEuro('100')).toBe(10000)
    expect(parseEuro('0')).toBe(0)
    expect(parseEuro('1.234')).toBe(123400)
    expect(parseEuro('1.234.567')).toBe(123456700)
    expect(parseEuro('12.500')).toBe(1250000)
    expect(parseEuro('0.99')).toBe(99)
    expect(parseEuro(',5')).toBe(50)
    expect(parseEuro('12,')).toBe(1200)
  })
  it('€-Zeichen und Leerzeichen (auch geschützte) sind erlaubt', () => {
    expect(parseEuro('12,50 €')).toBe(1250)
    expect(parseEuro('€ 12,50')).toBe(1250)
    expect(parseEuro(' 1 234,56€ ')).toBe(123456)
    expect(parseEuro('12,50\u00a0€')).toBe(1250)
  })
  it('Buchstaben sind ungültig', () => {
    for (const bad of ['50 Euro', '5o', 'abc', '12,5x', 'EUR 5', '€€x'])
      expect(parseEuro(bad), bad).toBeNull()
  })
  it('negative Beträge sind ungültig', () => {
    expect(parseEuro('-5')).toBeNull()
    expect(parseEuro('-0,50')).toBeNull()
    expect(parseEuro('+5')).toBeNull()
  })
  it('falsche Trenner sind ungültig', () => {
    for (const bad of ['1..2', '1.2.3', '12.345,6.7', '1.2345', '.5', '1,2,3', '12.', '1.23.456', '12.34.567,8', ',', '.'])
      expect(parseEuro(bad), bad).toBeNull()
  })
  it('mehr als zwei Nachkommastellen sind ungültig', () => {
    expect(parseEuro('12,505')).toBeNull()
    expect(parseEuro('1.234,567')).toBeNull()
    expect(parseEuro('0,001')).toBeNull()
  })
  it('Obergrenze 1 000 000 000 €', () => {
    expect(MAX_EURO_CENTS).toBe(100_000_000_000)
    expect(parseEuro('1.000.000.000')).toBe(100_000_000_000)
    expect(parseEuro('1000000000,00')).toBe(100_000_000_000)
    expect(parseEuro('1000000000,01')).toBeNull()
    expect(parseEuro('99999999999999999999999')).toBeNull()
    expect(parseEuro('9'.repeat(400))).toBeNull()
  })
  it('Ergebnis ist immer eine endliche ganze Zahl', () => {
    for (const ok of ['0,01', '12.50', '1.234,56', '999999999,99'])
      expect(Number.isSafeInteger(parseEuro(ok))).toBe(true)
  })
})

describe('parseEuroToCents (= parseEuro ?? 0)', () => {
  it('ungültige Eingaben ergeben 0', () => {
    for (const bad of ['50 Euro', '-5', '12,505', '1..2', '1000000000,01'])
      expect(parseEuroToCents(bad)).toBe(0)
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
