import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './ui/App.tsx'
import { requestPersistentStorage } from './storage/persistence'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

// Nicht abwarten: darf das Rendern nie blockieren.
void requestPersistentStorage()

if (import.meta.env.PROD) {
  void import('./pwa/registerPwa').then((m) => m.registerPwa())
}
