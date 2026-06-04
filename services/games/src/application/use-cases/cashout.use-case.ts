import { Inject, Injectable } from "@nestjs/common";
import {
  payoutForMultiplier,
  type BetDto,
  type CashoutResultDto,
  type WalletCommandDto,
} from "@crash/contracts";
import { cashoutUnavailable, walletRejected } from "../../domain/game.errors";
import {
  GAME_REPOSITORY,
  type GameRepository,
} from "../../infrastructure/game.repository";
import { GameEngineState } from "../game-engine.state";
import { ExecuteWalletCommandUseCase } from "./execute-wallet-command.use-case";
import { RoundLifecycleUseCase } from "./round-lifecycle.use-case";

@Injectable()
export class CashoutUseCase {
  constructor(
    private readonly state: GameEngineState,
    private readonly executeWalletCommand: ExecuteWalletCommandUseCase,
    private readonly roundLifecycle: RoundLifecycleUseCase,
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  async execute(playerId: string): Promise<CashoutResultDto> {
    const round = this.state.requireCurrentRound();
    this.state.refreshCurrentMultiplier();

    if (round.phase !== "running" || round.currentMultiplierBp >= round.crashPointBp) {
      if (round.phase === "running") {
        await this.roundLifecycle.crashRound();
      }

      throw cashoutUnavailable();
    }

    const bet = round.bets.find(
      (candidate) => candidate.playerId === playerId && candidate.status === "reserved",
    );

    if (!bet) {
      throw cashoutUnavailable();
    }

    const payoutCents = payoutForMultiplier(bet.amountCents, round.currentMultiplierBp);
    const outcome = await this.executeWalletCommand.execute(
      this.createCreditCommand(bet, payoutCents, round.currentMultiplierBp),
    );

    if (!outcome.accepted) {
      throw walletRejected(outcome.rejectionMessage, outcome.rejectionCode);
    }

    if (bet.status !== "cashed_out") {
      bet.status = "cashed_out";
      bet.cashoutAt = new Date().toISOString();
      bet.cashoutMultiplierBp = round.currentMultiplierBp;
      bet.payoutCents = payoutCents;
      await this.gameRepository.updateBet(bet);
      this.state.emit("bet.cashout", { bet: { ...bet }, wallet: outcome.wallet });
      this.state.emit("wallet.updated", outcome.wallet);
    }

    return { bet: { ...bet }, wallet: outcome.wallet };
  }

  private createCreditCommand(
    bet: BetDto,
    payoutCents: number,
    multiplierBp: number,
  ): WalletCommandDto {
    return {
      idempotencyKey: `cashout:${bet.roundId}:${bet.playerId}`,
      playerId: bet.playerId,
      username: bet.username,
      type: "credit",
      reason: "cashout_payout",
      amountCents: payoutCents,
      correlationId: bet.id,
      metadata: { betId: bet.id, roundId: bet.roundId, multiplierBp },
    };
  }
}
