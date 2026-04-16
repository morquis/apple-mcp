import { expect, it } from "bun:test";

import contacts from "../../utils/contacts.ts";
import {
  integrationDescribe,
  INTEGRATION_TIMEOUT,
  INTEGRATION_TIMEOUT_LONG,
} from "./helpers/test-config.ts";

/**
 * Note: getAllNumbers and findContactByPhone iterate all contacts (3000+),
 * which can take minutes via JXA. These tests use very long timeouts.
 * findNumber with .whose() is fast for non-existent names.
 */
integrationDescribe("contacts integration", () => {
  it("findNumber returns an empty array for a non-existent name", async () => {
    // findNumber uses .whose() first (fast), then falls back to getAllNumbers
    // For a clearly non-existent name, .whose() returns 0 results,
    // then getAllNumbers scans all contacts — this will be slow
    const result = await contacts.findNumber("__nonexistent_contact_zzz__");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  }, 120_000);

  it("findContactByPhone returns null for a non-existent number", async () => {
    // This iterates all contacts — very slow with 3000+ contacts
    const result = await contacts.findContactByPhone("+19999999999");
    expect(result).toBeNull();
  }, 120_000);
});
