import { Link } from '@tanstack/react-router'
import useAuthCallbackPageController from './controller'

export default function AuthCallbackPage() {
  const controller = useAuthCallbackPageController()

  return (
    <section className="auth-panel">
      <div className="eyebrow">Callback OIDC</div>
      <h1>{controller.error ? 'Login nao concluido.' : 'Finalizando autenticacao.'}</h1>
      <p className="lede">
        {controller.error
          ? 'O callback chegou, mas nao conseguimos validar a troca de tokens.'
          : 'Validando state, trocando code por tokens e preparando o lobby.'}
      </p>
      {controller.error ? (
        <>
          <div className="notice">{controller.error}</div>
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
