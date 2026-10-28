import type { YearMonth } from './types'

const NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function isValid(ym: string): boolean {
  return YM_RE.test(ym)
}

function parse(ym: YearMonth): [number, number] {
  const [y, m] = ym.split('-').map(Number)
  return [y, m]
}

function format(y: number, m0: number): YearMonth {
  return `${String(y).padStart(4, '0')}-${String(m0 + 1).padStart(2, '0')}`
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  if (!isValid(ym)) return ym
  const [y, m] = parse(ym)
  const idx = y * 12 + (m - 1) + n
  return format(Math.floor(idx / 12), ((idx % 12) + 12) % 12)
}

export function monthLabel(ym: YearMonth): string {
  if (!isValid(ym)) return ''
  const [y, m] = parse(ym)
  return `${NAMES[m - 1]} ${y}`
}

export function contractMonths(start: YearMonth | '', term: number): YearMonth[] {
  if (!isValid(start) || !(term > 0)) return []
  return Array.from({ length: term }, (_, i) => addMonths(start, i))
}

export function currentMonth(now: Date = new Date()): YearMonth {
  return format(now.getFullYear(), now.getMonth())
}
