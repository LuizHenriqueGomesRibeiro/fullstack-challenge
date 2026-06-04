import type { Meta, StoryObj } from '@storybook/react-vite'

import HomeBetCard from './index'

const meta = {
  title: 'UI/HomeBetCard',
  component: HomeBetCard,
  args: {
    betAmount: '50',
    canPlaceBet: true,
    canCashout: false,
    cashoutLabel: 'Cashout',
    isInputDisabled: false,
    isPlaceBetPending: false,
    isCashoutPending: false,
    notice: null,
    reservationMessage: 'Pronto para reservar a aposta.',
    onBetAmountChange: () => {},
    onPlaceBet: () => {},
    onCashout: () => {},
  },
} satisfies Meta<typeof HomeBetCard>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ActiveRound: Story = {
  args: {
    canCashout: true,
    cashoutLabel: 'Sacando 1.84x',
    reservationMessage: 'A aposta está ativa e já pode ser encerrada.',
  },
}

export const WithNotice: Story = {
  args: {
    notice: 'Saldo insuficiente para reservar essa aposta.',
    canPlaceBet: false,
  },
}

