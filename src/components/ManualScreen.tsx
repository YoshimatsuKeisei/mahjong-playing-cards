import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type ComponentType,
  type RefObject,
} from "react";

interface ManualScreenProps {
  onBackHome: () => void;
}

type ManualBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "example"; lines: string[] }
  | { kind: "section"; text: string }
  | { kind: "illustration"; illustration: ManualIllustration };

interface ManualPage {
  title: string;
  illustration?: ManualIllustration;
  body: ManualBlock[];
}

interface ManualLeaf {
  sourcePageIndex: number;
  body: ManualBlock[];
}

type ManualSpread = [ManualLeaf, ManualLeaf | null];
type ManualTurnDirection = "next" | "prev";

interface ManualFlowItem {
  sourcePageIndex: number;
  block: ManualBlock;
}

type ManualIllustration =
  | { kind: "image"; src: string; alt: string }
  | { kind: "component"; Component: ComponentType };

const manualPage1ImageSrc = new URL("../../冒頭-page1.png", import.meta.url)
  .href;
const manualPage2ImageSrc = new URL("../../手番順-page2.png", import.meta.url)
  .href;
const manualPage3ImageSrc = new URL(
  "../../役の作り方-page3-modified.png",
  import.meta.url,
).href;
const manualPage4ImageSrc = new URL("../../鳴き解説-page4-modified-hatena.png", import.meta.url)
  .href;
const manualPage5ImageSrc = new URL("../../得点計算-page5-modified-true-transparent.png?v=magenta-brown-v1", import.meta.url)
  .href;
const manualPage6ImageSrc = new URL(
  "../../大富豪効果-page6-modified-true-transparent.png?v=magenta-brown-v1",
  import.meta.url,
).href;
const manualPage7ImageSrc = new URL(
  "../../Jシールド効果-page7-modified-hatena.png?v=hatena-20260619-121540",
  import.meta.url,
).href;

const p = (text: string): ManualBlock => ({ kind: "paragraph", text });
const h = (text: string): ManualBlock => ({ kind: "heading", text });
const list = (items: string[]): ManualBlock => ({ kind: "list", items });
const example = (lines: string[]): ManualBlock => ({ kind: "example", lines });
const section = (text: string): ManualBlock => ({ kind: "section", text });
const illustration = (value: ManualIllustration): ManualBlock => ({
  kind: "illustration",
  illustration: value,
});

const manualPages: ManualPage[] = [
  {
    title: "このゲームについて",
    illustration: {
      kind: "image",
      src: manualPage1ImageSrc,
      alt: "ゲーム全体の構図",
    },
    body: [
      p("このゲームは、3~5人で遊ぶ「麻雀風トランプゲーム」です。"),
      p(
        "トランプを使って、同じ数字3枚、または同じマークの連番3枚を集め、3つの役を完成させることを目指します。",
      ),
      p(
        "麻雀のように、山札から引いたり、直前の捨て札を拾ったりしながら手を進めます。設定によっては「大富豪ルール」が追加され、5・7・8・9・10・J・Qに特殊効果が発生します。",
      ),
      p(
        "ルームに入ると、各プレイヤーにはランダムにPlayer IDが割り当てられます。ただし、Player1だから必ず最初の手番になるわけではありません。公平性を保つため、各局ごとに最初の手番プレイヤーは変わります。",
      ),
      p(
        "使用するカードは、52枚のトランプを2セット合わせた104枚です。同じ数字は合計8枚、完全に同じカードは2枚存在します。",
      ),
      p(
        "基本的には、手札が常に10枚になるようにゲームが進みます。自分の手番では一時的に11枚になり、その中から1枚を捨てて、また10枚に戻します。",
      ),
    ],
  },
  {
    title: "手番の流れ",
    illustration: {
      kind: "image",
      src: manualPage2ImageSrc,
      alt: "手番順と9リバース",
    },
    body: [
      p("手番は、基本的に時計回りに進みます。"),
      p(
        "通常は、Player1 → Player2 → Player3 → …… → Player1 のように順番が回ります。ただし、最初の手番がPlayer2だった場合は、Player2 → Player3 → …… のように、開始位置だけが変わります。",
      ),
      p(
        "大富豪ルールありの場合、9の効果によって手番順が逆回りになることがあります。",
      ),
      h("自分の手番で行うこと"),
      list([
        "山札からカードを1枚引く、または直前の捨て札を取る",
        "手札11枚の中から1枚を選び、捨てる",
      ]),
      p("これで手番終了です。"),
      p(
        "山札から引いた場合は、引いたカードを含めて手札が11枚になります。直前の捨て札を取った場合も同じです。その後、不要なカードを1枚捨てて、手札を10枚に戻します。",
      ),
      p(
        "捨てたカードは自分の前に置かれ、他のプレイヤーから見える状態になります。",
      ),
    ],
  },
  {
    title: "役の作り方と上がり",
    illustration: {
      kind: "image",
      src: manualPage3ImageSrc,
      alt: "役の作り方",
    },
    body: [
      p("このゲームでは、3枚セットで「役」を作ります。"),
      h("役は2種類あります"),
      list([
        "同じ数字を3枚集める役。例: 7・7・7",
        "同じマークで数字が連続する3枚を集める役。例:♡の3・4・5",
      ]),
      p("役を3つ完成させると、上がりを目指せる状態になります。"),
      p(
        "上がるときは、完成した役3つに加えて、役に使わないカードが1枚残ります。この残った1枚は「余り札」として、得点計算に使われます。",
      ),
      p(
        "このゲームでは、ただ役を作るだけでなく、余り札や不要なカードの数字を小さくすることも重要です。勝つときは大きく得点し、負けるときは失点を小さくできます。",
      ),
    ],
  },
  {
    title: "鳴き・リーチ・ロン・ツモ",
    illustration: {
      kind: "image",
      src: manualPage4ImageSrc,
      alt: "鳴きの流れ",
    },
    body: [
      h("鳴き"),
      p(
        "鳴きとは、直前のプレイヤーが捨てたカードと、自分の手札を組み合わせて役を完成させる行動です。鳴いた役は公開され、他のプレイヤーから見える状態になります。鳴きは手を早く進められる強力な行動ですが、デメリットもあります。一度でも鳴くと、リーチを宣言できなくなります。また、公開された役から狙いが読まれやすくなります。",
      ),
      h("リーチ"),
      p(
        "リーチは、あと1枚で上がれる状態になったときに宣言できる特別な状態です。",
      ),
      p(
        "●まだ一度も鳴いていない ●すでに役を2つ完成させている ●あと1枚で3つ目の役が完成する",
      ),
      p(
        "リーチすると、どのプレイヤーの捨て札からでもロンできるようになります。上がれる範囲が広がるため、大きなチャンスになります。ただし、大富豪ルールありの場合は、7渡しやQボンバーなどによって手が崩されることがあります。手が崩れてリーチ条件を満たさなくなった場合、リーチ状態は解除されます。",
      ),
      h("ロンとツモ"),
      p(
        "ロンとは、他のプレイヤーが捨てたカードを使って上がることです。ツモとは、山札から引いたカードで上がることです。",
      ),
    ],
  },
  {
    title: "得点計算",
    illustration: {
      kind: "image",
      src: manualPage5ImageSrc,
      alt: "得点計算の図表",
    },
    body: [
      p("このゲームの得点は、「失点」をもとに計算されます。"),
      p(
        "上がったプレイヤーは、役3つと余り札1枚の状態になります。この余り札の数字が、勝者の失点になります。",
      ),
      p(
        "負けたプレイヤーは、完成役に使っていないカードの数字を合計します。この合計が敗者の失点になります。",
      ),
      p(
        "つまり、余り札や不要なカードの数字を小さくしておくほど有利になります。",
      ),
      h("ロンの場合"),
      example(["(敗者の失点 - 勝者の失点) × 100 = 得点"]),
      p(
        "例: ロンされたプレイヤーの失点が12、ロンしたプレイヤーの失点が3の場合。(12 - 3 )× 100 = 900点",
      ),
      p(
        "※ロンされたプレイヤーの失点が、ロンしたプレイヤーの失点以下だった場合、得点は0点扱いになります。",
      ),
      h("ツモの場合"),
      p("ツモしたプレイヤー以外の全員が敗者になります。"),
      example(["(敗者全員の失点平均 - 勝者の失点) × 100 = 得点"]),
    ],
  },
  {
    title: "大富豪ルール 5・7・8・9・10",
    illustration: {
      kind: "image",
      src: manualPage6ImageSrc,
      alt: "大富豪効果カード",
    },
    body: [
      p(
        "大富豪ルールありでは、特定のカードを捨てたときに特殊効果が発生します。対象となるカードは、5・7・8・9・10・J・Qです。",
      ),
      p("5:スキップ 次のプレイヤーの手番を飛ばすことができます。"),
      p("7: 渡し"),
      p(
        "次の手番のプレイヤーに自分のカードを1枚渡し、相手からカードを1枚受け取ることができます。7渡しを受けたプレイヤーは、完成役がある場合は完成役を、完成役がない場合はペアなどの強い形を崩す必要があります。",
      ),
      p(
        "※7渡し直後にリーチ条件を満たしたり、上がれる形になったりしても、その場でリーチや上がりはできません。",
      ),
      p(
        "8:追加ターン 追加でもう一度山札からカードを引き、自分の手札から1枚捨てます。",
      ),
      p(
        "9:リバース 手番順が逆回りになります。もう一度9が使われると、手番順は元の向きに戻ります。",
      ),
      p("10:捨て 先に自分の手札から1枚捨て、その後で山札から1枚引きます。"),
    ],
  },
  {
    title: "大富豪ルール J・Q",
    illustration: {
      kind: "image",
      src: manualPage7ImageSrc,
      alt: "Jシールド効果",
    },
    body: [
      p("Jを捨てると、3つの効果から1つを選べます。"),
      h("1. 手札閲覧"),
      p(
        "自分以外のプレイヤーの手札を、1枚ずつ確認できます。相手の狙いや危険なカードを読むのに役立ちます。",
      ),
      h("2. Jシールド"),
      p(
        "特定のカードを保護できます。保護できる対象は、同じ数字のカード全部、または階段3枚です。Jシールドで守られたカードは、7渡しの対象から外れます。また、Qボンバーを受けた場合も、シールドがはがれるだけでカード自体は破壊されません。",
      ),
      h("3. 5/7強化権"),
      p(
        "次回以降に5や7を使うとき、効果を強化できます。通常の5や7は、次の手番プレイヤーにしか効果がありません。強化権を使うことで、5ではスキップする人数を増やしたり、7では離れたプレイヤーを対象にしたりできます。",
      ),
      h("Q: ボンバー"),
      p(
        "Qを捨てると、特定の数字を1種類選び、その数字のカードを山札と全員の手札から消去できます。",
      ),
      p(
        "ただし、鳴きで公開済みのカードや、Jシールドで守られているカードは破壊されません。",
      ),
      p(
        "Qボンバーでカードを破壊されたプレイヤーは、破壊された枚数ぶん山札からカードを引きます。",
      ),
      p(
        "Qボンバーを使ったプレイヤーだけは、この処理によってリーチ条件を満たした場合にリーチでき、上がれる場合はそのまま上がることができます。この場合はツモ扱いになります。",
      ),
      p(
        "使用者以外のプレイヤーは、Qボンバー後にリーチや上がりができる形になっても、その場では宣言できません。",
      ),
    ],
  },
  {
    title: "CPU対戦と遊び方のコツ",
    body: [
      p(
        "このゲームでは、CPUを含めた対戦ができます。自分以外のプレイヤーをCPUにして、1人で対戦を試すこともできます。ルール確認や練習にも便利です。",
      ),
      h("CPUの種類 ●junior-CPU ●standard-CPU ●Pro-CPU ●master-CPU"),
      p("右に行くほど、より高度な判断を行います。"),
      h("勝つためのコツ"),
      p("このゲームでは、早く役を作るだけでは勝てません。"),
      p(
        "●役を3つ作る ●余り札や不要なカードの数字を小さくする ●相手にロンされにくいカードを捨てる",
      ),
      p("鳴きを使えば早く役を作れますが、リーチできなくなります。"),
      p(
        "リーチを狙えばロンできる範囲が広がりますが、大富豪ルールありでは妨害される可能性もあります。",
      ),
      p(
        "大富豪ルールありでは、5・7・8・9・10・J・Qの効果をいつ使うかが勝敗を大きく左右します。",
      ),
      p(
        "まずは大富豪ルールなしで基本の流れに慣れ、次に大富豪ルールありで特殊効果を使った駆け引きを楽しんでください。",
      ),
    ],
  },
];

const manualFlow = buildManualFlow(manualPages);
const initialManualLeaves = buildManualLeavesByWeight(manualFlow);

export default function ManualScreen({ onBackHome }: ManualScreenProps) {
  const measurerRef = useRef<HTMLDivElement | null>(null);
  const [manualLeaves, setManualLeaves] = useState(initialManualLeaves);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [pendingSpreadIndex, setPendingSpreadIndex] = useState<number | null>(null);
  const [turnDirection, setTurnDirection] = useState<ManualTurnDirection | null>(null);
  const manualSpreads = useMemo(() => buildManualSpreads(manualLeaves), [manualLeaves]);
  const spread = manualSpreads[spreadIndex];
  const pendingSpread =
    pendingSpreadIndex === null ? null : manualSpreads[pendingSpreadIndex] ?? null;
  const isTurning = pendingSpreadIndex !== null && turnDirection !== null;
  const isLastPage = spreadIndex === manualSpreads.length - 1;

  useEffect(() => {
    if (spreadIndex > manualSpreads.length - 1) {
      setSpreadIndex(Math.max(0, manualSpreads.length - 1));
    }
  }, [manualSpreads.length, spreadIndex]);

  useEffect(() => {
    let cancelled = false;

    async function paginateFromMeasurements() {
      const root = measurerRef.current;
      if (!root) return;
      const images = Array.from(root.querySelectorAll("img"));
      await Promise.all(
        images.map(
          (image) =>
            image.complete ||
            new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
        ),
      );
      if (cancelled) return;

      const leaf = root.querySelector<HTMLElement>(".manual-leaf");
      const blocks = Array.from(
        root.querySelectorAll<HTMLElement>("[data-manual-measure-index]"),
      );
      const leafHeight = leaf?.clientHeight ?? 0;
      if (leafHeight <= 0 || blocks.length === 0) return;

      const measuredHeights = blocks.map((block) => block.getBoundingClientRect().height);
      const nextLeaves = buildManualLeavesByMeasurement(
        manualFlow,
        measuredHeights,
        leafHeight,
      );
      setManualLeaves((current) =>
        getManualLeavesSignature(current) === getManualLeavesSignature(nextLeaves)
          ? current
          : nextLeaves,
      );
    }

    const frame = window.requestAnimationFrame(() => {
      void paginateFromMeasurements();
    });
    window.addEventListener("resize", paginateFromMeasurements);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", paginateFromMeasurements);
    };
  }, []);

  function shouldReduceManualMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function startManualTurn(nextSpreadIndex: number, direction: ManualTurnDirection) {
    if (isTurning) return;
    if (shouldReduceManualMotion()) {
      setSpreadIndex(nextSpreadIndex);
      return;
    }
    setPendingSpreadIndex(nextSpreadIndex);
    setTurnDirection(direction);
  }

  function finishManualTurn(event: AnimationEvent<HTMLDivElement>) {
    if (
      event.animationName !== "manual-page-turn-next" &&
      event.animationName !== "manual-page-turn-prev" &&
      event.animationName !== "manual-page-slide-next" &&
      event.animationName !== "manual-page-slide-prev"
    ) {
      return;
    }
    if (pendingSpreadIndex === null) return;
    setSpreadIndex(pendingSpreadIndex);
    setPendingSpreadIndex(null);
    setTurnDirection(null);
  }

  function goBack() {
    if (isTurning) return;
    if (spreadIndex === 0) {
      onBackHome();
      return;
    }
    startManualTurn(spreadIndex - 1, "prev");
  }

  function goNext() {
    if (isTurning) return;
    if (isLastPage) {
      onBackHome();
      return;
    }
    startManualTurn(spreadIndex + 1, "next");
  }

  return (
    <main className="screen manual-screen">
      <section className="scroll-panel" aria-label="ルール説明">
        <button
          type="button"
          className="close-button"
          aria-label="ホームへ戻る"
          disabled={isTurning}
          onClick={onBackHome}
        >
          ×
        </button>
        <div className="scroll-rod top-rod" />
        <article
          className={[
            "scroll-paper",
            `manual-spread-${spreadIndex + 1}`,
            isTurning ? "is-turning" : "",
            turnDirection === "next" ? "turn-next" : "",
            turnDirection === "prev" ? "turn-prev" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {pendingSpread && (
            <ManualSpreadLayer
              className="manual-spread-layer-under"
              spread={pendingSpread}
            />
          )}
          <ManualSpreadLayer className="manual-spread-layer-current" spread={spread} />
          {isTurning && (
            <ManualTurnLayer
              direction={turnDirection}
              onAnimationEnd={finishManualTurn}
              spread={spread}
            />
          )}
        </article>
        <div className="scroll-rod bottom-rod" />
        <footer className="manual-footer">
          <button type="button" disabled={isTurning} onClick={goBack}>
            戻る
          </button>
          <span>
            {spreadIndex + 1} / {manualSpreads.length}
          </span>
          <button
            type="button"
            className="primary-button"
            disabled={isTurning}
            onClick={goNext}
          >
            {isLastPage ? "ホームへ" : "次へ"}
          </button>
        </footer>
        <ManualPaginationMeasurer flow={manualFlow} refObject={measurerRef} />
      </section>
    </main>
  );
}

function ManualSpreadLayer({
  className,
  spread,
}: {
  className: string;
  spread: ManualSpread;
}) {
  return (
    <div className={`manual-spread-layer ${className}`}>
      <ManualLeafView leaf={spread[0]} side="left" />
      <ManualLeafView leaf={spread[1]} side="right" />
    </div>
  );
}

function ManualTurnLayer({
  direction,
  onAnimationEnd,
  spread,
}: {
  direction: ManualTurnDirection;
  onAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
  spread: ManualSpread;
}) {
  const turningLeaf = direction === "next" ? spread[1] : spread[0];
  const turningSide = direction === "next" ? "right" : "left";
  return (
    <div
      className={`manual-turn-layer manual-turn-layer-${direction}`}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="manual-turn-page-front">
        <ManualLeafView leaf={turningLeaf} side={turningSide} />
      </div>
      <div className="manual-turn-page-back" />
    </div>
  );
}

function ManualLeafView({
  leaf,
  side,
}: {
  leaf: ManualLeaf | null;
  side: "left" | "right";
}) {
  if (!leaf) {
    return <section className={`manual-leaf manual-leaf-${side}`} aria-hidden="true" />;
  }
  return (
    <section
      className={`manual-leaf manual-leaf-${side} manual-page-${leaf.sourcePageIndex + 1}`}
    >
      <div className="manual-page-body">
        {leaf.body.map((block, index) => (
          <ManualFlowBlock block={block} key={`${block.kind}-${index}`} />
        ))}
      </div>
    </section>
  );
}

function ManualPaginationMeasurer({
  flow,
  refObject,
}: {
  flow: ManualFlowItem[];
  refObject: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="manual-pagination-measurer" ref={refObject} aria-hidden="true">
      <article className="scroll-paper">
        <section className="manual-leaf manual-leaf-left">
          <div className="manual-page-body">
            {flow.map((item, index) => (
              <ManualFlowBlock
                block={item.block}
                key={`${item.block.kind}-${index}`}
                measureIndex={index}
              />
            ))}
          </div>
        </section>
        <section className="manual-leaf manual-leaf-right" />
      </article>
    </div>
  );
}

function ManualFlowBlock({
  block,
  measureIndex,
}: {
  block: ManualBlock;
  measureIndex?: number;
}) {
  return (
    <div
      className={`manual-flow-block manual-flow-block-${block.kind}`}
      data-manual-measure-index={measureIndex}
    >
      <ManualBlockView block={block} />
    </div>
  );
}

function ManualIllustrationView({
  illustration,
}: {
  illustration: ManualIllustration;
}) {
  if (illustration.kind === "image") {
    return (
      <img
        className="manual-illustration-image"
        src={illustration.src}
        alt={illustration.alt}
        loading="eager"
      />
    );
  }
  const Illustration = illustration.Component;
  return <Illustration />;
}

function ManualBlockView({ block }: { block: ManualBlock }) {
  if (block.kind === "section") {
    return <h1 className="manual-section-title">{block.text}</h1>;
  }
  if (block.kind === "illustration") {
    return (
      <div className="manual-illustration-frame">
        <ManualIllustrationView illustration={block.illustration} />
      </div>
    );
  }
  if (block.kind === "heading") {
    return <h2 className="manual-subheading">{block.text}</h2>;
  }
  if (block.kind === "list") {
    return (
      <ul className="manual-list">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.kind === "example") {
    return (
      <div className="manual-example">
        {block.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    );
  }
  return <p>{block.text}</p>;
}

function buildManualSpreads(leaves: ManualLeaf[]): ManualSpread[] {
  const spreads: ManualSpread[] = [];
  for (let index = 0; index < leaves.length; index += 2) {
    spreads.push([leaves[index], leaves[index + 1] ?? null]);
  }
  return spreads;
}

function buildManualFlow(pages: ManualPage[]): ManualFlowItem[] {
  return pages.flatMap((page, sourcePageIndex) => {
    const blocks: ManualFlowItem[] = [
      { block: section(page.title), sourcePageIndex },
    ];
    blocks.push(
      ...page.body
        .flatMap(splitManualBlock)
        .map((block) => ({ block, sourcePageIndex })),
    );
    if (page.illustration) {
      blocks.push({ block: illustration(page.illustration), sourcePageIndex });
    }
    return blocks;
  });
}

function buildManualLeavesByWeight(flow: ManualFlowItem[]): ManualLeaf[] {
  const leaves: ManualLeaf[] = [];
  let currentBody: ManualBlock[] = [];
  let currentWeight = 0;
  let currentSourcePageIndex = 0;

  const pushLeaf = () => {
    if (currentBody.length === 0) return;
    leaves.push({
      sourcePageIndex: currentSourcePageIndex,
      body: currentBody,
    });
    currentBody = [];
    currentWeight = 0;
  };

  for (const item of flow) {
    const blockWeight = getManualBlockWeight(item.block);
    const maxWeight = getManualLeafMaxWeight([...currentBody, item.block]);
    if (currentBody.length > 0 && currentWeight + blockWeight > maxWeight) {
      pushLeaf();
    }
    if (currentBody.length === 0) {
      currentSourcePageIndex = item.sourcePageIndex;
    }
    currentBody.push(item.block);
    currentWeight += blockWeight;
  }

  pushLeaf();
  return leaves;
}

function buildManualLeavesByMeasurement(
  flow: ManualFlowItem[],
  measuredHeights: number[],
  leafHeight: number,
): ManualLeaf[] {
  const leaves: ManualLeaf[] = [];
  let cursor = 0;

  while (cursor < flow.length) {
    const body: ManualBlock[] = [];
    let sourcePageIndex = flow[cursor].sourcePageIndex;
    let usedHeight = 0;

    while (cursor < flow.length) {
      const item = flow[cursor];
      const itemHeight = measuredHeights[cursor] ?? 0;
      const fits = body.length === 0 || usedHeight + itemHeight <= leafHeight;

      if (!fits) {
        break;
      }

      if (body.length === 0) {
        sourcePageIndex = item.sourcePageIndex;
      }
      body.push(item.block);
      usedHeight += itemHeight;
      cursor += 1;
    }

    leaves.push({ sourcePageIndex, body });
  }

  return leaves;
}

function getManualLeavesSignature(leaves: ManualLeaf[]): string {
  return leaves
    .map((leaf) => `${leaf.sourcePageIndex}:${leaf.body.map(getManualBlockKey).join(",")}`)
    .join("|");
}

function getManualBlockKey(block: ManualBlock): string {
  if (block.kind === "paragraph" || block.kind === "heading" || block.kind === "section") {
    return `${block.kind}:${block.text}`;
  }
  if (block.kind === "list") {
    return `${block.kind}:${block.items.join("/")}`;
  }
  if (block.kind === "example") {
    return `${block.kind}:${block.lines.join("/")}`;
  }
  return `${block.kind}:${block.illustration.kind}`;
}

function getManualBlockWeight(block: ManualBlock): number {
  if (block.kind === "section") {
    return 1.35;
  }
  if (block.kind === "illustration") {
    return 5.4;
  }
  if (block.kind === "heading") {
    return 0.8;
  }
  if (block.kind === "list") {
    return 0.95 + block.items.reduce((sum, item) => sum + item.length / 96, 0);
  }
  if (block.kind === "example") {
    return 0.95 + block.lines.reduce((sum, line) => sum + line.length / 92, 0);
  }
  return 0.64 + block.text.length / 142;
}

function getManualLeafMaxWeight(blocks: ManualBlock[]): number {
  return blocks.some((block) => block.kind === "illustration") ? 8.2 : 9.2;
}

function splitManualBlock(block: ManualBlock): ManualBlock[] {
  if (block.kind !== "paragraph" || block.text.length <= 300) {
    return [block];
  }

  const chunks: ManualBlock[] = [];
  let remaining = block.text;
  while (remaining.length > 300) {
    let splitAt = findManualParagraphSplit(remaining, 240, 300);
    if (splitAt <= 0) splitAt = 270;
    chunks.push(p(remaining.slice(0, splitAt).trim()));
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining.length > 0) {
    chunks.push(p(remaining));
  }
  return chunks;
}

function findManualParagraphSplit(text: string, min: number, max: number): number {
  const punctuation = ["。", "、", "・", "・", " "];
  for (let index = max; index >= min; index -= 1) {
    if (punctuation.some((mark) => text.startsWith(mark, index))) {
      return index + 1;
    }
  }
  return -1;
}
