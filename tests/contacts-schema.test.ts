import { describe, it, expect } from "bun:test";

import tools from "../tools.js";

/**
 * Regression: the `note` field MUST NOT appear in the contacts tool schema.
 *
 * Reading or writing CNContact.note requires Apple's restricted
 * `com.apple.developer.contacts.notes` entitlement, which is granted only to
 * signed/notarized .app bundles. Our MCP server (run via bun/osascript) cannot
 * obtain that entitlement, so the field is silently empty on read and triggers
 * SIGSEGV in osascript on write. The schema deliberately omits it so no client
 * sets it.
 *
 * If this test fails, do not just delete it — the entitlement situation has
 * not changed (verified 2026-05-08).
 */
describe("contacts tool schema", () => {
  function findContactsTool(): { description?: string; inputSchema: { properties?: Record<string, unknown> } } {
    const found = (tools as Array<{ name?: string }>).find((t) => t.name === "contacts");
    if (!found) throw new Error("contacts tool not found in tools module exports");
    return found as { description?: string; inputSchema: { properties?: Record<string, unknown> } };
  }

  it("has no `note` parameter (Apple entitlement restriction)", () => {
    const tool = findContactsTool();
    const properties = tool.inputSchema.properties ?? {};
    expect(Object.keys(properties)).not.toContain("note");
  });

  it("documents why `note` is unsupported in the description", () => {
    const tool = findContactsTool();
    expect(tool.description ?? "").toMatch(/note/i);
    expect(tool.description ?? "").toMatch(/entitlement|com\.apple\.developer\.contacts\.notes/);
  });
});
