import type { Card } from "../types";
import { countMaxMelds, findPossibleMelds } from "./rules";
import type { CpuCallChoice, CpuDecisionContext, CpuModel } from "./cpuTypes";
import {
  getCpuDiscardCandidates,
  standardChooseCpuCall,
  standardChooseCpuWinningDiscard,
  standardShouldCpuWin,
} from "./standardCpu";

const EASY_CALL_CHANCE = 0.35;
const EASY_REACH_CHANCE = 0.5;
const EASY_DAIFUGO_EFFECT_CHANCE = 0.25;

export function easyChooseCpuCall(context: CpuDecisionContext): CpuCallChoice | null {
  const standardCall = standardChooseCpuCall(context);
  if (!standardCall) return null;

  const { currentPlayer: player } = context;
  if (isAlreadyOpenMeld(player.openMelds, standardCall.meld)) return null;

  const currentMeldCount = countMaxMelds(player.hand) + player.openMelds.length;
  const handAfterCall = getHandAfterCall(player.hand, standardCall.meld);
  const nextMeldCount = countMaxMelds(handAfterCall) + player.openMelds.length + 1;
  if (nextMeldCount <= currentMeldCount) return null;

  return Math.random() < EASY_CALL_CHANCE ? standardCall : null;
}

export function easyShouldCpuCall(context: CpuDecisionContext): boolean {
  return easyChooseCpuCall(context) !== null;
}

export function easyChooseCpuDrawSource(context: CpuDecisionContext) {
  const call = easyChooseCpuCall(context);
  if (call) {
    return { type: "takeDiscard" as const, ownerIndex: call.ownerIndex, meld: call.meld };
  }
  return { type: "drawFromDeck" as const };
}

export function easyChooseCpuDiscardCard(context: CpuDecisionContext): Card | null {
  const candidates = getCpuDiscardCandidates(context);
  if (candidates.length === 0) return null;

  const protectedIds = getProtectedMeldCardIds(candidates);
  const looseCandidates = candidates.filter((card) => !protectedIds.has(card.id));
  const pool = looseCandidates.length > 0 ? looseCandidates : candidates;
  const rankCounts = countRanks(pool);
  const singleRankCards = pool.filter((card) => rankCounts.get(card.rank) === 1);
  const finalPool = singleRankCards.length > 0 ? singleRankCards : pool;

  return finalPool[Math.floor(Math.random() * finalPool.length)] ?? null;
}

export function easyChooseReachDeclaration(): boolean {
  return Math.random() < EASY_REACH_CHANCE;
}

export function easyChooseDaifugoEffectActivation(): boolean {
  return Math.random() < EASY_DAIFUGO_EFFECT_CHANCE;
}

function getProtectedMeldCardIds(cards: Card[]): Set<string> {
  const meld = findPossibleMelds(cards)[0];
  return new Set(meld?.map((card) => card.id) ?? []);
}

function countRanks(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function getHandAfterCall(hand: Card[], meld: Card[]): Card[] {
  const discard = meld.find((card) => !hand.some((handCard) => handCard.id === card.id));
  if (!discard) return hand;
  const handUsedIds = new Set(meld.filter((card) => card.id !== discard.id).map((card) => card.id));
  return hand.filter((card) => !handUsedIds.has(card.id));
}

function isAlreadyOpenMeld(openMelds: Card[][], meld: Card[]): boolean {
  const signature = meldSignature(meld);
  return openMelds.some((openMeld) => meldSignature(openMeld) === signature);
}

function meldSignature(meld: Card[]): string {
  return meld.map((card) => `${card.suit}-${card.rank}`).sort().join("|");
}

export const easyCpuModel: CpuModel = {
  id: "easy",
  name: "Easy CPU",
  chooseWinningDiscard: standardChooseCpuWinningDiscard,
  shouldWin: standardShouldCpuWin,
  chooseCall: easyChooseCpuCall,
  shouldCall: easyShouldCpuCall,
  chooseDrawSource: easyChooseCpuDrawSource,
  chooseDiscardCard: easyChooseCpuDiscardCard,
  chooseReachDeclaration: easyChooseReachDeclaration,
  chooseDaifugoEffectActivation: easyChooseDaifugoEffectActivation,
};
