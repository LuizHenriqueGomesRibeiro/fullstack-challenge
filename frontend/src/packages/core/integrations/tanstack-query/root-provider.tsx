import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { PropsWithChildren } from 'react'

let queryClient: QueryClient | undefined

export function getQueryClient() {
  queryClient ??= new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 750,
      },
    },
  })

  return queryClient
}

export function getContext() {
  return {
    queryClient: getQueryClient(),
  }
}

export default function TanstackQueryProvider({
  children,
}: PropsWithChildren) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
