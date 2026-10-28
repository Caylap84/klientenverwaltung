import { db, updateContract } from '../../storage/repository'
import type { Contract } from '../../domain/types'

export const MAX_TERM_MONTHS = 600
export const MAX_HOURS = 1000

/** Nichtnegative ganze Zahl; leere oder unsinnige Eingabe ergibt 0. Nie NaN/Infinity. */
export function parseCount(input: string, max: number): number {
  const s = input.trim().replace(',', '.')
  if (!/^\d+(\.\d*)?$/.test(s)) return 0
  const n = Math.floor(Number(s))
  return Number.isFinite(n) ? Math.min(n, max) : 0
}

export function centsToInput(cents: number): string {
  return Number.isFinite(cents) ? (cents / 100).toFixed(2).replace('.', ',') : '0,00'
}

export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/**
 * Feldweiser Patch auf Basis des aktuell gespeicherten Vertrags: Der Vertrag wird erst
 * in der Transaktion gelesen, damit verschachtelte Werte (hours, paid) nie aus veralteten
 * Render-Daten stammen. `build` darf null liefern (nichts schreiben).
 */
export async function patchContract(
  id: string,
  build: (current: Contract) => Partial<Contract> | null,
): Promise<void> {
  await db.transaction('rw', db.contracts, db.meta, async () => {
    const current = await db.contracts.get(id)
    if (!current) return
    const patch = build(current)
    if (patch) await updateContract(id, patch)
  })
}

export function contractOrder(a: Contract, b: Contract): number {
  // Verträge ohne Startmonat stehen unten (neu angelegte Verträge erscheinen so am Ende)
  if (a.startMonth !== b.startMonth) {
    if (a.startMonth === '') return 1
    if (b.startMonth === '') return -1
    return a.startMonth < b.startMonth ? -1 : 1
  }
  return a.id < b.id ? -1 : 1
}
