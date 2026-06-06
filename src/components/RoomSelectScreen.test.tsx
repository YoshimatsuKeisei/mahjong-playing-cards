import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultDaifugoOptions } from "../game/deck";
import RoomListScreen from "./RoomListScreen";
import RoomSelectScreen from "./RoomSelectScreen";

describe("RoomSelectScreen", () => {
  it("lets players choose whether to create or join a room", async () => {
    const user = userEvent.setup();
    const onCreateRoom = vi.fn();
    const onJoinRoom = vi.fn();
    const onBackHome = vi.fn();

    render(<RoomSelectScreen onBackHome={onBackHome} onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />);

    expect(screen.getByRole("heading", { name: "ルーム選択" })).toBeInTheDocument();
    expect(screen.getByText("自分で新しいルームを作成します")).toBeInTheDocument();
    expect(screen.getByText("現在募集中のルームに参加します")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ルームを立ち上げる/ }));
    await user.click(screen.getByRole("button", { name: /ルームに入る/ }));
    await user.click(screen.getByRole("button", { name: "ホーム画面に戻る" }));

    expect(onCreateRoom).toHaveBeenCalledTimes(1);
    expect(onJoinRoom).toHaveBeenCalledTimes(1);
    expect(onBackHome).toHaveBeenCalledTimes(1);
  });
});

describe("RoomListScreen", () => {
  it("shows an empty recruiting room list and navigation actions", async () => {
    const user = userEvent.setup();
    const onBackToSelect = vi.fn();
    const onBackHome = vi.fn();
    const onJoinRoom = vi.fn();
    const onRefresh = vi.fn();

    render(<RoomListScreen onJoinRoom={onJoinRoom} onRefresh={onRefresh} onBackHome={onBackHome} onBackToSelect={onBackToSelect} />);

    expect(screen.getByRole("heading", { name: "募集中ルーム一覧" })).toBeInTheDocument();
    expect(screen.getByText("現在募集中のルームはありません")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ルーム選択に戻る" }));
    await user.click(screen.getByRole("button", { name: "更新" }));
    await user.click(screen.getByRole("button", { name: "ホーム画面に戻る" }));

    expect(onBackToSelect).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onBackHome).toHaveBeenCalledTimes(1);
  });

  it("shows public room details and joins without showing a room id input", async () => {
    const user = userEvent.setup();
    const onJoinRoom = vi.fn();
    const daifugoOptions = createDefaultDaifugoOptions();

    render(
      <RoomListScreen
        rooms={[
          {
            roomId: "ABC123",
            roomName: "初心者歓迎ルーム",
            totalPlayers: 4,
            humanPlayers: 3,
            joinedHumanPlayers: 1,
            cpuPlayers: 1,
            cpuModelIds: ["tactical"],
            matchType: "rounds",
            roundCount: 10,
            daifugoOptions: {
              ...daifugoOptions,
              enabled: true,
              effects: {
                fiveSkip: true,
                sevenExchange: true,
                eightExtraTurn: true,
                nineReverse: true,
                tenSwapDraw: true,
                jackBack: true,
                queenNumberVanish: true,
              },
            },
            createdAt: 1,
          },
        ]}
        onJoinRoom={onJoinRoom}
        onRefresh={vi.fn()}
        onBackHome={vi.fn()}
        onBackToSelect={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("room-id-input")).not.toBeInTheDocument();
    expect(screen.getByText("初心者歓迎ルーム")).toBeInTheDocument();
    expect(screen.getByText("ルーム名")).toBeInTheDocument();
    expect(screen.getByText("人数")).toBeInTheDocument();
    expect(screen.getByText("試合形式")).toBeInTheDocument();
    expect(screen.getByText("詳細")).toBeInTheDocument();
    expect(screen.getByText("追加ルール")).toBeInTheDocument();
    expect(screen.getByText("募集人数")).toBeInTheDocument();
    expect(screen.getByText("4人プレイ")).toBeInTheDocument();
    expect(screen.getByText("局数制")).toBeInTheDocument();
    expect(screen.getByText("10局")).toBeInTheDocument();
    const extraRules = screen.getByTestId("public-room-extra-rules");
    expect(extraRules).toHaveTextContent("大富豪あり");
    for (const label of ["5", "7", "8", "9", "10", "J", "Q"]) {
      expect(extraRules).toHaveTextContent(label);
    }
    expect(screen.getByTestId("public-room-recruitment")).toHaveTextContent("募集人数 1/3人");
    expect(screen.getByTestId("public-room-cpu")).toHaveTextContent("CPU(Pro)1体");

    await user.click(screen.getByRole("button", { name: "参加" }));
    expect(onJoinRoom).toHaveBeenCalledWith("ABC123");
  });

  it("shows no extra rule and CPUなし for plain human rooms", () => {
    render(
      <RoomListScreen
        rooms={[
          {
            roomId: "PLAIN1",
            roomName: "通常ルーム",
            totalPlayers: 4,
            humanPlayers: 4,
            joinedHumanPlayers: 2,
            cpuPlayers: 0,
            cpuModelIds: [],
            matchType: "targetScore",
            targetScore: 1000,
            daifugoOptions: createDefaultDaifugoOptions(),
            createdAt: 1,
          },
        ]}
        onJoinRoom={vi.fn()}
        onRefresh={vi.fn()}
        onBackHome={vi.fn()}
        onBackToSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("目標点制")).toBeInTheDocument();
    expect(screen.getByText("1000点目標")).toBeInTheDocument();
    expect(screen.getByTestId("public-room-extra-rules")).toHaveTextContent("なし");
    expect(screen.getByTestId("public-room-cpu")).toHaveTextContent("CPUなし");
  });
});
