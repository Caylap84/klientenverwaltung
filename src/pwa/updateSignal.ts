// Small store connecting the service-worker registration (production only)
// with the UpdateBanner, so the banner is testable without service workers.
type Update = () => void | Promise<void>

let pending: Update | null = null
const listeners = new Set<() => void>()

export function notifyUpdateAvailable(update: Update): void {
  pending = update
  listeners.forEach((l) => l())
}

export function dismissUpdate(): void {
  pending = null
  listeners.forEach((l) => l())
}

export function subscribeUpdate(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getPendingUpdate(): Update | null {
  return pending
}
