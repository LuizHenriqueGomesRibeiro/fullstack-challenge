import type { Meta, StoryObj } from '@storybook/react-vite'

import HomeTelemetryCard from './index'

const meta = {
  title: 'UI/HomeTelemetryCard',
  component: HomeTelemetryCard,
  args: {
    betsSavedCount: 18,
    limitsLabel: 'R$ 10,00 - R$ 1.000,00',
    roundIdLabel: 'round-2026-06-04-001',
    sequence: 42,
    streamLabel: 'ws://localhost:3000/games',
  },
} satisfies Meta<typeof HomeTelemetryCard>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

