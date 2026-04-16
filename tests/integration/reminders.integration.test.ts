import { afterAll, beforeAll, expect, it } from "bun:test";

import reminders from "../../utils/reminders.ts";
import { createReminderList, deleteReminderListByName } from "./helpers/cleanup-jxa.ts";
import {
  integrationDescribe,
  INTEGRATION_TIMEOUT,
  INTEGRATION_TIMEOUT_LONG,
  uniqueName,
} from "./helpers/test-config.ts";

const testListName = uniqueName("list");

integrationDescribe("reminders integration", () => {
  beforeAll(async () => {
    await createReminderList(testListName);
  });

  afterAll(async () => {
    try {
      await deleteReminderListByName(testListName);
    } catch (error) {
      console.error("[cleanup] failed to delete test list:", error);
    }
  });

  it("getAllLists returns an array with name and id", async () => {
    const lists = await reminders.getAllLists();
    expect(Array.isArray(lists)).toBe(true);
    expect(lists.length).toBeGreaterThan(0);

    const testList = lists.find((l: any) => l.name === testListName);
    expect(testList).toBeDefined();
    expect(typeof testList.id).toBe("string");
  }, INTEGRATION_TIMEOUT);

  it("createReminder creates a reminder in the test list", async () => {
    const reminderName = uniqueName("reminder");
    const result = await reminders.createReminder(reminderName, testListName);

    expect(result).toBeDefined();
    expect(result.name).toBe(reminderName);
  }, INTEGRATION_TIMEOUT);

  it("getAllReminders filtered by list name returns only that list", async () => {
    const reminderName = uniqueName("filtered");
    await reminders.createReminder(reminderName, testListName);

    const all = await reminders.getAllReminders(testListName);
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((r: any) => r.name === reminderName)).toBe(true);
  }, INTEGRATION_TIMEOUT_LONG);

  it("searchReminders returns empty for non-existent text", async () => {
    const result = await reminders.searchReminders("__nonexistent_zzz_999__");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  }, INTEGRATION_TIMEOUT_LONG);

  it("searchReminders finds a created reminder", async () => {
    const reminderName = uniqueName("searchable");
    await reminders.createReminder(reminderName, testListName);

    const found = await reminders.searchReminders(reminderName);
    expect(Array.isArray(found)).toBe(true);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some((r: any) => r.name === reminderName)).toBe(true);
  }, INTEGRATION_TIMEOUT_LONG);
});
