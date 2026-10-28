import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../storage/repository'
import { clientDisplayName } from '../clientName'
import ProfileTab from '../client/ProfileTab'

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
        {tab === 'Stammdaten' ? <ProfileTab key={client.id} client={client} /> : <p className="muted">Folgt.</p>}
      </div>
    </section>
  )
}
