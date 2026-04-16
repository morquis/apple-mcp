/// <reference types="bun-types/test" />

import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.js";

let importCounter = 0;

async function importMessage() {
  importCounter += 1;
  return (await import(`./message.js?test=${importCounter}`)).default;
}

describe("message", () => {
  afterEach(() => {
    mock.restore();
  });

  it("sendMessage executes a bridge-backed JXA script", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue("" as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const message = await importMessage();
    const result = await message.sendMessage("+15551234567", 'Hello "Mark"\nLine 2');

    expect(result).toBe("");
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(1);
    expect(executeJXASpy).toHaveBeenCalledTimes(1);
    expect(executeJXASpy).toHaveBeenCalledWith(expect.any(String), { parseJSON: false });

    const script = String(executeJXASpy.mock.calls[0]?.[0]);
    expect(script).toContain('Application("Messages")');
    expect(script).toContain('const phoneNumber = "+15551234567"');
    expect(script).toContain('const messageText = "Hello \\"Mark\\"\\nLine 2"');
    expect(script).toContain('serviceType: "iMessage"');
    expect(script).toContain("Messages.send(messageText, {");
  });

  it("sendMessage surfaces bridge errors", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockImplementation(() => Promise.reject(new Error("boom")) as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const message = await importMessage();

    await expect(message.sendMessage("+15551234567", "Hello")).rejects.toThrow("boom");
    expect(executeJXASpy).toHaveBeenCalledTimes(1);
  });
});
