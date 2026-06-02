import { createFileRoute } from '@tanstack/react-router'

export function HomePage() {
  return (
    <section className="hero">
      <div className="eyebrow">File-based route</div>
      <h1>Home</h1>
      <p className="lede">
        A nova base do frontend está pronta para crescer com TanStack Router e
        TanStack Start.
      </p>
      <div className="panel">
        <p>
          Esta página vive em <strong>src/routes/index.tsx</strong>.
        </p>
      </div>
    </section>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
