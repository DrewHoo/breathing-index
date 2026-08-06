import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/scoreboard')({ component: Scoreboard })

function Scoreboard() {
  return (
    <section className="stub">
      <h1>Scoreboard</h1>
      <p>
        The receipts: official composite indices (US AQI / EAQI / LKI) vs your logged Breathing
        Index, retrospectively. The only place those indices appear. Lands with M3's diary.
      </p>
    </section>
  )
}
