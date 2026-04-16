import { expect, it } from "bun:test";

import {
  executeJXA,
  JXAExecutionError,
  wrapJXAFunction,
} from "../../core/jxa-bridge.js";
import {
  integrationDescribe,
  INTEGRATION_TIMEOUT,
} from "./helpers/test-config.js";

integrationDescribe("jxa-bridge integration", () => {
  it("executes a simple JXA script and parses JSON", async () => {
    const script = wrapJXAFunction(`
      return JSON.stringify({ ok: true, value: 42 });
    `);
    const result = await executeJXA<{ ok: boolean; value: number }>(script);
    expect(result).toEqual({ ok: true, value: 42 });
  }, INTEGRATION_TIMEOUT);

  it("returns raw string with parseJSON:false", async () => {
    const script = wrapJXAFunction(`
      return "hello world";
    `);
    const result = await executeJXA(script, { parseJSON: false });
    expect(result).toBe("hello world");
  }, INTEGRATION_TIMEOUT);

  it("throws JXAExecutionError on script errors", async () => {
    const script = wrapJXAFunction(`
      throw new Error("intentional failure");
    `);
    try {
      await executeJXA(script);
      expect(true).toBe(false); // should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(JXAExecutionError);
    }
  }, INTEGRATION_TIMEOUT);

  it("can access ObjC bridge inside osascript", async () => {
    const script = wrapJXAFunction(`
      ObjC.import("Foundation");
      const nsString = $.NSString.stringWithString("test");
      const unwrapped = ObjC.unwrap(nsString);
      return JSON.stringify(unwrapped);
    `);
    const result = await executeJXA<string>(script);
    expect(result).toBe("test");
  }, INTEGRATION_TIMEOUT);
});
