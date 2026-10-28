import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  it('rendert die Hauptnavigation mit den drei deutschen Einträgen', async () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Übersicht', 'Klienten', 'Sicherung'])
    expect(await screen.findByRole('heading', { level: 1, name: 'Übersicht' })).toBeInTheDocument()
  })

  it('unbekannte Seite: Meldung ohne Platzhaltertext und Link zurück zur Übersicht', async () => {
    renderAt('/gibt-es-nicht')
    expect(screen.getByRole('heading', { level: 1, name: 'Seite nicht gefunden' })).toBeInTheDocument()
    expect(screen.queryByText('Folgt.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Zur Übersicht' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Übersicht' })).toBeInTheDocument()
  })
})
