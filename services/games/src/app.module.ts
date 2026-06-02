import { Module } from "@nestjs/common";
import { GameEngineService } from "./application/game-engine.service";
import { WalletsHttpClient } from "./infrastructure/wallets-http.client";
import { GamesController } from "./presentation/controllers/games.controller";

@Module({
  controllers: [GamesController],
  providers: [GameEngineService, WalletsHttpClient],
})
export class AppModule {}
