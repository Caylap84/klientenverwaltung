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

  // key sorgt dafür, dass die Felder bei externer Änderung (z. B. Import) neu befüllt werden
  const field = (f: TextField, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={`f-${f}`}>{label}</label>
      <input
        id={`f-${f}`}
        key={`${f}-${client[f]}`}
        defaultValue={client[f]}
        onBlur={(e) => save(f, e.target.value)}
        {...props}
      />
    </div>
  )

  return (
    <div className="profile">
      {field('name', 'Name', { autoComplete: 'off' })}
      {field('address', 'Adresse')}
      {field('email', 'E-Mail', { type: 'email' })}
      {field('phone', 'Telefon', { type: 'tel' })}
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
