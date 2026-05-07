import { afterAll, describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  _runWithChild,
  DEFAULT_KILL_GRACE_MS,
  executeJXA,
  JXAAppNotRunningError,
  JXAConverters,
  JXAExecutionError,
  wrapJXAFunction,
} from "./jxa-bridge.js";

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

  it("exports a sane SIGKILL-grace default", () => {
    expect(DEFAULT_KILL_GRACE_MS).toBeGreaterThanOrEqual(1_000);
    expect(DEFAULT_KILL_GRACE_MS).toBeLessThanOrEqual(30_000);
  });
});

// SIGKILL escalation against a child that ignores SIGTERM.
// We start a bash wrapper with `trap '' TERM` (ignoring SIGTERM) plus
// a `sleep`. This path only exists because `osascript` sometimes ignores
// SIGTERM in practice while an Apple Events IPC call is active. The
// wrapper simulates the behavior deterministically.
describe("executeJXA SIGKILL escalation", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "jxa-bridge-sigterm-"));
  const scriptPath = join(fixtureDir, "ignore-sigterm.sh");
  writeFileSync(
    scriptPath,
    "#!/bin/bash\ntrap '' TERM\nsleep 60\n",
    { mode: 0o755 },
  );
  chmodSync(scriptPath, 0o755);

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("escalates to SIGKILL when the child ignores SIGTERM", async () => {
    const start = Date.now();
    let rejectionTime = 0;

    await expect(
      _runWithChild("/bin/bash", [scriptPath], "<sigterm-ignore-fixture>", {
        timeout: 200,
        killGraceMs: 400,
        parseJSON: false,
      }).catch((err) => {
        rejectionTime = Date.now() - start;
        throw err;
      }),
    ).rejects.toMatchObject({
      name: "JXAExecutionError",
      timedOut: true,
      timeoutMs: 200,
    });

    // Promise rejection fires immediately on timeout (not only after grace).
    expect(rejectionTime).toBeLessThan(800);

    // Wait safely past the SIGKILL escalation so the child is really dead
    // before the test ends.
    await new Promise((r) => setTimeout(r, 800));
  }, 5_000);

  it("does not escalate when the child exits normally before timeout", async () => {
    // /bin/echo finishes immediately; escalation timer must not even
    // start running, otherwise it would block the unref'ed hard exit.
    const result = await _runWithChild<string>(
      "/bin/echo",
      ["hello"],
      "<echo-fixture>",
      { parseJSON: false, timeout: 5_000, killGraceMs: 100 },
    );
    expect(result).toBe("hello");
  });
});
