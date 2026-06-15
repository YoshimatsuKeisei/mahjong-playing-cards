import React from "react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
} from "react";
import { checkWinningHandWithOpenMelds } from "../game/rules";
import {
  createCpuDecisionContext,
  CPU_AFTER_DRAW_DELAY_MS,
  CPU_DECISION_DELAY_MS,
  CPU_DISCARD_DELAY_MS,
  CPU_THINK_DELAY_MS,
  getCpuModel,
} from "../game/cpu";
import { getCpuDiscardCandidates } from "../game/standardCpu";
import { getCpuModelDisplayName } from "../game/cpuModelRegistry";
import {
  getAvailableDiscardSources,
  getCallOptionsForSource,
  getEnhancedFiveTurnOptions,
  getReachWinningOptions,
  getSevenExchangeCandidateCards,
  getWinningDiscardOptions,
  isCardJShielded,
  chooseCpuQueenRank,
  getQueenVanishRankOptions,
  canDeclareReachInCurrentState,
  type GameAction,
} from "../game/gameState";
import type { Card, CpuModelId, GameState, MatchState } from "../types";
import type {
  OnlineRoomSnapshot,
  TemporaryLeaveMode,
  UpdateMatchSettingsPayload,
} from "../online/types";
import DiscardPile from "./DiscardPile";
import HandView from "./HandView";
import MeldArea from "./MeldArea";
import PlayerArea from "./PlayerArea";
import PlayingCard, { formatCard } from "./PlayingCard";

interface PlayScreenProps {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  currentRound?: number;
  onExitToHome?: () => void;
  onlineRoom?: OnlineRoomSnapshot;
  onlinePlayerId?: string;
  onTransferHost?: (targetPlayerId: string) => void;
  onStartTemporaryLeave?: (mode: TemporaryLeaveMode) => void;
  matchState?: MatchState;
  onUpdateMatchSettings?: (payload: UpdateMatchSettingsPayload) => void;
  onUpdateSubstituteCpuModel?: (cpuModelId: CpuModelId) => void;
  disableLocalCpuAutomation?: boolean;
}

type RoomManagementTab =
  | "exit"
  | "temporaryLeave"
  | "transferHost"
  | "matchInfo";

type AnimationPhase =
  | "idle"
  | "drawingFromDeck"
  | "revealingDrawnCard"
  | "movingDrawnCardToHand"
  | "discardingCard";
type DaifugoAnimationStep = {
  id: string;
  title: string;
  message: string;
  stageMessage?: string;
  cards: Card[];
  side: "center" | "cpu";
  variant: "notice" | "discard" | "settle" | "draw" | "exchange";
  phase?: "reveal" | "insert";
};

const reachVisualSrc = new URL("../../黒ローブ男.png", import.meta.url).href;
const enhancedRoundTableSrc = new URL("../assets/テーブル.png", import.meta.url)
  .href;
const enhancedPlayerSilhouetteSrc = new URL(
  "../assets/player-silhouette.png",
  import.meta.url,
).href;
const enhancedTurnGuide3Src = new URL(
  "../assets/turn-guide-3.png",
  import.meta.url,
).href;
const J_ENHANCEMENT_SPLASH_MS = 1350;
const MAX_ROUND_COUNT = 100;
const MIN_TARGET_SCORE = 50;
const MAX_TARGET_SCORE = 10000;

type EnhancedFiveTurnOption = ReturnType<
  typeof getEnhancedFiveTurnOptions
>[number];

type EnhancedTargetTableProps = {
  mode: "five" | "seven";
  players: GameState["players"];
  viewerPlayerId?: string;
  actorIndex: number;
  selectedTargetIndex?: number;
  direction: GameState["direction"];
  fiveOptions?: EnhancedFiveTurnOption[];
  selectedFiveOption?: EnhancedFiveTurnOption | null;
  disabled: boolean;
  onSelect: (playerIndex: number) => void;
};

function EnhancedTargetTable({
  mode,
  players,
  viewerPlayerId,
  actorIndex,
  selectedTargetIndex,
  direction,
  fiveOptions = [],
  selectedFiveOption = null,
  disabled,
  onSelect,
}: EnhancedTargetTableProps) {
  const fiveOptionByPlayer = new Map(
    fiveOptions.map((option) => [option.playerIndex, option]),
  );
  const displaySlots = mapPlayersToEnhancedTargetSlots(
    players,
    viewerPlayerId,
    actorIndex,
  );
  return (
    <div
      className={`enhanced-target-table ${mode === "five" ? "enhanced-target-table--five" : "enhanced-target-table--seven"}`}
      data-testid={`enhanced-${mode}-target-table`}
    >
      <div className="enhanced-target-table-core" aria-hidden="true">
        <img
          className="enhanced-target-table-image"
          src={enhancedRoundTableSrc}
          alt=""
          data-testid="enhanced-round-table"
        />
        {mode === "five" && players.length === 3 && (
          <img
            className={`enhanced-target-turn-guide enhanced-target-turn-guide--3 ${
              direction === "clockwise" ? "clockwise" : "counterclockwise"
            }`}
            src={enhancedTurnGuide3Src}
            alt=""
            data-testid="enhanced-five-turn-guide-3"
          />
        )}
      </div>
      {mode === "five" && (
        <>
          <div
            className={`enhanced-target-direction ${direction === "clockwise" ? "clockwise" : "counterclockwise"}`}
          >
            {direction === "clockwise" ? "通常順" : "逆回り"}
          </div>
        </>
      )}
      {mode === "seven" && selectedTargetIndex !== undefined && (
        <div
          className="enhanced-target-exchange-mark"
          data-testid="enhanced-seven-exchange-mark"
          aria-hidden="true"
        >
          ↔
        </div>
      )}
      {displaySlots.map(({ player, playerIndex, slotIndex }) => {
        const isActor = playerIndex === actorIndex;
        const isSelected = selectedTargetIndex === playerIndex;
        const isSkipped =
          mode === "five"
            ? (selectedFiveOption?.skippedPlayerIndexes.includes(playerIndex) ??
              false)
            : false;
        const fiveOption = fiveOptionByPlayer.get(playerIndex);
        const isSelectable =
          mode === "seven" ? !isActor : Boolean(fiveOption?.selectable);
        const nodeDisabled = disabled || isActor || !isSelectable;
        const stateClass = isActor
          ? "self"
          : mode === "five" && isSelected
            ? "next-target"
            : mode === "five" && isSkipped
              ? "skip-target"
              : mode === "seven" && isSelected
                ? "exchange-target"
                : !isSelectable
                  ? "disabled-target"
                  : "selectable-target";
        const stateLabel = isActor
          ? "自分"
          : mode === "five" && isSelected
            ? "次の手番"
            : mode === "five" && isSkipped
              ? "スキップ"
              : mode === "seven" && isSelected
                ? "交換相手"
                : !isSelectable
                  ? "選択不可"
                  : "選択可";

        const outlineClass =
          isActor || isSelected || isSkipped ? "persistent-outline" : "";

        return (
          <button
            type="button"
            className={`enhanced-target-seat enhanced-target-seat--${players.length}-${slotIndex + 1} subtle-outline ${stateClass} ${outlineClass}`}
            key={player.id}
            disabled={nodeDisabled}
            aria-label={player.name}
            title={
              mode === "five" && !isActor && !isSelectable
                ? "スキップ対象がいないため選択できません"
                : undefined
            }
            onClick={() => onSelect(playerIndex)}
          >
            <span className="enhanced-target-seat-icon" aria-hidden="true">
              <img
                className="enhanced-target-seat-person-image"
                src={enhancedPlayerSilhouetteSrc}
                alt=""
                data-testid="enhanced-target-player-silhouette"
              />
            </span>
            <span className="enhanced-target-seat-copy">
              <span className="enhanced-target-seat-name">{player.name}</span>
              <span className="enhanced-target-seat-state">{stateLabel}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const seatPositions: Record<number, Array<{ left: string; top: string }>> = {
  3: [
    { left: "50%", top: "82%" },
    { left: "76%", top: "34%" },
    { left: "24%", top: "34%" },
  ],
  4: [
    { left: "57%", top: "24%" },
    { left: "80%", top: "47%" },
    { left: "50%", top: "84%" },
    { left: "20%", top: "47%" },
  ],
  5: [
    { left: "36%", top: "25%" },
    { left: "64%", top: "25%" },
    { left: "78%", top: "54%" },
    { left: "50%", top: "82%" },
    { left: "22%", top: "54%" },
  ],
};

const historyAnchorPositions: Record<
  number,
  Array<{ left: string; top: string }>
> = {
  3: [
    { left: "63.4%", top: "74.2%" },
    { left: "63.4%", top: "55.6%" },
    { left: "40.8%", top: "54.8%" },
  ],
  4: [
    { left: "50%", top: "31%" },
    { left: "84%", top: "52%" },
    { left: "63%", top: "84%" },
    { left: "16%", top: "52%" },
  ],
  5: [
    { left: "34.2%", top: "22.8%" },
    { left: "70%", top: "31.5%" },
    { left: "86%", top: "55.5%" },
    { left: "63%", top: "82%" },
    { left: "15%", top: "56%" },
  ],
};

const measuredAnchorLayouts: Record<
  number,
  Array<{ left: string; top: string; width: string; height: string }>
> = {
  4: [
    { left: "45%", top: "28%", width: "10%", height: "10%" },
    { left: "79%", top: "45%", width: "10%", height: "18%" },
    { left: "61%", top: "80%", width: "5%", height: "8%" },
    { left: "11%", top: "45%", width: "10%", height: "18%" },
  ],
  5: [
    { left: "32.8%", top: "19.8%", width: "4%", height: "6%" },
    { left: "66%", top: "28%", width: "8%", height: "7%" },
    { left: "84%", top: "51%", width: "4%", height: "9%" },
    { left: "61%", top: "79%", width: "4%", height: "6%" },
    { left: "13%", top: "51%", width: "4%", height: "9%" },
  ],
};

export default function PlayScreen({
  state,
  dispatch,
  currentRound,
  onExitToHome,
  onlineRoom,
  onlinePlayerId,
  onTransferHost,
  onStartTemporaryLeave,
  matchState,
  onUpdateMatchSettings,
  onUpdateSubstituteCpuModel,
  disableLocalCpuAutomation = false,
}: PlayScreenProps) {
  const [isRoomMenuOpen, setIsRoomMenuOpen] = useState(false);
  const [roomMenuTab, setRoomMenuTab] = useState<RoomManagementTab>("exit");
  const currentPlayer = state.players[state.currentPlayerIndex];
  console.log("[phase check]", {
    phase: state.phase,
    message: state.message,
    currentPlayerIndex: state.currentPlayerIndex,
    viewerPlayerId: state.viewerPlayerId,
  });
  const viewerPlayerIndex = state.viewerPlayerId
    ? state.players.findIndex((player) => player.id === state.viewerPlayerId)
    : -1;
  const reachOptions = getReachWinningOptions(state);
  const selfWinOptions =
    state.winningDiscardOptions ?? getWinningDiscardOptions(state);
  const discardSources = getAvailableDiscardSources(state);
  const discardHighlights = getDiscardHighlights(state, discardSources);
  const playerCount = state.players.length;
  const isOnlineHost = Boolean(
    onlineRoom && onlinePlayerId && onlineRoom.hostPlayerId === onlinePlayerId,
  );
  const hostTransferTargets =
    onlineRoom?.players.filter(
      (player) =>
        player.playerId !== onlineRoom.hostPlayerId &&
        player.connected &&
        !player.playerId.startsWith("cpu-"),
    ) ?? [];
  const deckCount = state.deckRemaining ?? state.deck.length;
  const availableActions = new Set(state.availableActions ?? []);
  const isOnlineView = Boolean(state.viewerPlayerId);
  const isViewerTurn =
    !isOnlineView || currentPlayer?.id === state.viewerPlayerId;
  const canUseOnlineDraw =
    !isOnlineView || availableActions.has("drawFromDeck");
  const canUseOnlineDiscard = !isOnlineView || availableActions.has("discard");
  const showTableCardLayer = playerCount === 3;
  const cpuDisplayNames = buildCpuDisplayNames(state);
  const displaySlots = mapPlayersToViewSlots(
    state.players,
    state.viewerPlayerId,
  );
  const canReachAfterDraw =
    state.phase === "discard" &&
    state.drawnFrom === "deck" &&
    selfWinOptions.length === 0 &&
    canDeclareReachInCurrentState(state, state.currentPlayerIndex);
  const canChooseDiscard =
    !currentPlayer.isReach || state.declaredReachThisTurn;
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("idle");
  const [animationCard, setAnimationCard] = useState<Card | null>(null);
  const [animationPlayerIndex, setAnimationPlayerIndex] = useState<
    number | null
  >(null);
  const [selectedDiscardId, setSelectedDiscardId] = useState<string | null>(
    null,
  );
  const [discardingCardId, setDiscardingCardId] = useState<string | null>(null);
  const [reachSplashPlayerName, setReachSplashPlayerName] = useState<
    string | null
  >(null);
  const [reachSplashCall, setReachSplashCall] = useState("リーチ!!");
  const [reachSplashDurationMs, setReachSplashDurationMs] = useState(2600);
  const [visibleDaifugoEventId, setVisibleDaifugoEventId] = useState<
    string | null
  >(null);
  const [daifugoEventStepIndex, setDaifugoEventStepIndex] = useState(0);
  const [daifugoDrawPhase, setDaifugoDrawPhase] = useState<"reveal" | "insert">(
    "reveal",
  );
  const [ronCountdown, setRonCountdown] = useState(3);
  const [cpuActionInProgress, setCpuActionInProgress] = useState(false);
  const sceneRef = useRef<HTMLElement | null>(null);
  const historyMeasureRefs = useRef(new Map<number, HTMLElement>());
  const [measuredHistoryPositions, setMeasuredHistoryPositions] = useState<
    Record<number, { left: string; top: string }>
  >({});
  const timeoutsRef = useRef<number[]>([]);
  const cpuTimeoutsRef = useRef<number[]>([]);
  const lastCpuActionKeyRef = useRef<string | null>(null);
  const lastOnlineDrawAnimationKeyRef = useRef<string | null>(null);
  const reachSplashTimeoutRef = useRef<number | null>(null);
  const lastEnhancementSplashKeyRef = useRef<string | null>(null);
  const lastDaifugoSplashKeyRef = useRef<string | null>(null);
  const previousReachFlagsRef = useRef<boolean[] | null>(null);
  const jackInspectOrderRef = useRef(new Map<string, string[]>());
  const isAnimating = animationPhase !== "idle";
  const isCpuTurn = currentPlayer?.isCpu === true && state.phase !== "result";
  const isBlockingSplashVisible =
    Boolean(reachSplashPlayerName) &&
    (reachSplashCall === "カード交換!!" ||
      reachSplashCall === "数字消去!!" ||
      reachSplashCall === "5：スキップ強化" ||
      reachSplashCall === "7：交換相手選択");
  const shouldHideCpuDetails = !state.showCpuActions && isCpuTurn;
  const pendingDaifugoEffect = state.pendingDaifugoEffect;
  const queenRankChoices =
    state.queenVanishRankOptions ?? getQueenVanishRankOptions(state);
  const availableQueenRankOptions = queenRankChoices
    .filter((option) => option.selectable)
    .map((option) => option.rank);
  const isDaifugoConfirm = pendingDaifugoEffect?.kind === "confirm";
  const isDaifugoExtraDiscard = pendingDaifugoEffect?.kind === "extraDiscard";
  const isDaifugoEffectDraw = pendingDaifugoEffect?.kind === "effectDraw";
  const isSevenExchange = pendingDaifugoEffect?.kind === "sevenExchange";
  const requiredActionPlayerIndex = getRequiredActionPlayerIndex(state);
  const isViewerRequiredActionPlayer =
    !isOnlineView ||
    (requiredActionPlayerIndex !== null &&
      viewerPlayerIndex === requiredActionPlayerIndex);
  const isSevenEnhancementConfirm =
    pendingDaifugoEffect?.kind === "sevenEnhancementConfirm";
  const isSevenEnhancementSplash =
    pendingDaifugoEffect?.kind === "sevenEnhancementSplash";
  const isSevenEnhancedTargetSelect =
    pendingDaifugoEffect?.kind === "sevenEnhancedTargetSelect";
  const isFiveEnhancementConfirm =
    pendingDaifugoEffect?.kind === "fiveEnhancementConfirm";
  const isFiveEnhancementSplash =
    pendingDaifugoEffect?.kind === "fiveEnhancementSplash";
  const isFiveEnhancedTargetSelect =
    pendingDaifugoEffect?.kind === "fiveEnhancedTargetSelect";
  const isEnhancedTargetSelect =
    isSevenEnhancedTargetSelect || isFiveEnhancedTargetSelect;
  const isQueenSelect = pendingDaifugoEffect?.kind === "queenSelect";
  const isJackSelect = pendingDaifugoEffect?.kind === "jackSelect";
  const isJackShieldSelect = pendingDaifugoEffect?.kind === "jackShieldSelect";
  const isJackInspect = pendingDaifugoEffect?.kind === "jackInspect";
  const isReachContinueConfirm =
    pendingDaifugoEffect?.kind === "reachContinueConfirm";
  const mustDiscardDrawnForReachDaifugo =
    isDaifugoExtraDiscard &&
    pendingDaifugoEffect.effect === "eightExtraTurn" &&
    currentPlayer.isReach &&
    !state.declaredReachThisTurn;
  const controlsDisabled =
    isBlockingSplashVisible ||
    isAnimating ||
    isCpuTurn ||
    !isViewerTurn ||
    cpuActionInProgress ||
    isDaifugoConfirm ||
    isDaifugoEffectDraw ||
    isSevenExchange ||
    isSevenEnhancementConfirm ||
    isSevenEnhancementSplash ||
    isSevenEnhancedTargetSelect ||
    isFiveEnhancementConfirm ||
    isFiveEnhancementSplash ||
    isFiveEnhancedTargetSelect ||
    isQueenSelect ||
    isJackSelect ||
    isJackShieldSelect ||
    isJackInspect ||
    isReachContinueConfirm;
  const pendingRonResult = state.pendingRonResult;
  const ronDiscarderIndex = pendingRonResult?.discarderIndex ?? null;
  const ronDiscarder =
    ronDiscarderIndex !== null ? state.players[ronDiscarderIndex] : null;
  const ronCard = ronDiscarder?.discardPile.at(-1) ?? null;
  const ronWinners = pendingRonResult?.ronResults ?? [];
  const visibleDaifugoEvent =
    state.daifugoEffectEvent &&
    state.daifugoEffectEvent.id === visibleDaifugoEventId
      ? state.daifugoEffectEvent
      : null;
  const daifugoAnimationSteps = visibleDaifugoEvent
    ? buildDaifugoAnimationSteps(visibleDaifugoEvent, state)
    : [];

  const rawDaifugoAnimationStep =
    daifugoAnimationSteps[daifugoEventStepIndex] ?? null;
  const daifugoAnimationStep =
    rawDaifugoAnimationStep &&
    (rawDaifugoAnimationStep.variant === "draw" ||
      rawDaifugoAnimationStep.variant === "exchange")
      ? { ...rawDaifugoAnimationStep, phase: daifugoDrawPhase }
      : rawDaifugoAnimationStep;
  const isDaifugoEventPlaying = Boolean(daifugoAnimationStep);
  if (visibleDaifugoEvent?.kind === "queenNumberVanish") {
    console.warn("[Q_DEBUG]", {
      stepIndex: daifugoEventStepIndex,
      stepCount: daifugoAnimationSteps.length,
      currentVariant: daifugoAnimationStep?.variant ?? "NONE",
      currentMessage: daifugoAnimationStep?.message ?? "NONE",
      steps: daifugoAnimationSteps.map((step) => step.variant).join(" -> "),
    });
  }
  const shouldForceHideActionPanel =
    state.phase === "handoff" ||
    state.phase === "result" ||
    isDaifugoEventPlaying ||
    isBlockingSplashVisible;
  const sevenExchangeParticipantIndexes =
    pendingDaifugoEffect?.kind === "sevenExchange"
      ? [
          pendingDaifugoEffect.playerIndex,
          pendingDaifugoEffect.targetPlayerIndex,
        ]
      : [];
  const viewerIsSevenExchangeParticipant =
    sevenExchangeParticipantIndexes.includes(viewerPlayerIndex);
  const viewerHasSelectedSevenExchangeCard =
    pendingDaifugoEffect?.kind === "sevenExchange" &&
    viewerIsSevenExchangeParticipant
      ? Boolean(pendingDaifugoEffect.selections[viewerPlayerIndex])
      : false;
  const firstUnselectedSevenExchangePlayerIndex =
    pendingDaifugoEffect?.kind === "sevenExchange"
      ? (sevenExchangeParticipantIndexes.find(
          (playerIndex) =>
            !pendingDaifugoEffect.selections[playerIndex] &&
            !state.players[playerIndex]?.isCpu,
        ) ?? null)
      : null;
  const sevenSelectionPlayerIndex =
    pendingDaifugoEffect?.kind === "sevenExchange"
      ? isOnlineView
        ? viewerIsSevenExchangeParticipant &&
          !viewerHasSelectedSevenExchangeCard
          ? viewerPlayerIndex
          : null
        : firstUnselectedSevenExchangePlayerIndex
      : null;
  const sevenSelectionPlayer =
    sevenSelectionPlayerIndex !== null
      ? state.players[sevenSelectionPlayerIndex]
      : null;
  const sevenExchangeActor =
    pendingDaifugoEffect?.kind === "sevenExchange"
      ? state.players[pendingDaifugoEffect.playerIndex]
      : null;
  const sevenExchangeTarget =
    pendingDaifugoEffect?.kind === "sevenExchange"
      ? state.players[pendingDaifugoEffect.targetPlayerIndex]
      : null;
  const sevenExchangeWaitingNames =
    pendingDaifugoEffect?.kind === "sevenExchange"
      ? sevenExchangeParticipantIndexes
          .filter(
            (playerIndex) => !pendingDaifugoEffect.selections[playerIndex],
          )
          .map((playerIndex) => state.players[playerIndex]?.name)
          .filter(Boolean)
          .join("、")
      : "";
  const sevenSelectionCandidates =
    pendingDaifugoEffect?.kind === "sevenExchange" && sevenSelectionPlayer
      ? getSevenExchangeCandidateCards(
          sevenSelectionPlayer,
          sevenSelectionPlayerIndex === pendingDaifugoEffect.playerIndex,
        )
      : [];
  const sevenSelectionCandidateIds = sevenSelectionCandidates.map(
    (card) => card.id,
  );
  const enhancedFiveTurnOptions =
    pendingDaifugoEffect?.kind === "fiveEnhancedTargetSelect"
      ? getEnhancedFiveTurnOptions(state, pendingDaifugoEffect.playerIndex)
      : [];
  const selectedEnhancedFiveOption =
    pendingDaifugoEffect?.kind === "fiveEnhancedTargetSelect" &&
    pendingDaifugoEffect.selectedTargetPlayerIndex !== undefined
      ? enhancedFiveTurnOptions.find(
          (option) =>
            option.playerIndex ===
            pendingDaifugoEffect.selectedTargetPlayerIndex,
        )
      : null;
  const humanPlayerIndex = state.players.findIndex((player) => !player.isCpu);
  const handPlayerIndex =
    viewerPlayerIndex >= 0
      ? viewerPlayerIndex
      : (sevenSelectionPlayerIndex ??
        (currentPlayer?.isCpu
          ? humanPlayerIndex >= 0
            ? humanPlayerIndex
            : state.currentPlayerIndex
          : state.currentPlayerIndex));
  const handPlayer = state.players[handPlayerIndex] ?? currentPlayer;
  const handShieldedCardIds =
    handPlayer.jShield?.cardIds.filter((cardId) =>
      handPlayer.hand.some((card) => card.id === cardId),
    ) ?? [];
  const handDrawnCardId =
    handPlayerIndex === state.currentPlayerIndex
      ? (state.drawnCard?.id ?? null)
      : null;
  const hiddenDaifugoIncomingIds =
    visibleDaifugoEvent && isDaifugoEventPlaying
      ? getDaifugoIncomingCardIdsForPlayer(visibleDaifugoEvent, handPlayerIndex)
      : new Set<string>();
  const onlineAnimatingDrawnCardId =
    isOnlineView &&
    animationCard &&
    animationPhase !== "idle" &&
    animationPhase !== "discardingCard"
      ? animationCard.id
      : null;
  const displayedHandCards =
    hiddenDaifugoIncomingIds.size > 0 || onlineAnimatingDrawnCardId
      ? handPlayer.hand.filter(
          (card) =>
            !hiddenDaifugoIncomingIds.has(card.id) &&
            card.id !== onlineAnimatingDrawnCardId,
        )
      : handPlayer.hand;
  const hiddenQueenDiscardIdsByPlayer =
    visibleDaifugoEvent && isDaifugoEventPlaying
      ? getHiddenQueenDiscardIdsByPlayer(
          visibleDaifugoEvent,
          daifugoAnimationStep,
        )
      : new Map<number, Set<string>>();
  const isSevenHandSelection =
    sevenSelectionPlayerIndex !== null &&
    handPlayerIndex === sevenSelectionPlayerIndex;
  const canActOnSevenExchangeSelection =
    isSevenHandSelection &&
    (!isOnlineView || viewerIsSevenExchangeParticipant) &&
    !viewerHasSelectedSevenExchangeCard;
  const shouldShowActionPanel =
    (!shouldForceHideActionPanel &&
      !isBlockingSplashVisible &&
      state.phase !== "handoff" &&
      state.phase !== "result" &&
      !isDaifugoEventPlaying &&
      (!isOnlineView || isViewerTurn) &&
      !shouldHideCpuDetails) ||
    (isSevenExchange && (!isOnlineView || viewerIsSevenExchangeParticipant)) ||
    (isViewerRequiredActionPlayer &&
      ((pendingDaifugoEffect?.kind === "sevenEnhancementConfirm" &&
        !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
        (pendingDaifugoEffect?.kind === "sevenEnhancedTargetSelect" &&
          !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
        (pendingDaifugoEffect?.kind === "fiveEnhancementConfirm" &&
          !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
        (pendingDaifugoEffect?.kind === "fiveEnhancedTargetSelect" &&
          !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
        (pendingDaifugoEffect?.kind === "queenSelect" &&
          !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
        (pendingDaifugoEffect?.kind === "queenWinConfirm" &&
          !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
        (pendingDaifugoEffect?.kind === "jackSelect" &&
          !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
        (pendingDaifugoEffect?.kind === "jackShieldSelect" &&
          !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
        (pendingDaifugoEffect?.kind === "jackInspect" &&
          !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
        (pendingDaifugoEffect?.kind === "reachContinueConfirm" &&
          !state.players[pendingDaifugoEffect.playerIndex]?.isCpu)));

  function getJackInspectDisplayCards(
    cards: Card[],
    actorIndex: number,
    targetPlayerIndex: number,
  ) {
    const key = `${actorIndex}:${targetPlayerIndex}:${cards.map((card) => card.id).join("|")}`;
    let orderedIds = jackInspectOrderRef.current.get(key);
    if (!orderedIds) {
      const shuffled = [...cards];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [
          shuffled[swapIndex],
          shuffled[index],
        ];
      }
      orderedIds = shuffled.map((card) => card.id);
      jackInspectOrderRef.current.set(key, orderedIds);
    }
    const cardById = new Map(cards.map((card) => [card.id, card]));
    return orderedIds
      .map((cardId) => cardById.get(cardId))
      .filter((card): card is Card => Boolean(card));
  }

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(window.clearTimeout);
      cpuTimeoutsRef.current.forEach(window.clearTimeout);
      if (reachSplashTimeoutRef.current !== null) {
        window.clearTimeout(reachSplashTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedDiscardId(null);
  }, [state.phase, state.currentPlayerIndex]);

  useEffect(() => {
    setAnimationPhase("idle");
    setAnimationCard(null);
    setAnimationPlayerIndex(null);
    setDiscardingCardId(null);
    timeoutsRef.current.forEach(window.clearTimeout);
    timeoutsRef.current = [];
  }, [state.currentPlayerIndex]);

  useEffect(() => {
    const pending = pendingDaifugoEffect;
    if (
      pending?.kind !== "fiveEnhancementSplash" &&
      pending?.kind !== "sevenEnhancementSplash"
    ) {
      return;
    }
    const player = state.players[pending.playerIndex];
    if (player?.isCpu) return;
    const kind = pending.kind === "fiveEnhancementSplash" ? "five" : "seven";
    const call = kind === "five" ? "5：スキップ強化" : "7：交換相手選択";
    const discardCountsKey = state.players
      .map((player) => player.discardPile.length)
      .join("|");
    const splashKey = `j-enhancement:${kind}:${pending.playerIndex}:${discardCountsKey}`;
    if (lastEnhancementSplashKeyRef.current !== splashKey) {
      lastEnhancementSplashKeyRef.current = splashKey;
      showTimedReachSplash("J強化発動！", call, J_ENHANCEMENT_SPLASH_MS);
    }
    const viewerIsActor = !isOnlineView || state.viewerPlayerId === player?.id;
    if (!viewerIsActor) return;
    const timeoutId = window.setTimeout(() => {
      dispatch({
        type:
          pending.kind === "fiveEnhancementSplash"
            ? "finishFiveEnhancementSplash"
            : "finishSevenEnhancementSplash",
      });
    }, J_ENHANCEMENT_SPLASH_MS);
    return () => window.clearTimeout(timeoutId);
  }, [
    dispatch,
    isOnlineView,
    pendingDaifugoEffect?.kind,
    pendingDaifugoEffect?.playerIndex,
    state.players,
    state.viewerPlayerId,
  ]);

  useEffect(() => {
    const isSevenEnhancementMessage =
      state.message.includes("7渡しの相手を選んでいます") ||
      state.message.includes("強化7の交換相手を選択しています");

    const isFiveEnhancementMessage =
      state.message.includes("次の手番の人を選んでいます") ||
      state.message.includes("強化5の次手番相手を選択しています");

    if (!isSevenEnhancementMessage && !isFiveEnhancementMessage) return;

    const kind = isFiveEnhancementMessage ? "five" : "seven";
    const call = kind === "five" ? "5：スキップ強化" : "7：交換相手選択";
    const actorIndex = state.currentPlayerIndex;
    const actor = state.players[actorIndex];

    if (actor?.isCpu) return;

    const discardCountsKey = state.players
      .map((player) => player.discardPile.length)
      .join("|");
    const splashKey = `j-enhancement:${kind}:${actorIndex}:${discardCountsKey}`;

    if (lastEnhancementSplashKeyRef.current === splashKey) return;

    lastEnhancementSplashKeyRef.current = splashKey;
    showTimedReachSplash("J強化発動！", call, J_ENHANCEMENT_SPLASH_MS);
  }, [state.currentPlayerIndex, state.message, state.players]);

  useEffect(() => {
    const previousReachFlags = previousReachFlagsRef.current;
    const currentReachFlags = state.players.map((player) => player.isReach);
    previousReachFlagsRef.current = currentReachFlags;
    if (!previousReachFlags) return;

    const reachedPlayerIndex = currentReachFlags.findIndex(
      (isReach, index) => isReach && !previousReachFlags[index],
    );
    if (reachedPlayerIndex < 0) return;
    showReachSplash(state.players[reachedPlayerIndex]?.name ?? "プレイヤー");
  }, [state.players]);

  useEffect(() => {
    const pending = state.pendingDaifugoEffect;
    if (!pending) return;
    const splash =
      pending.kind === "sevenExchange"
        ? { playerIndex: pending.playerIndex, call: "カード交換!!" }
        : pending.kind === "queenSelect"
          ? { playerIndex: pending.playerIndex, call: "数字消去!!" }
          : null;
    if (!splash) return;
    const targetKey =
      pending.kind === "sevenExchange" ? pending.targetPlayerIndex : "";
    const discardCountsKey = state.players
      .map((player) => player.discardPile.length)
      .join("|");
    const key = `${pending.kind}:${pending.playerIndex}:${targetKey}:${state.currentPlayerIndex}:${discardCountsKey}`;
    if (lastDaifugoSplashKeyRef.current === key) return;
    lastDaifugoSplashKeyRef.current = key;
    showReachSplash(
      state.players[splash.playerIndex]?.name ?? "プレイヤー",
      splash.call,
    );
  }, [state.currentPlayerIndex, state.pendingDaifugoEffect, state.players]);

  useEffect(() => {
    if (isBlockingSplashVisible || isDaifugoEventPlaying) {
      cpuTimeoutsRef.current.forEach(window.clearTimeout);
      cpuTimeoutsRef.current = [];
      setCpuActionInProgress(false);
      return;
    }

    if (
      disableLocalCpuAutomation ||
      !isCpuTurn ||
      !currentPlayer ||
      state.phase === "handoff" ||
      state.phase === "result"
    ) {
      cpuTimeoutsRef.current.forEach(window.clearTimeout);
      cpuTimeoutsRef.current = [];
      setCpuActionInProgress(false);
      return;
    }

    const pendingCpuRon =
      state.pendingRonResult?.ronResults?.some(
        (item) => state.players[item.winnerIndex]?.isCpu,
      ) ?? false;
    const cpuActionKey = [
      state.phase,
      state.currentPlayerIndex,
      currentPlayer.cpuModelId ?? "standard",
      deckCount,
      state.drawnCard?.id ?? "none",
      state.pendingDaifugoEffect
        ? `${state.pendingDaifugoEffect.kind}:${state.pendingDaifugoEffect.effect}`
        : "no-daifugo",
      state.players
        .map(
          (player) =>
            `${player.hand.length}:${player.discardPile.length}:${player.openMelds.length}`,
        )
        .join("|"),
      pendingCpuRon ? "cpu-ron" : "no-cpu-ron",
    ].join("/");

    if (lastCpuActionKeyRef.current === cpuActionKey) return;
    lastCpuActionKeyRef.current = cpuActionKey;
    setCpuActionInProgress(true);
    const cpuContext = createCpuDecisionContext(state);
    const cpuModel = getCpuModel(currentPlayer.cpuModelId);
    if (!cpuContext) {
      setCpuActionInProgress(false);
      return;
    }

    const scheduleCpuAction = (callback: () => void, delay: number) => {
      const timeoutId = window.setTimeout(() => {
        callback();
        setCpuActionInProgress(false);
      }, delay);
      cpuTimeoutsRef.current.push(timeoutId);
    };

    if (state.pendingDaifugoEffect?.kind === "confirm") {
      scheduleCpuAction(() => {
        const activate =
          cpuModel.chooseDaifugoEffectActivation?.(
            cpuContext,
            state.pendingDaifugoEffect?.effect,
          ) ?? true;
        if (
          activate &&
          state.pendingDaifugoEffect?.effect === "sevenExchange"
        ) {
          showReachSplash(currentPlayer.name, "カード交換!!");
        }
        if (
          activate &&
          state.pendingDaifugoEffect?.effect === "queenNumberVanish"
        ) {
          showReachSplash(currentPlayer.name, "数字消去!!");
        }
        dispatch({ type: "answerDaifugoEffect", activate });
      }, CPU_DECISION_DELAY_MS);
      return;
    }

    if (state.pendingDaifugoEffect?.kind === "queenSelect") {
      scheduleCpuAction(
        () =>
          dispatch({
            type: "selectQueenVanishRank",
            rank:
              cpuModel.chooseQueenVanishRank?.(
                cpuContext,
                availableQueenRankOptions,
              ) ?? chooseCpuQueenRank(state, state.currentPlayerIndex),
          }),
        CPU_DECISION_DELAY_MS,
      );
      return;
    }

    if (state.pendingDaifugoEffect?.kind === "effectDraw") {
      scheduleCpuAction(
        () => dispatch({ type: "drawForDaifugoEffect" }),
        CPU_AFTER_DRAW_DELAY_MS,
      );
      return;
    }

    if (state.pendingDaifugoEffect?.kind === "extraDiscard") {
      const winningDiscard =
        state.pendingDaifugoEffect.effect === "eightExtraTurn"
          ? cpuModel.chooseWinningDiscard(cpuContext)
          : null;
      if (winningDiscard) {
        scheduleCpuAction(
          () =>
            dispatch({
              type: "winWithDiscard",
              discardCardId: winningDiscard.id,
            }),
          CPU_DECISION_DELAY_MS,
        );
        return;
      }
      const discardCard =
        state.pendingDaifugoEffect.effect === "eightExtraTurn" &&
        currentPlayer.isReach &&
        !state.declaredReachThisTurn
          ? state.drawnCard
          : (cpuModel.chooseDaifugoExtraDiscard?.(
              cpuContext,
              state.pendingDaifugoEffect.effect,
              getCpuDiscardCandidates(cpuContext),
            ) ??
            cpuModel.chooseDiscardCard(cpuContext) ??
            currentPlayer.hand[0] ??
            null);
      if (discardCard) {
        scheduleCpuAction(
          () =>
            dispatch({
              type: "discardForDaifugoEffect",
              cardId: discardCard.id,
            }),
          CPU_DISCARD_DELAY_MS,
        );
        return;
      }
      setCpuActionInProgress(false);
      return;
    }

    if (state.phase === "draw") {
      scheduleCpuAction(() => {
        const skipLog = cpuModel.describeCallSkip?.(cpuContext);
        if (skipLog) console.info(skipLog);
        dispatch(cpuModel.chooseDrawSource(cpuContext));
      }, CPU_THINK_DELAY_MS);
      return;
    }

    if (state.phase === "discard") {
      const winningDiscard = cpuModel.chooseWinningDiscard(cpuContext);
      if (winningDiscard) {
        scheduleCpuAction(
          () =>
            dispatch({
              type: "winWithDiscard",
              discardCardId: winningDiscard.id,
            }),
          CPU_DECISION_DELAY_MS,
        );
        return;
      }

      if (currentPlayer.isReach && !state.declaredReachThisTurn) {
        scheduleCpuAction(
          () => dispatch({ type: "discardDrawnOnly" }),
          CPU_DISCARD_DELAY_MS,
        );
        return;
      }

      const discardCard = cpuModel.chooseDiscardCard(cpuContext);
      if (discardCard) {
        const delay = state.drawnCard
          ? CPU_AFTER_DRAW_DELAY_MS + CPU_DISCARD_DELAY_MS
          : CPU_DISCARD_DELAY_MS;
        scheduleCpuAction(() => {
          const debugInfo = cpuModel.getDiscardDebugInfo?.(cpuContext);
          if (debugInfo) console.info(debugInfo);
          const discardLog = cpuModel.describeDiscardChoice?.(
            cpuContext,
            discardCard,
          );
          if (discardLog) console.info(discardLog);
          dispatch({ type: "discard", cardId: discardCard.id });
        }, delay);
        return;
      }
    }

    if (state.phase === "reachConfirm") {
      scheduleCpuAction(() => {
        const declareReach =
          cpuModel.chooseReachDeclaration?.(cpuContext) ?? false;
        dispatch({ type: "answerReachAfterDiscard", declareReach });
      }, CPU_DECISION_DELAY_MS);
      return;
    }

    if (state.phase === "ronCheck") {
      if (pendingCpuRon) {
        scheduleCpuAction(
          () => dispatch({ type: "answerRon", takeRon: true }),
          CPU_DECISION_DELAY_MS,
        );
        return;
      }
      setCpuActionInProgress(false);
    }
  }, [
    currentPlayer,
    deckCount,
    disableLocalCpuAutomation,
    dispatch,
    isCpuTurn,
    isDaifugoEventPlaying,
    isBlockingSplashVisible,
    state,
  ]);

  useEffect(() => {
    if (
      selectedDiscardId &&
      !handPlayer.hand.some((card) => card.id === selectedDiscardId)
    ) {
      setSelectedDiscardId(null);
    }
  }, [handPlayer.hand, selectedDiscardId]);

  useEffect(() => {
    if (
      selectedDiscardId &&
      isSevenExchange &&
      !canActOnSevenExchangeSelection
    ) {
      setSelectedDiscardId(null);
    }
  }, [canActOnSevenExchangeSelection, isSevenExchange, selectedDiscardId]);

  useEffect(() => {
    if (!isOnlineView) return;
    const deckDrawEvent = state.daifugoDeckDrawEvent;
    if (
      deckDrawEvent?.drawnCard &&
      deckDrawEvent.playerIndex === viewerPlayerIndex
    ) {
      const animationKey = deckDrawEvent.id;
      if (lastOnlineDrawAnimationKeyRef.current === animationKey) return;
      lastOnlineDrawAnimationKeyRef.current = animationKey;
      setAnimationCard(deckDrawEvent.drawnCard);
      setAnimationPlayerIndex(deckDrawEvent.playerIndex);
      setAnimationPhase("drawingFromDeck");
      schedule(() => setAnimationPhase("revealingDrawnCard"), 280);
      schedule(() => setAnimationPhase("movingDrawnCardToHand"), 1550);
      schedule(() => finishAnimation(), 2100);
      return;
    }

    if (
      !state.drawnCard ||
      state.drawnFrom !== "deck" ||
      state.phase !== "discard"
    )
      return;
    if (state.viewerPlayerId !== currentPlayer?.id) return;
    if (state.pendingDaifugoEffect) return;
    if (
      !availableActions.has("discard") &&
      !availableActions.has("discardDrawnOnly")
    )
      return;
    const animationKey = `${state.stateVersion ?? 0}:${state.drawnCard.id}`;
    if (lastOnlineDrawAnimationKeyRef.current === animationKey) return;
    lastOnlineDrawAnimationKeyRef.current = animationKey;
    setAnimationCard(state.drawnCard);
    setAnimationPlayerIndex(state.currentPlayerIndex);
    setAnimationPhase("drawingFromDeck");
    schedule(() => setAnimationPhase("revealingDrawnCard"), 280);
    schedule(() => setAnimationPhase("movingDrawnCardToHand"), 1550);
    schedule(() => finishAnimation(), 2100);
  }, [
    availableActions,
    currentPlayer?.id,
    isOnlineView,
    state.currentPlayerIndex,
    state.daifugoDeckDrawEvent,
    state.drawnCard,
    state.drawnFrom,
    state.pendingDaifugoEffect,
    state.phase,
    state.stateVersion,
    state.viewerPlayerId,
    viewerPlayerIndex,
  ]);

  useEffect(() => {
    if (state.phase === "handoff") {
      if (isOnlineView && !isViewerTurn) return;
      if (state.daifugoEffectEvent && isDaifugoEventPlaying) return;
      if (state.pendingDaifugoEffect) return;
      const timeoutId = window.setTimeout(() => {
        dispatch({ type: "confirmHandoff" });
      }, 3000);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [
    state.phase,
    state.daifugoEffectEvent?.id,
    state.pendingDaifugoEffect,
    isDaifugoEventPlaying,
    isOnlineView,
    isViewerTurn,
    dispatch,
  ]);

  useEffect(() => {
    if (!state.daifugoEffectEvent) return;
    const steps = buildDaifugoAnimationSteps(state.daifugoEffectEvent, state);
    if (steps.length === 0) {
      setVisibleDaifugoEventId(null);
      return;
    }
    setDaifugoEventStepIndex(0);
    setDaifugoDrawPhase("reveal");
    setVisibleDaifugoEventId(state.daifugoEffectEvent.id);
  }, [state.daifugoEffectEvent?.id]);

  useEffect(() => {
    if (!visibleDaifugoEvent || !daifugoAnimationStep) return;
    setDaifugoDrawPhase("reveal");
    if (
      daifugoAnimationStep.variant === "draw" ||
      daifugoAnimationStep.variant === "exchange"
    ) {
      const insertTimeoutId = window.setTimeout(
        () => setDaifugoDrawPhase("insert"),
        1550,
      );
      return () => window.clearTimeout(insertTimeoutId);
    }
  }, [visibleDaifugoEvent?.id, daifugoEventStepIndex]);

  useEffect(() => {
    if (!visibleDaifugoEvent || !daifugoAnimationStep) return;
    const timeoutId = window.setTimeout(() => {
      setDaifugoEventStepIndex((index) => {
        if (
          (daifugoAnimationStep.variant === "draw" ||
            daifugoAnimationStep.variant === "exchange") &&
          daifugoAnimationStep.phase !== "insert"
        ) {
          return index;
        }
        const nextIndex = index + 1;
        if (nextIndex >= daifugoAnimationSteps.length) {
          setVisibleDaifugoEventId(null);
          return 0;
        }
        return nextIndex;
      });
    }, getDaifugoStepDuration(daifugoAnimationStep));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    visibleDaifugoEvent?.id,
    daifugoEventStepIndex,
    daifugoAnimationStep,
    daifugoAnimationSteps.length,
  ]);

  useEffect(() => {
    if (state.pendingDaifugoEffect?.kind !== "queenWinConfirm") return;
    if (!state.daifugoEffectEvent) {
      dispatch({ type: "answerQueenWin", takeWin: true });
      return;
    }
    const steps = buildDaifugoAnimationSteps(state.daifugoEffectEvent, state);
    const timeoutId = window.setTimeout(
      () => dispatch({ type: "answerQueenWin", takeWin: true }),
      getDaifugoAnimationTotalDuration(steps),
    );
    return () => window.clearTimeout(timeoutId);
  }, [
    dispatch,
    state.daifugoEffectEvent?.id,
    state.pendingDaifugoEffect,
    state.players,
    state.showCpuActions,
  ]);

  useEffect(() => {
    if (
      currentPlayer?.isCpu ||
      state.pendingDaifugoEffect?.kind !== "effectDraw" ||
      isAnimating
    )
      return;
    if (isOnlineView) {
      if (!isViewerRequiredActionPlayer) return;

      const timeoutId = window.setTimeout(() => {
        dispatch({ type: "drawForDaifugoEffect" });
      }, 2100);

      return () => window.clearTimeout(timeoutId);
    }
    animateDrawFromDeck(() => dispatch({ type: "drawForDaifugoEffect" }));
  }, [
    currentPlayer?.isCpu,
    dispatch,
    isAnimating,
    isOnlineView,
    isViewerRequiredActionPlayer,
    state.pendingDaifugoEffect,
  ]);

  useEffect(() => {
    if (state.phase === "ronCheck") {
      setRonCountdown(3);
      const intervalId = window.setInterval(() => {
        setRonCountdown((count) => Math.max(0, count - 1));
      }, 1000);

      return () => {
        window.clearInterval(intervalId);
      };
    }
  }, [state.phase, dispatch]);

  useLayoutEffect(() => {
    if (playerCount < 3) {
      setMeasuredHistoryPositions({});
      return;
    }

    let frameId = 0;

    const measureHistoryAnchors = () => {
      const scene = sceneRef.current;
      if (!scene) return;

      const sceneRect = scene.getBoundingClientRect();
      const next: Record<number, { left: string; top: string }> = {};
      const debugRows: Array<Record<string, unknown>> = [];

      for (let index = 0; index < state.players.length; index += 1) {
        const element = historyMeasureRefs.current.get(index);
        if (!element) continue;

        const rect = element.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - sceneRect.left;
        let top = rect.top + rect.height / 2 - sceneRect.top;

        if (playerCount === 5 && index === 4) {
          const player4 = next[3];
          if (player4) {
            const player4Left = Number.parseFloat(player4.left);
            const player4Top = Number.parseFloat(player4.top);
            if (Math.hypot(left - player4Left, top - player4Top) < 72) {
              left -= 48;
              top -= 20;
            }
          }
        }

        left = Math.max(24, Math.min(sceneRect.width - 24, left));
        top = Math.max(24, Math.min(sceneRect.height - 24, top));
        next[index] = {
          left: `${Math.round(left)}px`,
          top: `${Math.round(top)}px`,
        };

        debugRows.push({
          playerId: state.players[index]?.id,
          playerName: state.players[index]?.name,
          rectLeft: Math.round(rect.left),
          rectTop: Math.round(rect.top),
          rectWidth: Math.round(rect.width),
          rectHeight: Math.round(rect.height),
          finalLeft: next[index].left,
          finalTop: next[index].top,
        });
      }

      setMeasuredHistoryPositions((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );

      if (window.localStorage.getItem("debugHistoryAnchors") === "1") {
        console.table(debugRows);
      }
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measureHistoryAnchors);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [playerCount, state.players]);

  function schedule(callback: () => void, delay: number) {
    const timeoutId = window.setTimeout(callback, delay);
    timeoutsRef.current.push(timeoutId);
  }

  function finishAnimation() {
    setAnimationPhase("idle");
    setAnimationCard(null);
    setAnimationPlayerIndex(null);
    setDiscardingCardId(null);
  }

  function handleDrawFromDeck() {
    if (isOnlineView) {
      dispatch({ type: "drawFromDeck" });
      return;
    }
    animateDrawFromDeck(() => dispatch({ type: "drawFromDeck" }));
  }

  function animateDrawFromDeck(afterAnimation: () => void) {
    if (isAnimating || deckCount === 0) return;
    const card = state.deck[0] ?? {
      id: "online-hidden-draw",
      suit: "S" as const,
      rank: 1,
    };
    setAnimationCard(card);
    setAnimationPlayerIndex(state.currentPlayerIndex);
    setAnimationPhase("drawingFromDeck");
    schedule(() => setAnimationPhase("revealingDrawnCard"), 280);
    schedule(() => setAnimationPhase("movingDrawnCardToHand"), 1550);
    schedule(() => {
      afterAnimation();
      finishAnimation();
    }, 2100);
  }

  function animateDiscard(card: Card, afterAnimation: () => void) {
    if (isAnimating) return;
    setAnimationCard(card);
    setDiscardingCardId(card.id);
    setAnimationPhase("discardingCard");
    schedule(() => {
      afterAnimation();
      setSelectedDiscardId(null);
      finishAnimation();
    }, 650);
  }

  function handleDiscardSelected() {
    const card = currentPlayer.hand.find(
      (item) => item.id === selectedDiscardId,
    );
    if (!card) return;
    if (isCardJShielded(currentPlayer, card)) return;
    animateDiscard(card, () => dispatch({ type: "discard", cardId: card.id }));
  }

  function handleDaifugoExtraDiscard() {
    const mustDiscardDrawnForReach =
      state.pendingDaifugoEffect?.kind === "extraDiscard" &&
      state.pendingDaifugoEffect.effect === "eightExtraTurn" &&
      currentPlayer.isReach &&
      !state.declaredReachThisTurn;
    const card = mustDiscardDrawnForReach
      ? state.drawnCard
      : currentPlayer.hand.find((item) => item.id === selectedDiscardId);
    if (!card) return;
    if (isCardJShielded(currentPlayer, card)) return;
    animateDiscard(card, () =>
      dispatch({ type: "discardForDaifugoEffect", cardId: card.id }),
    );
  }

  function handleSevenExchangeConfirm() {
    if (
      !canActOnSevenExchangeSelection ||
      sevenSelectionPlayerIndex === null ||
      !sevenSelectionPlayer ||
      !selectedDiscardId
    )
      return;
    const card = sevenSelectionPlayer.hand.find(
      (item) => item.id === selectedDiscardId,
    );
    if (!card || !sevenSelectionCandidateIds.includes(card.id)) return;
    animateDiscard(card, () =>
      dispatch({
        type: "selectSevenExchangeCard",
        playerIndex: sevenSelectionPlayerIndex,
        cardId: card.id,
      }),
    );
  }

  function handleDiscardDrawnOnly() {
    if (!state.drawnCard) return;
    if (isCardJShielded(currentPlayer, state.drawnCard)) return;
    animateDiscard(state.drawnCard, () =>
      dispatch({ type: "discardDrawnOnly" }),
    );
  }

  function handleWinWithDiscard(card: Card) {
    if (isCardJShielded(currentPlayer, card)) return;
    animateDiscard(card, () =>
      dispatch({ type: "winWithDiscard", discardCardId: card.id }),
    );
  }

  function handleHandCardClick(card: Card) {
    if (isSevenHandSelection) {
      if (!canActOnSevenExchangeSelection) return;
      if (!sevenSelectionCandidateIds.includes(card.id)) return;
      if (selectedDiscardId === card.id) {
        animateDiscard(card, () =>
          dispatch({
            type: "selectSevenExchangeCard",
            playerIndex: sevenSelectionPlayerIndex!,
            cardId: card.id,
          }),
        );
        return;
      }
      setSelectedDiscardId(card.id);
      return;
    }
    if (isCardJShielded(currentPlayer, card)) return;
    setSelectedDiscardId((previousId) =>
      previousId === card.id ? null : card.id,
    );
  }

  function handleDaifugoConfirmAnswer(activate: boolean) {
    dispatch({ type: "answerDaifugoEffect", activate });
  }

  function showTimedReachSplash(
    playerName: string,
    call: string,
    duration: number,
  ) {
    setReachSplashPlayerName(playerName);
    setReachSplashCall(call);
    setReachSplashDurationMs(duration);
    if (reachSplashTimeoutRef.current !== null) {
      window.clearTimeout(reachSplashTimeoutRef.current);
    }
    reachSplashTimeoutRef.current = window.setTimeout(() => {
      setReachSplashPlayerName(null);
      reachSplashTimeoutRef.current = null;
    }, duration);
  }

  function showReachSplash(playerName: string, call = "リーチ!!") {
    showTimedReachSplash(playerName, call, 2600);
  }

  function handleDeclareReach() {
    dispatch({ type: "declareReach" });
  }

  function handleReachConfirmAnswer(declareReach: boolean) {
    dispatch({ type: "answerReachAfterDiscard", declareReach });
  }

  return (
    <main
      className="screen play-screen"
      data-testid="play-screen"
      data-current-player-id={currentPlayer?.id}
      data-phase={state.phase}
      data-state-version={state.stateVersion ?? ""}
    >
      <MobileLayoutDebugPanel playerCount={playerCount} />
      <section
        className={`table-scene table-${playerCount}`}
        aria-label={`${playerCount}人用テーブル`}
        ref={sceneRef}
        onPointerDownCapture={(event) => {
          if (!isBlockingSplashVisible) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onClickCapture={(event) => {
          if (!isBlockingSplashVisible) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {currentRound && (
          <div className="round-scroll-banner">- {currentRound}回戦 -</div>
        )}
        <header
          className={`top-toolbar ${animationPhase === "discardingCard" ? "toolbar-exiting" : ""}`}
          key={`toolbar-${state.currentPlayerIndex}`}
        >
          <div className="toolbar-player">
            <span>現在のプレイヤー</span>
            <strong>
              {cpuDisplayNames.get(state.currentPlayerIndex) ??
                currentPlayer.name}
            </strong>
            <em>{getPlayerStatus(currentPlayer, true)}</em>
          </div>
          <div className="toolbar-action">
            {daifugoAnimationStep?.message ??
              getActionText(state, state.viewerPlayerId)}
          </div>
          <div className="toolbar-deck">
            <span>山札</span>
            <strong data-testid="deck-remaining">{deckCount}</strong>
          </div>
          {state.daifugoOptions.enabled && (
            <div className="daifugo-status">
              <span className="daifugo-status-direction">
                {state.direction === "clockwise" ? "通常順" : "逆回り"}
              </span>
            </div>
          )}
        </header>
        {onExitToHome && (
          <button
            type="button"
            className="play-exit-button room-management-button"
            aria-label="設定"
            title="設定"
            onClick={() => setIsRoomMenuOpen(true)}
          >
            ⚙
          </button>
        )}
        {isRoomMenuOpen && onExitToHome && (
          <RoomManagementDialog
            activeTab={roomMenuTab}
            isHost={isOnlineHost}
            transferTargets={hostTransferTargets}
            room={onlineRoom}
            onlinePlayerId={onlinePlayerId}
            state={state}
            matchState={matchState}
            onSelectTab={setRoomMenuTab}
            onClose={() => setIsRoomMenuOpen(false)}
            onExit={() => {
              setIsRoomMenuOpen(false);
              onExitToHome();
            }}
            onTransferHost={(targetPlayerId) => {
              onTransferHost?.(targetPlayerId);
              setIsRoomMenuOpen(false);
            }}
            onStartTemporaryLeave={(mode) => {
              onStartTemporaryLeave?.(mode);
              setIsRoomMenuOpen(false);
            }}
            onUpdateMatchSettings={onUpdateMatchSettings}
            onUpdateSubstituteCpuModel={onUpdateSubstituteCpuModel}
          />
        )}

        <div className="table-shape">
          <div
            className={`deck-stack ${deckCount === 0 ? "empty-deck" : ""}`}
            aria-label={`山札 ${deckCount}枚`}
            data-testid="deck-stack"
          >
            <span className="deck-layer layer-one" />
            <span className="deck-layer layer-two" />
            <PlayingCard isBack compact />
            <strong data-testid="deck-remaining-table">{deckCount}</strong>
          </div>
        </div>

        {animationCard &&
          animationPhase !== "discardingCard" &&
          !shouldHideCpuDetails && (
            <div
              className={`card-animation ${animationPhase} seat-${getSeat(playerCount, animationPlayerIndex ?? state.currentPlayerIndex)}`}
              data-testid="drawn-card-preview"
            >
              <span className="card-animation-label">
                {getAnimationLabel(animationPhase)}
              </span>
              <PlayingCard card={animationCard} testId="drawn-card" />
            </div>
          )}

        {reachSplashPlayerName && (
          <div
            className="reach-splash"
            role="status"
            aria-live="assertive"
            style={
              {
                "--reach-splash-duration": `${reachSplashDurationMs}ms`,
              } as CSSProperties
            }
          >
            <div className="reach-splash-band">
              <img
                src={reachVisualSrc}
                alt=""
                className="reach-splash-visual"
              />
              <div className="reach-splash-copy">
                <span>宣言</span>
                <strong>
                  <span className="reach-splash-player">
                    {reachSplashPlayerName}
                  </span>
                  <span className="reach-splash-call">{reachSplashCall}</span>
                </strong>
              </div>
            </div>
          </div>
        )}

        {daifugoAnimationStep && daifugoAnimationStep.cards.length > 0 && (
          <section
            className={`daifugo-event-overlay ${daifugoAnimationStep.side === "cpu" ? "cpu-side" : "center-side"}`}
            role="status"
            aria-live="polite"
          >
            <DaifugoAnimationStage step={daifugoAnimationStep} />
          </section>
        )}

        {state.phase === "ronCheck" && pendingRonResult && (
          <div
            className="ron-check-overlay"
            role="status"
            aria-live="assertive"
          >
            <section className="ron-check-panel">
              <p className="eyebrow">ロン確認</p>
              <h1>
                {ronWinners
                  .map((item) => state.players[item.winnerIndex].name)
                  .join("・")}{" "}
                ロン!!
              </h1>
              <div className="ron-check-card">
                <span>
                  {ronDiscarder ? `${ronDiscarder.name}の捨て札` : "捨て札"}
                </span>
                <strong>{ronCard ? formatCard(ronCard) : "確認中"}</strong>
              </div>
              <div className="ron-check-winners">
                {(ronWinners.length > 0
                  ? ronWinners
                  : [
                      {
                        winnerIndex: pendingRonResult.winnerIndex,
                        winningResult: pendingRonResult.winningResult,
                        score: pendingRonResult.score,
                      },
                    ]
                ).map((item) => (
                  <section
                    className="ron-check-candidate"
                    key={item.winnerIndex}
                  >
                    <div className="ron-check-row">
                      <span>{state.players[item.winnerIndex].name}</span>
                      <strong>ロン可能</strong>
                    </div>
                    <div
                      className="ron-hand-preview"
                      aria-label={`${state.players[item.winnerIndex].name}の手札完成プレビュー`}
                    >
                      {item.winningResult.melds.map((meld, meldIndex) => (
                        <div
                          className="ron-preview-meld"
                          key={`${item.winnerIndex}-${meldIndex}-${meld.map((card) => card.id).join("-")}`}
                        >
                          {meld.map((card) => (
                            <PlayingCard card={card} compact key={card.id} />
                          ))}
                        </div>
                      ))}
                    </div>
                    <div
                      className="ron-rest-preview"
                      aria-label={`${state.players[item.winnerIndex].name}の余ったトランプ`}
                    >
                      <span>余ったトランプ</span>
                      <div>
                        {getRonRemainingCards(
                          state.players[item.winnerIndex].hand,
                          ronCard,
                          item.winningResult.melds,
                        ).length === 0 ? (
                          <em>なし</em>
                        ) : (
                          getRonRemainingCards(
                            state.players[item.winnerIndex].hand,
                            ronCard,
                            item.winningResult.melds,
                          ).map((card) => (
                            <PlayingCard card={card} compact key={card.id} />
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
              <div
                className="countdown-ring"
                aria-label={`ロン確認 ${ronCountdown}秒`}
              >
                {ronCountdown}
              </div>
              <div className="ron-check-actions">
                <button
                  type="button"
                  className="primary-button"
                  data-testid="ron-button"
                  onClick={() => dispatch({ type: "answerRon", takeRon: true })}
                >
                  はい
                </button>
                <button
                  type="button"
                  data-testid="reaction-pass-button"
                  onClick={() =>
                    dispatch({ type: "answerRon", takeRon: false })
                  }
                >
                  いいえ
                </button>
              </div>
            </section>
          </div>
        )}

        {displaySlots.map(({ player, playerIndex, slotIndex }) => (
          <PlayerArea
            key={player.id}
            player={player}
            isCurrent={playerIndex === state.currentPlayerIndex}
            seat={getSeat(playerCount, slotIndex)}
            displayName={cpuDisplayNames.get(playerIndex)}
            temporaryLeaveStatus={getTemporaryLeaveStatus(
              onlineRoom,
              player.id,
            )}
            className={`player-status-slot player-status-slot--p${slotIndex + 1}`}
            style={getSeatStyle(playerCount, slotIndex)}
          />
        ))}

        {playerCount >= 4 &&
          displaySlots.map(({ player, slotIndex }) => {
            const layout = measuredAnchorLayouts[playerCount]?.[slotIndex];
            if (!layout) return null;

            return (
              <span
                className={`history-measure-anchor history-measure-anchor--p${slotIndex + 1}`}
                style={layout}
                ref={(node) => {
                  if (node) {
                    historyMeasureRefs.current.set(slotIndex, node);
                  } else {
                    historyMeasureRefs.current.delete(slotIndex);
                  }
                }}
                aria-hidden="true"
                key={`${player.id}-history-measure`}
              />
            );
          })}
        {playerCount >= 4 &&
          displaySlots.map(({ player, slotIndex }) => (
            <div
              className={`history-hover-anchor history-hover-anchor--${getSeat(playerCount, slotIndex)} history-hover-anchor--p${slotIndex + 1}`}
              style={
                measuredHistoryPositions[slotIndex] ??
                getHistoryAnchorStyle(playerCount, slotIndex)
              }
              key={`${player.id}-history-hover`}
            >
              <button
                type="button"
                className="history-hover-marker"
                aria-label={`${player.name}\u306e\u5c65\u6b74\u3092\u78ba\u8a8d`}
              >
                ?
              </button>
              <PlayerHistoryPopover player={player} showMelds />
            </div>
          ))}

        {showTableCardLayer &&
          displaySlots.map(({ player, playerIndex, slotIndex }) => {
            const visibleDiscardPile = getVisibleDiscardPile(
              player.discardPile,
              hiddenQueenDiscardIdsByPlayer.get(playerIndex),
            );
            const measuredPosition = measuredHistoryPositions[slotIndex];
            return visibleDiscardPile.length > 0 ? (
              <div
                className={`history-hover-anchor table-history-anchor table-history-anchor--${getAreaName(getSeat(playerCount, slotIndex))}`}
                style={
                  measuredPosition ??
                  getHistoryAnchorStyle(playerCount, slotIndex)
                }
                key={`${player.id}-table-history-hover`}
              >
                <button
                  type="button"
                  className="history-hover-marker"
                  aria-label={`${player.name}\u306e\u6368\u3066\u672d\u5c65\u6b74\u3092\u78ba\u8a8d`}
                >
                  ?
                </button>
                <PlayerHistoryPopover player={player} showMelds={false} />
              </div>
            ) : null;
          })}

        {showTableCardLayer && (
          <div className="table-card-layer" aria-label="捨て札と公開役">
            {displaySlots.map(({ player, playerIndex, slotIndex }) => {
              const area = getAreaName(getSeat(playerCount, slotIndex));
              const visibleDiscardPile = getVisibleDiscardPile(
                player.discardPile,
                hiddenQueenDiscardIdsByPlayer.get(playerIndex),
              );
              if (area === "self") {
                return (
                  <div className="self-table-zone" key={`${player.id}-field`}>
                    <div className="self-discard-column">
                      <DiscardPile
                        cards={visibleDiscardPile}
                        area={area}
                        highlightLatest={
                          discardHighlights.get(playerIndex) ?? null
                        }
                      />
                      {visibleDiscardPile.length > 0 && (
                        <span
                          className="discard-first-card-anchor"
                          ref={(node) => {
                            if (node) {
                              historyMeasureRefs.current.set(slotIndex, node);
                            } else {
                              historyMeasureRefs.current.delete(slotIndex);
                            }
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="self-open-melds-zone">
                      <MeldArea melds={player.openMelds} area={area} />
                    </div>
                  </div>
                );
              }

              if (area === "left" || area === "right") {
                return (
                  <div
                    className={`opponent-field opponent-field--${area}`}
                    key={`${player.id}-field`}
                  >
                    <div className="opponent-card-group">
                      <div
                        className={`opponent-discard-stack history-hover-zone--${area}`}
                      >
                        <DiscardPile
                          cards={visibleDiscardPile}
                          area={area}
                          highlightLatest={
                            discardHighlights.get(playerIndex) ?? null
                          }
                        />
                        {visibleDiscardPile.length > 0 && (
                          <span
                            className="discard-first-card-anchor"
                            ref={(node) => {
                              if (node) {
                                historyMeasureRefs.current.set(slotIndex, node);
                              } else {
                                historyMeasureRefs.current.delete(slotIndex);
                              }
                            }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div className="opponent-meld-zone">
                        <MeldArea melds={player.openMelds} area={area} />
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  className={`card-field card-field--${area}`}
                  key={`${player.id}-field`}
                >
                  <div className={`history-hover-zone--${area}`}>
                    <DiscardPile
                      cards={visibleDiscardPile}
                      area={area}
                      highlightLatest={
                        discardHighlights.get(playerIndex) ?? null
                      }
                    />
                    {visibleDiscardPile.length > 0 && (
                      <span
                        className="discard-first-card-anchor"
                        ref={(node) => {
                          if (node) {
                            historyMeasureRefs.current.set(slotIndex, node);
                          } else {
                            historyMeasureRefs.current.delete(slotIndex);
                          }
                        }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className={`open-meld-field open-meld-field--${area}`}>
                    <MeldArea melds={player.openMelds} area={area} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {shouldShowActionPanel && (
          <section
            className={`action-panel ${isJackInspect ? "jack-inspect-action-panel" : ""} ${
              isEnhancedTargetSelect
                ? `enhanced-target-action-panel enhanced-target-action-panel--${playerCount}`
                : ""
            }`}
          >
            {/* //// ===== 下部ナビ：大富豪効果の確認 =====
            //「8を使いますか？」「10を使いますか？」などの yes/no
            ボタンを出す。 */}
            {isDaifugoConfirm && (
              <div className="daifugo-effect-panel">
                <strong>
                  {getDaifugoEffectText(pendingDaifugoEffect.effect)}
                </strong>
                <div className="daifugo-effect-actions">
                  <button
                    type="button"
                    className="primary-button"
                    data-testid="effect-confirm-yes"
                    disabled={isAnimating || isCpuTurn}
                    onClick={() => handleDaifugoConfirmAnswer(true)}
                  >
                    はい
                  </button>
                  <button
                    type="button"
                    data-testid="effect-confirm-no"
                    disabled={isAnimating || isCpuTurn}
                    onClick={() => handleDaifugoConfirmAnswer(false)}
                  >
                    いいえ
                  </button>
                </div>
              </div>
            )}
            {/* 下部ナビ:8/10の追加捨て  
            //8で山札から引いた後、または10で追加捨てする時の操作パネル。 
            //上部ナビと同じ文言をここで繰り返さないようにする。 */}
            {isDaifugoExtraDiscard && (
              <div className="daifugo-effect-panel">
                {pendingDaifugoEffect.effect === "eightExtraTurn" &&
                  canReachAfterDraw && (
                    <button
                      type="button"
                      className="primary-button"
                      data-testid="reach-button"
                      disabled={isAnimating || isCpuTurn || cpuActionInProgress}
                      onClick={handleDeclareReach}
                    >
                      リーチ
                    </button>
                  )}
                {pendingDaifugoEffect.effect === "eightExtraTurn" &&
                  currentPlayer.isReach &&
                  !state.declaredReachThisTurn &&
                  selfWinOptions.length > 0 && (
                    <div className="reach-win-options">
                      <strong>上がるために捨てるカード</strong>
                      {selfWinOptions.map((option) => (
                        <button
                          type="button"
                          className="primary-button"
                          data-testid="tsumo-button"
                          key={option.discardCard.id}
                          disabled={
                            isAnimating || isCpuTurn || cpuActionInProgress
                          }
                          onClick={() =>
                            handleWinWithDiscard(option.discardCard)
                          }
                        >
                          上がる {formatCard(option.discardCard)}を捨てる
                        </button>
                      ))}
                    </div>
                  )}
                <button
                  type="button"
                  className="primary-button"
                  data-testid="effect-extra-discard-button"
                  disabled={
                    (!selectedDiscardId && !mustDiscardDrawnForReachDaifugo) ||
                    isAnimating ||
                    isCpuTurn ||
                    cpuActionInProgress
                  }
                  onClick={handleDaifugoExtraDiscard}
                >
                  {mustDiscardDrawnForReachDaifugo
                    ? "引いたカードを捨てる"
                    : "効果で捨てる"}
                </button>
              </div>
            )}
            {isFiveEnhancementConfirm &&
              isViewerRequiredActionPlayer &&
              !state.players[pendingDaifugoEffect.playerIndex]?.isCpu && (
                <div className="daifugo-effect-panel seven-enhancement-panel">
                  <strong>J強化を使用しますか？</strong>
                  <span className="hint">
                    次に手番を渡す相手を選び、途中のプレイヤーをスキップできます。
                  </span>
                  <div className="daifugo-effect-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={isAnimating || cpuActionInProgress}
                      onClick={() =>
                        dispatch({
                          type: "answerFiveEnhancement",
                          useEnhancement: true,
                        })
                      }
                    >
                      はい
                    </button>
                    <button
                      type="button"
                      disabled={isAnimating || cpuActionInProgress}
                      onClick={() =>
                        dispatch({
                          type: "answerFiveEnhancement",
                          useEnhancement: false,
                        })
                      }
                    >
                      いいえ
                    </button>
                  </div>
                </div>
              )}
            {isFiveEnhancedTargetSelect &&
              isViewerRequiredActionPlayer &&
              !state.players[pendingDaifugoEffect.playerIndex]?.isCpu && (
                <div className="daifugo-effect-panel enhanced-target-select-panel five-enhancement-panel">
                  <strong>次の手番を渡すプレイヤーを選択してください</strong>
                  <span className="hint">
                    選択したプレイヤーまでの間にいる相手をスキップします。
                  </span>
                  <EnhancedTargetTable
                    mode="five"
                    players={state.players}
                    viewerPlayerId={state.viewerPlayerId}
                    actorIndex={pendingDaifugoEffect.playerIndex}
                    selectedTargetIndex={
                      pendingDaifugoEffect.selectedTargetPlayerIndex
                    }
                    direction={state.direction}
                    fiveOptions={enhancedFiveTurnOptions}
                    selectedFiveOption={selectedEnhancedFiveOption}
                    disabled={isAnimating || cpuActionInProgress}
                    onSelect={(playerIndex) =>
                      dispatch({
                        type: "selectEnhancedFiveTarget",
                        targetPlayerIndex: playerIndex,
                      })
                    }
                  />
                  {selectedEnhancedFiveOption && (
                    <span className="hint">
                      {selectedEnhancedFiveOption.skippedPlayerIndexes.length >
                      0
                        ? `${selectedEnhancedFiveOption.skippedPlayerIndexes.map((playerIndex) => state.players[playerIndex].name).join("、")}をスキップし、`
                        : ""}
                      次の手番を
                      {
                        state.players[selectedEnhancedFiveOption.playerIndex]
                          .name
                      }
                      へ渡します。
                    </span>
                  )}
                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      pendingDaifugoEffect.selectedTargetPlayerIndex ===
                        undefined ||
                      isAnimating ||
                      cpuActionInProgress
                    }
                    onClick={() =>
                      dispatch({ type: "confirmEnhancedFiveTarget" })
                    }
                  >
                    この内容でスキップ
                  </button>
                </div>
              )}
            {isSevenEnhancementConfirm &&
              isViewerRequiredActionPlayer &&
              !state.players[pendingDaifugoEffect.playerIndex]?.isCpu && (
                <div className="daifugo-effect-panel seven-enhancement-panel">
                  <strong>J強化を使用しますか？</strong>
                  <span className="hint">
                    7の交換相手を自由に選択できます。
                  </span>
                  <div className="daifugo-effect-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={isAnimating || cpuActionInProgress}
                      onClick={() =>
                        dispatch({
                          type: "answerSevenEnhancement",
                          useEnhancement: true,
                        })
                      }
                    >
                      はい
                    </button>
                    <button
                      type="button"
                      disabled={isAnimating || cpuActionInProgress}
                      onClick={() =>
                        dispatch({
                          type: "answerSevenEnhancement",
                          useEnhancement: false,
                        })
                      }
                    >
                      いいえ
                    </button>
                  </div>
                </div>
              )}
            {isSevenEnhancedTargetSelect &&
              isViewerRequiredActionPlayer &&
              !state.players[pendingDaifugoEffect.playerIndex]?.isCpu && (
                <div className="daifugo-effect-panel enhanced-target-select-panel seven-enhancement-panel">
                  <strong>交換相手を選択してください</strong>
                  <span className="hint">
                    J強化により、任意の相手とカードを交換できます。
                  </span>
                  <EnhancedTargetTable
                    mode="seven"
                    players={state.players}
                    viewerPlayerId={state.viewerPlayerId}
                    actorIndex={pendingDaifugoEffect.playerIndex}
                    selectedTargetIndex={
                      pendingDaifugoEffect.selectedTargetPlayerIndex
                    }
                    direction={state.direction}
                    disabled={isAnimating || cpuActionInProgress}
                    onSelect={(playerIndex) =>
                      dispatch({
                        type: "selectEnhancedSevenTarget",
                        targetPlayerIndex: playerIndex,
                      })
                    }
                  />
                  {pendingDaifugoEffect.selectedTargetPlayerIndex !==
                    undefined && (
                    <span className="hint">
                      {
                        state.players[
                          pendingDaifugoEffect.selectedTargetPlayerIndex
                        ].name
                      }
                      とカード交換します。
                    </span>
                  )}
                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      pendingDaifugoEffect.selectedTargetPlayerIndex ===
                        undefined ||
                      isAnimating ||
                      cpuActionInProgress
                    }
                    onClick={() =>
                      dispatch({ type: "confirmEnhancedSevenTarget" })
                    }
                  >
                    この相手と交換
                  </button>
                </div>
              )}
            {isSevenExchange && (
              <div className="daifugo-effect-panel seven-exchange-panel">
                {canActOnSevenExchangeSelection ? (
                  <>
                    <strong>
                      カードをクリックして選択、もう一度クリックするかボタンで確定します。
                    </strong>
                    <button
                      type="button"
                      className="primary-button"
                      data-testid="seven-exchange-confirm-button"
                      disabled={
                        !selectedDiscardId || isAnimating || cpuActionInProgress
                      }
                      onClick={handleSevenExchangeConfirm}
                    >
                      このカードを渡す
                    </button>
                  </>
                ) : viewerIsSevenExchangeParticipant &&
                  viewerHasSelectedSevenExchangeCard ? (
                  <strong>
                    あなたの選択は完了しました。相手の選択を待っています。
                  </strong>
                ) : null}
              </div>
            )}
            {isQueenSelect &&
              isViewerRequiredActionPlayer &&
              !state.players[pendingDaifugoEffect.playerIndex]?.isCpu && (
                <div className="daifugo-effect-panel queen-effect-panel">
                  <strong>Qの効果：消す数字を選んでください。</strong>
                  <div className="rank-choice-grid">
                    {queenRankChoices.map((option) => (
                      <button
                        type="button"
                        className="rank-choice-button"
                        data-testid={`queen-rank-${option.rank}`}
                        key={option.rank}
                        disabled={
                          isAnimating ||
                          cpuActionInProgress ||
                          !option.selectable
                        }
                        title={option.disabledReason}
                        onClick={() =>
                          dispatch({
                            type: "selectQueenVanishRank",
                            rank: option.rank,
                          })
                        }
                      >
                        {formatRankLabel(option.rank)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            {isJackSelect &&
              isViewerRequiredActionPlayer &&
              !state.players[pendingDaifugoEffect.playerIndex]?.isCpu && (
                <div className="daifugo-effect-panel jack-effect-panel">
                  <strong>J特殊効果を選択してください</strong>
                  <div className="jack-effect-choice-list">
                    <button
                      type="button"
                      className="jack-effect-choice"
                      data-testid="jack-effect-inspect"
                      disabled={isAnimating || cpuActionInProgress}
                      onClick={() =>
                        dispatch({
                          type: "selectJackSpecialEffect",
                          effect: "inspectHands",
                        })
                      }
                    >
                      <span>情報閲覧</span>
                      <small>各対戦相手の手札を1枚ずつ確認します</small>
                    </button>
                    <button
                      type="button"
                      className="jack-effect-choice"
                      data-testid="jack-effect-shield"
                      disabled={isAnimating || cpuActionInProgress}
                      onClick={() =>
                        dispatch({
                          type: "selectJackSpecialEffect",
                          effect: "jShield",
                        })
                      }
                    >
                      <span>Jシールド</span>
                      <small>選んだ数字の現在の手札だけを1回守ります</small>
                    </button>
                    <button
                      type="button"
                      className="jack-effect-choice"
                      data-testid="jack-effect-enhance"
                      disabled={
                        isAnimating ||
                        cpuActionInProgress ||
                        Boolean(currentPlayer.hasJEnhancementRight)
                      }
                      onClick={() =>
                        dispatch({
                          type: "selectJackSpecialEffect",
                          effect: "enhanceFiveOrSeven",
                        })
                      }
                    >
                      <span>5/7強化権</span>
                      <small>
                        {currentPlayer.hasJEnhancementRight
                          ? "すでに強化権を保持しています"
                          : "後の自分の手番で、5または7の効果を強化できます"}
                      </small>
                    </button>
                  </div>
                </div>
              )}
            {isJackShieldSelect &&
              isViewerRequiredActionPlayer &&
              !state.players[pendingDaifugoEffect.playerIndex]?.isCpu && (
                <div className="daifugo-effect-panel jack-shield-panel">
                  <strong>Jシールドで守る役を選んでください</strong>
                  <span className="hint">
                    発動時点で完成している同数字役または階段役のカードだけを保護します。
                  </span>
                  <div className="rank-choice-grid">
                    {pendingDaifugoEffect.selectableRanks.map((rank) => (
                      <button
                        type="button"
                        className="rank-choice-button"
                        data-testid={`jack-shield-rank-${rank}`}
                        key={rank}
                        disabled={isAnimating || cpuActionInProgress}
                        onClick={() =>
                          dispatch({ type: "selectJackShieldRank", rank })
                        }
                      >
                        {formatRankLabel(rank)}
                      </button>
                    ))}
                    {(pendingDaifugoEffect.selectableRuns ?? []).map((run) => (
                      <button
                        type="button"
                        className="rank-choice-button"
                        key={run.key}
                        disabled={isAnimating || cpuActionInProgress}
                        onClick={() =>
                          dispatch({
                            type: "selectJackShieldRun",
                            key: run.key,
                          })
                        }
                      >
                        {run.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            {isJackInspect &&
              isViewerRequiredActionPlayer &&
              !state.players[pendingDaifugoEffect.playerIndex]?.isCpu &&
              (() => {
                const targetPlayerIndex =
                  pendingDaifugoEffect.targetPlayerIndexes[
                    pendingDaifugoEffect.currentTargetOffset
                  ];
                const targetPlayer =
                  targetPlayerIndex !== undefined
                    ? state.players[targetPlayerIndex]
                    : null;
                const revealedCardId =
                  targetPlayerIndex !== undefined
                    ? pendingDaifugoEffect.revealedCardIds[targetPlayerIndex]
                    : undefined;
                const revealedCard =
                  targetPlayer?.hand.find(
                    (card) => card.id === revealedCardId,
                  ) ?? null;
                if (!targetPlayer || targetPlayerIndex === undefined)
                  return null;
                return (
                  <div className="daifugo-effect-panel jack-inspect-panel">
                    <strong>
                      {targetPlayer.name}
                      の手札から確認するカードを1枚選んでください
                    </strong>
                    <span className="hint">
                      {pendingDaifugoEffect.currentTargetOffset + 1} /{" "}
                      {pendingDaifugoEffect.targetPlayerIndexes.length}
                    </span>
                    <div className="jack-inspect-card-grid">
                      {getJackInspectDisplayCards(
                        targetPlayer.hand,
                        pendingDaifugoEffect.playerIndex,
                        targetPlayerIndex,
                      ).map((card) => {
                        const isRevealed = card.id === revealedCardId;
                        return (
                          <button
                            type="button"
                            className={`jack-inspect-card-button ${isRevealed ? "revealed" : ""}`}
                            data-testid="jack-inspect-card"
                            key={card.id}
                            data-card-id={card.id}
                            disabled={
                              Boolean(revealedCardId) ||
                              isAnimating ||
                              cpuActionInProgress
                            }
                            aria-label={`${targetPlayer.name}の手札カード`}
                            onClick={() =>
                              dispatch({
                                type: "inspectJackCard",
                                targetPlayerIndex,
                                cardId: card.id,
                              })
                            }
                          >
                            <PlayingCard
                              card={isRevealed ? card : null}
                              isBack={!isRevealed}
                            />
                          </button>
                        );
                      })}
                    </div>
                    {revealedCard && (
                      <p className="jack-inspect-revealed">
                        確認したカード: {formatCard(revealedCard)}
                      </p>
                    )}
                    <button
                      type="button"
                      className="primary-button"
                      data-testid="jack-inspect-confirm"
                      disabled={
                        !revealedCard || isAnimating || cpuActionInProgress
                      }
                      onClick={() =>
                        dispatch({ type: "confirmJackInspectCard" })
                      }
                    >
                      確認しました
                    </button>
                  </div>
                );
              })()}
            {/* //下部ナビ:リーチ継続確認 //
            7交換/Q効果などで手札構成が変わったリーチ者だけに出す。 //
            上部ナビは「手札構成が変化しました」だけ、 //
            下部ナビは「リーチ状態を継続しますか？」だけに分離する。 */}
            {isReachContinueConfirm &&
              isViewerRequiredActionPlayer &&
              !state.players[pendingDaifugoEffect.playerIndex]?.isCpu && (
                <div className="daifugo-effect-panel reach-continue-panel">
                  <strong>リーチ状態を継続しますか？</strong>
                  <div className="daifugo-effect-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={isAnimating || cpuActionInProgress}
                      onClick={() =>
                        dispatch({
                          type: "answerReachContinue",
                          keepReach: true,
                        })
                      }
                    >
                      リーチを継続する
                    </button>
                    <button
                      type="button"
                      disabled={isAnimating || cpuActionInProgress}
                      onClick={() =>
                        dispatch({
                          type: "answerReachContinue",
                          keepReach: false,
                        })
                      }
                    >
                      通常状態に戻る
                    </button>
                  </div>
                </div>
              )}
            {state.phase === "draw" &&
              !pendingDaifugoEffect &&
              canUseOnlineDraw && (
                <>
                  <button
                    type="button"
                    className="primary-button"
                    data-testid="draw-from-deck-button"
                    disabled={deckCount === 0 || controlsDisabled}
                    onClick={handleDrawFromDeck}
                  >
                    山札から引く
                  </button>
                  {discardSources.map((ownerIndex) => {
                    const callOptions = getCallOptionsForSource(
                      state,
                      ownerIndex,
                    );
                    const sourceDiscard =
                      state.players[ownerIndex].discardPile.at(-1) ?? null;
                    return (
                      <div className="discard-source" key={ownerIndex}>
                        <strong>
                          {state.players[ownerIndex].name}の捨て札
                        </strong>
                        {callOptions.map((meld, optionIndex) => (
                          <button
                            type="button"
                            key={meld.map((card) => card.id).join("-")}
                            data-testid="call-button"
                            disabled={controlsDisabled}
                            onClick={() =>
                              dispatch({
                                type: "takeDiscard",
                                ownerIndex,
                                meld,
                              })
                            }
                          >
                            {sourceDiscard &&
                            isWinningCall(
                              currentPlayer.hand,
                              currentPlayer.openMelds,
                              meld,
                              sourceDiscard,
                            )
                              ? "ロン"
                              : "鳴く"}{" "}
                            {optionIndex + 1}: {meld.map(formatCard).join(" ")}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            {state.phase === "discard" &&
              !pendingDaifugoEffect &&
              canUseOnlineDiscard && (
                <>
                  {canReachAfterDraw && (
                    <button
                      type="button"
                      className="primary-button"
                      data-testid="reach-button"
                      disabled={controlsDisabled}
                      onClick={handleDeclareReach}
                    >
                      リーチ
                    </button>
                  )}
                  {currentPlayer.isReach &&
                    !state.declaredReachThisTurn &&
                    selfWinOptions.length === 0 && (
                      <button
                        type="button"
                        className="primary-button"
                        data-testid="discard-drawn-only-button"
                        disabled={controlsDisabled}
                        onClick={handleDiscardDrawnOnly}
                      >
                        引いたカードをそのまま捨てる
                      </button>
                    )}
                  {currentPlayer.isReach &&
                    !state.declaredReachThisTurn &&
                    selfWinOptions.length > 0 && (
                      <div className="reach-win-options">
                        <strong>上がるために捨てるカード</strong>
                        {selfWinOptions.map((option) => (
                          <button
                            type="button"
                            className="primary-button"
                            data-testid="tsumo-button"
                            key={option.discardCard.id}
                            disabled={controlsDisabled}
                            onClick={() =>
                              handleWinWithDiscard(option.discardCard)
                            }
                          >
                            上がる: {formatCard(option.discardCard)}を捨てる
                          </button>
                        ))}
                      </div>
                    )}
                  {!currentPlayer.isReach && selfWinOptions.length > 0 && (
                    <div className="reach-win-options">
                      <strong>ツモ候補</strong>
                      {selfWinOptions.map((option) => (
                        <button
                          type="button"
                          className="primary-button"
                          data-testid="tsumo-button"
                          key={option.discardCard.id}
                          disabled={controlsDisabled}
                          onClick={() =>
                            handleWinWithDiscard(option.discardCard)
                          }
                        >
                          ツモ: {formatCard(option.discardCard)}を捨てる
                        </button>
                      ))}
                    </div>
                  )}
                  {canChooseDiscard && (
                    <>
                      <p className="hint">手札のカードを選んでから捨てます。</p>
                      <button
                        type="button"
                        className="primary-button"
                        data-testid="discard-button"
                        disabled={!selectedDiscardId || controlsDisabled}
                        onClick={handleDiscardSelected}
                      >
                        捨てる
                      </button>
                    </>
                  )}
                </>
              )}
            {state.phase === "reachConfirm" && !pendingDaifugoEffect && (
              <div className="reach-win-options">
                <strong>リーチを宣言しますか？</strong>
                <button
                  type="button"
                  className="primary-button"
                  disabled={controlsDisabled}
                  onClick={() => handleReachConfirmAnswer(true)}
                >
                  はい
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={controlsDisabled}
                  onClick={() => handleReachConfirmAnswer(false)}
                >
                  いいえ
                </button>
              </div>
            )}
          </section>
        )}

        {handPlayer && (
          <section className="hand-section">
            <HandView
              key={handPlayer.id}
              cards={displayedHandCards}
              drawnCardId={handDrawnCardId}
              selectedCardId={selectedDiscardId}
              discardingCardId={discardingCardId}
              selectableCardIds={
                canActOnSevenExchangeSelection
                  ? sevenSelectionCandidateIds
                  : null
              }
              disabledCardIds={handShieldedCardIds}
              disabled={
                isSevenHandSelection
                  ? !canActOnSevenExchangeSelection ||
                    isAnimating ||
                    cpuActionInProgress
                  : handPlayerIndex !== state.currentPlayerIndex ||
                    state.phase !== "discard" ||
                    (!isDaifugoExtraDiscard && !canChooseDiscard) ||
                    mustDiscardDrawnForReachDaifugo ||
                    (isDaifugoExtraDiscard
                      ? isAnimating || isCpuTurn || cpuActionInProgress
                      : controlsDisabled)
              }
              onCardClick={handleHandCardClick}
            />
          </section>
        )}
      </section>
    </main>
  );
}

interface PlayerHistoryPopoverProps {
  player: GameState["players"][number];
  showMelds: boolean;
}

function summarizeQueenForcedDiscard(
  results: NonNullable<GameState["daifugoEffectEvent"]>["queenDiscardResults"],
  state: GameState,
  rank: string,
): string {
  const names =
    results
      ?.filter((result) => result.discardedCards.length > 0)
      .map((result) => state.players[result.playerIndex]?.name)
      .filter((name): name is string => Boolean(name)) ?? [];

  if (names.length === 0) {
    return `${rank}を持つプレイヤーはいませんでした。`;
  }

  return `${joinJapaneseNames(names)}が${rank}を捨てることになります。`;
}

function summarizeQueenRefillDraw(
  results: NonNullable<GameState["daifugoEffectEvent"]>["queenDiscardResults"],
  state: GameState,
): string {
  const drawParts =
    results
      ?.filter((result) => result.drawnCards.length > 0)
      .map((result) => {
        const playerName =
          state.players[result.playerIndex]?.name ?? "プレイヤー";
        return `${playerName}が${result.drawnCards.length}枚`;
      }) ?? [];

  if (drawParts.length === 0) {
    return "補充ドローはありません。";
  }

  return `${drawParts.join("、")}、山札から引きます。`;
}
// 効果アニメーション中の上部ナビ文言・中央演出を作る
// 7交換、Qボンバーなど、中央カード演出と演出中の上部ナビ message を作る。
// toolbar-action では、この message が getActionText より優先される。
function buildDaifugoAnimationSteps(
  event: NonNullable<GameState["daifugoEffectEvent"]>,
  state: GameState,
): DaifugoAnimationStep[] {
  const actor = state.players[event.actorIndex];

  if (event.kind === "sevenExchange") {
    const target =
      event.targetPlayerIndex !== undefined
        ? state.players[event.targetPlayerIndex]
        : null;
    const visibleExchanges = (event.exchangedCards ?? []).filter(
      ({ playerIndex, receivedCard }) =>
        receivedCard.rank > 0 && !state.players[playerIndex]?.isCpu,
    );
    return [
      {
        id: `${event.id}-receive`,
        title: "7 カード交換",
        message: `${actor?.name ?? "プレイヤー"}と${target?.name ?? "相手"}がカードを交換しました`,
        stageMessage: visibleExchanges.some(
          ({ playerIndex }) => !state.players[playerIndex]?.isCpu,
        )
          ? "カードを受け取りました"
          : undefined,
        cards: visibleExchanges.map(({ receivedCard }) => receivedCard),
        side: "center",
        variant: "exchange",
      },
    ];
    return (event.exchangedCards ?? [])
      .filter(
        ({ playerIndex, receivedCard }) =>
          receivedCard.rank > 0 &&
          (!state.players[playerIndex]?.isCpu || state.showCpuActions),
      )
      .map(({ playerIndex, receivedCard }) => {
        const player = state.players[playerIndex];
        const exchangeLine =
          playerIndex === event.actorIndex
            ? `${actor?.name ?? "プレイヤー"}が${target?.name ?? "相手"}とカードを交換しました`
            : `${actor?.name ?? "プレイヤー"}とカードを交換しました`;
        return {
          id: `${event.id}-receive-${playerIndex}`,
          title: "7 カード交換",
          message: `${exchangeLine} / ${formatCard(receivedCard)} を受け取りました`,
          stageMessage: player?.isCpu ? undefined : "カードを受け取りました",
          cards: [receivedCard],
          side: player?.isCpu ? "cpu" : "center",
          variant: "exchange",
        };
      });
  }

  const rank = event.rank ? formatRankLabel(event.rank) : "?";
  const results = event.queenDiscardResults ?? [];
  const viewerIndex = state.viewerPlayerId
    ? state.players.findIndex((player) => player.id === state.viewerPlayerId)
    : -1;
  const visibleResults =
    viewerIndex >= 0
      ? results.filter((result) => result.playerIndex === viewerIndex)
      : results;
  // カード表示だけは viewer ごとに制限する
  const visibleDiscardCards = visibleResults.flatMap((result) => {
    const player = state.players[result.playerIndex];
    return player?.isCpu ? [] : result.discardedCards;
  });
  const visibleDrawCards = visibleResults.flatMap((result) => {
    const player = state.players[result.playerIndex];
    return player?.isCpu ? [] : result.drawnCards;
  });
  // step の有無と上部ナビ文言は全体結果で決める
  const hasQueenDiscards = results.some(
    (result) => result.discardedCards.length > 0,
  );
  const hasQueenDraws = results.some(
    (result) => result.discardedCards.length > 0,
  );
  const discardMessage =
    summarizeQueenResults(results, state, rank, "discard") ||
    `${rank}を持つプレイヤーはいませんでした。`;
  const drawMessage =
    summarizeQueenResults(results, state, rank, "draw") ||
    "補充ドローはありません。";
  const steps: DaifugoAnimationStep[] = [
    {
      id: `${event.id}-notice`,
      title: "Q 効果",
      message: discardMessage,
      cards: [],
      side: "center",
      variant: "notice",
    },
  ];
  if (hasQueenDiscards) {
    steps.push(
      {
        id: `${event.id}-discard`,
        title: `Q 効果: ${rank}`,
        message: discardMessage,
        stageMessage:
          visibleDiscardCards.length > 0 ? `${rank}を捨てます` : undefined,
        cards: visibleDiscardCards,
        side: "center",
        variant: "discard",
      },
      {
        id: `${event.id}-settle`,
        title: `Q 効果: ${rank}`,
        message: discardMessage,
        cards: [],
        side: "center",
        variant: "settle",
      },
    );
  }
  if (hasQueenDraws) {
    steps.push({
      id: `${event.id}-draw`,
      title: "山札から引きました",
      message: drawMessage,
      stageMessage:
        visibleDrawCards.length > 0
          ? "山札から新しいカードを引きました"
          : undefined,
      cards: visibleDrawCards,
      side: "center",
      variant: "draw",
    });
  }
  return steps;
}

function joinJapaneseNames(names: string[]): string {
  return names.join("と");
}

function summarizeQueenResults(
  results: NonNullable<
    NonNullable<GameState["daifugoEffectEvent"]>["queenDiscardResults"]
  >,
  state: GameState,
  rank: string,
  kind: "discard" | "draw",
) {
  if (kind === "discard") {
    const names = results
      .filter((result) => result.discardedCards.length > 0)
      .map((result) => state.players[result.playerIndex]?.name)
      .filter((name): name is string => Boolean(name));

    if (names.length === 0) return "";
    return `${joinJapaneseNames(names)}が${rank}を捨てることになります。`;
  }
  const drawParts = results
    .filter((result) => result.discardedCards.length > 0)
    .map((result) => {
      const playerName =
        state.players[result.playerIndex]?.name ?? "プレイヤー";
      return `${playerName}が${result.discardedCards.length}枚`;
    });
  if (drawParts.length === 0) return "";
  return `${drawParts.join("、")}、山札から引きます。`;
}

function getDaifugoIncomingCardIdsForPlayer(
  event: NonNullable<GameState["daifugoEffectEvent"]>,
  playerIndex: number,
) {
  const ids = new Set<string>();
  if (event.kind === "sevenExchange") {
    for (const exchange of event.exchangedCards ?? []) {
      if (exchange.playerIndex === playerIndex) {
        ids.add(exchange.receivedCard.id);
      }
    }
    return ids;
  }

  for (const result of event.queenDiscardResults ?? []) {
    if (result.playerIndex === playerIndex) {
      for (const card of result.drawnCards) {
        ids.add(card.id);
      }
    }
  }
  return ids;
}

function getHiddenQueenDiscardIdsByPlayer(
  event: NonNullable<GameState["daifugoEffectEvent"]>,
  step: DaifugoAnimationStep | null,
) {
  const hiddenIds = new Map<number, Set<string>>();
  if (
    event.kind !== "queenNumberVanish" ||
    !step ||
    (step.variant !== "notice" && step.variant !== "discard")
  ) {
    return hiddenIds;
  }

  for (const result of event.queenDiscardResults ?? []) {
    hiddenIds.set(
      result.playerIndex,
      new Set(result.discardedCards.map((card) => card.id)),
    );
  }
  return hiddenIds;
}

function getVisibleDiscardPile(cards: Card[], hiddenIds?: Set<string>) {
  if (!hiddenIds || hiddenIds.size === 0) return cards;
  return cards.filter((card) => !hiddenIds.has(card.id));
}

function getDaifugoStepDuration(step: DaifugoAnimationStep) {
  if (step.variant === "notice") return 650;
  if (step.variant === "discard") {
    return step.title.startsWith("Q 効果")
      ? 1750
      : step.cards.length > 0
        ? 1750
        : 650;
  }
  if (step.variant === "settle") return 360;
  if (step.variant === "draw" || step.variant === "exchange")
    return step.phase === "insert" ? 650 : 1550;
  return step.cards.length > 0 ? 650 : 650;
}

function getDaifugoAnimationTotalDuration(steps: DaifugoAnimationStep[]) {
  return steps.reduce((total, step) => {
    if (step.variant === "draw" || step.variant === "exchange") {
      return (
        total +
        getDaifugoStepDuration({ ...step, phase: "reveal" }) +
        getDaifugoStepDuration({ ...step, phase: "insert" })
      );
    }
    return total + getDaifugoStepDuration(step);
  }, 0);
}

function buildDaifugoAnimationStepsOld(
  event: NonNullable<GameState["daifugoEffectEvent"]>,
  state: GameState,
): DaifugoAnimationStep[] {
  const actor = state.players[event.actorIndex];

  if (event.kind === "sevenExchange") {
    const target =
      event.targetPlayerIndex !== undefined
        ? state.players[event.targetPlayerIndex]
        : null;
    return (event.exchangedCards ?? [])
      .filter(
        ({ playerIndex }) =>
          !state.players[playerIndex]?.isCpu || state.showCpuActions,
      )
      .map(({ playerIndex, receivedCard }) => {
        const player = state.players[playerIndex];
        const exchangeLine =
          playerIndex === event.actorIndex
            ? `${actor?.name ?? "プレイヤー"}が${target?.name ?? "相手"}とカードを交換しました`
            : `${actor?.name ?? "プレイヤー"}とカードを交換しました`;
        return {
          id: `${event.id}-receive-${playerIndex}`,
          title: "7 カード交換",
          message: `${exchangeLine} / ${formatCard(receivedCard)} を受け取りました`,
          cards: [receivedCard],
          side: player?.isCpu ? "cpu" : "center",
          variant: "exchange",
        };
      });
  }

  const rank = event.rank ? formatRankLabel(event.rank) : "?";
  const discardSteps: DaifugoAnimationStep[] = [];
  const drawSteps: DaifugoAnimationStep[] = [];
  for (const result of event.queenDiscardResults ?? []) {
    const player = state.players[result.playerIndex];
    if (player?.isCpu && !state.showCpuActions) {
      continue;
    }
    const discardCount = result.discardedCards.length;
    discardSteps.push({
      id: `${event.id}-discard-${result.playerIndex}`,
      title: `Q 効果: ${rank}`,
      message:
        result.playerIndex === event.actorIndex
          ? `Q効果により、${rank}を${discardCount}枚捨てます`
          : player?.isCpu
            ? `${player.name}が${rank}を${discardCount}枚捨てました`
            : "Q効果により、あなたの${rank}が${discardCount}枚捨てさせられます",
      cards: result.discardedCards,
      side: player?.isCpu ? "cpu" : "center",
      variant: "discard",
    });
    if (result.drawnCards.length > 0) {
      const drawCount = result.drawnCards.length;
      drawSteps.push({
        id: `${event.id}-draw-${result.playerIndex}`,
        title: "山札から引きました",
        message: player?.isCpu
          ? `${player.name}が山札から${drawCount}枚引きました`
          : `山札から${drawCount}枚引きました`,
        cards: result.drawnCards,
        side: player?.isCpu ? "cpu" : "center",
        variant: "draw",
      });
    }
  }
  return [...discardSteps, ...drawSteps];
}

function buildDaifugoAnimationStepsLegacy(
  event: NonNullable<GameState["daifugoEffectEvent"]>,
  state: GameState,
): DaifugoAnimationStep[] {
  if (event.kind === "sevenExchange") {
    return (event.exchangedCards ?? [])
      .filter(
        ({ playerIndex }) =>
          !state.players[playerIndex]?.isCpu || state.showCpuActions,
      )
      .map(({ playerIndex, receivedCard }) => {
        const player = state.players[playerIndex];
        return {
          id: `${event.id}-receive-${playerIndex}`,
          title: "7 カード交換",
          message: `${player?.name ?? "プレイヤー"}がカードを受け取りました`,
          cards: [receivedCard],
          side: player?.isCpu ? "cpu" : "center",
          variant: "exchange",
        };
      });
  }

  const rank = event.rank ? formatRankLabel(event.rank) : "?";
  const discardSteps: DaifugoAnimationStep[] = [];
  const drawSteps: DaifugoAnimationStep[] = [];
  for (const result of event.queenDiscardResults ?? []) {
    const player = state.players[result.playerIndex];
    if (player?.isCpu && !state.showCpuActions) {
      continue;
    }
    discardSteps.push({
      id: `${event.id}-discard-${result.playerIndex}`,
      title: `Q 効果: ${rank}`,
      message: `${player?.name ?? "プレイヤー"}が${rank}を${result.discardedCards.length}枚捨てました`,
      cards: result.discardedCards,
      side: player?.isCpu ? "cpu" : "center",
      variant: "discard",
    });
    if (result.drawnCards.length > 0) {
      drawSteps.push({
        id: `${event.id}-draw-${result.playerIndex}`,
        title: "山札から引きました",
        message: `${player?.name ?? "プレイヤー"}が山札から${result.drawnCards.length}枚引きました`,
        cards: result.drawnCards,
        side: player?.isCpu ? "cpu" : "center",
        variant: "draw",
      });
    }
  }
  return [...discardSteps, ...drawSteps];
}

function DaifugoAnimationStage({ step }: { step: DaifugoAnimationStep }) {
  const stageClass =
    step.variant === "discard"
      ? "q-bomb-discard-preview"
      : step.phase === "insert"
        ? "movingDrawnCardToHand"
        : "revealingDrawnCard";

  return (
    <div className={`card-animation daifugo-animation-stage ${stageClass}`}>
      <strong>{step.title}</strong>
      {step.stageMessage && (
        <span className="card-animation-label daifugo-stage-label">
          {step.stageMessage}
        </span>
      )}
      {step.cards.length === 1 ? (
        <PlayingCard card={step.cards[0]} />
      ) : step.cards.length > 0 ? (
        <div className="daifugo-animation-cards">
          {step.cards.map((card) => (
            <PlayingCard card={card} key={card.id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RoomManagementDialog({
  activeTab,
  isHost,
  transferTargets,
  room,
  onlinePlayerId,
  state,
  matchState,
  onSelectTab,
  onClose,
  onExit,
  onTransferHost,
  onStartTemporaryLeave,
  onUpdateMatchSettings,
  onUpdateSubstituteCpuModel,
}: {
  activeTab: RoomManagementTab;
  isHost: boolean;
  transferTargets: OnlineRoomSnapshot["players"];
  room?: OnlineRoomSnapshot;
  onlinePlayerId?: string;
  state: GameState;
  matchState?: MatchState;
  onSelectTab: (tab: RoomManagementTab) => void;
  onClose: () => void;
  onExit: () => void;
  onTransferHost: (targetPlayerId: string) => void;
  onStartTemporaryLeave: (mode: TemporaryLeaveMode) => void;
  onUpdateMatchSettings?: (payload: UpdateMatchSettingsPayload) => void;
  onUpdateSubstituteCpuModel?: (cpuModelId: CpuModelId) => void;
}) {
  const [editingSetting, setEditingSetting] = useState<
    "rounds" | "targetScore" | null
  >(null);
  const [settingValue, setSettingValue] = useState("");
  const [settingError, setSettingError] = useState<string | null>(null);
  const tabs: Array<{
    id: RoomManagementTab;
    label: string;
    hostOnly?: boolean;
  }> = [
    { id: "exit", label: "退出" },
    { id: "temporaryLeave", label: "一時離脱" },
    { id: "transferHost", label: "ホストを変更", hostOnly: true },
    { id: "matchInfo", label: "試合情報" },
  ];
  const visibleTabs = tabs.filter((tab) => !tab.hostOnly || isHost);
  const selectedTab = visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "exit";
  const matchGameState = matchState?.gameState ?? state;
  const matchMode = matchState?.matchMode ?? "rounds";
  const currentRoundNumber = matchState?.currentRound ?? 1;
  const currentHighestScore = getCurrentHighestMatchScore(matchState);
  const matchTypeLabel = getMatchModeLabel(matchMode);
  const matchDetail = getMatchDetailText(matchState);
  const canEditRounds =
    isHost &&
    matchState?.matchMode === "rounds" &&
    Boolean(onUpdateMatchSettings);
  const canEditTargetScore =
    isHost &&
    matchState?.matchMode === "targetScore" &&
    Boolean(onUpdateMatchSettings);
  const substituteCpuModelId =
    room?.substituteCpuModels?.find((item) => item.playerId === onlinePlayerId)
      ?.cpuModelId ?? "standard";

  function startEditingSetting(kind: "rounds" | "targetScore") {
    setEditingSetting(kind);
    setSettingError(null);
    setSettingValue(
      kind === "rounds"
        ? String(matchState?.totalRounds ?? "")
        : String(matchState?.targetScore ?? ""),
    );
  }

  function submitSettingChange() {
    if (!matchState || !editingSetting || !onUpdateMatchSettings) return;
    const nextValue = Number(settingValue);
    if (!Number.isInteger(nextValue) || nextValue <= 0) {
      setSettingError("有効な数値を入力してください。");
      return;
    }
    if (editingSetting === "rounds") {
      if (nextValue <= currentRoundNumber) {
        setSettingError("現在の局数以下には変更できません。");
        return;
      }
      if (nextValue > MAX_ROUND_COUNT) {
        setSettingError("最大局数は100局までです。");
        return;
      }
      onUpdateMatchSettings({ matchType: "rounds", roundCount: nextValue });
    } else {
      if (nextValue < MIN_TARGET_SCORE || nextValue > MAX_TARGET_SCORE) {
        setSettingError("目標点は50〜10000の範囲で入力してください。");
        return;
      }
      if (nextValue <= currentHighestScore) {
        setSettingError("現在の最高得点以下には変更できません。");
        return;
      }
      onUpdateMatchSettings({
        matchType: "targetScore",
        targetScore: nextValue,
      });
    }
    setEditingSetting(null);
    setSettingValue("");
    setSettingError(null);
  }

  return (
    <div
      className="exit-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-management-title"
    >
      <div className="exit-confirm-dialog room-management-dialog">
        <h2 id="room-management-title">設定</h2>
        <div className="room-management-panel">
          <div
            className="room-management-tabs"
            role="tablist"
            aria-label="設定メニュー"
          >
            {visibleTabs.map((tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={selectedTab === tab.id}
                className={selectedTab === tab.id ? "selected" : ""}
                onClick={() => onSelectTab(tab.id)}
                key={tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="room-management-content">
            {selectedTab === "exit" && (
              <>
                <p>現在の試合から退出しますか？</p>
                <div className="exit-confirm-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={onExit}
                  >
                    退出
                  </button>
                  <button type="button" onClick={onClose}>
                    キャンセル
                  </button>
                </div>
              </>
            )}

            {selectedTab === "temporaryLeave" && (
              <>
                <p>一時離脱しますか？</p>
                <div className="temporary-leave-options">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => onStartTemporaryLeave("pause")}
                  >
                    中断する
                  </button>
                  <p>
                    あなたの手番で試合を停止します。15分以内に戻らない場合、CPUに置き換わります。
                  </p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => onStartTemporaryLeave("cpuSubstitute")}
                  >
                    CPUに代行させる
                  </button>
                  <p>
                    離脱中はCPUがあなたの代わりに手番を進めます。15分以内に戻らない場合、正式にCPUへ置き換わります。
                  </p>
                </div>
                <div className="exit-confirm-actions">
                  <button type="button" onClick={onClose}>
                    閉じる
                  </button>
                </div>
              </>
            )}

            {selectedTab === "transferHost" && (
              <>
                <p>ホストを変更するプレイヤーを選択してください。</p>
                {transferTargets.length > 0 ? (
                  <div className="host-transfer-list">
                    {transferTargets.map((player) => (
                      <button
                        type="button"
                        onClick={() => onTransferHost(player.playerId)}
                        key={player.playerId}
                      >
                        {player.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>ホストを変更できるプレイヤーがいません。</p>
                )}
                <div className="exit-confirm-actions">
                  <button type="button" onClick={onClose}>
                    閉じる
                  </button>
                </div>
              </>
            )}

            {selectedTab === "matchInfo" && (
              <>
                <div className="match-info-list">
                  <div className="match-info-row">
                    <span>ルーム名</span>
                    <strong>
                      {matchState?.roomName ?? room?.roomId ?? "ルーム"}
                    </strong>
                  </div>
                  <div className="match-info-row match-info-row--players">
                    <span>プレイヤー</span>
                    <div className="match-info-players">
                      {matchGameState.players.map((player, index) => (
                        <div className="match-info-player" key={player.id}>
                          <em>
                            {!player.isCpu && player.id === room?.hostPlayerId
                              ? "HOST"
                              : ""}
                          </em>
                          <strong>
                            Player{index + 1}:{" "}
                            {formatMatchInfoPlayerName(player)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="match-info-row">
                    <span>人数</span>
                    <strong>{matchGameState.players.length}人</strong>
                  </div>
                  <div className="match-info-row">
                    <span>試合形式</span>
                    <strong>{matchTypeLabel}</strong>
                  </div>
                  <div className="match-info-row">
                    <span>試合形式の詳細</span>
                    <strong>{matchDetail}</strong>
                    {canEditRounds && (
                      <button
                        type="button"
                        className="match-info-change-button"
                        onClick={() => startEditingSetting("rounds")}
                      >
                        変更
                      </button>
                    )}
                    {canEditTargetScore && (
                      <button
                        type="button"
                        className="match-info-change-button"
                        onClick={() => startEditingSetting("targetScore")}
                      >
                        変更
                      </button>
                    )}
                  </div>
                  <div className="match-info-row">
                    <span>現在の局</span>
                    <strong>{currentRoundNumber}局目</strong>
                  </div>
                  {onlinePlayerId && onUpdateSubstituteCpuModel && (
                    <div className="match-info-row">
                      <span>代行CPUモデル</span>
                      <strong>
                        {getCpuModelDisplayName(substituteCpuModelId)}
                      </strong>
                      <select
                        aria-label="代行CPUモデル"
                        value={substituteCpuModelId}
                        onChange={(event) =>
                          onUpdateSubstituteCpuModel(
                            event.target.value as CpuModelId,
                          )
                        }
                      >
                        <option value="easy">junior-CPU</option>
                        <option value="standard">standard-CPU</option>
                        <option value="tactical">pro-CPU</option>
                        <option value="master">master-CPU</option>
                      </select>
                    </div>
                  )}
                </div>
                {editingSetting && (
                  <div className="match-setting-editor">
                    <label htmlFor="match-setting-value">
                      {editingSetting === "rounds" ? "最大局数" : "目標点"}
                    </label>
                    <input
                      id="match-setting-value"
                      type="number"
                      min="1"
                      max={
                        editingSetting === "rounds"
                          ? MAX_ROUND_COUNT
                          : MAX_TARGET_SCORE
                      }
                      step="1"
                      value={settingValue}
                      onChange={(event) => {
                        setSettingValue(event.target.value);
                        setSettingError(null);
                      }}
                    />
                    {settingError && (
                      <p className="match-setting-error">{settingError}</p>
                    )}
                    <div className="exit-confirm-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={submitSettingChange}
                      >
                        確定
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSetting(null);
                          setSettingError(null);
                        }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
                <div className="exit-confirm-actions">
                  <button type="button" onClick={onClose}>
                    閉じる
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getMatchModeLabel(matchMode: MatchState["matchMode"]) {
  if (matchMode === "targetScore") return "目標点制";
  if (matchMode === "startingPoints") return "持ち点制";
  return "局数制";
}

function getMatchDetailText(matchState?: MatchState) {
  if (!matchState) return "未設定";
  if (matchState.matchMode === "targetScore") {
    return `目標${matchState.targetScore}点`;
  }
  if (matchState.matchMode === "startingPoints") {
    return `初期持ち点${matchState.startingPoints}点`;
  }
  return `最大${matchState.totalRounds}局`;
}

function formatMatchInfoPlayerName(player: GameState["players"][number]) {
  const displayName = stripSeatPrefix(player.name);
  if (!player.isCpu) return displayName;
  const modelLabel = player.cpuModelId
    ? getCpuModelDisplayName(player.cpuModelId)
    : "CPU";
  return `${displayName} ${modelLabel}`;
}

function stripSeatPrefix(name: string) {
  return name.replace(/^Player\d+:\s*/, "");
}

function getCurrentHighestMatchScore(matchState?: MatchState) {
  if (!matchState || matchState.matchMode !== "targetScore") return 0;
  return Math.max(0, ...matchState.cumulativeScores);
}

function getTemporaryLeaveStatus(
  room: OnlineRoomSnapshot | undefined,
  playerId: string,
) {
  const leave = room?.temporaryLeaves?.find(
    (item) => item.playerId === playerId,
  );
  if (!leave) return null;
  if (leave.convertedToCpu) return "CPU置換済み";
  const remaining = formatRemainingLeaveTime(leave.expiresAt);
  if (leave.mode === "cpuSubstitute") return `CPU代行中 残り ${remaining}`;
  return `一時離脱中 / 試合停止中 残り ${remaining}`;
}

function formatRemainingLeaveTime(expiresAt: number) {
  const remainingMs = Math.max(0, expiresAt - Date.now());
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/*
function buildDaifugoAnimationSteps(event: NonNullable<GameState["daifugoEffectEvent"]>, state: GameState): DaifugoAnimationStep[] {
  if (event.kind === "sevenExchange") {
    return (event.exchangedCards ?? [])
      .filter(({ playerIndex }) => !state.players[playerIndex]?.isCpu || state.showCpuActions)
      .map(({ playerIndex, receivedCard }) => {
        const player = state.players[playerIndex];
        return {
          id: `${event.id}-receive-${playerIndex}`,
          title: "7 カード交換",
          message: `${player?.name ?? "プレイヤー"}がカードを受け取りました`,
          cards: [receivedCard],
          side: player?.isCpu ? "cpu" : "center",
          variant: "exchange",
        };
      });
  }

  const rank = event.rank ? formatRankLabel(event.rank) : "?";
  const discardSteps: DaifugoAnimationStep[] = [];
  const drawSteps: DaifugoAnimationStep[] = [];
  for (const result of event.queenDiscardResults ?? []) {
    const player = state.players[result.playerIndex];
    const showCards = !player?.isCpu || state.showCpuActions;
    discardSteps.push({
      id: `${event.id}-discard-${result.playerIndex}`,
      title: `Q 効果: ${rank}`,
      message: `${player?.name ?? "プレイヤー"}が${rank}を${result.discardedCards.length}枚捨てました`,
      cards: showCards ? result.discardedCards : [],
      side: player?.isCpu ? "cpu" : "center",
      variant: "discard",
    });
    if (result.drawnCards.length > 0) {
      drawSteps.push({
        id: `${event.id}-draw-${result.playerIndex}`,
        title: "補充ドロー",
        message: `${player?.name ?? "プレイヤー"}が山札から${result.drawnCards.length}枚引きました`,
        cards: showCards ? result.drawnCards : [],
        side: player?.isCpu ? "cpu" : "center",
        variant: "draw",
      });
    }
  }
  return [...discardSteps, ...drawSteps];
}

function DaifugoAnimationStage({ step }: { step: DaifugoAnimationStep }) {
  return (
    <div className={`daifugo-animation-stage ${step.variant}`}>
      <strong>{step.title}</strong>
      <p>{step.message}</p>
      {step.cards.length > 0 && (
        <div className="daifugo-animation-cards">
          {step.cards.map((card) => (
            <PlayingCard card={card} key={card.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function DaifugoEventSummary({ event, state }: { event: NonNullable<GameState["daifugoEffectEvent"]>; state: GameState }) {
  if (event.kind === "sevenExchange") {
    const actor = state.players[event.actorIndex];
    const target = event.targetPlayerIndex !== undefined ? state.players[event.targetPlayerIndex] : null;
    const visibleReceivedCards = event.exchangedCards?.filter(({ playerIndex }) => !state.players[playerIndex]?.isCpu || state.showCpuActions) ?? [];
    return (
      <div className="daifugo-event-card seven-event-card">
        <strong>7 カード交換</strong>
        <p>{actor?.name}と{target?.name}が同時にカードを渡しました。</p>
        {visibleReceivedCards.length > 0 && (
          <div className="effect-draw-stage received-card-list">
            {visibleReceivedCards.map(({ playerIndex, receivedCard }) => (
              <div className="effect-draw-card" key={`${playerIndex}-${receivedCard.id}`}>
                <span className="card-animation-label">{state.players[playerIndex]?.name}がカードを受け取りました</span>
                <PlayingCard card={receivedCard} />
              </div>
            ))}
          </div>
        )}
        {event.reachReleasedPlayerIndexes && event.reachReleasedPlayerIndexes.length > 0 && (
          <p className="daifugo-event-warning">{event.reachReleasedPlayerIndexes.map((index) => state.players[index]?.name).join("、")}のリーチが解除されました。</p>
        )}
      </div>
    );
  }

  const rank = event.rank ? formatRankLabel(event.rank) : "?";
  const audit = event.queenDeckAudit;
  return (
    <div className="daifugo-event-card queen-event-card">
      <strong>Q 効果: {rank}を指定</strong>
      <div className="queen-event-section queen-discard-section">
        <h3>強制破棄</h3>
        {event.queenDiscardResults && event.queenDiscardResults.length > 0 ? (
          event.queenDiscardResults.map((result) => {
            const player = state.players[result.playerIndex];
            const showCards = !player?.isCpu || state.showCpuActions;
            return (
              <div className="queen-event-row" key={result.playerIndex}>
                <span className="queen-event-label">{player?.name}が{rank}を{result.discardedCards.length}枚捨てさせられます</span>
                {showCards && (
                  <div className="daifugo-event-card-list forced-discard-list">
                    {result.discardedCards.map((card) => (
                      <PlayingCard card={card} compact key={card.id} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p>{rank}を持つプレイヤーはいませんでした。</p>
        )}
      </div>
      <div className="queen-event-section queen-draw-section">
        <h3>補充ドロー</h3>
        {event.queenDiscardResults?.map((result) => {
          const player = state.players[result.playerIndex];
          const showCards = !player?.isCpu || state.showCpuActions;
          return (
            <div className="queen-event-row" key={`draw-${result.playerIndex}`}>
              <span className="queen-event-label">{player?.name}が山札から{result.drawnCards.length}枚引きました</span>
              {showCards && result.drawnCards.length > 0 && (
                <div className="effect-draw-stage refill-draw-list">
                  {result.drawnCards.map((card) => (
                    <div className="effect-draw-card" key={card.id}>
                      <span className="card-animation-label">山札から引きました</span>
                      <PlayingCard card={card} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {audit && (
        <p className="queen-deck-audit">
          山札: {audit.beforeDeckCount} → {audit.afterDeckCount} / 内訳: 除外{audit.removedFromDeckCount}枚 + 補充ドロー{audit.refillDrawCount}枚
        </p>
      )}
      {event.reachReleasedPlayerIndexes && event.reachReleasedPlayerIndexes.length > 0 && (
        <p className="daifugo-event-warning">{event.reachReleasedPlayerIndexes.map((index) => state.players[index]?.name).join("、")}のリーチが解除されました。</p>
      )}
    </div>
  );
}

*/

function PlayerHistoryPopover({
  player,
  showMelds,
}: PlayerHistoryPopoverProps) {
  return (
    <section
      className={`player-history-popover ${showMelds ? "with-melds" : "discard-only"}`}
      role="tooltip"
    >
      <div className="history-column">
        <h3>過去の捨て札</h3>
        {player.discardPile.length === 0 ? (
          <p className="history-empty">まだ捨てていません</p>
        ) : (
          <div
            className="history-card-grid"
            aria-label={`${player.name}の過去の捨て札`}
          >
            {player.discardPile.map((card) => (
              <span
                className={
                  card.discardedByEffect === "queenNumberVanish"
                    ? "history-q-effect-card"
                    : ""
                }
                data-testid="public-discard-card"
                data-card-id={card.id}
                data-card-label={formatCard(card)}
                title={
                  card.discardedByEffect === "queenNumberVanish"
                    ? "Q効果で破棄"
                    : undefined
                }
                key={card.id}
              >
                <PlayingCard card={card} compact />
              </span>
            ))}
          </div>
        )}
      </div>

      {showMelds && (
        <div className="history-column history-meld-column">
          <h3>鳴いた役</h3>
          {player.openMelds.length === 0 ? (
            <p className="history-empty">まだ鳴いていません</p>
          ) : (
            <div
              className="history-meld-list"
              aria-label={`${player.name}の鳴いた役`}
            >
              {player.openMelds.map((meld, index) => (
                <div
                  className="history-meld-row"
                  key={`${player.id}-meld-${index}-${meld.map((card) => card.id).join("-")}`}
                >
                  {meld.map((card) => (
                    <PlayingCard card={card} compact key={card.id} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function getSeat(
  playerCount: number,
  index: number,
): "top" | "right" | "bottom" | "left" {
  const seats: Record<number, Array<"top" | "right" | "bottom" | "left">> = {
    3: ["bottom", "right", "left"],
    4: ["top", "right", "bottom", "left"],
    5: ["top", "right", "right", "bottom", "left"],
  };
  return seats[playerCount]?.[index] ?? "bottom";
}

function getAreaName(
  seat: "top" | "right" | "bottom" | "left",
): "self" | "left" | "right" | "top" {
  return seat === "bottom" ? "self" : seat;
}

function mapPlayersToViewSlots(
  players: GameState["players"],
  viewerPlayerId?: string,
) {
  const playerCount = players.length;
  const viewerIndex = viewerPlayerId
    ? players.findIndex((player) => player.id === viewerPlayerId)
    : -1;
  if (viewerIndex < 0) {
    return players.map((player, slotIndex) => ({
      player,
      playerIndex: slotIndex,
      slotIndex,
    }));
  }

  const clockwisePlayerIndexes = players.map(
    (_, offset) => (viewerIndex + offset) % playerCount,
  );
  const slotRelativeOffsets = getSlotRelativeOffsets(playerCount);

  return slotRelativeOffsets.map((relativeOffset, slotIndex) => {
    const playerIndex = clockwisePlayerIndexes[relativeOffset] ?? slotIndex;
    return {
      player: players[playerIndex] ?? players[slotIndex],
      playerIndex,
      slotIndex,
    };
  });
}

function getSlotRelativeOffsets(playerCount: number): number[] {
  if (playerCount === 3) return [0, 2, 1];
  if (playerCount === 4) return [2, 3, 0, 1];
  if (playerCount === 5) return [2, 3, 4, 0, 1];
  return Array.from({ length: playerCount }, (_, index) => index);
}

function mapPlayersToEnhancedTargetSlots(
  players: GameState["players"],
  viewerPlayerId: string | undefined,
  actorIndex: number,
) {
  const anchorIndex = viewerPlayerId
    ? players.findIndex((player) => player.id === viewerPlayerId)
    : actorIndex;
  const startIndex = anchorIndex >= 0 ? anchorIndex : actorIndex;
  const clockwisePlayerIndexes = players.map(
    (_, offset) => (startIndex + offset) % players.length,
  );
  return clockwisePlayerIndexes.map((playerIndex, slotIndex) => ({
    player: players[playerIndex] ?? players[slotIndex],
    playerIndex,
    slotIndex,
  }));
}

function getSeatStyle(playerCount: number, index: number): CSSProperties {
  const positions = seatPositions[playerCount] ?? seatPositions[4];
  const position = positions[index] ?? positions[0];
  return {
    left: position.left,
    top: position.top,
  };
}

function getHistoryAnchorStyle(
  playerCount: number,
  index: number,
): CSSProperties {
  const exact = historyAnchorPositions[playerCount]?.[index];
  if (exact) return exact;
  return getSeatStyle(playerCount, index);
}

function getPlayerStatus(
  player: GameState["players"][number],
  revealShieldRank = false,
) {
  const statuses = [
    player.isReach ? "リーチ中" : player.hasCalled ? "鳴き済み" : "通常",
  ];
  if (player.jShield) {
    const label =
      player.jShield.kind === "run"
        ? (player.jShield.label ??
          player.jShield.ranks?.map(formatRankLabel).join(""))
        : player.jShield.rank
          ? formatRankLabel(player.jShield.rank)
          : "";
    statuses.push(
      revealShieldRank && label ? `Jシールド:${label}` : "Jシールド発動中",
    );
  }
  return statuses.join(" / ");
}

function buildCpuDisplayNames(state: GameState) {
  const counts = new Map<string, number>();
  for (const player of state.players) {
    if (!player.isCpu) continue;
    const label = getCpuModelDisplayName(player.cpuModelId);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const labels = new Map<number, string>();
  state.players.forEach((player, index) => {
    if (!player.isCpu) return;
    const label = getCpuModelDisplayName(player.cpuModelId);
    const nextSeen = (seen.get(label) ?? 0) + 1;
    seen.set(label, nextSeen);
    labels.set(
      index,
      `Player${index + 1}:${label}${(counts.get(label) ?? 0) > 1 ? nextSeen : ""}`,
    );
  });
  return labels;
}

function getDiscardHighlights(state: GameState, discardSources: number[]) {
  const highlights = new Map<number, "call" | "ron">();
  const ronDiscarderIndex = state.pendingRonResult?.discarderIndex ?? null;
  if (state.phase === "ronCheck" && ronDiscarderIndex !== null) {
    highlights.set(ronDiscarderIndex, "ron");
    return highlights;
  }
  if (state.phase !== "draw") return highlights;

  for (const ownerIndex of discardSources) {
    highlights.set(ownerIndex, "call");
  }

  return highlights;
}

function isWinningCall(
  hand: Card[],
  openMelds: Card[][],
  meld: Card[],
  discard: Card,
) {
  const usedHandIds = new Set(
    meld.filter((card) => card.id !== discard.id).map((card) => card.id),
  );
  const handAfterCall = hand.filter((card) => !usedHandIds.has(card.id));
  return checkWinningHandWithOpenMelds(handAfterCall, [...openMelds, meld])
    .canWin;
}

function formatRankLabel(rank: number) {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

function getRonRemainingCards(
  hand: Card[],
  ronCard: Card | null,
  melds: Card[][],
) {
  const cards = ronCard ? [...hand, ronCard] : hand;
  const usedCounts = new Map<string, number>();

  for (const card of melds.flat()) {
    usedCounts.set(card.id, (usedCounts.get(card.id) ?? 0) + 1);
  }

  return cards.filter((card) => {
    const count = usedCounts.get(card.id) ?? 0;
    if (count <= 0) return true;
    usedCounts.set(card.id, count - 1);
    return false;
  });
}

function getRequiredActionPlayerIndex(state: GameState): number | null {
  const pending = state.pendingDaifugoEffect;
  if (!pending) return null;
  if (pending.kind === "sevenExchange") {
    return (
      [pending.playerIndex, pending.targetPlayerIndex].find(
        (playerIndex) =>
          !pending.selections[playerIndex] &&
          !state.players[playerIndex]?.isCpu,
      ) ?? null
    );
  }
  return "playerIndex" in pending ? pending.playerIndex : null;
}
// 上部ナビ文言生成 通常フェーズ、効果選択中、7渡し中、8/10効果中、リーチ継続確認中などの上部メッセージを返す。
// toolbar-action の通常表示を作る。
// ただし、効果演出中は daifugoAnimationStep.message が優先される。
// pendingDaifugoEffect の kind/effect と viewerPlayerId を見て、
// 自分向け/他人向けメッセージを切り替える。
function getActionText(state: GameState, viewerPlayerId?: string) {
  const pending = state.pendingDaifugoEffect;
  const viewerIndex = viewerPlayerId
    ? state.players.findIndex((player) => player.id === viewerPlayerId)
    : -1;
  const requiredActionPlayerIndex = getRequiredActionPlayerIndex(state);
  const requiredPlayer =
    requiredActionPlayerIndex !== null
      ? state.players[requiredActionPlayerIndex]
      : null;
  const isViewerRequiredActionPlayer =
    !viewerPlayerId ||
    (requiredActionPlayerIndex !== null &&
      viewerIndex === requiredActionPlayerIndex);
  if (pending?.kind === "sevenExchange") {
    const participantIndexes = [pending.playerIndex, pending.targetPlayerIndex];
    const viewerIsParticipant = participantIndexes.includes(viewerIndex);
    const viewerHasSelected = viewerIsParticipant
      ? Boolean(pending.selections[viewerIndex])
      : false;
    const waitingNames = participantIndexes
      .filter((playerIndex) => !pending.selections[playerIndex])
      .map((playerIndex) => state.players[playerIndex]?.name)
      .filter(Boolean)
      .join("、");
    const actor = state.players[pending.playerIndex];
    const target = state.players[pending.targetPlayerIndex];
    if (!viewerPlayerId && requiredPlayer)
      return `${requiredPlayer.name}が渡すカードを選択しています。`;
    if (viewerIsParticipant && !viewerHasSelected)
      return "相手に渡すカードを1枚選択してください。";
    if (viewerIsParticipant && viewerHasSelected)
      return `${waitingNames || "相手"}が渡すカードを選択しています。`;
    return `${actor?.name ?? "プレイヤー"}と${target?.name ?? "相手"}が互いに渡すカードを選択しています。`;
  }
  if (pending?.kind === "queenSelect") {
    return isViewerRequiredActionPlayer
      ? "Qの効果で消す数字を選んでください。"
      : "Qの効果で消す数字を選択しています。";
  }
  if (pending?.kind === "queenWinConfirm") {
    return isViewerRequiredActionPlayer
      ? "Qの効果後の上がりを確認してください。"
      : "Qの効果後の上がりを確認しています。";
  }
  if (pending?.kind === "jackSelect") {
    const actor = state.players[pending.playerIndex];
    return isViewerRequiredActionPlayer
      ? "J特殊効果を選択してください。"
      : "Jを捨てました。";
  }
  if (pending?.kind === "jackShieldSelect") {
    const actor = state.players[pending.playerIndex];
    return isViewerRequiredActionPlayer
      ? "Jシールドの対象数字を選択してください。"
      : "Jを捨てました。";
  }
  if (pending?.kind === "jackInspect") {
    const targetNames =
      pending.targetPlayerIndexes
        .map((playerIndex) => state.players[playerIndex]?.name)
        .filter((name): name is string => Boolean(name))
        .join("と") || "相手";
    return isViewerRequiredActionPlayer
      ? "J効果で相手の手札を確認してください。"
      : "J効果を使用し、他のプレイヤーの手札を閲覧しています。";
  }
  if (pending?.kind === "reachContinueConfirm") {
    if (!isViewerRequiredActionPlayer) {
      return `${requiredPlayer?.name ?? "プレイヤー"}がリーチ継続を確認しています。`;
    }

    return pending.effect === "queenNumberVanish"
      ? "Q効果により手札構成が変化しました。"
      : "カード交換により手札構成が変化しました。";
  }
  if (pending?.kind === "confirm") {
    const actor = state.players[pending.playerIndex];
    const discardedCard = actor?.discardPile.at(-1) ?? null;
    const rankLabel = discardedCard
      ? formatRankLabel(discardedCard.rank)
      : "カード";
    const viewerIsActor = viewerIndex === pending.playerIndex;
    return viewerIsActor
      ? "効果を使用するか選択してください。"
      : `${rankLabel}を捨てました。`;
  }

  if (pending?.kind === "effectDraw") {
    if (pending.effect === "eightExtraTurn") {
      return "8の効果で山札から引きます。";
    }
    if (pending.effect === "tenSwapDraw") {
      return isViewerRequiredActionPlayer
        ? "山札から1枚引きます。"
        : state.message || "10の効果で山札から1枚引きます。";
    }
    return `${requiredPlayer?.name ?? "プレイヤー"}が効果で山札から引いています。`;
  }
  if (pending?.kind === "extraDiscard") {
    if (pending.effect === "tenSwapDraw") {
      return isViewerRequiredActionPlayer
        ? "10の効果：追加で1枚捨ててください。"
        : "10の効果で追加の捨て札を選んでいます。";
    }
    if (pending.effect === "eightExtraTurn") {
      return isViewerRequiredActionPlayer
        ? "8の効果：追加で1枚捨ててください。"
        : "8の効果で追加の捨て札を選んでいます。";
    }

    if (!isViewerRequiredActionPlayer) {
      return "捨てるカードを選択しています。";
    }
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isViewerTurn = !viewerPlayerId || currentPlayer?.id === viewerPlayerId;
  if (currentPlayer?.isCpu) {
    if (state.phase === "draw")
      return "山札または直前の捨て札から選択しています";
    if (state.phase === "discard") return "捨てるカードを選択しています。";
    if (state.phase === "reachConfirm")
      return `${currentPlayer.name}（CPU）がリーチを確認しています。`;
    if (state.phase === "ronCheck")
      return `${currentPlayer.name}（CPU）がロンを確認しています。`;
  }

  if (
    pending?.kind === "sevenEnhancementSplash" ||
    pending?.kind === "sevenEnhancedTargetSelect"
  ) {
    const actor = state.players[pending.playerIndex];
    return isViewerRequiredActionPlayer
      ? "交換相手を選択してください。"
      : "7渡しの相手を選んでいます。J強化により次の手番以外の人も交換対象になります。";
  }
  if (
    pending?.kind === "fiveEnhancementSplash" ||
    pending?.kind === "fiveEnhancedTargetSelect"
  ) {
    const actor = state.players[pending.playerIndex];
    return isViewerRequiredActionPlayer
      ? "次の手番を渡すプレイヤーを選択してください。"
      : "次の手番の人を選んでいます。J強化により複数人飛ばすことが可能です。";
  }

  if (!isViewerTurn && currentPlayer) {
    if (state.phase === "draw") return "山札または捨て札から選択しています。";
    if (state.phase === "discard") {
      if (
        state.message.includes("8の効果：山札から1枚引きます") ||
        state.message.includes("8の効果で山札から引きます")
      ) {
        return "8の効果で山札から引きます。";
      }
      if (
        state.message.includes("8の効果：追加で1枚捨ててください") ||
        state.message.includes("8の効果：追加行動で1枚捨ててください") ||
        state.message.includes("8の効果で追加行動中")
      ) {
        return "8の効果で追加の捨て札を選んでいます。";
      }
      if (
        state.message.includes("10の効果を使用し") &&
        state.message.includes("山札から1枚引きます")
      ) {
        return state.message;
      }

      if (
        state.message.includes(
          "10の効果：追加で捨てるカードを1枚選んでください",
        ) ||
        state.message.includes("10の効果：追加で1枚捨ててください")
      ) {
        return "10の効果で追加の捨て札を選んでいます。";
      }
      const latestDiscard = currentPlayer.discardPile.at(-1) ?? null;
      if (
        latestDiscard?.rank === 11 &&
        (state.message.includes("J特殊効果を発動しました") ||
          state.message.includes("Jシールドの対象数字を選んでいます"))
      ) {
        return "Jを捨てました。";
      }
      if (
        state.message.includes("J効果を使用し") &&
        state.message.includes("他のプレイヤーの手札を閲覧しています")
      ) {
        return state.message;
      }

      if (
        state.message.includes("7渡しの相手を選んでいます") ||
        state.message.includes("強化7の交換相手を選択しています")
      ) {
        return "7渡しの相手を選んでいます。J強化により次の手番以外の人も交換対象になります。";
      }
      if (
        state.message.includes("次の手番の人を選んでいます") ||
        state.message.includes("強化5の次手番相手を選択しています")
      ) {
        return "次の手番の人を選んでいます。J強化により複数人飛ばすことが可能です。";
      }

      const lastDiscard = currentPlayer.discardPile.at(-1) ?? null;
      if (
        lastDiscard &&
        (lastDiscard.rank === 5 || lastDiscard.rank === 7) &&
        (state.message.includes("J強化を使用できます") ||
          state.message.includes("can use J enhancement"))
      ) {
        return `${formatRankLabel(lastDiscard.rank)}を捨てました。`;
      }
      if (
        lastDiscard &&
        (state.message.includes("5の効果") ||
          state.message.includes("7の効果") ||
          state.message.includes("8の効果") ||
          state.message.includes("9の効果") ||
          state.message.includes("10の効果") ||
          state.message.includes("Jの効果") ||
          state.message.includes("Qの効果") ||
          state.message.includes("カード効果"))
      ) {
        return `${formatRankLabel(lastDiscard.rank)}を捨てました。`;
      }
      return "捨てるカードを選択しています。";
    }
    if (state.phase === "reachConfirm") return "リーチを確認しています。";
    if (state.phase === "ronCheck") return "ロンを確認しています。";
  }

  if (state.phase === "draw")
    return "山札または直前の捨て札から1枚取ってください。";
  if (state.phase === "discard") return "手札から1枚選んで捨ててください。";
  if (state.phase === "reachConfirm") return "リーチ宣言を確認してください。";
  if (state.phase === "ronCheck") return "ロン可能な捨て札を確認しています。";
  if (state.phase === "handoff") {
    const handoffSourceIndex =
      state.lastDiscarderIndex ?? state.currentPlayerIndex;
    const nextPlayerIndex =
      state.direction === "clockwise"
        ? (handoffSourceIndex + 1) % state.players.length
        : (handoffSourceIndex - 1 + state.players.length) %
          state.players.length;

    const viewerIsNextPlayer = Boolean(
      viewerPlayerId && state.players[nextPlayerIndex]?.id === viewerPlayerId,
    );

    const viewerIsHandoffSource = Boolean(
      viewerPlayerId &&
      state.players[handoffSourceIndex]?.id === viewerPlayerId,
    );

    const nextTurnMessage = viewerIsNextPlayer
      ? "次はあなたの手番です。"
      : `次は${state.players[nextPlayerIndex]?.name ?? "次のプレイヤー"}です。`;

    const message = state.message || nextTurnMessage;
    const nextMarkerIndex = message.indexOf("。次は");
    if (message.startsWith("9の効果で手番方向が逆になりました。")) {
      const effectMessage = viewerIsHandoffSource
        ? "手番方向が逆になりました。"
        : "9の効果で手番方向が逆になりました。";

      return `${effectMessage}${nextTurnMessage}`;
    }
    if (nextMarkerIndex >= 0 && message.includes("がJ強化5スキップを使用")) {
      const effectMessage = message.slice(0, nextMarkerIndex + 1);
      const viewerPlayer = viewerPlayerId
        ? state.players.find((player) => player.id === viewerPlayerId)
        : null;
      const viewerIsEnhancedFiveActor = Boolean(
        viewerPlayer &&
        message.startsWith(`${viewerPlayer.name}がJ強化5スキップ`),
      );
      return viewerIsEnhancedFiveActor
        ? nextTurnMessage
        : `${effectMessage}${nextTurnMessage}`;
    }
    if (
      nextMarkerIndex >= 0 &&
      (message.includes("がJシールドを発動しました。") ||
        message.includes("がJ効果で5/7強化権を獲得しました。") ||
        message.includes("がJ効果で5/7強化権を発動しました。"))
    ) {
      const effectMessage = message.slice(0, nextMarkerIndex + 1);

      return viewerIsHandoffSource
        ? nextTurnMessage
        : `${effectMessage}${nextTurnMessage}`;
    }
    if (message.startsWith("これ以降、この山札から") && nextMarkerIndex >= 0) {
      const vanishMessage = message.slice(0, nextMarkerIndex + 1);
      return `${vanishMessage}${nextTurnMessage}`;
    }

    if (nextMarkerIndex >= 0) {
      const discardMessage = message.slice(0, nextMarkerIndex + 1);

      return viewerIsHandoffSource
        ? nextTurnMessage
        : `${discardMessage}${nextTurnMessage}`;
    }

    if (message.startsWith("次は")) {
      return nextTurnMessage;
    }

    return message;
  }
  if (state.drawnCard) return `引いたカード: ${formatCard(state.drawnCard)}`;
  return state.message;
}

function getDaifugoEffectText(
  effect: NonNullable<GameState["pendingDaifugoEffect"]>["effect"],
) {
  if (effect === "sevenExchange")
    return "7の効果：次のプレイヤーとカードを1枚交換しますか？";
  if (effect === "queenNumberVanish")
    return "Qの効果：指定した数字を手札と山札から消しますか？";
  if (effect === "fiveSkip")
    return "5の効果：次のプレイヤーをスキップしますか？";
  if (effect === "eightExtraTurn") return "8の効果：追加ターンを行いますか？";
  if (effect === "nineReverse") return "9の効果：手番方向を逆にしますか？";
  if (effect === "tenSwapDraw")
    return "10の効果：追加で1枚捨てて山札から1枚引きますか？";
  if (effect === "jackBack") return "Jの効果：J特殊効果を使用しますか？";
  return "カード効果を発動しますか？";
}

function getAnimationLabel(phase: AnimationPhase) {
  if (phase === "drawingFromDeck") return "山札からドロー";
  if (phase === "revealingDrawnCard") return "引いたカード";
  if (phase === "movingDrawnCardToHand") return "手札へ";
  if (phase === "discardingCard") return "捨て札へ";
  return "";
}

function MobileLayoutDebugPanel({ playerCount }: { playerCount: number }) {
  type LayoutDebugTargetKind =
    | "marker"
    | "window"
    | "status"
    | "topNav"
    | "handCard"
    | "roundBanner";

  type LayoutDebugValue = {
    x: number;
    y: number;
    width?: number;
    height?: number;
    nameFontSize?: number;
    textFontSize?: number;
  };

  const [targetSeat, setTargetSeat] = useState(1);
  const [targetKind, setTargetKind] = useState<LayoutDebugTargetKind>("window");
  const [panelCorner, setPanelCorner] = useState<
    "top-left" | "top-right" | "bottom-left" | "bottom-right"
  >("top-right");
  const [offsets, setOffsets] = useState<Record<string, LayoutDebugValue>>({});
  const [statusCommon, setStatusCommon] = useState({
    width: 250,
    height: 70,
    nameFontSize: 20,
    textFontSize: 20,
  });
  const [topNavCommon, setTopNavCommon] = useState({
    x: 0,
    y: 0,
    width: 520,
    height: 42,
    fontSize: 10,
    playerLabelX: 0,
    playerLabelY: 0,
    playerStatusX: 0,
    playerStatusY: 0,
  });
  const [handCardCommon, setHandCardCommon] = useState({
    width: 58,
    scale: 0.92,
  });
  const [roundBannerCommon, setRoundBannerCommon] = useState({
    width: 230,
    height: 28,
    fontSize: 14,
    x: 0,
    y: 0,
  });
  const key = `${targetKind}-${playerCount}-p${targetSeat}`;
  const current = offsets[key] ?? {
    x: 0,
    y: 0,
    width: 96,
    height: 44,
    nameFontSize: 14,
    textFontSize: 12,
  };

  const panelPositionStyle: CSSProperties =
    panelCorner === "top-left"
      ? { left: 8, top: 8 }
      : panelCorner === "top-right"
        ? { right: 8, top: 8 }
        : panelCorner === "bottom-left"
          ? { left: 8, bottom: 8 }
          : { right: 8, bottom: 8 };

  useEffect(() => {
    if (targetSeat > playerCount) {
      setTargetSeat(playerCount);
    }
  }, [playerCount, targetSeat]);

  useEffect(() => {
    const root = document.documentElement;

    const tableHistoryAreaBySeat: Record<string, "self" | "right" | "left"> = {
      p1: "self",
      p2: "right",
      p3: "left",
    };

    Object.entries(offsets).forEach(([offsetKey, value]) => {
      const [kind, count, seat] = offsetKey.split("-");

      if (!kind || !count || !seat) return;

      if (kind === "marker") {
        if (count === "3") {
          const area = tableHistoryAreaBySeat[seat];
          if (!area) return;

          root.style.setProperty(
            `--table-history-3-${area}-marker-x`,
            `${value.x}px`,
          );
          root.style.setProperty(
            `--table-history-3-${area}-marker-y`,
            `${value.y}px`,
          );
          return;
        }

        root.style.setProperty(`--history-${count}-${seat}-x`, `${value.x}px`);
        root.style.setProperty(`--history-${count}-${seat}-y`, `${value.y}px`);
        return;
      }

      if (kind === "window") {
        if (count === "3") {
          const area = tableHistoryAreaBySeat[seat];
          if (!area) return;

          root.style.setProperty(
            `--table-history-3-${area}-window-x`,
            `${value.x}px`,
          );
          root.style.setProperty(
            `--table-history-3-${area}-window-y`,
            `${value.y}px`,
          );
          return;
        }

        root.style.setProperty(
          `--history-${count}-${seat}-window-x`,
          `${value.x}px`,
        );
        root.style.setProperty(
          `--history-${count}-${seat}-window-y`,
          `${value.y}px`,
        );
        return;
      }

      if (kind === "status") {
        root.style.setProperty(`--status-${count}-${seat}-x`, `${value.x}px`);
        root.style.setProperty(`--status-${count}-${seat}-y`, `${value.y}px`);
        root.style.setProperty(
          `--status-${count}-${seat}-width`,
          `${value.width ?? 96}px`,
        );
        root.style.setProperty(
          `--status-${count}-${seat}-height`,
          `${value.height ?? 44}px`,
        );
        root.style.setProperty(
          `--status-${count}-${seat}-name-font-size`,
          `${value.nameFontSize ?? 14}px`,
        );
        root.style.setProperty(
          `--status-${count}-${seat}-text-font-size`,
          `${value.textFontSize ?? 12}px`,
        );
      }
    });
  }, [offsets]);

  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty("--status-common-width", `${statusCommon.width}px`);
    root.style.setProperty(
      "--status-common-height",
      `${statusCommon.height}px`,
    );
    root.style.setProperty(
      "--status-common-name-font-size",
      `${statusCommon.nameFontSize}px`,
    );
    root.style.setProperty(
      "--status-common-text-font-size",
      `${statusCommon.textFontSize}px`,
    );
  }, [statusCommon]);

  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty("--debug-top-nav-x", `${topNavCommon.x}px`);
    root.style.setProperty("--debug-top-nav-y", `${topNavCommon.y}px`);
    root.style.setProperty("--debug-top-nav-width", `${topNavCommon.width}px`);
    root.style.setProperty(
      "--debug-top-nav-height",
      `${topNavCommon.height}px`,
    );
    root.style.setProperty(
      "--debug-top-nav-font-size",
      `${topNavCommon.fontSize}px`,
    );
    root.style.setProperty(
      "--debug-top-nav-player-label-x",
      `${topNavCommon.playerLabelX}px`,
    );
    root.style.setProperty(
      "--debug-top-nav-player-label-y",
      `${topNavCommon.playerLabelY}px`,
    );
    root.style.setProperty(
      "--debug-top-nav-player-status-x",
      `${topNavCommon.playerStatusX}px`,
    );
    root.style.setProperty(
      "--debug-top-nav-player-status-y",
      `${topNavCommon.playerStatusY}px`,
    );
  }, [topNavCommon]);

  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty(
      "--debug-hand-card-width",
      `${handCardCommon.width}px`,
    );
    root.style.setProperty(
      "--debug-hand-card-scale",
      String(handCardCommon.scale),
    );
  }, [handCardCommon]);

  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty(
      "--debug-round-banner-width",
      `${roundBannerCommon.width}px`,
    );
    root.style.setProperty(
      "--debug-round-banner-height",
      `${roundBannerCommon.height}px`,
    );
    root.style.setProperty(
      "--debug-round-banner-font-size",
      `${roundBannerCommon.fontSize}px`,
    );
    root.style.setProperty(
      "--debug-round-banner-x",
      `${roundBannerCommon.x}px`,
    );
    root.style.setProperty(
      "--debug-round-banner-y",
      `${roundBannerCommon.y}px`,
    );
  }, [roundBannerCommon]);

  const updateCurrent = (next: Partial<LayoutDebugValue>) => {
    setOffsets((previous) => ({
      ...previous,
      [key]: {
        x: next.x ?? current.x,
        y: next.y ?? current.y,
        width: next.width ?? current.width,
        height: next.height ?? current.height,
        nameFontSize: next.nameFontSize ?? current.nameFontSize,
        textFontSize: next.textFontSize ?? current.textFontSize,
      },
    }));
  };

  const seatOptions = Array.from(
    { length: playerCount },
    (_, index) => index + 1,
  );

  const areaName =
    targetSeat === 1 ? "self" : targetSeat === 2 ? "right" : "left";

  const cssPreview =
    targetKind === "status"
      ? `player status\n--status-${playerCount}-p${targetSeat}-x: ${current.x}px;\n--status-${playerCount}-p${targetSeat}-y: ${current.y}px;\n--status-common-width: ${statusCommon.width}px;\n--status-common-height: ${statusCommon.height}px;\n--status-common-name-font-size: ${statusCommon.nameFontSize}px;\n--status-common-text-font-size: ${statusCommon.textFontSize}px;`
      : targetKind === "topNav"
        ? `top nav\n--debug-top-nav-x: ${topNavCommon.x}px;\n--debug-top-nav-y: ${topNavCommon.y}px;\n--debug-top-nav-width: ${topNavCommon.width}px;\n--debug-top-nav-height: ${topNavCommon.height}px;\n--debug-top-nav-font-size: ${topNavCommon.fontSize}px;\n--debug-top-nav-player-label-x: ${topNavCommon.playerLabelX}px;\n--debug-top-nav-player-label-y: ${topNavCommon.playerLabelY}px;\n--debug-top-nav-player-status-x: ${topNavCommon.playerStatusX}px;\n--debug-top-nav-player-status-y: ${topNavCommon.playerStatusY}px;`
        : targetKind === "handCard"
          ? `hand card\n--debug-hand-card-width: ${handCardCommon.width}px;\n--debug-hand-card-scale: ${handCardCommon.scale};`
          : targetKind === "roundBanner"
            ? `round banner\n--debug-round-banner-width: ${roundBannerCommon.width}px;\n--debug-round-banner-height: ${roundBannerCommon.height}px;\n--debug-round-banner-font-size: ${roundBannerCommon.fontSize}px;\n--debug-round-banner-x: ${roundBannerCommon.x}px;\n--debug-round-banner-y: ${roundBannerCommon.y}px;`
            : playerCount === 3
              ? targetKind === "marker"
                ? `3人用 ?：p1=self / p2=right / p3=left\n--table-history-3-${areaName}-marker-x: ${current.x}px;\n--table-history-3-${areaName}-marker-y: ${current.y}px;`
                : `3人用 window：p1=self / p2=right / p3=left\n--table-history-3-${areaName}-window-x: ${current.x}px;\n--table-history-3-${areaName}-window-y: ${current.y}px;`
              : targetKind === "marker"
                ? `4/5人用 ?\n--history-${playerCount}-p${targetSeat}-x: ${current.x}px;\n--history-${playerCount}-p${targetSeat}-y: ${current.y}px;`
                : `4/5人用 window\n--history-${playerCount}-p${targetSeat}-window-x: ${current.x}px;\n--history-${playerCount}-p${targetSeat}-window-y: ${current.y}px;`;

  return (
    <div
      style={{
        position: "fixed",
        ...panelPositionStyle,
        zIndex: 999999,
        width: "min(30dvw, 240px)",
        maxHeight: "72dvh",
        overflow: "auto",
        padding: 8,
        borderRadius: 10,
        background: "rgba(0, 0, 0, 0.78)",
        color: "white",
        fontSize: 10,
        lineHeight: 1.2,
        boxShadow: "0 0 0 2px red",
      }}
    >
      <strong style={{ display: "block", marginBottom: 6 }}>
        Layout Debug
      </strong>

      <label style={{ display: "block", marginBottom: 6 }}>
        panel:
        <select
          value={panelCorner}
          onChange={(event) =>
            setPanelCorner(
              event.target.value as
                | "top-left"
                | "top-right"
                | "bottom-left"
                | "bottom-right",
            )
          }
          style={{ width: "100%", marginTop: 4 }}
        >
          <option value="top-left">top-left</option>
          <option value="top-right">top-right</option>
          <option value="bottom-left">bottom-left</option>
          <option value="bottom-right">bottom-right</option>
        </select>
      </label>

      <label style={{ display: "block", marginBottom: 6 }}>
        target:
        <select
          value={targetKind}
          onChange={(event) =>
            setTargetKind(event.target.value as LayoutDebugTargetKind)
          }
          style={{ width: "100%", marginTop: 4 }}
        >
          <option value="marker">? position</option>
          <option value="window">card window</option>
          <option value="status">player status</option>
          <option value="topNav">top nav</option>
          <option value="handCard">hand card</option>
          <option value="roundBanner">round banner</option>
        </select>
      </label>

      <label style={{ display: "block", marginBottom: 6 }}>
        player count: {playerCount}
      </label>

      {(targetKind === "marker" ||
        targetKind === "window" ||
        targetKind === "status") && (
        <>
          <label style={{ display: "block", marginBottom: 6 }}>
            target seat:
            <select
              value={targetSeat}
              onChange={(event) => setTargetSeat(Number(event.target.value))}
              style={{ width: "100%", marginTop: 4 }}
            >
              {seatOptions.map((seat) => (
                <option key={seat} value={seat}>
                  p{seat}
                  {playerCount === 3
                    ? seat === 1
                      ? " / self"
                      : seat === 2
                        ? " / right"
                        : " / left"
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            x: {current.x}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-600"
              max="600"
              step="1"
              value={current.x}
              onChange={(event) =>
                updateCurrent({ x: Number(event.target.value) })
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            y: {current.y}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-400"
              max="400"
              step="1"
              value={current.y}
              onChange={(event) =>
                updateCurrent({ y: Number(event.target.value) })
              }
            />
          </label>
        </>
      )}

      {targetKind === "status" && (
        <>
          <label style={{ display: "block", marginBottom: 6 }}>
            common width: {statusCommon.width}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="120"
              max="320"
              step="1"
              value={statusCommon.width}
              onChange={(event) =>
                setStatusCommon((previous) => ({
                  ...previous,
                  width: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            common height: {statusCommon.height}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="36"
              max="130"
              step="1"
              value={statusCommon.height}
              onChange={(event) =>
                setStatusCommon((previous) => ({
                  ...previous,
                  height: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            common name font: {statusCommon.nameFontSize}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="10"
              max="28"
              step="1"
              value={statusCommon.nameFontSize}
              onChange={(event) =>
                setStatusCommon((previous) => ({
                  ...previous,
                  nameFontSize: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            common text font: {statusCommon.textFontSize}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="10"
              max="28"
              step="1"
              value={statusCommon.textFontSize}
              onChange={(event) =>
                setStatusCommon((previous) => ({
                  ...previous,
                  textFontSize: Number(event.target.value),
                }))
              }
            />
          </label>
        </>
      )}

      {targetKind === "topNav" && (
        <>
          <label style={{ display: "block", marginBottom: 6 }}>
            top nav x: {topNavCommon.x}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-300"
              max="300"
              step="1"
              value={topNavCommon.x}
              onChange={(event) =>
                setTopNavCommon((previous) => ({
                  ...previous,
                  x: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            top nav y: {topNavCommon.y}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-160"
              max="160"
              step="1"
              value={topNavCommon.y}
              onChange={(event) =>
                setTopNavCommon((previous) => ({
                  ...previous,
                  y: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            top nav width: {topNavCommon.width}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="260"
              max="760"
              step="1"
              value={topNavCommon.width}
              onChange={(event) =>
                setTopNavCommon((previous) => ({
                  ...previous,
                  width: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            top nav height: {topNavCommon.height}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="24"
              max="100"
              step="1"
              value={topNavCommon.height}
              onChange={(event) =>
                setTopNavCommon((previous) => ({
                  ...previous,
                  height: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            top nav font: {topNavCommon.fontSize}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="7"
              max="24"
              step="1"
              value={topNavCommon.fontSize}
              onChange={(event) =>
                setTopNavCommon((previous) => ({
                  ...previous,
                  fontSize: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            「現在のプレイヤー」x: {topNavCommon.playerLabelX}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-160"
              max="160"
              step="1"
              value={topNavCommon.playerLabelX}
              onChange={(event) =>
                setTopNavCommon((previous) => ({
                  ...previous,
                  playerLabelX: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            「現在のプレイヤー」y: {topNavCommon.playerLabelY}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-80"
              max="80"
              step="1"
              value={topNavCommon.playerLabelY}
              onChange={(event) =>
                setTopNavCommon((previous) => ({
                  ...previous,
                  playerLabelY: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            「通常/リーチ中」x: {topNavCommon.playerStatusX}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-160"
              max="160"
              step="1"
              value={topNavCommon.playerStatusX}
              onChange={(event) =>
                setTopNavCommon((previous) => ({
                  ...previous,
                  playerStatusX: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            「通常/リーチ中」y: {topNavCommon.playerStatusY}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-80"
              max="80"
              step="1"
              value={topNavCommon.playerStatusY}
              onChange={(event) =>
                setTopNavCommon((previous) => ({
                  ...previous,
                  playerStatusY: Number(event.target.value),
                }))
              }
            />
          </label>
        </>
      )}

      {targetKind === "handCard" && (
        <>
          <label style={{ display: "block", marginBottom: 6 }}>
            hand card width: {handCardCommon.width}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="32"
              max="110"
              step="1"
              value={handCardCommon.width}
              onChange={(event) =>
                setHandCardCommon((previous) => ({
                  ...previous,
                  width: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            hand card scale: {handCardCommon.scale}
            <input
              style={{ width: "100%" }}
              type="range"
              min="0.5"
              max="1.4"
              step="0.01"
              value={handCardCommon.scale}
              onChange={(event) =>
                setHandCardCommon((previous) => ({
                  ...previous,
                  scale: Number(event.target.value),
                }))
              }
            />
          </label>
        </>
      )}

      {targetKind === "roundBanner" && (
        <>
          <label style={{ display: "block", marginBottom: 6 }}>
            round banner width: {roundBannerCommon.width}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="120"
              max="460"
              step="1"
              value={roundBannerCommon.width}
              onChange={(event) =>
                setRoundBannerCommon((previous) => ({
                  ...previous,
                  width: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            round banner height: {roundBannerCommon.height}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="16"
              max="80"
              step="1"
              value={roundBannerCommon.height}
              onChange={(event) =>
                setRoundBannerCommon((previous) => ({
                  ...previous,
                  height: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            round banner font: {roundBannerCommon.fontSize}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="8"
              max="32"
              step="1"
              value={roundBannerCommon.fontSize}
              onChange={(event) =>
                setRoundBannerCommon((previous) => ({
                  ...previous,
                  fontSize: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            round banner x: {roundBannerCommon.x}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-240"
              max="240"
              step="1"
              value={roundBannerCommon.x}
              onChange={(event) =>
                setRoundBannerCommon((previous) => ({
                  ...previous,
                  x: Number(event.target.value),
                }))
              }
            />
          </label>

          <label style={{ display: "block", marginBottom: 6 }}>
            round banner y: {roundBannerCommon.y}px
            <input
              style={{ width: "100%" }}
              type="range"
              min="-120"
              max="120"
              step="1"
              value={roundBannerCommon.y}
              onChange={(event) =>
                setRoundBannerCommon((previous) => ({
                  ...previous,
                  y: Number(event.target.value),
                }))
              }
            />
          </label>
        </>
      )}

      <code style={{ display: "block", whiteSpace: "pre-wrap" }}>
        {cssPreview}
      </code>
    </div>
  );
}
