import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db, createClient } from '../../storage/repository'
import App from '../App'
import { confirmAction } from '../confirm'
import { todayIso } from './contractFields'

vi.mock('../confirm', () => ({ confirmAction: vi.fn(() => true) }))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  vi.mocked(confirmAction).mockReset()
  vi.mocked(confirmAction).mockReturnValue(true)
})

async function setup(init = {}) {
  const id = await createClient({ name: 'Anna', ...init })
  render(<MemoryRouter initialEntries={[`/klienten/${id}`]}><App /></MemoryRouter>)
  await userEvent.click(await screen.findByRole('tab', { name: 'Notizen' }))
  await screen.findByRole('button', { name: 'Eintrag hinzufügen' })
  return id
}

describe('Notizen', () => {
  it('speichert den Notiztext nach Blur', async () => {
    const id = await setup()
    await userEvent.type(screen.getByLabelText('Notizen'), 'Hallo Welt')
    await userEvent.tab()
    await vi.waitFor(async () => expect((await db.clients.get(id))!.notes).toBe('Hallo Welt'), { timeout: 5000 })
  })

  it('zeigt Leerzustand', async () => {
    await setup()
    expect(screen.getByText('Noch keine Einträge')).toBeInTheDocument()
  })

  it('Eintrag hinzufügen: oben, heutiges Datum, Fokus im Text', async () => {
    const id = await setup({ log: [{ id: 'old', date: '2020-01-01', text: 'alt' }] })
    await userEvent.click(screen.getByRole('button', { name: 'Eintrag hinzufügen' }))
    await vi.waitFor(() => expect(screen.getAllByLabelText('Datum (JJJJ-MM-TT)')).toHaveLength(2), { timeout: 5000 })
    const dates = screen.getAllByLabelText('Datum (JJJJ-MM-TT)')
    expect(dates[0]).toHaveValue(todayIso())
    expect(dates[1]).toHaveValue('2020-01-01')
    await vi.waitFor(() => expect(screen.getAllByLabelText('Eintrag')[0]).toHaveFocus(), { timeout: 5000 })
    expect((await db.clients.get(id))!.log).toHaveLength(2)
  })

  it('Text und Datum bearbeiten; ungültiges Datum wird verworfen', async () => {
    const id = await setup({ log: [{ id: 'e1', date: '2026-01-05', text: '' }] })
    await userEvent.type(screen.getByLabelText('Eintrag'), 'Sitzung')
    await userEvent.tab()
    const date = screen.getByLabelText('Datum (JJJJ-MM-TT)')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-13-45')
    await userEvent.tab()
    expect(await screen.findByText('Bitte im Format JJJJ-MM-TT eingeben')).toBeInTheDocument()
    await vi.waitFor(() => expect(date).toHaveValue('2026-01-05'), { timeout: 5000 })
    await userEvent.clear(date)
    await userEvent.type(date, '2026-02-03')
    await userEvent.tab()
    await vi.waitFor(async () => {
      const e = (await db.clients.get(id))!.log[0]
      expect(e).toEqual({ id: 'e1', date: '2026-02-03', text: 'Sitzung' })
    }, { timeout: 5000 })
  })

  it('zwei schnelle Änderungen an verschiedenen Einträgen überschreiben sich nicht', async () => {
    const id = await setup({ log: [{ id: 'a', date: '2026-01-02', text: '' }, { id: 'b', date: '2026-01-01', text: '' }] })
    const [first, second] = screen.getAllByLabelText('Eintrag')
    await userEvent.type(first, 'A')
    await userEvent.type(second, 'B')
    await userEvent.tab()
    await vi.waitFor(async () => {
      const log = (await db.clients.get(id))!.log
      expect(log.map((e) => e.text)).toEqual(['A', 'B'])
    }, { timeout: 5000 })
  })

  it('Löschen entfernt den Eintrag nach Bestätigung', async () => {
    const id = await setup({ log: [{ id: 'a', date: '2026-01-02', text: 'x' }] })
    vi.mocked(confirmAction).mockReturnValueOnce(false)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect((await db.clients.get(id))!.log).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await vi.waitFor(async () => expect((await db.clients.get(id))!.log).toHaveLength(0), { timeout: 5000 })
    expect(await screen.findByText('Noch keine Einträge')).toBeInTheDocument()
    expect(within(document.body).queryByLabelText('Eintrag')).toBeNull()
  })

  it('Datum eines Eintrags kann geleert werden; Eintrag ohne Datum steht unten', async () => {
    const id = await setup({ log: [{ id: 'a', date: '2026-01-02', text: 'erst' }, { id: 'b', date: '2026-01-01', text: 'zweit' }] })
    const [first] = screen.getAllByLabelText('Datum (JJJJ-MM-TT)')
    await userEvent.clear(first)
    await userEvent.tab()
    await vi.waitFor(async () => expect((await db.clients.get(id))!.log.find((x) => x.id === 'a')!.date).toBe(''), { timeout: 5000 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await vi.waitFor(() => {
      const texts = screen.getAllByLabelText('Eintrag').map((t) => (t as HTMLTextAreaElement).value)
      expect(texts).toEqual(['zweit', 'erst'])
    }, { timeout: 5000 })
  })
})
