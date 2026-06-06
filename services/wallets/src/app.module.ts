import { Module } from "@nestjs/common";
import { WalletsService } from "./application/wallets.service";
import { JwtAuthGuard } from "./infrastructure/auth/jwt-auth.guard";
import { JwtVerifierService } from "./infrastructure/auth/jwt-verifier.service";
import { PostgresService } from "./infrastructure/postgres.service";
import { WalletsRabbitMqService } from "./infrastructure/wallets-rabbitmq.service";
import {
  PostgresWalletsRepository,
  WALLETS_REPOSITORY,
} from "./infrastructure/wallets.repository";
import { WalletsController } from "./presentation/controllers/wallets.controller";

@Module({
  controllers: [WalletsController],
  providers: [
    PostgresService,
    {
      provide: WALLETS_REPOSITORY,
      useClass: PostgresWalletsRepository,
    },
    WalletsService,
    WalletsRabbitMqService,
    JwtVerifierService,
    JwtAuthGuard,
  ],
})
export class AppModule {}
