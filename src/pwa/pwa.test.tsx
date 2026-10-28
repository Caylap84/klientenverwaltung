import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UpdateBanner from '../ui/UpdateBanner'
import { dismissUpdate, notifyUpdateAvailable } from './updateSignal'
import { registerPwa } from './registerPwa'

afterEach(() => {
  act(() => dismissUpdate())
  vi.unstubAllGlobals()
})

describe('UpdateBanner', () => {
  it('renders nothing by default', () => {
    const { container } = render(<UpdateBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows after the update signal and hides on "Später"', async () => {
    render(<UpdateBanner />)
    act(() => notifyUpdateAvailable(vi.fn()))
    expect(screen.getByRole('status')).toHaveTextContent('Eine neue Version ist verfügbar.')
    await userEvent.click(screen.getByRole('button', { name: 'Später' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('calls the update function exactly once on "Jetzt aktualisieren"', async () => {
    const update = vi.fn()
    render(<UpdateBanner />)
    act(() => notifyUpdateAvailable(update))
    expect(update).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Jetzt aktualisieren' }))
    expect(update).toHaveBeenCalledTimes(1)
  })
})

describe('registerPwa', () => {
  it('is a no-op without service worker support', async () => {
    vi.stubGlobal('navigator', {})
    await expect(registerPwa()).resolves.toBeUndefined()
  })

  it('is a no-op inside the Tauri webview', async () => {
    const register = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    await expect(registerPwa()).resolves.toBeUndefined()
    expect(register).not.toHaveBeenCalled()
  })
})
