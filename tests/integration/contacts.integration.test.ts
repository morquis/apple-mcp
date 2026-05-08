import { expect, it } from "bun:test";

import contacts from "../../utils/contacts.js";
import {
  integrationDescribe,
  INTEGRATION_TIMEOUT,
  INTEGRATION_TIMEOUT_LONG,
  uniqueName,
} from "./helpers/test-config.js";

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

  /**
   * Round-trip regression: create a contact, then delete it using the ID
   * returned by createContact. Previously deleteContact stripped ":ABPerson"
   * from the Scripting Bridge ID and built a CN predicate from just the UUID
   * part — but CNContact .identifier IS the full "UUID:ABPerson" string, so
   * the predicate matched zero records and delete silently failed.
   */
  it("create → delete round-trip with the returned ID", async () => {
    const lastName = uniqueName("delete_roundtrip");
    const create = await contacts.createContact({
      firstName: "AppleMCP",
      lastName,
    });
    expect(create.success).toBe(true);
    expect(create.contact?.id).toBeTruthy();

    const id = create.contact?.id ?? "";
    expect(id.length).toBeGreaterThan(0);

    const del = await contacts.deleteContact(id);
    if (!del.success) {
      // Cleanup attempt via search → delete to avoid leaving test data behind.
      const found = await contacts.searchContacts({ name: lastName });
      for (const c of found) {
        await contacts.deleteContact(c.id);
      }
    }
    expect(del.success).toBe(true);
  }, INTEGRATION_TIMEOUT_LONG);
});
