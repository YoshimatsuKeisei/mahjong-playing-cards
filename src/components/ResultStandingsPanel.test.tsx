import { describe, expect, it } from "vitest";
import type { Player } from "../types";
import { buildStandingsRaceModel } from "./ResultStandingsPanel";

function players(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `プレイヤー${index + 1}`,
    hand: [],
    discardPile: [],
    openMelds: [],
    hasCalled: false,
    isReach: false,
  }));
}

describe("ResultStandingsPanel model", () => {
  it("sorts rows by current value while keeping previous ranks", () => {
    const model = buildStandingsRaceModel(players(3), {
      mode: "rounds",
      previousValues: [2000, 0, 0],
      values: [2000, 2800, 0],
    });

    expect(model.rows.find((row) => row.playerName === "プレイヤー2")?.currentRank).toBe(1);
    expect(model.rows.find((row) => row.playerName === "プレイヤー2")?.previousRank).toBe(2);
    expect(model.rows[0].playerName).toBe("プレイヤー2");
  });

  it("calculates positive, negative, and unchanged deltas", () => {
    const model = buildStandingsRaceModel(players(3), {
      mode: "startingPoints",
      axisMax: 100,
      previousValues: [100, 100, 72],
      values: [72, 100, 72],
    });

    expect(model.rows.find((row) => row.playerName === "プレイヤー1")?.delta).toBe(-28);
    expect(model.rows.find((row) => row.playerName === "プレイヤー2")?.delta).toBe(0);
    expect(model.rows.find((row) => row.playerName === "プレイヤー3")?.delta).toBe(0);
  });

  it("uses a nice rounded axis for rounds and fixed target axes for target and points modes", () => {
    expect(buildStandingsRaceModel(players(3), { mode: "rounds", values: [2800, 0, 0] }).axisMax).toBe(3000);
    expect(buildStandingsRaceModel(players(3), { mode: "targetScore", values: [51, 20, 0], axisMax: 100 }).axisMax).toBe(100);
    expect(buildStandingsRaceModel(players(3), { mode: "startingPoints", values: [72, 100, 72], axisMax: 100 }).axisMax).toBe(100);
  });

  it("keeps tiny non-zero bars visible and zero bars hidden", () => {
    const model = buildStandingsRaceModel(players(3), {
      mode: "rounds",
      previousValues: [100000, 2000, 0],
      values: [100000, 2000, 0],
    });

    expect(model.rows.find((row) => row.playerName === "プレイヤー2")?.currentWidthPercent).toBe(5);
    expect(model.rows.find((row) => row.playerName === "プレイヤー3")?.currentWidthPercent).toBe(0);
  });
});
