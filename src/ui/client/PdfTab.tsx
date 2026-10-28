import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addPdf, db, deletePdf, getPdfData } from '../../storage/repository'
import { confirmAction } from '../confirm'
import { downloadPdf, formatDateDe, formatSize, openPdf, pdfRejection } from './pdfActions'

export default function PdfTab({ clientId }: { clientId: string }) {
  const [errors, setErrors] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  // Nur Metadaten (db.pdfs); die Bytes liegen in db.pdfData und werden erst beim Öffnen/Herunterladen geladen.
  const rows = useLiveQuery(
    async () =>
      (await db.pdfs.where('clientId').equals(clientId).toArray())
        .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.name.localeCompare(b.name, 'de')),
    [clientId],
  )

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (input.current) input.current.value = ''
    const errs: string[] = []
    for (const f of files) {
      const reason = pdfRejection(f)
      if (reason) { errs.push(reason); continue }
      try { await addPdf(clientId, f) } catch { errs.push(`„${f.name}“ konnte nicht gespeichert werden.`) }
    }
    setErrors(errs)
  }

  async function withData(id: string, name: string, fn: (data: Uint8Array, name: string) => void) {
    const data = await getPdfData(id)
    if (!data) { setErrors([`Der Inhalt von „${name}“ wurde nicht gefunden.`]); return }
    setErrors([])
    fn(data, name)
  }

  return (
    <div>
      <div className="field">
        <label htmlFor="pdf-input">PDF hinzufügen</label>
        <input
          id="pdf-input"
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      {errors.length > 0 && (
        <div role="alert" className="alert">
          {errors.map((m, i) => <p key={i}>{m}</p>)}
        </div>
      )}
      {rows && rows.length === 0 && <p className="muted">Noch keine Dokumente</p>}
      <ul className="pdf-list">
        {rows?.map((r) => (
          <li key={r.id} className="pdf-row">
            <strong>{r.name}</strong>
            <span className="muted"> {formatDateDe(r.addedAt)} · {formatSize(r.size)}</span>
            <span className="pdf-actions">
              <button type="button" aria-label={`${r.name} öffnen`} onClick={() => void withData(r.id, r.name, (d) => openPdf(d))}>Öffnen</button>
              <button type="button" aria-label={`${r.name} herunterladen`} onClick={() => void withData(r.id, r.name, (d, n) => downloadPdf(d, n))}>Herunterladen</button>
              <button
                type="button"
                aria-label={`${r.name} löschen`}
                onClick={() => { if (confirmAction(`„${r.name}“ wirklich löschen?`)) void deletePdf(r.id) }}
              >
                Löschen
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
