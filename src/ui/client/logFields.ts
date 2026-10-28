import { db, updateClient } from '../../storage/repository'
import type { LogEntry } from '../../domain/types'

/**
 * Atomarer Read-Modify-Write auf `client.log`: Das Log wird erst in der Transaktion vom
 * aktuell gespeicherten Klienten gelesen, nie aus Render-Daten abgeleitet. `build` darf null liefern.
 */
export async function patchLog(
  clientId: string,
  build: (current: LogEntry[]) => LogEntry[] | null,
): Promise<void> {
  await db.transaction('rw', db.clients, db.meta, async () => {
    const client = await db.clients.get(clientId)
    if (!client) return
    const next = build(client.log)
    if (next) await updateClient(clientId, { log: next })
  })
}

export const addLogEntry = (clientId: string, entry: LogEntry) =>
  patchLog(clientId, (log) => [...log, entry])

export const updateLogEntry = (clientId: string, id: string, patch: Partial<Omit<LogEntry, 'id'>>) =>
  patchLog(clientId, (log) =>
    log.some((e) => e.id === id) ? log.map((e) => (e.id === id ? { ...e, ...patch } : e)) : null)

export const removeLogEntry = (clientId: string, id: string) =>
  patchLog(clientId, (log) => (log.some((e) => e.id === id) ? log.filter((e) => e.id !== id) : null))

/** Neueste zuerst: nach Datum absteigend, bei gleichem Datum später eingefügte zuerst. */
export function sortLogNewestFirst(log: LogEntry[]): LogEntry[] {
  return log
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date === b.e.date ? b.i - a.i : a.e.date < b.e.date ? 1 : -1))
    .map((x) => x.e)
}
