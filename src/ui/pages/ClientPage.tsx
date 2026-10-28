import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateClient } from '../../storage/repository'
import type { Status } from '../../domain/types'
import { STATUS_LABELS, clientDisplayName } from '../clientName'
import ProfileTab from '../client/ProfileTab'
import ContractsTab from '../client/ContractsTab'
import NotesTab from '../client/NotesTab'
import PdfTab from '../client/PdfTab'

const TABS = ['Stammdaten', 'Verträge', 'Notizen', 'PDFs'] as const
type Tab = (typeof TABS)[number]

export default function ClientPage() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState<Tab>('Stammdaten')
  // null = nicht gefunden, undefined = lädt
  const client = useLiveQuery(async () => (await db.clients.get(id)) ?? null, [id])

  if (client === undefined) return <p>Lädt …</p>
  if (client === null) {
    return (
      <section>
        <h1>Klient nicht gefunden</h1>
        <p>Dieser Klient existiert nicht (mehr).</p>
        <Link to="/klienten">Zurück zur Klientenliste</Link>
      </section>
    )
  }

  return (
    <section>
      <p><Link to="/klienten">‹ Alle Klienten</Link></p>
      <h1>{clientDisplayName(client)}</h1>
      <fieldset className="status client-status">
        <legend>Status</legend>
        {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
          <label key={s} className="radio">
            <input
              type="radio"
              name={`status-${client.id}`}
              checked={client.status === s}
              onChange={() => void updateClient(client.id, { status: s })}
            />
            {STATUS_LABELS[s]}
          </label>
        ))}
      </fieldset>
      <div role="tablist" aria-label="Klientenbereiche" className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'tab active' : 'tab'}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'Stammdaten' && <ProfileTab key={client.id} client={client} />}
        {tab === 'Verträge' && <ContractsTab key={client.id} client={client} />}
        {tab === 'Notizen' && <NotesTab key={client.id} client={client} />}
        {tab === 'PDFs' && <PdfTab key={client.id} clientId={client.id} />}
      </div>
    </section>
  )
}
