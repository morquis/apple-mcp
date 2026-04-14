import { describe, expect, it } from "bun:test";

import {
  executeJXA,
  JXAAppNotRunningError,
  JXAConverters,
  JXAExecutionError,
  wrapJXAFunction,
} from "./jxa-bridge.ts";

describe("executeJXA", () => {
  it("returns raw stdout when parseJSON is false", async () => {
    const result = await executeJXA('"hello from JXA"', { parseJSON: false });
    expect(result).toBe("hello from JXA");
  });

  it("parses JSON output and supports converter snippets", async () => {
    const script = wrapJXAFunction(`
      ObjC.import("Foundation");

      return JSON.stringify({
        text: ${JXAConverters.toString('$("bridge")')},
        iso: ${JXAConverters.toISOString('new Date("2024-01-02T03:04:05.000Z")')},
        safe: ${JXAConverters.safeGet('{ value: () => "present" }', "value")},
        missing: ${JXAConverters.safeGet("null", "value", '"fallback"')}
      });
    `);

    const result = await executeJXA<{
      text: string;
      iso: string;
      safe: string;
      missing: string;
    }>(script);

    expect(result).toEqual({
      text: "bridge",
      iso: "2024-01-02T03:04:05.000Z",
      safe: "present",
      missing: "fallback",
    });
  });

  it("turns wrapped JXA failures into JXAExecutionError", async () => {
    const script = wrapJXAFunction(`
      throw new Error("boom");
    `);

    await expect(executeJXA(script)).rejects.toBeInstanceOf(JXAExecutionError);
  });

  it("times out long-running scripts and kills the child process", async () => {
    const slowScript = `
      (() => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 1000) {}
        return "slow";
      })()
    `;

    await expect(
      executeJXA(slowScript, { parseJSON: false, timeout: 50 }),
    ).rejects.toMatchObject({
      name: "JXAExecutionError",
      timedOut: true,
      timeoutMs: 50,
    });
  });

  it("exports a specific app-not-running error type", () => {
    const error = new JXAAppNotRunningError(
      "Mail is not installed or not running",
      {
        script: 'Application("Mail").name()',
        stdout: "",
        stderr: 'execution error: Can\'t get application "Mail". (-1728)',
        exitCode: 1,
        signal: null,
        timedOut: false,
        timeoutMs: 30_000,
      },
      "Mail",
    );

    expect(error).toBeInstanceOf(JXAExecutionError);
    expect(error.appName).toBe("Mail");
  });
});
