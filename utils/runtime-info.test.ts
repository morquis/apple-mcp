import { describe, expect, it } from "bun:test";

import tools from "../tools.js";
import { getRuntimeInfo, MAIL_DISPATCH_OPERATIONS } from "./runtime-info.js";

describe("runtime info", () => {
  it("exposes a no-argument runtimeInfo tool", () => {
    const runtimeTool = tools.find((tool) => tool.name === "runtimeInfo");

    expect(runtimeTool).toBeDefined();
    expect(runtimeTool?.inputSchema).toEqual({
      type: "object",
      properties: {},
    });
  });

  it("returns package, runtime, tools, and mail drift details", async () => {
    const info = await getRuntimeInfo();

    expect(info.package.name).toBe("apple-mcp");
    expect(info.package.version).toBeDefined();
    expect(info.server.name).toBe("Apple MCP tools");
    expect(info.runtime.node).toBe(process.version);
    expect(info.runtime.pid).toBe(process.pid);
    expect(info.tools.some((tool) => tool.name === "runtimeInfo")).toBe(true);
    expect(info.mail.schemaOperations).toContain("messageMetadata");
    expect(info.mail.dispatchOperations).toEqual(MAIL_DISPATCH_OPERATIONS);
    expect(info.mail.schemaDispatchDrift.dispatchOnly).toEqual([
      "createMailbox",
      "deleteMailbox",
      "moveMailbox",
      "renameMailbox",
    ]);
  });
});
