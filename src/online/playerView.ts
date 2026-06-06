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

function maskWinningResult(result: WinningResult | undefined, visible: boolean): WinningResult | undefined {
  if (!result) return undefined;
  if (visible) return result;
  return {
    canWin: result.canWin,
    melds: [],
    keyCard: null,
  };
}

function maskPlayer(player: Player, visible: boolean, ownerIndex: number): Player {
  return {
    ...player,
    hand: maskCards(player.hand, visible, ownerIndex),
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
      discardedCards: item.playerIndex === viewerIndex ? item.discardedCards : [],
      drawnCards: item.playerIndex === viewerIndex ? item.drawnCards : [],
    })),
  };
}

function isPendingEffectVisible(pending: PendingDaifugoEffect | null, viewerIndex: number): boolean {
  if (!pending) return false;
  if ("playerIndex" in pending && pending.playerIndex === viewerIndex) return true;
  if (pending.kind === "sevenExchange" && pending.targetPlayerIndex === viewerIndex) return true;
  if (pending.kind === "jackInspect") {
    const targetPlayerIndex = pending.targetPlayerIndexes[pending.currentTargetOffset];
    return targetPlayerIndex === viewerIndex;
  }
  return false;
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
    availableActions.push(fullState.pendingDaifugoEffect.kind);
    if (fullState.pendingDaifugoEffect.kind === "queenWinConfirm") availableActions.push("answerQueenWin");
    if (fullState.pendingDaifugoEffect.kind === "confirm") availableActions.push("answerDaifugoEffect");
    if (fullState.pendingDaifugoEffect.kind === "effectDraw") availableActions.push("drawForDaifugoEffect");
    if (fullState.pendingDaifugoEffect.kind === "extraDiscard") availableActions.push("discardForDaifugoEffect");
    if (fullState.pendingDaifugoEffect.kind === "queenSelect") availableActions.push("selectQueenVanishRank");
  }

  const canSelfWin = winningDiscardOptions.length > 0;
  const visiblePendingRon =
    viewerIndex >= 0 && reaction?.canRon ? maskGameResult(fullState.pendingRonResult, viewerIndex) : null;

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
    pendingDaifugoEffect: isPendingEffectVisible(fullState.pendingDaifugoEffect, viewerIndex) ? fullState.pendingDaifugoEffect : null,
    players: fullState.players.map((player, index) => maskPlayer(player, index === viewerIndex, index)),
    result: maskGameResult(fullState.result, viewerIndex),
    pendingRonResult: visiblePendingRon,
    daifugoEffectEvent: maskDaifugoEvent(fullState.daifugoEffectEvent, viewerIndex),
    showCpuActions: false,
  };
}
