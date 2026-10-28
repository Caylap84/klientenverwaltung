import { Route, Routes } from 'react-router-dom'
import Layout from './Layout'
import ClientListPage from './pages/ClientListPage'
import ClientPage from './pages/ClientPage'
import BackupPage from './pages/BackupPage'
import OverviewPage from './pages/OverviewPage'
import './ui.css'

function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>Folgt.</p>
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
        <Route path="*" element={<Placeholder title="Seite nicht gefunden" />} />
      </Route>
    </Routes>
  )
}
