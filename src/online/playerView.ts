import type { Card, DaifugoEffectEvent, GameResult, GameState, PendingDaifugoEffect, Player, PlayerReactionView, WinningResult } from "../types";
import { getAvailableDiscardSources, getCallOptionsForSource, getQueenVanishRankOptions, getWinningDiscardOptions } from "../game/gameState";
import { canDeclareReachAfterDraw, isRun } from "../game/rules";

function maskCards(cards: Card[], visible: boolean, ownerIndex: number): Card[] {
  if (visible) return cards;
  return cards.map((card, index) => ({
    id: `hidden-hand-${ownerIndex}-${index}`,
    suit: "S",
    rank: 0,
    discardedByEffect: card.discardedByEffect,
  }));
}

function maskCardsForJackInspect(cards: Card[], revealedCardId: string | null): Card[] {
  return cards.map((card) =>
    card.id === revealedCardId
      ? card
      : {
          id: card.id,
          suit: "S",
          rank: 0,
          discardedByEffect: card.discardedByEffect,
        },
  );
}

function maskWinningResult(result: WinningResult | undefined, visible: boolean): WinningResult | undefined {
  if (!result) return undefined;
  if (visible) return result;
  return {
    canWin: result.canWin,
    melds: [],
    keyCard: null,
  };
}

function maskPlayer(player: Player, visible: boolean, ownerIndex: number, jackInspectRevealedCardId?: string | null): Player {
  return {
    ...player,
    hand: jackInspectRevealedCardId !== undefined ? maskCardsForJackInspect(player.hand, jackInspectRevealedCardId) : maskCards(player.hand, visible, ownerIndex),
    winningResult: maskWinningResult(player.winningResult, visible),
    jShield: visible ? player.jShield : undefined,
  };
}

function maskGameResult(result: GameResult | null, viewerIndex: number): GameResult | null {
  if (!result) return null;
  const viewerWon = result.winnerIndex === viewerIndex || result.ronResults?.some((ron) => ron.winnerIndex === viewerIndex);
  if (viewerWon || result.winType === "deckout") return result;
  return {
    ...result,
    winningResult: {
      canWin: result.winningResult.canWin,
      melds: [],
      keyCard: null,
    },
    ronResults: result.ronResults?.map((ron) => ({
      ...ron,
      winningResult:
        ron.winnerIndex === viewerIndex
          ? ron.winningResult
          : {
              canWin: ron.winningResult.canWin,
              melds: [],
              keyCard: null,
            },
    })),
  };
}

function maskDaifugoEvent(event: DaifugoEffectEvent | null | undefined, viewerIndex: number): DaifugoEffectEvent | null | undefined {
  if (!event) return event;
  return {
    ...event,
    exchangedCards: event.exchangedCards?.map((item) => ({
      ...item,
      receivedCard: item.playerIndex === viewerIndex ? item.receivedCard : { ...item.receivedCard, id: `hidden-${item.playerIndex}` },
    })),
    queenDiscardResults: event.queenDiscardResults?.map((item) => ({
      ...item,
      discardedCards: item.discardedCards,
      drawnCards: item.playerIndex === viewerIndex ? item.drawnCards : [],
    })),
  };
}

function isPendingEffectVisible(pending: PendingDaifugoEffect | null, viewerIndex: number): boolean {
  if (!pending) return false;
  if (pending.kind === "sevenExchange") return true;
  if ("playerIndex" in pending && pending.playerIndex === viewerIndex) return true;
  return false;
}

function maskPendingDaifugoEffect(pending: PendingDaifugoEffect | null, viewerIndex: number): PendingDaifugoEffect | null {
  if (!isPendingEffectVisible(pending, viewerIndex)) return null;
  if (pending?.kind === "sevenExchange") {
    const selections = Object.fromEntries(
      Object.entries(pending.selections).map(([playerIndex, cardId]) => [playerIndex, Number(playerIndex) === viewerIndex ? cardId : "__selected__"]),
    );
    return {
      ...pending,
      selections,
    };
  }
  return pending;
}

function createReactionView(fullState: GameState, viewerIndex: number): PlayerReactionView | null {
  const callCandidates =
    viewerIndex === fullState.currentPlayerIndex && fullState.phase === "draw"
      ? getAvailableDiscardSources(fullState).flatMap((ownerIndex) => {
          const sourceDiscard = fullState.players[ownerIndex]?.discardPile.at(-1) ?? null;
          if (!sourceDiscard) return [];
          return getCallOptionsForSource(fullState, ownerIndex).map((meld) => ({
            ownerIndex,
            sourceDiscard,
            meld,
            meldType: isRun(meld) ? ("run" as const) : ("triple" as const),
          }));
        })
      : [];

  const ronResult = fullState.phase === "ronCheck" ? fullState.pendingRonResult : null;
  const ronItems = ronResult?.ronResults ?? [];
  const viewerRon = ronItems.find((item) => item.winnerIndex === viewerIndex);
  const discarderIndex = ronResult?.discarderIndex ?? null;
  const discardCard = discarderIndex !== null ? fullState.players[discarderIndex]?.discardPile.at(-1) ?? null : null;
  const ronCandidates =
    viewerRon && discarderIndex !== null && discardCard
      ? [
          {
            discarderIndex,
            discardCard,
            winningResult: viewerRon.winningResult,
          },
        ]
      : [];

  if (callCandidates.length === 0 && ronCandidates.length === 0) return null;
  return {
    waiting: fullState.phase === "draw" || fullState.phase === "ronCheck",
    canCall: callCandidates.length > 0,
    callCandidates,
    canRon: ronCandidates.length > 0,
    ronCandidates,
    canPass: true,
    targetDiscard: callCandidates[0]?.sourceDiscard ?? ronCandidates[0]?.discardCard ?? null,
  };
}

export function createPlayerViewState(fullState: GameState, viewerPlayerId: string): GameState {
  const viewerIndex = fullState.players.findIndex((player) => player.id === viewerPlayerId);
  const availableActions: string[] = [];
  const winningDiscardOptions =
    viewerIndex === fullState.currentPlayerIndex && fullState.phase === "discard" ? getWinningDiscardOptions(fullState) : [];
  const reaction = viewerIndex >= 0 ? createReactionView(fullState, viewerIndex) : null;
  const viewerPlayer = fullState.players[viewerIndex];
  const canReach =
    viewerIndex === fullState.currentPlayerIndex &&
    fullState.phase === "discard" &&
    fullState.drawnFrom === "deck" &&
    winningDiscardOptions.length === 0 &&
    Boolean(viewerPlayer) &&
    canDeclareReachAfterDraw(viewerPlayer.hand, viewerPlayer.hasCalled, viewerPlayer.isReach);
  if (viewerIndex === fullState.currentPlayerIndex && fullState.phase === "draw" && fullState.deck.length > 0) {
    availableActions.push("drawFromDeck");
    if (reaction?.canCall) {
      availableActions.push("takeDiscard");
      availableActions.push("passReaction");
    }
  }
  if (viewerIndex === fullState.currentPlayerIndex && fullState.phase === "discard") {
    availableActions.push("discard");
    if (winningDiscardOptions.length > 0) {
      availableActions.push("winWithDiscard");
      availableActions.push("tsumo");
    }
    if (canReach) {
      availableActions.push("declareReach");
    }
    const player = fullState.players[viewerIndex];
    if (player?.isReach && !fullState.declaredReachThisTurn && winningDiscardOptions.length === 0) {
      availableActions.push("discardDrawnOnly");
    }
  }
  if (viewerIndex === fullState.currentPlayerIndex && fullState.phase === "reachConfirm") {
    availableActions.push("answerReachAfterDiscard");
  }
  if (reaction?.canRon) {
    availableActions.push("answerRon");
    availableActions.push("passReaction");
  }
  if (fullState.pendingDaifugoEffect && isPendingEffectVisible(fullState.pendingDaifugoEffect, viewerIndex)) {
    const pending = fullState.pendingDaifugoEffect;
    const isSevenParticipant = pending.kind === "sevenExchange" && (pending.playerIndex === viewerIndex || pending.targetPlayerIndex === viewerIndex);
    if (pending.kind !== "sevenExchange" || isSevenParticipant) {
      availableActions.push(pending.kind);
    }
    if (pending.kind === "queenWinConfirm") availableActions.push("answerQueenWin");
    if (pending.kind === "confirm") availableActions.push("answerDaifugoEffect");
    if (pending.kind === "effectDraw") availableActions.push("drawForDaifugoEffect");
    if (pending.kind === "extraDiscard") availableActions.push("discardForDaifugoEffect");
    if (pending.kind === "queenSelect") availableActions.push("selectQueenVanishRank");
  }

  const canSelfWin = winningDiscardOptions.length > 0;
  const visiblePendingRon =
    viewerIndex >= 0 && reaction?.canRon ? maskGameResult(fullState.pendingRonResult, viewerIndex) : null;
  const visiblePendingDaifugoEffect = maskPendingDaifugoEffect(fullState.pendingDaifugoEffect, viewerIndex);
  const jackInspectTargetIndex =
    fullState.pendingDaifugoEffect?.kind === "jackInspect" && fullState.pendingDaifugoEffect.playerIndex === viewerIndex
      ? fullState.pendingDaifugoEffect.targetPlayerIndexes[fullState.pendingDaifugoEffect.currentTargetOffset]
      : null;

  return {
    ...fullState,
    deck: [],
    deckRemaining: fullState.deck.length,
    stateVersion: fullState.stateVersion ?? 0,
    viewerPlayerId,
    availableActions,
    canTsumo: canSelfWin && fullState.drawnFrom === "deck",
    canSelfWin,
    canReach,
    winningDiscardOptions,
    reaction,
    queenVanishRankOptions:
      fullState.pendingDaifugoEffect?.kind === "queenSelect" && fullState.pendingDaifugoEffect.playerIndex === viewerIndex
        ? getQueenVanishRankOptions(fullState)
        : undefined,
    drawnCard: fullState.currentPlayerIndex === viewerIndex ? fullState.drawnCard : null,
    pendingDaifugoEffect: visiblePendingDaifugoEffect,
    players: fullState.players.map((player, index) =>
      maskPlayer(
        player,
        index === viewerIndex,
        index,
        index === jackInspectTargetIndex && fullState.pendingDaifugoEffect?.kind === "jackInspect"
          ? fullState.pendingDaifugoEffect.revealedCardIds[index] ?? null
          : undefined,
      ),
    ),
    result: maskGameResult(fullState.result, viewerIndex),
    pendingRonResult: visiblePendingRon,
    daifugoEffectEvent: maskDaifugoEvent(fullState.daifugoEffectEvent, viewerIndex),
    showCpuActions: false,
  };
}
