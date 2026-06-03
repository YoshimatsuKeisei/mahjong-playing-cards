import type { Card, GameState } from "../types";
import { getCpuModel } from "../game/cpuModelRegistry";
import { createCpuDecisionContext } from "../game/cpuTypes";
import {
  chooseCpuQueenRank,
  getQueenVanishRankOptions,
  type GameAction,
} from "../game/gameState";
import { getCpuDiscardCandidates } from "../game/standardCpu";
import { getTacticalDiscardScores } from "../game/tacticalCpu";

export interface HeadlessDecision {
  action: GameAction | null;
  reason?: string;
}

function formatCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function describeTacticalCandidates(state: GameState): string | undefined {
  const context = createCpuDecisionContext(state);
  if (!context || (context.currentPlayer.cpuModelId !== "tactical" && context.currentPlayer.cpuModelId !== "master") || state.phase !== "discard") return undefined;
  return getTacticalDiscardScores(context)
    .map((item) => `${formatCard(item.card)}=${item.score.toFixed(1)}(${item.notes.join(",")})`)
    .join("; ");
}

export function chooseHeadlessCpuAction(state: GameState): HeadlessDecision {
  if (state.phase === "result") return { action: null };
  if (state.phase === "handoff") return { action: { type: "confirmHandoff" } };

  const context = createCpuDecisionContext(state);
  if (!context || !context.currentPlayer.isCpu) {
    return { action: null, reason: "Headless simulation encountered a non-CPU current player." };
  }
  const model = getCpuModel(context.currentPlayer.cpuModelId);
  const pending = state.pendingDaifugoEffect;

  if (pending?.kind === "confirm") {
    return {
      action: {
        type: "answerDaifugoEffect",
        activate: model.chooseDaifugoEffectActivation?.(context, pending.effect) ?? true,
      },
    };
  }
  if (pending?.kind === "queenSelect") {
    const candidates = getQueenVanishRankOptions(state).filter((option) => option.selectable).map((option) => option.rank);
    return {
      action: {
        type: "selectQueenVanishRank",
        rank: model.chooseQueenVanishRank?.(context, candidates) ?? chooseCpuQueenRank(state, state.currentPlayerIndex),
      },
    };
  }
  if (pending?.kind === "queenWinConfirm") return { action: { type: "answerQueenWin", takeWin: true } };
  if (pending?.kind === "effectDraw") return { action: { type: "drawForDaifugoEffect" } };
  if (pending?.kind === "reachContinueConfirm") return { action: { type: "answerReachContinue", keepReach: true } };
  if (pending?.kind === "extraDiscard") {
    const winningDiscard = pending.effect === "eightExtraTurn" ? model.chooseWinningDiscard(context) : null;
    if (winningDiscard) return { action: { type: "winWithDiscard", discardCardId: winningDiscard.id } };
    const candidates = getCpuDiscardCandidates(context);
    const discard =
      (pending.effect === "eightExtraTurn" && context.currentPlayer.isReach && !state.declaredReachThisTurn ? state.drawnCard : null) ??
      model.chooseDaifugoExtraDiscard?.(context, pending.effect, candidates) ??
      model.chooseDiscardCard(context) ??
      context.currentPlayer.hand[0] ??
      null;
    return discard ? { action: { type: "discardForDaifugoEffect", cardId: discard.id } } : { action: null, reason: "No extra discard candidate." };
  }
  if (pending) {
    return { action: null, reason: `Headless simulation cannot resolve pending effect: ${pending.kind}` };
  }

  if (state.phase === "draw") return { action: model.chooseDrawSource(context) };
  if (state.phase === "discard") {
    const winningDiscard = model.chooseWinningDiscard(context);
    if (winningDiscard) return { action: { type: "winWithDiscard", discardCardId: winningDiscard.id } };
    if (context.currentPlayer.isReach && !state.declaredReachThisTurn) return { action: { type: "discardDrawnOnly" } };
    const discard = model.chooseDiscardCard(context);
    return discard
      ? { action: { type: "discard", cardId: discard.id }, reason: describeTacticalCandidates(state) }
      : { action: null, reason: "No discard candidate." };
  }
  if (state.phase === "reachConfirm") {
    return { action: { type: "answerReachAfterDiscard", declareReach: model.chooseReachDeclaration?.(context) ?? false } };
  }
  if (state.phase === "ronCheck") return { action: { type: "answerRon", takeRon: true } };

  return { action: null, reason: `Unsupported phase: ${state.phase}` };
}
