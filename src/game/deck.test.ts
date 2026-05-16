import { describe, expect, it } from "vitest";
import { createDeck, dealCards } from "./deck";
import { gameReducer } from "./gameState";

describe("deck and game state card counts", () => {
  it("creates an initial deck with 104 cards", () => {
    expect(createDeck()).toHaveLength(104);
  });

  it("deals 10 initial hand cards to each player", () => {
    const state = dealCards(createDeck(), 4);

    expect(state.players).toHaveLength(4);
    expect(state.players.every((player) => player.hand.length === 10)).toBe(true);
  });

  it("adds one card to the current player's hand when drawing from the deck", () => {
    const state = dealCards(createDeck(), 4);
    const beforeHandCount = state.players[state.currentPlayerIndex].hand.length;
    const beforeDeckCount = state.deck.length;

    const nextState = gameReducer(state, { type: "drawFromDeck" });

    expect(nextState.players[nextState.currentPlayerIndex].hand).toHaveLength(beforeHandCount + 1);
    expect(nextState.deck).toHaveLength(beforeDeckCount - 1);
  });

  it("removes one card from hand and adds one card to the discard pile when discarding", () => {
    const drawnState = gameReducer(dealCards(createDeck(), 4), { type: "drawFromDeck" });
    const player = drawnState.players[drawnState.currentPlayerIndex];
    const discardCard = player.hand[0];

    const nextState = gameReducer(drawnState, { type: "discard", cardId: discardCard.id });
    const nextPlayer = nextState.players[drawnState.currentPlayerIndex];

    expect(nextPlayer.hand).toHaveLength(player.hand.length - 1);
    expect(nextPlayer.discardPile).toHaveLength(player.discardPile.length + 1);
    expect(nextPlayer.discardPile.at(-1)).toEqual(discardCard);
  });
});
