import { Link } from '@tanstack/react-router'
import useLoginPageController from './controller'

export default function LoginPage({ returnTo }: { returnTo: string }) {
  const controller = useLoginPageController(returnTo)

  if (controller.auth.status === 'authenticated') {
    return (
      <section className="auth-panel">
        <div className="eyebrow">Sessao ativa</div>
        <h1>Voce ja esta no lobby.</h1>
        <p className="lede">
          A identidade do Keycloak ja esta carregada para suas apostas.
        </p>
        <Link className="primary-action auth-action" to="/">
          Voltar ao jogo
        </Link>
      </section>
    )
  }

  return (
    <section className="auth-panel">
      <div className="eyebrow">Keycloak / Authorization Code + PKCE</div>
      <h1>Redirecionando para login.</h1>
      <p className="lede">
        Vamos abrir o Keycloak, receber o callback OIDC e guardar os tokens
        desta sessao no navegador.
      </p>
      {controller.error ? (
        <div className="notice">{controller.error}</div>
      ) : null}
      <button
        className="primary-action auth-action"
        onClick={controller.retryLogin}
        type="button"
      >
        Tentar novamente
      </button>
    </section>
  )
}
