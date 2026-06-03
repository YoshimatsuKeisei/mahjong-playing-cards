import type { GameState, Player } from "../types";

const RANKS = Array.from({ length: 13 }, (_, index) => index + 1);
const DECK_BASE_PER_RANK = 8;
const INITIAL_HAND_SIZE_PER_PLAYER = 10;

export type RankCountMap = Record<number, number>;

export interface MasterRankEstimate {
  deckBaseByRank: RankCountMap;
  estimatedInitialHandByRank: RankCountMap;
  estimatedTotalByRank: RankCountMap;
  knownVisibleByRank: RankCountMap;
  estimatedUnseenByRank: RankCountMap;
  targetPublicByRank: Record<string, RankCountMap>;
}

export function createMasterRankEstimate(
  state: Pick<GameState, "players" | "queenVanishedRanks">,
  masterPlayerIndex: number,
): MasterRankEstimate {
  const deckBaseByRank = createRankMap(() => DECK_BASE_PER_RANK);
  const estimatedInitialPerRank = state.players.length * INITIAL_HAND_SIZE_PER_PLAYER / RANKS.length;
  const estimatedInitialHandByRank = createRankMap(() => estimatedInitialPerRank);
  const estimatedTotalByRank = createRankMap((rank) => deckBaseByRank[rank] + estimatedInitialHandByRank[rank]);
  const knownVisibleByRank = createRankMap();
  const targetPublicByRank = Object.fromEntries(
    state.players.map((player) => [player.id, countPlayerPublicRanks(player)]),
  );

  addCards(knownVisibleByRank, state.players[masterPlayerIndex]?.hand ?? []);
  state.players.forEach((player) => {
    addCards(knownVisibleByRank, player.discardPile);
    addCards(knownVisibleByRank, player.openMelds.flat());
  });

  for (const rank of state.queenVanishedRanks ?? []) {
    knownVisibleByRank[rank] = Math.max(knownVisibleByRank[rank], estimatedTotalByRank[rank]);
  }

  const estimatedUnseenByRank = createRankMap((rank) =>
    Math.max(0, estimatedTotalByRank[rank] - knownVisibleByRank[rank]),
  );

  return {
    deckBaseByRank,
    estimatedInitialHandByRank,
    estimatedTotalByRank,
    knownVisibleByRank,
    estimatedUnseenByRank,
    targetPublicByRank,
  };
}

export function formatEstimatedUnseenByRank(estimate: MasterRankEstimate): string {
  return RANKS.map((rank) => `${formatRank(rank)}=${estimate.estimatedUnseenByRank[rank].toFixed(2)}`).join(",");
}

function countPlayerPublicRanks(player: Player): RankCountMap {
  const counts = createRankMap();
  addCards(counts, player.discardPile);
  addCards(counts, player.openMelds.flat());
  return counts;
}

function createRankMap(getValue: (rank: number) => number = () => 0): RankCountMap {
  return Object.fromEntries(RANKS.map((rank) => [rank, getValue(rank)]));
}

function addCards(counts: RankCountMap, cards: Player["hand"]): void {
  cards.forEach((card) => {
    counts[card.rank] = (counts[card.rank] ?? 0) + 1;
  });
}

function formatRank(rank: number): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}
