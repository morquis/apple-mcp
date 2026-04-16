import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.js";

describe("contacts", () => {
  afterEach(() => {
    mock.restore();
  });

  it("getAllNumbers returns an object", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({ Alice: ["+15551234567"] } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    const result = await contacts.getAllNumbers();

    expect(result).toEqual({ Alice: ["+15551234567"] });
    expect(executeJXASpy).toHaveBeenCalledTimes(2);
  });

  it("findNumber searches by name and escapes special characters", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(["+15551234567"] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    const result = await contacts.findNumber('Ali"ce');

    expect(result).toEqual(["+15551234567"]);
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain('Ali\\"ce');
  });

  it("findContactByPhone normalizes the search input before executing JXA", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce("Alice" as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    const result = await contacts.findContactByPhone("(555) 123-4567");

    expect(result).toBe("Alice");
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain('"5551234567"');
  });

  it("findContactByPhone returns null when the bridge throws", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockRejectedValue(new Error("denied") as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    const result = await contacts.findContactByPhone("+15551234567");

    expect(result).toBeNull();
  });
});
