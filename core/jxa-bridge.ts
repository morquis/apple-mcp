import { spawn } from "node:child_process";

export interface JXAExecutionOptions {
  timeout?: number;
  parseJSON?: boolean;
}

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
  /Can't get application ["']([^"']+)["']/i,
  /Can’t get application ["']([^"']+)["']/i,
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

export async function executeJXA<T = unknown>(
  script: string,
  options: JXAExecutionOptions & { parseJSON?: true } = {},
): Promise<T>;
export async function executeJXA(
  script: string,
  options: JXAExecutionOptions & { parseJSON: false },
): Promise<string>;
export async function executeJXA<T = unknown>(
  script: string,
  options: JXAExecutionOptions = {},
): Promise<T | string> {
  const { timeout = 30_000, parseJSON = true } = options;

  return new Promise<T | string>((resolve, reject) => {
    const child = spawn("osascript", ["-l", "JavaScript", "-e", script]);

    let stdout = "";
    let stderr = "";
    let settled = false;

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
      child.kill();
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
      const context = buildErrorContext(script, timeout, stdout, stderr);
      settle(() => {
        reject(new JXAExecutionError("Failed to spawn osascript", context, error));
      });
    });

    child.on("close", (exitCode, signal) => {
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
    const value = typeof candidate === "function" ? candidate.call(target) : candidate;
    return value === null || value === undefined ? ${defaultExpression} : value;
  } catch (_) {
    return ${defaultExpression};
  }
})()
`.trim();
  },
};
