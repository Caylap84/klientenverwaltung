import { useNavigate } from 'react-router-dom'
import { deleteClient, updateClient } from '../../storage/repository'
import type { Client, Status } from '../../domain/types'
import { clientDisplayName } from '../clientName'
import { confirmAction } from '../confirm'
import TextField from '../TextField'

const STATUS: { value: Status; label: string }[] = [
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'pausiert', label: 'Pausiert' },
  { value: 'archiviert', label: 'Archiviert' },
]

type TextFieldName = 'name' | 'address' | 'email' | 'phone'

export default function ProfileTab({ client }: { client: Client }) {
  const navigate = useNavigate()

  function save(field: TextFieldName, value: string) {
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
