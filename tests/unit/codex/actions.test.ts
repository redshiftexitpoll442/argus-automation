import { describe, expect, it } from "vitest";
import { parseCodexComputerActions } from "../../../src/codex/actions.js";

describe("Codex action parser", () => {
  it("parses GPT-style actions", () => {
    const actions = parseCodexComputerActions([
      { type: "click", x: 10, y: 20, button: "left" },
      { type: "keypress", keys: ["CTRL", "V"] },
      { type: "type", text: "hello" },
      { type: "wait", seconds: 0.1 },
    ]);

    expect(actions).toHaveLength(4);
    expect(actions[0]).toMatchObject({ type: "click", x: 10, y: 20 });
    expect(actions[1]).toMatchObject({ type: "keypress", keys: ["CTRL", "V"] });
  });

  it("rejects unsupported actions", () => {
    expect(() => parseCodexComputerActions([{ type: "launch" }])).toThrow(
      "Unsupported action type",
    );
  });
});

