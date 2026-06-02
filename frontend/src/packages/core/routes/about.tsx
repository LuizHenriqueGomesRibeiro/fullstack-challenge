import { createFileRoute } from '@tanstack/react-router'

export function AboutPage() {
  return (
    <section className="hero">
      <div className="eyebrow">File-based route</div>
      <h1>About</h1>
      <p className="lede">
        This route demonstrates the expected /about page structure in
        TanStack Start.
      </p>
      <div className="panel">
        <p>
          A partir daqui, podemos adicionar loaders, search params e server
          functions.
        </p>
      </div>
    </section>
  )
}

export const Route = createFileRoute('/about')({
  component: AboutPage,
})
