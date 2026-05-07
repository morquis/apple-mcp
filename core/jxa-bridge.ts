import { spawn } from "node:child_process";

export interface JXAExecutionOptions {
  timeout?: number;
  parseJSON?: boolean;
  /**
   * Grace period in ms after a SIGTERM (sent on timeout) before escalating to
   * SIGKILL. osascript sometimes ignores SIGTERM while it is blocked inside an
   * Apple Events IPC call; without escalation the child outlives the test
   * process and gets adopted by launchd. Defaults to {@link DEFAULT_KILL_GRACE_MS}.
   */
  killGraceMs?: number;
}

/**
 * Default delay before escalating from SIGTERM to SIGKILL on timeout.
 * The promise is already rejected at the SIGTERM point, so this only affects
 * how long we wait before we forcibly clean up an unresponsive child.
 */
export const DEFAULT_KILL_GRACE_MS = 5_000;

export interface JXAErrorContext {
  script: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  timeoutMs: number;
}

type WrappedJXAError = {
  success: false;
  error: string;
};

const APP_NOT_RUNNING_PATTERNS = [
  /Can’t get application ["’]([^"’]+)["’]/i,
  /Application can't be found/i,
  /Application isn'?t running/i,
  /Applikation .* gefunden/i,
];

function isWrappedJXAError(value: unknown): value is WrappedJXAError {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    "error" in value &&
    value.success === false &&
    typeof value.error === "string"
  );
}

function detectAppNotRunning(stderr: string): string | undefined {
  for (const pattern of APP_NOT_RUNNING_PATTERNS) {
    const match = stderr.match(pattern);
    if (!match) {
      continue;
    }

    return match[1];
  }

  return undefined;
}

function buildErrorContext(
  script: string,
  timeoutMs: number,
  stdout: string,
  stderr: string,
  exitCode: number | null = null,
  signal: NodeJS.Signals | null = null,
  timedOut = false,
): JXAErrorContext {
  return {
    script,
    stdout,
    stderr,
    exitCode,
    signal,
    timedOut,
    timeoutMs,
  };
}

function processFailureMessage(
  stderr: string,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
): string {
  const trimmed = stderr.trim();
  if (trimmed) {
    return trimmed;
  }

  if (signal) {
    return `osascript terminated with signal ${signal}`;
  }

  return `osascript exited with code ${exitCode ?? "unknown"}`;
}

export class JXAExecutionError extends Error {
  readonly script: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly timeoutMs: number;

  constructor(message: string, context: JXAErrorContext, cause?: unknown) {
    super(message, { cause });
    this.name = "JXAExecutionError";
    this.script = context.script;
    this.stdout = context.stdout;
    this.stderr = context.stderr;
    this.exitCode = context.exitCode;
    this.signal = context.signal;
    this.timedOut = context.timedOut;
    this.timeoutMs = context.timeoutMs;
  }
}

export class JXAAppNotRunningError extends JXAExecutionError {
  readonly appName?: string;

  constructor(message: string, context: JXAErrorContext, appName?: string, cause?: unknown) {
    super(message, context, cause);
    this.name = "JXAAppNotRunningError";
    this.appName = appName;
  }
}

/**
 * Internal seam for tests: lets jxa-bridge.test.ts substitute the spawned
 * binary with a wrapper that ignores SIGTERM, so the SIGKILL escalation path
 * can be exercised deterministically. Production code paths always use
 * "osascript" — do not call this directly outside of tests.
 *
 * @internal
 */
export async function _runWithChild<T = unknown>(
  command: string,
  args: readonly string[],
  script: string,
  options: JXAExecutionOptions = {},
): Promise<T | string> {
  const {
    timeout = 30_000,
    parseJSON = true,
    killGraceMs = DEFAULT_KILL_GRACE_MS,
  } = options;

  return new Promise<T | string>((resolve, reject) => {
    const child = spawn(command, args);

    let stdout = "";
    let stderr = "";
    let settled = false;
    let killEscalationTimer: ReturnType<typeof setTimeout> | undefined;

    const clearKillEscalation = () => {
      if (killEscalationTimer !== undefined) {
        clearTimeout(killEscalationTimer);
        killEscalationTimer = undefined;
      }
    };

    const settle = (handler: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      handler();
    };

    const timer = setTimeout(() => {
      const context = buildErrorContext(script, timeout, stdout, stderr, null, null, true);
      child.kill("SIGTERM");
      // osascript can ignore SIGTERM while it is blocked inside an Apple Events
      // IPC call (e.g. iterating ~3000 Contacts entries with active CloudKit
      // sync). Escalate to SIGKILL if the child has not exited within the grace
      // period — the parent promise has already rejected by then, so this only
      // prevents the orphaned child from being adopted by launchd.
      killEscalationTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Child may have exited between the check and the kill — harmless.
          }
        }
      }, killGraceMs);
      // Don't keep the event loop alive just for the escalation timer.
      killEscalationTimer.unref?.();
      settle(() => {
        reject(new JXAExecutionError(`JXA execution timed out after ${timeout} ms`, context));
      });
    }, timeout);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearKillEscalation();
      const context = buildErrorContext(script, timeout, stdout, stderr);
      settle(() => {
        reject(new JXAExecutionError("Failed to spawn osascript", context, error));
      });
    });

    child.on("close", (exitCode, signal) => {
      clearKillEscalation();
      const context = buildErrorContext(script, timeout, stdout, stderr, exitCode, signal);
      settle(() => {
        if (context.timedOut) {
          return;
        }

        if (exitCode !== 0) {
          const appName = detectAppNotRunning(stderr);
          if (appName !== undefined || APP_NOT_RUNNING_PATTERNS.some((pattern) => pattern.test(stderr))) {
            reject(
              new JXAAppNotRunningError(
                appName
                  ? `${appName} is not installed or not running`
                  : "The target application is not installed or not running",
                context,
                appName,
              ),
            );
            return;
          }

          reject(
            new JXAExecutionError(
              processFailureMessage(stderr, exitCode, signal),
              context,
            ),
          );
          return;
        }

        const output = stdout.trim();
        if (!parseJSON) {
          resolve(output);
          return;
        }

        if (!output) {
          resolve(undefined as T);
          return;
        }

        try {
          const parsed = JSON.parse(output) as T | WrappedJXAError;
          if (isWrappedJXAError(parsed)) {
            reject(new JXAExecutionError(parsed.error, context));
            return;
          }

          resolve(parsed as T);
        } catch (error) {
          reject(
            new JXAExecutionError(
              "Failed to parse JXA JSON output",
              context,
              error,
            ),
          );
        }
      });
    });
  });
}

export function executeJXA<T = unknown>(
  script: string,
  options?: JXAExecutionOptions & { parseJSON?: true },
): Promise<T>;
export function executeJXA(
  script: string,
  options: JXAExecutionOptions & { parseJSON: false },
): Promise<string>;
export function executeJXA<T = unknown>(
  script: string,
  options: JXAExecutionOptions = {},
): Promise<T | string> {
  return _runWithChild<T>(
    "osascript",
    ["-l", "JavaScript", "-e", script],
    script,
    options,
  );
}

export function wrapJXAFunction(functionBody: string): string {
  return `
(() => {
  try {
    ${functionBody}
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);

    return JSON.stringify({
      success: false,
      error: message,
    });
  }
})()
`.trim();
}

export const JXAConverters = {
  toString(expression: string, fallbackExpression = "null"): string {
    return `
(() => {
  const value = ${expression};

  if (value === null || value === undefined) {
    return ${fallbackExpression};
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    const unwrapped = ObjC.unwrap(value);
    if (typeof unwrapped === "string") {
      return unwrapped;
    }

    if (unwrapped !== null && unwrapped !== undefined) {
      return String(unwrapped);
    }
  } catch (_) {
    // Fall through to non-ObjC coercion.
  }

  if (typeof value.js === "string") {
    return value.js;
  }

  return String(value);
})()
`.trim();
  },

  toISOString(expression: string, fallbackExpression = "null"): string {
    return `
(() => {
  const value = ${expression};

  if (value === null || value === undefined) {
    return ${fallbackExpression};
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? ${fallbackExpression} : date.toISOString();
})()
`.trim();
  },

  safeGet(objectExpression: string, propertyName: string, defaultExpression = "null"): string {
    return `
(() => {
  const target = ${objectExpression};

  if (target === null || target === undefined) {
    return ${defaultExpression};
  }

  try {
    const candidate = target[${JSON.stringify(propertyName)}];
    // In JXA, methods on Application objects must be called directly on the
    // target (target.prop()) rather than via .call() — the bridge context is
    // lost when the function reference is detached.
    const value = typeof candidate === "function" ? target[${JSON.stringify(propertyName)}]() : candidate;
    return value === null || value === undefined ? ${defaultExpression} : value;
  } catch (_) {
    return ${defaultExpression};
  }
})()
`.trim();
  },
};
