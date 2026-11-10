import { NavLink } from 'react-router'

export default function Navbar() {
  return (
    <header className="navbar">
      <nav className="container">
        <NavLink to="/receive">Receive</NavLink>
        <NavLink to="/send">Send</NavLink>
        <NavLink to="/about">About</NavLink>
      </nav>
    </header>
  )
}
