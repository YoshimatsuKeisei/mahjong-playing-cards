import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMatchState, syncMatchGameState } from "../game/matchState";
import { createDoubleRonResultFixture, createSingleRonResultFixture, createStartingPointsTsumoResultFixture } from "../game/resultFixtures";
import FinalResultScreen, { buildFinalResultModel } from "./FinalResultScreen";

describe("FinalResultScreen", () => {
  it("shows final room metadata, standings table, chart, and navigation actions", async () => {
    const user = userEvent.setup();
    const onJoinAnotherMatch = vi.fn();
    const onBackHome = vi.fn();
    const resultState = createSingleRonResultFixture();
    const match = syncMatchGameState(createMatchState("rounds", 3, "clockwise", 1, "初心者歓迎ルーム"), resultState)!;

    render(<FinalResultScreen matchState={match} players={resultState.players} onJoinAnotherMatch={onJoinAnotherMatch} onBackHome={onBackHome} />);

    expect(screen.getByRole("heading", { name: "最終結果" })).toBeInTheDocument();
    expect(screen.getByText(/の優勝/)).toBeInTheDocument();
    expect(screen.getByText("初心者歓迎ルーム")).toBeInTheDocument();
    expect(screen.getByText("局数制")).toBeInTheDocument();
    expect(screen.getByText("3人")).toBeInTheDocument();
    expect(screen.getByText("1回戦")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "得点推移グラフ" })).toBeInTheDocument();
    expect(document.querySelector(".final-chart-y-tick text")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "失点効率" })).toBeInTheDocument();
    expect(screen.getByText(/守備・頭脳プレーの指標/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "別の試合に参加する" }));
    await user.click(screen.getByRole("button", { name: "ホーム画面に戻る" }));

    expect(onJoinAnotherMatch).toHaveBeenCalledTimes(1);
    expect(onBackHome).toHaveBeenCalledTimes(1);
  });

  it("aggregates double ron winners, losses, pure losses, and loss efficiency", () => {
    const resultState = createDoubleRonResultFixture();
    const match = syncMatchGameState(createMatchState("rounds", 3, "clockwise", 1, "Wロン部屋"), resultState)!;
    const model = buildFinalResultModel(match, resultState.players);

    const player1 = model.summaries.find((summary) => summary.playerIndex === 0)!;
    const player2 = model.summaries.find((summary) => summary.playerIndex === 1)!;
    const player3 = model.summaries.find((summary) => summary.playerIndex === 2)!;

    expect(player1.ronWins).toBe(1);
    expect(player3.ronWins).toBe(1);
    expect(player2.pureLoss).toBe(28);
    expect(player2.loserCount).toBe(1);
    expect(player2.lossEfficiency).toBe(28);
    expect(player3.totalLoss).toBe(5);
  });

  it("aggregates tsumo wins and uses em dash when a player was never a loser", () => {
    const resultState = createStartingPointsTsumoResultFixture();
    const match = syncMatchGameState(createMatchState("targetScore", 3, "clockwise", 100, "ツモ部屋"), resultState)!;
    const model = buildFinalResultModel(match, resultState.players);

    const winner = model.summaries.find((summary) => summary.playerIndex === 1)!;

    expect(winner.tsumoWins).toBe(1);
    expect(winner.loserCount).toBe(0);
    expect(winner.lossEfficiency).toBeNull();
    expect(model.primaryRuleLabel).toBe("目標点");
    expect(model.chartPoints).toHaveLength(2);
  });

  it("shows starting-points metadata with initial points and ended round", () => {
    const resultState = createStartingPointsTsumoResultFixture();
    const match = syncMatchGameState(createMatchState("startingPoints", 3, "clockwise", 40, "持ち点部屋"), resultState)!;

    render(<FinalResultScreen matchState={match} players={resultState.players} onJoinAnotherMatch={vi.fn()} onBackHome={vi.fn()} />);

    expect(screen.getByText("持ち点制")).toBeInTheDocument();
    expect(screen.getByText("40点 / 1回戦")).toBeInTheDocument();
  });
});
