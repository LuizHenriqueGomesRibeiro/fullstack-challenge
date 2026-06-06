import { Inject, Injectable } from "@nestjs/common";
import {
  isPositiveInteger,
  type BetDto,
  type PlaceBetRequestDto,
  type PlaceBetResultDto,
  type WalletCommandDto,
} from "@crash/contracts";
import { randomUUID } from "node:crypto";
import {
  bettingClosed,
  duplicatedBet,
  invalidBetAmount,
  walletRejected,
} from "../../domain/game.errors";
import {
  GAME_REPOSITORY,
  type GameRepository,
} from "../../infrastructure/game.repository";
import { MAX_BET_CENTS, MIN_BET_CENTS } from "../game-engine.config";
import { GameEngineState } from "../game-engine.state";
import { ExecuteWalletCommandUseCase } from "./execute-wallet-command.use-case";
import { RejectBetUseCase } from "./reject-bet.use-case";

@Injectable()
export class PlaceBetUseCase {
  constructor(
    private readonly state: GameEngineState,
    private readonly executeWalletCommand: ExecuteWalletCommandUseCase,
    private readonly rejectBet: RejectBetUseCase,
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  async execute(
    request: PlaceBetRequestDto,
    playerId: string,
    username: string,
  ): Promise<PlaceBetResultDto> {
    const round = this.state.requireCurrentRound();

    if (round.phase !== "betting") {
      throw bettingClosed();
    }

    if (!isPositiveInteger(request.amountCents) ||
      request.amountCents < MIN_BET_CENTS ||
      request.amountCents > MAX_BET_CENTS) {
      throw invalidBetAmount();
    }

    if (round.bets.some((bet) => bet.playerId === playerId && bet.status !== "rejected")) {
      throw duplicatedBet();
    }

    const bet: BetDto = {
      id: randomUUID(),
      roundId: round.id,
      playerId,
      username: request.username?.trim() || username,
      amountCents: request.amountCents,
      status: "pending",
      placedAt: new Date().toISOString(),
    };

    round.bets.push(bet);
    await this.gameRepository.insertBet(bet);
    const outcome = await this.executeWalletCommand.execute(this.createDebitCommand(bet));

    if (!outcome.accepted) {
      await this.rejectBet.execute(bet, outcome.rejectionCode, outcome.rejectionMessage);
      throw walletRejected(outcome.rejectionMessage, outcome.rejectionCode);
    }

    if (bet.status !== "reserved") {
      bet.status = "reserved";
      await this.gameRepository.updateBet(bet);
      this.state.emit("bet.placed", { bet: { ...bet }, wallet: outcome.wallet });
      this.state.emit("wallet.updated", outcome.wallet);
    }

    return { bet: { ...bet }, wallet: outcome.wallet };
  }

  private createDebitCommand(bet: BetDto): WalletCommandDto {
    return {
      idempotencyKey: `bet:${bet.roundId}:${bet.playerId}`,
      playerId: bet.playerId,
      username: bet.username,
      type: "debit",
      reason: "bet_placed",
      amountCents: bet.amountCents,
      correlationId: bet.id,
      metadata: { betId: bet.id, roundId: bet.roundId },
    };
  }
}
