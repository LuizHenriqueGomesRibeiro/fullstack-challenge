import { Module } from "@nestjs/common";
import { GameEngineService } from "./application/game-engine.service";
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
    GameEngineService,
    GamesEventsGateway,
    JwtVerifierService,
    JwtAuthGuard,
  ],
})
export class AppModule {}
