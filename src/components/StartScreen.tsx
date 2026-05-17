import { useEffect, useState } from "react";
import type { Direction, MatchMode } from "../types";

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
}

interface StartScreenProps {
  onStart: (playerCount: number, direction: Direction, matchMode: MatchMode, ruleValue: number, roomSettings: RoomCreateSettings) => void;
  onBackHome: () => void;
  onCancel?: () => void;
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

export default function StartScreen({ onStart, onBackHome, onCancel = onBackHome }: StartScreenProps) {
  const [roomName, setRoomName] = useState("");
  const [playerCount, setPlayerCount] = useState<RoomTotalPlayers>(4);
  const [humanPlayerCount, setHumanPlayerCount] = useState(4);
  const [visibility, setVisibility] = useState<RoomVisibility>("private");
  const [matchType, setMatchType] = useState<MatchRuleType>("fixedRounds");
  const [ruleValues, setRuleValues] = useState<Record<MatchRuleType, string>>({
    fixedRounds: String(MATCH_RULE_SETTINGS.fixedRounds.defaultValue),
    targetScore: String(MATCH_RULE_SETTINGS.targetScore.defaultValue),
    startingPoints: String(MATCH_RULE_SETTINGS.startingPoints.defaultValue),
  });
  const activeRule = MATCH_RULE_SETTINGS[matchType];
  const activeValue = ruleValues[matchType];
  const settingsError = getSettingsError(matchType, activeValue);
  const cpuPlayerCount = playerCount - humanPlayerCount;
  const canSelectPublic = humanPlayerCount >= 2;

  useEffect(() => {
    if (!canSelectPublic && visibility === "public") {
      setVisibility("private");
    }
  }, [canSelectPublic, visibility]);

  function updateRuleValue(value: string) {
    setRuleValues((current) => ({ ...current, [matchType]: value }));
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
    };
  }

  function handleCreateRoom() {
    const matchMode = getMatchMode(matchType);
    onStart(playerCount, DEFAULT_DIRECTION, matchMode, Number(activeValue), buildRoomSettings());
  }

  function toggleVisibility() {
    if (!canSelectPublic) return;
    setVisibility((current) => (current === "public" ? "private" : "public"));
  }

  return (
    <main className="screen start-screen">
      <section className="start-panel">
        <h1>ルーム作成</h1>

        <div className="room-top-row">
          <div className="field room-name-field">
            <label>
              <span>ルーム名</span>
              <input placeholder="例: 初心者歓迎ルーム" value={roomName} onChange={(event) => setRoomName(event.target.value)} />
            </label>
          </div>

          <div className={`field visibility-field ${canSelectPublic ? "" : "is-locked"}`}>
            <span>公開設定</span>
            <button
              type="button"
              className={`visibility-switch ${visibility === "public" ? "is-public" : "is-private"}`}
              role="switch"
              aria-checked={visibility === "public"}
              disabled={!canSelectPublic}
              onClick={toggleVisibility}
              title={!canSelectPublic ? "参加枠がないため、Publicは選択できません" : undefined}
            >
              <span className="visibility-switch-track" aria-hidden="true">
                <span className="visibility-switch-knob" />
              </span>
              <span className="visibility-switch-label">{visibility === "public" ? "Public" : "Private"}</span>
            </button>
            {!canSelectPublic && <small>参加枠がないためPrivate固定です</small>}
          </div>
        </div>

        <div className="field">
          <span>プレイヤー人数</span>
          <div className="segmented">
            {[3, 4, 5].map((count) => (
              <button
                key={count}
                type="button"
                className={playerCount === count ? "selected" : ""}
                onClick={() => updatePlayerCount(count as RoomTotalPlayers)}
              >
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
                  className={humanPlayerCount === humanCount ? "selected" : ""}
                  onClick={() => setHumanPlayerCount(humanCount)}
                  key={humanCount}
                >
                  Player {humanCount}人{cpuCount > 0 ? ` + CPU ${cpuCount}体` : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <span>試合形式</span>
          <div className="match-type-grid">
            {(Object.keys(MATCH_RULE_SETTINGS) as MatchRuleType[]).map((ruleType) => {
              const rule = MATCH_RULE_SETTINGS[ruleType];
              return (
                <button
                  type="button"
                  className={matchType === ruleType ? "selected" : ""}
                  onClick={() => setMatchType(ruleType)}
                  key={ruleType}
                >
                  <strong>{rule.label}</strong>
                  <small>{rule.description}</small>
                </button>
              );
            })}
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
            <div className="room-presets" aria-label={`${activeRule.inputLabel}のプリセット`}>
              {activeRule.presets.map((preset) => (
                <button type="button" key={preset} onClick={() => updateRuleValue(String(preset))}>
                  {matchType === "fixedRounds" ? `${preset}回` : preset}
                </button>
              ))}
            </div>
          </div>
          {settingsError && <p className="room-error">{settingsError}</p>}
        </div>

        <div className="room-actions">
          <button
            type="button"
            className="primary-button"
            disabled={Boolean(settingsError)}
            onClick={handleCreateRoom}
          >
            作成
          </button>
          <button type="button" className="secondary-button" onClick={onCancel}>
            キャンセル
          </button>
          <button type="button" onClick={onBackHome}>
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
  if (!Number.isInteger(numberValue) || numberValue < rule.min || numberValue > rule.max || numberValue % rule.step !== 0) {
    return rule.errorMessage;
  }
  return "";
}

export function getMatchMode(matchType: MatchRuleType): MatchMode {
  return matchType === "fixedRounds" ? "rounds" : matchType;
}

export function buildHumanPlayerOptions(totalPlayers: RoomTotalPlayers) {
  return Array.from({ length: totalPlayers }, (_, index) => totalPlayers - index);
}
