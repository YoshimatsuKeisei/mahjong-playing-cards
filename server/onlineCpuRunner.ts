import {
  gameReducer,
  getEnhancedFiveTurnOptions,
  getJackShieldRunOptions,
  getQueenVanishRankOptions,
  getSevenExchangeCandidateCards,
  getWinningDiscardOptions,
  isCardJShielded,
  canDeclareReachInCurrentState,
  canKeepReachAfterDiscard,
  type GameAction,
} from "../src/game/gameState";
import { createCpuDecisionContext, getCpuModel } from "../src/game/cpu";
import type { Card, CpuModelId, GameState } from "../src/types";

type OnlineCpuRoom = {
  id: string;
  state: GameState | null;
  stateVersion: number;
  started: boolean;
};

type OnlineCpuCallbacks<Room extends OnlineCpuRoom> = {
  applyNextState: (room: Room, nextState: GameState) => void;
  broadcastPlayerView: (room: Room) => void;
  getCpuControlledPlayerModels?: (room: Room) => Map<string, CpuModelId>;
};

type ScheduledCpuJob = {
  key: string;
  timeoutId: NodeJS.Timeout;
};

const scheduledCpuJobs = new Map<string, ScheduledCpuJob>();

const ONLINE_CPU_DEFAULT_DELAY_MS = 1300;
const ONLINE_CPU_DRAW_DELAY_MS = 1300;
const ONLINE_CPU_DISCARD_DELAY_MS = 1600;
const ONLINE_CPU_CONFIRM_DELAY_MS = 1500;
const ONLINE_CPU_HANDOFF_DELAY_MS = 3000;
const ONLINE_CPU_SPLASH_DELAY_MS = 1900;
const ONLINE_CPU_SELECTION_DELAY_MS = 1800;
const ONLINE_CPU_EFFECT_DRAW_DELAY_MS = 2400;
const ONLINE_CPU_REACH_CONFIRM_DELAY_MS = 1600;

export function cancelOnlineCpu(roomId: string) {
  const job = scheduledCpuJobs.get(roomId);
  if (!job) return;

  clearTimeout(job.timeoutId);
  scheduledCpuJobs.delete(roomId);
}

export function scheduleOnlineCpu<Room extends OnlineCpuRoom>(
  room: Room,
  callbacks: OnlineCpuCallbacks<Room>,
) {
  if (!room.started || !room.state || room.state.phase === "result") {
    cancelOnlineCpu(room.id);
    return;
  }

  const cpuControlledPlayerModels =
    callbacks.getCpuControlledPlayerModels?.(room) ?? new Map<string, CpuModelId>();
  const action = chooseOnlineCpuAction(room.state, cpuControlledPlayerModels);
  if (!action) {
    cancelOnlineCpu(room.id);
    return;
  }

  const key = createCpuJobKey(room, action);
  const existingJob = scheduledCpuJobs.get(room.id);

  if (existingJob?.key === key) {
    return;
  }

  if (existingJob) {
    clearTimeout(existingJob.timeoutId);
  }

  const scheduledStateVersion = room.stateVersion;
  const delayMs = getOnlineCpuDelayMs(room.state, action);

  const timeoutId = setTimeout(() => {
    scheduledCpuJobs.delete(room.id);

    if (!room.started || !room.state) return;
    if (room.stateVersion !== scheduledStateVersion) return;

    const latestCpuControlledPlayerModels =
      callbacks.getCpuControlledPlayerModels?.(room) ?? new Map<string, CpuModelId>();
    const latestAction = chooseOnlineCpuAction(
      room.state,
      latestCpuControlledPlayerModels,
    );
    if (!latestAction) return;

    const nextState = gameReducer(room.state, latestAction);
    if (nextState === room.state) return;

    callbacks.applyNextState(room, nextState);
    callbacks.broadcastPlayerView(room);

    scheduleOnlineCpu(room, callbacks);
  }, delayMs);

  scheduledCpuJobs.set(room.id, { key, timeoutId });
}

function createCpuJobKey(room: OnlineCpuRoom, action: GameAction): string {
  const state = room.state;
  const pending = state?.pendingDaifugoEffect;

  return JSON.stringify({
    roomId: room.id,
    stateVersion: room.stateVersion,
    phase: state?.phase ?? "none",
    currentPlayerIndex: state?.currentPlayerIndex ?? -1,
    pendingKind: pending?.kind ?? "none",
    action,
  });
}

function getOnlineCpuDelayMs(state: GameState, action: GameAction): number {
  const pending = state.pendingDaifugoEffect;
  if (action.type === "confirmHandoff") {
    return ONLINE_CPU_HANDOFF_DELAY_MS;
  }
  if (
    action.type === "drawFromDeck" ||
    action.type === "takeDiscard" ||
    action.type === "drawForDaifugoEffect"
  ) {
    return action.type === "drawForDaifugoEffect"
      ? ONLINE_CPU_EFFECT_DRAW_DELAY_MS
      : ONLINE_CPU_DRAW_DELAY_MS;
  }
  if (
    action.type === "discard" ||
    action.type === "discardDrawnOnly" ||
    action.type === "discardForDaifugoEffect"
  ) {
    return ONLINE_CPU_DISCARD_DELAY_MS;
  }
  if (
    action.type === "answerDaifugoEffect" ||
    action.type === "answerFiveEnhancement" ||
    action.type === "answerSevenEnhancement" ||
    action.type === "answerReachAfterDiscard" ||
    action.type === "answerReachContinue" ||
    action.type === "answerQueenWin"
  ) {
    return state.phase === "reachConfirm"
      ? ONLINE_CPU_REACH_CONFIRM_DELAY_MS
      : ONLINE_CPU_CONFIRM_DELAY_MS;
  }
  if (
    action.type === "finishFiveEnhancementSplash" ||
    action.type === "finishSevenEnhancementSplash"
  ) {
    return ONLINE_CPU_SPLASH_DELAY_MS;
  }
  if (
    action.type === "selectQueenVanishRank" ||
    action.type === "selectSevenExchangeCard" ||
    action.type === "selectEnhancedFiveTarget" ||
    action.type === "confirmEnhancedFiveTarget" ||
    action.type === "selectEnhancedSevenTarget" ||
    action.type === "confirmEnhancedSevenTarget" ||
    action.type === "selectJackSpecialEffect" ||
    action.type === "selectJackShieldRank" ||
    action.type === "selectJackShieldRun" ||
    action.type === "inspectJackCard" ||
    action.type === "confirmJackInspectCard"
  ) {
    return ONLINE_CPU_SELECTION_DELAY_MS;
  }
  if (
    pending?.kind === "fiveEnhancementSplash" ||
    pending?.kind === "sevenEnhancementSplash"
  ) {
    return ONLINE_CPU_SPLASH_DELAY_MS;
  }
  if (
    pending?.kind === "queenSelect" ||
    pending?.kind === "sevenExchange" ||
    pending?.kind === "fiveEnhancedTargetSelect" ||
    pending?.kind === "sevenEnhancedTargetSelect"
  ) {
    return ONLINE_CPU_SELECTION_DELAY_MS;
  }
  return ONLINE_CPU_DEFAULT_DELAY_MS;
}

function chooseOnlineCpuAction(
  state: GameState,
  cpuControlledPlayerModels = new Map<string, CpuModelId>(),
): GameAction | null {
  const cpuState = createCpuControlledState(state, cpuControlledPlayerModels);
  const pending = cpuState.pendingDaifugoEffect;

  if (pending) {
    return choosePendingCpuAction(cpuState);
  }

  if (cpuState.phase === "handoff") {
    return { type: "confirmHandoff" };
  }

  const context = createCpuDecisionContext(cpuState);
  if (!context) return null;

  const player = context.currentPlayer;
  if (!player.isCpu) return null;

  const model = getCpuModel(player.cpuModelId);

  if (cpuState.phase === "draw") {
    return model.chooseDrawSource(context);
  }

  if (cpuState.phase === "reachConfirm") {
    return {
      type: "answerReachAfterDiscard",
      declareReach: model.chooseReachDeclaration?.(context) ?? false,
    };
  }

  if (cpuState.phase === "ronCheck") {
    const cpuRonCandidate = cpuState.pendingRonResult?.ronResults?.find(
      (item) => cpuState.players[item.winnerIndex]?.isCpu,
    );

    if (!cpuRonCandidate) return null;

    return {
      type: "answerRon",
      takeRon: true,
    };
  }

  if (cpuState.phase === "discard") {
    const legalWinningOptions = getWinningDiscardOptions(cpuState);
    const modelWinningCard = model.chooseWinningDiscard(context);
    const winningCard =
      modelWinningCard &&
      legalWinningOptions.some(
        (option) => option.discardCard.id === modelWinningCard.id,
      )
        ? modelWinningCard
        : (legalWinningOptions[0]?.discardCard ?? null);

    if (winningCard) {
      return {
        type: "winWithDiscard",
        discardCardId: winningCard.id,
      };
    }

    if (player.isReach && !state.declaredReachThisTurn) {
      return { type: "discardDrawnOnly" };
    }

    if (
      cpuState.drawnFrom === "deck" &&
      !player.hasCalled &&
      !player.isReach &&
      legalWinningOptions.length === 0 &&
      canDeclareReachInCurrentState(cpuState, cpuState.currentPlayerIndex) &&
      model.chooseReachDeclaration?.(context)
    ) {
      return { type: "declareReach" };
    }

    const discardCard = chooseCpuNormalDiscardCard(cpuState);
    if (!discardCard) return null;

    return {
      type: "discard",
      cardId: discardCard.id,
    };
  }

  return null;
}

function createCpuControlledState(
  state: GameState,
  cpuControlledPlayerModels: Map<string, CpuModelId>,
): GameState {
  if (cpuControlledPlayerModels.size === 0) return state;
  return {
    ...state,
    players: state.players.map((player) =>
      cpuControlledPlayerModels.has(player.id)
        ? {
            ...player,
            type: "cpu",
            isCpu: true,
            cpuModelId: cpuControlledPlayerModels.get(player.id) ?? player.cpuModelId ?? "standard",
          }
        : player,
    ),
  };
}

function choosePendingCpuAction(state: GameState): GameAction | null {
  const pending = state.pendingDaifugoEffect;
  if (!pending) return null;

  if (pending.kind === "confirm") {
    const context = createCpuContextForPlayer(state, pending.playerIndex);
    if (!context?.currentPlayer.isCpu) return null;

    const model = getCpuModel(context.currentPlayer.cpuModelId);

    return {
      type: "answerDaifugoEffect",
      activate:
        model.chooseDaifugoEffectActivation?.(context, pending.effect) ?? true,
    };
  }

  if (pending.kind === "sevenEnhancementConfirm") {
    const context = createCpuContextForPlayer(state, pending.playerIndex);
    if (!context?.currentPlayer.isCpu) return null;

    const model = getCpuModel(context.currentPlayer.cpuModelId);

    return {
      type: "answerSevenEnhancement",
      useEnhancement:
        model.chooseDaifugoEffectActivation?.(context, "sevenExchange") ?? true,
    };
  }

  if (pending.kind === "sevenEnhancementSplash") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;
    return { type: "finishSevenEnhancementSplash" };
  }

  if (pending.kind === "sevenEnhancedTargetSelect") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;

    if (pending.selectedTargetPlayerIndex === undefined) {
      const targetPlayerIndex = chooseCpuEnhancedSevenTargetIndex(
        state,
        pending.playerIndex,
      );
      if (targetPlayerIndex === null) return null;

      return {
        type: "selectEnhancedSevenTarget",
        targetPlayerIndex,
      };
    }

    return { type: "confirmEnhancedSevenTarget" };
  }

  if (pending.kind === "fiveEnhancementConfirm") {
    const context = createCpuContextForPlayer(state, pending.playerIndex);
    if (!context?.currentPlayer.isCpu) return null;

    const model = getCpuModel(context.currentPlayer.cpuModelId);

    return {
      type: "answerFiveEnhancement",
      useEnhancement:
        model.chooseDaifugoEffectActivation?.(context, "fiveSkip") ?? true,
    };
  }

  if (pending.kind === "fiveEnhancementSplash") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;
    return { type: "finishFiveEnhancementSplash" };
  }

  if (pending.kind === "fiveEnhancedTargetSelect") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;

    if (pending.selectedTargetPlayerIndex === undefined) {
      const targetPlayerIndex = chooseCpuEnhancedFiveTargetIndex(
        state,
        pending.playerIndex,
      );
      if (targetPlayerIndex === null) return null;

      return {
        type: "selectEnhancedFiveTarget",
        targetPlayerIndex,
      };
    }

    return { type: "confirmEnhancedFiveTarget" };
  }

  if (pending.kind === "sevenExchange") {
    const actorIndex = chooseCpuSevenExchangeActorIndex(state);
    if (actorIndex === null) return null;

    const actor = state.players[actorIndex];
    const context = createCpuContextForPlayer(state, actorIndex);
    if (!actor || !context) return null;

    const candidates = getSevenExchangeCandidateCards(
      actor,
      actorIndex === pending.playerIndex,
    ).filter((card) => !isCardJShielded(actor, card));

    const model = getCpuModel(actor.cpuModelId);
    const role = actorIndex === pending.playerIndex ? "initiator" : "target";
    const modelChoice =
      model.chooseDaifugoSevenExchangeCard?.(context, candidates, role) ?? null;
    const card =
      modelChoice &&
      candidates.some((candidate) => candidate.id === modelChoice.id)
        ? modelChoice
        : (candidates[0] ?? null);

    if (!card) return null;

    return {
      type: "selectSevenExchangeCard",
      playerIndex: actorIndex,
      cardId: card.id,
    };
  }

  if (pending.kind === "queenSelect") {
    const context = createCpuContextForPlayer(state, pending.playerIndex);
    if (!context?.currentPlayer.isCpu) return null;

    const model = getCpuModel(context.currentPlayer.cpuModelId);
    const candidates = getQueenVanishRankOptions(state)
      .filter((option) => option.selectable)
      .map((option) => option.rank);
    const modelRank =
      model.chooseQueenVanishRank?.(context, candidates) ?? null;
    const rank =
      modelRank !== null && candidates.includes(modelRank)
        ? modelRank
        : (candidates[0] ?? null);
    if (rank === null) return null;

    return {
      type: "selectQueenVanishRank",
      rank,
    };
  }

  if (pending.kind === "queenWinConfirm") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;

    return {
      type: "answerQueenWin",
      takeWin: true,
    };
  }

  if (pending.kind === "effectDraw") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;

    return {
      type: "drawForDaifugoEffect",
    };
  }

  if (pending.kind === "extraDiscard") {
    const context = createCpuContextForPlayer(state, pending.playerIndex);
    if (!context?.currentPlayer.isCpu) return null;

    const player = context.currentPlayer;
    const candidates = getCpuExtraDiscardCandidates(state, pending.playerIndex);

    const model = getCpuModel(player.cpuModelId);
    const modelChoice =
      model.chooseDaifugoExtraDiscard?.(context, pending.effect, candidates) ??
      null;
    const card =
      modelChoice &&
      candidates.some((candidate) => candidate.id === modelChoice.id)
        ? modelChoice
        : (candidates[0] ?? null);

    if (!card) return null;

    return {
      type: "discardForDaifugoEffect",
      cardId: card.id,
    };
  }

  if (pending.kind === "jackSelect") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;

    return {
      type: "selectJackSpecialEffect",
      effect: "inspectHands",
    };
  }

  if (pending.kind === "jackShieldSelect") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;

    const player = state.players[pending.playerIndex];
    if (!player) return null;

    const rank = pending.selectableRanks[0];
    if (rank !== undefined) {
      return {
        type: "selectJackShieldRank",
        rank,
      };
    }

    const run = getJackShieldRunOptions(player)[0];
    if (!run) return null;

    return {
      type: "selectJackShieldRun",
      key: run.key,
    };
  }

  if (pending.kind === "jackInspect") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;

    const targetPlayerIndex =
      pending.targetPlayerIndexes[pending.currentTargetOffset];

    if (targetPlayerIndex === undefined) return null;

    if (pending.revealedCardIds[targetPlayerIndex]) {
      return {
        type: "confirmJackInspectCard",
      };
    }

    const targetPlayer = state.players[targetPlayerIndex];
    const card = targetPlayer?.hand[0] ?? null;
    if (!card) return null;

    return {
      type: "inspectJackCard",
      targetPlayerIndex,
      cardId: card.id,
    };
  }

  if (pending.kind === "reachContinueConfirm") {
    if (!isCpuPlayer(state, pending.playerIndex)) return null;

    return {
      type: "answerReachContinue",
      keepReach: true,
    };
  }

  return null;
}

function chooseCpuNormalDiscardCard(state: GameState): Card | null {
  const context = createCpuDecisionContext(state);
  if (!context) return null;

  const player = context.currentPlayer;
  const model = getCpuModel(player.cpuModelId);

  if (player.isReach && state.declaredReachThisTurn) {
    const modelChoice = model.chooseDiscardCard(context);

    if (
      modelChoice &&
      canKeepReachAfterDiscard(
        state,
        state.currentPlayerIndex,
        modelChoice.id,
      ) &&
      !isCardJShielded(player, modelChoice)
    ) {
      return modelChoice;
    }

    return (
      player.hand.find(
        (card) =>
          canKeepReachAfterDiscard(state, state.currentPlayerIndex, card.id) &&
          !isCardJShielded(player, card),
      ) ?? null
    );
  }

  const modelChoice = model.chooseDiscardCard(context);

  if (modelChoice && !isCardJShielded(player, modelChoice)) {
    return modelChoice;
  }

  return player.hand.find((card) => !isCardJShielded(player, card)) ?? null;
}

function createCpuContextForPlayer(state: GameState, playerIndex: number) {
  const player = state.players[playerIndex];
  if (!player) return null;

  return createCpuDecisionContext({
    ...state,
    currentPlayerIndex: playerIndex,
  });
}

function isCpuPlayer(state: GameState, playerIndex: number): boolean {
  return state.players[playerIndex]?.isCpu === true;
}

function chooseCpuSevenExchangeActorIndex(state: GameState): number | null {
  const pending = state.pendingDaifugoEffect;
  if (!pending || pending.kind !== "sevenExchange") return null;

  if (
    isCpuPlayer(state, pending.playerIndex) &&
    !pending.selections[pending.playerIndex]
  ) {
    return pending.playerIndex;
  }

  if (
    isCpuPlayer(state, pending.targetPlayerIndex) &&
    !pending.selections[pending.targetPlayerIndex]
  ) {
    return pending.targetPlayerIndex;
  }

  return null;
}

function chooseCpuEnhancedSevenTargetIndex(
  state: GameState,
  playerIndex: number,
): number | null {
  const targetPlayerIndex = state.players.findIndex((player, index) => {
    return index !== playerIndex && Boolean(player);
  });
  return targetPlayerIndex >= 0 ? targetPlayerIndex : null;
}

function chooseCpuEnhancedFiveTargetIndex(
  state: GameState,
  playerIndex: number,
): number | null {
  const option = getEnhancedFiveTurnOptions(state, playerIndex).find(
    (candidate) => candidate.selectable,
  );

  return option?.playerIndex ?? null;
}

function getCpuExtraDiscardCandidates(
  state: GameState,
  playerIndex: number,
): Card[] {
  const pending = state.pendingDaifugoEffect;
  const player = state.players[playerIndex];

  if (!pending || pending.kind !== "extraDiscard" || !player) return [];

  if (
    pending.effect === "eightExtraTurn" &&
    player.isReach &&
    !state.declaredReachThisTurn &&
    state.drawnCard
  ) {
    return [state.drawnCard];
  }

  return player.hand.filter((card) => !isCardJShielded(player, card));
}
