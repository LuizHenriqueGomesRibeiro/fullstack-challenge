import { RealtimeEventType } from "@crash/contracts";
import { QueryClient } from "@tanstack/react-query";

export default function useUtil() {
  async function invalidateGameQueries(queryClient: QueryClient, playerId: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wallet', playerId] }),
      queryClient.invalidateQueries({ queryKey: ['round', 'current'] }),
      queryClient.invalidateQueries({ queryKey: ['rounds', 'history'] }),
      queryClient.invalidateQueries({ queryKey: ['bets', playerId] }),
    ])
  }

  function parseMoneyToCents(value: string): number {
    const sanitized = value.trim().replace(/[^\d,.]/g, '').replace(',', '.')
    const [wholeRaw, centsRaw = ''] = sanitized.split('.')
    const whole = wholeRaw ? Number(wholeRaw) : 0
    const cents = Number(centsRaw.padEnd(2, '0').slice(0, 2))

    if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(cents)) {
      return 0
    }

    return whole * 100 + cents
  }

  function isTickPayload(
    payload: unknown,
  ): payload is { roundId: string; currentMultiplierBp: number } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'currentMultiplierBp' in payload &&
      typeof payload.currentMultiplierBp === 'number'
    )
  }

  function getErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const response = error.response as { data?: { message?: string } } | undefined
      if (response?.data?.message) {
        return response.data.message
      }
    }

    return error instanceof Error ? error.message : 'Operacao nao concluida.'
  }

  function safeJson(value: string): unknown {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  function phaseLabel(phase: string): string {
    if (phase === 'betting') {
      return 'Apostas abertas'
    }
  
    if (phase === 'running') {
      return 'Rodada ativa'
    }
  
    return 'Crash'
  }
  
  function betStatusLabel(status: string): string {
    if (status === 'cashed_out') {
      return 'cashout'
    }
  
    if (status === 'lost') {
      return 'perdeu'
    }

    if (status === 'pending') {
      return 'pendente'
    }

    if (status === 'rejected') {
      return 'rejeitada'
    }
  
    return 'ativa'
  }
  
  function eventLabel(type: RealtimeEventType): string {
    return type.replace('.', ' / ')
  }

  return {
    invalidateGameQueries,
    parseMoneyToCents,
    getErrorMessage,
    betStatusLabel,
    isTickPayload,
    eventLabel,
    phaseLabel,
    safeJson
  }
}
