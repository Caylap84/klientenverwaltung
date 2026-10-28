import type { Client, Status } from '../domain/types'

export function clientDisplayName(c: Pick<Client, 'name'>): string {
  const n = c.name.trim()
  return n === '' ? 'Unbenannter Klient' : n
}

export const STATUS_LABELS: Record<Status, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Pausiert',
  archiviert: 'Archiviert',
}
