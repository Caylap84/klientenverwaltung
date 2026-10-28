import { Link, Route, Routes } from 'react-router-dom'
import Layout from './Layout'
import ClientListPage from './pages/ClientListPage'
import ClientPage from './pages/ClientPage'
import BackupPage from './pages/BackupPage'
import OverviewPage from './pages/OverviewPage'
import './ui.css'

function NotFound() {
  return (
    <section>
      <h1>Seite nicht gefunden</h1>
      <p><Link to="/">Zur Übersicht</Link></p>
    </section>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="klienten" element={<ClientListPage />} />
        <Route path="klienten/:id" element={<ClientPage />} />
        <Route path="sicherung" element={<BackupPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
