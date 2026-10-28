import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { db, createClient, updateClient } from '../../storage/repository'
import App from '../App'
import { confirmAction } from '../confirm'

vi.mock('../confirm', () => ({ confirmAction: vi.fn(() => false) }))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

function Go({ to }: { to: string }) {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(to)}>gehe</button>
}

function setup(startId: string, goId?: string) {
  render(
    <MemoryRouter initialEntries={[`/klienten/${startId}`]}>
      {goId && <Go to={`/klienten/${goId}`} />}
      <App />
    </MemoryRouter>,
  )
}

describe('ProfileTab: lokaler Feldzustand', () => {
  it('(a) Wechsel A nach B ohne Blur: Text von A wird bei A gespeichert, nie in B', async () => {
    const a = await createClient({ name: 'Anna' })
    const b = await createClient({ name: 'Bernd' })
    setup(a, b)
    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Anna Ungespeichert' } })
    fireEvent.click(screen.getByText('gehe'))
    await vi.waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Bernd'), { timeout: 5000 })
    await vi.waitFor(async () => expect((await db.clients.get(a))?.name).toBe('Anna Ungespeichert'), { timeout: 5000 })
    fireEvent.blur(screen.getByLabelText('Name'))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect((await db.clients.get(b))?.name).toBe('Bernd')
    expect((await db.clients.get(a))?.name).toBe('Anna Ungespeichert')
  })

  it('(b) beide Adressen leer: ungespeicherte Eingabe aus A landet bei A, nicht in B', async () => {
    const a = await createClient({ name: 'A' })
    const b = await createClient({ name: 'B' })
    setup(a, b)
    fireEvent.change(await screen.findByLabelText('Adresse'), { target: { value: 'Musterstr. 1' } })
    fireEvent.click(screen.getByText('gehe'))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'B' })).toBeInTheDocument(), { timeout: 5000 })
    expect(screen.getByLabelText('Adresse')).toHaveValue('')
    await userEvent.click(screen.getByLabelText('Adresse'))
    await userEvent.tab()
    await vi.waitFor(async () => expect((await db.clients.get(a))?.address).toBe('Musterstr. 1'), { timeout: 5000 })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect((await db.clients.get(b))?.address).toBe('')
    expect((await db.clients.get(a))?.address).toBe('Musterstr. 1')
  })

  it('(c) Name tippen, dann Reiter klicken: Name wird zuerst gespeichert', async () => {
    const id = await createClient()
    setup(id)
    await userEvent.type(await screen.findByLabelText('Name'), 'Clara')
    await userEvent.click(screen.getByRole('tab', { name: 'Notizen' }))
    await vi.waitFor(async () => expect((await db.clients.get(id))?.name).toBe('Clara'), { timeout: 5000 })
  })

  it('(c) Name tippen, dann Löschen klicken (abgelehnt): Name wird gespeichert', async () => {
    const id = await createClient()
    vi.mocked(confirmAction).mockReturnValue(false)
    setup(id)
    await userEvent.type(await screen.findByLabelText('Name'), 'Dora')
    await userEvent.click(screen.getByRole('button', { name: 'Klient löschen' }))
    await vi.waitFor(async () => expect((await db.clients.get(id))?.name).toBe('Dora'), { timeout: 5000 })
    expect(await db.clients.get(id)).toBeDefined()
  })

  it('(d) externe Änderung: nicht fokussiertes Feld wird übernommen, fokussiertes nicht überschrieben', async () => {
    const id = await createClient({ name: 'Eva' })
    setup(id)
    const name = await screen.findByLabelText('Name')
    await userEvent.click(name)
    await userEvent.type(name, ' Neu')
    await act(async () => {
      await updateClient(id, { name: 'Extern', address: 'Extern 5' })
    })
    await vi.waitFor(() => expect(screen.getByLabelText('Adresse')).toHaveValue('Extern 5'), { timeout: 5000 })
    expect(screen.getByLabelText('Name')).toHaveValue('Eva Neu')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('Routenwechsel ohne Blur (z. B. Zurück-Geste): Eingabe wird gespeichert', async () => {
    const id = await createClient({ name: 'Fritz' })
    render(
      <MemoryRouter initialEntries={[`/klienten/${id}`]}>
        <Go to="/sicherung" />
        <App />
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByLabelText('Telefon'), { target: { value: '0123' } })
    fireEvent.click(screen.getByText('gehe'))
    await screen.findByRole('heading', { name: 'Sicherung' })
    await vi.waitFor(async () => expect((await db.clients.get(id))?.phone).toBe('0123'), { timeout: 5000 })
  })

  it('externe Änderung an fokussiertem, unberührtem Feld wird beim Blur nicht zurückgesetzt', async () => {
    const id = await createClient({ name: 'Gina' })
    setup(id)
    await userEvent.click(await screen.findByLabelText('Name'))
    await act(async () => { await updateClient(id, { name: 'Extern' }) })
    await userEvent.tab()
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect((await db.clients.get(id))?.name).toBe('Extern')
    expect(screen.getByLabelText('Name')).toHaveValue('Extern')
  })

  it('Tab von Feld zu Feld behält den Fokus im nächsten Feld', async () => {
    const id = await createClient()
    setup(id)
    await userEvent.type(await screen.findByLabelText('Name'), 'Z')
    await userEvent.tab()
    expect(screen.getByLabelText('Adresse')).toHaveFocus()
    await vi.waitFor(async () => expect((await db.clients.get(id))?.name).toBe('Z'), { timeout: 5000 })
    expect(screen.getByLabelText('Adresse')).toHaveFocus()
  })
})
