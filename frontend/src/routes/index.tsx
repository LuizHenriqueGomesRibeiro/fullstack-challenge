import { Link, createFileRoute } from '@tanstack/react-router';
import { useAuth } from '../packages/core/hooks/auth';
import { HomePage } from 'src/packages/ui/pages';

export const Route = createFileRoute('/')({
  component: () => {
    const auth = useAuth();
    const player = auth.player;

    if (auth.status !== 'authenticated' || !player) {
      return <section className="auth-panel">
        <div className="eyebrow">Login OIDC / Keycloak</div>
        <h1>Entre para jogar multiplayer.</h1>
        <p className="lede">
          Cada sessao usa o usuario autenticado no Keycloak para criar carteira,
          apostar e fazer cashout com identidade propria.
        </p>
        <Link className="primary-action auth-action" search={{ returnTo: '/' }} to="/login">
          Entrar com Keycloak
        </Link>
      </section>
    }

    return <HomePage player={player}/>
  }
});