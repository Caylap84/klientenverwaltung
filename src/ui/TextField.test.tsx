import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TextField from './TextField'

function setup(stored = 'alt', onSave = vi.fn<(v: string) => boolean | void>()) {
  const utils = render(<TextField id="f" label="Feld" stored={stored} onSave={onSave} />)
  const rerender = (s: string) => utils.rerender(<TextField id="f" label="Feld" stored={s} onSave={onSave} />)
  return { ...utils, onSave, rerender, input: screen.getByLabelText('Feld') as HTMLInputElement }
}

describe('TextField', () => {
  it('Tippen, dann Unmount ohne Blur: Eingabe wird gespeichert', () => {
    const { input, onSave, unmount } = setup()
    fireEvent.change(input, { target: { value: 'neu' } })
    expect(onSave).not.toHaveBeenCalled()
    unmount()
    expect(onSave).toHaveBeenCalledExactlyOnceWith('neu')
  })

  it('Blur, dann Unmount: nur ein Schreibvorgang', async () => {
    const { input, onSave, unmount } = setup()
    await userEvent.type(input, 'X')
    await userEvent.tab()
    unmount()
    expect(onSave).toHaveBeenCalledExactlyOnceWith('altX')
  })

  it('Unmount ohne Eingabe schreibt nichts', () => {
    const { onSave, unmount } = setup()
    unmount()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('pagehide speichert die ausstehende Eingabe (einmal)', () => {
    const { input, onSave, unmount } = setup()
    fireEvent.change(input, { target: { value: 'neu' } })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(onSave).toHaveBeenCalledExactlyOnceWith('neu')
    unmount()
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('visibilitychange → hidden speichert, visible nicht', () => {
    const { input, onSave } = setup()
    fireEvent.change(input, { target: { value: 'neu' } })
    const state = vi.spyOn(document, 'visibilityState', 'get')
    state.mockReturnValue('visible')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(onSave).not.toHaveBeenCalled()
    state.mockReturnValue('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(onSave).toHaveBeenCalledExactlyOnceWith('neu')
    state.mockRestore()
  })

  it('fokussiert, aber unberührt: externe Änderung wird beim Blur nicht zurückgeschrieben', async () => {
    const { input, onSave, rerender } = setup('alt')
    await userEvent.click(input)
    rerender('extern')
    expect(input).toHaveValue('alt')
    await userEvent.tab()
    expect(onSave).not.toHaveBeenCalled()
    expect(input).toHaveValue('extern')
  })

  it('fokussiert und bearbeitet: eigene Eingabe gewinnt beim Blur', async () => {
    const { input, onSave, rerender } = setup('alt')
    await userEvent.type(input, '!')
    rerender('extern')
    await userEvent.tab()
    expect(onSave).toHaveBeenCalledExactlyOnceWith('alt!')
  })

  it('nicht fokussiert, aber bearbeitet: ein Re-Sync verwirft die Eingabe nicht, Unmount speichert sie', () => {
    // Regression: Die Eingabe kann vor dem Lauf des [stored]-Effekts eintreffen (unter Last), das Feld
    // ist dann nicht fokussiert. Der Effekt darf die Eingabe nicht zurücksetzen.
    const { input, onSave, rerender, unmount } = setup('alt')
    expect(document.activeElement).not.toBe(input)
    fireEvent.change(input, { target: { value: 'neu' } })
    rerender('alt2')
    expect(input).toHaveValue('neu')
    unmount()
    expect(onSave).toHaveBeenCalledExactlyOnceWith('neu')
  })

  it('onSave liefert false: Anzeige springt auf gespeicherten Wert, Unmount schreibt nicht erneut', async () => {
    const onSave = vi.fn(() => false)
    const { input, unmount } = setup('alt', onSave)
    await userEvent.type(input, 'x')
    await userEvent.tab()
    expect(input).toHaveValue('alt')
    unmount()
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('zurückgetippt auf gespeicherten Wert: kein Schreibvorgang', async () => {
    const { input, onSave, unmount } = setup('alt')
    await userEvent.type(input, 'x{Backspace}')
    await userEvent.tab()
    unmount()
    expect(onSave).not.toHaveBeenCalled()
  })
})
