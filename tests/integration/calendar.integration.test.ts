import { afterEach, expect, it } from "bun:test";

import calendar from "../../utils/calendar.js";
import { CleanupTracker } from "./helpers/cleanup-tracker.js";
import { deleteCalendarEventByTitle } from "./helpers/cleanup-jxa.js";
import {
  integrationDescribe,
  INTEGRATION_TIMEOUT,
  INTEGRATION_TIMEOUT_LONG,
  uniqueName,
} from "./helpers/test-config.js";

const cleanup = new CleanupTracker();

integrationDescribe("calendar integration", () => {
  afterEach(async () => {
    await cleanup.runAll();
  });

  it("getEvents returns an array", async () => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const result = await calendar.getEvents(
      oneWeekAgo.toISOString(),
      now.toISOString(),
    );
    expect(Array.isArray(result)).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it("createEvent creates an event successfully", async () => {
    const title = uniqueName("event");
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const start = new Date(tomorrow);
    start.setHours(10, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(11, 0, 0, 0);

    const createResult = await calendar.createEvent(
      title,
      start.toISOString(),
      end.toISOString(),
    );
    cleanup.track(() => deleteCalendarEventByTitle(title));

    expect(createResult).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it("searchEvents returns empty for non-matching text", async () => {
    // searchEvents iterates all calendars — can be slow with many calendars
    const result = await calendar.searchEvents("__nonexistent_event_zzz_999__");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  }, INTEGRATION_TIMEOUT_LONG);
});
