import type { Meta, StoryObj } from '@storybook/react-vite'

import HomeBetsTable from './index'

const meta = {
  title: 'UI/HomeBetsTable',
  component: HomeBetsTable,
  args: {
    count: 3,
    emptyLabel: 'Nenhuma aposta nesta rodada.',
    bets: [
      {
        id: 'bet-1',
        username: 'luna',
        amountLabel: 'R$ 25,00',
        statusLabel: 'Cashed out',
        statusClassName: 'status-cashed_out',
      },
      {
        id: 'bet-2',
        username: 'marcos',
        amountLabel: 'R$ 80,00',
        statusLabel: 'Lost',
        statusClassName: 'status-lost',
      },
      {
        id: 'bet-3',
        username: 'camila',
        amountLabel: 'R$ 40,00',
        statusLabel: 'Running',
        statusClassName: '',
      },
    ],
  },
} satisfies Meta<typeof HomeBetsTable>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
  args: {
    count: 0,
    bets: [],
  },
}

