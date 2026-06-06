import type { Meta, StoryObj } from '@storybook/react-vite'

import HomeHistoryCard from './index'

const meta = {
  title: 'UI/HomeHistoryCard',
  component: HomeHistoryCard,
  args: {
    count: 6,
    emptyLabel: 'Sem histórico por enquanto.',
    items: [
      {
        id: 'history-1',
        label: '1.24x',
        title: 'Rodada curta e segura',
        toneClassName: 'history-hot',
      },
      {
        id: 'history-2',
        label: '2.87x',
        title: 'Rodada acima da média',
        toneClassName: 'history-hot',
      },
      {
        id: 'history-3',
        label: '0.91x',
        title: 'Crash cedo',
        toneClassName: 'history-cold',
      },
    ],
  },
} satisfies Meta<typeof HomeHistoryCard>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
  args: {
    count: 0,
    items: [],
  },
}

