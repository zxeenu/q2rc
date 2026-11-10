import { Outlet } from 'react-router'
import Navbar from '../components/Navbar.jsx'

export default function RootLayout() {
  return (
    <div className="app">
      <Navbar />
      <main className="container">
        <Outlet />
      </main>
    </div>
  )
}
