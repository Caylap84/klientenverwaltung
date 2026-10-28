import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteClient, updateClient } from '../../storage/repository'
import type { Client, Status } from '../../domain/types'
import { clientDisplayName } from '../clientName'
import { confirmAction } from '../confirm'

const STATUS: { value: Status; label: string }[] = [
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'pausiert', label: 'Pausiert' },
  { value: 'archiviert', label: 'Archiviert' },
]

type TextField = 'name' | 'address' | 'email' | 'phone'

function TextField({ id, label, stored, onSave, type, autoComplete }: {
  id: string; label: string; stored: string; onSave: (v: string) => void
  type?: string; autoComplete?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(stored)
  // Externe Änderungen übernehmen, aber nie während der Eingabe im fokussierten Feld
  useEffect(() => {
    if (document.activeElement !== ref.current) setValue(stored)
  }, [stored])
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={ref}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (value !== stored) onSave(value) }}
      />
    </div>
  )
}

export default function ProfileTab({ client }: { client: Client }) {
  const navigate = useNavigate()

  function save(field: TextField, value: string) {
    if (value !== client[field]) void updateClient(client.id, { [field]: value })
  }

  async function remove() {
    if (!confirmAction(`„${clientDisplayName(client)}“ mit allen Verträgen und PDFs wirklich löschen?`)) return
    await deleteClient(client.id)
    navigate('/klienten')
  }

  return (
    <div className="profile">
      <TextField id="f-name" label="Name" stored={client.name} onSave={(v) => save('name', v)} autoComplete="off" />
      <TextField id="f-address" label="Adresse" stored={client.address} onSave={(v) => save('address', v)} />
      <TextField id="f-email" label="E-Mail" stored={client.email} onSave={(v) => save('email', v)} type="email" />
      <TextField id="f-phone" label="Telefon" stored={client.phone} onSave={(v) => save('phone', v)} type="tel" />
      <fieldset className="status">
        <legend>Status</legend>
        {STATUS.map((s) => (
          <label key={s.value} className="radio">
            <input
              type="radio"
              name="status"
              checked={client.status === s.value}
              onChange={() => void updateClient(client.id, { status: s.value })}
            />
            {s.label}
          </label>
        ))}
      </fieldset>
      <button type="button" className="danger" onClick={remove}>Klient löschen</button>
    </div>
  )
}
