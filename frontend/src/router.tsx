import { createRouter } from '@tanstack/react-router'
import { getContext } from './packages/core/integrations/tanstack-query/root-provider'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    context: getContext(),
    defaultPreload: 'intent',
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
