import { describe, it, expect } from "bun:test";

import tools from "../tools.js";

describe("notes tool schema", () => {
  function findNotesTool(): {
    description?: string;
    inputSchema: {
      properties?: Record<string, { description?: string; enum?: string[] } | unknown>;
      required?: string[];
    };
  } {
    const found = (tools as Array<{ name?: string }>).find((t) => t.name === "notes");
    if (!found) throw new Error("notes tool not found in tools module exports");
    return found as never;
  }

  it("exposes the account/folder scope parameters", () => {
    const tool = findNotesTool();
    const props = tool.inputSchema.properties ?? {};

    expect(Object.keys(props)).toContain("accountName");
    expect(Object.keys(props)).toContain("folderName");
  });

  it("includes 'accounts' and 'folders' in the operation enum", () => {
    const tool = findNotesTool();
    const operation = (tool.inputSchema.properties ?? {}).operation as
      | { enum?: string[] }
      | undefined;

    expect(operation?.enum).toBeDefined();
    expect(operation?.enum).toEqual(
      expect.arrayContaining(["search", "list", "create", "accounts", "folders"]),
    );
  });

  it("documents the multi-account ambiguity rule for folderName", () => {
    const tool = findNotesTool();
    const folder = (tool.inputSchema.properties ?? {}).folderName as
      | { description?: string }
      | undefined;

    expect(folder?.description ?? "").toMatch(/account/i);
  });
});
