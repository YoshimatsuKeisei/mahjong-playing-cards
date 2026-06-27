import { getHomeCharacterSrcByAvatarId } from "../data/avatars";

const homeTitleImageSrc = new URL("../../ゲームタイトルボタン.png?v=home-ui-transparent-3", import.meta.url).href;

interface HomeStageDecorProps {
  avatarId: string;
  dimmed?: boolean;
  returning?: boolean;
}

export default function HomeStageDecor({
  avatarId,
  dimmed = false,
  returning = false,
}: HomeStageDecorProps) {
  const homeCharacterImageSrc = getHomeCharacterSrcByAvatarId(avatarId);

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
