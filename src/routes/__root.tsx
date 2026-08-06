import { Link, Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({ component: Layout })

function Layout() {
  return (
    <>
      <header className="site-header">
        <span className="site-title">breathing index</span>
        <nav>
          <Link to="/" activeOptions={{ exact: true }}>
            Now
          </Link>
          <Link to="/detail">Detail</Link>
          <Link to="/diary">Diary</Link>
          <Link to="/scoreboard">Scoreboard</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
