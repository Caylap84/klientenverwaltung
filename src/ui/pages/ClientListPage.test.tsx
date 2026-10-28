import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db, createClient } from '../../storage/repository'
import ClientListPage from './ClientListPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/klienten']}>
      <Routes>
        <Route path="/klienten" element={<ClientListPage />} />
        <Route path="/klienten/:id" element={<div>Profilseite</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ClientListPage', () => {
  it('zeigt "Unbenannter Klient" für einen leeren Klienten', async () => {
    await createClient()
    renderList()
    expect(await screen.findByText('Unbenannter Klient')).toBeInTheDocument()
  })

  it('Suchfeld filtert nach Name', async () => {
    await createClient({ name: 'Anna Beispiel' })
    await createClient({ name: 'Bernd Muster' })
    renderList()
    await screen.findByText('Anna Beispiel')
    await userEvent.type(screen.getByLabelText('Suche'), 'bern')
    expect(screen.queryByText('Anna Beispiel')).not.toBeInTheDocument()
    expect(screen.getByText('Bernd Muster')).toBeInTheDocument()
  })

  it('Statusfilter blendet andere Status aus (Standard: aktiv und pausiert)', async () => {
    await createClient({ name: 'Aktiv A', status: 'aktiv' })
    await createClient({ name: 'Pausiert P', status: 'pausiert' })
    await createClient({ name: 'Archiv X', status: 'archiviert' })
    renderList()
    await screen.findByText('Aktiv A')
    expect(screen.getByText('Pausiert P')).toBeInTheDocument()
    expect(screen.queryByText('Archiv X')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'archiviert')
    expect(screen.getByText('Archiv X')).toBeInTheDocument()
    expect(screen.queryByText('Aktiv A')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'alle')
    expect(screen.getByText('Aktiv A')).toBeInTheDocument()
    expect(screen.getByText('Archiv X')).toBeInTheDocument()
  })

  it('Status-Abzeichen zeigt deutsche Bezeichnungen in Großschreibung', async () => {
    await createClient({ name: 'A', status: 'aktiv' })
    await createClient({ name: 'P', status: 'pausiert' })
    await createClient({ name: 'X', status: 'archiviert' })
    renderList()
    await userEvent.selectOptions(await screen.findByLabelText('Status'), 'alle')
    const badges = [...document.querySelectorAll('.client-list .badge')].map((b) => b.textContent)
    expect(badges).toEqual(['Aktiv', 'Pausiert', 'Archiviert'])
  })

  it('"Neuer Klient" legt einen Klienten an und navigiert zum Profil', async () => {
    renderList()
    await userEvent.click(screen.getByRole('button', { name: 'Neuer Klient' }))
    expect(await screen.findByText('Profilseite')).toBeInTheDocument()
    await waitFor(async () => expect(await db.clients.count()).toBe(1))
  })
})
