import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StartScreen, { getSettingsError, MATCH_RULE_SETTINGS, type MatchRuleType } from "./StartScreen";

describe("StartScreen room settings validation", () => {
  it.each([
    { matchType: "fixedRounds", values: ["1", "10", "100"] },
    { matchType: "targetScore", values: ["50", "1000", "10000"] },
    { matchType: "startingPoints", values: ["50", "1000", "10000"] },
  ] satisfies Array<{ matchType: MatchRuleType; values: string[] }>)("accepts valid values for $matchType", ({ matchType, values }) => {
    for (const value of values) {
      expect(getSettingsError(matchType, value)).toBe("");
    }
  });

  it.each([
    { matchType: "fixedRounds", values: ["0", "101", "", "1.5", "abc"], message: "対戦回数は1〜100の整数で入力してください。" },
    { matchType: "targetScore", values: ["49", "10001", "100000", "", "50.5", "abc"], message: "目標点は50〜10000の整数で入力してください。" },
    { matchType: "startingPoints", values: ["49", "10001", "100000", "", "50.5", "abc"], message: "初期持ち点は50〜10000の整数で入力してください。" },
  ] satisfies Array<{ matchType: MatchRuleType; values: string[]; message: string }>)(
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
    expect(screen.getByRole("button", { name: /持ち点制/ })).toBeInTheDocument();
  });

  it("shows an error and disables create when the target score is out of range", async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /目標点制/ }));
    const input = screen.getByLabelText(MATCH_RULE_SETTINGS.targetScore.inputLabel);
    await user.clear(input);
    await user.type(input, "100000");

    const error = screen.getByText("目標点は50〜10000の整数で入力してください。");
    expect(error).toHaveClass("room-error");
    expect(screen.getByRole("button", { name: "作成" })).toBeDisabled();
  });

  it("does not show an error and enables create when the starting points value is valid", async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={vi.fn()} onBackHome={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /持ち点制/ }));
    const input = screen.getByLabelText(MATCH_RULE_SETTINGS.startingPoints.inputLabel);
    await user.clear(input);
    await user.type(input, "1000");

    expect(screen.queryByText("初期持ち点は50〜10000の整数で入力してください。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作成" })).toBeEnabled();
  });
});
