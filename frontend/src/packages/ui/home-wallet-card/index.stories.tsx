import type { Meta, StoryObj } from '@storybook/react-vite'

import HomeWalletCard from './index'

const meta = {
  title: 'UI/HomeWalletCard',
  component: HomeWalletCard,
  args: {
    playerName: 'Luna Ferreira',
    playerId: 'ID-24819',
    balanceLabel: 'R$ 1.248,00',
  },
} satisfies Meta<typeof HomeWalletCard>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

