import { describe, expect, it } from "bun:test";
import useUtil from "./index";

describe("useUtil", () => {
  it("parses money strings into integer cents and safely parses JSON", () => {
    const { parseMoneyToCents, safeJson } = useUtil();

    expect(parseMoneyToCents("R$ 10,50")).toBe(1_050);
    expect(parseMoneyToCents(" 0,99 ")).toBe(99);
    expect(parseMoneyToCents("10.5")).toBe(1_050);
    expect(parseMoneyToCents("abc")).toBe(0);
    expect(safeJson("{\"roundId\":\"round-1\"}")).toEqual({
      roundId: "round-1",
    });
    expect(safeJson("not json")).toBeNull();
  });

  it("maps labels and recognises round tick payloads", () => {
    const {
      betStatusLabel,
      eventLabel,
      getErrorMessage,
      isTickPayload,
      phaseLabel,
    } = useUtil();

    expect(phaseLabel("betting")).toBe("Apostas abertas");
    expect(phaseLabel("running")).toBe("Rodada ativa");
    expect(phaseLabel("crashed")).toBe("Crash");
    expect(betStatusLabel("cashed_out")).toBe("cashout");
    expect(betStatusLabel("lost")).toBe("perdeu");
    expect(betStatusLabel("pending")).toBe("pendente");
    expect(betStatusLabel("rejected")).toBe("rejeitada");
    expect(betStatusLabel("reserved")).toBe("ativa");
    expect(eventLabel("round.started")).toBe("round / started");
    expect(isTickPayload({ roundId: "round-1", currentMultiplierBp: 175 })).toBe(
      true,
    );
    expect(isTickPayload({ roundId: "round-1" })).toBe(false);
    expect(
      getErrorMessage({
        response: { data: { message: "saldo insuficiente" } },
      }),
    ).toBe("saldo insuficiente");
    expect(getErrorMessage(new Error("Falhou"))).toBe("Falhou");
  });
});
