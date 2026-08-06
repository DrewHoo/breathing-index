import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({ component: Settings })

function Settings() {
  return (
    <section className="stub">
      <h1>Settings</h1>
      <p>Sources + API keys, saved locations, diary/conflict review — M5.</p>
    </section>
  )
}
