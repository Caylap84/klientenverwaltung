import type { YearMonth } from './types'

const NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function parse(ym: YearMonth): [number, number] {
  const [y, m] = ym.split('-').map(Number)
  return [y, m]
}

function format(y: number, m0: number): YearMonth {
  return `${String(y).padStart(4, '0')}-${String(m0 + 1).padStart(2, '0')}`
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const [y, m] = parse(ym)
  const idx = y * 12 + (m - 1) + n
  return format(Math.floor(idx / 12), ((idx % 12) + 12) % 12)
}

export function monthLabel(ym: YearMonth): string {
  const [y, m] = parse(ym)
  return `${NAMES[m - 1] ?? ''} ${y}`
}

export function contractMonths(start: YearMonth | '', term: number): YearMonth[] {
  if (!start || term <= 0) return []
  return Array.from({ length: term }, (_, i) => addMonths(start, i))
}

export function currentMonth(now: Date = new Date()): YearMonth {
  return format(now.getFullYear(), now.getMonth())
}
