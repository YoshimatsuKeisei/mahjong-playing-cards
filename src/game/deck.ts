import type { Card, CpuModelId, Direction, GameState, Player, Suit } from "../types";

const suits: Suit[] = ["S", "H", "D", "C"];

export function createDeck(): Card[] {
  const cards: Card[] = [];

  for (let deckNo = 1; deckNo <= 2; deckNo += 1) {
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank += 1) {
        cards.push({
          id: `${deckNo}-${suit}-${rank}`,
          suit,
          rank,
        });
      }
    }
  }

  return cards;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

export function sortCards(cards: Card[]): Card[] {
  const suitOrder: Suit[] = ["S", "H", "D", "C"];
  return [...cards].sort((a, b) => {
    const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    return suitDiff || a.rank - b.rank || a.id.localeCompare(b.id);
  });
}

export function dealCards(
  deck: Card[],
  playerCount: number,
  direction: Direction = "clockwise",
  humanPlayerCount = playerCount,
  cpuModelId: CpuModelId = "standard",
): GameState {
  const players: Player[] = Array.from({ length: playerCount }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `プレイヤー${index + 1}`,
    type: index < humanPlayerCount ? "human" : "cpu",
    isCpu: index >= humanPlayerCount,
    cpuModelId: index >= humanPlayerCount ? cpuModelId : undefined,
    hand: [],
    discardPile: [],
    openMelds: [],
    hasCalled: false,
    isReach: false,
  }));

  const dealSource = [...deck];
  for (let round = 0; round < 10; round += 1) {
    for (const [playerIndex, player] of players.entries()) {
      const card = dealSource.shift();
      if (card) {
        player.hand.push({
          ...card,
          id: `initial-${playerIndex + 1}-${round + 1}-${card.id}`,
        });
      }
    }
  }

  return {
    players: players.map((player) => ({ ...player, hand: sortCards(player.hand) })),
    deck,
    currentPlayerIndex: 0,
    direction,
    phase: "draw",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: null,
    takenDiscardOwnerIndex: null,
    winner: null,
    result: null,
    pendingRonResult: null,
    declaredReachThisTurn: false,
    message: "カードを1枚取ってください。",
  };
}
