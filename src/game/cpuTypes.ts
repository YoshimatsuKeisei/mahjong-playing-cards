import type { Card, CpuModelId, GameState } from "../types";
import type { GameAction } from "./gameState";

export interface CpuDecisionContext {
  state: GameState;
  currentPlayer: GameState["players"][number];
  currentPlayerIndex: number;
}

export interface CpuCallChoice {
  ownerIndex: number;
  meld: Card[];
}

export interface CpuModel {
  id: CpuModelId;
  name: string;
  chooseWinningDiscard(context: CpuDecisionContext): Card | null;
  shouldWin(context: CpuDecisionContext): boolean;
  chooseCall(context: CpuDecisionContext): CpuCallChoice | null;
  shouldCall(context: CpuDecisionContext): boolean;
  chooseDrawSource(context: CpuDecisionContext): GameAction;
  chooseDiscardCard(context: CpuDecisionContext): Card | null;
  chooseReachDeclaration?(context: CpuDecisionContext): boolean;
  chooseDaifugoEffectActivation?(context: CpuDecisionContext): boolean;
  getDiscardDebugInfo?(context: CpuDecisionContext): string | null;
  describeDiscardChoice?(context: CpuDecisionContext, card: Card): string | null;
  describeCallSkip?(context: CpuDecisionContext): string | null;
}

export function createCpuDecisionContext(state: GameState): CpuDecisionContext | null {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer) return null;
  return {
    state,
    currentPlayer,
    currentPlayerIndex: state.currentPlayerIndex,
  };
}
