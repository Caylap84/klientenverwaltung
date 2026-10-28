export function parseEuroToCents(input: string): number {
  const s = input.trim().replace(/\s|€/g, '')
  if (!/^\d[\d.]*(,\d*)?$|^,\d+$/.test(s)) return 0
  const [intPart, frac = ''] = s.split(',')
  const euros = Number(intPart.replace(/\./g, '') || '0')
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
