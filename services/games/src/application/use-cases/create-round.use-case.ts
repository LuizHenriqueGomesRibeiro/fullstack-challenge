import { Inject, Injectable } from "@nestjs/common";
import { createProvablyFairRound } from "../../domain/provably-fair";
import {
  GAME_REPOSITORY,
  type GameRepository,
  type RoundRecord,
} from "../../infrastructure/game.repository";
import { GameEngineState } from "../game-engine.state";

@Injectable()
export class CreateRoundUseCase {
  constructor(
    private readonly state: GameEngineState,
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  async execute(): Promise<RoundRecord> {
    const fairRound = createProvablyFairRound(
      this.state.clientSeed,
      ++this.state.nonce,
    );
    const now = Date.now();
    const round: RoundRecord = {
      id: `round-${fairRound.nonce}-${now}`,
      nonce: fairRound.nonce,
      phase: "betting",
      currentMultiplierBp: 100,
      crashPointBp: fairRound.crashPointBp,
      bettingEndsAt: new Date(now + this.state.bettingWindowMs).toISOString(),
      serverSeedHash: fairRound.serverSeedHash,
      serverSeed: fairRound.serverSeed,
      clientSeed: fairRound.clientSeed,
      hmac: fairRound.hmac,
      bets: [],
    };

    await this.gameRepository.saveRound(round);
    this.state.emit("round.created", this.state.toRoundDto(round));
    return round;
  }
}
