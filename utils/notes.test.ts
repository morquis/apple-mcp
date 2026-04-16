import { describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.ts";

describe("notes", () => {
  it("getAllNotes returns an array", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue([] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const notes = (await import("./notes.ts")).default;
    const result = await notes.getAllNotes();

    expect(Array.isArray(result)).toBe(true);
    expect(executeJXASpy).toHaveBeenCalledTimes(1);

    mock.restore();
  });
});
