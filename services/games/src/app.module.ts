import { Module } from "@nestjs/common";
import { GameEngineService } from "./application/game-engine.service";
import { GameEngineState } from "./application/game-engine.state";
import { ApplyWalletOutcomeUseCase } from "./application/use-cases/apply-wallet-outcome.use-case";
import { CashoutUseCase } from "./application/use-cases/cashout.use-case";
import { CrashRoundUseCase } from "./application/use-cases/crash-round.use-case";
import { CreateRoundUseCase } from "./application/use-cases/create-round.use-case";
import { ExecuteWalletCommandUseCase } from "./application/use-cases/execute-wallet-command.use-case";
import { GetBetHistoryUseCase } from "./application/use-cases/get-bet-history.use-case";
import { PlaceBetUseCase } from "./application/use-cases/place-bet.use-case";
import { RejectBetUseCase } from "./application/use-cases/reject-bet.use-case";
import { RoundLifecycleUseCase } from "./application/use-cases/round-lifecycle.use-case";
import { StartRoundUseCase } from "./application/use-cases/start-round.use-case";
import { TickRoundUseCase } from "./application/use-cases/tick-round.use-case";
import { JwtAuthGuard } from "./infrastructure/auth/jwt-auth.guard";
import { JwtVerifierService } from "./infrastructure/auth/jwt-verifier.service";
import {
  GAME_REPOSITORY,
  PostgresGameRepository,
} from "./infrastructure/game.repository";
import { PostgresService } from "./infrastructure/postgres.service";
import { WalletsEventsClient } from "./infrastructure/wallets-events.client";
import { GamesController } from "./presentation/controllers/games.controller";
import { GamesEventsGateway } from "./presentation/gateways/games-events.gateway";

@Module({
  controllers: [GamesController],
  providers: [
    PostgresService,
    {
      provide: GAME_REPOSITORY,
      useClass: PostgresGameRepository,
    },
    WalletsEventsClient,
    GameEngineState,
    ExecuteWalletCommandUseCase,
    RejectBetUseCase,
    CreateRoundUseCase,
    CrashRoundUseCase,
    StartRoundUseCase,
    TickRoundUseCase,
    RoundLifecycleUseCase,
    PlaceBetUseCase,
    CashoutUseCase,
    GetBetHistoryUseCase,
    ApplyWalletOutcomeUseCase,
    GameEngineService,
    GamesEventsGateway,
    JwtVerifierService,
    JwtAuthGuard,
  ],
})
export class AppModule {}
