import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../packages/core/hooks/auth'
import { useUtil } from '../packages/core/hooks'

export function AuthCallbackPage() {
  const auth = useAuth()
  const { getErrorMessage } = useUtil()
  const handledCallback = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (handledCallback.current) {
      return
    }

    handledCallback.current = true

    void auth
      .completeLogin()
      .then((returnTo) => window.location.replace(returnTo))
      .catch((callbackError: unknown) => {
        setError(getErrorMessage(callbackError))
      })
  }, [auth, getErrorMessage])

  return (
    <section className="auth-panel">
      <div className="eyebrow">Callback OIDC</div>
      <h1>{error ? 'Login nao concluido.' : 'Finalizando autenticacao.'}</h1>
      <p className="lede">
        {error
          ? 'O callback chegou, mas nao conseguimos validar a troca de tokens.'
          : 'Validando state, trocando code por tokens e preparando o lobby.'}
      </p>
      {error ? (
        <>
          <div className="notice">{error}</div>
          <Link
            className="primary-action auth-action"
            search={{ returnTo: '/' }}
            to="/login"
          >
            Entrar novamente
          </Link>
        </>
      ) : null}
    </section>
  )
}

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})
