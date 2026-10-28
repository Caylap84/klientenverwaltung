/// <reference types="vite-plugin-pwa/client" />
import { notifyUpdateAvailable } from './updateSignal'

// Registers the service worker. No-op when service workers are unavailable
// (file://, some webviews). Called from main.tsx only in production builds.
export async function registerPwa(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  const updateSW = registerSW({
    onNeedRefresh() {
      notifyUpdateAvailable(() => updateSW(true))
    },
  })
}
