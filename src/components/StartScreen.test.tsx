import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StartScreen, {
  buildHumanPlayerOptions,
  getSettingsError,
  MATCH_RULE_SETTINGS,
  type MatchRuleType,
} from "./StartScreen";

describe("StartScreen room settings validation", () => {
  it.each([
    { matchType: "fixedRounds", values: ["1", "10", "100"] },
    { matchType: "targetScore", values: ["50", "1000", "10000"] },
    { matchType: "startingPoints", values: ["50", "1000", "10000"] },
  ] satisfies Array<{ matchType: MatchRuleType; values: string[] }>)(
    "accepts valid values for $matchType",
    ({ matchType, values }) => {
      for (const value of values) {
        expect(getSettingsError(matchType, value)).toBe("");
      }
    },
  );

  it.each([
    {
      matchType: "fixedRounds",
      values: ["0", "101", "", "1.5", "abc"],
      message: "対戦回数は1〜100の整数で入力してください。",
    },
    {
      matchType: "targetScore",
      values: ["49", "10001", "100000", "", "50.5", "abc"],
      message: "目標点は50〜10000の整数で入力してください。",
    },
    {
      matchType: "startingPoints",
      values: ["49", "10001", "100000", "", "50.5", "abc"],
      message: "初期持ち点は50〜10000の整数で入力してください。",
    },
  ] satisfies Array<{
    matchType: MatchRuleType;
    values: string[];
    message: string;
  }>)(
    "rejects invalid values for $matchType",
    ({ matchType, values, message }) => {
      for (const value of values) {
        expect(getSettingsError(matchType, value)).not.toBe("");
      }

      for (const value of values.filter((item) => item !== "")) {
        expect(getSettingsError(matchType, value)).toBe(message);
      }
    },
  );

  it("shows fixed room rule labels and does not show the old time rule wording", () => {
    render(<StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />);

    expect(screen.queryByText("時間制")).not.toBeInTheDocument();
    expect(screen.queryByText("回転方向")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /持ち点制/ }),
    ).toBeInTheDocument();
  });

  it("shows the room name field before player count and starts with no CPU difficulty", () => {
    const { container } = render(
      <StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />,
    );

    const roomNameInput = screen.getByLabelText("ルーム名");
    const playerCountLabel = screen.getByText("プレイヤー人数");
    const topRow = container.querySelector(".room-top-row");

    expect(roomNameInput).toHaveAttribute(
      "placeholder",
      "例: 初心者歓迎ルーム",
    );
    expect(
      roomNameInput.compareDocumentPosition(playerCountLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(topRow).toContainElement(roomNameInput);
    expect(topRow).toContainElement(screen.getByRole("switch"));
    expect(screen.queryByText("CPUの強さ")).not.toBeInTheDocument();
  });

  it("keeps rule descriptions on the match type cards but removes them from the detail panel", () => {
    const { container } = render(
      <StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", {
        name: new RegExp(MATCH_RULE_SETTINGS.fixedRounds.description),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: new RegExp(MATCH_RULE_SETTINGS.targetScore.description),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: new RegExp(MATCH_RULE_SETTINGS.startingPoints.description),
      }),
    ).toBeInTheDocument();

    const detailPanel = container.querySelector(".room-settings");
    expect(detailPanel).toHaveTextContent(
      MATCH_RULE_SETTINGS.fixedRounds.inputLabel,
    );
    expect(detailPanel).not.toHaveTextContent(
      MATCH_RULE_SETTINGS.fixedRounds.description,
    );
  });

  it.each([
    {
      total: 3,
      labels: ["Player 3人", "Player 2人 + CPU 1体", "Player 1人 + CPU 2体"],
    },
    {
      total: 4,
      labels: [
        "Player 4人",
        "Player 3人 + CPU 1体",
        "Player 2人 + CPU 2体",
        "Player 1人 + CPU 3体",
      ],
    },
    {
      total: 5,
      labels: [
        "Player 5人",
        "Player 4人 + CPU 1体",
        "Player 3人 + CPU 2体",
        "Player 2人 + CPU 3体",
        "Player 1人 + CPU 4体",
      ],
    },
  ])(
    "shows player composition options for $total players",
    async ({ total, labels }) => {
      const user = userEvent.setup();
      render(<StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: `${total}人` }));

      for (const label of labels) {
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      }
      expect(buildHumanPlayerOptions(total as 3 | 4 | 5)).toHaveLength(total);
    },
  );

  it("does not show CPU difficulty even when CPU players are selected", async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />);

    expect(screen.queryByText("CPUの強さ")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Player 3人 + CPU 1体" }),
    );

    expect(screen.queryByText("CPUの強さ")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "やさしい" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ふつう" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "つよい" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Player 4人" }));

    expect(screen.queryByText("CPUの強さ")).not.toBeInTheDocument();
  });

  it("disables CPU composition choices while online CPU support is paused", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onBackHome={vi.fn()} />);

    expect(screen.queryByText("CPU設定")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Player 3.*CPU 1/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Player 2.*CPU 2/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Player 1.*CPU 3/ }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Player 3.*CPU 1/ }));

    expect(screen.queryByText("CPU設定")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(onStart).toHaveBeenCalledWith(
      4,
      "clockwise",
      "rounds",
      10,
      expect.objectContaining({
        cpuModelId: "standard",
        cpuModelIds: [],
        cpuPlayers: 0,
        humanPlayers: 4,
        showCpuActions: true,
      }),
    );
  });

  it("toggles visibility with a switch and keeps CPU compositions disabled", async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />);

    const visibilitySwitch = screen.getByRole("switch");
    expect(visibilitySwitch).toHaveAttribute("aria-checked", "false");
    expect(visibilitySwitch).toHaveClass("is-private");
    expect(
      visibilitySwitch.querySelector(".visibility-switch-track"),
    ).not.toHaveTextContent(/Private|Public|\d/);
    expect(
      visibilitySwitch.querySelector(".visibility-switch-label"),
    ).toHaveTextContent("Private");

    await user.click(visibilitySwitch);
    expect(visibilitySwitch).toHaveAttribute("aria-checked", "true");
    expect(visibilitySwitch).toHaveClass("is-public");
    expect(
      visibilitySwitch.querySelector(".visibility-switch-track"),
    ).not.toHaveTextContent(/Private|Public|\d/);
    expect(
      visibilitySwitch.querySelector(".visibility-switch-label"),
    ).toHaveTextContent("Public");

    await user.click(visibilitySwitch);
    expect(visibilitySwitch).toHaveAttribute("aria-checked", "false");
    expect(visibilitySwitch).toHaveClass("is-private");
    expect(
      visibilitySwitch.querySelector(".visibility-switch-label"),
    ).toHaveTextContent("Private");

    await user.click(visibilitySwitch);
    expect(visibilitySwitch).toHaveAttribute("aria-checked", "true");

    expect(
      screen.getByRole("button", { name: "Player 1人 + CPU 3体" }),
    ).toBeDisabled();
    expect(visibilitySwitch).toBeEnabled();
    expect(visibilitySwitch).toHaveAttribute("aria-checked", "true");
  });

  it("shows an error and disables create when the target score is out of range", async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /目標点制/ }));
    const input = screen.getByLabelText(
      MATCH_RULE_SETTINGS.targetScore.inputLabel,
    );
    await user.clear(input);
    await user.type(input, "100000");

    const error = screen.getByText(
      "目標点は50〜10000の整数で入力してください。",
    );
    expect(error).toHaveClass("room-error");
    expect(screen.getByRole("button", { name: "作成" })).toBeDisabled();
  });

  it("does not show an error and enables create when the starting points value is valid", async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /持ち点制/ }));
    const input = screen.getByLabelText(
      MATCH_RULE_SETTINGS.startingPoints.inputLabel,
    );
    await user.clear(input);
    await user.type(input, "1000");

    expect(
      screen.queryByText("初期持ち点は50〜10000の整数で入力してください。"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作成" })).toBeEnabled();
  });

  it("passes the fixed round count when creating a rounds match", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onBackHome={vi.fn()} />);

    const input = screen.getByLabelText(
      MATCH_RULE_SETTINGS.fixedRounds.inputLabel,
    );
    await user.clear(input);
    await user.type(input, "3");
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(onStart).toHaveBeenCalledWith(
      4,
      "clockwise",
      "rounds",
      3,
      expect.objectContaining({
        cpuPlayers: 0,
        humanPlayers: 4,
        matchType: "rounds",
        roomName: "名無しのルーム",
        roundCount: 3,
        totalPlayers: 4,
        turnDirection: "clockwise",
        visibility: "private",
      }),
    );
  });

  it("separates cancel from returning to the home screen", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onBackHome = vi.fn();
    render(
      <StartScreen
        onStart={vi.fn()}
        onBackHome={onBackHome}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    await user.click(screen.getByRole("button", { name: "ホーム画面に戻る" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onBackHome).toHaveBeenCalledTimes(1);
  });

  it("passes the target score value when creating a target-score match", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onBackHome={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /目標点制/ }));
    const input = screen.getByLabelText(
      MATCH_RULE_SETTINGS.targetScore.inputLabel,
    );
    await user.clear(input);
    await user.type(input, "50");
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(onStart).toHaveBeenCalledWith(
      4,
      "clockwise",
      "targetScore",
      50,
      expect.objectContaining({
        matchType: "targetScore",
        targetScore: 50,
      }),
    );
  });

  it("passes room composition, visibility, and room name when creating", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onBackHome={vi.fn()} />);

    await user.type(screen.getByLabelText("ルーム名"), "初心者歓迎ルーム");
    await user.click(screen.getAllByRole("switch")[0]);
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(onStart).toHaveBeenCalledWith(
      4,
      "clockwise",
      "rounds",
      10,
      expect.objectContaining({
        cpuPlayers: 0,
        humanPlayers: 4,
        cpuModelIds: [],
        roomName: "初心者歓迎ルーム",
        totalPlayers: 4,
        visibility: "public",
      }),
    );
  });
});
