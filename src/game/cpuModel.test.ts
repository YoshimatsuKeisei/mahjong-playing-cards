import { afterEach, describe, expect, it, vi } from "vitest";
import type { Card, GameState, Player } from "../types";
import { cpuModels, getCpuModel } from "./cpuModelRegistry";
import { createCpuDecisionContext } from "./cpuTypes";
import { easyChooseCpuCall, easyChooseCpuDiscardCard, easyChooseDaifugoEffectActivation, easyChooseReachDeclaration } from "./easyCpu";
import { getTacticalDiscardScores, tacticalChooseCpuCall, tacticalChooseCpuDiscardCard } from "./tacticalCpu";
import { createDefaultDaifugoOptions } from "./deck";
import { chooseCpuQueenRank } from "./gameState";
import { standardChooseCpuDiscardCard } from "./standardCpu";

function card(id: string, rank: number, suit: Card["suit"] = "S"): Card {
  return { id, rank, suit };
}

function player(index: number, hand: Card[], discardPile: Card[] = [], openMelds: Card[][] = []): Player {
  return {
    id: `player-${index}`,
    name: `プレイヤー${index}`,
    type: index === 2 ? "cpu" : "human",
    isCpu: index === 2,
    cpuModelId: index === 2 ? "tactical" : undefined,
    hand,
    discardPile,
    openMelds,
    hasCalled: openMelds.length > 0,
    isReach: false,
  };
}

function state(players: Player[], currentPlayerIndex = 1): GameState {
  return {
    players,
    deck: [card("deck-1", 1)],
    currentPlayerIndex,
    direction: "clockwise",
    daifugoOptions: createDefaultDaifugoOptions(),
    pendingDaifugoEffect: null,
    isJBackActive: false,
    phase: "draw",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: currentPlayerIndex - 1,
    takenDiscardOwnerIndex: null,
    winner: null,
    result: null,
    pendingRonResult: null,
    showCpuActions: true,
    declaredReachThisTurn: false,
    message: "",
  };
}

describe("CPU models", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers easy, standard, tactical, and master models", () => {
    expect(cpuModels.easy.name).toBe("Easy CPU");
    expect(cpuModels.standard.name).toBe("Standard CPU");
    expect(cpuModels.tactical.name).toBe("Tactical CPU");
    expect(cpuModels.master.name).toBe("Master CPU");
    expect(getCpuModel("easy").id).toBe("easy");
    expect(getCpuModel("standard").id).toBe("standard");
    expect(getCpuModel("tactical").id).toBe("tactical");
    expect(getCpuModel("master").id).toBe("master");
  });

  it("master inherits tactical discard behavior", () => {
    const gameState = state([player(1, []), player(2, [card("8s", 8), card("10h", 10, "H")]), player(3, [])]);
    gameState.players[1] = { ...gameState.players[1], cpuModelId: "master" };
    gameState.phase = "discard";
    const context = createCpuDecisionContext(gameState)!;

    expect(cpuModels.master.chooseDiscardCard(context)?.id).toBe(cpuModels.tactical.chooseDiscardCard(context)?.id);
  });

  it("easy CPU uses daifugo effects only at a modest random rate", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.24);
    expect(easyChooseDaifugoEffectActivation()).toBe(true);

    vi.spyOn(Math, "random").mockReturnValue(0.25);
    expect(easyChooseDaifugoEffectActivation()).toBe(false);
  });

  it("standard and tactical CPUs explicitly activate available daifugo effects", () => {
    const gameState = state([player(1, []), player(2, [card("5s", 5, "S")]), player(3, [])]);
    const context = createCpuDecisionContext(gameState)!;

    expect(cpuModels.standard.chooseDaifugoEffectActivation?.(context, "fiveSkip")).toBe(true);
    expect(cpuModels.tactical.chooseDaifugoEffectActivation?.(context, "queenNumberVanish")).toBe(true);
  });

  it("standard and tactical CPUs declare reach when the reducer has confirmed it is legal", () => {
    const gameState = {
      ...state([player(1, []), player(2, [card("5s", 5, "S")]), player(3, [])]),
      phase: "reachConfirm" as const,
    };
    const context = createCpuDecisionContext(gameState)!;

    expect(cpuModels.standard.chooseReachDeclaration?.(context)).toBe(true);
    expect(cpuModels.tactical.chooseReachDeclaration?.(context)).toBe(true);
  });

  it("standard CPU does not declare reach after calling", () => {
    const gameState = {
      ...state([player(1, []), player(2, [card("5s", 5, "S")], [], [[card("m-3s", 3), card("m-3h", 3, "H"), card("m-3d", 3, "D")]]), player(3, [])]),
      phase: "reachConfirm" as const,
    };
    const context = createCpuDecisionContext(gameState)!;

    expect(cpuModels.standard.chooseReachDeclaration?.(context)).toBe(false);
  });

  it("CPU queen rank fallback excludes ranks already vanished by Q", () => {
    const gameState = {
      ...state([
        player(1, [card("other-5s", 5, "S")]),
        player(2, [card("cpu-13s", 13, "S")]),
        player(3, [card("other-13h", 13, "H"), card("other-13d", 13, "D")]),
      ]),
      queenVanishedRanks: [13],
      deck: [card("deck-13c", 13, "C"), card("deck-5c", 5, "C")],
    };

    expect(chooseCpuQueenRank(gameState, 1)).not.toBe(13);
  });

  it("easy daifugo card choice prefers loose cards before pairs or meld cards", () => {
    const hand = [card("3s", 3, "S"), card("3h", 3, "H"), card("3d", 3, "D"), card("9c", 9, "C"), card("12d", 12, "D")];
    const gameState = state([player(1, []), player(2, hand), player(3, [])]);
    const context = createCpuDecisionContext(gameState)!;

    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(cpuModels.easy.chooseDaifugoSevenExchangeCard?.(context, hand, "initiator")?.id).toBe("9c");
  });

  it("standard daifugo card choice uses the standard discard value within legal candidates", () => {
    const hand = [card("3s", 3, "S"), card("3h", 3, "H"), card("3d", 3, "D"), card("9c", 9, "C"), card("13h", 13, "H")];
    const gameState = state([player(1, []), player(2, hand), player(3, [])]);
    const context = createCpuDecisionContext(gameState)!;

    expect(cpuModels.standard.chooseDaifugoSevenExchangeCard?.(context, [hand[0], hand[4]], "target")?.id).toBe("13h");
    expect(cpuModels.standard.chooseDaifugoExtraDiscard?.(context, "tenSwapDraw", [hand[0], hand[4]])?.id).toBe("13h");
  });

  function tacticalSevenContext(hand: Card[], target: Player): ReturnType<typeof createCpuDecisionContext> {
    const gameState = {
      ...state([player(1, []), player(2, hand), target]),
      pendingDaifugoEffect: {
        kind: "sevenExchange" as const,
        effect: "sevenExchange" as const,
        playerIndex: 1,
        targetPlayerIndex: 2,
        selections: {},
        continue: { shouldConfirmReach: false },
      },
    };
    return createCpuDecisionContext(gameState);
  }

  it("tactical 7 gives a reach target a loose rank already visible in its discards", () => {
    const hand = [card("4s", 4), card("13h", 13, "H")];
    const target = { ...player(3, [card("hidden", 9)]), isReach: true, discardPile: [card("discard-4", 4)] };
    const context = tacticalSevenContext(hand, target)!;

    expect(cpuModels.tactical.chooseDaifugoSevenExchangeCard?.(context, hand, "initiator")?.id).toBe("4s");
  });

  it("tactical 7 gives a two-call target a loose rank already visible in its discards", () => {
    const hand = [card("5s", 5), card("13h", 13, "H")];
    const target = {
      ...player(3, [card("hidden", 9)], [card("discard-5", 5)]),
      openMelds: [[card("meld-2a", 2)], [card("meld-3a", 3)]],
    };
    const context = tacticalSevenContext(hand, target)!;

    expect(cpuModels.tactical.chooseDaifugoSevenExchangeCard?.(context, hand, "initiator")?.id).toBe("5s");
  });

  it("tactical 7 can use a public called rank when the target has no matching discard", () => {
    const hand = [card("6s", 6), card("13h", 13, "H")];
    const target = {
      ...player(3, [card("hidden", 9)]),
      openMelds: [[card("meld-6a", 6)], [card("meld-3a", 3)]],
    };
    const context = tacticalSevenContext(hand, target)!;

    expect(cpuModels.tactical.chooseDaifugoSevenExchangeCard?.(context, hand, "initiator")?.id).toBe("6s");
  });

  it("tactical 7 does not break its own meld to match a threat target public rank", () => {
    const hand = [card("3s", 3), card("3h", 3, "H"), card("3d", 3, "D"), card("13c", 13, "C")];
    const target = { ...player(3, [card("hidden", 9)]), isReach: true, discardPile: [card("discard-3", 3)] };
    const context = tacticalSevenContext(hand, target)!;

    expect(cpuModels.tactical.chooseDaifugoSevenExchangeCard?.(context, hand, "initiator")?.id).toBe("13c");
  });

  it("tactical 7 keeps the existing fallback without a useful public rank or threat target", () => {
    const hand = [card("4s", 4), card("13h", 13, "H")];
    const threat = { ...player(3, [card("hidden", 4)]), isReach: true, discardPile: [card("discard-2", 2)] };
    const normal = { ...player(3, [card("hidden", 4)]), discardPile: [card("discard-4", 4)] };

    expect(cpuModels.tactical.chooseDaifugoSevenExchangeCard?.(tacticalSevenContext(hand, threat)!, hand, "initiator")?.id).toBe("13h");
    expect(cpuModels.tactical.chooseDaifugoSevenExchangeCard?.(tacticalSevenContext(hand, normal)!, hand, "initiator")?.id).toBe("13h");
  });

  it("standard queen choice avoids ranks that are part of completed melds when possible", () => {
    const hand = [card("13s", 13, "S"), card("13h", 13, "H"), card("13d", 13, "D"), card("5c", 5, "C")];
    const gameState = state([player(1, []), player(2, hand), player(3, [])]);
    const context = createCpuDecisionContext(gameState)!;

    expect(cpuModels.standard.chooseQueenVanishRank?.(context, [13, 5])).toBe(5);
  });

  function tacticalQueenContext(
    hand: Card[],
    players: Player[],
    responseMode?: "reach" | "twoCall",
    targetPlayerIndex?: number,
  ): ReturnType<typeof createCpuDecisionContext> {
    const gameState = {
      ...state(players),
      daifugoOptions: { ...createDefaultDaifugoOptions(), enabled: true },
      pendingDaifugoEffect: {
        kind: "queenSelect" as const,
        effect: "queenNumberVanish" as const,
        playerIndex: 1,
        continue: { shouldConfirmReach: false },
        cpuThreatResponseMode: responseMode,
        cpuThreatTargetPlayerIndex: targetPlayerIndex,
      },
    };
    gameState.players[1] = { ...gameState.players[1], hand };
    return createCpuDecisionContext(gameState);
  }

  it("tactical Q avoids a reach target public discard rank", () => {
    const hand = [card("6s", 6)];
    const target = { ...player(3, [card("hidden-6", 6)]), isReach: true, discardPile: [card("discard-4", 4)] };
    const context = tacticalQueenContext(hand, [player(1, []), player(2, hand), target], "reach", 2)!;

    expect(cpuModels.tactical.chooseQueenVanishRank?.(context, [4, 6])).toBe(6);
  });

  it("tactical Q avoids a two-call target public discard and called ranks", () => {
    const hand = [card("6s", 6)];
    const target = {
      ...player(3, [card("hidden-6", 6)], [card("discard-4", 4)]),
      openMelds: [[card("meld-5a", 5)], [card("meld-7a", 7)]],
    };
    const context = tacticalQueenContext(hand, [player(1, []), player(2, hand), target], "twoCall", 2)!;

    expect(cpuModels.tactical.chooseQueenVanishRank?.(context, [4, 5, 6])).toBe(6);
  });

  it("tactical Q keeps the recorded reach target when a later two-call player exists", () => {
    const hand = [card("4s", 4), card("6s", 6)];
    const laterTwoCall = {
      ...player(1, [], [card("discard-6", 6)]),
      openMelds: [[card("meld-2a", 2)], [card("meld-3a", 3)]],
    };
    const reachTarget = { ...player(3, []), isReach: true, discardPile: [card("discard-4", 4)] };
    const context = tacticalQueenContext(hand, [laterTwoCall, player(2, hand), reachTarget], "reach", 2)!;

    expect(cpuModels.tactical.chooseQueenVanishRank?.(context, [4, 6])).toBe(6);
  });

  it("tactical Q keeps the recorded two-call target when a later reach player exists", () => {
    const hand = [card("4s", 4), card("6s", 6)];
    const laterReach = { ...player(1, [], [card("discard-6", 6)]), isReach: true };
    const twoCallTarget = {
      ...player(3, [], [card("discard-4", 4)]),
      openMelds: [[card("meld-2a", 2)], [card("meld-3a", 3)]],
    };
    const context = tacticalQueenContext(hand, [laterReach, player(2, hand), twoCallTarget], "twoCall", 2)!;

    expect(cpuModels.tactical.chooseQueenVanishRank?.(context, [4, 6])).toBe(6);
  });

  it("tactical Q prefers a useful own discard over a zero-own rank during a threat", () => {
    const hand = [card("5s", 5)];
    const target = { ...player(3, []), isReach: true };
    const context = tacticalQueenContext(hand, [player(1, []), player(2, hand), target], "reach", 2)!;

    expect(cpuModels.tactical.chooseQueenVanishRank?.(context, [5, 6])).toBe(5);
  });

  it("tactical Q uses the existing unnecessary-card score among own threat candidates", () => {
    const hand = [card("3s", 3), card("3h", 3, "H"), card("13c", 13, "C")];
    const target = { ...player(3, []), isReach: true };
    const context = tacticalQueenContext(hand, [player(1, []), player(2, hand), target], "reach", 2)!;

    expect(cpuModels.tactical.chooseQueenVanishRank?.(context, [3, 13])).toBe(13);
  });

  it("tactical Q uses a zero-own rank when its remaining hand is two protected pairs", () => {
    const hand = [card("4s", 4), card("4h", 4, "H"), card("6s", 6), card("6h", 6, "H")];
    const target = { ...player(3, []), isReach: true };
    const context = tacticalQueenContext(hand, [player(1, []), player(2, hand), target], "reach", 2)!;

    expect(cpuModels.tactical.chooseQueenVanishRank?.(context, [4, 5, 6])).toBe(5);
  });

  it("tactical Q keeps normal fallback and does not inspect hidden target cards", () => {
    const hand = [card("5s", 5)];
    const hiddenOnly = player(3, [card("hidden-4", 4)]);
    const normalContext = tacticalQueenContext(hand, [player(1, []), player(2, hand), hiddenOnly])!;
    const hiddenFourContext = tacticalQueenContext(hand, [player(1, []), player(2, hand), { ...hiddenOnly, isReach: true }], "reach", 2)!;
    const hiddenSixContext = tacticalQueenContext(
      hand,
      [player(1, []), player(2, hand), { ...player(3, [card("hidden-6", 6)]), isReach: true }],
      "reach",
      2,
    )!;

    expect(cpuModels.tactical.chooseQueenVanishRank?.(normalContext, [5, 13])).toBe(
      cpuModels.standard.chooseQueenVanishRank?.(normalContext, [5, 13]),
    );
    expect(cpuModels.tactical.chooseQueenVanishRank?.(hiddenFourContext, [5, 6])).toBe(5);
    expect(cpuModels.tactical.chooseQueenVanishRank?.(hiddenSixContext, [5, 6])).toBe(5);
  });

  it("keeps standard discard choice stable when daifugo rules are disabled", () => {
    const gameState = {
      ...state([player(1, []), player(2, [card("3s", 3, "S"), card("3h", 3, "H"), card("3d", 3, "D"), card("13h", 13, "H")]), player(3, [])]),
      phase: "discard" as const,
      daifugoOptions: { ...createDefaultDaifugoOptions(), enabled: false },
    };
    const context = createCpuDecisionContext(gameState)!;

    expect(standardChooseCpuDiscardCard(context)?.id).toBe("13h");
  });

  it("easy CPU calls only sometimes when a call improves meld count", () => {
    const gameState = state([
      player(1, [], [card("discard-7d", 7, "D")]),
      player(2, [card("7s", 7, "S"), card("7h", 7, "H"), card("2c", 2, "C"), card("11s", 11, "S")]),
      player(3, []),
    ]);
    const context = createCpuDecisionContext(gameState)!;

    vi.spyOn(Math, "random").mockReturnValueOnce(0.9);
    expect(easyChooseCpuCall(context)).toBeNull();

    vi.spyOn(Math, "random").mockReturnValueOnce(0.1);
    expect(easyChooseCpuCall(context)?.ownerIndex).toBe(0);
  });

  it("easy CPU protects an obvious completed meld when discarding", () => {
    const gameState = {
      ...state([
        player(1, []),
        player(2, [card("3s", 3, "S"), card("3h", 3, "H"), card("3d", 3, "D"), card("9c", 9, "C")]),
        player(3, []),
      ]),
      phase: "discard" as const,
      drawnCard: card("drawn-9c", 9, "C"),
    };
    const context = createCpuDecisionContext(gameState)!;

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(easyChooseCpuDiscardCard(context)?.id).toBe("9c");
  });

  it("easy CPU prefers cards whose rank appears only once after protecting a meld", () => {
    const gameState = {
      ...state([
        player(1, []),
        player(2, [
          card("3s", 3, "S"),
          card("3h", 3, "H"),
          card("3d", 3, "D"),
          card("5s", 5, "S"),
          card("5h", 5, "H"),
          card("9c", 9, "C"),
          card("12d", 12, "D"),
        ]),
        player(3, []),
      ]),
      phase: "discard" as const,
      drawnCard: card("drawn-12d", 12, "D"),
    };
    const context = createCpuDecisionContext(gameState)!;

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(["9c", "12d"]).toContain(easyChooseCpuDiscardCard(context)?.id);
  });

  it("easy CPU reach declaration is probability based", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.49);
    expect(easyChooseReachDeclaration()).toBe(true);

    vi.spyOn(Math, "random").mockReturnValueOnce(0.51);
    expect(easyChooseReachDeclaration()).toBe(false);
  });

  it("tactical CPU avoids a call that does not increase meld count", () => {
    const gameState = state([
      player(1, [], [card("discard-5c", 5, "C")]),
      player(2, [card("5s", 5, "S"), card("5h", 5, "H"), card("5d", 5, "D"), card("9s", 9, "S")]),
      player(3, []),
    ]);
    const context = createCpuDecisionContext(gameState)!;

    expect(tacticalChooseCpuCall(context)).toBeNull();
  });

  it("tactical CPU treats reach discard ranks as safer discard candidates", () => {
    const reachPlayer = { ...player(1, [], [card("discard-7d", 7, "D"), card("discard-7c", 7, "C")]), isReach: true };
    const gameState = {
      ...state([reachPlayer, player(2, [card("safe-7s", 7, "S"), card("high-13h", 13, "H")]), player(3, [])]),
      phase: "discard" as const,
      drawnCard: card("drawn-2c", 2, "C"),
    };
    const context = createCpuDecisionContext(gameState)!;

    expect(tacticalChooseCpuDiscardCard(context)?.rank).toBe(7);
  });

  it("tactical CPU adds a safety bonus for the previous player with two completed melds", () => {
    const previousOpenMelds = [
      [card("m1-3s", 3, "S"), card("m1-3h", 3, "H"), card("m1-3d", 3, "D")],
      [card("m2-6s", 6, "S"), card("m2-6h", 6, "H"), card("m2-6d", 6, "D")],
    ];
    const gameState = {
      ...state([
        player(1, [], [card("discard-4d", 4, "D")], previousOpenMelds),
        player(2, [card("safe-4s", 4, "S"), card("high-13h", 13, "H")]),
        player(3, []),
      ]),
      phase: "discard" as const,
      drawnCard: card("drawn-2c", 2, "C"),
    };
    const context = createCpuDecisionContext(gameState)!;

    const safeScore = getTacticalDiscardScores(context).find((item) => item.card.rank === 4);

    expect(safeScore?.notes.some((note) => note.includes("safeRank"))).toBe(true);
  });
});
