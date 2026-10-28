import { useLiveQuery } from 'dexie-react-hooks'
import { createContract, db } from '../../storage/repository'
import type { Client, Contract } from '../../domain/types'
import ContractCard from './ContractCard'

function order(a: Contract, b: Contract): number {
  // Verträge ohne Startmonat stehen unten (neu angelegte Verträge erscheinen so am Ende)
  if (a.startMonth !== b.startMonth) {
    if (a.startMonth === '') return 1
    if (b.startMonth === '') return -1
    return a.startMonth < b.startMonth ? -1 : 1
  }
  return a.id < b.id ? -1 : 1
}

export default function ContractsTab({ client }: { client: Client }) {
  const contracts = useLiveQuery(
    async () => (await db.contracts.where('clientId').equals(client.id).toArray()).sort(order),
    [client.id],
  )
  if (contracts === undefined) return <p>Lädt …</p>

  // Gezählt werden vorhandene Stundenzeilen (entspricht den geplanten Stunden, solange keine Zeilen mit Eintrag überzählig sind)
  const done = contracts.reduce((n, c) => n + c.hours.filter((h) => h.done).length, 0)
  const total = contracts.reduce((n, c) => n + c.hours.length, 0)

  return (
    <div>
      <div className="contracts-head">
        <strong>Alle Verträge: {done} von {total} Stunden</strong>
        <button type="button" className="primary" onClick={() => void createContract(client.id)}>
          Vertrag hinzufügen
        </button>
      </div>
      {contracts.length === 0 && <p className="muted">Noch kein Vertrag.</p>}
      {contracts.map((c, i) => <ContractCard key={c.id} contract={c} index={i} />)}
    </div>
  )
}
