import { Link, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'

export const Route = createRootRoute({ component: Layout })

const TABS = [
  { to: '/', label: 'Today', exact: true },
  // Label says Log; the /diary path stays so installed PWAs and old links work.
  { to: '/diary', label: 'Log', exact: false },
  { to: '/settings', label: 'Settings', exact: false },
] as const

function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Full-page screens: no tab bar, they own the whole viewport.
  const bare = pathname.replace(/\/$/, '')
  if (bare.endsWith('/intro') || bare.endsWith('/about')) return <Outlet />

  return (
    <>
      <main>
        <Outlet />
      </main>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: tab.exact }}
              className="tab"
            >
              <span>{tab.label}</span>
              <span className="tab-dot" />
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
