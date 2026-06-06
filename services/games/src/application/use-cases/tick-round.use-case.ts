import { Injectable } from "@nestjs/common";
import { GameEngineState } from "../game-engine.state";

@Injectable()
export class TickRoundUseCase {
  constructor(private readonly state: GameEngineState) {}

  execute(): boolean {
    const round = this.state.requireCurrentRound();

    if (round.phase !== "running") {
      return false;
    }

    this.state.refreshCurrentMultiplier();
    this.state.emit("round.tick", {
      roundId: round.id,
      currentMultiplierBp: round.currentMultiplierBp,
    });
    return round.currentMultiplierBp >= round.crashPointBp;
  }
}
