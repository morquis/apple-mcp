import { afterEach, expect, it } from "bun:test";

import notes from "../../utils/notes.js";
import { CleanupTracker } from "./helpers/cleanup-tracker.js";
import { deleteNoteByName, deleteNotesFolderByName } from "./helpers/cleanup-jxa.js";
import {
  integrationDescribe,
  INTEGRATION_TIMEOUT,
  uniqueName,
} from "./helpers/test-config.js";

const cleanup = new CleanupTracker();

integrationDescribe("notes integration", () => {
  afterEach(async () => {
    await cleanup.runAll();
  });

  it("getAllNotes returns an array", async () => {
    const result = await notes.getAllNotes();
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(typeof result[0].name).toBe("string");
      expect(typeof result[0].content).toBe("string");
    }
  }, INTEGRATION_TIMEOUT);

  it("findNote returns empty array for non-existent text", async () => {
    const result = await notes.findNote("__nonexistent_note_zzz_999__");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  }, INTEGRATION_TIMEOUT);

  it("createNote creates a note in the default Claude folder, then findNote retrieves it", async () => {
    const title = uniqueName("note");
    const body = "Integration test body content";

    // Create note in the default "Claude" folder (auto-created if missing)
    const createResult = await notes.createNote(title, body);
    cleanup.track(() => deleteNoteByName(title));

    expect(createResult.success).toBe(true);
    expect(createResult.note?.name).toBe(title);

    // Find the note
    const found = await notes.findNote(title);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found[0].name).toBe(title);
  }, INTEGRATION_TIMEOUT);

  it("createNote returns error for non-existent folder", async () => {
    const title = uniqueName("note_err");
    const result = await notes.createNote(title, "body", "__nonexistent_folder_zzz__");
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  }, INTEGRATION_TIMEOUT);
});
