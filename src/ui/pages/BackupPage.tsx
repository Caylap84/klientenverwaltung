import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../storage/repository'
import {
  BackupError,
  describeDifference,
  exportBackup,
  importBackup,
  parseBackup,
  restoreSafetyCopy,
  type BackupFile,
} from '../../storage/backup'
import { isStoragePersisted } from '../../storage/persistence'
import { downloadFile } from './downloadFile'

type Difference = Awaited<ReturnType<typeof describeDifference>>
type Pending = { file: BackupFile; diff: Difference }
type Message = { kind: 'status' | 'alert'; text: string }

const MAX_BYTES = 500 * 1024 * 1024

const pad = (n: number) => String(n).padStart(2, '0')
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`
}
const clientCount = (n: number) => `${n} ${n === 1 ? 'Klient' : 'Klienten'}`

function errorText(e: unknown, fallback: string): string {
  return e instanceof BackupError ? e.message : fallback
}

export default function BackupPage() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let active = true
    void isStoragePersisted().then((p) => { if (active) setPersisted(p) })
    return () => { active = false }
  }, [])

  const dirty = useLiveQuery(async () => (await db.meta.get('dirty'))?.value === true)
  const lastExportAt = useLiveQuery(async () => {
    const v = (await db.meta.get('lastExportAt'))?.value
    return typeof v === 'string' ? v : null
  })
  const stateAt = useLiveQuery(async () => {
    const v = (await db.meta.get('stateAt'))?.value
    return typeof v === 'string' ? v : null
  })
  // Nur Schlüssel zählen: die Kopie selbst kann sehr groß sein und wird hier nie geladen.
  const hasSafetyCopy = useLiveQuery(async () => (await db.meta.where('key').equals('safetyCopy').count()) > 0)

  function resetInput() {
    if (fileInput.current) fileInput.current.value = ''
  }

  async function doExport() {
    setBusy(true)
    setMessage(null)
    try {
      const { fileName, blob } = await exportBackup()
      downloadFile(blob, fileName)
      setMessage({ kind: 'status', text: `Download gestartet: ${fileName}. Bitte prüfe, ob die Datei angekommen ist.` })
    } catch {
      setMessage({ kind: 'alert', text: 'Export fehlgeschlagen. Es wurde keine Sicherung erstellt.' })
    } finally {
      setBusy(false)
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setMessage(null)
    setPending(null)
    setConfirmRestore(false)
    if (!file) return
    setBusy(true)
    try {
      if (file.size > MAX_BYTES) {
        setMessage({ kind: 'alert', text: 'Die Datei ist zu groß (mehr als 500 MB) und kann nicht importiert werden.' })
        resetInput()
        return
      }
      const parsed = parseBackup(await file.text())
      setPending({ file: parsed, diff: await describeDifference(parsed) })
    } catch (err) {
      setMessage({ kind: 'alert', text: errorText(err, 'Die Datei konnte nicht gelesen werden.') })
      resetInput()
    } finally {
      setBusy(false)
    }
  }

  function cancelImport() {
    setPending(null)
    resetInput()
  }

  async function doImport() {
    if (!pending) return
    setBusy(true)
    try {
      await importBackup(pending.file)
      setMessage({ kind: 'status', text: `Import abgeschlossen: ${clientCount(pending.file.clients.length)}` })
    } catch (err) {
      setMessage({
        kind: 'alert',
        text: `${errorText(err, 'Der Import ist fehlgeschlagen.')} Deine Daten wurden nicht verändert.`,
      })
    } finally {
      setPending(null)
      resetInput()
      setBusy(false)
    }
  }

  async function doRestore() {
    setBusy(true)
    try {
      const restored = await restoreSafetyCopy()
      setMessage(restored
        ? { kind: 'status', text: 'Stand wiederhergestellt. Der Stand davor ist jetzt die neue Sicherheitskopie.' }
        : { kind: 'alert', text: 'Es gibt keine Sicherheitskopie zum Wiederherstellen.' })
    } catch (err) {
      setMessage({
        kind: 'alert',
        text: `${errorText(err, 'Die Wiederherstellung ist fehlgeschlagen.')} Deine Daten wurden nicht verändert.`,
      })
    } finally {
      setConfirmRestore(false)
      setBusy(false)
    }
  }

  return (
    <section className="backup">
      <h1>Sicherung</h1>
      <p>
        Exportieren erzeugt eine Datei, die du z. B. in deinem Cloud-Ordner ablegst. Auf dem anderen Gerät
        importierst du sie. Der Import ersetzt alle Daten auf diesem Gerät.
      </p>
      <p className="notice warn">
        <strong>
          Die Sicherungsdatei ist nicht verschlüsselt und enthält alle Klientendaten im Klartext – lege sie nur in
          einem Cloud-Ordner mit starkem Passwort und Zwei-Faktor-Anmeldung ab.
        </strong>
      </p>
      <ul className="backup-help">
        <li>
          Android/Chrome: Die Datei landet im Ordner „Downloads“. Verschiebe sie von dort von Hand in deinen
          Cloud-Ordner bzw. lade sie dort hoch.
        </li>
        <li>Windows: Folge der Download-Abfrage des Browsers bzw. der App und wähle dort den Cloud-Ordner.</li>
        <li>Importieren: Wähle die Datei in der Dateiauswahl direkt aus deinem Cloud-Ordner.</li>
        <li>
          Mehrere Exporte am selben Tag bekommen einen Zusatz wie (1), (2). Prüfe vor dem Bestätigen eines
          Imports Datum und Uhrzeit im Vergleich.
        </li>
      </ul>

      <div className="backup-status">
        {stateAt && <p>Stand dieses Geräts: {formatDateTime(stateAt)}</p>}
        <p>{lastExportAt ? `Letzter Export: ${formatDateTime(lastExportAt)}` : lastExportAt === null ? 'Noch nie exportiert' : 'Lädt …'}</p>
        {persisted !== undefined && (
          <p>{persisted ? 'Speicher: dauerhaft gesichert' : 'Speicher: vom Browser nicht garantiert – exportiere regelmäßig'}</p>
        )}
        {dirty && (
          <p role="status" className="notice warn">
            Ungesicherte Änderungen: Seit dem letzten Export wurde etwas geändert. Exportiere, um sie zu sichern.
          </p>
        )}
      </div>

      <h2>Exportieren</h2>
      <button type="button" className="primary" onClick={doExport} disabled={busy}>Exportieren</button>

      <h2>Importieren</h2>
      <div className="field">
        <label htmlFor="backup-file">Sicherung importieren</label>
        <input
          id="backup-file"
          ref={fileInput}
          type="file"
          accept=".json,application/json,text/plain,application/octet-stream"
          onChange={onPick}
          disabled={busy}
        />
      </div>

      {pending && (
        <section className="confirm-panel" role="region" aria-label="Import bestätigen">
          <h3>Import bestätigen</h3>
          <ul className="compare">
            <li>
              Datei: exportiert am {formatDateTime(pending.diff.fileExportedAt)}, {clientCount(pending.diff.fileClients)}
            </li>
            <li>
              Dieses Gerät: Stand{' '}
              {pending.diff.localStateAt ? formatDateTime(pending.diff.localStateAt) : 'unbekannt'}, letzter Export{' '}
              {pending.diff.localLastExportAt ? formatDateTime(pending.diff.localLastExportAt) : 'nie'},{' '}
              {clientCount(pending.diff.localClients)}
            </li>
          </ul>
          {pending.diff.fileIsOlder && (
            <p className="notice warn">
              <strong>Achtung:</strong> Diese Datei ist älter als der Stand dieses Geräts (letzter Export oder
              Import). Beim Import gehen neuere Änderungen verloren.
            </p>
          )}
          {dirty && (
            <p className="notice warn">Dieses Gerät hat ungesicherte Änderungen, die beim Import verloren gehen.</p>
          )}
          <p className="muted">Der aktuelle Stand wird vorher als Sicherheitskopie aufbewahrt.</p>
          <div className="actions">
            <button type="button" className="danger" onClick={doImport} disabled={busy}>
              Jetzt importieren (ersetzt alle Daten)
            </button>
            <button type="button" onClick={cancelImport} disabled={busy}>Abbrechen</button>
          </div>
        </section>
      )}

      {hasSafetyCopy && (
        <>
          <h2>Sicherheitskopie</h2>
          <p className="muted">
            Vor jedem Import wird der bisherige Stand aufbewahrt. Du kannst ihn zurückholen.
          </p>
          {!confirmRestore && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPending(null)
                resetInput()
                setMessage(null)
                setConfirmRestore(true)
              }}
            >
              Stand vor dem letzten Import wiederherstellen
            </button>
          )}
          {confirmRestore && (
            <section className="confirm-panel" role="region" aria-label="Wiederherstellen bestätigen">
              <h3>Wiederherstellen bestätigen</h3>
              <p>
                Der Stand vor dem letzten Import ersetzt alle Daten auf diesem Gerät. Der jetzige Stand wird dabei
                zur neuen Sicherheitskopie – mit demselben Knopf kannst du die Wiederherstellung also rückgängig
                machen.
              </p>
              {dirty && (
                <p className="notice warn">Dieses Gerät hat ungesicherte Änderungen. Sie landen nur in der Sicherheitskopie.</p>
              )}
              <div className="actions">
                <button type="button" className="danger" onClick={doRestore} disabled={busy}>Jetzt wiederherstellen</button>
                <button type="button" onClick={() => setConfirmRestore(false)} disabled={busy}>Abbrechen</button>
              </div>
            </section>
          )}
        </>
      )}

      {message && (
        <p role={message.kind === 'alert' ? 'alert' : 'status'} className={message.kind === 'alert' ? 'alert' : 'notice ok'}>
          {message.text}
        </p>
      )}
    </section>
  )
}
