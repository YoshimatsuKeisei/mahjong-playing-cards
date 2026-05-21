import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch } from "react";
import { canDeclareReachAfterDraw, checkWinningHandWithOpenMelds } from "../game/rules";
import {
  createCpuDecisionContext,
  CPU_AFTER_DRAW_DELAY_MS,
  CPU_DECISION_DELAY_MS,
  CPU_DISCARD_DELAY_MS,
  CPU_THINK_DELAY_MS,
  getCpuModel,
} from "../game/cpu";
import { getCpuModelDisplayName } from "../game/cpuModelRegistry";
import {
  getAvailableDiscardSources,
  getCallOptionsForSource,
  getReachWinningOptions,
  getSevenExchangeCandidateCards,
  chooseCpuQueenRank,
  type GameAction,
} from "../game/gameState";
import type { Card, GameState } from "../types";
import DiscardPile from "./DiscardPile";
import HandView from "./HandView";
import MeldArea from "./MeldArea";
import PlayerArea from "./PlayerArea";
import PlayingCard, { formatCard } from "./PlayingCard";

interface PlayScreenProps {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  currentRound?: number;
}

type AnimationPhase = "idle" | "drawingFromDeck" | "revealingDrawnCard" | "movingDrawnCardToHand" | "discardingCard";
type DaifugoAnimationStep = {
  id: string;
  title: string;
  message: string;
  cards: Card[];
  side: "center" | "cpu";
  variant: "discard" | "draw" | "exchange";
};

const queenRankOptions = Array.from({ length: 13 }, (_, index) => index + 1);

const reachVisualSrc = new URL("../../黒ローブ男.png", import.meta.url).href;

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

const historyAnchorPositions: Record<number, Array<{ left: string; top: string }>> = {
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

const measuredAnchorLayouts: Record<number, Array<{ left: string; top: string; width: string; height: string }>> = {
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

export default function PlayScreen({ state, dispatch, currentRound }: PlayScreenProps) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const reachOptions = getReachWinningOptions(state);
  const discardSources = getAvailableDiscardSources(state);
  const discardHighlights = getDiscardHighlights(state, discardSources);
  const playerCount = state.players.length;
  const showTableCardLayer = playerCount === 3;
  const cpuDisplayNames = buildCpuDisplayNames(state);
  const canReachAfterDraw =
    state.phase === "discard" &&
    state.drawnFrom === "deck" &&
    canDeclareReachAfterDraw(currentPlayer.hand, currentPlayer.hasCalled, currentPlayer.isReach);
  const canChooseDiscard = !currentPlayer.isReach || state.declaredReachThisTurn;
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("idle");
  const [animationCard, setAnimationCard] = useState<Card | null>(null);
  const [selectedDiscardId, setSelectedDiscardId] = useState<string | null>(null);
  const [discardingCardId, setDiscardingCardId] = useState<string | null>(null);
  const [reachSplashPlayerName, setReachSplashPlayerName] = useState<string | null>(null);
  const [reachSplashCall, setReachSplashCall] = useState("リーチ!!");
  const [visibleDaifugoEventId, setVisibleDaifugoEventId] = useState<string | null>(null);
  const [daifugoEventStepIndex, setDaifugoEventStepIndex] = useState(0);
  const [ronCountdown, setRonCountdown] = useState(3);
  const [cpuActionInProgress, setCpuActionInProgress] = useState(false);
  const sceneRef = useRef<HTMLElement | null>(null);
  const historyMeasureRefs = useRef(new Map<number, HTMLElement>());
  const [measuredHistoryPositions, setMeasuredHistoryPositions] = useState<Record<number, { left: string; top: string }>>({});
  const timeoutsRef = useRef<number[]>([]);
  const cpuTimeoutsRef = useRef<number[]>([]);
  const lastCpuActionKeyRef = useRef<string | null>(null);
  const reachSplashTimeoutRef = useRef<number | null>(null);
  const isAnimating = animationPhase !== "idle";
  const isCpuTurn = currentPlayer?.isCpu === true && state.phase !== "result";
  const shouldHideCpuDetails = !state.showCpuActions && isCpuTurn;
  const pendingDaifugoEffect = state.pendingDaifugoEffect;
  const isDaifugoConfirm = pendingDaifugoEffect?.kind === "confirm";
  const isDaifugoExtraDiscard = pendingDaifugoEffect?.kind === "extraDiscard";
  const isDaifugoEffectDraw = pendingDaifugoEffect?.kind === "effectDraw";
  const isSevenExchange = pendingDaifugoEffect?.kind === "sevenExchange";
  const isQueenSelect = pendingDaifugoEffect?.kind === "queenSelect";
  const isQueenWinConfirm = pendingDaifugoEffect?.kind === "queenWinConfirm";
  const mustDiscardDrawnForReachDaifugo =
    isDaifugoExtraDiscard &&
    pendingDaifugoEffect.effect === "eightExtraTurn" &&
    currentPlayer.isReach &&
    !state.declaredReachThisTurn;
  const controlsDisabled =
    isAnimating || isCpuTurn || cpuActionInProgress || isDaifugoConfirm || isDaifugoEffectDraw || isSevenExchange || isQueenSelect || isQueenWinConfirm;
  const pendingRonResult = state.pendingRonResult;
  const ronDiscarderIndex = pendingRonResult?.discarderIndex ?? null;
  const ronDiscarder = ronDiscarderIndex !== null ? state.players[ronDiscarderIndex] : null;
  const ronCard = ronDiscarder?.discardPile.at(-1) ?? null;
  const ronWinners = pendingRonResult?.ronResults ?? [];
  const visibleDaifugoEvent =
    state.daifugoEffectEvent && state.daifugoEffectEvent.id === visibleDaifugoEventId ? state.daifugoEffectEvent : null;
  const daifugoAnimationSteps = visibleDaifugoEvent ? buildDaifugoAnimationSteps(visibleDaifugoEvent, state) : [];
  const daifugoAnimationStep = daifugoAnimationSteps[daifugoEventStepIndex] ?? null;
  const isDaifugoEventPlaying = Boolean(daifugoAnimationStep);
  const sevenSelectionPlayerIndex =
    pendingDaifugoEffect?.kind === "sevenExchange"
      ? [pendingDaifugoEffect.playerIndex, pendingDaifugoEffect.targetPlayerIndex].find(
          (playerIndex) => !pendingDaifugoEffect.selections[playerIndex] && !state.players[playerIndex]?.isCpu,
        ) ?? null
      : null;
  const sevenSelectionPlayer = sevenSelectionPlayerIndex !== null ? state.players[sevenSelectionPlayerIndex] : null;
  const sevenSelectionCandidates =
    pendingDaifugoEffect?.kind === "sevenExchange" && sevenSelectionPlayer
      ? getSevenExchangeCandidateCards(sevenSelectionPlayer, sevenSelectionPlayerIndex === pendingDaifugoEffect.playerIndex)
      : [];
  const sevenSelectionCandidateIds = sevenSelectionCandidates.map((card) => card.id);
  const humanPlayerIndex = state.players.findIndex((player) => !player.isCpu);
  const handPlayerIndex =
    sevenSelectionPlayerIndex ??
    (currentPlayer?.isCpu ? (humanPlayerIndex >= 0 ? humanPlayerIndex : state.currentPlayerIndex) : state.currentPlayerIndex);
  const handPlayer = state.players[handPlayerIndex] ?? currentPlayer;
  const handDrawnCardId = handPlayerIndex === state.currentPlayerIndex ? state.drawnCard?.id ?? null : null;
  const isSevenHandSelection = sevenSelectionPlayerIndex !== null && handPlayerIndex === sevenSelectionPlayerIndex;
  const shouldShowActionPanel =
    !shouldHideCpuDetails ||
    sevenSelectionPlayerIndex !== null ||
    (pendingDaifugoEffect?.kind === "queenSelect" && !state.players[pendingDaifugoEffect.playerIndex]?.isCpu) ||
    (pendingDaifugoEffect?.kind === "queenWinConfirm" && !state.players[pendingDaifugoEffect.playerIndex]?.isCpu);

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
    setDiscardingCardId(null);
    timeoutsRef.current.forEach(window.clearTimeout);
    timeoutsRef.current = [];
  }, [state.currentPlayerIndex]);

  useEffect(() => {
    if (isDaifugoEventPlaying) {
      cpuTimeoutsRef.current.forEach(window.clearTimeout);
      cpuTimeoutsRef.current = [];
      setCpuActionInProgress(false);
      return;
    }

    if (!isCpuTurn || !currentPlayer || state.phase === "handoff" || state.phase === "result") {
      cpuTimeoutsRef.current.forEach(window.clearTimeout);
      cpuTimeoutsRef.current = [];
      setCpuActionInProgress(false);
      return;
    }

    const pendingCpuRon = state.pendingRonResult?.ronResults?.some((item) => state.players[item.winnerIndex]?.isCpu) ?? false;
    const cpuActionKey = [
      state.phase,
      state.currentPlayerIndex,
      currentPlayer.cpuModelId ?? "standard",
      state.deck.length,
      state.drawnCard?.id ?? "none",
      state.pendingDaifugoEffect ? `${state.pendingDaifugoEffect.kind}:${state.pendingDaifugoEffect.effect}` : "no-daifugo",
      state.players.map((player) => `${player.hand.length}:${player.discardPile.length}:${player.openMelds.length}`).join("|"),
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
      scheduleCpuAction(
        () => {
          const activate = cpuModel.chooseDaifugoEffectActivation?.(cpuContext) ?? true;
          if (activate && state.pendingDaifugoEffect?.effect === "sevenExchange") {
            showReachSplash(currentPlayer.name, "カード交換!!");
          }
          if (activate && state.pendingDaifugoEffect?.effect === "queenNumberVanish") {
            showReachSplash(currentPlayer.name, "数字消去!!");
          }
          dispatch({ type: "answerDaifugoEffect", activate });
        },
        CPU_DECISION_DELAY_MS,
      );
      return;
    }

    if (state.pendingDaifugoEffect?.kind === "queenSelect") {
      scheduleCpuAction(() => dispatch({ type: "selectQueenVanishRank", rank: chooseCpuQueenRank(state, state.currentPlayerIndex) }), CPU_DECISION_DELAY_MS);
      return;
    }

    if (state.pendingDaifugoEffect?.kind === "queenWinConfirm") {
      scheduleCpuAction(() => dispatch({ type: "answerQueenWin", takeWin: true }), CPU_DECISION_DELAY_MS);
      return;
    }

    if (state.pendingDaifugoEffect?.kind === "effectDraw") {
      scheduleCpuAction(() => dispatch({ type: "drawForDaifugoEffect" }), CPU_AFTER_DRAW_DELAY_MS);
      return;
    }

    if (state.pendingDaifugoEffect?.kind === "extraDiscard") {
      const winningDiscard = state.pendingDaifugoEffect.effect === "eightExtraTurn" ? cpuModel.chooseWinningDiscard(cpuContext) : null;
      if (winningDiscard) {
        scheduleCpuAction(() => dispatch({ type: "winWithDiscard", discardCardId: winningDiscard.id }), CPU_DECISION_DELAY_MS);
        return;
      }
      const discardCard =
        state.pendingDaifugoEffect.effect === "eightExtraTurn" && currentPlayer.isReach && !state.declaredReachThisTurn
          ? state.drawnCard
          : cpuModel.chooseDiscardCard(cpuContext) ?? currentPlayer.hand[0] ?? null;
      if (discardCard) {
        scheduleCpuAction(() => dispatch({ type: "discardForDaifugoEffect", cardId: discardCard.id }), CPU_DISCARD_DELAY_MS);
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
        scheduleCpuAction(() => dispatch({ type: "winWithDiscard", discardCardId: winningDiscard.id }), CPU_DECISION_DELAY_MS);
        return;
      }

      if (currentPlayer.isReach && !state.declaredReachThisTurn) {
        scheduleCpuAction(() => dispatch({ type: "discardDrawnOnly" }), CPU_DISCARD_DELAY_MS);
        return;
      }

      const discardCard = cpuModel.chooseDiscardCard(cpuContext);
      if (discardCard) {
        const delay = state.drawnCard ? CPU_AFTER_DRAW_DELAY_MS + CPU_DISCARD_DELAY_MS : CPU_DISCARD_DELAY_MS;
        scheduleCpuAction(() => {
          const debugInfo = cpuModel.getDiscardDebugInfo?.(cpuContext);
          if (debugInfo) console.info(debugInfo);
          const discardLog = cpuModel.describeDiscardChoice?.(cpuContext, discardCard);
          if (discardLog) console.info(discardLog);
          dispatch({ type: "discard", cardId: discardCard.id });
        }, delay);
        return;
      }
    }

    if (state.phase === "reachConfirm") {
      scheduleCpuAction(
        () => {
          const declareReach = cpuModel.chooseReachDeclaration?.(cpuContext) ?? false;
          dispatch({ type: "answerReachAfterDiscard", declareReach });
          if (declareReach) {
            showReachSplash(currentPlayer.name);
          }
        },
        CPU_DECISION_DELAY_MS,
      );
      return;
    }

    if (state.phase === "ronCheck") {
      if (pendingCpuRon) {
        scheduleCpuAction(() => dispatch({ type: "answerRon", takeRon: true }), CPU_DECISION_DELAY_MS);
        return;
      }
      setCpuActionInProgress(false);
    }
  }, [currentPlayer, dispatch, isCpuTurn, isDaifugoEventPlaying, state]);

  useEffect(() => {
    if (selectedDiscardId && !handPlayer.hand.some((card) => card.id === selectedDiscardId)) {
      setSelectedDiscardId(null);
    }
  }, [handPlayer.hand, selectedDiscardId]);

  useEffect(() => {
    if (state.phase === "handoff") {
      if (state.daifugoEffectEvent && isDaifugoEventPlaying) return;
      const timeoutId = window.setTimeout(() => {
        dispatch({ type: "confirmHandoff" });
      }, 3000);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [state.phase, state.daifugoEffectEvent?.id, isDaifugoEventPlaying, dispatch]);

  useEffect(() => {
    if (!state.daifugoEffectEvent) return;
    const steps = buildDaifugoAnimationSteps(state.daifugoEffectEvent, state);
    if (steps.length === 0) {
      setVisibleDaifugoEventId(null);
      return;
    }
    setDaifugoEventStepIndex(0);
    setVisibleDaifugoEventId(state.daifugoEffectEvent.id);
  }, [state.daifugoEffectEvent?.id]);

  useEffect(() => {
    if (!visibleDaifugoEvent || !daifugoAnimationStep) return;
    const timeoutId = window.setTimeout(() => {
      setDaifugoEventStepIndex((index) => {
        const nextIndex = index + 1;
        if (nextIndex >= daifugoAnimationSteps.length) {
          setVisibleDaifugoEventId(null);
          return 0;
        }
        return nextIndex;
      });
    }, daifugoAnimationStep.variant === "discard" ? 2300 : 1900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [visibleDaifugoEvent?.id, daifugoEventStepIndex, daifugoAnimationStep, daifugoAnimationSteps.length]);

  useEffect(() => {
    if (currentPlayer?.isCpu || state.pendingDaifugoEffect?.kind !== "effectDraw" || isAnimating) return;
    animateDrawFromDeck(() => dispatch({ type: "drawForDaifugoEffect" }));
  }, [currentPlayer?.isCpu, dispatch, isAnimating, state.pendingDaifugoEffect]);

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

      setMeasuredHistoryPositions((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));

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
    setDiscardingCardId(null);
  }

  function handleDrawFromDeck() {
    animateDrawFromDeck(() => dispatch({ type: "drawFromDeck" }));
  }

  function animateDrawFromDeck(afterAnimation: () => void) {
    if (isAnimating || state.deck.length === 0) return;
    const card = state.deck[0];
    setAnimationCard(card);
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
    const card = currentPlayer.hand.find((item) => item.id === selectedDiscardId);
    if (!card) return;
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
    animateDiscard(card, () => dispatch({ type: "discardForDaifugoEffect", cardId: card.id }));
  }

  function handleSevenExchangeConfirm() {
    if (sevenSelectionPlayerIndex === null || !sevenSelectionPlayer || !selectedDiscardId) return;
    const card = sevenSelectionPlayer.hand.find((item) => item.id === selectedDiscardId);
    if (!card || !sevenSelectionCandidateIds.includes(card.id)) return;
    animateDiscard(card, () => dispatch({ type: "selectSevenExchangeCard", playerIndex: sevenSelectionPlayerIndex, cardId: card.id }));
  }

  function handleDiscardDrawnOnly() {
    if (!state.drawnCard) return;
    animateDiscard(state.drawnCard, () => dispatch({ type: "discardDrawnOnly" }));
  }

  function handleWinWithDiscard(card: Card) {
    animateDiscard(card, () => dispatch({ type: "winWithDiscard", discardCardId: card.id }));
  }

  function handleHandCardClick(card: Card) {
    if (isSevenHandSelection) {
      if (!sevenSelectionCandidateIds.includes(card.id)) return;
      if (selectedDiscardId === card.id) {
        animateDiscard(card, () => dispatch({ type: "selectSevenExchangeCard", playerIndex: sevenSelectionPlayerIndex!, cardId: card.id }));
        return;
      }
      setSelectedDiscardId(card.id);
      return;
    }
    setSelectedDiscardId((previousId) => (previousId === card.id ? null : card.id));
  }

  function handleDaifugoConfirmAnswer(activate: boolean) {
    if (activate && pendingDaifugoEffect?.kind === "confirm") {
      if (pendingDaifugoEffect.effect === "sevenExchange") {
        showReachSplash(currentPlayer.name, "カード交換!!");
      }
      if (pendingDaifugoEffect.effect === "queenNumberVanish") {
        showReachSplash(currentPlayer.name, "数字消去!!");
      }
    }
    dispatch({ type: "answerDaifugoEffect", activate });
  }

  function showReachSplash(playerName: string, call = "リーチ!!") {
    setReachSplashPlayerName(playerName);
    setReachSplashCall(call);
    if (reachSplashTimeoutRef.current !== null) {
      window.clearTimeout(reachSplashTimeoutRef.current);
    }
    reachSplashTimeoutRef.current = window.setTimeout(() => {
      setReachSplashPlayerName(null);
      reachSplashTimeoutRef.current = null;
    }, 2600);
  }

  function handleDeclareReach() {
    dispatch({ type: "declareReach" });
    showReachSplash(currentPlayer.name);
  }

  function handleReachConfirmAnswer(declareReach: boolean) {
    dispatch({ type: "answerReachAfterDiscard", declareReach });
    if (declareReach) {
      showReachSplash(currentPlayer.name);
    }
  }

  return (
    <main className="screen play-screen">
      <section className={`table-scene table-${playerCount}`} aria-label={`${playerCount}人用テーブル`} ref={sceneRef}>
        {currentRound && <div className="round-scroll-banner">- {currentRound}回戦 -</div>}
        <header
          className={`top-toolbar ${animationPhase === "discardingCard" ? "toolbar-exiting" : ""}`}
          key={`toolbar-${state.currentPlayerIndex}`}
        >
          <div className="toolbar-player">
            <span>現在のプレイヤー</span>
            <strong>{cpuDisplayNames.get(state.currentPlayerIndex) ?? currentPlayer.name}</strong>
            <em>{getPlayerStatus(currentPlayer)}</em>
          </div>
          <div className="toolbar-action">{getActionText(state)}</div>
          <div className="toolbar-deck">
            <span>山札</span>
            <strong>{state.deck.length}</strong>
          </div>
          {state.daifugoOptions.enabled && (
            <div className={`daifugo-status ${state.isJBackActive ? "active" : ""}`}>
              {state.isJBackActive ? "Jバック中" : state.direction === "clockwise" ? "通常順" : "逆回り"}
            </div>
          )}
        </header>

        <div className="table-shape">
          <div className={`deck-stack ${state.deck.length === 0 ? "empty-deck" : ""}`} aria-label={`山札 ${state.deck.length}枚`}>
            <span className="deck-layer layer-one" />
            <span className="deck-layer layer-two" />
            <PlayingCard isBack compact />
            <strong>{state.deck.length}</strong>
          </div>
        </div>

        {animationCard && animationPhase !== "discardingCard" && !shouldHideCpuDetails && (
          <div className={`card-animation ${animationPhase} seat-${getSeat(playerCount, state.currentPlayerIndex)}`}>
            <span className="card-animation-label">{getAnimationLabel(animationPhase)}</span>
            <PlayingCard card={animationCard} />
          </div>
        )}

        {reachSplashPlayerName && (
          <div className="reach-splash" role="status" aria-live="assertive">
            <div className="reach-splash-band">
              <img src={reachVisualSrc} alt="" className="reach-splash-visual" />
              <div className="reach-splash-copy">
                <span>宣言</span>
                <strong>
                  <span className="reach-splash-player">{reachSplashPlayerName}</span>
                  <span className="reach-splash-call">{reachSplashCall}</span>
                </strong>
              </div>
            </div>
          </div>
        )}

        {daifugoAnimationStep && (
          <section className={`daifugo-event-overlay ${daifugoAnimationStep.side === "cpu" ? "cpu-side" : "center-side"}`} role="status" aria-live="polite">
            <DaifugoAnimationStage step={daifugoAnimationStep} />
          </section>
        )}

        {state.phase === "ronCheck" && pendingRonResult && (
          <div className="ron-check-overlay" role="status" aria-live="assertive">
            <section className="ron-check-panel">
              <p className="eyebrow">ロン確認</p>
              <h1>{ronWinners.map((item) => state.players[item.winnerIndex].name).join("・")} ロン!!</h1>
              <div className="ron-check-card">
                <span>{ronDiscarder ? `${ronDiscarder.name}の捨て札` : "捨て札"}</span>
                <strong>{ronCard ? formatCard(ronCard) : "確認中"}</strong>
              </div>
              <div className="ron-check-winners">
                {(
                  ronWinners.length > 0
                    ? ronWinners
                    : [
                        {
                          winnerIndex: pendingRonResult.winnerIndex,
                          winningResult: pendingRonResult.winningResult,
                          score: pendingRonResult.score,
                        },
                      ]
                ).map((item) => (
                    <section className="ron-check-candidate" key={item.winnerIndex}>
                      <div className="ron-check-row">
                        <span>{state.players[item.winnerIndex].name}</span>
                        <strong>ロン可能</strong>
                      </div>
                      <div className="ron-hand-preview" aria-label={`${state.players[item.winnerIndex].name}の手札完成プレビュー`}>
                        {item.winningResult.melds.map((meld, meldIndex) => (
                          <div className="ron-preview-meld" key={`${item.winnerIndex}-${meldIndex}-${meld.map((card) => card.id).join("-")}`}>
                            {meld.map((card) => (
                              <PlayingCard card={card} compact key={card.id} />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="ron-rest-preview" aria-label={`${state.players[item.winnerIndex].name}の余ったトランプ`}>
                        <span>余ったトランプ</span>
                        <div>
                          {getRonRemainingCards(state.players[item.winnerIndex].hand, ronCard, item.winningResult.melds).length === 0 ? (
                            <em>なし</em>
                          ) : (
                            getRonRemainingCards(state.players[item.winnerIndex].hand, ronCard, item.winningResult.melds).map((card) => (
                              <PlayingCard card={card} compact key={card.id} />
                            ))
                          )}
                        </div>
                      </div>
                    </section>
                  ))}
              </div>
              <div className="countdown-ring" aria-label={`ロン確認 ${ronCountdown}秒`}>
                {ronCountdown}
              </div>
              <div className="ron-check-actions">
                <button type="button" className="primary-button" onClick={() => dispatch({ type: "answerRon", takeRon: true })}>
                  はい
                </button>
                <button type="button" onClick={() => dispatch({ type: "answerRon", takeRon: false })}>
                  いいえ
                </button>
              </div>
            </section>
          </div>
        )}

        {state.players.map((player, index) => (
          <PlayerArea
            key={player.id}
            player={player}
            isCurrent={index === state.currentPlayerIndex}
            seat={getSeat(playerCount, index)}
            displayName={cpuDisplayNames.get(index)}
            style={getSeatStyle(playerCount, index)}
          />
        ))}

        {playerCount >= 4 &&
          state.players.map((player, index) => {
            const layout = measuredAnchorLayouts[playerCount]?.[index];
            if (!layout) return null;

            return (
              <span
                className={`history-measure-anchor history-measure-anchor--p${index + 1}`}
                style={layout}
                ref={(node) => {
                  if (node) {
                    historyMeasureRefs.current.set(index, node);
                  } else {
                    historyMeasureRefs.current.delete(index);
                  }
                }}
                aria-hidden="true"
                key={`${player.id}-history-measure`}
              />
            );
          })}
        {playerCount >= 4 &&
          state.players.map((player, index) => (
            <div
              className={`history-hover-anchor history-hover-anchor--${getSeat(playerCount, index)} history-hover-anchor--p${index + 1}`}
              style={measuredHistoryPositions[index] ?? getHistoryAnchorStyle(playerCount, index)}
              key={`${player.id}-history-hover`}
            >
              <button type="button" className="history-hover-marker" aria-label={`${player.name}\u306e\u5c65\u6b74\u3092\u78ba\u8a8d`}>
                ?
              </button>
              <PlayerHistoryPopover player={player} showMelds />
            </div>
          ))}

        {showTableCardLayer &&
          state.players.map((player, index) =>
            player.discardPile.length > 0 ? (
              <div
                className={`history-hover-anchor table-history-anchor table-history-anchor--${getAreaName(getSeat(playerCount, index))}`}
                style={measuredHistoryPositions[index] ?? getHistoryAnchorStyle(playerCount, index)}
                key={`${player.id}-table-history-hover`}
              >
                <button type="button" className="history-hover-marker" aria-label={`${player.name}\u306e\u6368\u3066\u672d\u5c65\u6b74\u3092\u78ba\u8a8d`}>
                  ?
                </button>
                <PlayerHistoryPopover player={player} showMelds={false} />
              </div>
            ) : null,
          )}

        {showTableCardLayer && (
          <div className="table-card-layer" aria-label="捨て札と公開役">
            {state.players.map((player, index) => {
              const area = getAreaName(getSeat(playerCount, index));
              if (area === "self") {
                return (
                  <div className="self-table-zone" key={`${player.id}-field`}>
                    <div className="self-discard-column">
                      <DiscardPile cards={player.discardPile} area={area} highlightLatest={discardHighlights.get(index) ?? null} />
                      {player.discardPile.length > 0 && (
                        <span
                          className="discard-first-card-anchor"
                          ref={(node) => {
                            if (node) {
                              historyMeasureRefs.current.set(index, node);
                            } else {
                              historyMeasureRefs.current.delete(index);
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
                  <div className={`opponent-field opponent-field--${area}`} key={`${player.id}-field`}>
                    <div className="opponent-card-group">
                      <div className={`opponent-discard-stack history-hover-zone--${area}`}>
                        <DiscardPile cards={player.discardPile} area={area} highlightLatest={discardHighlights.get(index) ?? null} />
                        {player.discardPile.length > 0 && (
                          <span
                            className="discard-first-card-anchor"
                            ref={(node) => {
                              if (node) {
                                historyMeasureRefs.current.set(index, node);
                              } else {
                                historyMeasureRefs.current.delete(index);
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
                <div className={`card-field card-field--${area}`} key={`${player.id}-field`}>
                  <div className={`history-hover-zone--${area}`}>
                    <DiscardPile cards={player.discardPile} area={area} highlightLatest={discardHighlights.get(index) ?? null} />
                    {player.discardPile.length > 0 && (
                      <span
                        className="discard-first-card-anchor"
                        ref={(node) => {
                          if (node) {
                            historyMeasureRefs.current.set(index, node);
                          } else {
                            historyMeasureRefs.current.delete(index);
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
        <section className="action-panel">
          {isDaifugoConfirm && (
            <div className="daifugo-effect-panel">
              <strong>{getDaifugoEffectText(pendingDaifugoEffect.effect)}</strong>
              <div className="daifugo-effect-actions">
                <button type="button" className="primary-button" disabled={isAnimating || isCpuTurn} onClick={() => handleDaifugoConfirmAnswer(true)}>
                  はい
                </button>
                <button type="button" disabled={isAnimating || isCpuTurn} onClick={() => handleDaifugoConfirmAnswer(false)}>
                  いいえ
                </button>
              </div>
            </div>
          )}

          {isDaifugoExtraDiscard && (
            <div className="daifugo-effect-panel">
              <strong>{pendingDaifugoEffect.effect === "eightExtraTurn" ? "8の効果：追加で1枚捨ててください。" : "10の効果：追加で1枚捨ててください。"}</strong>
              {pendingDaifugoEffect.effect === "eightExtraTurn" && canReachAfterDraw && (
                <button type="button" className="primary-button" disabled={isAnimating || isCpuTurn || cpuActionInProgress} onClick={handleDeclareReach}>
                  リーチ
                </button>
              )}
              {pendingDaifugoEffect.effect === "eightExtraTurn" && currentPlayer.isReach && !state.declaredReachThisTurn && reachOptions.length > 0 && (
                <div className="reach-win-options">
                  <strong>上がるために捨てるカード</strong>
                  {reachOptions.map((option) => (
                    <button
                      type="button"
                      className="primary-button"
                      key={option.discardCard.id}
                      disabled={isAnimating || isCpuTurn || cpuActionInProgress}
                      onClick={() => handleWinWithDiscard(option.discardCard)}
                    >
                      上がる {formatCard(option.discardCard)}を捨てる
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="primary-button"
                disabled={(!selectedDiscardId && !mustDiscardDrawnForReachDaifugo) || isAnimating || isCpuTurn || cpuActionInProgress}
                onClick={handleDaifugoExtraDiscard}
              >
                {mustDiscardDrawnForReachDaifugo ? "引いたカードを捨てる" : "効果で捨てる"}
              </button>
            </div>
          )}

          {isSevenExchange && sevenSelectionPlayer && (
            <div className="daifugo-effect-panel seven-exchange-panel">
              <strong>{sevenSelectionPlayer.name}：相手に渡すカードを手札から1枚選んでください。</strong>
              <span className="hint">カードをクリックして選択、もう一度クリックするかボタンで確定します。</span>
              <button
                type="button"
                className="primary-button"
                disabled={!selectedDiscardId || isAnimating || cpuActionInProgress}
                onClick={handleSevenExchangeConfirm}
              >
                このカードを渡す
              </button>
            </div>
          )}

          {isQueenSelect && pendingDaifugoEffect.playerIndex === state.currentPlayerIndex && !currentPlayer.isCpu && (
            <div className="daifugo-effect-panel queen-effect-panel">
              <strong>Qの効果：消す数字を選んでください。</strong>
              <div className="rank-choice-grid">
                {queenRankOptions.map((rank) => (
                  <button
                    type="button"
                    className="rank-choice-button"
                    key={rank}
                    disabled={isAnimating || cpuActionInProgress}
                    onClick={() => dispatch({ type: "selectQueenVanishRank", rank })}
                  >
                    {formatRankLabel(rank)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isQueenWinConfirm && pendingDaifugoEffect.playerIndex === state.currentPlayerIndex && !currentPlayer.isCpu && (
            <div className="daifugo-effect-panel">
              <strong>Qの効果で上がれます。上がりますか？</strong>
              <div className="daifugo-effect-actions">
                <button type="button" className="primary-button" disabled={isAnimating || cpuActionInProgress} onClick={() => dispatch({ type: "answerQueenWin", takeWin: true })}>
                  はい
                </button>
                <button type="button" disabled={isAnimating || cpuActionInProgress} onClick={() => dispatch({ type: "answerQueenWin", takeWin: false })}>
                  いいえ
                </button>
              </div>
            </div>
          )}

          {state.phase === "draw" && !pendingDaifugoEffect && (
            <>
              <button
                type="button"
                className="primary-button"
                disabled={state.deck.length === 0 || controlsDisabled}
                onClick={handleDrawFromDeck}
              >
                山札から引く
              </button>
              {discardSources.map((ownerIndex) => {
                const callOptions = getCallOptionsForSource(state, ownerIndex);
                const sourceDiscard = state.players[ownerIndex].discardPile.at(-1) ?? null;
                return (
                  <div className="discard-source" key={ownerIndex}>
                    <strong>{state.players[ownerIndex].name}の捨て札</strong>
                    {callOptions.map((meld, optionIndex) => (
                      <button
                        type="button"
                        key={meld.map((card) => card.id).join("-")}
                        disabled={controlsDisabled}
                        onClick={() => dispatch({ type: "takeDiscard", ownerIndex, meld })}
                      >
                        {sourceDiscard && isWinningCall(currentPlayer.hand, currentPlayer.openMelds, meld, sourceDiscard) ? "ロン" : "鳴く"}{" "}
                        {optionIndex + 1}: {meld.map(formatCard).join(" ")}
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}

          {state.phase === "discard" && !pendingDaifugoEffect && (
            <>
              {canReachAfterDraw && (
                <button type="button" className="primary-button" disabled={controlsDisabled} onClick={handleDeclareReach}>
                  リーチ
                </button>
              )}
              {currentPlayer.isReach && !state.declaredReachThisTurn && reachOptions.length === 0 && (
                <button type="button" className="primary-button" disabled={controlsDisabled} onClick={handleDiscardDrawnOnly}>
                  引いたカードをそのまま捨てる
                </button>
              )}
              {currentPlayer.isReach && !state.declaredReachThisTurn && reachOptions.length > 0 && (
                <div className="reach-win-options">
                  <strong>上がるために捨てるカード</strong>
                  {reachOptions.map((option) => (
                    <button
                      type="button"
                      className="primary-button"
                      key={option.discardCard.id}
                      disabled={controlsDisabled}
                      onClick={() => handleWinWithDiscard(option.discardCard)}
                    >
                      上がる: {formatCard(option.discardCard)}を捨てる
                    </button>
                  ))}
                </div>
              )}
              {canChooseDiscard && (
                <>
                  <p className="hint">手札のカードを選んでから捨てます。</p>
                  <button type="button" className="primary-button" disabled={!selectedDiscardId || controlsDisabled} onClick={handleDiscardSelected}>
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
            cards={handPlayer.hand}
            drawnCardId={handDrawnCardId}
            selectedCardId={selectedDiscardId}
            discardingCardId={discardingCardId}
            selectableCardIds={isSevenHandSelection ? sevenSelectionCandidateIds : null}
            disabled={
              isSevenHandSelection
                ? isAnimating || cpuActionInProgress
                : handPlayerIndex !== state.currentPlayerIndex ||
                  state.phase !== "discard" ||
                  (!isDaifugoExtraDiscard && !canChooseDiscard) ||
                  mustDiscardDrawnForReachDaifugo ||
                  (isDaifugoExtraDiscard ? isAnimating || isCpuTurn || cpuActionInProgress : controlsDisabled)
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

function PlayerHistoryPopover({ player, showMelds }: PlayerHistoryPopoverProps) {
  return (
    <section className={`player-history-popover ${showMelds ? "with-melds" : "discard-only"}`} role="tooltip">
      <div className="history-column">
        <h3>過去の捨て札</h3>
        {player.discardPile.length === 0 ? (
          <p className="history-empty">まだ捨てていません</p>
        ) : (
          <div className="history-card-grid" aria-label={`${player.name}の過去の捨て札`}>
            {player.discardPile.map((card) => (
              <PlayingCard card={card} compact key={card.id} />
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
            <div className="history-meld-list" aria-label={`${player.name}の鳴いた役`}>
              {player.openMelds.map((meld, index) => (
                <div className="history-meld-row" key={`${player.id}-meld-${index}-${meld.map((card) => card.id).join("-")}`}>
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

function getSeat(playerCount: number, index: number): "top" | "right" | "bottom" | "left" {
  const seats: Record<number, Array<"top" | "right" | "bottom" | "left">> = {
    3: ["bottom", "right", "left"],
    4: ["top", "right", "bottom", "left"],
    5: ["top", "right", "right", "bottom", "left"],
  };
  return seats[playerCount]?.[index] ?? "bottom";
}

function getAreaName(seat: "top" | "right" | "bottom" | "left"): "self" | "left" | "right" | "top" {
  return seat === "bottom" ? "self" : seat;
}

function getSeatStyle(playerCount: number, index: number): CSSProperties {
  const positions = seatPositions[playerCount] ?? seatPositions[4];
  const position = positions[index] ?? positions[0];
  return {
    left: position.left,
    top: position.top,
  };
}

function getHistoryAnchorStyle(playerCount: number, index: number): CSSProperties {
  const exact = historyAnchorPositions[playerCount]?.[index];
  if (exact) return exact;
  return getSeatStyle(playerCount, index);
}

function getPlayerStatus(player: GameState["players"][number]) {
  if (player.isReach) return "リーチ中";
  if (player.hasCalled) return "鳴き済み";
  return "通常";
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
    labels.set(index, `${player.name}:${label}${(counts.get(label) ?? 0) > 1 ? nextSeen : ""}`);
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

function isWinningCall(hand: Card[], openMelds: Card[][], meld: Card[], discard: Card) {
  const usedHandIds = new Set(meld.filter((card) => card.id !== discard.id).map((card) => card.id));
  const handAfterCall = hand.filter((card) => !usedHandIds.has(card.id));
  return checkWinningHandWithOpenMelds(handAfterCall, [...openMelds, meld]).canWin;
}

function formatRankLabel(rank: number) {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

function getRonRemainingCards(hand: Card[], ronCard: Card | null, melds: Card[][]) {
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

function getActionText(state: GameState) {
  if (state.pendingDaifugoEffect?.kind === "sevenExchange") return state.message;
  if (state.pendingDaifugoEffect?.kind === "queenSelect") return "Qの効果で消す数字を選んでいます。";
  if (state.pendingDaifugoEffect?.kind === "queenWinConfirm") return "Qの効果後の上がりを確認しています。";
  if (state.pendingDaifugoEffect?.kind === "confirm") return getDaifugoEffectText(state.pendingDaifugoEffect.effect);
  if (state.pendingDaifugoEffect?.kind === "extraDiscard") {
    return state.pendingDaifugoEffect.effect === "eightExtraTurn"
      ? "8の効果で追加行動中です。"
      : "10の効果で追加の捨て札を選んでいます。";
  }
  if (state.pendingDaifugoEffect?.kind === "effectDraw") {
    return state.pendingDaifugoEffect.effect === "eightExtraTurn" ? "8の効果で山札から引いています。" : "10の効果で山札から引いています。";
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer?.isCpu) {
    if (state.phase === "draw") return `${currentPlayer.name}（CPU）が引くカードを選んでいます。`;
    if (state.phase === "discard") return `${currentPlayer.name}（CPU）が捨てるカードを選んでいます。`;
    if (state.phase === "reachConfirm") return `${currentPlayer.name}（CPU）がリーチを確認しています。`;
    if (state.phase === "ronCheck") return `${currentPlayer.name}（CPU）がロンを確認しています。`;
  }

  if (state.phase === "draw") return "山札または直前の捨て札から1枚取ってください。";
  if (state.phase === "discard") return "手札から1枚選んで捨ててください。";
  if (state.phase === "reachConfirm") return "リーチ宣言を確認してください。";
  if (state.phase === "ronCheck") return "ロン可能な捨て札を確認しています。";
  if (state.phase === "handoff") return "次のプレイヤーへ交代してください。";
  if (state.drawnCard) return `引いたカード: ${formatCard(state.drawnCard)}`;
  return state.message;
}

function getDaifugoEffectText(effect: NonNullable<GameState["pendingDaifugoEffect"]>["effect"]) {
  if (effect === "sevenExchange") return "7の効果：次のプレイヤーとカードを1枚交換しますか？";
  if (effect === "queenNumberVanish") return "Qの効果：指定した数字を手札と山札から消しますか？";
  if (effect === "fiveSkip") return "5の効果：次のプレイヤーをスキップしますか？";
  if (effect === "eightExtraTurn") return "8の効果：追加ターンを行い、Jバックを解除しますか？";
  if (effect === "nineReverse") return "9の効果：手番方向を逆にしますか？";
  if (effect === "tenSwapDraw") return "10の効果：追加で1枚捨てて山札から1枚引きますか？";
  if (effect === "jackBack") return "Jの効果：Jバックを発動/解除しますか？";
  return "カード効果を発動しますか？";
}

function getAnimationLabel(phase: AnimationPhase) {
  if (phase === "drawingFromDeck") return "山札からドロー";
  if (phase === "revealingDrawnCard") return "引いたカード";
  if (phase === "movingDrawnCardToHand") return "手札へ";
  if (phase === "discardingCard") return "捨て札へ";
  return "";
}
