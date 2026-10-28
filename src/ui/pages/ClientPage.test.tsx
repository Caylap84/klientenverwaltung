import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db, createClient } from '../../storage/repository'
import App from '../App'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

function renderClient(id: string) {
  render(
    <MemoryRouter initialEntries={[`/klienten/${id}`]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Klientenseite: Status oben', () => {
  it('Status steht unter der Überschrift, deutsch beschriftet, aktueller Wert gewählt', async () => {
    const id = await createClient({ name: 'Anna', status: 'pausiert' })
    renderClient(id)
    const group = await screen.findByRole('group', { name: 'Status' })
    const heading = screen.getByRole('heading', { level: 1, name: 'Anna' })
    expect(heading.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(group.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Aktiv' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Pausiert' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Archiviert' })).not.toBeChecked()
  })

  it('Statuswechsel auf Pausiert wird sofort gespeichert', async () => {
    const id = await createClient({ name: 'Anna' })
    renderClient(id)
    await userEvent.click(await screen.findByRole('radio', { name: 'Pausiert' }))
    await vi.waitFor(async () => expect((await db.clients.get(id))?.status).toBe('pausiert'), { timeout: 5000 })
    expect((await db.clients.get(id))?.name).toBe('Anna')
  })

  it('Status ist auf jedem Reiter sichtbar und umschaltbar', async () => {
    const id = await createClient({ name: 'Anna' })
    renderClient(id)
    for (const tab of ['Verträge', 'Notizen', 'PDFs']) {
      await userEvent.click(await screen.findByRole('tab', { name: tab }))
      expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('radio', { name: 'Archiviert' }))
    await vi.waitFor(async () => expect((await db.clients.get(id))?.status).toBe('archiviert'), { timeout: 5000 })
    // Der Live-Query kann dem DB-Write hinterherhinken: auf den Zustand warten, nicht nur auf das Element.
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: 'Archiviert' })).toBeChecked(), { timeout: 5000 })
  })
})
