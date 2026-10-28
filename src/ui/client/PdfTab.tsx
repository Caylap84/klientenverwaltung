import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addPdf, db, deletePdf } from '../../storage/repository'
import { confirmAction } from '../confirm'
import { byteSize, downloadPdf, formatDateDe, formatSize, openPdf, pdfRejection } from './pdfActions'

interface Row { id: string; name: string; addedAt: string; size: number }

export default function PdfTab({ clientId }: { clientId: string }) {
  const [errors, setErrors] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  // Die Bytes werden nur kurz zum Ermitteln der Größe geladen und nicht im State gehalten.
  const rows = useLiveQuery(
    async (): Promise<Row[]> =>
      (await db.pdfs.where('clientId').equals(clientId).toArray())
        .map((p) => ({ id: p.id, name: p.name, addedAt: p.addedAt, size: byteSize(p.data) }))
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

  async function withData(id: string, fn: (data: Uint8Array, name: string) => void) {
    const doc = await db.pdfs.get(id)
    if (doc) fn(doc.data, doc.name)
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
          {errors.map((m) => <p key={m}>{m}</p>)}
        </div>
      )}
      {rows && rows.length === 0 && <p className="muted">Noch keine Dokumente</p>}
      <ul className="pdf-list">
        {rows?.map((r) => (
          <li key={r.id} className="pdf-row">
            <strong>{r.name}</strong>
            <span className="muted"> {formatDateDe(r.addedAt)} · {formatSize(r.size)}</span>
            <span className="pdf-actions">
              <button type="button" aria-label={`${r.name} öffnen`} onClick={() => void withData(r.id, (d) => openPdf(d))}>Öffnen</button>
              <button type="button" aria-label={`${r.name} herunterladen`} onClick={() => void withData(r.id, (d, n) => downloadPdf(d, n))}>Herunterladen</button>
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
