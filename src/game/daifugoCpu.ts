import type { Card, CpuModelId } from "../types";
import { calculateCardLoss } from "./scoring";
import { findPossibleMelds, getCardPenalty } from "./rules";
import type { CpuDecisionContext, DaifugoExchangeRole, DaifugoExtraDiscardEffect } from "./cpuTypes";

const JUNIOR_DAIFUGO_EFFECT_CHANCE = 0.25;

interface HandContribution {
  meldCards: Card[];
  pairCards: Card[];
  singleCards: Card[];
}

export function chooseJuniorDaifugoEffectActivation(): boolean {
  return Math.random() < JUNIOR_DAIFUGO_EFFECT_CHANCE;
}

export function chooseStandardDaifugoEffectActivation(): boolean {
  return true;
}

export function classifyDaifugoHandCards(cards: Card[]): HandContribution {
  const meldCards = uniqueCards(findPossibleMelds(cards).flat());
  const meldIds = new Set(meldCards.map((card) => card.id));
  const rankCounts = countRanks(cards);
  const pairCards = cards.filter((card) => !meldIds.has(card.id) && (rankCounts.get(card.rank) ?? 0) >= 2);
  const singleCards = cards.filter((card) => !meldIds.has(card.id) && (rankCounts.get(card.rank) ?? 0) === 1);

  return { meldCards, pairCards, singleCards };
}

export function chooseJuniorDaifugoCard(candidates: Card[], hand: Card[] = candidates): Card | null {
  if (candidates.length === 0) return null;
  const candidateIds = new Set(candidates.map((card) => card.id));
  const contribution = classifyDaifugoHandCards(hand);
  const singleCandidates = contribution.singleCards.filter((card) => candidateIds.has(card.id));
  if (singleCandidates.length > 0) return randomCard(singleCandidates);

  const pairCandidates = contribution.pairCards.filter((card) => candidateIds.has(card.id));
  if (pairCandidates.length > 0) return randomCard(pairCandidates);

  return randomCard(candidates);
}

export function chooseStandardDaifugoCard(context: CpuDecisionContext, candidates: Card[]): Card | null {
  if (candidates.length === 0) return null;
  const hand = context.currentPlayer.hand;
  return [...candidates].sort((a, b) => scoreStandardDaifugoCard(b, hand) - scoreStandardDaifugoCard(a, hand) || a.id.localeCompare(b.id))[0] ?? null;
}

export function chooseJuniorQueenRank(context: CpuDecisionContext, candidates: number[]): number | null {
  const validCandidates = candidates.filter((rank) => rank >= 1 && rank <= 13);
  if (validCandidates.length === 0) return null;
  const candidateRanks = new Set(validCandidates);
  const contribution = classifyDaifugoHandCards(context.currentPlayer.hand);
  const singleRanks = uniqueRanks(contribution.singleCards).filter((rank) => candidateRanks.has(rank));
  if (singleRanks.length > 0) return randomRank(singleRanks);

  const pairRanks = uniqueRanks(contribution.pairCards).filter((rank) => candidateRanks.has(rank));
  if (pairRanks.length > 0) return randomRank(pairRanks);

  const handRanks = uniqueRanks(context.currentPlayer.hand).filter((rank) => candidateRanks.has(rank));
  return randomRank(handRanks.length > 0 ? handRanks : validCandidates);
}

export function chooseStandardQueenRank(context: CpuDecisionContext, candidates: number[]): number | null {
  const validCandidates = candidates.filter((rank) => rank >= 1 && rank <= 13);
  if (validCandidates.length === 0) return null;

  const hand = context.currentPlayer.hand;
  const contribution = classifyDaifugoHandCards(hand);
  const meldRanks = new Set(contribution.meldCards.map((card) => card.rank));
  const rankScores = validCandidates.map((rank) => ({
    rank,
    score: scoreQueenRank(rank, hand, meldRanks),
  }));

  return rankScores.sort((a, b) => b.score - a.score || a.rank - b.rank)[0]?.rank ?? validCandidates[0] ?? null;
}

export function chooseTacticalQueenRank(context: CpuDecisionContext, candidates: number[]): number | null {
  const fallback = chooseStandardQueenRank(context, candidates);
  const pending = context.state.pendingDaifugoEffect;
  if (
    fallback === null ||
    !context.state.daifugoOptions.enabled ||
    !pending ||
    pending.kind !== "queenSelect" ||
    pending.playerIndex !== context.currentPlayerIndex ||
    !pending.cpuThreatResponseMode ||
    pending.cpuThreatTargetPlayerIndex === undefined
  ) {
    return fallback;
  }

  const target = context.state.players[pending.cpuThreatTargetPlayerIndex];
  if (!target) return fallback;

  const publicRanks = new Set([
    ...target.discardPile.map((card) => card.rank),
    ...target.openMelds.flat().map((card) => card.rank),
  ]);
  const ownRankCounts = countRanks(context.currentPlayer.hand);
  const validCandidates = candidates.filter((rank) => rank >= 1 && rank <= 13);
  if (shouldProtectOwnHandFromQueen(context)) {
    const zeroOwnThreatCandidates = validCandidates.filter((rank) => !publicRanks.has(rank) && !ownRankCounts.has(rank));
    if (zeroOwnThreatCandidates.length > 0) return zeroOwnThreatCandidates.sort((a, b) => a - b)[0] ?? fallback;

    const zeroOwnCandidates = validCandidates.filter((rank) => !ownRankCounts.has(rank));
    if (zeroOwnCandidates.length > 0) return zeroOwnCandidates.sort((a, b) => a - b)[0] ?? fallback;
  }

  const contribution = classifyDaifugoHandCards(context.currentPlayer.hand);
  const meldRanks = new Set(contribution.meldCards.map((card) => card.rank));
  const threatCandidates = validCandidates
    .filter((rank) => !publicRanks.has(rank) && (ownRankCounts.get(rank) ?? 0) > 0)
    .map((rank) => ({ rank, score: scoreQueenRank(rank, context.currentPlayer.hand, meldRanks) }))
    .sort((a, b) => b.score - a.score || a.rank - b.rank);

  return threatCandidates[0]?.rank ?? fallback;
}

export function chooseDaifugoSevenExchangeCardForModel(
  modelId: CpuModelId | undefined,
  context: CpuDecisionContext,
  candidates: Card[],
  role: DaifugoExchangeRole,
): Card | null {
  if (modelId === "easy") return chooseJuniorDaifugoCard(candidates, context.currentPlayer.hand);
  if (modelId === "tactical" && role === "initiator") return chooseTacticalSevenExchangeCard(context, candidates);
  return chooseStandardDaifugoCard(context, candidates);
}

export function chooseDaifugoExtraDiscardForModel(
  modelId: CpuModelId | undefined,
  context: CpuDecisionContext,
  _effect: DaifugoExtraDiscardEffect,
  candidates: Card[],
): Card | null {
  if (modelId === "easy") return chooseJuniorDaifugoCard(candidates, context.currentPlayer.hand);
  return chooseStandardDaifugoCard(context, candidates);
}

function scoreStandardDaifugoCard(card: Card, hand: Card[]): number {
  const sameRankCount = hand.filter((candidate) => candidate.rank === card.rank && candidate.id !== card.id).length;
  const neighborCount = hand.filter((candidate) => {
    return candidate.suit === card.suit && candidate.id !== card.id && Math.abs(candidate.rank - card.rank) <= 2;
  }).length;
  const suitCount = hand.filter((candidate) => candidate.suit === card.suit && candidate.id !== card.id).length;
  const highCardPenalty = getCardPenalty(card);

  return highCardPenalty * 2 - sameRankCount * 8 - neighborCount * 4 - suitCount;
}

function chooseTacticalSevenExchangeCard(context: CpuDecisionContext, candidates: Card[]): Card | null {
  const fallback = chooseStandardDaifugoCard(context, candidates);
  const pending = context.state.pendingDaifugoEffect;
  if (
    !fallback ||
    !pending ||
    pending.kind !== "sevenExchange" ||
    pending.playerIndex !== context.currentPlayerIndex
  ) {
    return fallback;
  }

  const target = context.state.players[pending.targetPlayerIndex];
  if (!target || (!target.isReach && target.openMelds.length < 2)) return fallback;

  const discardRanks = new Set(target.discardPile.map((card) => card.rank));
  const openMeldRanks = new Set(target.openMelds.flat().map((card) => card.rank));
  const rankedCandidates = candidates
    .map((card) => ({
      card,
      preservationRisk: getSevenExchangePreservationRisk(card, context.currentPlayer.hand),
      publicRankPriority: discardRanks.has(card.rank) ? 2 : openMeldRanks.has(card.rank) ? 1 : 0,
      discardScore: scoreStandardDaifugoCard(card, context.currentPlayer.hand),
    }))
    .filter((candidate) => candidate.publicRankPriority > 0);
  if (rankedCandidates.length === 0) return fallback;

  const bestPreservationRisk = Math.min(
    ...candidates.map((card) => getSevenExchangePreservationRisk(card, context.currentPlayer.hand)),
  );
  return (
    rankedCandidates
      .filter((candidate) => candidate.preservationRisk === bestPreservationRisk)
      .sort(
        (a, b) =>
          b.publicRankPriority - a.publicRankPriority ||
          b.discardScore - a.discardScore ||
          a.card.id.localeCompare(b.card.id),
      )[0]?.card ?? fallback
  );
}

function getSevenExchangePreservationRisk(card: Card, hand: Card[]): number {
  const meldIds = new Set(findPossibleMelds(hand).flat().map((candidate) => candidate.id));
  const sameRankCount = hand.filter((candidate) => candidate.rank === card.rank).length;
  const runCandidateCount = hand.filter(
    (candidate) =>
      candidate.id !== card.id &&
      candidate.suit === card.suit &&
      Math.abs(candidate.rank - card.rank) <= 2,
  ).length;
  return (meldIds.has(card.id) ? 100 : 0) + (sameRankCount >= 2 ? 30 : 0) + runCandidateCount * 5;
}

function shouldProtectOwnHandFromQueen(context: CpuDecisionContext): boolean {
  const contribution = classifyDaifugoHandCards(context.currentPlayer.hand);
  const pairRankCount = new Set(contribution.pairCards.map((card) => card.rank)).size;
  return context.currentPlayer.isReach || context.currentPlayer.openMelds.length >= 2 || (contribution.singleCards.length === 0 && pairRankCount >= 2);
}

function scoreQueenRank(rank: number, hand: Card[], meldRanks: Set<number>): number {
  const rankCards = hand.filter((card) => card.rank === rank);
  if (rankCards.length === 0) return -20;

  const bestDiscardScore = Math.max(...rankCards.map((card) => scoreStandardDaifugoCard(card, hand)));
  const countPenalty = rankCards.length >= 3 ? -18 : rankCards.length === 2 ? -8 : 12;
  const meldPenalty = meldRanks.has(rank) ? -80 : 0;
  const lossBonus = Math.max(...rankCards.map((card) => calculateCardLoss(card, false))) * 0.2;
  return bestDiscardScore + countPenalty + meldPenalty + lossBonus;
}

function countRanks(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function uniqueCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

function uniqueRanks(cards: Card[]): number[] {
  return [...new Set(cards.map((card) => card.rank))];
}

function randomCard(cards: Card[]): Card | null {
  return cards[Math.floor(Math.random() * cards.length)] ?? null;
}

function randomRank(ranks: number[]): number | null {
  return ranks[Math.floor(Math.random() * ranks.length)] ?? null;
}
