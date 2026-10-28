import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStoragePersisted, requestPersistentStorage } from './persistence'

const original = Object.getOwnPropertyDescriptor(navigator, 'storage')

function mockStorage(value: unknown) {
  Object.defineProperty(navigator, 'storage', { value, configurable: true })
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'storage', original)
  else delete (navigator as unknown as Record<string, unknown>).storage
})

describe('requestPersistentStorage', () => {
  it('ruft navigator.storage.persist() auf', async () => {
    const persist = vi.fn(async () => true)
    mockStorage({ persist })
    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('No-op ohne API', async () => {
    mockStorage(undefined)
    expect(await requestPersistentStorage()).toBeUndefined()
    mockStorage({})
    expect(await requestPersistentStorage()).toBeUndefined()
  })

  it('Fehler werden geschluckt', async () => {
    mockStorage({ persist: vi.fn(async () => { throw new Error('nein') }) })
    expect(await requestPersistentStorage()).toBeUndefined()
    mockStorage({ persist: vi.fn(() => { throw new Error('sync') }) })
    expect(await requestPersistentStorage()).toBeUndefined()
  })
})

describe('isStoragePersisted', () => {
  it('liefert den Status des Browsers', async () => {
    mockStorage({ persisted: vi.fn(async () => false) })
    expect(await isStoragePersisted()).toBe(false)
    mockStorage({ persisted: vi.fn(async () => true) })
    expect(await isStoragePersisted()).toBe(true)
  })

  it('undefined ohne API oder bei Fehler', async () => {
    mockStorage(undefined)
    expect(await isStoragePersisted()).toBeUndefined()
    mockStorage({ persisted: vi.fn(async () => { throw new Error('x') }) })
    expect(await isStoragePersisted()).toBeUndefined()
  })
})
