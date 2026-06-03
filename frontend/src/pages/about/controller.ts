export default function useAboutPageController() {
  return {
    eyebrow: 'Arquitetura da primeira entrega',
    title: 'Contratos antes de brilho.',
    lede:
      'Esta base separa o ciclo da rodada da fonte da verdade monetaria. A engine de jogo orquestra apostas e crash; wallets registra saldo e ledger idempotente em centavos.',
    cards: [
      {
        title: 'games',
        body:
          'Mantem rodada atual, janela de apostas, cashout, historico, provably fair e eventos SSE para sincronizacao em tempo real.',
      },
      {
        title: 'wallets',
        body:
          'Cria carteira, consulta saldo e processa comandos internos de debito/credito com idempotencia por chave de comando.',
      },
      {
        title: 'contracts',
        body:
          'Centraliza payloads REST, eventos e helpers de dinheiro para manter frontend e backends falando a mesma lingua.',
      },
    ],
  }
}
