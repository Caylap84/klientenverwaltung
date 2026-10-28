import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db, createClient } from '../../storage/repository'
import App from '../App'
import { confirmAction } from '../confirm'
import { MAX_PDF_BYTES } from './pdfActions'

vi.mock('../confirm', () => ({ confirmAction: vi.fn(() => true) }))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  vi.mocked(confirmAction).mockReset()
  vi.mocked(confirmAction).mockReturnValue(true)
})
afterEach(() => { vi.restoreAllMocks() })

async function setup() {
  const id = await createClient({ name: 'Anna' })
  render(<MemoryRouter initialEntries={[`/klienten/${id}`]}><App /></MemoryRouter>)
  await userEvent.click(await screen.findByRole('tab', { name: 'PDFs' }))
  await screen.findByLabelText('PDF hinzufügen')
  return id
}
const pdf = (name: string, type = 'application/pdf') => new File(['%PDF-1.4 test'], name, { type })
const upload = (...files: File[]) =>
  userEvent.upload(screen.getByLabelText('PDF hinzufügen'), files, { applyAccept: false })

describe('PDFs', () => {
  it('zeigt Leerzustand', async () => {
    await setup()
    expect(screen.getByText('Noch keine Dokumente')).toBeInTheDocument()
  })

  it('legt PDF mit Umlauten und Leerzeichen im Namen an', async () => {
    const id = await setup()
    await upload(pdf('Vertrag Müller äöü.pdf'))
    expect(await screen.findByText('Vertrag Müller äöü.pdf')).toBeInTheDocument()
    const docs = await db.pdfs.where('clientId').equals(id).toArray()
    expect(docs.map((d) => d.name)).toEqual(['Vertrag Müller äöü.pdf'])
    expect(docs[0].data.byteLength).toBe(13)
    expect(screen.getByText(/\d{2}\.\d{2}\.\d{4} · 1 KB/)).toBeInTheDocument()
  })

  it('lehnt Nicht-PDFs ab, akzeptiert die gültigen', async () => {
    await setup()
    await upload(new File(['x'], 'bild.png', { type: 'image/png' }), pdf('ok.pdf'), pdf('SCAN.PDF', ''))
    expect(await screen.findByText('„bild.png“ ist keine PDF-Datei.')).toBeInTheDocument()
    expect(await screen.findByText('ok.pdf')).toBeInTheDocument()
    expect(await screen.findByText('SCAN.PDF')).toBeInTheDocument()
    expect(await db.pdfs.count()).toBe(2)
  })

  it('lehnt zu große Dateien ab, ohne sie zu lesen', async () => {
    await setup()
    const big = pdf('gross.pdf')
    Object.defineProperty(big, 'size', { value: MAX_PDF_BYTES + 1 })
    const read = vi.spyOn(big, 'arrayBuffer')
    await upload(big)
    expect(await screen.findByText(/„gross.pdf“ ist zu groß/)).toBeInTheDocument()
    expect(read).not.toHaveBeenCalled()
    expect(await db.pdfs.count()).toBe(0)
  })

  it('Öffnen und Herunterladen nutzen Object-URLs', async () => {
    await setup()
    await upload(pdf('a.pdf'))
    await screen.findByText('a.pdf')
    const create = vi.fn(() => 'blob:x')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await userEvent.click(screen.getByRole('button', { name: 'a.pdf öffnen' }))
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('blob:x', '_blank', 'noopener'))
    const blob = (create.mock.calls[0] as unknown as [Blob])[0]
    expect(blob.type).toBe('application/pdf')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('a.pdf')
    })
    await userEvent.click(screen.getByRole('button', { name: 'a.pdf herunterladen' }))
    await vi.waitFor(() => expect(click).toHaveBeenCalled())
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:x'))
  })

  it('Löschen entfernt das PDF nach Bestätigung', async () => {
    await setup()
    await upload(pdf('a.pdf'))
    await screen.findByText('a.pdf')
    vi.mocked(confirmAction).mockReturnValueOnce(false)
    await userEvent.click(screen.getByRole('button', { name: 'a.pdf löschen' }))
    expect(await db.pdfs.count()).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: 'a.pdf löschen' }))
    await vi.waitFor(async () => expect(await db.pdfs.count()).toBe(0))
    expect(await screen.findByText('Noch keine Dokumente')).toBeInTheDocument()
  })
})
