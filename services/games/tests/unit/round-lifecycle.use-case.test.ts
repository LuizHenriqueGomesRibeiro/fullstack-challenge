import { describe, expect, it } from "bun:test";
import { type BetDto } from "@crash/contracts";
import { GameEngineState } from "../../src/application/game-engine.state";
import { CrashRoundUseCase } from "../../src/application/use-cases/crash-round.use-case";
import { CreateRoundUseCase } from "../../src/application/use-cases/create-round.use-case";
import { StartRoundUseCase } from "../../src/application/use-cases/start-round.use-case";
import { TickRoundUseCase } from "../../src/application/use-cases/tick-round.use-case";
import { InMemoryGameRepository } from "../../src/infrastructure/game.repository";

describe("Round lifecycle", () => {
  it("moves through betting, running and crashed states while enforcing invariants", async () => {
    const { state, createRound, startRound, tickRound, crashRound } =
      createHarness();
    const round = await createRound.execute();

    state.currentRound = round;

    expect(round.phase).toBe("betting");
    expect(round.currentMultiplierBp).toBe(100);
    expect(round.serverSeedHash).toHaveLength(64);
    expect(round.hmac).toHaveLength(64);
    expect(tickRound.execute()).toBe(false);
    expect(await startRound.execute()).toBe(true);
    expect(await startRound.execute()).toBe(false);

    round.startedAt = new Date(Date.now() - 10_000).toISOString();
    round.bets.push(
      makeBet(round.id, "player-1", "neo", 1_000, "reserved"),
      makeBet(round.id, "player-2", "trinity", 1_000, "pending"),
      makeBet(round.id, "player-3", "morpheus", 1_000, "rejected"),
    );

    expect(tickRound.execute()).toBe(true);
    expect(round.currentMultiplierBp).toBe(round.crashPointBp);

    await crashRound.execute();

    expect(round.phase).toBe("crashed");
    expect(round.currentMultiplierBp).toBe(round.crashPointBp);
    expect(round.crashedAt).toBeDefined();
    expect(round.bets.map((bet) => bet.status)).toEqual([
      "lost",
      "lost",
      "rejected",
    ]);
    expect(state.getHistory()).toHaveLength(1);
    expect(state.findHistoryRound(round.id)).toMatchObject({
      id: round.id,
      nonce: round.nonce,
      crashPointBp: round.crashPointBp,
      serverSeedHash: round.serverSeedHash,
      serverSeed: round.serverSeed,
      clientSeed: round.clientSeed,
      hmac: round.hmac,
    });

    await crashRound.execute();
    expect(state.getHistory()).toHaveLength(1);
  });
});

function createHarness() {
  const state = new GameEngineState();
  const repository = new InMemoryGameRepository();
  const createRound = new CreateRoundUseCase(state, repository);
  const crashRound = new CrashRoundUseCase(state, repository);
  const startRound = new StartRoundUseCase(state, repository);
  const tickRound = new TickRoundUseCase(state);

  return {
    crashRound,
    createRound,
    repository,
    startRound,
    state,
    tickRound,
  };
}

function makeBet(
  roundId: string,
  playerId: string,
  username: string,
  amountCents: number,
  status: BetDto["status"],
): BetDto {
  return {
    id: `${roundId}:${playerId}`,
    roundId,
    playerId,
    username,
    amountCents,
    status,
    placedAt: new Date(0).toISOString(),
  };
}
