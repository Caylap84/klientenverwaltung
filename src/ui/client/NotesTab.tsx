import { useEffect, useRef, useState } from 'react'
import type { Client } from '../../domain/types'
import { isIsoDate } from '../../domain/months'
import { updateClient } from '../../storage/repository'
import { confirmAction } from '../confirm'
import TextField from '../TextField'
import { todayIso } from './contractFields'
import { addLogEntry, removeLogEntry, sortLogNewestFirst, updateLogEntry } from './logFields'

export default function NotesTab({ client }: { client: Client }) {
  const [hints, setHints] = useState<Record<string, string>>({})
  const focusId = useRef<string | null>(null)
  const entries = sortLogNewestFirst(client.log)

  useEffect(() => {
    if (!focusId.current) return
    const el = document.getElementById(`log-text-${focusId.current}`)
    if (el) { el.focus(); focusId.current = null }
  }, [client.log])

  async function add() {
    const id = globalThis.crypto.randomUUID()
    focusId.current = id
    await addLogEntry(client.id, { id, date: todayIso(), text: '' })
  }

  function saveDate(id: string, v: string) {
    // Leer ist erlaubt (Einträge ohne Datum stehen unten); sonst echtes Datum JJJJ-MM-TT.
    const ok = v === '' || isIsoDate(v)
    setHints((h) => ({ ...h, [id]: ok ? '' : 'Bitte im Format JJJJ-MM-TT eingeben' }))
    if (!ok) return false
    return updateLogEntry(client.id, id, { date: v })
  }

  return (
    <div>
      <h2>Allgemeine Notizen</h2>
      <TextField
        id="client-notes"
        label="Notizen"
        multiline
        rows={6}
        stored={client.notes}
        onSave={(v) => updateClient(client.id, { notes: v })}
      />
      <h2>Dokumentation</h2>
      <p><button type="button" onClick={() => void add()}>Eintrag hinzufügen</button></p>
      {entries.length === 0 && <p className="muted">Noch keine Einträge</p>}
      <ul className="log-list">
        {entries.map((e) => (
          <li key={e.id} className="log-entry">
            <TextField
              id={`log-date-${e.id}`}
              label="Datum (JJJJ-MM-TT)"
              stored={e.date}
              inputMode="numeric"
              hint={hints[e.id]}
              onSave={(v) => saveDate(e.id, v.trim())}
            />
            <TextField
              id={`log-text-${e.id}`}
              label="Eintrag"
              multiline
              rows={3}
              stored={e.text}
              onSave={(v) => updateLogEntry(client.id, e.id, { text: v })}
            />
            <button
              type="button"
              onClick={() => {
                if (confirmAction('Diesen Eintrag wirklich löschen?')) void removeLogEntry(client.id, e.id)
              }}
            >
              Löschen
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
