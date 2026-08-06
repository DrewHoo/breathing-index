import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/detail')({ component: Detail })

function Detail() {
  return (
    <section className="stub">
      <h1>Detail</h1>
      <p>48h per-variable sparklines land here (M2 follow-up): "walk now or at 7pm?"</p>
    </section>
  )
}
