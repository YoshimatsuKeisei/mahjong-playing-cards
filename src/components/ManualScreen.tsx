import { useState, type ComponentType } from "react";
import { CpuLevelsIllustration } from "./manual/ManualIllustrations";

interface ManualScreenProps {
  onBackHome: () => void;
}

type ManualBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "example"; lines: string[] };

interface ManualPage {
  title: string;
  illustration: ManualIllustration;
  body: ManualBlock[];
}

type ManualIllustration =
  | { kind: "image"; src: string; alt: string }
  | { kind: "component"; Component: ComponentType };

const manualPage1ImageSrc = new URL("../../冒頭-page1.png", import.meta.url).href;
const manualPage2ImageSrc = new URL("../../手番順-page2.png", import.meta.url).href;
const manualPage3ImageSrc = new URL("../../役の作り方-page3.png", import.meta.url).href;
const manualPage4ImageSrc = new URL("../../鳴き解説-page4.png", import.meta.url).href;
const manualPage5ImageSrc = new URL("../../得点計算-page5.png", import.meta.url).href;
const manualPage6ImageSrc = new URL("../../大富豪効果-page6.png", import.meta.url).href;
const manualPage7ImageSrc = new URL("../../Jシールド効果-page7.png", import.meta.url).href;

const p = (text: string): ManualBlock => ({ kind: "paragraph", text });
const h = (text: string): ManualBlock => ({ kind: "heading", text });
const list = (items: string[]): ManualBlock => ({ kind: "list", items });
const example = (lines: string[]): ManualBlock => ({ kind: "example", lines });

const manualPages: ManualPage[] = [
  {
    title: "このゲームについて",
    illustration: { kind: "image", src: manualPage1ImageSrc, alt: "ゲーム全体の構図" },
    body: [
      p("このゲームは、3〜5人で遊ぶ「麻雀風トランプゲーム」です。"),
      p("トランプを使って、同じ数字3枚、または同じマークの連番3枚を集め、3つの役を完成させることを目指します。"),
      p("麻雀のように、山札から引いたり、直前の捨て札を拾ったりしながら手を進めます。設定によっては「大富豪ルール」が追加され、5・7・8・9・10・J・Qに特殊効果が発生します。"),
      p("ルームに入ると、各プレイヤーにはランダムにPlayer IDが割り当てられます。ただし、Player1だから必ず最初の手番になるわけではありません。公平性を保つため、各局ごとに最初の手番プレイヤーは変わります。"),
      p("使用するカードは、52枚のトランプを2セット合わせた104枚です。同じ数字は合計8枚、完全に同じカードは2枚存在します。"),
      p("基本的には、手札が常に10枚になるようにゲームが進みます。自分の手番では一時的に11枚になり、その中から1枚を捨てて、また10枚に戻します。"),
    ],
  },
  {
    title: "手番の流れ",
    illustration: { kind: "image", src: manualPage2ImageSrc, alt: "手番順と9リバース" },
    body: [
      p("手番は、基本的に時計回りに進みます。"),
      p("通常は、Player1 → Player2 → Player3 → …… → Player1 のように順番が回ります。ただし、最初の手番がPlayer2だった場合は、Player2 → Player3 → …… のように、開始位置だけが変わります。"),
      p("大富豪ルールありの場合、9の効果によって手番順が逆回りになることがあります。"),
      h("自分の手番で行うこと"),
      list([
        "山札からカードを1枚引く、または直前の捨て札を取る",
        "手札11枚の中から1枚を選び、捨てる",
      ]),
      p("これで手番終了です。"),
      p("山札から引いた場合は、引いたカードを含めて手札が11枚になります。直前の捨て札を取った場合も同じです。その後、不要なカードを1枚捨てて、手札を10枚に戻します。"),
      p("捨てたカードは自分の前に置かれ、他のプレイヤーから見える状態になります。"),
    ],
  },
  {
    title: "役の作り方と上がり",
    illustration: { kind: "image", src: manualPage3ImageSrc, alt: "役の作り方" },
    body: [
      p("このゲームでは、3枚セットで「役」を作ります。"),
      h("役は2種類あります"),
      list([
        "同じ数字を3枚集める役。例: 7・7・7",
        "同じマークで数字が連続する3枚を集める役。例: ハートの3・4・5",
      ]),
      p("役を3つ完成させると、上がりを目指せる状態になります。"),
      p("上がるときは、完成した役3つに加えて、役に使わないカードが1枚残ります。この残った1枚は「余り札」として、得点計算に使われます。"),
      p("このゲームでは、ただ役を作るだけでなく、余り札や不要なカードの数字を小さくすることも重要です。勝つときは大きく得点し、負けるときは失点を小さくできます。"),
    ],
  },
  {
    title: "鳴き・リーチ・ロン・ツモ",
    illustration: { kind: "image", src: manualPage4ImageSrc, alt: "鳴きの流れ" },
    body: [
      h("鳴き"),
      p("鳴きとは、直前のプレイヤーが捨てたカードと、自分の手札を組み合わせて役を完成させる行動です。"),
      p("鳴いた役は公開され、他のプレイヤーから見える状態になります。"),
      p("鳴きは手を早く進められる強力な行動ですが、デメリットもあります。一度でも鳴くと、リーチを宣言できなくなります。また、公開された役から狙いが読まれやすくなります。"),
      h("リーチ"),
      p("リーチは、あと1枚で上がれる状態になったときに宣言できる特別な状態です。"),
      list([
        "まだ一度も鳴いていない",
        "すでに役を2つ完成させている",
        "あと1枚で3つ目の役が完成する",
      ]),
      p("リーチすると、どのプレイヤーの捨て札からでもロンできるようになります。上がれる範囲が広がるため、大きなチャンスになります。"),
      p("ただし、大富豪ルールありの場合は、7渡しやQボンバーなどによって手が崩されることがあります。手が崩れてリーチ条件を満たさなくなった場合、リーチ状態は解除されます。"),
      h("ロンとツモ"),
      p("ロンとは、他のプレイヤーが捨てたカードを使って上がることです。"),
      p("ツモとは、山札から引いたカードで上がることです。"),
    ],
  },
  {
    title: "得点計算",
    illustration: { kind: "image", src: manualPage5ImageSrc, alt: "得点計算の図表" },
    body: [
      p("このゲームの得点は、「失点」をもとに計算されます。"),
      p("上がったプレイヤーは、役3つと余り札1枚の状態になります。この余り札の数字が、勝者の失点になります。"),
      p("負けたプレイヤーは、完成役に使っていないカードの数字を合計します。この合計が敗者の失点になります。"),
      p("つまり、余り札や不要なカードの数字を小さくしておくほど有利になります。"),
      h("ロンの場合"),
      p("得点は次の式で決まります。"),
      example(["敗者の失点 - 勝者の失点", "差 × 100 = 得点"]),
      p("例: ロンされたプレイヤーの失点が12、ロンしたプレイヤーの失点が3の場合。"),
      example(["12 - 3 = 9", "9 × 100 = 900点"]),
      p("ロンされたプレイヤーの失点が、ロンしたプレイヤーの失点以下だった場合、得点は0点扱いになります。Wロンの場合は、ロンした各プレイヤーについて、それぞれ得点を計算します。"),
      h("ツモの場合"),
      p("ツモしたプレイヤー以外の全員が敗者になります。"),
      example(["敗者全員の失点平均 - 勝者の失点", "差 × 100 = 得点"]),
    ],
  },
  {
    title: "大富豪ルール 5・7・8・9・10",
    illustration: { kind: "image", src: manualPage6ImageSrc, alt: "大富豪効果カード" },
    body: [
      p("大富豪ルールありでは、特定のカードを捨てたときに特殊効果が発生します。対象となるカードは、5・7・8・9・10・J・Qです。"),
      h("5: スキップ"),
      p("5を捨てると、次のプレイヤーの手番を飛ばすことができます。"),
      h("7: 渡し"),
      p("7を捨てると、次の手番のプレイヤーに自分のカードを1枚渡し、相手からカードを1枚受け取ることができます。"),
      p("7渡しを受けたプレイヤーは、完成役がある場合は完成役を、完成役がない場合はペアなどの強い形を崩さなければならないことがあります。"),
      p("ただし、7渡しでカードを受け取った直後にリーチ条件を満たしたり、上がれる形になったりしても、その場でリーチや上がりはできません。"),
      h("8: もう一度"),
      p("8を捨てると、追加でもう一度山札からカードを引き、自分の手札から1枚捨てます。"),
      h("9: リバース"),
      p("9を捨てると、手番順が逆回りになります。もう一度9が使われると、手番順は元の向きに戻ります。"),
      h("10: 捨て"),
      p("10を捨てると、先に自分の手札から1枚捨て、その後で山札から1枚引きます。"),
    ],
  },
  {
    title: "大富豪ルール J・Q",
    illustration: { kind: "image", src: manualPage7ImageSrc, alt: "Jシールド効果" },
    body: [
      p("Jを捨てると、3つの効果から1つを選べます。"),
      h("1. 手札閲覧"),
      p("自分以外のプレイヤーの手札を、1枚ずつ確認できます。相手の狙いや危険なカードを読むのに役立ちます。"),
      h("2. Jシールド"),
      p("特定のカードを保護できます。保護できる対象は、同じ数字のカード全部、または階段3枚です。"),
      p("Jシールドで守られたカードは、7渡しの対象から外れます。また、Qボンバーを受けた場合も、シールドがはがれるだけでカード自体は破壊されません。"),
      h("3. 5/7強化権"),
      p("次回以降に5や7を使うとき、効果を強化できます。通常の5や7は、次の手番プレイヤーにしか効果がありません。強化権を使うことで、5ではスキップする人数を増やしたり、7では離れたプレイヤーを対象にしたりできます。"),
      h("Q: ボンバー"),
      p("Qを捨てると、特定の数字を1種類選び、その数字のカードを山札と全員の手札から消去できます。"),
      p("ただし、鳴きで公開済みのカードや、Jシールドで守られているカードは破壊されません。"),
      p("Qボンバーでカードを破壊されたプレイヤーは、破壊された枚数ぶん山札からカードを引きます。"),
      p("Qボンバーを使ったプレイヤーだけは、この処理によってリーチ条件を満たした場合にリーチでき、上がれる場合はそのまま上がることができます。この場合はツモ扱いになります。"),
      p("使用者以外のプレイヤーは、Qボンバー後にリーチや上がりができる形になっても、その場では宣言できません。"),
    ],
  },
  {
    title: "CPU対戦と遊び方のコツ",
    illustration: { kind: "component", Component: CpuLevelsIllustration },
    body: [
      p("このゲームでは、CPUを含めた対戦ができます。自分以外のプレイヤーをCPUにして、1人で対戦を試すこともできます。ルール確認や練習にも便利です。"),
      h("CPUの種類"),
      list(["junior-CPU", "standard-CPU", "Pro-CPU", "master-CPU"]),
      p("右に行くほど、より高度な判断を行います。"),
      h("勝つためのコツ"),
      p("このゲームでは、早く役を作るだけでは勝てません。"),
      list([
        "役を3つ作る",
        "余り札や不要なカードの数字を小さくする",
        "相手にロンされにくいカードを捨てる",
      ]),
      p("鳴きを使えば早く役を作れますが、リーチできなくなります。"),
      p("リーチを狙えばロンできる範囲が広がりますが、大富豪ルールありでは妨害される可能性もあります。"),
      p("大富豪ルールありでは、5・7・8・9・10・J・Qの効果をいつ使うかが勝敗を大きく左右します。"),
      p("まずは大富豪ルールなしで基本の流れに慣れ、次に大富豪ルールありで特殊効果を使った駆け引きを楽しんでください。"),
    ],
  },
];

export default function ManualScreen({ onBackHome }: ManualScreenProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const page = manualPages[pageIndex];
  const isLastPage = pageIndex === manualPages.length - 1;

  function goBack() {
    if (pageIndex === 0) {
      onBackHome();
      return;
    }
    setPageIndex((current) => Math.max(0, current - 1));
  }

  function goNext() {
    if (isLastPage) {
      onBackHome();
      return;
    }
    setPageIndex((current) => Math.min(manualPages.length - 1, current + 1));
  }

  return (
    <main className="screen manual-screen">
      <section className="scroll-panel" aria-label="ルール説明">
        <button
          type="button"
          className="close-button"
          aria-label="ホームへ戻る"
          onClick={onBackHome}
        >
          ×
        </button>
        <div className="scroll-rod top-rod" />
        <article className="scroll-paper">
          <p className="eyebrow">Manual</p>
          <h1>{page.title}</h1>
          <div className="manual-illustration-frame">
            <ManualIllustrationView illustration={page.illustration} />
          </div>
          <div className="manual-page-body">
            {page.body.map((block, index) => (
              <ManualBlockView block={block} key={`${block.kind}-${index}`} />
            ))}
          </div>
        </article>
        <div className="scroll-rod bottom-rod" />
        <footer className="manual-footer">
          <button type="button" onClick={goBack}>
            戻る
          </button>
          <span>
            {pageIndex + 1} / {manualPages.length}
          </span>
          <button type="button" className="primary-button" onClick={goNext}>
            {isLastPage ? "ホームへ" : "次へ"}
          </button>
        </footer>
      </section>
    </main>
  );
}

function ManualIllustrationView({ illustration }: { illustration: ManualIllustration }) {
  if (illustration.kind === "image") {
    return (
      <img
        className="manual-illustration-image"
        src={illustration.src}
        alt={illustration.alt}
        loading="lazy"
      />
    );
  }
  const Illustration = illustration.Component;
  return <Illustration />;
}

function ManualBlockView({ block }: { block: ManualBlock }) {
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
