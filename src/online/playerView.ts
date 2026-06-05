import type { Card, DaifugoEffectEvent, GameResult, GameState, Player, WinningResult } from "../types";

function maskCards(cards: Card[], visible: boolean): Card[] {
  return visible ? cards : [];
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

function maskPlayer(player: Player, visible: boolean): Player {
  return {
    ...player,
    type: visible ? player.type : "cpu",
    isCpu: visible ? player.isCpu : true,
    hand: maskCards(player.hand, visible),
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
  return {
    ...fullState,
    deck: [],
    drawnCard: fullState.currentPlayerIndex === viewerIndex ? fullState.drawnCard : null,
    players: fullState.players.map((player, index) => maskPlayer(player, index === viewerIndex)),
    result: maskGameResult(fullState.result, viewerIndex),
    pendingRonResult: maskGameResult(fullState.pendingRonResult, viewerIndex),
    daifugoEffectEvent: maskDaifugoEvent(fullState.daifugoEffectEvent, viewerIndex),
    showCpuActions: false,
  };
}
