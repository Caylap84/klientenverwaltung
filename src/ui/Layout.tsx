import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: '/', label: 'Übersicht', end: true },
  { to: '/klienten', label: 'Klienten', end: false },
  { to: '/sicherung', label: 'Sicherung', end: false },
]

export default function Layout() {
  return (
    <div className="layout">
      <nav className="nav" aria-label="Hauptnavigation">
        <span className="nav-brand">Klientenverwaltung</span>
        <ul>
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.end}>{l.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
