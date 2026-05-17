import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

    render(<RoomListScreen onBackHome={onBackHome} onBackToSelect={onBackToSelect} />);

    expect(screen.getByRole("heading", { name: "募集中ルーム一覧" })).toBeInTheDocument();
    expect(screen.getByText("現在募集中のルームはありません")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ルーム選択に戻る" }));
    await user.click(screen.getByRole("button", { name: "ホーム画面に戻る" }));

    expect(onBackToSelect).toHaveBeenCalledTimes(1);
    expect(onBackHome).toHaveBeenCalledTimes(1);
  });
});
