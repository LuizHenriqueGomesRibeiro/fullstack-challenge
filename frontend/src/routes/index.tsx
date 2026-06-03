import { Link, createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../packages/core/hooks/auth';
import { useSocketInstance } from 'src/packages/core/stores';
import { HomePage } from 'src/packages/ui/pages';

export const Route = createFileRoute('/')({
  pendingComponent: () => <>Carregando jogo</>,
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

    const queryClient = useQueryClient();
    useSocketInstance().connect(player, queryClient);

    return <HomePage player={player}/>
  }
});