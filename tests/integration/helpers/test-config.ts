import { describe } from "bun:test";

export const INTEGRATION_ENABLED =
  process.env.APPLE_MCP_INTEGRATION === "1";

export const INTEGRATION_MAPS_ENABLED =
  INTEGRATION_ENABLED && process.env.APPLE_MCP_INTEGRATION_MAPS === "1";

export const INTEGRATION_PHOTOS_ENABLED =
  INTEGRATION_ENABLED && process.env.APPLE_MCP_INTEGRATION_PHOTOS === "1";

export const INTEGRATION_MUSIC_ENABLED =
  INTEGRATION_ENABLED && process.env.APPLE_MCP_INTEGRATION_MUSIC === "1";

export const INTEGRATION_MESSAGES_ENABLED =
  INTEGRATION_ENABLED && process.env.APPLE_MCP_INTEGRATION_MESSAGES === "1";

export const TEST_PREFIX = "__apple_mcp_test_";

export const INTEGRATION_TIMEOUT = 15_000;
/** Longer timeout for operations that scan all lists/mailboxes */
export const INTEGRATION_TIMEOUT_LONG = 45_000;

export function uniqueName(label: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${TEST_PREFIX}${label}_${Date.now()}_${suffix}`;
}

export function integrationDescribe(
  name: string,
  fn: () => void,
  enabled = INTEGRATION_ENABLED,
): void {
  if (enabled) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
}
