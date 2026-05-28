import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { advanceRound, createInterruptedFinalMatchState, createMatchState, syncMatchGameState } from "../game/matchState";
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

  it("uses completed rounds as the displayed total for interrupted round matches", () => {
    const resultState = createDoubleRonResultFixture();
    let match = createMatchState("rounds", 3, "clockwise", 10, "途中退出テスト");

    for (let round = 1; round <= 4; round += 1) {
      match = syncMatchGameState(match, resultState)!;
      if (round < 4) {
        match = advanceRound(match);
      }
    }

    render(
      <FinalResultScreen
        matchState={createInterruptedFinalMatchState({ ...match, currentRound: 5 })}
        players={resultState.players}
        onJoinAnotherMatch={vi.fn()}
        onBackHome={vi.fn()}
      />,
    );

    expect(screen.getByText("4回戦")).toBeInTheDocument();
    expect(screen.queryByText("10回戦")).not.toBeInTheDocument();
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

  it.each([4, 5])("renders final summaries and chart legends for all %i players", (playerCount) => {
    const resultState = createSingleRonResultFixture();
    const players = Array.from({ length: playerCount }, (_, index) => ({
      ...resultState.players[index % resultState.players.length],
      id: `player-${index + 1}`,
      name: `プレイヤー${index + 1}`,
    }));
    const match = {
      ...syncMatchGameState(createMatchState("rounds", 3, "clockwise", 1, "人数確認部屋"), resultState)!,
      playerCount,
      gameState: { ...resultState, players },
      cumulativeScores: Array.from({ length: playerCount }, (_, index) => (index === 0 ? 2100 : 0)),
      pointBalances: Array.from({ length: playerCount }, () => 0),
      history: [
        {
          ...syncMatchGameState(createMatchState("rounds", 3, "clockwise", 1, "人数確認部屋"), resultState)!.history[0],
          cumulativeScoresAfter: Array.from({ length: playerCount }, (_, index) => (index === 0 ? 2100 : 0)),
          pointBalancesAfter: Array.from({ length: playerCount }, () => 0),
          playerLosses: Array.from({ length: playerCount }, (_, index) => index + 1),
        },
      ],
    };

    render(<FinalResultScreen matchState={match} players={players} onJoinAnotherMatch={vi.fn()} onBackHome={vi.fn()} />);

    expect(screen.getByText(`${playerCount}人`)).toBeInTheDocument();
    expect(screen.getAllByText(`プレイヤー${playerCount}`).length).toBeGreaterThan(0);
  });
});
