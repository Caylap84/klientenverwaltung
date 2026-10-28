import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createClient } from '../../storage/repository'
import type { Status } from '../../domain/types'
import { STATUS_LABELS, clientDisplayName } from '../clientName'

type Filter = 'standard' | 'alle' | Status

export default function ClientListPage() {
  const navigate = useNavigate()
  const clients = useLiveQuery(() => db.clients.toArray())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('standard')

  async function addClient() {
    const id = await createClient()
    navigate(`/klienten/${id}`)
  }

  const q = query.trim().toLowerCase()
  const visible = (clients ?? [])
    .filter((c) => {
      if (filter === 'standard') return c.status !== 'archiviert'
      return filter === 'alle' || c.status === filter
    })
    .filter((c) => q === '' || [c.name, c.email, c.phone].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b), 'de'))

  return (
    <section>
      <div className="page-head">
        <h1>Klienten</h1>
        <button type="button" className="primary" onClick={addClient}>Neuer Klient</button>
      </div>
      <div className="filters">
        <div className="field">
          <label htmlFor="client-search">Suche</label>
          <input
            id="client-search"
            type="search"
            value={query}
            placeholder="Name, E-Mail oder Telefon"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="client-status">Status</label>
          <select id="client-status" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="standard">Aktiv und pausiert</option>
            <option value="alle">Alle</option>
            <option value="aktiv">Aktiv</option>
            <option value="pausiert">Pausiert</option>
            <option value="archiviert">Archiviert</option>
          </select>
        </div>
      </div>
      {clients === undefined ? (
        <p>Lädt …</p>
      ) : visible.length === 0 ? (
        <p className="muted">Keine Klienten gefunden.</p>
      ) : (
        <ul className="client-list">
          {visible.map((c) => (
            <li key={c.id}>
              <Link to={`/klienten/${c.id}`}>
                <span className="client-name">{clientDisplayName(c)}</span>
                <span className={`badge badge-${c.status}`}>{STATUS_LABELS[c.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
