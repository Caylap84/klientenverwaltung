export function parseEuroToCents(input: string): number {
  const s = input.trim().replace(/\s|€/g, '')
  // Punkt nur bei Dreiergruppen als Tausendertrenner; einzelner Punkt + 1-2 Ziffern ohne Komma = Dezimalpunkt
  const thousands = /^\d{1,3}(\.\d{3})+(,\d*)?$/
  const plain = /^\d+(,\d*)?$|^,\d+$/
  const dotDecimal = /^\d+\.\d{1,2}$/
  let normalized: string
  if (dotDecimal.test(s)) normalized = s.replace('.', ',')
  else if (thousands.test(s)) normalized = s.replace(/\./g, '')
  else if (plain.test(s)) normalized = s
  else return 0
  const [intPart, frac = ''] = normalized.split(',')
  const euros = Number(intPart || '0')
  const cents = Number((frac + '00').slice(0, 2))
  const total = euros * 100 + cents
  return Number.isFinite(total) ? total : 0
}

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function formatEuro(cents: number): string {
  return fmt.format(cents / 100)
}

export function splitCents(totalCents: number, parts: number): number[] {
  if (parts <= 0) return []
  const base = Math.floor(totalCents / parts)
  const result = Array<number>(parts).fill(base)
  result[parts - 1] += totalCents - base * parts
  return result
}
