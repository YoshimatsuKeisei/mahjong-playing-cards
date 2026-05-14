import { useState } from "react";
import type { Direction } from "../types";

interface StartScreenProps {
  onStart: (playerCount: number, direction: Direction) => void;
  onBackHome: () => void;
}

type MatchRuleType = "fixedRounds" | "targetScore" | "startingPoints";

const MATCH_RULE_SETTINGS: Record<
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

export default function StartScreen({ onStart, onBackHome }: StartScreenProps) {
  const [playerCount, setPlayerCount] = useState(4);
  const [direction, setDirection] = useState<Direction>("clockwise");
  const [matchType, setMatchType] = useState<MatchRuleType>("fixedRounds");
  const [ruleValues, setRuleValues] = useState<Record<MatchRuleType, string>>({
    fixedRounds: String(MATCH_RULE_SETTINGS.fixedRounds.defaultValue),
    targetScore: String(MATCH_RULE_SETTINGS.targetScore.defaultValue),
    startingPoints: String(MATCH_RULE_SETTINGS.startingPoints.defaultValue),
  });
  const activeRule = MATCH_RULE_SETTINGS[matchType];
  const activeValue = ruleValues[matchType];
  const settingsError = getSettingsError(matchType, activeValue);

  function updateRuleValue(value: string) {
    setRuleValues((current) => ({ ...current, [matchType]: value }));
  }

  return (
    <main className="screen start-screen">
      <section className="start-panel">
        <h1>ルーム作成</h1>

        <div className="field">
          <span>プレイヤー人数</span>
          <div className="segmented">
            {[3, 4, 5].map((count) => (
              <button
                key={count}
                type="button"
                className={playerCount === count ? "selected" : ""}
                onClick={() => setPlayerCount(count)}
              >
                {count}人
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>回転方向</span>
          <div className="segmented">
            <button
              type="button"
              className={direction === "clockwise" ? "selected" : ""}
              onClick={() => setDirection("clockwise")}
            >
              時計回り
            </button>
            <button
              type="button"
              className={direction === "counterclockwise" ? "selected" : ""}
              onClick={() => setDirection("counterclockwise")}
            >
              反時計回り
            </button>
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
          <div className="room-rule-summary">
            <strong>{activeRule.label}</strong>
            <span>{activeRule.description}</span>
          </div>
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
          <button type="button" className="primary-button" disabled={Boolean(settingsError)} onClick={() => onStart(playerCount, direction)}>
            作成
          </button>
          <button type="button" className="secondary-button" onClick={onBackHome}>
            キャンセル
          </button>
        </div>
      </section>
    </main>
  );
}

function getSettingsError(matchType: MatchRuleType, value: string) {
  const rule = MATCH_RULE_SETTINGS[matchType];
  if (value.trim() === "") return `${rule.inputLabel}を入力してください。`;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < rule.min || numberValue > rule.max || numberValue % rule.step !== 0) {
    return rule.errorMessage;
  }
  return "";
}
