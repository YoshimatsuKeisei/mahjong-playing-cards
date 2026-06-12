import type { CSSProperties } from "react";
import type { Player } from "../types";

interface PlayerAreaProps {
  player: Player;
  isCurrent: boolean;
  seat: "top" | "right" | "bottom" | "left";
  displayName?: string;
  temporaryLeaveStatus?: string | null;
  style?: CSSProperties;
}

export default function PlayerArea({
  player,
  isCurrent,
  seat,
  displayName,
  temporaryLeaveStatus,
  style,
}: PlayerAreaProps) {
  return (
    <article
      className={`player-area seat-${seat} ${isCurrent ? "current" : ""}`}
      data-testid="player-area"
      data-player-id={player.id}
      data-open-meld-count={player.openMelds.length}
      data-is-reach={player.isReach ? "true" : "false"}
      style={style}
    >
      <div className="hooded-player" aria-hidden="true">
        <div className="hooded-head">
          <div className="hood-shadow" />
        </div>
        <div className="hooded-body" />
        <div className="hooded-sleeve left" />
        <div className="hooded-sleeve right" />
      </div>
      <div className="seat-label">
        <strong>{displayName ?? player.name}</strong>
        <span>{getPlayerStatus(player)}</span>
        {temporaryLeaveStatus && (
          <span className="temporary-leave-seat-status">
            {temporaryLeaveStatus}
          </span>
        )}
        {player.hasJEnhancementRight && (
          <span className="j-enhancement-badge">J強化権あり</span>
        )}
        {player.jShield && (
          <span className="j-shield-badge">Jシールド発動中</span>
        )}
      </div>
    </article>
  );
}

function getPlayerStatus(player: Player) {
  if (player.isReach) return "リーチ中";
  if (player.hasCalled) return "鳴き済み";
  if (player.isCpu) return `${player.cpuModelId ?? "standard"}-CPU`;
  return "通常";
}
