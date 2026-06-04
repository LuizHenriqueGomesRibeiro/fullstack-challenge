import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'

import AuthGate from './index'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: AuthGate,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => <div>Login</div>,
})

const routeTree = rootRoute.addChildren([indexRoute, loginRoute])

const router = createRouter({
  routeTree,
  history: createMemoryHistory({
    initialEntries: ['/'],
  }),
})

const meta = {
  title: 'UI/AuthGate',
  component: AuthGate,
  render: () => <RouterProvider router={router} />,
} satisfies Meta<typeof AuthGate>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
