import type {
  Card,
  CpuModelId,
  DaifugoEffectEvent,
  DaifugoEffectId,
  DaifugoOptions,
  Direction,
  GameResult,
  GameState,
  JackSpecialEffectId,
  PendingDaifugoContinue,
  Player,
  RonResult,
} from "../types";
import { createDeck, createDefaultDaifugoOptions, dealCards, shuffleDeck, sortCards } from "./deck";
import {
  canDeclareReach,
  canDeclareReachAfterDraw,
  checkWinningHandWithOpenMelds,
  countMaxMelds,
  findCallMeldOptions,
  findPossibleMelds,
  findWinningDiscardsAfterDraw,
} from "./rules";
import { calculateRonScore, calculateTsumoScore } from "./scoring";
import { chooseDaifugoSevenExchangeCardForModel } from "./daifugoCpu";

export function getNextPlayerIndex(currentIndex: number, playerCount: number, direction: Direction): number {
  return direction === "clockwise"
    ? (currentIndex + 1) % playerCount
    : (currentIndex - 1 + playerCount) % playerCount;
}

export function createInitialGame(
  playerCount: number,
  direction: Direction,
  humanPlayerCount = playerCount,
  cpuModelId: CpuModelId = "standard",
  daifugoOptions: DaifugoOptions = createDefaultDaifugoOptions(),
  cpuModelIds: CpuModelId[] = [],
  showCpuActions = true,
): GameState {
  return dealCards(shuffleDeck(createDeck()), playerCount, direction, humanPlayerCount, cpuModelId, daifugoOptions, cpuModelIds, showCpuActions);
}

function replacePlayer(players: Player[], index: number, nextPlayer: Player): Player[] {
  return players.map((player, playerIndex) => (playerIndex === index ? nextPlayer : player));
}

function topDiscard(player: Player): Card | null {
  return player.discardPile[player.discardPile.length - 1] ?? null;
}

function formatCpuCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function logWinDebug(
  state: GameState,
  winType: GameResult["winType"],
  winnerIndex: number,
  discarderIndex: number | null,
  actionSource: string,
) {
  if (winType !== "ron" && winType !== "tsumo") return;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const winner = state.players[winnerIndex];
  const discardOwner = discarderIndex !== null ? state.players[discarderIndex] : null;
  const viewer = state.players.find((player) => !player.isCpu) ?? state.players[0] ?? null;
  const lastDiscard = discardOwner ? topDiscard(discardOwner) : null;
  console.info("[win debug]", {
    currentPlayerId: currentPlayer?.id,
    winnerId: winner?.id,
    loserId: discarderIndex !== null ? discardOwner?.id : null,
    discardOwnerId: discardOwner?.id ?? null,
    winningType: winType,
    viewerPlayerId: viewer?.id ?? null,
    currentTurnIndex: state.currentPlayerIndex,
    winnerIndex,
    discardOwnerIndex: discarderIndex,
    direction: state.direction,
    lastDiscard: lastDiscard ? formatCpuCard(lastDiscard) : null,
    actionSource,
  });
}

function makeResult(
  state: GameState,
  winnerIndex: number,
  winType: GameResult["winType"],
  winningResult = state.players[winnerIndex].winningResult!,
  discarderIndex: number | null = null,
  actionSource = "makeResult",
): GameResult {
  logWinDebug(state, winType, winnerIndex, discarderIndex, actionSource);
  const score =
    winType === "ron" && discarderIndex !== null
      ? calculateRonScore(state.players, winnerIndex, discarderIndex, winningResult, state.isJBackActive)
      : calculateTsumoScore(state.players, winnerIndex, winningResult, state.isJBackActive);

  return {
    winnerIndex,
    winType,
    winningResult,
    score,
    discarderIndex,
    ronResults:
      winType === "ron"
        ? [
            {
              winnerIndex,
              winningResult,
              score,
            },
          ]
        : undefined,
  };
}

function findReachRonResults(
  players: Player[],
  discarderIndex: number,
  discardCard: Card,
  isJBackActive: boolean,
): Array<RonResult & { player: Player }> {
  const results: Array<RonResult & { player: Player }> = [];

  players.forEach((player, winnerIndex) => {
    if (winnerIndex === discarderIndex || !player.isReach) return;
    const options = findWinningDiscardsAfterDraw([...player.hand, discardCard], discardCard.id, player.openMelds, isJBackActive);
    const option = options[0];
    if (!option) return;

    results.push({
      winnerIndex,
      winningResult: option.winningResult,
      score: calculateRonScore(players, winnerIndex, discarderIndex, option.winningResult, isJBackActive),
      player: { ...player, winningResult: option.winningResult },
    });
  });

  return results;
}

function makeReachRonResult(state: GameState, discarderIndex: number): { result: GameResult; players: Player[] } | null {
  const discardCard = topDiscard(state.players[discarderIndex]);
  if (!discardCard) return null;

  const ronCandidates = findReachRonResults(state.players, discarderIndex, discardCard, state.isJBackActive);
  if (ronCandidates.length === 0) return null;

  const players = ronCandidates.reduce(
    (nextPlayers, candidate) => replacePlayer(nextPlayers, candidate.winnerIndex, candidate.player),
    state.players,
  );
  const ronResults = ronCandidates.map(({ winnerIndex, winningResult, score }) => ({
    winnerIndex,
    winningResult,
    score,
  }));
  const first = ronResults[0];
  logWinDebug(state, "ron", first.winnerIndex, discarderIndex, "reachRonCheck");

  return {
    players,
    result: {
      winnerIndex: first.winnerIndex,
      winType: "ron",
      winningResult: first.winningResult,
      score: first.score,
      discarderIndex,
      ronResults,
    },
  };
}

function deckoutResult(state: GameState, players: Player[]): GameState {
  const result: GameResult = {
    winnerIndex: -1,
    winType: "deckout",
    winningResult: { canWin: false, melds: [], keyCard: null },
    score: {
      winnerScore: 0,
      playerLosses: players.map(() => 0),
    },
    discarderIndex: null,
  };
  return {
    ...state,
    players,
    phase: "result",
    winner: null,
    result,
    pendingRonResult: null,
    pendingDaifugoEffect: null,
    declaredReachThisTurn: false,
    message: "山札がなくなりました。この局は流局です。",
  };
}

function advanceToNextDraw(state: GameState, players: Player[], discarderIndex: number, message?: string): GameState {
  const ron = makeReachRonResult({ ...state, players }, discarderIndex);
  if (ron) {
    return {
      ...state,
      players: ron.players,
      phase: "ronCheck",
      pendingRonResult: ron.result,
      declaredReachThisTurn: false,
      message: "ロン確認中です。",
    };
  }

  return {
    ...state,
    players,
    phase: "handoff",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: discarderIndex,
    takenDiscardOwnerIndex: null,
    declaredReachThisTurn: false,
    message: message ?? "次のプレイヤーへ交代してください。",
  };
}

function continueAfterDaifugo(state: GameState, continueState: PendingDaifugoContinue, players = state.players): GameState {
  if (continueState.shouldConfirmReach) {
    return reachConfirmState(state, players);
  }

  return advanceToNextDraw({ ...state, pendingDaifugoEffect: null, players }, players, state.currentPlayerIndex, continueState.message);
}

function reachConfirmState(state: GameState, players = state.players): GameState {
  return {
    ...state,
    players,
    pendingDaifugoEffect: null,
    phase: "reachConfirm",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: state.currentPlayerIndex,
    takenDiscardOwnerIndex: null,
    declaredReachThisTurn: false,
    message: "リーチを宣言しますか？",
  };
}

function reverseDirection(direction: Direction): Direction {
  return direction === "clockwise" ? "counterclockwise" : "clockwise";
}

function getPreviousPlayerIndex(currentIndex: number, playerCount: number, direction: Direction): number {
  return getNextPlayerIndex(currentIndex, playerCount, reverseDirection(direction));
}

export function getEnhancedFiveTurnOptions(state: GameState, playerIndex: number) {
  const orderedPlayerIndexes: number[] = [];
  let cursor = playerIndex;
  for (let count = 1; count < state.players.length; count += 1) {
    cursor = getNextPlayerIndex(cursor, state.players.length, state.direction);
    orderedPlayerIndexes.push(cursor);
  }

  return orderedPlayerIndexes.map((targetPlayerIndex, orderIndex) => ({
    playerIndex: targetPlayerIndex,
    skippedPlayerIndexes: orderedPlayerIndexes.slice(0, orderIndex),
    selectable: orderIndex > 0,
  }));
}

function getDaifugoEffectForCard(card: Card, options: DaifugoOptions): DaifugoEffectId | null {
  if (!options.enabled) return null;
  if (card.rank === 5 && options.effects.fiveSkip) return "fiveSkip";
  if (card.rank === 7 && options.effects.sevenExchange) return "sevenExchange";
  if (card.rank === 8 && options.effects.eightExtraTurn) return "eightExtraTurn";
  if (card.rank === 9 && options.effects.nineReverse) return "nineReverse";
  if (card.rank === 10 && options.effects.tenSwapDraw) return "tenSwapDraw";
  if (card.rank === 11 && options.effects.jackBack) return "jackBack";
  if (card.rank === 12 && options.effects.queenNumberVanish) return "queenNumberVanish";
  return null;
}

function createPendingDaifugoEffect(state: GameState, discardCard: Card, continueState: PendingDaifugoContinue) {
  const effect = getDaifugoEffectForCard(discardCard, state.daifugoOptions);
  const player = state.players[state.currentPlayerIndex];
  if (effect === "tenSwapDraw" && player?.isReach) return null;
  if (!effect) return null;
  return {
    kind: "confirm" as const,
    effect,
    playerIndex: state.currentPlayerIndex,
    continue: continueState,
  };
}

function getDaifugoConfirmMessage(effect: DaifugoEffectId): string {
  if (effect === "sevenExchange") return "7の効果：次のプレイヤーとカードを1枚交換しますか？";
  if (effect === "queenNumberVanish") return "Qの効果：指定した数字を手札と山札から消しますか？";
  switch (effect) {
    case "fiveSkip":
      return "5の効果：次のプレイヤーをスキップしますか？";
    case "eightExtraTurn":
      return "8の効果：追加ターンを行いますか？";
    case "nineReverse":
      return "9の効果：手番方向を逆にしますか？";
    case "tenSwapDraw":
      return "10の効果：追加で1枚捨てて山札から1枚引きますか？";
    case "jackBack":
      return "Jの効果：J特殊効果を使用しますか？";
    default:
      return "カード効果を発動しますか？";
  }
}

function formatRank(rank: number): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

export interface QueenVanishRankOption {
  rank: number;
  removedFromDeck: number;
  replenishmentRequired: number;
  availableAfterVanish: number;
  selectable: boolean;
  disabledReason?: string;
}

export function getQueenVanishRankOptions(state: Pick<GameState, "deck" | "players" | "queenVanishedRanks">): QueenVanishRankOption[] {
  const vanishedRanks = new Set(state.queenVanishedRanks ?? []);
  return Array.from({ length: 13 }, (_, index) => index + 1)
    .filter((rank) => !vanishedRanks.has(rank))
    .map((rank) => {
      const removedFromDeck = state.deck.filter((card) => card.rank === rank).length;
      const replenishmentRequired = state.players.reduce(
        (total, player) => total + player.hand.filter((card) => card.rank === rank).length,
        0,
      );
      const availableAfterVanish = state.deck.length - removedFromDeck;
      const selectable = availableAfterVanish >= replenishmentRequired;
      return {
        rank,
        removedFromDeck,
        replenishmentRequired,
        availableAfterVanish,
        selectable,
        disabledReason: selectable ? undefined : "補充用の山札が不足しています",
      };
    });
}

function getSelectableQueenVanishRanks(state: GameState): number[] {
  return getQueenVanishRankOptions(state)
    .filter((option) => option.selectable)
    .map((option) => option.rank);
}

function uniqueCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

function canMaintainReach(player: Player): boolean {
  return !player.hasCalled && player.hand.length === 10 && countMaxMelds(player.hand) >= 2;
}

function releaseInvalidReachPlayers(players: Player[]): { players: Player[]; releasedPlayerIndexes: number[] } {
  const releasedPlayerIndexes: number[] = [];
  const nextPlayers = players.map((player, playerIndex) => {
    if (!player.isReach || canMaintainReach(player)) return player;
    releasedPlayerIndexes.push(playerIndex);
    return { ...player, isReach: false };
  });
  return { players: nextPlayers, releasedPlayerIndexes };
}

function appendReachReleaseMessage(message: string, players: Player[], releasedPlayerIndexes: number[]): string {
  if (releasedPlayerIndexes.length === 0) return message;
  const releasedNames = releasedPlayerIndexes.map((index) => players[index]?.name).filter(Boolean).join("、");
  return `${message} ${releasedNames}のリーチが解除されました。`;
}

function recheckReachAfterHandChange(
  state: GameState,
  players: Player[],
  affectedPlayerIndexes: number[],
  effect: "sevenExchange" | "queenNumberVanish",
  message: string,
): { players: Player[]; releasedPlayerIndexes: number[]; confirmPlayerIndex: number | null; message: string } {
  const affected = new Set(affectedPlayerIndexes);
  const releasedPlayerIndexes: number[] = [];
  let confirmPlayerIndex: number | null = null;
  const nextPlayers = players.map((player, playerIndex) => {
    if (!affected.has(playerIndex) || !state.players[playerIndex]?.isReach || !player.isReach) return player;
    if (!canMaintainReach(player)) {
      releasedPlayerIndexes.push(playerIndex);
      return { ...player, isReach: false };
    }
    if (!player.isCpu && confirmPlayerIndex === null) {
      confirmPlayerIndex = playerIndex;
    }
    return player;
  });

  return {
    players: nextPlayers,
    releasedPlayerIndexes,
    confirmPlayerIndex,
    message: appendReachReleaseMessage(message, nextPlayers, releasedPlayerIndexes),
  };
}

function withReachContinueConfirmIfNeeded(
  state: GameState,
  players: Player[],
  discarderIndex: number,
  effect: "sevenExchange" | "queenNumberVanish",
  confirmPlayerIndex: number | null,
  message: string,
): GameState {
  const nextState = advanceToNextDraw({ ...state, pendingDaifugoEffect: null, players }, players, discarderIndex, message);
  if (confirmPlayerIndex === null) return nextState;
  const effectMessage =
    effect === "queenNumberVanish"
      ? "Q効果により手札構成が変化しました。リーチ状態を継続しますか？"
      : "カード交換により手札構成が変化しました。リーチ状態を継続しますか？";
  return {
    ...nextState,
    pendingDaifugoEffect: {
      kind: "reachContinueConfirm",
      effect,
      playerIndex: confirmPlayerIndex,
      message: effectMessage,
    },
    message: effectMessage,
  };
}

function makeDaifugoEventId(kind: DaifugoEffectEvent["kind"], state: GameState): string {
  const discardCount = state.players.reduce((total, player) => total + player.discardPile.length, 0);
  return `${kind}-${state.currentPlayerIndex}-${state.deck.length}-${discardCount}`;
}

export function getSevenExchangeCandidateCards(player: Player, allowAnyCard = false): Card[] {
  if (allowAnyCard) return player.hand;

  const meldCandidates = findPossibleMelds(player.hand);
  if (meldCandidates.length > 0) {
    return uniqueCards(meldCandidates.flat());
  }

  const cardsByRank = new Map<number, Card[]>();
  for (const card of player.hand) {
    cardsByRank.set(card.rank, [...(cardsByRank.get(card.rank) ?? []), card]);
  }
  const pairCards = [...cardsByRank.values()].filter((cards) => cards.length >= 2).flat();
  return pairCards.length >= 4 ? pairCards : player.hand;
}

function fillCpuSevenExchangeSelections(state: GameState, pending: Extract<NonNullable<GameState["pendingDaifugoEffect"]>, { kind: "sevenExchange" }>) {
  const selections = { ...pending.selections };
  for (const playerIndex of [pending.playerIndex, pending.targetPlayerIndex]) {
    const player = state.players[playerIndex];
    if (!player?.isCpu || selections[playerIndex]) continue;
    const candidates = getSevenExchangeCandidateCards(player, playerIndex === pending.playerIndex);
    const selected = chooseDaifugoSevenExchangeCardForModel(
      player.cpuModelId,
      { state, currentPlayer: player, currentPlayerIndex: playerIndex },
      candidates,
      playerIndex === pending.playerIndex ? "initiator" : "target",
    );
    if (selected) selections[playerIndex] = selected.id;
  }
  return selections;
}

function consumeJEnhancementRightAfterSeven(players: Player[], playerIndex: number, shouldConsume?: boolean): Player[] {
  if (!shouldConsume) return players;
  const player = players[playerIndex];
  if (!player?.hasJEnhancementRight) return players;
  return replacePlayer(players, playerIndex, { ...player, hasJEnhancementRight: false });
}

function consumeJEnhancementRight(players: Player[], playerIndex: number): Player[] {
  const player = players[playerIndex];
  if (!player?.hasJEnhancementRight) return players;
  return replacePlayer(players, playerIndex, { ...player, hasJEnhancementRight: false });
}

function resolveNormalFiveSkip(state: GameState, continueState?: PendingDaifugoContinue): GameState {
  const skippedIndex = getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.direction);
  return advanceToNextDraw(
    { ...state, pendingDaifugoEffect: null },
    state.players,
    skippedIndex,
    continueState?.message ?? "5 effect skipped the next player.",
  );
}

function resolveEnhancedFiveSkip(state: GameState, playerIndex: number, targetPlayerIndex: number): GameState {
  const option = getEnhancedFiveTurnOptions(state, playerIndex).find((candidate) => candidate.playerIndex === targetPlayerIndex);
  if (!option?.selectable) return state;
  const player = state.players[playerIndex];
  if (!player?.hasJEnhancementRight || player.isCpu) return state;
  const players = consumeJEnhancementRight(state.players, playerIndex);
  const previousIndex = getPreviousPlayerIndex(targetPlayerIndex, state.players.length, state.direction);
  const skippedNames = option.skippedPlayerIndexes.map((skippedIndex) => state.players[skippedIndex].name).join(", ");
  const message = `${player.name} used enhanced 5. Skipped ${skippedNames}; next turn is ${state.players[targetPlayerIndex].name}.`;
  return advanceToNextDraw({ ...state, players, pendingDaifugoEffect: null }, players, previousIndex, message);
}

function startSevenExchange(
  state: GameState,
  playerIndex: number,
  targetPlayerIndex: number,
  continueState: PendingDaifugoContinue,
  consumeJEnhancementRightOnComplete = false,
): GameState {
  const message = consumeJEnhancementRightOnComplete
    ? `${state.players[playerIndex].name}がJ強化を使用し、${state.players[targetPlayerIndex].name}とのカード交換を開始します。`
    : `${state.players[playerIndex].name}と${state.players[targetPlayerIndex].name}が相手に渡すカードを選択しています。`;
  return resolveSevenExchangeIfReady({
    ...state,
    pendingDaifugoEffect: {
      kind: "sevenExchange",
      effect: "sevenExchange",
      playerIndex,
      targetPlayerIndex,
      selections: {},
      continue: continueState,
      consumeJEnhancementRightOnComplete,
    },
    message,
  });
}

function resolveSevenExchange(state: GameState, pending: Extract<NonNullable<GameState["pendingDaifugoEffect"]>, { kind: "sevenExchange" }>): GameState {
  const giver = state.players[pending.playerIndex];
  const target = state.players[pending.targetPlayerIndex];
  const giverCardId = pending.selections[pending.playerIndex];
  const targetCardId = pending.selections[pending.targetPlayerIndex];
  const giverCard = giver?.hand.find((card) => card.id === giverCardId);
  const targetCard = target?.hand.find((card) => card.id === targetCardId);
  if (!giver || !target || !giverCard || !targetCard) return state;

  const nextGiver: Player = {
    ...giver,
    hand: sortCards([...giver.hand.filter((card) => card.id !== giverCard.id), targetCard]),
  };
  const nextTarget: Player = {
    ...target,
    hand: sortCards([...target.hand.filter((card) => card.id !== targetCard.id), giverCard]),
  };
  const exchangedPlayers = consumeJEnhancementRightAfterSeven(
    replacePlayer(replacePlayer(state.players, pending.playerIndex, nextGiver), pending.targetPlayerIndex, nextTarget),
    pending.playerIndex,
    pending.consumeJEnhancementRightOnComplete,
  );
  const { players, releasedPlayerIndexes } = releaseInvalidReachPlayers(exchangedPlayers);
  const message = appendReachReleaseMessage(`${giver.name}と${target.name}が互いにカードを渡しました。`, players, releasedPlayerIndexes);
  return continueAfterDaifugo(
    {
      ...state,
      players,
      pendingDaifugoEffect: null,
      daifugoEffectEvent: {
        id: makeDaifugoEventId("sevenExchange", state),
        kind: "sevenExchange",
        actorIndex: pending.playerIndex,
        targetPlayerIndex: pending.targetPlayerIndex,
        exchangedCards: [
          { playerIndex: pending.playerIndex, receivedCard: targetCard },
          { playerIndex: pending.targetPlayerIndex, receivedCard: giverCard },
        ],
        reachReleasedPlayerIndexes: releasedPlayerIndexes,
      },
    },
    { ...pending.continue, shouldConfirmReach: false, message },
    players,
  );
}

function resolveSevenExchangeWithReachReview(
  state: GameState,
  pending: Extract<NonNullable<GameState["pendingDaifugoEffect"]>, { kind: "sevenExchange" }>,
): GameState {
  const giver = state.players[pending.playerIndex];
  const target = state.players[pending.targetPlayerIndex];
  const giverCard = giver?.hand.find((card) => card.id === pending.selections[pending.playerIndex]);
  const targetCard = target?.hand.find((card) => card.id === pending.selections[pending.targetPlayerIndex]);
  if (!giver || !target || !giverCard || !targetCard) return state;

  const nextGiver: Player = {
    ...giver,
    hand: sortCards([...giver.hand.filter((card) => card.id !== giverCard.id), targetCard]),
  };
  const nextTarget: Player = {
    ...target,
    hand: sortCards([...target.hand.filter((card) => card.id !== targetCard.id), giverCard]),
  };
  const exchangedPlayers = consumeJEnhancementRightAfterSeven(
    replacePlayer(replacePlayer(state.players, pending.playerIndex, nextGiver), pending.targetPlayerIndex, nextTarget),
    pending.playerIndex,
    pending.consumeJEnhancementRightOnComplete,
  );
  const reachCheck = recheckReachAfterHandChange(
    state,
    exchangedPlayers,
    [pending.playerIndex, pending.targetPlayerIndex],
    "sevenExchange",
    `${giver.name}と${target.name}が互いにカードを渡しました。`,
  );
  const eventState: GameState = {
    ...state,
    players: reachCheck.players,
    pendingDaifugoEffect: null,
    daifugoEffectEvent: {
      id: makeDaifugoEventId("sevenExchange", state),
      kind: "sevenExchange",
      actorIndex: pending.playerIndex,
      targetPlayerIndex: pending.targetPlayerIndex,
      exchangedCards: [
        { playerIndex: pending.playerIndex, receivedCard: targetCard },
        { playerIndex: pending.targetPlayerIndex, receivedCard: giverCard },
      ],
      reachReleasedPlayerIndexes: reachCheck.releasedPlayerIndexes,
    },
  };

  return withReachContinueConfirmIfNeeded(
    eventState,
    reachCheck.players,
    state.currentPlayerIndex,
    "sevenExchange",
    reachCheck.confirmPlayerIndex,
    reachCheck.message,
  );
}

function resolveSevenExchangeIfReady(state: GameState): GameState {
  const pending = state.pendingDaifugoEffect;
  if (!pending || pending.kind !== "sevenExchange") return state;
  const selections = fillCpuSevenExchangeSelections(state, pending);
  const nextPending = { ...pending, selections };
  const nextState: GameState = { ...state, pendingDaifugoEffect: nextPending };
  if (selections[pending.playerIndex] && selections[pending.targetPlayerIndex]) {
    return resolveSevenExchangeWithReachReview(nextState, nextPending);
  }
  const waiting = [pending.playerIndex, pending.targetPlayerIndex]
    .filter((index) => !selections[index])
    .map((index) => state.players[index]?.name)
    .filter(Boolean)
    .join("、");
  return {
    ...nextState,
    message: waiting
      ? `${waiting}が相手に渡すカードを選択しています。`
      : `${state.players[pending.playerIndex].name}と${state.players[pending.targetPlayerIndex].name}が相手に渡すカードを選択しています。`,
  };
}

export function chooseCpuQueenRank(state: GameState, playerIndex: number): number {
  const selectableRanks = new Set(getSelectableQueenVanishRanks(state));
  const ownIds = new Set(state.players[playerIndex]?.hand.map((card) => card.id) ?? []);
  const counts = new Map<number, number>();
  for (const player of state.players) {
    for (const card of player.hand) {
      counts.set(card.rank, (counts.get(card.rank) ?? 0) + (ownIds.has(card.id) ? -1 : 1));
    }
  }
  for (const card of state.deck) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return Array.from({ length: 13 }, (_, index) => index + 1)
    .filter((rank) => selectableRanks.has(rank))
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0] ?? 12;
}

function resolveQueenNumberVanish(state: GameState, rank: number): GameState {
  const pending = state.pendingDaifugoEffect;
  if (!pending || pending.kind !== "queenSelect") return state;
  const rankOption = getQueenVanishRankOptions(state).find((option) => option.rank === rank);
  if (!rankOption?.selectable) return state;

  const beforeDeckCount = state.deck.length;
  let deck = state.deck.filter((card) => card.rank !== rank);
  const removedFromDeck = state.deck.length - deck.length;
  const discardSummaries: string[] = [];
  const drawSummaries: string[] = [];
  const queenDiscardResults: NonNullable<DaifugoEffectEvent["queenDiscardResults"]> = [];
  let refillDrawCount = 0;

  const playersBeforeReachCheck = state.players.map((player, playerIndex) => {
    const removedCards = player.hand.filter((card) => card.rank === rank);
    if (removedCards.length === 0) return player;
    const queenDiscardedCards = removedCards.map((card) => ({ ...card, discardedByEffect: "queenNumberVanish" as const }));

    const drawnCards = deck.slice(0, removedCards.length);
    deck = deck.slice(drawnCards.length);
    refillDrawCount += drawnCards.length;
    queenDiscardResults.push({ playerIndex, discardedCards: queenDiscardedCards, drawnCards });
    discardSummaries.push(`${player.name}が${formatRank(rank)}を${removedCards.length}枚捨てました`);
    if (drawnCards.length > 0) drawSummaries.push(`${player.name}が山札から${drawnCards.length}枚引きました`);
    return {
      ...player,
      hand: sortCards([...player.hand.filter((card) => card.rank !== rank), ...drawnCards]),
      discardPile: [...player.discardPile, ...queenDiscardedCards],
    };
  });
  const affectedPlayerIndexes = queenDiscardResults.map((result) => result.playerIndex);
  const reachCheck = recheckReachAfterHandChange(state, playersBeforeReachCheck, affectedPlayerIndexes, "queenNumberVanish", "");
  const players = reachCheck.players;
  const releasedPlayerIndexes = reachCheck.releasedPlayerIndexes;
  const afterDeckCount = deck.length;
  const expectedAfterDeckCount = beforeDeckCount - removedFromDeck - refillDrawCount;
  const queenDeckAudit = {
    beforeDeckCount,
    removedFromDeckCount: removedFromDeck,
    refillDrawCount,
    afterDeckCount,
    expectedAfterDeckCount,
    rank,
  };

  console.info("[Q effect deck audit]", queenDeckAudit);
  if (expectedAfterDeckCount !== afterDeckCount) {
    console.warn("[Q effect deck mismatch]", queenDeckAudit);
  }

  const baseMessage = [
    `${state.players[pending.playerIndex].name}がQの効果で${formatRank(rank)}を指定しました。`,
    `山札から${formatRank(rank)}を${removedFromDeck}枚除外しました。`,
    discardSummaries.join("、") || `${formatRank(rank)}を持つプレイヤーはいませんでした。`,
    drawSummaries.join("、"),
    `山札: ${beforeDeckCount} → ${afterDeckCount}（内訳: 除外${removedFromDeck}枚 + 補充ドロー${refillDrawCount}枚）`,
  ].filter(Boolean).join(" ");
  const message = appendReachReleaseMessage(baseMessage, players, releasedPlayerIndexes);

  const user = players[pending.playerIndex];
  const winningResult = checkWinningHandWithOpenMelds(user.hand, user.openMelds, state.isJBackActive);
  const nextState: GameState = {
    ...state,
    players,
    deck,
    pendingDaifugoEffect: null,
    drawnCard: null,
    drawnFrom: null,
    queenVanishedRanks: [...new Set([...(state.queenVanishedRanks ?? []), rank])],
    daifugoEffectEvent: {
      id: makeDaifugoEventId("queenNumberVanish", state),
      kind: "queenNumberVanish",
      actorIndex: pending.playerIndex,
      rank,
      queenDiscardResults,
      queenDeckAudit,
      reachReleasedPlayerIndexes: releasedPlayerIndexes,
    },
    message,
  };

  if (winningResult.canWin) {
    return {
      ...nextState,
      players: replacePlayer(players, pending.playerIndex, { ...user, winningResult }),
      pendingDaifugoEffect: {
        kind: "queenWinConfirm",
        effect: "queenNumberVanish",
        playerIndex: pending.playerIndex,
        winningResult,
        continue: { ...pending.continue, shouldConfirmReach: false, message },
      },
      message: `${message} 上がりますか？`,
    };
  }

  return withReachContinueConfirmIfNeeded(
    nextState,
    players,
    state.currentPlayerIndex,
    "queenNumberVanish",
    reachCheck.confirmPlayerIndex,
    message,
  );
}

function drawOneForPlayer(state: GameState, playerIndex: number): { state: GameState; drawnCard: Card | null } {
  if (state.deck.length === 0) return { state, drawnCard: null };
  const [drawnCard, ...deck] = state.deck;
  const player = state.players[playerIndex];
  const players = replacePlayer(state.players, playerIndex, { ...player, hand: sortCards([...player.hand, drawnCard]) });
  return { state: { ...state, deck, players, drawnCard, drawnFrom: "deck" }, drawnCard };
}

function makeWinningState(state: GameState, players: Player[], winningResult = players[state.currentPlayerIndex].winningResult): GameState {
  if (!winningResult) return state;
  const result = makeResult(
    { ...state, players },
    state.currentPlayerIndex,
    state.drawnFrom === "discard" ? "ron" : "tsumo",
    winningResult,
    state.drawnFrom === "discard" ? state.takenDiscardOwnerIndex : null,
    "normalWinWithDiscard",
  );
  return {
    ...state,
    players,
    phase: "result",
    winner: state.currentPlayerIndex,
    result,
    pendingRonResult: null,
    pendingDaifugoEffect: null,
    declaredReachThisTurn: false,
  };
}

function getJackInspectTargetPlayerIndexes(state: GameState, playerIndex: number): number[] {
  return state.players.map((_, index) => index).filter((index) => index !== playerIndex);
}

function resolveJackBackEffect(state: GameState, playerIndex: number, continueState: PendingDaifugoContinue): GameState {
  const nextIsJBackActive = !state.isJBackActive;
  const playerName = state.players[playerIndex]?.name ?? "プレイヤー";
  const message = nextIsJBackActive
    ? `${playerName}がJバックを発動しました。失点計算が逆転します。`
    : `${playerName}がJバックを解除しました。失点計算が通常に戻ります。`;
  return continueAfterDaifugo(
    {
      ...state,
      isJBackActive: nextIsJBackActive,
      pendingDaifugoEffect: null,
    },
    { ...continueState, shouldConfirmReach: false, message },
  );
}

function startJackInspectEffect(state: GameState, playerIndex: number, continueState: PendingDaifugoContinue): GameState {
  const targetPlayerIndexes = getJackInspectTargetPlayerIndexes(state, playerIndex);
  const playerName = state.players[playerIndex]?.name ?? "プレイヤー";
  if (targetPlayerIndexes.length === 0) {
    return continueAfterDaifugo(
      { ...state, pendingDaifugoEffect: null },
      { ...continueState, shouldConfirmReach: false, message: `${playerName}が情報閲覧を完了しました。` },
    );
  }
  return {
    ...state,
    pendingDaifugoEffect: {
      kind: "jackInspect",
      effect: "jackBack",
      playerIndex,
      targetPlayerIndexes,
      currentTargetOffset: 0,
      revealedCardIds: {},
      continue: continueState,
    },
    message: `${playerName}がJ効果で相手の手札を確認しています。`,
  };
}

function resolveJackEnhancementRightEffect(state: GameState, playerIndex: number, continueState: PendingDaifugoContinue): GameState {
  const player = state.players[playerIndex];
  if (!player || player.hasJEnhancementRight) return state;
  const players = replacePlayer(state.players, playerIndex, { ...player, hasJEnhancementRight: true });
  return continueAfterDaifugo(
    {
      ...state,
      players,
      pendingDaifugoEffect: null,
    },
    {
      ...continueState,
      shouldConfirmReach: false,
      message: `${player.name}がJ効果で5/7強化権を獲得しました。`,
    },
  );
}

function resolveJackSpecialEffect(state: GameState, effect: JackSpecialEffectId): GameState {
  const pending = state.pendingDaifugoEffect;
  if (!pending || pending.kind !== "jackSelect") return state;
  if (effect === "jBack") {
    return resolveJackBackEffect(state, pending.playerIndex, pending.continue);
  }
  if (effect === "enhanceFiveOrSeven") {
    return resolveJackEnhancementRightEffect(state, pending.playerIndex, pending.continue);
  }
  return startJackInspectEffect(state, pending.playerIndex, pending.continue);
}

function applyDaifugoEffect(state: GameState): GameState {
  const pending = state.pendingDaifugoEffect;
  if (!pending || pending.kind !== "confirm" || pending.playerIndex !== state.currentPlayerIndex) return state;

  if (pending.effect === "fiveSkip") {
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer?.hasJEnhancementRight && !currentPlayer.isCpu) {
      return {
        ...state,
        pendingDaifugoEffect: {
          kind: "fiveEnhancementConfirm",
          effect: "fiveSkip",
          playerIndex: state.currentPlayerIndex,
          continue: pending.continue,
        },
        message: `${currentPlayer.name} can use J enhancement for the 5 effect.`,
      };
    }
    return resolveNormalFiveSkip(state, pending.continue);
    const skippedIndex = getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.direction);
    return advanceToNextDraw({ ...state, pendingDaifugoEffect: null }, state.players, skippedIndex, "5の効果で次のプレイヤーをスキップしました。");
  }

  if (pending.effect === "sevenExchange") {
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer?.hasJEnhancementRight && !currentPlayer.isCpu) {
      return {
        ...state,
        pendingDaifugoEffect: {
          kind: "sevenEnhancementConfirm",
          effect: "sevenExchange",
          playerIndex: state.currentPlayerIndex,
          continue: pending.continue,
        },
        message: `${currentPlayer.name}は7の効果でJ強化を使用できます。`,
      };
    }
    const targetPlayerIndex = getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.direction);
    return startSevenExchange(state, state.currentPlayerIndex, targetPlayerIndex, pending.continue);
  }
  if (pending.effect === "nineReverse") {
    return continueAfterDaifugo({ ...state, direction: reverseDirection(state.direction) }, pending.continue);
  }

  if (pending.effect === "jackBack") {
    if (state.players[state.currentPlayerIndex]?.isCpu) {
      return resolveJackBackEffect(state, state.currentPlayerIndex, pending.continue);
    }
    return {
      ...state,
      pendingDaifugoEffect: {
        kind: "jackSelect",
        effect: "jackBack",
        playerIndex: state.currentPlayerIndex,
        continue: pending.continue,
      },
      message: `${state.players[state.currentPlayerIndex].name}がJ特殊効果を発動しました。効果を選択しています。`,
    };
  }

  if (pending.effect === "eightExtraTurn") {
    if (state.deck.length === 0) return deckoutResult({ ...state, pendingDaifugoEffect: null }, state.players);
    return {
      ...state,
      pendingDaifugoEffect: {
        kind: "effectDraw",
        effect: "eightExtraTurn",
        playerIndex: state.currentPlayerIndex,
        continue: pending.continue,
      },
      message: "8の効果：山札から1枚引きます。",
    };
  }

  if (pending.effect === "tenSwapDraw") {
    return {
      ...state,
      pendingDaifugoEffect: {
        kind: "extraDiscard",
        effect: "tenSwapDraw",
        playerIndex: state.currentPlayerIndex,
        continue: pending.continue,
      },
      message: "10の効果：追加で捨てるカードを1枚選んでください。",
    };
  }

  if (pending.effect === "queenNumberVanish") {
    if (getSelectableQueenVanishRanks(state).length === 0) {
      return continueAfterDaifugo(
        { ...state, pendingDaifugoEffect: null },
        { ...pending.continue, shouldConfirmReach: false, message: "山札が不足しているため、Q効果は発動できませんでした。" },
      );
    }
    return {
      ...state,
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: state.currentPlayerIndex,
        continue: pending.continue,
      },
      message: "Qの効果で消す数字を選んでください。",
    };
  }

  return state;
}

export type GameAction =
  | {
      type: "start";
      playerCount: number;
      direction: Direction;
      humanPlayerCount?: number;
      cpuModelId?: CpuModelId;
      cpuModelIds?: CpuModelId[];
      daifugoOptions?: DaifugoOptions;
      showCpuActions?: boolean;
    }
  | { type: "confirmHandoff" }
  | { type: "answerRon"; takeRon: boolean }
  | { type: "answerDaifugoEffect"; activate: boolean }
  | { type: "answerSevenEnhancement"; useEnhancement: boolean }
  | { type: "selectEnhancedSevenTarget"; targetPlayerIndex: number }
  | { type: "confirmEnhancedSevenTarget" }
  | { type: "answerFiveEnhancement"; useEnhancement: boolean }
  | { type: "selectEnhancedFiveTarget"; targetPlayerIndex: number }
  | { type: "confirmEnhancedFiveTarget" }
  | { type: "drawForDaifugoEffect" }
  | { type: "discardForDaifugoEffect"; cardId: string }
  | { type: "selectSevenExchangeCard"; playerIndex: number; cardId: string }
  | { type: "selectQueenVanishRank"; rank: number }
  | { type: "answerQueenWin"; takeWin: boolean }
  | { type: "selectJackSpecialEffect"; effect: JackSpecialEffectId }
  | { type: "inspectJackCard"; targetPlayerIndex: number; cardId: string }
  | { type: "confirmJackInspectCard" }
  | { type: "answerReachContinue"; keepReach: boolean }
  | { type: "drawFromDeck" }
  | { type: "takeDiscard"; ownerIndex: number; meld?: Card[] }
  | { type: "declareReach" }
  | { type: "answerReachAfterDiscard"; declareReach: boolean }
  | { type: "discard"; cardId: string }
  | { type: "discardDrawnOnly" }
  | { type: "winWithDiscard"; discardCardId: string }
  | { type: "restart" };

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (
    state.pendingDaifugoEffect &&
    action.type !== "answerDaifugoEffect" &&
    action.type !== "answerSevenEnhancement" &&
    action.type !== "selectEnhancedSevenTarget" &&
    action.type !== "confirmEnhancedSevenTarget" &&
    action.type !== "answerFiveEnhancement" &&
    action.type !== "selectEnhancedFiveTarget" &&
    action.type !== "confirmEnhancedFiveTarget" &&
    action.type !== "drawForDaifugoEffect" &&
    action.type !== "discardForDaifugoEffect" &&
    action.type !== "selectSevenExchangeCard" &&
    action.type !== "selectQueenVanishRank" &&
    action.type !== "answerQueenWin" &&
    action.type !== "selectJackSpecialEffect" &&
    action.type !== "inspectJackCard" &&
    action.type !== "confirmJackInspectCard" &&
    action.type !== "answerReachContinue" &&
    action.type !== "declareReach" &&
    action.type !== "answerReachAfterDiscard" &&
    action.type !== "winWithDiscard" &&
    action.type !== "restart"
  ) {
    return state;
  }

  switch (action.type) {
    case "start":
      return createInitialGame(
        action.playerCount,
        action.direction,
        action.humanPlayerCount ?? action.playerCount,
        action.cpuModelId ?? "standard",
        action.daifugoOptions ?? createDefaultDaifugoOptions(),
        action.cpuModelIds ?? [],
        action.showCpuActions ?? true,
      );

    case "restart":
      return {
        players: [],
        deck: [],
        currentPlayerIndex: 0,
        direction: "clockwise",
        daifugoOptions: createDefaultDaifugoOptions(),
        pendingDaifugoEffect: null,
        isJBackActive: false,
        phase: "setup",
        drawnCard: null,
        drawnFrom: null,
        lastDiscarderIndex: null,
        takenDiscardOwnerIndex: null,
        winner: null,
        result: null,
        pendingRonResult: null,
        queenVanishedRanks: [],
        declaredReachThisTurn: false,
        showCpuActions: true,
        message: "",
      };

    case "confirmHandoff": {
      const nextPlayerIndex =
        state.lastDiscarderIndex === null
          ? state.currentPlayerIndex
          : getNextPlayerIndex(state.lastDiscarderIndex, state.players.length, state.direction);
      return {
        ...state,
        currentPlayerIndex: nextPlayerIndex,
        phase: "draw",
        pendingRonResult: null,
        message: "カードを1枚取ってください。",
      };
    }

    case "answerRon":
      if (state.phase !== "ronCheck" || !state.pendingRonResult) return state;
      if (!action.takeRon) {
        return {
          ...state,
          phase: "handoff",
          currentPlayerIndex: state.pendingRonResult.discarderIndex ?? state.currentPlayerIndex,
          lastDiscarderIndex: state.pendingRonResult.discarderIndex,
          pendingRonResult: null,
          drawnCard: null,
          drawnFrom: null,
          takenDiscardOwnerIndex: null,
          declaredReachThisTurn: false,
          message: "次のプレイヤーへ交代してください。",
        };
      }
      return {
        ...state,
        phase: "result",
        winner: state.pendingRonResult.winnerIndex,
        result: state.pendingRonResult,
        pendingRonResult: null,
        declaredReachThisTurn: false,
      };

    case "answerDaifugoEffect": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "confirm") return state;
      if (!action.activate) {
        return continueAfterDaifugo({ ...state, pendingDaifugoEffect: null }, pending.continue);
      }
      return applyDaifugoEffect(state);
    }

    case "answerSevenEnhancement": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "sevenEnhancementConfirm") return state;
      const player = state.players[pending.playerIndex];
      if (!player?.hasJEnhancementRight || player.isCpu) return state;
      if (!action.useEnhancement) {
        const targetPlayerIndex = getNextPlayerIndex(pending.playerIndex, state.players.length, state.direction);
        return startSevenExchange(state, pending.playerIndex, targetPlayerIndex, pending.continue);
      }
      return {
        ...state,
        pendingDaifugoEffect: {
          kind: "sevenEnhancedTargetSelect",
          effect: "sevenExchange",
          playerIndex: pending.playerIndex,
          continue: pending.continue,
        },
        message: `${player.name}が強化7の交換相手を選択しています。`,
      };
    }

    case "selectEnhancedSevenTarget": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "sevenEnhancedTargetSelect") return state;
      if (action.targetPlayerIndex === pending.playerIndex) return state;
      if (!state.players[action.targetPlayerIndex]) return state;
      const player = state.players[pending.playerIndex];
      if (!player?.hasJEnhancementRight || player.isCpu) return state;
      return {
        ...state,
        pendingDaifugoEffect: {
          ...pending,
          selectedTargetPlayerIndex: action.targetPlayerIndex,
        },
      };
    }

    case "confirmEnhancedSevenTarget": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "sevenEnhancedTargetSelect") return state;
      const targetPlayerIndex = pending.selectedTargetPlayerIndex;
      if (targetPlayerIndex === undefined || targetPlayerIndex === pending.playerIndex || !state.players[targetPlayerIndex]) return state;
      const player = state.players[pending.playerIndex];
      if (!player?.hasJEnhancementRight || player.isCpu) return state;
      return startSevenExchange(state, pending.playerIndex, targetPlayerIndex, pending.continue, true);
    }

    case "answerFiveEnhancement": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "fiveEnhancementConfirm") return state;
      const player = state.players[pending.playerIndex];
      if (!player?.hasJEnhancementRight || player.isCpu) return state;
      if (!action.useEnhancement) {
        return resolveNormalFiveSkip(state, pending.continue);
      }
      return {
        ...state,
        pendingDaifugoEffect: {
          kind: "fiveEnhancedTargetSelect",
          effect: "fiveSkip",
          playerIndex: pending.playerIndex,
          continue: pending.continue,
        },
        message: `${player.name} is choosing the next turn target for enhanced 5.`,
      };
    }

    case "selectEnhancedFiveTarget": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "fiveEnhancedTargetSelect") return state;
      const player = state.players[pending.playerIndex];
      if (!player?.hasJEnhancementRight || player.isCpu) return state;
      const option = getEnhancedFiveTurnOptions(state, pending.playerIndex).find((candidate) => candidate.playerIndex === action.targetPlayerIndex);
      if (!option?.selectable) return state;
      return {
        ...state,
        pendingDaifugoEffect: {
          ...pending,
          selectedTargetPlayerIndex: action.targetPlayerIndex,
        },
      };
    }

    case "confirmEnhancedFiveTarget": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "fiveEnhancedTargetSelect") return state;
      const targetPlayerIndex = pending.selectedTargetPlayerIndex;
      if (targetPlayerIndex === undefined || !state.players[targetPlayerIndex]) return state;
      return resolveEnhancedFiveSkip(state, pending.playerIndex, targetPlayerIndex);
    }

    case "drawForDaifugoEffect": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "effectDraw" || pending.playerIndex !== state.currentPlayerIndex) return state;
      const drawn = drawOneForPlayer(state, state.currentPlayerIndex);
      if (!drawn.drawnCard) return deckoutResult({ ...drawn.state, pendingDaifugoEffect: null }, drawn.state.players);

      if (pending.effect === "eightExtraTurn") {
        return {
          ...drawn.state,
          phase: "discard",
          pendingDaifugoEffect: {
            kind: "extraDiscard",
            effect: "eightExtraTurn",
            playerIndex: state.currentPlayerIndex,
          },
          declaredReachThisTurn: false,
          message: "8の効果：追加行動で1枚捨ててください。",
        };
      }

      const player = drawn.state.players[state.currentPlayerIndex];
      const winningResult = checkWinningHandWithOpenMelds(player.hand, player.openMelds, drawn.state.isJBackActive);
      if (winningResult.canWin) {
        const nextPlayer = { ...player, winningResult };
        const players = replacePlayer(drawn.state.players, state.currentPlayerIndex, nextPlayer);
        return makeWinningState({ ...drawn.state, pendingDaifugoEffect: null }, players, winningResult);
      }

      if (canDeclareReach(player.hand, player.hasCalled, player.isReach)) {
        return reachConfirmState({ ...drawn.state, pendingDaifugoEffect: null }, drawn.state.players);
      }

      return continueAfterDaifugo({ ...drawn.state, pendingDaifugoEffect: null }, pending.continue, drawn.state.players);
    }

    case "discardForDaifugoEffect": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "extraDiscard" || pending.playerIndex !== state.currentPlayerIndex) return state;
      const player = state.players[state.currentPlayerIndex];
      const discardCard = player.hand.find((card) => card.id === action.cardId);
      if (!discardCard) return state;
      if (pending.effect === "eightExtraTurn" && player.isReach && !state.declaredReachThisTurn && discardCard.id !== state.drawnCard?.id) {
        return state;
      }

      const handAfterDiscard = sortCards(player.hand.filter((card) => card.id !== discardCard.id));
      const winningResult = checkWinningHandWithOpenMelds(handAfterDiscard, player.openMelds, state.isJBackActive);
      const nextPlayer: Player = {
        ...player,
        hand: handAfterDiscard,
        discardPile: [...player.discardPile, discardCard],
        winningResult: winningResult.canWin ? winningResult : player.winningResult,
      };
      const players = replacePlayer(state.players, state.currentPlayerIndex, nextPlayer);

      if (winningResult.canWin) {
        return makeWinningState({ ...state, players, pendingDaifugoEffect: null }, players, winningResult);
      }

      if (state.deck.length === 0) {
        return deckoutResult({ ...state, players, pendingDaifugoEffect: null }, players);
      }

      if (pending.effect === "tenSwapDraw") {
        return {
          ...state,
          players,
          pendingDaifugoEffect: {
            kind: "effectDraw",
            effect: "tenSwapDraw",
            playerIndex: state.currentPlayerIndex,
            continue: pending.continue ?? { shouldConfirmReach: false },
          },
          drawnCard: null,
          drawnFrom: null,
          message: "10の効果：山札から1枚引きます。",
        };
      }

      const shouldConfirmReach =
        state.drawnFrom === "deck" &&
        !state.declaredReachThisTurn &&
        canDeclareReachAfterDraw(player.hand, player.hasCalled, player.isReach);
      if (shouldConfirmReach) {
        return reachConfirmState({ ...state, players, pendingDaifugoEffect: null }, players);
      }

      return advanceToNextDraw({ ...state, players, pendingDaifugoEffect: null }, players, state.currentPlayerIndex);
    }

    case "selectSevenExchangeCard": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "sevenExchange") return state;
      if (action.playerIndex !== pending.playerIndex && action.playerIndex !== pending.targetPlayerIndex) return state;
      const player = state.players[action.playerIndex];
      const candidates = getSevenExchangeCandidateCards(player, action.playerIndex === pending.playerIndex);
      if (!candidates.some((card) => card.id === action.cardId)) return state;
      return resolveSevenExchangeIfReady({
        ...state,
        pendingDaifugoEffect: {
          ...pending,
          selections: {
            ...pending.selections,
            [action.playerIndex]: action.cardId,
          },
        },
      });
    }

    case "selectQueenVanishRank": {
      if (!state.pendingDaifugoEffect || state.pendingDaifugoEffect.kind !== "queenSelect") return state;
      if (action.rank < 1 || action.rank > 13) return state;
      return resolveQueenNumberVanish(state, action.rank);
    }

    case "answerQueenWin": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "queenWinConfirm") return state;
      if (action.takeWin) {
        return makeWinningState(
          { ...state, pendingDaifugoEffect: null, currentPlayerIndex: pending.playerIndex, drawnFrom: "deck" },
          state.players,
          pending.winningResult,
        );
      }
      return continueAfterDaifugo(
        { ...state, pendingDaifugoEffect: null, currentPlayerIndex: pending.playerIndex },
        { ...pending.continue, shouldConfirmReach: false },
      );
    }

    case "selectJackSpecialEffect": {
      return resolveJackSpecialEffect(state, action.effect);
    }

    case "inspectJackCard": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "jackInspect") return state;
      const targetPlayerIndex = pending.targetPlayerIndexes[pending.currentTargetOffset];
      if (targetPlayerIndex !== action.targetPlayerIndex) return state;
      const target = state.players[targetPlayerIndex];
      if (!target?.hand.some((card) => card.id === action.cardId)) return state;
      if (pending.revealedCardIds[targetPlayerIndex]) return state;
      return {
        ...state,
        pendingDaifugoEffect: {
          ...pending,
          revealedCardIds: {
            ...pending.revealedCardIds,
            [targetPlayerIndex]: action.cardId,
          },
        },
      };
    }

    case "confirmJackInspectCard": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "jackInspect") return state;
      const targetPlayerIndex = pending.targetPlayerIndexes[pending.currentTargetOffset];
      if (targetPlayerIndex === undefined || !pending.revealedCardIds[targetPlayerIndex]) return state;
      const nextOffset = pending.currentTargetOffset + 1;
      const playerName = state.players[pending.playerIndex]?.name ?? "プレイヤー";
      if (nextOffset >= pending.targetPlayerIndexes.length) {
        return continueAfterDaifugo(
          { ...state, pendingDaifugoEffect: null },
          { ...pending.continue, shouldConfirmReach: false, message: `${playerName}が情報閲覧を完了しました。` },
        );
      }
      return {
        ...state,
        pendingDaifugoEffect: {
          ...pending,
          currentTargetOffset: nextOffset,
        },
        message: `${playerName}がJ効果で相手の手札を確認しています。`,
      };
    }

    case "answerReachContinue": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "reachContinueConfirm") return state;
      const player = state.players[pending.playerIndex];
      if (!player) return state;
      const players = action.keepReach ? state.players : replacePlayer(state.players, pending.playerIndex, { ...player, isReach: false });
      return {
        ...state,
        players,
        pendingDaifugoEffect: null,
        message: action.keepReach ? `${player.name}はリーチを継続しました。` : `${player.name}は通常状態に戻りました。`,
      };
    }

    case "drawFromDeck": {
      if (state.phase !== "draw") return state;
      if (state.deck.length === 0) return deckoutResult(state, state.players);
      const [drawnCard, ...deck] = state.deck;
      const player = state.players[state.currentPlayerIndex];
      const nextPlayer = { ...player, hand: sortCards([...player.hand, drawnCard]) };

      if (nextPlayer.hand.length !== player.hand.length + 1) {
        console.warn("Invalid draw state: drawing from deck did not add exactly one card to hand.");
        return state;
      }
      if (!player.hasCalled && nextPlayer.hand.length !== 11) {
        console.warn("Invalid state: discard phase requires 11 cards after drawing from deck.");
        return state;
      }

      return {
        ...state,
        deck,
        players: replacePlayer(state.players, state.currentPlayerIndex, nextPlayer),
        phase: "discard",
        drawnCard,
        drawnFrom: "deck",
        takenDiscardOwnerIndex: null,
        declaredReachThisTurn: false,
        message: player.isCpu ? `${player.name}（CPU）が山札から引きました。` : player.isReach
          ? "リーチ中です。上がれない場合は引いたカードをそのまま捨ててください。"
          : "捨てるカードを選んでください。",
      };
    }

    case "takeDiscard": {
      if (state.phase !== "draw") return state;
      const owner = state.players[action.ownerIndex];
      const discard = topDiscard(owner);
      if (!discard) return state;

      const ownerNext: Player = {
        ...owner,
        discardPile: owner.discardPile.slice(0, -1),
      };
      const player = state.players[state.currentPlayerIndex];
      let currentNext: Player;

      if (action.meld) {
        const handUsedIds = new Set(action.meld.filter((card) => card.id !== discard.id).map((card) => card.id));
        currentNext = {
          ...player,
          hand: sortCards(player.hand.filter((card) => !handUsedIds.has(card.id))),
          openMelds: [...player.openMelds, action.meld],
          hasCalled: true,
        };
      } else {
        currentNext = {
          ...player,
          hand: sortCards([...player.hand, discard]),
        };
      }

      const players = replacePlayer(
        replacePlayer(state.players, action.ownerIndex, ownerNext),
        state.currentPlayerIndex,
        currentNext,
      );

      return {
        ...state,
        players,
        phase: "discard",
        drawnCard: discard,
        drawnFrom: "discard",
        takenDiscardOwnerIndex: action.ownerIndex,
        declaredReachThisTurn: false,
        message: player.isCpu ? `${player.name}（CPU）が鳴きました。` : action.meld ? "鳴きました。捨てるカードを選んでください。" : "捨てるカードを選んでください。",
      };
    }

    case "declareReach": {
      if (state.phase !== "discard" || state.drawnFrom !== "deck") return state;
      const player = state.players[state.currentPlayerIndex];
      if (!canDeclareReachAfterDraw(player.hand, player.hasCalled, player.isReach)) return state;
      return {
        ...state,
        players: replacePlayer(state.players, state.currentPlayerIndex, { ...player, isReach: true }),
        declaredReachThisTurn: true,
        message: "リーチを宣言しました。1枚捨ててください。",
      };
    }

    case "answerReachAfterDiscard": {
      if (state.phase !== "reachConfirm") return state;
      const player = state.players[state.currentPlayerIndex];
      const players = action.declareReach
        ? replacePlayer(state.players, state.currentPlayerIndex, { ...player, isReach: true })
        : state.players;
      return advanceToNextDraw({ ...state, pendingDaifugoEffect: null }, players, state.currentPlayerIndex);
    }

    case "winWithDiscard": {
      if (state.phase !== "discard" || !state.drawnCard) return state;
      const player = state.players[state.currentPlayerIndex];
      const discardCard = player.hand.find((card) => card.id === action.discardCardId);
      if (!discardCard) return state;

      const options = findWinningDiscardsAfterDraw(player.hand, state.drawnCard.id, player.openMelds, state.isJBackActive);
      const option = options.find((item) => item.discardCard.id === discardCard.id);
      if (!option) return state;

      const nextPlayer: Player = {
        ...player,
        hand: sortCards(player.hand.filter((card) => card.id !== discardCard.id)),
        discardPile: [...player.discardPile, discardCard],
        winningResult: option.winningResult,
      };
      const nextState = {
        ...state,
        players: replacePlayer(state.players, state.currentPlayerIndex, nextPlayer),
        declaredReachThisTurn: false,
      };
      const result = makeResult(
        nextState,
        state.currentPlayerIndex,
        state.drawnFrom === "discard" ? "ron" : "tsumo",
        option.winningResult,
        state.drawnFrom === "discard" ? state.takenDiscardOwnerIndex : null,
        "winWithDiscard",
      );

      return { ...nextState, phase: "result", winner: state.currentPlayerIndex, result, pendingRonResult: null, pendingDaifugoEffect: null };
    }

    case "discard": {
      if (state.phase !== "discard") return state;
      const player = state.players[state.currentPlayerIndex];
      if (player.isReach && !state.declaredReachThisTurn) return state;

      const discardCard = player.hand.find((card) => card.id === action.cardId);
      if (!discardCard) return state;
      const shouldConfirmReach =
        state.drawnFrom === "deck" && canDeclareReachAfterDraw(player.hand, player.hasCalled, player.isReach);

      const handAfterDiscard = sortCards(player.hand.filter((card) => card.id !== discardCard.id));
      const winningResult = checkWinningHandWithOpenMelds(handAfterDiscard, player.openMelds, state.isJBackActive);
      const nextPlayer: Player = {
        ...player,
        hand: handAfterDiscard,
        discardPile: [...player.discardPile, discardCard],
        winningResult: winningResult.canWin ? winningResult : player.winningResult,
      };
      const players = replacePlayer(state.players, state.currentPlayerIndex, nextPlayer);
      const nextState = { ...state, players };

      if (winningResult.canWin) {
        const result = makeResult(
          nextState,
          state.currentPlayerIndex,
          state.drawnFrom === "discard" ? "ron" : "tsumo",
          winningResult,
          state.drawnFrom === "discard" ? state.takenDiscardOwnerIndex : null,
          "normalDiscard",
        );
        return {
          ...nextState,
          phase: "result",
          winner: state.currentPlayerIndex,
          result,
          pendingRonResult: null,
          declaredReachThisTurn: false,
        };
      }

      if (state.deck.length === 0) {
        return deckoutResult(nextState, players);
      }

      const continueState: PendingDaifugoContinue = {
        shouldConfirmReach,
        message: player.isCpu ? `${player.name} (CPU) discarded ${formatCpuCard(discardCard)}.` : undefined,
      };
      const pendingDaifugoEffect = createPendingDaifugoEffect(nextState, discardCard, continueState);
      if (pendingDaifugoEffect) {
        return {
          ...nextState,
          pendingDaifugoEffect,
          message: getDaifugoConfirmMessage(pendingDaifugoEffect.effect),
        };
      }

      if (shouldConfirmReach) {
        return {
          ...nextState,
          phase: "reachConfirm",
          drawnCard: null,
          drawnFrom: null,
          lastDiscarderIndex: state.currentPlayerIndex,
          takenDiscardOwnerIndex: null,
          declaredReachThisTurn: false,
          message: "リーチを宣言しますか？",
        };
      }

      return advanceToNextDraw(
        nextState,
        players,
        state.currentPlayerIndex,
        player.isCpu ? `${player.name}（CPU）が ${formatCpuCard(discardCard)} を捨てました。` : undefined,
      );
    }

    case "discardDrawnOnly": {
      if (state.phase !== "discard" || !state.drawnCard) return state;
      const player = state.players[state.currentPlayerIndex];
      if (!player.isReach || state.declaredReachThisTurn) return state;
      const options = findWinningDiscardsAfterDraw(player.hand, state.drawnCard.id, player.openMelds, state.isJBackActive);
      if (options.length > 0) return state;

      const nextPlayer: Player = {
        ...player,
        hand: sortCards(player.hand.filter((card) => card.id !== state.drawnCard?.id)),
        discardPile: [...player.discardPile, state.drawnCard],
      };
      const players = replacePlayer(state.players, state.currentPlayerIndex, nextPlayer);
      const nextState = { ...state, players };
      const continueState: PendingDaifugoContinue = {
        shouldConfirmReach: false,
        message: player.isCpu && state.drawnCard ? `${player.name} (CPU) discarded ${formatCpuCard(state.drawnCard)}.` : undefined,
      };
      const pendingDaifugoEffect = createPendingDaifugoEffect(nextState, state.drawnCard, continueState);
      if (pendingDaifugoEffect) {
        return {
          ...nextState,
          pendingDaifugoEffect,
          message: getDaifugoConfirmMessage(pendingDaifugoEffect.effect),
        };
      }

      return advanceToNextDraw(
        nextState,
        players,
        state.currentPlayerIndex,
        player.isCpu && state.drawnCard ? `${player.name}（CPU）が ${formatCpuCard(state.drawnCard)} を捨てました。` : undefined,
      );
    }

    default:
      return state;
  }
}

export function getReachWinningOptions(state: GameState) {
  const player = state.players[state.currentPlayerIndex];
  if (!player?.isReach || !state.drawnCard) return [];
  return findWinningDiscardsAfterDraw(player.hand, state.drawnCard.id, player.openMelds, state.isJBackActive);
}

export function getAvailableDiscardSources(state: GameState): number[] {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.isReach) {
    return [];
  }

  const previousIndex = getNextPlayerIndex(
    state.currentPlayerIndex,
    state.players.length,
    state.direction === "clockwise" ? "counterclockwise" : "clockwise",
  );

  const discard = topDiscard(state.players[previousIndex]);
  return discard && findCallMeldOptions(current.hand, discard).length > 0 ? [previousIndex] : [];
}

export function getCallOptionsForSource(state: GameState, ownerIndex: number): Card[][] {
  const current = state.players[state.currentPlayerIndex];
  const previousIndex = getNextPlayerIndex(
    state.currentPlayerIndex,
    state.players.length,
    state.direction === "clockwise" ? "counterclockwise" : "clockwise",
  );
  if (ownerIndex !== previousIndex) return [];
  const discard = topDiscard(state.players[ownerIndex]);
  if (!current || !discard || current.isReach) return [];
  return findCallMeldOptions(current.hand, discard);
}
