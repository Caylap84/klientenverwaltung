import { useSyncExternalStore } from 'react'
import { dismissUpdate, getPendingUpdate, subscribeUpdate } from '../pwa/updateSignal'

export default function UpdateBanner() {
  const update = useSyncExternalStore(subscribeUpdate, getPendingUpdate)
  if (!update) return null
  return (
    <div className="notice update-banner" role="status">
      <p>
        Eine neue Version ist verfügbar. Bitte beende vorher laufende Eingaben.
      </p>
      <div className="update-banner-actions">
        <button type="button" className="primary" onClick={() => void update()}>
          Jetzt aktualisieren
        </button>
        <button type="button" onClick={dismissUpdate}>Später</button>
      </div>
    </div>
  )
}
