import type { Meta, StoryObj } from '@storybook/react-vite'

import HomeHeroBoard from './index'

const meta = {
  title: 'UI/HomeHeroBoard',
  component: HomeHeroBoard,
  args: {
    multiplierLabel: '2.48x',
    multiplierBp: 248,
    phase: 'running',
    phaseLabel: 'Rodada em andamento',
    countdownLabel: '00:14',
    crashPointLabel: '3.91x',
    serverSeedHashLabel: 'a1b2c3d4e5f67890abcdef1234567890',
    graphProgress: 0.52,
  },
} satisfies Meta<typeof HomeHeroBoard>

export default meta

type Story = StoryObj<typeof meta>

export const Running: Story = {}

export const Betting: Story = {
  args: {
    multiplierLabel: '1.00x',
    multiplierBp: 100,
    phase: 'betting',
    phaseLabel: 'Aguardando apostas',
    countdownLabel: '00:07',
    crashPointLabel: '2.14x',
    graphProgress: 0.12,
  },
}

export const Crashed: Story = {
  args: {
    multiplierLabel: '3.72x',
    multiplierBp: 372,
    phase: 'crashed',
    phaseLabel: 'Crash ocorrido',
    countdownLabel: 'CRASH',
    crashPointLabel: '3.72x',
    graphProgress: 1,
  },
}
