import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/diary')({ component: Diary })

function Diary() {
  return (
    <section className="stub">
      <h1>Diary</h1>
      <p>
        One-tap "how's breathing?" entries land here in M3 — each rating is captured with the full
        exposure vector and feeds the trigger model.
      </p>
    </section>
  )
}
