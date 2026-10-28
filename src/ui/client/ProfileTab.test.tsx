import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db, createClient } from '../../storage/repository'
import App from '../App'
import { confirmAction } from '../confirm'

vi.mock('../confirm', () => ({ confirmAction: vi.fn() }))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  vi.mocked(confirmAction).mockReset()
})

async function renderProfile(id: string) {
  render(
    <MemoryRouter initialEntries={[`/klienten/${id}`]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Klientenprofil', () => {
  it('Stammdaten enthalten keine Status-Auswahl mehr (steht im Kopf der Klientenseite)', async () => {
    const id = await createClient({ name: 'Anna' })
    await renderProfile(id)
    const panel = await screen.findByRole('tabpanel')
    await within(panel).findByLabelText('Name')
    expect(within(panel).queryByRole('radio')).not.toBeInTheDocument()
  })

  it('Adresse ist mehrzeilig (3 Zeilen) und speichert Zeilenumbrüche', async () => {
    const id = await createClient()
    await renderProfile(id)
    const address = await screen.findByLabelText('Adresse')
    expect(address.tagName).toBe('TEXTAREA')
    expect(address).toHaveAttribute('rows', '3')
    await userEvent.type(address, 'Musterstr. 1{Enter}12345 Stadt')
    await userEvent.tab()
    await vi.waitFor(async () => expect((await db.clients.get(id))?.address).toBe('Musterstr. 1\n12345 Stadt'))
  })

  it('Eingaben werden beim Verlassen des Feldes gespeichert', async () => {
    const id = await createClient()
    await renderProfile(id)
    await userEvent.type(await screen.findByLabelText('Name'), 'Clara Neu')
    await userEvent.tab()
    await vi.waitFor(async () => expect((await db.clients.get(id))?.name).toBe('Clara Neu'))
  })

  it('Löschen ohne Bestätigung behält den Klienten', async () => {
    const id = await createClient({ name: 'Anna' })
    const spy = vi.mocked(confirmAction).mockReturnValue(false)
    await renderProfile(id)
    await userEvent.click(await screen.findByRole('button', { name: 'Klient löschen' }))
    expect(spy).toHaveBeenCalledOnce()
    expect(await db.clients.get(id)).toBeDefined()
  })

  it('Löschen mit Bestätigung entfernt den Klienten und zeigt die leere Liste', async () => {
    const id = await createClient({ name: 'Anna' })
    vi.mocked(confirmAction).mockReturnValue(true)
    await renderProfile(id)
    await userEvent.click(await screen.findByRole('button', { name: 'Klient löschen' }))
    expect(await screen.findByRole('heading', { name: 'Klienten' })).toBeInTheDocument()
    expect(await db.clients.get(id)).toBeUndefined()
    expect(await screen.findByText('Keine Klienten gefunden.')).toBeInTheDocument()
  })

  it('unbekannte ID zeigt freundliche Meldung', async () => {
    await renderProfile('gibt-es-nicht')
    expect(await screen.findByText('Klient nicht gefunden')).toBeInTheDocument()
  })
})
