import type { ReactNode } from "react";

type CardSuit = "S" | "H" | "D" | "C";

const palette = {
  felt: "#1f5a42",
  feltDeep: "#113829",
  feltSoft: "#2f7456",
  wood: "#75461f",
  woodSoft: "#9b6833",
  paper: "#fffdf7",
  paperWarm: "#f7edd2",
  ink: "#1d211b",
  mutedRed: "#a63a35",
  gold: "#d7ad55",
  tea: "#87652f",
  line: "#4b3a23",
};

function IllustrationSvg({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <svg
      className="manual-illustration"
      role="img"
      aria-label={ariaLabel}
      viewBox="0 0 720 360"
      width="100%"
      height="auto"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="manual-soft-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#1d1309" floodOpacity="0.24" />
        </filter>
        <linearGradient id="manual-card-face" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fffdf7" />
          <stop offset="1" stopColor="#f3ead8" />
        </linearGradient>
        <linearGradient id="manual-gold-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#9d7738" />
          <stop offset="0.5" stopColor="#e2bd67" />
          <stop offset="1" stopColor="#9d7738" />
        </linearGradient>
        <marker id="manual-arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 Z" fill={palette.gold} />
        </marker>
        <marker id="manual-arrow-green" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 Z" fill={palette.feltSoft} />
        </marker>
      </defs>
      {children}
    </svg>
  );
}

function LabelTag({
  x,
  y,
  text,
  width = 96,
  tone = palette.paperWarm,
}: {
  x: number;
  y: number;
  text: string;
  width?: number;
  tone?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-width / 2} y="-17" width={width} height="34" rx="17" fill={tone} stroke={palette.tea} strokeWidth="1.5" />
      <text x="0" y="6" textAnchor="middle" fill={palette.ink} fontSize="15" fontWeight="900">
        {text}
      </text>
    </g>
  );
}

function ThinArrow({
  d,
  color = palette.gold,
  dashed = false,
  marker = "manual-arrow-gold",
}: {
  d: string;
  color?: string;
  dashed?: boolean;
  marker?: "manual-arrow-gold" | "manual-arrow-green";
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? "9 10" : undefined}
      markerEnd={`url(#${marker})`}
    />
  );
}

function MiniCard({
  x,
  y,
  label,
  suit,
  rotate = 0,
  glow = false,
  scale = 1,
}: {
  x: number;
  y: number;
  label: string;
  suit?: CardSuit;
  rotate?: number;
  glow?: boolean;
  scale?: number;
}) {
  const isRed = suit === "H" || suit === "D";
  const suitMark = suit === "H" ? "♥" : suit === "D" ? "♦" : suit === "C" ? "♣" : suit === "S" ? "♠" : "";
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} filter="url(#manual-soft-shadow)">
      {glow && <rect x="-6" y="-6" width="56" height="76" rx="10" fill={palette.gold} opacity="0.28" />}
      <rect width="44" height="62" rx="7" fill="url(#manual-card-face)" stroke={palette.line} strokeWidth="1.7" />
      <text x="9" y="21" fill={isRed ? palette.mutedRed : palette.ink} fontSize="17" fontWeight="900">
        {label}
      </text>
      {suitMark && (
        <text x="22" y="49" textAnchor="middle" fill={isRed ? palette.mutedRed : palette.ink} fontSize="22" fontWeight="900">
          {suitMark}
        </text>
      )}
    </g>
  );
}

function PlayerToken({
  x,
  y,
  label,
  tone = palette.felt,
}: {
  x: number;
  y: number;
  label: string;
  tone?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#manual-soft-shadow)">
      <ellipse cx="0" cy="8" rx="36" ry="12" fill="#1a120c" opacity="0.13" />
      <circle cx="0" cy="0" r="22" fill={tone} stroke={palette.paperWarm} strokeWidth="3" />
      <circle cx="0" cy="-7" r="7" fill={palette.paperWarm} />
      <path d="M -13 13 Q 0 -1 13 13" fill={palette.paperWarm} />
      <rect x="-22" y="27" width="44" height="22" rx="11" fill={palette.paperWarm} stroke={palette.tea} strokeWidth="1.2" />
      <text x="0" y="43" textAnchor="middle" fill={palette.ink} fontSize="13" fontWeight="900">
        {label}
      </text>
    </g>
  );
}

function TableBase() {
  return (
    <g filter="url(#manual-soft-shadow)">
      <ellipse cx="360" cy="184" rx="198" ry="119" fill={palette.wood} />
      <ellipse cx="360" cy="176" rx="178" ry="100" fill={palette.felt} stroke={palette.gold} strokeWidth="4" />
      <ellipse cx="360" cy="176" rx="150" ry="76" fill="none" stroke="#fff4c8" strokeWidth="1.5" opacity="0.24" />
    </g>
  );
}

function DeckStack({ x = 336, y = 142 }: { x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#manual-soft-shadow)">
      <rect x="10" y="10" width="50" height="68" rx="7" fill="#bfb7a3" stroke={palette.line} strokeWidth="1.5" />
      <rect x="5" y="5" width="50" height="68" rx="7" fill="#e8ddc5" stroke={palette.line} strokeWidth="1.5" />
      <rect width="50" height="68" rx="7" fill={palette.feltDeep} stroke={palette.paperWarm} strokeWidth="2" />
      <path d="M 10 16 H 40 M 10 28 H 40 M 10 40 H 40 M 10 52 H 40" stroke={palette.gold} strokeWidth="3" />
      <LabelTag x={25} y={95} text="山札" width={66} />
    </g>
  );
}

function HandFan({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <MiniCard x={-29} y={-9} label="A" suit="S" rotate={-10} scale={0.58} />
      <MiniCard x={-6} y={-12} label="8" suit="H" scale={0.58} />
      <MiniCard x={17} y={-9} label="K" suit="C" rotate={10} scale={0.58} />
    </g>
  );
}

export function TableOverviewIllustration() {
  const players = [
    { x: 360, y: 55, label: "P1", tone: palette.feltSoft },
    { x: 556, y: 141, label: "P2", tone: palette.felt },
    { x: 502, y: 286, label: "P3", tone: palette.woodSoft },
    { x: 218, y: 286, label: "P4", tone: palette.woodSoft },
    { x: 164, y: 141, label: "P5", tone: palette.felt },
  ];
  return (
    <IllustrationSvg ariaLabel="丸テーブルを囲むプレイヤーと山札、手札の図">
      <TableBase />
      <DeckStack />
      {players.map((player) => (
        <g key={player.label}>
          <PlayerToken {...player} />
          <HandFan x={player.x} y={player.y + (player.y < 100 ? 45 : -58)} rotate={player.y < 100 ? 0 : player.x < 360 ? 18 : -18} />
        </g>
      ))}
    </IllustrationSvg>
  );
}

export function TurnOrderIllustration() {
  return (
    <IllustrationSvg ariaLabel="手番順と9リバースの図">
      <TableBase />
      <PlayerToken x={360} y={68} label="1" tone={palette.feltSoft} />
      <PlayerToken x={534} y={180} label="2" />
      <PlayerToken x={360} y={292} label="3" tone={palette.woodSoft} />
      <PlayerToken x={186} y={180} label="4" />
      <path d="M 265 104 A 145 102 0 0 1 505 130 A 145 102 0 0 1 512 230" fill="none" stroke={palette.gold} strokeWidth="5" strokeLinecap="round" markerEnd="url(#manual-arrow-gold)" />
      <path d="M 455 254 A 138 96 0 0 1 215 208 A 138 96 0 0 1 236 125" fill="none" stroke={palette.feltSoft} strokeWidth="4" strokeLinecap="round" strokeDasharray="8 10" markerEnd="url(#manual-arrow-green)" />
      <MiniCard x={338} y={146} label="9" suit="D" glow />
      <LabelTag x={360} y={104} text="通常順" width={78} />
      <LabelTag x={360} y={268} text="9で逆回り" width={112} tone="#eaf1df" />
    </IllustrationSvg>
  );
}

export function MeldExamplesIllustration() {
  return (
    <IllustrationSvg ariaLabel="同数字3枚と同マーク連番の役の例">
      <rect x="72" y="64" width="260" height="230" rx="18" fill="rgba(255, 253, 247, 0.72)" stroke={palette.tea} strokeWidth="2" filter="url(#manual-soft-shadow)" />
      <rect x="388" y="64" width="260" height="230" rx="18" fill="rgba(255, 253, 247, 0.72)" stroke={palette.tea} strokeWidth="2" filter="url(#manual-soft-shadow)" />
      <LabelTag x={202} y={104} text="同数字3枚" width={118} />
      <MiniCard x={126} y={140} label="7" suit="S" glow />
      <MiniCard x={179} y={140} label="7" suit="H" glow />
      <MiniCard x={232} y={140} label="7" suit="C" glow />
      <text x="202" y="246" textAnchor="middle" fill={palette.feltDeep} fontSize="18" fontWeight="900">完成</text>
      <path d="M 157 259 L 183 282 L 247 220" fill="none" stroke={palette.feltSoft} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <LabelTag x={518} y={104} text="同マーク連番" width={128} />
      <MiniCard x={442} y={140} label="3" suit="H" glow />
      <MiniCard x={495} y={140} label="4" suit="H" glow />
      <MiniCard x={548} y={140} label="5" suit="H" glow />
      <text x="518" y="246" textAnchor="middle" fill={palette.feltDeep} fontSize="18" fontWeight="900">完成</text>
      <path d="M 473 259 L 499 282 L 563 220" fill="none" stroke={palette.feltSoft} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </IllustrationSvg>
  );
}

export function CallMeldIllustration() {
  return (
    <IllustrationSvg ariaLabel="捨て札と手札2枚を合わせて鳴く図">
      <LabelTag x={126} y={76} text="① 捨て札" width={96} />
      <MiniCard x={104} y={104} label="5" suit="H" glow />
      <ThinArrow d="M 174 139 C 230 113 269 113 318 134" />
      <LabelTag x={352} y={76} text="② 手札2枚" width={112} />
      <MiniCard x={311} y={104} label="3" suit="H" />
      <MiniCard x={364} y={104} label="4" suit="H" />
      <ThinArrow d="M 431 139 C 482 143 514 168 544 206" />
      <rect x="474" y="210" width="176" height="92" rx="16" fill={palette.felt} stroke={palette.gold} strokeWidth="3" filter="url(#manual-soft-shadow)" />
      <LabelTag x={562} y={198} text="③ 公開役" width={98} />
      <MiniCard x={499} y={226} label="3" suit="H" scale={0.78} />
      <MiniCard x={548} y={226} label="4" suit="H" scale={0.78} />
      <MiniCard x={597} y={226} label="5" suit="H" scale={0.78} />
      <text x="257" y="101" textAnchor="middle" fill={palette.tea} fontSize="17" fontWeight="900">鳴き</text>
    </IllustrationSvg>
  );
}

export function ScoreComparisonIllustration() {
  return (
    <IllustrationSvg ariaLabel="勝者の余り札と敗者の未完成カードを比較する図">
      <rect x="68" y="62" width="250" height="236" rx="18" fill="rgba(255, 253, 247, 0.74)" stroke={palette.tea} strokeWidth="2" filter="url(#manual-soft-shadow)" />
      <rect x="402" y="62" width="250" height="236" rx="18" fill="rgba(255, 253, 247, 0.74)" stroke={palette.tea} strokeWidth="2" filter="url(#manual-soft-shadow)" />
      <LabelTag x={193} y={102} text="勝者" width={76} tone="#eaf1df" />
      <LabelTag x={527} y={102} text="敗者" width={76} tone="#f6ded8" />
      <text x="193" y="136" textAnchor="middle" fill={palette.tea} fontSize="16" fontWeight="900">余り札</text>
      <MiniCard x={171} y={154} label="2" suit="C" glow />
      <text x="527" y="136" textAnchor="middle" fill={palette.tea} fontSize="16" fontWeight="900">未完成カード</text>
      <MiniCard x={452} y={154} label="9" suit="S" />
      <MiniCard x={505} y={160} label="Q" suit="D" />
      <MiniCard x={558} y={154} label="K" suit="S" />
      <path d="M 318 182 H 402" stroke={palette.gold} strokeWidth="4" strokeLinecap="round" strokeDasharray="7 8" />
      <LabelTag x={360} y={164} text="比較" width={72} />
      <text x="360" y="248" textAnchor="middle" fill={palette.mutedRed} fontSize="34" fontWeight="900">×100</text>
    </IllustrationSvg>
  );
}

export function DaifugoCardsIllustration() {
  const cards = [
    ["5", "スキップ"],
    ["7", "渡し"],
    ["8", "もう1回"],
    ["9", "逆回り"],
    ["10", "捨て"],
    ["J", "選択"],
    ["Q", "爆破"],
  ];
  return (
    <IllustrationSvg ariaLabel="大富豪ルールで効果を持つカード一覧">
      <rect x="48" y="88" width="624" height="178" rx="24" fill={palette.felt} stroke={palette.gold} strokeWidth="3" filter="url(#manual-soft-shadow)" />
      <path d="M 80 111 H 640" stroke="url(#manual-gold-line)" strokeWidth="2" opacity="0.72" />
      {cards.map(([rank, label], index) => (
        <g key={rank}>
          <MiniCard x={78 + index * 84} y={124} label={rank} suit={index % 2 === 0 ? "S" : "H"} glow />
          <rect x={64 + index * 84} y="215" width="72" height="28" rx="14" fill={index % 3 === 0 ? "#eaf1df" : index % 3 === 1 ? "#f7edd2" : "#f6ded8"} stroke={palette.tea} strokeWidth="1.2" />
          <text x={100 + index * 84} y="235" textAnchor="middle" fill={palette.ink} fontSize="13" fontWeight="900">
            {label}
          </text>
        </g>
      ))}
    </IllustrationSvg>
  );
}

export function JShieldIllustration() {
  return (
    <IllustrationSvg ariaLabel="Jシールドで7渡しとQ爆破を防ぐ図">
      <LabelTag x={170} y={104} text="7渡し" width={78} tone="#f6ded8" />
      <ThinArrow d="M 176 132 C 223 113 259 118 292 147" color={palette.mutedRed} dashed marker="manual-arrow-green" />
      <LabelTag x={550} y={104} text="Q爆破" width={78} tone="#f6ded8" />
      <ThinArrow d="M 544 132 C 497 113 461 118 428 147" color={palette.mutedRed} dashed marker="manual-arrow-green" />
      <MiniCard x={248} y={148} label="J" suit="S" glow />
      <MiniCard x={310} y={148} label="7" suit="H" />
      <MiniCard x={372} y={148} label="Q" suit="D" />
      <path d="M 360 70 L 431 100 V 160 C 431 214 397 249 360 269 C 323 249 289 214 289 160 V 100 Z" fill="rgba(31, 90, 66, 0.88)" stroke={palette.gold} strokeWidth="5" filter="url(#manual-soft-shadow)" />
      <path d="M 331 166 L 354 190 L 394 137" fill="none" stroke={palette.paper} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <LabelTag x={360} y={304} text="シールド" width={104} tone="#eaf1df" />
    </IllustrationSvg>
  );
}

function CpuRobot({
  x,
  y,
  label,
  tone,
  level,
}: {
  x: number;
  y: number;
  label: string;
  tone: string;
  level: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#manual-soft-shadow)">
      <rect x="-35" y="-32" width="70" height="58" rx="16" fill={tone} stroke={palette.paperWarm} strokeWidth="3" />
      <rect x="-20" y="-48" width="40" height="18" rx="9" fill={palette.gold} stroke={palette.tea} strokeWidth="2" />
      <circle cx="-15" cy="-7" r="5" fill={palette.paper} />
      <circle cx="15" cy="-7" r="5" fill={palette.paper} />
      <path d={level > 2 ? "M -15 10 Q 0 22 15 10" : "M -14 11 H 14"} fill="none" stroke={palette.paper} strokeWidth="4" strokeLinecap="round" />
      {level === 4 && <path d="M -27 -52 L 0 -70 L 27 -52" fill={palette.gold} stroke={palette.tea} strokeWidth="3" />}
      <text x="0" y="64" textAnchor="middle" fill={palette.ink} fontSize="17" fontWeight="900">
        {label}
      </text>
    </g>
  );
}

export function CpuLevelsIllustration() {
  const levels = [
    ["junior", 92, 238, "#6d9c68", 1],
    ["standard", 250, 210, palette.feltSoft, 2],
    ["Pro", 410, 180, palette.woodSoft, 3],
    ["master", 570, 146, palette.ink, 4],
  ] as const;
  return (
    <IllustrationSvg ariaLabel="CPUレベルがjuniorからmasterへ強くなる図">
      <path d="M 68 274 H 642" stroke={palette.tea} strokeWidth="8" strokeLinecap="round" />
      <path d="M 116 257 H 236 V 229 H 395 V 199 H 560 V 165 H 640" fill="none" stroke={palette.gold} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="606" y="123" textAnchor="middle" fill={palette.tea} fontSize="16" fontWeight="900">強い</text>
      {levels.map(([label, x, y, tone, level]) => (
        <CpuRobot key={label} x={x} y={y} label={label} tone={tone} level={level} />
      ))}
    </IllustrationSvg>
  );
}
