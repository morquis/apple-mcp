import { describe, expect, it } from "bun:test";

import tools from "../tools.js";
import { getRuntimeInfo, MAIL_DISPATCH_OPERATIONS } from "./runtime-info.js";

const STRUCTURAL_MAILBOX_OPERATIONS = [
  "createMailbox",
  "deleteMailbox",
  "renameMailbox",
  "moveMailbox",
];

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
    expect(info.mail.schemaDispatchDrift.dispatchOnly).toEqual([]);
    expect(info.mail.schemaDispatchDrift.schemaOnly).toEqual([]);
  });

  it("does not expose structural mailbox operations in the mail tool schema", () => {
    const mailTool = tools.find((tool) => tool.name === "mail");
    const operations = mailTool?.inputSchema.properties.operation.enum ?? [];
    const propertyNames = Object.keys(mailTool?.inputSchema.properties ?? {});

    expect(operations).toContain("mailboxTree");
    expect(operations).toContain("mailboxProps");
    expect(operations).toContain("messageMetadata");
    expect(operations).toContain("exportMessageArtifacts");
    expect(operations).toContain("setMessageFlag");
    expect(operations).toContain("moveMessage");

    for (const operation of STRUCTURAL_MAILBOX_OPERATIONS) {
      expect(operations).not.toContain(operation);
    }
    expect(propertyNames).not.toContain("parentMailbox");
    expect(propertyNames).not.toContain("name");
    expect(propertyNames).not.toContain("newName");
    expect(propertyNames).not.toContain("targetParent");
  });
});
