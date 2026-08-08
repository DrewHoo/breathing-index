import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './fonts.css'
import './styles.css'
import './ui/analytics'

const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL })

/**
 * A tab open across a deploy asks for lazy chunks that no longer exist, and the
 * route it was navigating to never renders. Reload into the new build instead —
 * once per tab, since a chunk that 404s for any other reason would otherwise
 * reload forever.
 */
const RELOADED_KEY = 'breathing-index.chunkReload'
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return
    sessionStorage.setItem(RELOADED_KEY, '1')
  } catch {
    // No sessionStorage means no way to count the reload, so don't start one.
    return
  }
  event.preventDefault()
  window.location.reload()
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
