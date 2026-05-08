import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.js";

async function loadNotes() {
  const mod = await import("./notes.js");
  return mod.default;
}

afterEach(() => {
  mock.restore();
});

describe("notes", () => {
  it("getAllNotes returns an array", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({ success: true, data: [] } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const notes = await loadNotes();
    const result = await notes.getAllNotes();

    expect(Array.isArray(result)).toBe(true);
    expect(executeJXASpy).toHaveBeenCalledTimes(1);
  });

  it("getAllNotes without scope reads notes globally via Notes.notes()", async () => {
    let capturedScript = "";
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({ success: true, data: [] } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => {
      capturedScript = script;
      return script;
    });

    const notes = await loadNotes();
    await notes.getAllNotes();

    // The unscoped path should call notesFromContainer(Notes), which iterates
    // Notes.notes() at the top level — i.e. no account/folder filtering.
    expect(capturedScript).toContain('const accountName = null');
    expect(capturedScript).toContain('const folderName = null');
    expect(capturedScript).toContain("notesFromContainer(Notes)");
  });

  it("getAllNotes with account+folder scope embeds scope literals and avoids global Notes.notes()", async () => {
    let capturedScript = "";
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({ success: true, data: [] } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => {
      capturedScript = script;
      return script;
    });

    const notes = await loadNotes();
    await notes.getAllNotes({ accountName: "TestAccount", folderName: "TestFolder" });

    expect(capturedScript).toContain('const accountName = "TestAccount"');
    expect(capturedScript).toContain('const folderName = "TestFolder"');
    // The scope branch resolves the account, then the folder, then reads
    // notes from that folder — never from the top-level Notes.notes().
    expect(capturedScript).toContain("resolveAccount(accountName)");
    expect(capturedScript).toContain("account.folders.whose({ name: folderName })()");
  });

  it("findNote forwards scope into the script and skips the global whose() path", async () => {
    let capturedScript = "";
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({ success: true, data: [] } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => {
      capturedScript = script;
      return script;
    });

    const notes = await loadNotes();
    await notes.findNote("hello", { accountName: "TestAccount", folderName: "TestFolder" });

    expect(capturedScript).toContain('const accountName = "TestAccount"');
    expect(capturedScript).toContain('const folderName = "TestFolder"');
    expect(capturedScript).toContain('const searchText = "hello"');
    // With scope, the in-memory loop is used; the global whose() is gated by
    // the literal "if (false) { ... }" branch.
    expect(capturedScript).toContain("if (true)");
    expect(capturedScript).toContain("collectScopedNotes()");
  });

  it("findNote without scope keeps the legacy global Notes.notes.whose path", async () => {
    const captured: string[] = [];
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({ success: true, data: [] } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => {
      captured.push(script);
      return script;
    });

    const notes = await loadNotes();
    await notes.findNote("hello");

    // findNote builds the search script first; if it returns no rows, the
    // module falls back to getAllNotes() for fuzzy matching, which appends a
    // second script. We assert against the first (search) script.
    const findScript = captured[0];
    expect(findScript).toContain("Notes.notes.whose(");
    expect(findScript).toContain("if (false)");
  });

  it("getAllNotes throws an Error when the script reports a missing account", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({
      success: false,
      error: 'Account "Bogus" not found',
    } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const notes = await loadNotes();

    await expect(
      notes.getAllNotes({ accountName: "Bogus" }),
    ).rejects.toThrow('Account "Bogus" not found');
  });

  it("createNote with accountName scopes folder lookup to that account", async () => {
    let capturedScript = "";
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({
      success: true,
      note: { name: "Todo", content: "body" },
      folderName: "Claude",
      accountName: "TestAccount",
      usedDefaultFolder: false,
    } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => {
      capturedScript = script;
      return script;
    });

    const notes = await loadNotes();
    const result = await notes.createNote("Todo", "body", "Claude", "TestAccount");

    expect(result.success).toBe(true);
    expect(result.accountName).toBe("TestAccount");
    expect(capturedScript).toContain('const accountName = "TestAccount"');
    expect(capturedScript).toContain("targetAccount.folders.whose({ name: folderName })()");
    // Without an account, the script falls through to a multi-account scan;
    // the scoped path must avoid that fallback.
    expect(capturedScript).toContain("if (accountName)");
  });

  it("createNote without accountName retains multi-account ambiguity check", async () => {
    let capturedScript = "";
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({
      success: true,
      note: { name: "Todo", content: "body" },
      folderName: "Claude",
      usedDefaultFolder: false,
    } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => {
      capturedScript = script;
      return script;
    });

    const notes = await loadNotes();
    await notes.createNote("Todo", "body");

    expect(capturedScript).toContain("const accountName = null");
    expect(capturedScript).toContain("Specify accountName to disambiguate");
  });

  it("listAccounts returns names from the script result", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({
      success: true,
      data: ["AccountA", "AccountB"],
    } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const notes = await loadNotes();
    const accounts = await notes.listAccounts();
    expect(accounts).toEqual(["AccountA", "AccountB"]);
  });

  it("listFolders forwards accountName into the script", async () => {
    let capturedScript = "";
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({
      success: true,
      data: ["TestFolder"],
    } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => {
      capturedScript = script;
      return script;
    });

    const notes = await loadNotes();
    const folders = await notes.listFolders("TestAccount");
    expect(folders).toEqual(["TestFolder"]);
    expect(capturedScript).toContain('const accountName = "TestAccount"');
  });

  it("escapes account and folder names that contain quotes or backslashes", async () => {
    let capturedScript = "";
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({ success: true, data: [] } as never);
    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => {
      capturedScript = script;
      return script;
    });

    const notes = await loadNotes();
    await notes.getAllNotes({ accountName: 'a"b\\c', folderName: "ok" });

    expect(capturedScript).toContain('const accountName = "a\\"b\\\\c"');
    expect(capturedScript).toContain('const folderName = "ok"');
  });
});
