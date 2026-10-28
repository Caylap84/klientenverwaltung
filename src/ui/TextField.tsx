import { useEffect, useRef, useState } from 'react'

type SaveResult = boolean | void | Promise<boolean | void>

interface Props {
  id: string
  label: string
  stored: string
  /**
   * Wird mit dem geänderten Text aufgerufen (beim Verlassen des Feldes, beim Verbergen der Seite
   * und beim Entfernen des Feldes). `false` = Anzeige auf den gespeicherten Wert zurücksetzen.
   */
  onSave: (v: string) => SaveResult
  type?: string
  autoComplete?: string
  inputMode?: 'numeric' | 'decimal' | 'text'
  labelHidden?: boolean
  hint?: string
  /** Mehrzeiliges Feld (textarea). */
  multiline?: boolean
  rows?: number
}

/**
 * Textfeld mit lokalem Zustand: übernimmt externe Änderungen nur, solange es nicht fokussiert ist,
 * und speichert nur, wenn der Nutzer etwas eingegeben hat (`edited`). Gespeichert wird beim Verlassen
 * des Feldes, wenn die Seite verborgen wird (pagehide/visibilitychange) und beim Unmount (z. B.
 * Zurück-Geste, Routenwechsel, Klientenwechsel) – jeweils höchstens einmal pro Eingabe.
 */
export default function TextField({ id, label, stored, onSave, type, autoComplete, inputMode, labelHidden, hint, multiline, rows }: Props) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const [value, setValueState] = useState(stored)
  const valueRef = useRef(stored)
  const storedRef = useRef(stored)
  const onSaveRef = useRef(onSave)
  const editedRef = useRef(false)

  function setValue(v: string) {
    valueRef.current = v
    setValueState(v)
  }

  useEffect(() => { onSaveRef.current = onSave })
  useEffect(() => {
    storedRef.current = stored
    if (document.activeElement !== ref.current) {
      editedRef.current = false
      valueRef.current = stored
      setValueState(stored)
    }
  }, [stored])

  /** Schreibt die ausstehende Eingabe (falls vorhanden) genau einmal. */
  function flush(): SaveResult {
    if (!editedRef.current) return
    editedRef.current = false
    const v = valueRef.current
    if (v === storedRef.current) return
    return onSaveRef.current(v)
  }

  function commit() {
    if (!editedRef.current) {
      // Nicht bearbeitet: ggf. verpasste externe Änderung übernehmen, nie zurückschreiben.
      if (valueRef.current !== storedRef.current) setValue(storedRef.current)
      return
    }
    const result = flush()
    if (result === false) setValue(storedRef.current)
    else if (result instanceof Promise) {
      void result.then((ok) => { if (ok === false) setValue(storedRef.current) })
    }
  }

  // Die Funktionen lesen nur Refs; daher genügen einmalige Listener.
  const flushRef = useRef(flush)
  const commitRef = useRef(commit)
  useEffect(() => { flushRef.current = flush; commitRef.current = commit })
  useEffect(() => {
    const onHide = () => commitRef.current()
    const onVisibility = () => { if (document.visibilityState === 'hidden') commitRef.current() }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      void flushRef.current()
    }
  }, [])

  function onChange(v: string) {
    editedRef.current = true
    setValue(v)
  }

  return (
    <div className="field">
      <label htmlFor={id} className={labelHidden ? 'sr-only' : undefined}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          ref={ref}
          rows={rows ?? 4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          id={id}
          ref={ref}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={commit}
        />
      )}
      {hint && <p role="alert" className="alert">{hint}</p>}
    </div>
  )
}
