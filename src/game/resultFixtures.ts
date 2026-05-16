import type { Card, GameState, Player, WinningResult } from "../types";

function card(id: string, rank: number, suit: Card["suit"] = "S"): Card {
  return { id, rank, suit };
}

function player(index: number, hand: Card[], discardPile: Card[] = []): Player {
  return {
    id: `player-${index}`,
    name: `プレイヤー${index}`,
    hand,
    discardPile,
    openMelds: [],
    hasCalled: false,
    isReach: index === 1 || index === 3,
  };
}

function winningResult(keyCard: Card): WinningResult {
  return {
    canWin: true,
    melds: [],
    keyCard,
  };
}

export function createDoubleRonResultFixture(): GameState {
  const player1KeyCard = card("p1-key-7", 7, "D");
  const player3KeyCard = card("p3-key-5", 5, "S");
  const discardCard = card("discard-8", 8, "H");
  const players = [
    player(1, [player1KeyCard, card("p1-9s", 9, "S"), card("p1-9h", 9, "H"), card("p1-qh", 12, "H")]),
    player(2, [card("p2-8s", 8, "S"), card("p2-3d", 3, "D"), card("p2-3c", 3, "C")], [discardCard]),
    player(3, [player3KeyCard, card("p3-qd", 12, "D"), card("p3-qc", 12, "C"), card("p3-10c", 10, "C")]),
  ];
  const player1WinningResult = winningResult(player1KeyCard);
  const player3WinningResult = winningResult(player3KeyCard);

  return {
    players,
    deck: [],
    currentPlayerIndex: 0,
    direction: "clockwise",
    phase: "result",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: 1,
    takenDiscardOwnerIndex: null,
    winner: 0,
    result: {
      winnerIndex: 0,
      winType: "ron",
      winningResult: player1WinningResult,
      score: {
        winnerScore: 2100,
        playerLosses: [7, 28, 16],
      },
      discarderIndex: 1,
      ronResults: [
        {
          winnerIndex: 0,
          winningResult: player1WinningResult,
          score: {
            winnerScore: 2100,
            playerLosses: [7, 28, 16],
          },
        },
        {
          winnerIndex: 2,
          winningResult: player3WinningResult,
          score: {
            winnerScore: 2300,
            playerLosses: [7, 28, 5],
          },
        },
      ],
    },
    pendingRonResult: null,
    declaredReachThisTurn: false,
    message: "Wロン結果確認用",
  };
}
