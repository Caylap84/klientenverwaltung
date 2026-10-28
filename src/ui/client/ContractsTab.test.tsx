import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db, createClient, createContract, updateContract } from '../../storage/repository'
import type { Contract } from '../../domain/types'
import App from '../App'
import { confirmAction } from '../confirm'

vi.mock('../confirm', () => ({ confirmAction: vi.fn(() => false) }))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  vi.mocked(confirmAction).mockReset()
  vi.mocked(confirmAction).mockReturnValue(false)
})

async function setup(patch: Partial<Contract> = {}) {
  const clientId = await createClient({ name: 'Anna' })
  const contractId = await createContract(clientId)
  if (Object.keys(patch).length) await updateContract(contractId, patch)
  render(
    <MemoryRouter initialEntries={[`/klienten/${clientId}`]}>
      <App />
    </MemoryRouter>,
  )
  await userEvent.click(await screen.findByRole('tab', { name: 'Verträge' }))
  await screen.findByRole('button', { name: 'Vertrag hinzufügen' })
  await screen.findByRole('group', { name: 'Vertrag 1' })
  return { clientId, contractId }
}

const stored = async (id: string) => (await db.contracts.get(id))!

async function edit(label: string, value: string, scope: ReturnType<typeof within> = screen) {
  const input = await scope.findByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
  await userEvent.tab()
}

describe('Preis', () => {
  it('Monatspreis 100 bei 6 Monaten zeigt Gesamtpreis 600,00 €', async () => {
    const { contractId } = await setup({ startMonth: '2026-03', termMonths: 6 })
    await edit('Preis in € pro Monat', '100')
    await vi.waitFor(() => expect(screen.getByText(/Gesamtpreis: 600,00\s€/)).toBeInTheDocument())
    expect((await stored(contractId)).priceCents).toBe(10000)
  })

  it('Gesamtpreis 100 bei 3 Monaten: Monatsbeträge 33,33 / 33,33 / 33,34', async () => {
    const { contractId } = await setup({ startMonth: '2026-03', termMonths: 3 })
    await userEvent.click(await screen.findByRole('radio', { name: 'Gesamtpreis' }))
    await edit('Preis in € gesamt', '100')
    const list = await screen.findByRole('list', { name: 'Zeitleiste' })
    await vi.waitFor(() => {
      const items = within(list).getAllByRole('listitem')
      expect(items[0]).toHaveTextContent(/33,33\s€/)
      expect(items[1]).toHaveTextContent(/33,33\s€/)
      expect(items[2]).toHaveTextContent(/33,34\s€/)
    })
    expect((await stored(contractId)).priceMode).toBe('total')
  })

  it('Umschalten behält die eingegebene Zahl (priceCents unverändert)', async () => {
    const { contractId } = await setup({ startMonth: '2026-03', termMonths: 6, priceCents: 10000 })
    await userEvent.click(await screen.findByRole('radio', { name: 'Gesamtpreis' }))
    await vi.waitFor(async () => expect((await stored(contractId)).priceMode).toBe('total'))
    expect((await stored(contractId)).priceCents).toBe(10000)
    expect(await screen.findByLabelText('Preis in € gesamt')).toHaveValue('100,00')
  })

  it('Unsinn in Zahlenfeldern ergibt 0, nie NaN', async () => {
    const { contractId } = await setup({ startMonth: '2026-03', termMonths: 6, priceCents: 10000, hourlyCents: 500, plannedHours: 0 })
    vi.mocked(confirmAction).mockReturnValue(true)
    await edit('Preis in € pro Monat', 'abc')
    await edit('Stundenpreis in €', '€€')
    await edit('Laufzeit in Monaten', 'x')
    await edit('Geplante Stunden', '-3')
    await vi.waitFor(async () => {
      const c = await stored(contractId)
      expect(c.priceCents).toBe(0)
      expect(c.hourlyCents).toBe(0)
      expect(c.termMonths).toBe(0)
    })
    const c = await stored(contractId)
    expect([c.priceCents, c.hourlyCents, c.termMonths, c.plannedHours].every(Number.isFinite)).toBe(true)
    expect(c.plannedHours).toBe(0)
  })
})

describe('Stunden', () => {
  it('Stundenanzahl 3 erzeugt 3 Zeilen; Häkchen, Datum und Notiz werden gespeichert', async () => {
    const { contractId } = await setup()
    await edit('Geplante Stunden', '3')
    await vi.waitFor(async () => expect((await stored(contractId)).hours).toHaveLength(3))
    await userEvent.click(await screen.findByLabelText('Stunde 1 erledigt'))
    await edit('Datum Stunde 1', '2026-04-02')
    await edit('Notiz Stunde 1', 'Erstgespräch')
    await vi.waitFor(async () => {
      const h = (await stored(contractId)).hours[0]
      expect(h).toMatchObject({ done: true, date: '2026-04-02', note: 'Erstgespräch' })
    })
    expect(screen.getAllByText('1 von 3 Stunden').length).toBeGreaterThan(0)
  })

  it('Verkleinern entfernt nur leere Zeilen', async () => {
    const { contractId } = await setup()
    await edit('Geplante Stunden', '3')
    await vi.waitFor(async () => expect((await stored(contractId)).hours).toHaveLength(3))
    await userEvent.click(await screen.findByLabelText('Stunde 1 erledigt'))
    await edit('Geplante Stunden', '0')
    await vi.waitFor(async () => expect((await stored(contractId)).hours).toHaveLength(1))
    expect((await stored(contractId)).hours[0].done).toBe(true)
  })

  it('schnelle Häkchen in zwei Zeilen überschreiben sich nicht', async () => {
    const { contractId } = await setup()
    await edit('Geplante Stunden', '2')
    const a = await screen.findByLabelText('Stunde 1 erledigt')
    const b = await screen.findByLabelText('Stunde 2 erledigt')
    fireEvent.click(a)
    fireEvent.click(b)
    await vi.waitFor(async () => {
      const h = (await stored(contractId)).hours
      expect(h.map((x) => x.done)).toEqual([true, true])
    })
  })

  it('Reiterkopf summiert über alle Verträge', async () => {
    const { clientId } = await setup({ plannedHours: 0 })
    const second = await createContract(clientId)
    await updateContract(second, {
      plannedHours: 2,
      hours: [
        { id: 'a', done: true, date: '', note: '' },
        { id: 'b', done: false, date: '', note: '' },
      ],
    })
    await vi.waitFor(() => expect(screen.getByText('Alle Verträge: 1 von 2 Stunden')).toBeInTheDocument())
  })
})

describe('Laufzeit und Startmonat', () => {
  it('Verkürzen unter einen bezahlten Monat wird abgelehnt', async () => {
    const { contractId } = await setup({
      startMonth: '2026-03', termMonths: 6, priceCents: 1000,
      paid: { '2026-06': { paidOn: '2026-06-05' } },
    })
    await edit('Laufzeit in Monaten', '2')
    expect(await screen.findByRole('alert')).toHaveTextContent(/bezahlt/i)
    expect(confirmAction).not.toHaveBeenCalled()
    expect((await stored(contractId)).termMonths).toBe(6)
    expect(screen.getByLabelText('Laufzeit in Monaten')).toHaveValue('6')
  })

  it('Verkürzen ohne bezahlte Monate: abgelehnte Bestätigung ändert nichts', async () => {
    const { contractId } = await setup({ startMonth: '2026-03', termMonths: 6 })
    await edit('Laufzeit in Monaten', '3')
    expect(confirmAction).toHaveBeenCalledOnce()
    expect((await stored(contractId)).termMonths).toBe(6)
    expect(screen.getByLabelText('Laufzeit in Monaten')).toHaveValue('6')
  })

  it('Verkürzen mit Bestätigung wird gespeichert', async () => {
    const { contractId } = await setup({ startMonth: '2026-03', termMonths: 6 })
    vi.mocked(confirmAction).mockReturnValue(true)
    await edit('Laufzeit in Monaten', '3')
    await vi.waitFor(async () => expect((await stored(contractId)).termMonths).toBe(3))
  })

  it('Verlängern braucht keine Bestätigung', async () => {
    const { contractId } = await setup({ startMonth: '2026-03', termMonths: 3 })
    await edit('Laufzeit in Monaten', '6')
    await vi.waitFor(async () => expect((await stored(contractId)).termMonths).toBe(6))
    expect(confirmAction).not.toHaveBeenCalled()
  })

  it('Startmonat verschieben über bezahlten Monat hinaus wird abgelehnt', async () => {
    const { contractId } = await setup({
      startMonth: '2026-03', termMonths: 3,
      paid: { '2026-03': { paidOn: '2026-03-05' } },
    })
    await edit('Startmonat', '2026-05')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect((await stored(contractId)).startMonth).toBe('2026-03')
  })

  it('Startmonat setzen auf leerem Vertrag speichert ohne Rückfrage', async () => {
    const { contractId } = await setup({ termMonths: 2 })
    const start = await screen.findByLabelText('Startmonat')
    fireEvent.change(start, { target: { value: '2026-03' } })
    fireEvent.blur(start)
    await vi.waitFor(async () => expect((await stored(contractId)).startMonth).toBe('2026-03'))
    expect(confirmAction).not.toHaveBeenCalled()
  })
})

describe('Zeitleiste', () => {
  it('Startmonat und Laufzeit kurz hintereinander: keines überschreibt das andere', async () => {
    const { contractId } = await setup()
    const start = screen.getByLabelText('Startmonat')
    const term = screen.getByLabelText('Laufzeit in Monaten')
    fireEvent.change(start, { target: { value: '2026-03' } })
    fireEvent.blur(start)
    fireEvent.change(term, { target: { value: '3' } })
    fireEvent.blur(term)
    await vi.waitFor(async () => {
      const c = await stored(contractId)
      expect([c.startMonth, c.termMonths]).toEqual(['2026-03', 3])
    })
    expect(await screen.findByRole('list', { name: 'Zeitleiste' })).toBeInTheDocument()
  })

  it('Vertrag ohne Startmonat zeigt Hinweis statt Zeitleiste', async () => {
    await setup({ termMonths: 3 })
    expect(await screen.findByText('Startmonat und Laufzeit wählen')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Zeitleiste' })).not.toBeInTheDocument()
  })

  it('Vertrag mit 0 Monaten stürzt nicht ab', async () => {
    await setup({ startMonth: '2026-03', termMonths: 0 })
    expect(await screen.findByText('Startmonat und Laufzeit wählen')).toBeInTheDocument()
  })

  it('Honorar-Häkchen setzt und entfernt paid[month]; Eingangsdatum ist editierbar', async () => {
    const { contractId } = await setup({ startMonth: '2026-03', termMonths: 2, priceCents: 5000 })
    const list = await screen.findByRole('list', { name: 'Zeitleiste' })
    const first = within(within(list).getAllByRole('listitem')[0])
    expect(first.getByText('März 2026')).toBeInTheDocument()
    await userEvent.click(first.getByLabelText('Honorar eingegangen'))
    await vi.waitFor(async () => {
      expect((await stored(contractId)).paid['2026-03']?.paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
    await edit('Eingangsdatum März 2026', '2026-03-15')
    await vi.waitFor(async () => expect((await stored(contractId)).paid['2026-03'].paidOn).toBe('2026-03-15'))
    await userEvent.click(first.getByLabelText('Honorar eingegangen'))
    await vi.waitFor(async () => expect(Object.keys((await stored(contractId)).paid)).toEqual([]))
  })
})

describe('Mehrere Verträge', () => {
  it('Hinzufügen und Löschen (mit Bestätigung, Hinweis bei bezahlten Monaten)', async () => {
    const { clientId, contractId } = await setup({
      startMonth: '2026-03', termMonths: 2, paid: { '2026-03': { paidOn: '2026-03-05' } },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Vertrag hinzufügen' }))
    await vi.waitFor(async () => expect(await db.contracts.where('clientId').equals(clientId).count()).toBe(2))
    await vi.waitFor(() => expect(screen.getAllByRole('group', { name: /^Vertrag \d/ })).toHaveLength(2))

    const card = screen.getAllByRole('group', { name: /^Vertrag \d/ })[0]
    await userEvent.click(within(card).getByRole('button', { name: 'Vertrag löschen' }))
    expect(confirmAction).toHaveBeenCalledOnce()
    expect(vi.mocked(confirmAction).mock.calls[0][0]).toMatch(/bezahlt/i)
    expect(await db.contracts.get(contractId)).toBeDefined()

    vi.mocked(confirmAction).mockReturnValue(true)
    await userEvent.click(within(card).getByRole('button', { name: 'Vertrag löschen' }))
    await vi.waitFor(async () => expect(await db.contracts.get(contractId)).toBeUndefined())
  })

  it('Eingabe in einem Vertrag ändert nur diesen', async () => {
    const { clientId, contractId } = await setup({ startMonth: '2026-01', termMonths: 1 })
    const other = await createContract(clientId)
    await updateContract(other, { startMonth: '2026-06', termMonths: 1 })
    await vi.waitFor(() => expect(screen.getAllByRole('group', { name: /^Vertrag \d/ })).toHaveLength(2))
    const cards = screen.getAllByRole('group', { name: /^Vertrag \d/ })
    await edit('Stundenpreis in €', '80', within(cards[1]))
    await vi.waitFor(async () => expect((await stored(other)).hourlyCents).toBe(8000))
    expect((await stored(contractId)).hourlyCents).toBe(0)
  })
})

describe('Formatprüfung Monat/Datum', () => {
  it('Startmonat: ungültiger Text wird nicht gespeichert, Hinweis erscheint; gültig speichert', async () => {
    const { contractId } = await setup({ startMonth: '2026-03', termMonths: 2 })
    const start = asTextInput(screen.getByLabelText('Startmonat'))
    fireEvent.change(start, { target: { value: '03/2026' } })
    fireEvent.blur(start)
    expect(await screen.findByText('Bitte im Format JJJJ-MM eingeben')).toBeInTheDocument()
    expect((await stored(contractId)).startMonth).toBe('2026-03')
    await vi.waitFor(() => expect(screen.getByLabelText('Startmonat')).toHaveValue('2026-03'))
    vi.mocked(confirmAction).mockReturnValue(true)
    fireEvent.change(screen.getByLabelText('Startmonat'), { target: { value: '2026-05' } })
    fireEvent.blur(screen.getByLabelText('Startmonat'))
    await vi.waitFor(async () => expect((await stored(contractId)).startMonth).toBe('2026-05'))
    expect(screen.queryByText('Bitte im Format JJJJ-MM eingeben')).not.toBeInTheDocument()
  })

  it('Stundendatum: 2026-02-30 und Freitext abgelehnt, gültiges Datum gespeichert', async () => {
    const { contractId } = await setup({
      plannedHours: 1, hours: [{ id: 'h1', done: false, date: '', note: '' }],
    })
    for (const bad of ['2026-02-30', '1.4.2026']) {
      const d = asTextInput(await screen.findByLabelText('Datum Stunde 1'))
      fireEvent.change(d, { target: { value: bad } })
      fireEvent.blur(d)
      expect(await screen.findByText('Bitte im Format JJJJ-MM-TT eingeben')).toBeInTheDocument()
      expect((await stored(contractId)).hours[0].date).toBe('')
      await vi.waitFor(() => expect(screen.getByLabelText('Datum Stunde 1')).toHaveValue(''))
    }
    const d = screen.getByLabelText('Datum Stunde 1')
    fireEvent.change(d, { target: { value: '2026-02-27' } })
    fireEvent.blur(d)
    await vi.waitFor(async () => expect((await stored(contractId)).hours[0].date).toBe('2026-02-27'))
    expect(screen.queryByText('Bitte im Format JJJJ-MM-TT eingeben')).not.toBeInTheDocument()
  })

  it('Eingangsdatum: ungültig abgelehnt, gültig gespeichert', async () => {
    const { contractId } = await setup({
      startMonth: '2026-03', termMonths: 1, paid: { '2026-03': { paidOn: '2026-03-05' } },
    })
    const d = asTextInput(await screen.findByLabelText('Eingangsdatum März 2026'))
    fireEvent.change(d, { target: { value: '15.03.2026' } })
    fireEvent.blur(d)
    expect(await screen.findByText('Bitte im Format JJJJ-MM-TT eingeben')).toBeInTheDocument()
    expect((await stored(contractId)).paid['2026-03'].paidOn).toBe('2026-03-05')
    await vi.waitFor(() => expect(screen.getByLabelText('Eingangsdatum März 2026')).toHaveValue('2026-03-05'))
    fireEvent.change(screen.getByLabelText('Eingangsdatum März 2026'), { target: { value: '2026-03-15' } })
    fireEvent.blur(screen.getByLabelText('Eingangsdatum März 2026'))
    await vi.waitFor(async () => expect((await stored(contractId)).paid['2026-03'].paidOn).toBe('2026-03-15'))
  })

  it('Euro-Eingabe 12.50 wird als 12,50 gespeichert und angezeigt', async () => {
    const { contractId } = await setup()
    await edit('Stundenpreis in €', '12.50')
    await vi.waitFor(async () => expect((await stored(contractId)).hourlyCents).toBe(1250))
    await vi.waitFor(() => expect(screen.getByLabelText('Stundenpreis in €')).toHaveValue('12,50'))
  })
})

/** Simuliert Browser ohne native Monats-/Datumsfelder (Textfeld-Rückfall). */
function asTextInput(el: HTMLElement) {
  el.setAttribute('type', 'text')
  return el
}
