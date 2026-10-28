import { useState } from 'react'
import type { Contract } from '../../domain/types'
import { canChangeTerm, monthAmounts, syncHourRows, totalCents } from '../../domain/contract'
import { contractMonths } from '../../domain/months'
import { contractTimeline } from '../../domain/overview'
import { formatEuro, parseEuroToCents } from '../../domain/money'
import { db, deleteContract } from '../../storage/repository'
import { confirmAction } from '../confirm'
import TextField from '../TextField'
import {
  MAX_HOURS, MAX_TERM_MONTHS, centsToInput, parseCount, patchContract, todayIso,
} from './contractFields'

function monthlyDisplay(c: Contract): string {
  const amounts = monthAmounts(c)
  if (amounts.length === 0) return '–'
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  return min === max ? formatEuro(min) : `${formatEuro(min)} bis ${formatEuro(max)}`
}

export default function ContractCard({ contract: c, index }: { contract: Contract; index: number }) {
  const [message, setMessage] = useState('')
  const newId = () => globalThis.crypto.randomUUID()
  const euroSave = (key: 'priceCents' | 'hourlyCents') => async (v: string) => {
    const cents = parseEuroToCents(v)
    setMessage('')
    const cur = await db.contracts.get(c.id)
    if (!cur || cents === cur[key]) return false
    await patchContract(c.id, () => ({ [key]: cents }))
  }

  /**
   * Startmonat oder Laufzeit ändern (immer nur das geänderte Feld schreiben, Entscheidung auf Basis
   * des aktuell gespeicherten Vertrags). Liefert false, wenn nichts geändert wurde.
   */
  async function changeSchedule(field: 'startMonth' | 'termMonths', value: string | number): Promise<boolean> {
    setMessage('')
    const cur = await db.contracts.get(c.id)
    if (!cur || cur[field] === value) return false
    const start = field === 'startMonth' ? (value as string) : cur.startMonth
    const term = field === 'termMonths' ? (value as number) : cur.termMonths
    if (!canChangeTerm(cur, start, term)) {
      setMessage('Änderung nicht möglich: Für Monate außerhalb des neuen Zeitraums ist bereits Honorar als bezahlt markiert. Bitte zuerst das Häkchen entfernen.')
      return false
    }
    const before = contractMonths(cur.startMonth, cur.termMonths)
    const after = new Set(contractMonths(start, term))
    const removes = before.some((m) => !after.has(m))
    const shifted = before.length > 0 && start !== cur.startMonth
    const hasPaid = Object.keys(cur.paid).length > 0
    if ((removes || (hasPaid && shifted)) &&
        !confirmAction('Laufzeit bzw. Startmonat ändern? Dadurch fallen Monate der Zeitleiste weg oder verschieben sich.')) {
      return false
    }
    await patchContract(c.id, (latest) => {
      const s = field === 'startMonth' ? (value as string) : latest.startMonth
      const t = field === 'termMonths' ? (value as number) : latest.termMonths
      if (!canChangeTerm(latest, s, t)) {
        setMessage('Änderung nicht möglich: Ein Monat wurde inzwischen als bezahlt markiert.')
        return null
      }
      return { [field]: value }
    })
    return true
  }

  async function saveHours(v: string) {
    const n = parseCount(v, MAX_HOURS)
    setMessage('')
    const cur = await db.contracts.get(c.id)
    if (!cur || n === cur.plannedHours) return false
    await patchContract(c.id, (latest) => ({ plannedHours: n, hours: syncHourRows(latest.hours, n, newId) }))
  }

  function patchRow(rowId: string, change: Partial<Contract['hours'][number]>) {
    void patchContract(c.id, (cur) => ({
      hours: cur.hours.map((h) => (h.id === rowId ? { ...h, ...change } : h)),
    }))
  }

  function togglePaid(month: string) {
    void patchContract(c.id, (cur) => {
      const paid = { ...cur.paid }
      if (paid[month]) delete paid[month]
      else paid[month] = { paidOn: todayIso() }
      return { paid }
    })
  }

  function savePaidDate(month: string, paidOn: string) {
    void patchContract(c.id, (cur) =>
      cur.paid[month] ? { paid: { ...cur.paid, [month]: { paidOn } } } : null)
  }

  function remove() {
    const hasPaid = Object.keys(c.paid).length > 0
    const hasDone = c.hours.some((h) => h.done)
    const extra = hasPaid || hasDone
      ? ` Achtung: ${[hasPaid && 'bezahlte Monate', hasDone && 'erledigte Stunden'].filter(Boolean).join(' und ')} gehen dabei verloren.`
      : ''
    if (!confirmAction(`Vertrag ${index + 1} wirklich löschen?${extra}`)) return
    void deleteContract(c.id)
  }

  const timeline = contractTimeline(c)
  const monthly = c.priceMode === 'monthly'

  return (
    <fieldset className="contract">
      <legend>Vertrag {index + 1}</legend>
      <div className="contract-grid">
        <TextField id={`${c.id}-start`} label="Startmonat" type="month" stored={c.startMonth}
          onSave={(v) => changeSchedule('startMonth', v)} />
        <TextField id={`${c.id}-term`} label="Laufzeit in Monaten" inputMode="numeric" stored={String(c.termMonths)}
          onSave={(v) => changeSchedule('termMonths', parseCount(v, MAX_TERM_MONTHS))} />
      </div>
      {message && <p role="alert" className="alert">{message}</p>}

      <fieldset className="status">
        <legend>Preisart</legend>
        <label className="radio">
          <input type="radio" name={`${c.id}-mode`} checked={monthly}
            onChange={() => void patchContract(c.id, () => ({ priceMode: 'monthly' }))} />
          Monatspreis
        </label>
        <label className="radio">
          <input type="radio" name={`${c.id}-mode`} checked={!monthly}
            onChange={() => void patchContract(c.id, () => ({ priceMode: 'total' }))} />
          Gesamtpreis
        </label>
      </fieldset>
      <div className="contract-grid">
        <TextField id={`${c.id}-price`} label={monthly ? 'Preis in € pro Monat' : 'Preis in € gesamt'}
          inputMode="decimal" stored={centsToInput(c.priceCents)} onSave={euroSave('priceCents')} />
        <TextField id={`${c.id}-hourly`} label="Stundenpreis in €" inputMode="decimal"
          stored={centsToInput(c.hourlyCents)} onSave={euroSave('hourlyCents')} />
      </div>
      <p className="derived">
        {monthly ? `Gesamtpreis: ${formatEuro(totalCents(c))}` : `Monatspreis: ${monthlyDisplay(c)}`}
      </p>

      <h3>Stunden</h3>
      <TextField id={`${c.id}-hours`} label="Geplante Stunden" inputMode="numeric" stored={String(c.plannedHours)}
        onSave={saveHours} />
      <p className="derived">{c.hours.filter((h) => h.done).length} von {c.hours.length} Stunden</p>
      {c.hours.length > c.plannedHours && (
        <p className="derived">Stunden mit Eintrag bleiben erhalten, auch wenn weniger Stunden geplant sind.</p>
      )}
      {c.hours.map((h, i) => (
        <div className="hour-row" key={h.id}>
          <label className="check">
            <input type="checkbox" checked={h.done} aria-label={`Stunde ${i + 1} erledigt`}
              onChange={(e) => patchRow(h.id, { done: e.target.checked })} />
            <span aria-hidden="true">{i + 1}.</span>
          </label>
          <TextField id={`${h.id}-date`} label={`Datum Stunde ${i + 1}`} type="date" stored={h.date}
            onSave={(v) => patchRow(h.id, { date: v })} />
          <TextField id={`${h.id}-note`} label={`Notiz Stunde ${i + 1}`} stored={h.note}
            onSave={(v) => patchRow(h.id, { note: v })} />
        </div>
      ))}

      <h3>Monate</h3>
      {timeline.length === 0 ? (
        <p className="muted">Startmonat und Laufzeit wählen</p>
      ) : (
        <ul className="timeline" aria-label="Zeitleiste">
          {timeline.map((row) => (
            <li key={row.month}>
              <span><strong>{row.label}</strong> · {formatEuro(row.cents)}</span>
              <label className="check">
                <input type="checkbox" checked={row.paid} onChange={() => togglePaid(row.month)} />
                Honorar eingegangen
              </label>
              {row.paid && (
                <div className="paid-date">
                  <TextField id={`${c.id}-${row.month}-paid`} label={`Eingangsdatum ${row.label}`} type="date"
                    stored={c.paid[row.month]?.paidOn ?? ''}
                    onSave={(v) => savePaidDate(row.month, v)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="danger" onClick={remove}>Vertrag löschen</button>
    </fieldset>
  )
}
