/**
 * Hard watchdog for `bun test` runs.
 *
 * Background: a hung `osascript` child can keep the Bun test worker alive
 * indefinitely; if the user closes the terminal, launchd adopts the worker as
 * an orphan that polls forever. This watchdog enforces a hard `process.exit(1)`
 * after a configurable budget so a hung run cannot survive its own session.
 *
 * Activation: only when `APPLE_MCP_INTEGRATION=1` is set, so unit-test runs
 * (which are fast) are not affected. Override the budget via
 * `APPLE_MCP_TEST_WATCHDOG_MS=<ms>`. Default: 600_000 ms (10 minutes).
 *
 * Loaded via `bunfig.toml` `preload`. Pure side-effect module; no exports.
 */

const isIntegrationRun = process.env.APPLE_MCP_INTEGRATION === "1";

if (isIntegrationRun) {
  const raw = process.env.APPLE_MCP_TEST_WATCHDOG_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const budgetMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 600_000;

  const handle = setTimeout(() => {
    process.stderr.write(
      `[watchdog] Test run exceeded ${budgetMs} ms — forcing exit. Likely a hung test.\n`,
    );
    process.exit(1);
  }, budgetMs);

  // Don't keep the event loop alive solely for the watchdog — if everything
  // else legitimately finishes, Bun should be free to exit.
  handle.unref?.();
}
