import type { Status } from '../domain/types'

export { clientDisplayName } from '../domain/clientName'

export const STATUS_LABELS: Record<Status, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Pausiert',
  archiviert: 'Archiviert',
}
