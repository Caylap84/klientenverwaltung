import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../storage/repository'
import { monthOverview } from '../../domain/overview'
import { addMonths, contractMonths, currentMonth, isYearMonth, monthLabel } from '../../domain/months'
import { formatEuro } from '../../domain/money'
import { clientDisplayName } from '../clientName'
import { contractOrder, patchContract, todayIso } from '../client/contractFields'

// Der gewählte Monat steht in der URL (?monat=YYYY-MM): teilbar, überlebt Neuladen.
export default function OverviewPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('monat') ?? ''
  const now = currentMonth()
  const month = isYearMonth(raw) ? raw : now

  const clients = useLiveQuery(() => db.clients.toArray())
  const contracts = useLiveQuery(() => db.contracts.toArray())

  function go(m: string) {
    setParams(m === now ? {} : { monat: m }, { replace: true })
  }

  async function markPaid(contractId: string) {
    await patchContract(contractId, (cur) =>
      cur.paid[month] ? null : { paid: { ...cur.paid, [month]: { paidOn: todayIso() } } })
  }

  if (clients === undefined || contracts === undefined) return <p>Lädt …</p>

  const o = monthOverview(clients, contracts, month)
  const byId = new Map(clients.map((c) => [c.id, c]))
  const numberOf = (clientId: string, contractId: string) =>
    contracts.filter((c) => c.clientId === clientId).sort(contractOrder).findIndex((c) => c.id === contractId) + 1
  const coveringCount = (clientId: string) =>
    contracts.filter((c) => c.clientId === clientId && contractMonths(c.startMonth, c.termMonths).includes(month)).length

  const items = o.openItems
    .map((it) => ({ ...it, client: byId.get(it.clientId) }))
    .filter((it): it is typeof it & { client: NonNullable<typeof it.client> } => it.client !== undefined)
    .sort((a, b) => clientDisplayName(a.client).localeCompare(clientDisplayName(b.client), 'de')
      || numberOf(a.clientId, a.contractId) - numberOf(b.clientId, b.contractId))

  return (
    <section>
      <h1>Übersicht</h1>
      <div className="month-nav">
        <button type="button" onClick={() => go(addMonths(month, -1))} aria-label="Vorheriger Monat">‹</button>
        <h2>{monthLabel(month)}</h2>
        <button type="button" onClick={() => go(addMonths(month, 1))} aria-label="Nächster Monat">›</button>
        {month !== now && <button type="button" onClick={() => go(now)}>Aktueller Monat</button>}
      </div>
      <dl className="stats">
        <div className="stat"><dt>Aktive Klienten</dt><dd>{o.activeClients}</dd></div>
        <div className="stat"><dt>Erwartet</dt><dd>{formatEuro(o.expectedCents)}</dd></div>
        <div className="stat"><dt>Eingegangen</dt><dd>{formatEuro(o.receivedCents)}</dd></div>
        <div className="stat"><dt>Offen</dt><dd>{formatEuro(o.openCents)}</dd></div>
      </dl>
      <h2>Offene Honorare</h2>
      {o.activeClients === 0 ? (
        <p className="muted">Noch keine aktiven Klienten</p>
      ) : o.expectedCents === 0 && o.openItems.length === 0 ? (
        <p className="muted">Für diesen Monat sind keine Honorare erwartet.</p>
      ) : items.length === 0 ? (
        <p className="muted">Alles eingegangen</p>
      ) : (
        <ul className="open-list">
          {items.map((it) => (
            <li key={it.contractId}>
              <div>
                <Link to={`/klienten/${it.clientId}`}>{clientDisplayName(it.client)}</Link>
                {coveringCount(it.clientId) > 1 && (
                  <span className="muted"> Vertrag {numberOf(it.clientId, it.contractId)}</span>
                )}
              </div>
              <span className="amount">{formatEuro(it.cents)}</span>
              <button type="button" onClick={() => markPaid(it.contractId)}>Als bezahlt abhaken</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
