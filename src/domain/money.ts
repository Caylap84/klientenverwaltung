/** Obergrenze für Beträge: 1 000 000 000 € (in Cent). */
export const MAX_EURO_CENTS = 100_000_000_000

/**
 * Strenges Einlesen eines Euro-Betrags. Leer/nur Leerzeichen → 0; gültig → Cent (ganze Zahl);
 * ungültig → null (Buchstaben, Vorzeichen, falsche Trenner, mehr als zwei Nachkommastellen,
 * mehr als 1 000 000 000 €).
 * Punkt nur vor genau dreistelligen Gruppen als Tausendertrenner; ein einzelner Punkt mit
 * 1–2 Ziffern ohne Komma ist ein Dezimalpunkt ('12.50' → 1250). €-Zeichen und Leerzeichen erlaubt.
 */
export function parseEuro(input: string): number | null {
  const s = input.replace(/\s|€/g, '')
  if (s === '') return input.trim() === '' ? 0 : null
  const thousands = /^\d{1,3}(\.\d{3})+(,\d{0,2})?$/
  const plain = /^\d+(,\d{0,2})?$|^,\d{1,2}$/
  const dotDecimal = /^\d+\.\d{1,2}$/
  let normalized: string
  if (dotDecimal.test(s)) normalized = s.replace('.', ',')
  else if (thousands.test(s)) normalized = s.replace(/\./g, '')
  else if (plain.test(s)) normalized = s
  else return null
  const [intPart, frac = ''] = normalized.split(',')
  const digits = intPart.replace(/^0+(?=\d)/, '')
  // Vor Number(): zu lange Zahlen sofort ablehnen (keine Rundung jenseits MAX_SAFE_INTEGER).
  if (digits.length > 12) return null
  const total = Number(digits || '0') * 100 + Number((frac + '00').slice(0, 2))
  if (!Number.isSafeInteger(total) || total > MAX_EURO_CENTS) return null
  return total
}

/** Wie parseEuro, aber ungültige Eingabe ergibt 0. */
export function parseEuroToCents(input: string): number {
  return parseEuro(input) ?? 0
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
