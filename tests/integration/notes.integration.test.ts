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

  it("listAccounts returns the local Notes accounts", async () => {
    const accounts = await notes.listAccounts();
    expect(Array.isArray(accounts)).toBe(true);
  }, INTEGRATION_TIMEOUT);

  // The scope-aware tests target a real local account/folder combination.
  // Configure via env vars; if either is missing or absent on the host,
  // the scoped tests skip cleanly. Defaults assume an iCloud account.
  const TEST_ACCOUNT = process.env.APPLE_MCP_TEST_NOTES_ACCOUNT ?? "iCloud";
  const TEST_FOLDER = process.env.APPLE_MCP_TEST_NOTES_FOLDER;

  it("listFolders returns the configured account's folders if it exists locally", async () => {
    const accounts = await notes.listAccounts();
    if (!accounts.includes(TEST_ACCOUNT)) {
      return;
    }
    const folders = await notes.listFolders(TEST_ACCOUNT);
    expect(Array.isArray(folders)).toBe(true);
    if (TEST_FOLDER && folders.includes(TEST_FOLDER)) {
      expect(folders).toContain(TEST_FOLDER);
    }
  }, INTEGRATION_TIMEOUT);

  it("getAllNotes scoped to a specific account+folder only returns notes from that folder", async () => {
    if (!TEST_FOLDER) {
      return;
    }
    const accounts = await notes.listAccounts();
    if (!accounts.includes(TEST_ACCOUNT)) {
      return;
    }
    const folders = await notes.listFolders(TEST_ACCOUNT);
    if (!folders.includes(TEST_FOLDER)) {
      return;
    }

    const scoped = await notes.getAllNotes({
      accountName: TEST_ACCOUNT,
      folderName: TEST_FOLDER,
    });
    expect(Array.isArray(scoped)).toBe(true);

    // The unscoped read across all accounts must be at least as large as the
    // scoped one — otherwise the scope filter is broken.
    const all = await notes.getAllNotes();
    expect(all.length).toBeGreaterThanOrEqual(scoped.length);
  }, INTEGRATION_TIMEOUT);

  it("getAllNotes throws when the account does not exist", async () => {
    await expect(
      notes.getAllNotes({ accountName: "__nonexistent_account_zzz__" }),
    ).rejects.toThrow();
  }, INTEGRATION_TIMEOUT);

  it("listFolders throws when the account does not exist", async () => {
    await expect(
      notes.listFolders("__nonexistent_account_zzz__"),
    ).rejects.toThrow();
  }, INTEGRATION_TIMEOUT);
});
