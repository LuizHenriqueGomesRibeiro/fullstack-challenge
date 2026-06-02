import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../packages/core/hooks/auth'
import { useUtil } from 'src/packages/core/hooks';

interface LoginSearch {
  returnTo: string
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
  validateSearch: (search): LoginSearch => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : '/',
  }),
});

export function LoginPage() {
  const auth = useAuth();
  const { getErrorMessage } = useUtil();
  const search = Route.useSearch();
  const startedLogin = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === 'authenticated' || startedLogin.current) {
      return
    }

    startedLogin.current = true

    void auth.login(search.returnTo).catch((loginError: unknown) => {
      startedLogin.current = false
      setError(getErrorMessage(loginError))
    })
  }, [auth, search.returnTo]);

  if (auth.status === 'authenticated') {
    return <section className="auth-panel">
      <div className="eyebrow">Sessao ativa</div>
      <h1>Voce ja esta no lobby.</h1>
      <p className="lede">
        A identidade do Keycloak ja esta carregada para suas apostas.
      </p>
      <Link className="primary-action auth-action" to="/">
        Voltar ao jogo
      </Link>
    </section>
  }

  return <section className="auth-panel">
    <div className="eyebrow">Keycloak / Authorization Code + PKCE</div>
    <h1>Redirecionando para login.</h1>
    <p className="lede">
      Vamos abrir o Keycloak, receber o callback OIDC e guardar os tokens
      desta sessao no navegador.
    </p>
    {error ? <div className="notice">{error}</div> : null}
    <button
      className="primary-action auth-action"
      onClick={() => void auth.login(search.returnTo)}
      type="button"
    >
      Tentar novamente
    </button>
  </section>
}