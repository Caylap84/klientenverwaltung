import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { db, createClient, createContract, updateContract } from '../../storage/repository'
import { currentMonth, monthLabel } from '../../domain/months'
import { todayIso } from '../client/contractFields'
import OverviewPage from './OverviewPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

function Where() {
  const l = useLocation()
  return <span data-testid="where">{l.pathname + l.search}</span>
}

function renderPage(url = '/?monat=2026-10', today = '2026-10') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Where />
      <Routes>
        <Route path="/" element={<OverviewPage today={today} />} />
        <Route path="/klienten/:id" element={<div>Profilseite</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function seedContract(clientId: string, price: number, start = '2026-10', term = 3) {
  const id = await createContract(clientId)
  await updateContract(id, { startMonth: start, termMonths: term, priceMode: 'monthly', priceCents: price })
  return id
}

async function seed() {
  const a = await createClient({ name: 'Anna Beispiel' })
  const b = await createClient({ name: 'Bernd Muster' })
  const p = await createClient({ name: 'Paula Pause', status: 'pausiert' })
  const ca = await seedContract(a, 10000)
  await seedContract(b, 20000)
  await seedContract(p, 99900)
  return { a, b, ca }
}

function stat(label: string) {
  return screen.getByText(label).parentElement as HTMLElement
}

describe('OverviewPage', () => {
  it('leere Datenbank zeigt 0 und 0,00 € ohne Fehler', async () => {
    renderPage()
    expect(await screen.findByText('Noch keine aktiven Klienten')).toBeInTheDocument()
    expect(within(stat('Aktive Klienten')).getByText('0')).toBeInTheDocument()
    for (const l of ['Erwartet', 'Eingegangen', 'Offen']) {
      expect(within(stat(l)).getByText(/^0,00\s€$/)).toBeInTheDocument()
    }
  })

  it('zeigt aktive Klienten und Summen (pausierte zählen nicht)', async () => {
    await seed()
    renderPage()
    await screen.findByText('Anna Beispiel')
    expect(within(stat('Aktive Klienten')).getByText('2')).toBeInTheDocument()
    expect(within(stat('Erwartet')).getByText(/^300,00\s€$/)).toBeInTheDocument()
    expect(within(stat('Eingegangen')).getByText(/^0,00\s€$/)).toBeInTheDocument()
    expect(within(stat('Offen')).getByText(/^300,00\s€$/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument()
    expect(screen.queryByText('Paula Pause')).not.toBeInTheDocument()
  })

  it('Pfeile wechseln den Monat, auch über die Jahresgrenze', async () => {
    renderPage('/?monat=2026-12')
    await screen.findByRole('heading', { name: 'Dezember 2026' })
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }))
    expect(screen.getByRole('heading', { name: 'Januar 2027' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Vorheriger Monat' }))
    expect(screen.getByRole('heading', { name: 'Dezember 2026' })).toBeInTheDocument()
  })

  it('"Aktueller Monat" erscheint nur bei anderem Monat und springt zurück', async () => {
    renderPage(`/?monat=${currentMonth()}`)
    await screen.findByRole('heading', { name: monthLabel(currentMonth()) })
    expect(screen.queryByRole('button', { name: 'Aktueller Monat' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }))
    await userEvent.click(screen.getByRole('button', { name: 'Aktueller Monat' }))
    expect(screen.getByRole('heading', { name: monthLabel(currentMonth()) })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aktueller Monat' })).not.toBeInTheDocument()
  })

  it('ungültiger monat-Parameter fällt auf den aktuellen Monat zurück', async () => {
    renderPage('/?monat=quatsch')
    expect(await screen.findByRole('heading', { name: monthLabel(currentMonth()) })).toBeInTheDocument()
  })

  it('Abhaken verschiebt den Betrag von Offen nach Eingegangen', async () => {
    const { ca } = await seed()
    renderPage()
    await screen.findByText('Anna Beispiel')
    const row = screen.getByText('Anna Beispiel').closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: 'Als bezahlt abhaken: Anna Beispiel, Oktober 2026' }))
    await waitFor(() => expect(screen.queryByText('Anna Beispiel')).not.toBeInTheDocument())
    expect(within(stat('Eingegangen')).getByText(/^100,00\s€$/)).toBeInTheDocument()
    expect(within(stat('Offen')).getByText(/^200,00\s€$/)).toBeInTheDocument()
    expect((await db.contracts.get(ca))!.paid['2026-10']).toEqual({ paidOn: todayIso() })
  })

  it('Abhaken überschreibt keine anderen bezahlten Monate', async () => {
    const { ca } = await seed()
    await updateContract(ca, { paid: { '2026-11': { paidOn: '2026-11-05' } } })
    renderPage()
    await screen.findByText('Anna Beispiel')
    await userEvent.click(within(screen.getByText('Anna Beispiel').closest('li') as HTMLElement)
      .getByRole('button', { name: 'Als bezahlt abhaken: Anna Beispiel, Oktober 2026' }))
    await waitFor(async () => expect(Object.keys((await db.contracts.get(ca))!.paid).sort())
      .toEqual(['2026-10', '2026-11']))
  })

  it('Klientenname verlinkt zum Profil', async () => {
    const { a } = await seed()
    renderPage()
    const link = await screen.findByRole('link', { name: /Anna Beispiel/ })
    expect(link).toHaveAttribute('href', `/klienten/${a}`)
  })

  it('mehrere Verträge im Monat werden nummeriert', async () => {
    const { a } = await seed()
    await seedContract(a, 5000, '2026-09', 2)
    renderPage()
    await screen.findAllByText('Anna Beispiel')
    expect(screen.getByText('Vertrag 1')).toBeInTheDocument()
    expect(screen.getByText('Vertrag 2')).toBeInTheDocument()
  })

  it('zeigt "Alles eingegangen", wenn nichts offen ist', async () => {
    const { ca, b } = await seed()
    await updateContract(ca, { paid: { '2026-10': { paidOn: '2026-10-02' } } })
    const cb = (await db.contracts.where('clientId').equals(b).first())!
    await updateContract(cb.id, { paid: { '2026-10': { paidOn: '2026-10-02' } } })
    renderPage()
    expect(await screen.findByText('Alles eingegangen')).toBeInTheDocument()
  })

  it('Monat ohne Verträge zeigt Hinweis', async () => {
    await seed()
    renderPage('/?monat=2030-01')
    expect(await screen.findByText('Für diesen Monat sind keine Honorare erwartet.')).toBeInTheDocument()
    expect(screen.queryByText('Alles eingegangen')).not.toBeInTheDocument()
  })

  describe('Überfällig', () => {
    async function seedOverdue() {
      const a = await createClient({ name: 'Anna Beispiel' })
      const b = await createClient({ name: 'Bernd Muster' })
      const p = await createClient({ name: 'Paula Pause', status: 'pausiert' })
      const ca = await seedContract(a, 10000, '2026-08', 3) // Aug, Sep, Okt
      const cb = await seedContract(b, 5000, '2026-09', 1)
      await seedContract(p, 99900, '2026-08', 1)
      return { a, ca, cb }
    }

    it('zeigt Überfälliges unabhängig vom gewählten Monat, mit Anzahl und Summe', async () => {
      await seedOverdue()
      renderPage('/?monat=2030-01')
      const h = await screen.findByRole('heading', { name: /^Überfällig/ })
      expect(h.textContent?.replace(/\s/g, ' ')).toMatch(/^Überfällig · 3 Monate · 250,00 €$/)
      const list = h.parentElement as HTMLElement
      expect(within(list).getAllByRole('listitem')).toHaveLength(3)
      expect(within(list).getByText('August 2026')).toBeInTheDocument()
      expect(within(list).queryByText('Oktober 2026')).not.toBeInTheDocument()
      expect(within(list).queryByText('Paula Pause')).not.toBeInTheDocument()
    })

    it('Abhaken entfernt den Eintrag und lässt andere bezahlte Monate unberührt', async () => {
      const { ca } = await seedOverdue()
      await updateContract(ca, { paid: { '2026-10': { paidOn: '2026-10-01' } } })
      renderPage('/?monat=2026-10')
      await userEvent.click(await screen.findByRole('button', { name: 'Als bezahlt abhaken: Anna Beispiel, August 2026, überfällig' }))
      await waitFor(async () => expect(Object.keys((await db.contracts.get(ca))!.paid).sort())
        .toEqual(['2026-08', '2026-10']))
      expect((await db.contracts.get(ca))!.paid['2026-08']).toEqual({ paidOn: todayIso() })
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Als bezahlt abhaken: Anna Beispiel, August 2026, überfällig' }))
        .not.toBeInTheDocument())
      expect(screen.getByRole('heading', { name: /^Überfällig · 2 Monate · 150,00/ })).toBeInTheDocument()
    })

    it('Abhaken-Buttons haben eindeutige Namen, auch bei mehreren Verträgen im selben Monat', async () => {
      const { a } = await seedOverdue()
      await seedContract(a, 2000, '2026-09', 1)
      renderPage('/?monat=2026-10')
      await screen.findByRole('heading', { name: /^Überfällig/ })
      const names = screen.getAllByRole('button', { name: /^Als bezahlt abhaken/ }).map((b) => b.getAttribute('aria-label'))
      expect(new Set(names).size).toBe(names.length)
      expect(names).toContain('Als bezahlt abhaken: Anna Beispiel, September 2026, Vertrag 1, überfällig')
      expect(names).toContain('Als bezahlt abhaken: Anna Beispiel, September 2026, Vertrag 2, überfällig')
    })

    it('derselbe Eintrag in Überfällig und Monatsliste: Namen eindeutig, Abhaken entfernt ihn aus beiden', async () => {
      const { ca } = await seedOverdue()
      for (const name of ['Als bezahlt abhaken: Anna Beispiel, August 2026', 'Als bezahlt abhaken: Anna Beispiel, August 2026, überfällig']) {
        renderPage('/?monat=2026-08')
        await screen.findByRole('button', { name })
        const names = screen.getAllByRole('button', { name: /^Als bezahlt abhaken/ }).map((b) => b.getAttribute('aria-label'))
        expect(new Set(names).size).toBe(names.length)
        expect(names).toEqual(expect.arrayContaining([
          'Als bezahlt abhaken: Anna Beispiel, August 2026',
          'Als bezahlt abhaken: Anna Beispiel, August 2026, überfällig']))
        await userEvent.click(screen.getByRole('button', { name }))
        await waitFor(async () => expect((await db.contracts.get(ca))!.paid['2026-08']).toEqual({ paidOn: todayIso() }))
        await waitFor(() => expect(screen.queryByRole('button', { name: /August 2026/ })).not.toBeInTheDocument())
        cleanup()
        await updateContract(ca, { paid: {} })
      }
    })

    it('zeigt "Nichts überfällig." wenn alles bezahlt oder nicht fällig ist', async () => {
      await seed()
      renderPage()
      expect(await screen.findByText('Nichts überfällig.')).toBeInTheDocument()
    })

    it('Überfällig-Bereich erscheint nicht während des Ladens', () => {
      renderPage()
      expect(screen.queryByText(/Überfällig/)).not.toBeInTheDocument()
    })
  })
})
