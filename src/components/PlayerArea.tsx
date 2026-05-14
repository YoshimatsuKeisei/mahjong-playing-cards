import type { CSSProperties } from "react";
import type { Player } from "../types";

interface PlayerAreaProps {
  player: Player;
  isCurrent: boolean;
  seat: "top" | "right" | "bottom" | "left";
  style?: CSSProperties;
}

export default function PlayerArea({ player, isCurrent, seat, style }: PlayerAreaProps) {
  return (
    <article className={`player-area seat-${seat} ${isCurrent ? "current" : ""}`} style={style}>
      <div className="hooded-player" aria-hidden="true">
        <div className="hooded-head">
          <div className="hood-shadow" />
        </div>
        <div className="hooded-body" />
        <div className="hooded-sleeve left" />
        <div className="hooded-sleeve right" />
      </div>
      <div className="seat-label">
        <strong>{player.name}</strong>
        <span>{getPlayerStatus(player)}</span>
      </div>
    </article>
  );
}

function getPlayerStatus(player: Player) {
  if (player.isReach) return "リーチ中";
  if (player.hasCalled) return "鳴き済み";
  return "通常";
}
