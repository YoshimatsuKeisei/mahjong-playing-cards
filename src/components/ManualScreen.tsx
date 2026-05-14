import { useState } from "react";

interface ManualScreenProps {
  onBackHome: () => void;
}

const manualPages = [
  {
    title: "ゲーム概要",
    body: [
      "このゲームは、麻雀のように役を作って上がるトランプゲームです。",
      "3〜5人で遊びます。",
      "カードはジョーカーを除いた52枚を2組、合計104枚使います。",
      "各プレイヤーは10枚の手札から始めます。",
    ],
  },
  {
    title: "手番の流れ",
    body: [
      "自分の番になったら、まず山札または条件を満たす捨て札からカードを1枚取ります。",
      "その後、手札から1枚捨てます。",
      "捨てた後に残った10枚で上がり判定を行います。",
      "上がれなければ次のプレイヤーへ手番が移ります。",
    ],
  },
  {
    title: "役の作り方",
    body: [
      "上がるには、3枚1セットの役を3つ作る必要があります。",
      "役は2種類あります。",
      "1つ目は階段です。同じマークで連続した3枚をそろえます。例: ♠3, ♠4, ♠5",
      "2つ目は同じ数字3枚です。マークに関係なく同じ数字を3枚そろえます。例: ♠7, ♥7, ♦7",
      "残った1枚はキーカードになります。",
    ],
  },
  {
    title: "鳴き",
    body: [
      "他の人の捨て札を取って役を作ることを「鳴き」と呼びます。",
      "鳴けるのは、そのカードを使って3枚セットの役が完成する時だけです。",
      "鳴いた役は全員に見えるように公開されます。",
      "一度でも鳴くと、リーチはできなくなります。",
    ],
  },
  {
    title: "リーチ",
    body: [
      "一度も鳴いていない状態で、役が2つそろっている場合はリーチできます。",
      "リーチ後は手札を自由に変えることができません。",
      "取ったカードで上がれない場合は、そのカードをそのまま捨てます。",
      "取ったカードで上がれる場合だけ、手札に入れて1枚捨て、上がることができます。",
    ],
  },
  {
    title: "ツモとロン",
    body: [
      "山札から取ったカードをきっかけに上がるとツモです。",
      "他の人の捨て札を取った手番で上がるとロンです。",
      "リーチ中は、条件を満たせば全員の捨て札からロンできます。",
      "鳴き済みの場合は、基本的に直前の人の捨て札か山札からしか取れません。",
    ],
  },
  {
    title: "得点計算",
    body: [
      "上がり形で役に使われなかった1枚がキーカードです。",
      "このキーカードの数字が失点になります。Aは1、2〜10はその数字、J・Q・Kは10として扱います。",
      "ツモの場合は、全員の失点から勝者の失点を引き、人数-1で割った数字が得点です。",
      "ロンの場合は、ロンされた人の失点と勝者の失点の差が得点です。",
    ],
  },
  {
    title: "山札切れ",
    body: [
      "誰も上がらないまま山札がなくなった場合は、その時点で失点が一番少ない人が勝者です。",
      "得点計算はツモと同じ方法で行います。",
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
        <button type="button" className="close-button" aria-label="ホームへ戻る" onClick={onBackHome}>
          ×
        </button>
        <div className="scroll-rod top-rod" />
        <article className="scroll-paper">
          <p className="eyebrow">Manual</p>
          <h1>{page.title}</h1>
          {page.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </article>
        <div className="scroll-rod bottom-rod" />
        <footer className="manual-footer">
          <button type="button" onClick={goBack}>
            戻る
          </button>
          <span>{pageIndex + 1} / {manualPages.length}</span>
          <button type="button" className="primary-button" onClick={goNext}>
            {isLastPage ? "ホームへ" : "次へ"}
          </button>
        </footer>
      </section>
    </main>
  );
}
