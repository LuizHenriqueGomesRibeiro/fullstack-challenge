import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
import TanstackQueryProvider from './packages/core/integrations/tanstack-query/root-provider'
import './styles.css'
import { useAuth } from './packages/core/stores/auth'

const router = getRouter()
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root not found')
}

useAuth().initializeAuthStore();

if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <TanstackQueryProvider>
        <RouterProvider router={router} />
      </TanstackQueryProvider>
    </React.StrictMode>,
  )
}
