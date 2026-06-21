import { useEffect, useState } from "react";
import type {
  CpuModelId,
  DaifugoOptions,
  Direction,
  MatchMode,
} from "../types";
import {
  DEFAULT_CPU_MODEL_ID,
  cpuModelDisplayNames,
  cpuModels,
} from "../game/cpuModelRegistry";

export type RoomVisibility = "private" | "public";
export type RoomTotalPlayers = 3 | 4 | 5;

export interface RoomCreateSettings {
  roomName: string;
  totalPlayers: RoomTotalPlayers;
  humanPlayers: number;
  cpuPlayers: number;
  matchType: MatchMode;
  visibility: RoomVisibility;
  roundCount?: number;
  targetScore?: number;
  initialPoints?: number;
  turnDirection: Direction;
  cpuModelId: CpuModelId;
  cpuModelIds: CpuModelId[];
  showCpuActions: boolean;
  allowMidGameJoin: boolean;
  daifugoOptions: DaifugoOptions;
}

interface StartScreenProps {
  onStart: (
    playerCount: number,
    direction: Direction,
    matchMode: MatchMode,
    ruleValue: number,
    roomSettings: RoomCreateSettings,
  ) => void;
  onBackHome: () => void;
  onCancel?: () => void;
  error?: string | null;
}

export type MatchRuleType = "fixedRounds" | "targetScore" | "startingPoints";

export const MATCH_RULE_SETTINGS: Record<
  MatchRuleType,
  {
    label: string;
    description: string;
    inputLabel: string;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    presets: number[];
    errorMessage: string;
  }
> = {
  fixedRounds: {
    label: "局数制",
    description: "決めた回数で勝負",
    inputLabel: "対戦回数",
    min: 1,
    max: 100,
    step: 1,
    defaultValue: 10,
    presets: [3, 5, 10, 20],
    errorMessage: "対戦回数は1〜100の整数で入力してください。",
  },
  targetScore: {
    label: "目標点制",
    description: "先に届いたら決着",
    inputLabel: "目標点",
    min: 50,
    max: 10000,
    step: 50,
    defaultValue: 1000,
    presets: [500, 1000, 3000, 5000],
    errorMessage: "目標点は50〜10000の整数で入力してください。",
  },
  startingPoints: {
    label: "持ち点制",
    description: "持ち点が尽きたら終了",
    inputLabel: "初期持ち点",
    min: 50,
    max: 10000,
    step: 50,
    defaultValue: 1000,
    presets: [500, 1000, 3000, 5000],
    errorMessage: "初期持ち点は50〜10000の整数で入力してください。",
  },
};

const DEFAULT_DIRECTION: Direction = "clockwise";
const DEFAULT_DAIFUGO_OPTIONS: DaifugoOptions = {
  enabled: false,
  effects: {
    fiveSkip: true,
    sevenExchange: false,
    eightExtraTurn: true,
    nineReverse: true,
    tenSwapDraw: true,
    jackBack: true,
    queenNumberVanish: false,
  },
};

const DAIFUGO_EFFECT_LABELS: Array<{
  key: keyof DaifugoOptions["effects"];
  shortLabel: string;
  label: string;
  disabled?: boolean;
  note?: string;
}> = [
  { key: "fiveSkip", shortLabel: "5", label: "スキップ" },
  { key: "sevenExchange", shortLabel: "7", label: "カード交換" },
  { key: "eightExtraTurn", shortLabel: "8", label: "追加ターン" },
  { key: "nineReverse", shortLabel: "9", label: "逆回り" },
  { key: "tenSwapDraw", shortLabel: "10", label: "捨てて引く" },
  { key: "jackBack", shortLabel: "J", label: "Jシールド" },
  { key: "queenNumberVanish", shortLabel: "Q", label: "数字全消去" },
];

function ContractCheckBox() {
  return (
    <span className="contract-check-box" aria-hidden="true">
      <svg className="contract-check-svg" viewBox="0 0 36 30">
        <path
          className="contract-check-stroke contract-check-stroke-short"
          d="M4 16 L13 24"
          pathLength="1"
        />
        <path
          className="contract-check-stroke contract-check-stroke-long"
          d="M13 24 L33 5"
          pathLength="1"
        />
      </svg>
    </span>
  );
}

export default function StartScreen({
  onStart,
  onBackHome,
  onCancel = onBackHome,
  error,
}: StartScreenProps) {
  const [roomName, setRoomName] = useState("");
  const [playerCount, setPlayerCount] = useState<RoomTotalPlayers>(4);
  const [humanPlayerCount, setHumanPlayerCount] = useState(4);
  const [visibility, setVisibility] = useState<RoomVisibility>("private");
  const [allowMidGameJoin, setAllowMidGameJoin] = useState(false);
  const [cpuModelIds, setCpuModelIds] = useState<CpuModelId[]>([
    DEFAULT_CPU_MODEL_ID,
    DEFAULT_CPU_MODEL_ID,
    DEFAULT_CPU_MODEL_ID,
    DEFAULT_CPU_MODEL_ID,
  ]);
  const [daifugoOptions, setDaifugoOptions] = useState<DaifugoOptions>(
    DEFAULT_DAIFUGO_OPTIONS,
  );
  const [matchType, setMatchType] = useState<MatchRuleType>("fixedRounds");
  const [ruleValues, setRuleValues] = useState<Record<MatchRuleType, string>>({
    fixedRounds: String(MATCH_RULE_SETTINGS.fixedRounds.defaultValue),
    targetScore: String(MATCH_RULE_SETTINGS.targetScore.defaultValue),
    startingPoints: String(MATCH_RULE_SETTINGS.startingPoints.defaultValue),
  });
  const [animatedCheckId, setAnimatedCheckId] = useState<string | null>(null);
  const activeRule = MATCH_RULE_SETTINGS[matchType];
  const activeValue = ruleValues[matchType];
  const settingsError = getSettingsError(matchType, activeValue);
  const cpuPlayerCount = playerCount - humanPlayerCount;
  const cpuModelId = cpuModelIds[0] ?? DEFAULT_CPU_MODEL_ID;
  const canSelectPublic = humanPlayerCount >= 2;
  const canAllowMidGameJoin = !(humanPlayerCount === 1 && cpuPlayerCount > 0);
  useEffect(() => {
    if (!canSelectPublic && visibility === "public") {
      setVisibility("private");
    }
  }, [canSelectPublic, visibility]);

  useEffect(() => {
    if (!canAllowMidGameJoin && allowMidGameJoin) {
      setAllowMidGameJoin(false);
    }
  }, [allowMidGameJoin, canAllowMidGameJoin]);

  function updateRuleValue(value: string) {
    setRuleValues((current) => ({ ...current, [matchType]: value }));
  }

  function getCheckClass(isSelected: boolean, id: string) {
    return [
      isSelected ? "selected" : "",
      animatedCheckId === id ? "is-check-animated" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function animateCheck(id: string) {
    setAnimatedCheckId(id);
  }

  function updatePlayerCount(count: RoomTotalPlayers) {
    setPlayerCount(count);
    setHumanPlayerCount(count);
  }

  function buildRoomSettings(): RoomCreateSettings {
    const matchMode = getMatchMode(matchType);
    const ruleNumber = Number(activeValue);
    return {
      roomName: roomName.trim() || "名無しのルーム",
      totalPlayers: playerCount,
      humanPlayers: humanPlayerCount,
      cpuPlayers: cpuPlayerCount,
      matchType: matchMode,
      visibility: canSelectPublic ? visibility : "private",
      roundCount: matchMode === "rounds" ? ruleNumber : undefined,
      targetScore: matchMode === "targetScore" ? ruleNumber : undefined,
      initialPoints: matchMode === "startingPoints" ? ruleNumber : undefined,
      turnDirection: DEFAULT_DIRECTION,
      cpuModelId: cpuModelIds[0] ?? DEFAULT_CPU_MODEL_ID,
      cpuModelIds: cpuModelIds.slice(0, cpuPlayerCount),
      showCpuActions: true,
      allowMidGameJoin: canAllowMidGameJoin ? allowMidGameJoin : false,
      daifugoOptions,
    };
  }

  function toggleDaifugoEnabled() {
    setDaifugoOptions((current) => ({ ...current, enabled: !current.enabled }));
  }

  function toggleDaifugoEffect(effect: keyof DaifugoOptions["effects"]) {
    setDaifugoOptions((current) => ({
      ...current,
      effects: {
        ...current.effects,
        [effect]: !current.effects[effect],
      },
    }));
  }

  function handleCreateRoom() {
    const matchMode = getMatchMode(matchType);
    onStart(
      playerCount,
      DEFAULT_DIRECTION,
      matchMode,
      Number(activeValue),
      buildRoomSettings(),
    );
  }

  function toggleVisibility() {
    if (!canSelectPublic) return;
    setVisibility((current) => (current === "public" ? "private" : "public"));
  }

  function toggleMidGameJoin() {
    if (!canAllowMidGameJoin) return;
    setAllowMidGameJoin((current) => !current);
  }

  function updateCpuModel(cpuIndex: number, modelId: CpuModelId) {
    setCpuModelIds((current) =>
      current.map((item, index) => (index === cpuIndex ? modelId : item)),
    );
  }

  function setCpuModelId(modelId: CpuModelId) {
    setCpuModelIds((current) => current.map(() => modelId));
  }

  return (
    <main className="screen start-screen">
      <section className="start-panel">
        <h1>ルーム作成</h1>

        <div className="room-create-scroll-body">
        <div className="room-top-row">
          <div className="field room-name-field">
            <label>
              <span>ルーム名</span>
              <input
                data-testid="room-name-input"
                placeholder="例: 初心者歓迎ルーム"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
              />
            </label>
          </div>

          <div className="room-top-toggles">
            <div
              className={`field visibility-field ${canSelectPublic ? "" : "is-locked"}`}
            >
              <span>公開設定</span>
              <button
                type="button"
                className={`visibility-switch ${visibility === "public" ? "is-public" : "is-private"} ${
                  animatedCheckId === "visibility" ? "is-check-animated" : ""
                }`}
                role="switch"
                aria-checked={visibility === "public"}
                disabled={!canSelectPublic}
                onClick={() => {
                  animateCheck("visibility");
                  toggleVisibility();
                }}
                title={
                  !canSelectPublic
                    ? "参加枠がないため、Publicは選択できません"
                    : undefined
                }
              >
                <ContractCheckBox />
                <span className="visibility-switch-track" aria-hidden="true">
                  <span className="visibility-switch-knob" />
                </span>
                <span className="visibility-switch-label">
                  {visibility === "public" ? "Public" : "Private"}
                </span>
              </button>
              {!canSelectPublic && <small>参加枠がないためPrivate固定です</small>}
            </div>

            <div
              className={`field mid-game-join-field ${canAllowMidGameJoin ? "" : "is-locked"}`}
            >
              <span>途中参加を許可</span>
              <button
                type="button"
                className={`visibility-switch ${allowMidGameJoin ? "is-public" : "is-private"} ${
                  animatedCheckId === "mid-game-join" ? "is-check-animated" : ""
                }`}
                role="switch"
                aria-checked={allowMidGameJoin}
                disabled={!canAllowMidGameJoin}
                onClick={() => {
                  animateCheck("mid-game-join");
                  toggleMidGameJoin();
                }}
                title={
                  !canAllowMidGameJoin
                    ? "Player1人 + CPUのみの構成では途中参加を許可できません"
                    : undefined
                }
              >
                <ContractCheckBox />
                <span className="visibility-switch-track" aria-hidden="true">
                  <span className="visibility-switch-knob" />
                </span>
                <span className="visibility-switch-label">
                  {allowMidGameJoin ? "ON" : "OFF"}
                </span>
              </button>
              {!canAllowMidGameJoin && (
                <small>Player1人 + CPUのみの構成では設定できません</small>
              )}
            </div>
          </div>
        </div>

        <div className="field">
          <span>プレイヤー人数</span>
          <div className="segmented">
            {[3, 4, 5].map((count) => (
              <button
                key={count}
                type="button"
                className={getCheckClass(
                  playerCount === count,
                  `player-count-${count}`,
                )}
                aria-pressed={playerCount === count}
                onClick={() => {
                  animateCheck(`player-count-${count}`);
                  updatePlayerCount(count as RoomTotalPlayers);
                }}
              >
                <ContractCheckBox />
                {count}人
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>参加内訳</span>
          <div className="composition-grid">
            {buildHumanPlayerOptions(playerCount).map((humanCount) => {
              const cpuCount = playerCount - humanCount;
              return (
                <button
                  type="button"
                  className={getCheckClass(
                    humanPlayerCount === humanCount,
                    `human-count-${humanCount}`,
                  )}
                  aria-pressed={humanPlayerCount === humanCount}
                  disabled={false}
                  onClick={() => {
                    animateCheck(`human-count-${humanCount}`);
                    setHumanPlayerCount(humanCount);
                  }}
                  key={humanCount}
                >
                  <ContractCheckBox />
                  Player {humanCount}人
                  {cpuCount > 0 ? ` + CPU ${cpuCount}体` : ""}
                </button>
              );
            })}
          </div>
        </div>

        {cpuPlayerCount > 0 && (
          <div className="field cpu-model-field">
            <span>CPU設定</span>
            <div className="cpu-model-grid">
              {Array.from({ length: cpuPlayerCount }, (_, cpuIndex) => (
                <div className="cpu-model-row" key={`cpu-${cpuIndex}`}>
                  <strong>プレイヤー{humanPlayerCount + cpuIndex + 1}</strong>
                  <div className="cpu-model-options">
                    {(Object.keys(cpuModelDisplayNames) as CpuModelId[]).map(
                      (modelId) => (
                        <button
                          type="button"
                          className={getCheckClass(
                            cpuModelIds[cpuIndex] === modelId,
                            `cpu-${cpuIndex}-${modelId}`,
                          )}
                          aria-pressed={cpuModelIds[cpuIndex] === modelId}
                          onClick={() => {
                            animateCheck(`cpu-${cpuIndex}-${modelId}`);
                            updateCpuModel(cpuIndex, modelId);
                          }}
                          key={modelId}
                        >
                          <ContractCheckBox />
                          {cpuModelDisplayNames[modelId]}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {false && import.meta.env.DEV && cpuPlayerCount > 0 && (
          <div className="field cpu-model-dev-field">
            <span>DEV CPUモデル</span>
            <div className="segmented">
              {(Object.keys(cpuModels) as CpuModelId[]).map((modelId) => (
                <button
                  type="button"
                  className={getCheckClass(
                    cpuModelId === modelId,
                    `cpu-dev-${modelId}`,
                  )}
                  aria-pressed={cpuModelId === modelId}
                  onClick={() => {
                    animateCheck(`cpu-dev-${modelId}`);
                    setCpuModelId(modelId);
                  }}
                  key={modelId}
                >
                  <ContractCheckBox />
                  {cpuModels[modelId].name.replace(" CPU", "")}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span>試合形式</span>
          <div className="match-type-grid">
            {(Object.keys(MATCH_RULE_SETTINGS) as MatchRuleType[]).map(
              (ruleType) => {
                const rule = MATCH_RULE_SETTINGS[ruleType];
                return (
                  <button
                    type="button"
                    className={getCheckClass(
                      matchType === ruleType,
                      `match-type-${ruleType}`,
                    )}
                    aria-pressed={matchType === ruleType}
                    onClick={() => {
                      animateCheck(`match-type-${ruleType}`);
                      setMatchType(ruleType);
                    }}
                    key={ruleType}
                  >
                    <ContractCheckBox />
                    <strong>{rule.label}</strong>
                    <small>{rule.description}</small>
                  </button>
                );
              },
            )}
          </div>
        </div>

        <div className="room-settings">
          <label>
            <span>{activeRule.inputLabel}</span>
            <input
              type="number"
              min={activeRule.min}
              max={activeRule.max}
              step={activeRule.step}
              value={activeValue}
              onChange={(event) => updateRuleValue(event.target.value)}
            />
          </label>
          <div className="room-preset-group">
            <span>よく使う設定</span>
            <div
              className="room-presets"
              aria-label={`${activeRule.inputLabel}のプリセット`}
            >
              {activeRule.presets.map((preset) => (
                <button
                  type="button"
                  className={getCheckClass(
                    String(preset) === activeValue,
                    `preset-${matchType}-${preset}`,
                  )}
                  aria-pressed={String(preset) === activeValue}
                  key={preset}
                  onClick={() => {
                    animateCheck(`preset-${matchType}-${preset}`);
                    updateRuleValue(String(preset));
                  }}
                >
                  <ContractCheckBox />
                  {matchType === "fixedRounds" ? `${preset}回` : preset}
                </button>
              ))}
            </div>
          </div>
          {settingsError && <p className="room-error">{settingsError}</p>}
          {error && (
            <p className="room-error" data-testid="room-create-error">
              {error}
            </p>
          )}
        </div>

        <div
          className={`field daifugo-options ${daifugoOptions.enabled ? "is-enabled" : "is-disabled"}`}
        >
          <div className="daifugo-options-head">
            <span>大富豪ルール</span>
            <button
              type="button"
              className={`visibility-switch ${daifugoOptions.enabled ? "is-public" : "is-private"} ${
                animatedCheckId === "daifugo-enabled" ? "is-check-animated" : ""
              }`}
              aria-pressed={daifugoOptions.enabled}
              onClick={() => {
                animateCheck("daifugo-enabled");
                toggleDaifugoEnabled();
              }}
            >
              <ContractCheckBox />
              <span className="visibility-switch-track" aria-hidden="true">
                <span className="visibility-switch-knob" />
              </span>
              <span className="visibility-switch-label">
                {daifugoOptions.enabled ? "ON" : "OFF"}
              </span>
            </button>
          </div>

          {daifugoOptions.enabled && (
            <div className="daifugo-effect-grid">
              {DAIFUGO_EFFECT_LABELS.map((effect) => (
                <button
                  type="button"
                  className={`daifugo-effect-toggle ${getCheckClass(
                    daifugoOptions.effects[effect.key],
                    `daifugo-effect-${effect.key}`,
                  )}`}
                  aria-pressed={daifugoOptions.effects[effect.key]}
                  disabled={effect.disabled}
                  onClick={() => {
                    animateCheck(`daifugo-effect-${effect.key}`);
                    toggleDaifugoEffect(effect.key);
                  }}
                  key={effect.key}
                >
                  <ContractCheckBox />
                  <span className="daifugo-effect-copy">
                    <strong>
                      <b>{effect.shortLabel}</b>
                      {effect.label}
                    </strong>
                    {effect.note && <small>{effect.note}</small>}
                  </span>
                  <span className="mini-switch" aria-hidden="true">
                    <span className="mini-switch-knob" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        </div>

        <div className="room-actions">
          <button
            type="button"
            className="primary-button room-create-submit-button"
            data-testid="offline-start-button"
            disabled={Boolean(settingsError)}
            onClick={handleCreateRoom}
          >
            作成
          </button>
          <button
            type="button"
            className="secondary-button room-create-cancel-button"
            onClick={onCancel}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="room-create-home-button"
            onClick={onBackHome}
          >
            ホーム画面に戻る
          </button>
        </div>
      </section>
    </main>
  );
}

export function getSettingsError(matchType: MatchRuleType, value: string) {
  const rule = MATCH_RULE_SETTINGS[matchType];
  if (value.trim() === "") return `${rule.inputLabel}を入力してください。`;
  const numberValue = Number(value);
  if (
    !Number.isInteger(numberValue) ||
    numberValue < rule.min ||
    numberValue > rule.max ||
    numberValue % rule.step !== 0
  ) {
    return rule.errorMessage;
  }
  return "";
}

export function getMatchMode(matchType: MatchRuleType): MatchMode {
  return matchType === "fixedRounds" ? "rounds" : matchType;
}

export function buildHumanPlayerOptions(totalPlayers: RoomTotalPlayers) {
  return Array.from(
    { length: totalPlayers },
    (_, index) => totalPlayers - index,
  );
}
