import { useState } from "react";
import type { CpuModelId } from "../types";
import { DEFAULT_CPU_MODEL_ID, cpuModelDisplayNames } from "../game/cpuModelRegistry";

interface SettingsScreenProps {
  onBackHome: () => void;
}

const languages = [
  "日本語",
  "English",
  "中文",
  "Français",
  "Español",
  "한국어",
];

const notificationItems = [
  "ルームに招待",
  "ホストがルーム削除",
  "15分の自動経過によるルーム追放",
  "運営からのお知らせ",
];

type NotificationChannel = "game" | "mobile";

type NotificationSettings = Record<
  string,
  Record<NotificationChannel, boolean>
>;

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

export default function SettingsScreen({ onBackHome }: SettingsScreenProps) {
  const [cpuModelId, setCpuModelId] = useState<CpuModelId>(DEFAULT_CPU_MODEL_ID);
  const [bgmVolume, setBgmVolume] = useState(70);
  const [seVolume, setSeVolume] = useState(() => {
    const stored = localStorage.getItem("mahjong-settings-se-volume");
    const parsed = stored === null ? NaN : Number(stored);
    return Number.isFinite(parsed) ? parsed : 70;
  });
  const [animatedCheckId, setAnimatedCheckId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>(() =>
    Object.fromEntries(
      notificationItems.map((item) => [
        item,
        {
          game: true,
          mobile: true,
        },
      ]),
    ) as NotificationSettings,
  );

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

  function toggleNotification(item: string, channel: NotificationChannel) {
    setNotifications((current) => ({
      ...current,
      [item]: {
        ...current[item],
        [channel]: !current[item][channel],
      },
    }));
  }

  return (
    <main className="screen start-screen settings-screen">
      <section className="start-panel settings-panel">
        <h1>設定</h1>

        <div className="room-create-scroll-body settings-scroll-body">
          <div className="settings-grid">
            <div className="field settings-number-field">
              <label>
                <span>BGM音量</span>
                <div className="settings-volume-control">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={bgmVolume}
                    onChange={(event) => setBgmVolume(Number(event.target.value))}
                    aria-label="BGM音量"
                  />
                  <output>{bgmVolume}</output>
                </div>
              </label>
            </div>

            <div className="field settings-number-field">
              <label>
                <span>SE音量</span>
                <div className="settings-volume-control">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={seVolume}
                    onChange={(event) => {
                      const nextVolume = Number(event.target.value);
                      setSeVolume(nextVolume);
                      localStorage.setItem("mahjong-settings-se-volume", String(nextVolume));
                    }}
                    aria-label="SE音量"
                  />
                  <output>{seVolume}</output>
                </div>
              </label>
            </div>
          </div>

          <div className="field">
            <span>代替CPU設定</span>
            <div className="cpu-model-options settings-cpu-options">
              {(Object.keys(cpuModelDisplayNames) as CpuModelId[]).map(
                (modelId) => (
                  <button
                    type="button"
                    className={getCheckClass(
                      cpuModelId === modelId,
                      `settings-cpu-${modelId}`,
                    )}
                    aria-pressed={cpuModelId === modelId}
                    key={modelId}
                    onClick={() => {
                      animateCheck(`settings-cpu-${modelId}`);
                      setCpuModelId(modelId);
                    }}
                  >
                    <ContractCheckBox />
                    {cpuModelDisplayNames[modelId]}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="field settings-language-field">
            <label>
              <span>言語設定</span>
              <select className="settings-select" defaultValue="日本語">
                {languages.map((language) => (
                  <option value={language} key={language}>
                    {language}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field settings-notification-field">
            <span>通知設定</span>
            <div className="settings-notification-grid">
              <div className="settings-notification-row settings-notification-header">
                <span aria-hidden="true" />
                <strong className="settings-notification-game-heading">
                  ゲーム内
                </strong>
                <strong className="settings-notification-mobile-heading">
                  スマホ画面
                </strong>
              </div>
              {notificationItems.map((item) => (
                <div className="settings-notification-row" key={item}>
                  <strong>{item}</strong>
                  <button
                    type="button"
                    className={`settings-toggle ${
                      notifications[item].game ? "is-on" : "is-off"
                    }`}
                    role="switch"
                    aria-checked={notifications[item].game}
                    onClick={() => toggleNotification(item, "game")}
                  >
                    <span>{notifications[item].game ? "ON" : "OFF"}</span>
                  </button>
                  <button
                    type="button"
                    className={`settings-toggle ${
                      notifications[item].mobile ? "is-on" : "is-off"
                    }`}
                    role="switch"
                    aria-checked={notifications[item].mobile}
                    onClick={() => toggleNotification(item, "mobile")}
                  >
                    <span>{notifications[item].mobile ? "ON" : "OFF"}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="settings-grid">
            <div className="field settings-contact-field">
              <label>
                <span>メールアドレス設定</span>
                <input type="email" placeholder="example@example.com" />
              </label>
            </div>

            <div className="field settings-contact-field">
              <label>
                <span>電話番号設定</span>
                <input type="tel" placeholder="090-0000-0000" />
              </label>
            </div>
          </div>
        </div>

        <div className="room-actions settings-actions">
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
