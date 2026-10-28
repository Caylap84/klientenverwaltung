import type { Client } from './types'

export function clientDisplayName(c: Pick<Client, 'name'>): string {
  const n = c.name.trim()
  return n === '' ? 'Unbenannter Klient' : n
}
