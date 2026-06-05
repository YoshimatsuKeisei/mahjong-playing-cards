import type { Card, DaifugoEffectEvent, GameResult, GameState, Player, WinningResult } from "../types";

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

export function createPlayerViewState(fullState: GameState, viewerPlayerId: string): GameState {
  const viewerIndex = fullState.players.findIndex((player) => player.id === viewerPlayerId);
  const availableActions: string[] = [];
  if (viewerIndex === fullState.currentPlayerIndex && fullState.phase === "draw" && fullState.deck.length > 0) {
    availableActions.push("drawFromDeck");
  }
  if (viewerIndex === fullState.currentPlayerIndex && fullState.phase === "discard") {
    availableActions.push("discard");
  }

  return {
    ...fullState,
    deck: [],
    deckRemaining: fullState.deck.length,
    stateVersion: fullState.stateVersion ?? 0,
    viewerPlayerId,
    availableActions,
    drawnCard: fullState.currentPlayerIndex === viewerIndex ? fullState.drawnCard : null,
    players: fullState.players.map((player, index) => maskPlayer(player, index === viewerIndex, index)),
    result: maskGameResult(fullState.result, viewerIndex),
    pendingRonResult: maskGameResult(fullState.pendingRonResult, viewerIndex),
    daifugoEffectEvent: maskDaifugoEvent(fullState.daifugoEffectEvent, viewerIndex),
    showCpuActions: false,
  };
}
