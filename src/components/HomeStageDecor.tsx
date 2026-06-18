const homeTitleImageSrc = new URL("../../ゲームタイトルボタン.png?v=home-ui-transparent-3", import.meta.url).href;
const homeCharacterImageSrc = new URL("../../ホームキャラクター①.png?v=home-ui-transparent-3", import.meta.url).href;

interface HomeStageDecorProps {
  dimmed?: boolean;
  returning?: boolean;
}

export default function HomeStageDecor({
  dimmed = false,
  returning = false,
}: HomeStageDecorProps) {
  return (
    <div
      className={`home-stage-decor ${dimmed ? "is-dimmed" : ""} ${returning ? "is-returning" : ""}`}
      aria-hidden="true"
    >
      <section className="home-title" aria-label="Mahjong Poker Card Game">
        <img src={homeTitleImageSrc} alt="" draggable={false} />
      </section>
      <img
        className="home-character"
        src={homeCharacterImageSrc}
        alt=""
        draggable={false}
      />
    </div>
  );
}
