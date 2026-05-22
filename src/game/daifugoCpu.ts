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

export function chooseDaifugoSevenExchangeCardForModel(
  modelId: CpuModelId | undefined,
  context: CpuDecisionContext,
  candidates: Card[],
  _role: DaifugoExchangeRole,
): Card | null {
  if (modelId === "easy") return chooseJuniorDaifugoCard(candidates, context.currentPlayer.hand);
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
