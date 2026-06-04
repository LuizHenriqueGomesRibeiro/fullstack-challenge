import { Inject, Injectable } from "@nestjs/common";
import { type WalletCommandOutcomeDto, type WalletDto } from "@crash/contracts";
import {
  GAME_REPOSITORY,
  type GameRepository,
} from "../../infrastructure/game.repository";
import { GameEngineState } from "../game-engine.state";
import { RejectBetUseCase } from "./reject-bet.use-case";

@Injectable()
export class ApplyWalletOutcomeUseCase {
  constructor(
    private readonly state: GameEngineState,
    private readonly rejectBet: RejectBetUseCase,
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  async execute(outcome: WalletCommandOutcomeDto): Promise<void> {
    const metadata = outcome.accepted ? outcome.ledgerEntry.metadata : outcome.metadata;
    const betId = typeof metadata.betId === "string" ? metadata.betId : undefined;

    if (!betId) {
      return;
    }

    const bet = this.state.findLoadedBet(betId) ?? (await this.gameRepository.findBet(betId));

    if (!bet) {
      return;
    }

    if (!outcome.accepted) {
      if (bet.status === "pending") {
        await this.rejectBet.execute(bet, outcome.rejectionCode, outcome.rejectionMessage);
      }

      return;
    }

    if (outcome.ledgerEntry.reason === "bet_placed" && bet.status === "pending") {
      bet.status = "reserved";
      await this.saveAcceptedBet(bet, "bet.placed", outcome.wallet);
      return;
    }

    if (outcome.ledgerEntry.reason === "cashout_payout" && bet.status === "reserved") {
      bet.status = "cashed_out";
      bet.cashoutAt = new Date().toISOString();
      bet.cashoutMultiplierBp = this.readMultiplier(metadata);
      bet.payoutCents = outcome.ledgerEntry.amountCents;
      await this.saveAcceptedBet(bet, "bet.cashout", outcome.wallet);
    }
  }

  private async saveAcceptedBet(
    bet: NonNullable<Awaited<ReturnType<GameRepository["findBet"]>>>,
    eventType: "bet.placed" | "bet.cashout",
    wallet: WalletDto,
  ): Promise<void> {
    await this.gameRepository.updateBet(bet);
    this.state.replaceLoadedBet(bet);
    this.state.emit(eventType, { bet: { ...bet }, wallet });
    this.state.emit("wallet.updated", wallet);
  }

  private readMultiplier(metadata: Record<string, unknown>): number {
    return typeof metadata.multiplierBp === "number"
      ? metadata.multiplierBp
      : this.state.requireCurrentRound().currentMultiplierBp;
  }
}
