import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
import { AuthProvider } from './packages/core/auth/auth-context'
import TanstackQueryProvider from './packages/core/integrations/tanstack-query/root-provider'
import './styles.css'

const router = getRouter()
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root not found')
}

if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AuthProvider>
        <TanstackQueryProvider>
          <RouterProvider router={router} />
        </TanstackQueryProvider>
      </AuthProvider>
    </React.StrictMode>,
  )
}
