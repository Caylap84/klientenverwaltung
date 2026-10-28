import { useEffect, useRef, useState } from 'react'

interface Props {
  id: string
  label: string
  stored: string
  /** Wird beim Verlassen des Feldes mit geändertem Text aufgerufen. `false` = Anzeige auf den gespeicherten Wert zurücksetzen. */
  onSave: (v: string) => boolean | void | Promise<boolean | void>
  type?: string
  autoComplete?: string
  inputMode?: 'numeric' | 'decimal' | 'text'
  labelHidden?: boolean
  hint?: string
}

/** Textfeld mit lokalem Zustand: übernimmt externe Änderungen nur, solange es nicht fokussiert ist, und speichert beim Verlassen. */
export default function TextField({ id, label, stored, onSave, type, autoComplete, inputMode, labelHidden, hint }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(stored)
  const storedRef = useRef(stored)
  useEffect(() => { storedRef.current = stored }, [stored])
  useEffect(() => {
    if (document.activeElement !== ref.current) setValue(stored)
  }, [stored])
  return (
    <div className="field">
      <label htmlFor={id} className={labelHidden ? 'sr-only' : undefined}>{label}</label>
      <input
        id={id}
        ref={ref}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value === stored) return
          const result = onSave(value)
          if (result === false) setValue(stored)
          else if (result instanceof Promise) {
            void result.then((ok) => { if (ok === false) setValue(storedRef.current) })
          }
        }}
      />
      {hint && <p role="alert" className="alert">{hint}</p>}
    </div>
  )
}
