import { createFileRoute } from '@tanstack/react-router'

export function AboutPage() {
  return (
    <section className="about-page">
      <div className="eyebrow">Arquitetura da primeira entrega</div>
      <h1>Contratos antes de brilho.</h1>
      <p className="lede">
        Esta base separa o ciclo da rodada da fonte da verdade monetaria. A
        engine de jogo orquestra apostas e crash; wallets registra saldo e
        ledger idempotente em centavos.
      </p>

      <div className="architecture-grid">
        <article>
          <span>games</span>
          <p>
            Mantem rodada atual, janela de apostas, cashout, historico,
            provably fair e eventos SSE para sincronizacao em tempo real.
          </p>
        </article>
        <article>
          <span>wallets</span>
          <p>
            Cria carteira, consulta saldo e processa comandos internos de
            debito/credito com idempotencia por chave de comando.
          </p>
        </article>
        <article>
          <span>contracts</span>
          <p>
            Centraliza payloads REST, eventos e helpers de dinheiro para
            manter frontend e backends falando a mesma lingua.
          </p>
        </article>
      </div>
    </section>
  )
}

export const Route = createFileRoute('/about')({
  component: AboutPage,
})
