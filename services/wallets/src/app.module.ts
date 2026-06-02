import { Module } from "@nestjs/common";
import { WalletsService } from "./application/wallets.service";
import { WalletsController } from "./presentation/controllers/wallets.controller";

@Module({
  controllers: [WalletsController],
  providers: [WalletsService],
})
export class AppModule {}
