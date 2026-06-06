import type { Card, GameState, Player, Suit } from "../src/types";
import type { OnlineScenarioId } from "../src/online/types";
import { createDefaultDaifugoOptions, sortCards } from "../src/game/deck";

const suits: Suit[] = ["S", "H", "D", "C"];

function card(id: string, rank: number, suit: Suit = "S"): Card {
  return { id, rank, suit };
}

function deck(prefix: string, topCards: Card[] = [], count = 104): Card[] {
  const filler = Array.from({ length: Math.max(0, count - topCards.length) }, (_, index) => {
    const rank = (index % 13) + 1;
    return card(`${prefix}-deck-${index}`, rank, suits[index % suits.length]);
  });
  return [...topCards, ...filler];
}

function deckWithoutRanks(prefix: string, excludedRanks: number[], topCards: Card[] = [], count = 104): Card[] {
  const excluded = new Set(excludedRanks);
  const ranks = Array.from({ length: 13 }, (_, index) => index + 1).filter((rank) => !excluded.has(rank));
  const filler = Array.from({ length: Math.max(0, count - topCards.length) }, (_, index) =>
    card(`${prefix}-deck-${index}`, ranks[index % ranks.length], suits[index % suits.length]),
  );
  return [...topCards, ...filler];
}

function hand(prefix: string, ranks: number[]): Card[] {
  return sortCards(ranks.map((rank, index) => card(`${prefix}-${index}`, rank, suits[index % suits.length])));
}

function winningWaitHand(prefix: string, junkRank = 9): Card[] {
  return sortCards([
    card(`${prefix}-1s`, 1, "S"),
    card(`${prefix}-1h`, 1, "H"),
    card(`${prefix}-1d`, 1, "D"),
    card(`${prefix}-2s`, 2, "S"),
    card(`${prefix}-2h`, 2, "H"),
    card(`${prefix}-2d`, 2, "D"),
    card(`${prefix}-jc`, 11, "C"),
    card(`${prefix}-qc`, 12, "C"),
    card(`${prefix}-key`, 5, "S"),
    card(`${prefix}-junk`, junkRank, "H"),
  ]);
}

function reachDeclareHand(prefix: string): { hand: Card[]; drawnCard: Card } {
  const drawnCard = card(`${prefix}-drawn`, 10, "C");
  return {
    drawnCard,
    hand: sortCards([
      card(`${prefix}-1s`, 1, "S"),
      card(`${prefix}-1h`, 1, "H"),
      card(`${prefix}-1d`, 1, "D"),
      card(`${prefix}-2s`, 2, "S"),
      card(`${prefix}-2h`, 2, "H"),
      card(`${prefix}-2d`, 2, "D"),
      card(`${prefix}-4s`, 4, "S"),
      card(`${prefix}-5s`, 5, "S"),
      card(`${prefix}-7d`, 7, "D"),
      card(`${prefix}-9h`, 9, "H"),
      drawnCard,
    ]),
  };
}

function nonWinningReachHand(prefix: string): Card[] {
  return sortCards([
    card(`${prefix}-3s`, 3, "S"),
    card(`${prefix}-3h`, 3, "H"),
    card(`${prefix}-3d`, 3, "D"),
    card(`${prefix}-4s`, 4, "S"),
    card(`${prefix}-4h`, 4, "H"),
    card(`${prefix}-4d`, 4, "D"),
    card(`${prefix}-6s`, 6, "S"),
    card(`${prefix}-7h`, 7, "H"),
    card(`${prefix}-9d`, 9, "D"),
    card(`${prefix}-10c`, 10, "C"),
  ]);
}

function fullDiscardHand(prefix: string, discardRank = 13): Card[] {
  return sortCards([
    card(`${prefix}-4s`, 4, "S"),
    card(`${prefix}-4h`, 4, "H"),
    card(`${prefix}-4d`, 4, "D"),
    card(`${prefix}-5s`, 5, "S"),
    card(`${prefix}-5h`, 5, "H"),
    card(`${prefix}-5d`, 5, "D"),
    card(`${prefix}-6s`, 6, "S"),
    card(`${prefix}-7s`, 7, "S"),
    card(`${prefix}-10s`, 10, "S"),
    card(`${prefix}-11s`, 11, "S"),
    card(discardRank === 13 ? "ron-discard-k" : `${prefix}-discard`, discardRank, "C"),
  ]);
}

function effectDiscardHand(prefix: string, effectRank: number): Card[] {
  return sortCards([
    card(`${prefix}-1s`, 1, "S"),
    card(`${prefix}-2s`, 2, "S"),
    card(`${prefix}-3s`, 3, "S"),
    card(`${prefix}-4h`, 4, "H"),
    card(`${prefix}-6h`, 6, "H"),
    card(`${prefix}-7d`, 7, "D"),
    card(`${prefix}-8c`, 8, "C"),
    card(`${prefix}-9d`, 9, "D"),
    card(`${prefix}-10h`, 10, "H"),
    card(`${prefix}-13c`, 13, "C"),
    card(`${prefix}-effect-${effectRank}`, effectRank, "S"),
  ]);
}

function jackShieldHand(prefix: string): Card[] {
  return sortCards([
    card(`${prefix}-5s`, 5, "S"),
    card(`${prefix}-5h`, 5, "H"),
    card(`${prefix}-5d`, 5, "D"),
    card(`${prefix}-1s`, 1, "S"),
    card(`${prefix}-2s`, 2, "S"),
    card(`${prefix}-3s`, 3, "S"),
    card(`${prefix}-4h`, 4, "H"),
    card(`${prefix}-8c`, 8, "C"),
    card(`${prefix}-9d`, 9, "D"),
    card(`${prefix}-13c`, 13, "C"),
    card(`${prefix}-effect-11`, 11, "S"),
  ]);
}

function replacePlayers(base: GameState, updates: Array<Partial<Player>>): Player[] {
  return base.players.map((player, index) => ({
    ...player,
    hand: hand(`p${index + 1}-default`, [1, 3, 4, 5, 6, 7, 8, 10, 11, 12]),
    discardPile: [],
    openMelds: [],
    hasCalled: false,
    isReach: false,
    winningResult: undefined,
    ...updates[index],
  }));
}

function baseScenario(base: GameState, updates: Partial<GameState> & { players: Player[] }): GameState {
  return {
    ...base,
    ...updates,
    players: updates.players,
    deck: updates.deck ?? deck("scenario"),
    daifugoOptions: {
      ...createDefaultDaifugoOptions(),
      enabled: true,
      effects: {
        fiveSkip: true,
        sevenExchange: true,
        eightExtraTurn: true,
        nineReverse: true,
        tenSwapDraw: true,
        jackBack: true,
        queenNumberVanish: true,
      },
    },
    pendingRonResult: null,
    daifugoEffectEvent: null,
    drawnCard: updates.drawnCard ?? null,
    drawnFrom: updates.drawnFrom ?? null,
    pendingDaifugoEffect: updates.pendingDaifugoEffect ?? null,
    winner: null,
    result: null,
    declaredReachThisTurn: false,
    showCpuActions: false,
  };
}

export function applyOnlineScenario(base: GameState, scenario: OnlineScenarioId | undefined): GameState {
  if (!scenario) return base;

  if (scenario === "online-tsumo-basic" || scenario === "online-reach-tsumo" || scenario === "online-reach-draw-tsumo") {
    const players = replacePlayers(base, [
      {
        hand: winningWaitHand("tsumo-p1"),
        isReach: scenario !== "online-tsumo-basic",
      },
    ]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 0,
      phase: "draw",
      deck: deck(scenario, [card(`${scenario}-draw-key`, 13, "C")]),
      message: scenario === "online-tsumo-basic" ? "E2E: 通常ツモ待ち局面です。" : "E2E: リーチ中ツモ待ち局面です。",
    });
  }

  if (scenario === "online-reach-declare") {
    const reach = reachDeclareHand("reach-declare-p1");
    const players = replacePlayers(base, [{ hand: reach.hand }]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 0,
      phase: "discard",
      drawnCard: reach.drawnCard,
      drawnFrom: "deck",
      message: "E2E: リーチ宣言可能局面です。",
    });
  }

  if (scenario === "online-reach-discard-drawn-only" || scenario === "online-reach-invalid-discard") {
    const players = replacePlayers(base, [{ hand: nonWinningReachHand("reach-discard-p1"), isReach: true }]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 0,
      phase: "draw",
      deck: deck(scenario, [card("reach-drawn-only-card", 7, "D")]),
      message: "E2E: リーチ中に上がれないドロー局面です。",
    });
  }

  if (scenario === "online-reach-discard-ron") {
    const players = replacePlayers(base, [
      { hand: nonWinningReachHand("reach-ron-p1"), isReach: true },
      { hand: winningWaitHand("reach-ron-p2"), isReach: true },
    ]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 0,
      phase: "draw",
      deck: deck(scenario, [card("reach-ron-drawn-k", 13, "C")]),
      message: "E2E: リーチ捨て牌ロン局面です。",
    });
  }

  if (scenario === "online-reach-cannot-call") {
    const discard = card("reach-call-source-5s", 5, "S");
    const players = replacePlayers(base, [
      { discardPile: [discard] },
      { hand: hand("reach-call-p2", [5, 5, 1, 2, 3, 7, 8, 9, 11, 13]), isReach: true },
    ]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 1,
      lastDiscarderIndex: 0,
      phase: "draw",
      message: "E2E: リーチ中プレイヤーは鳴けない局面です。",
    });
  }

  if (scenario === "online-call-basic") {
    const discard = card("call-source-5s", 5, "S");
    const players = replacePlayers(base, [
      {
        hand: fullDiscardHand("call-p1", 8),
        discardPile: [discard],
      },
      {
        hand: hand("call-p2", [5, 5, 1, 2, 3, 7, 8, 9, 11, 13]),
      },
    ]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 1,
      lastDiscarderIndex: 0,
      phase: "draw",
      message: "E2E: プレイヤー2が鳴ける局面です。",
    });
  }

  if (
    scenario === "online-effect-5" ||
    scenario === "online-effect-7" ||
    scenario === "online-effect-8" ||
    scenario === "online-effect-9" ||
    scenario === "online-effect-10" ||
    scenario === "online-effect-j-enhance" ||
    scenario === "online-effect-j-view" ||
    scenario === "online-effect-j-shield" ||
    scenario === "online-effect-q" ||
    scenario === "online-effect-invalid"
  ) {
    const rankByScenario: Record<string, number> = {
      "online-effect-5": 5,
      "online-effect-7": 7,
      "online-effect-8": 8,
      "online-effect-9": 9,
      "online-effect-10": 10,
      "online-effect-j-enhance": 11,
      "online-effect-j-view": 11,
      "online-effect-j-shield": 11,
      "online-effect-q": 12,
      "online-effect-invalid": 12,
    };
    const effectRank = rankByScenario[scenario];
    const p1Hand = scenario === "online-effect-j-shield" ? jackShieldHand("effect-p1") : effectDiscardHand("effect-p1", effectRank);
    const players = replacePlayers(base, [
      { hand: p1Hand },
      { hand: hand("effect-p2", [1, 2, 3, 4, 5, 6, 7, 8, 10, 13]) },
      { hand: hand("effect-p3", [1, 2, 3, 4, 5, 6, 8, 9, 10, 13]) },
      { hand: hand("effect-p4", [1, 2, 3, 4, 5, 6, 7, 9, 10, 13]) },
    ]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 0,
      phase: "discard",
      deck: deckWithoutRanks(`effect-${effectRank}`, [effectRank], [card(`effect-${effectRank}-drawn`, 6, "C")]),
      message: `E2E: ${effectRank}効果カードを捨てられる局面です。`,
    });
  }

  if (scenario === "online-effect-q-after-win") {
    const qUserHand = [
      card("eqw-1s", 1, "S"),
      card("eqw-1h", 1, "H"),
      card("eqw-1d", 1, "D"),
      card("eqw-2s", 2, "S"),
      card("eqw-2h", 2, "H"),
      card("eqw-2d", 2, "D"),
      card("eqw-3s", 3, "S"),
      card("eqw-4s", 4, "S"),
      card("eqw-remove-9", 9, "H"),
      card("eqw-key", 13, "C"),
    ];
    const players = replacePlayers(base, [
      {
        hand: sortCards(qUserHand),
        discardPile: [card("eqw-used-q", 12, "D")],
      },
    ]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 0,
      phase: "handoff",
      deck: deckWithoutRanks("effect-q-after-win", [9], [card("eqw-refill-5", 5, "S")]),
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      message: "E2E: Phase 4 Q補充後上がり局面です。",
    });
  }

  if (scenario === "online-round-deckout") {
    const players = replacePlayers(base, [
      { hand: hand("deckout-p1", [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]) },
      { hand: hand("deckout-p2", [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]) },
      { hand: hand("deckout-p3", [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]) },
      { hand: hand("deckout-p4", [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]) },
    ]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 0,
      phase: "draw",
      deck: [],
      message: "E2E: 山札切れ局面です。",
    });
  }

  if (scenario === "online-ron-basic" || scenario === "online-double-ron") {
    const players = replacePlayers(base, [
      {
        hand: fullDiscardHand("ron-p1", 13),
      },
      {
        hand: winningWaitHand("ron-p2"),
        isReach: true,
      },
      {
        hand: scenario === "online-double-ron" ? winningWaitHand("ron-p3") : hand("ron-p3", [1, 4, 4, 6, 7, 9, 10, 11, 12, 13]),
        isReach: scenario === "online-double-ron",
      },
    ]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 0,
      phase: "discard",
      message: scenario === "online-double-ron" ? "E2E: Wロン局面です。" : "E2E: ロン局面です。",
    });
  }

  if (scenario === "online-q-after-draw-tsumo") {
    const qUserHand = [
      card("qaw-1s", 1, "S"),
      card("qaw-1h", 1, "H"),
      card("qaw-1d", 1, "D"),
      card("qaw-2s", 2, "S"),
      card("qaw-2h", 2, "H"),
      card("qaw-2d", 2, "D"),
      card("qaw-3s", 3, "S"),
      card("qaw-4s", 4, "S"),
      card("qaw-remove-9", 9, "H"),
      card("qaw-key", 13, "C"),
    ];
    const players = replacePlayers(base, [
      {
        hand: sortCards(qUserHand),
        discardPile: [card("qaw-used-q", 12, "D")],
      },
      {
        hand: hand("qaw-p2", [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]),
      },
      {
        hand: hand("qaw-p3", [1, 2, 3, 4, 5, 6, 7, 8, 10, 12]),
      },
      {
        hand: hand("qaw-p4", [1, 2, 3, 4, 5, 6, 7, 8, 10, 13]),
      },
    ]);
    return baseScenario(base, {
      players,
      currentPlayerIndex: 0,
      phase: "handoff",
      deck: deckWithoutRanks("q-after", [9], [card("qaw-refill-5", 5, "S")]),
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      message: "E2E: Q補充ドローで即上がりできる局面です。",
    });
  }

  return base;
}
