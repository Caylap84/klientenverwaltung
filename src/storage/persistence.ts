/**
 * Dauerhafter Speicher (StorageManager). Alle Funktionen sind No-ops, wenn die API fehlt,
 * und werfen nie: Ein Fehler darf weder den Start noch die Seite blockieren.
 */

/** Bittet den Browser einmalig, die Daten nicht automatisch zu löschen. */
export async function requestPersistentStorage(): Promise<boolean | undefined> {
  try {
    const storage = globalThis.navigator?.storage
    if (typeof storage?.persist !== 'function') return undefined
    return await storage.persist()
  } catch {
    return undefined
  }
}

/** true/false = Status laut Browser; undefined = API nicht verfügbar (Zeile ausblenden). */
export async function isStoragePersisted(): Promise<boolean | undefined> {
  try {
    const storage = globalThis.navigator?.storage
    if (typeof storage?.persisted !== 'function') return undefined
    return await storage.persisted()
  } catch {
    return undefined
  }
}
