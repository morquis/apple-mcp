import {
  executeJXA,
  JXAAppNotRunningError,
  JXAConverters,
  JXAExecutionError,
  wrapJXAFunction,
} from "../core/jxa-bridge.js";

type Note = {
  id?: string;
  name: string;
  title?: string;
  content: string;
  plaintext?: string;
  body?: string;
  accountName?: string | null;
  folderName?: string | null;
  creationDate?: string | null;
  modificationDate?: string | null;
};

type NotesScope = {
  accountName?: string;
  folderName?: string;
};

type NoteSafetyGuards = NotesScope & {
  expectedName?: string;
  expectedPlaintextContains?: string;
  expectedModificationDate?: string;
  dryRun?: boolean;
};

type CreateNoteResult = {
  success: boolean;
  note?: Note;
  message?: string;
  folderName?: string;
  accountName?: string;
  usedDefaultFolder?: boolean;
};

type NoteMutationResult = {
  success: boolean;
  dryRun?: boolean;
  note?: Note;
  message?: string;
};

type NotesScriptResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function escapeJXAString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function jxaStringLiteral(value: string | undefined): string {
  if (value === undefined) {
    return "null";
  }
  return `"${escapeJXAString(value)}"`;
}

function unwrapScriptResult<T>(result: NotesScriptResult<T> | T): T {
  if (
    result &&
    typeof result === "object" &&
    "success" in (result as Record<string, unknown>) &&
    (result as { success: unknown }).success === false
  ) {
    const message = (result as { error?: string }).error ?? "Notes script failed";
    throw new Error(message);
  }

  if (
    result &&
    typeof result === "object" &&
    "success" in (result as Record<string, unknown>) &&
    (result as { success: unknown }).success === true &&
    "data" in (result as Record<string, unknown>)
  ) {
    return (result as { data: T }).data;
  }

  return result as T;
}

const RESOLVE_NOTES_HELPER = `
const accountName = ACCOUNT_NAME_LITERAL;
const folderName = FOLDER_NAME_LITERAL;

function resolveAccount(name) {
  const matches = Notes.accounts.whose({ name: name })();
  if (!matches || matches.length === 0) {
    throw new Error('Account "' + name + '" not found');
  }
  return matches[0];
}

function notesFromContainer(container) {
  const list = container.notes();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    out.push(list[i]);
  }
  return out;
}

function collectScopedNotes() {
  if (!accountName && !folderName) {
    return notesFromContainer(Notes);
  }

  if (accountName && folderName) {
    const account = resolveAccount(accountName);
    const folders = account.folders.whose({ name: folderName })();
    if (!folders || folders.length === 0) {
      throw new Error('Folder "' + folderName + '" not found in account "' + accountName + '"');
    }
    return notesFromContainer(folders[0]);
  }

  if (accountName && !folderName) {
    const account = resolveAccount(accountName);
    return notesFromContainer(account);
  }

  // folderName only — search across all accounts, error on ambiguity.
  const accounts = Notes.accounts();
  const hits = [];
  for (let a = 0; a < accounts.length; a++) {
    const folders = accounts[a].folders.whose({ name: folderName })();
    if (folders && folders.length > 0) {
      for (let f = 0; f < folders.length; f++) {
        hits.push({ account: accounts[a], folder: folders[f] });
      }
    }
  }
  if (hits.length === 0) {
    throw new Error('Folder "' + folderName + '" not found in any account');
  }
  if (hits.length > 1) {
    const names = [];
    for (let h = 0; h < hits.length; h++) {
      names.push(${JXAConverters.toString("hits[h].account.name()", '"?"')});
    }
    throw new Error('Folder "' + folderName + '" exists in multiple accounts (' + names.join(", ") + '). Specify accountName to disambiguate.');
  }
  return notesFromContainer(hits[0].folder);
}
`;

function buildResolveHelper(scope: NotesScope): string {
  return RESOLVE_NOTES_HELPER
    .replace("ACCOUNT_NAME_LITERAL", jxaStringLiteral(scope.accountName))
    .replace("FOLDER_NAME_LITERAL", jxaStringLiteral(scope.folderName));
}

const NOTE_SERIALIZER_HELPER = `
function safeString(read, fallback) {
  try {
    const value = read();
    if (value === null || value === undefined) {
      return fallback;
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      const unwrapped = ObjC.unwrap(value);
      return unwrapped === null || unwrapped === undefined ? fallback : String(unwrapped);
    } catch (_) {
      return String(value);
    }
  } catch (_) {
    return fallback;
  }
}

function safeDate(read) {
  try {
    const value = read();
    if (value === null || value === undefined) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch (_) {
    return null;
  }
}

function serializeNote(note) {
  const folder = (() => {
    try {
      return note.container();
    } catch (_) {
      return null;
    }
  })();
  const account = (() => {
    try {
      return folder ? folder.container() : null;
    } catch (_) {
      return null;
    }
  })();
  const name = safeString(() => note.name(), "");
  const plaintext = safeString(() => note.plaintext(), "");

  return {
    id: safeString(() => note.id(), ""),
    name,
    title: name,
    content: plaintext,
    plaintext,
    body: safeString(() => note.body(), ""),
    accountName: account ? safeString(() => account.name(), null) : null,
    folderName: folder ? safeString(() => folder.name(), null) : null,
    creationDate: safeDate(() => note.creationDate()),
    modificationDate: safeDate(() => note.modificationDate()),
  };
}

function serializeNoteSummary(note) {
  const name = safeString(() => note.name(), "");
  const plaintext = safeString(() => note.plaintext(), "");

  return {
    id: safeString(() => note.id(), ""),
    name,
    title: name,
    content: plaintext,
    plaintext,
    accountName: accountName,
    folderName: folderName,
    creationDate: null,
    modificationDate: null,
  };
}
`;

function buildNoteIdHelper(id: string, scope: NotesScope = {}): string {
  return `
const targetNoteId = ${jxaStringLiteral(id)};
${buildResolveHelper(scope)}
${NOTE_SERIALIZER_HELPER}

function resolveNoteById() {
  if (!targetNoteId) {
    throw new Error("noteId is required");
  }

  const notes = Notes.notes.whose({ id: targetNoteId })();
  if (!notes || notes.length === 0) {
    throw new Error('Note with id "' + targetNoteId + '" not found');
  }
  if (notes.length > 1) {
    throw new Error('Note id "' + targetNoteId + '" matched multiple notes');
  }

  const note = notes[0];
  if (accountName || folderName) {
    const scopedNotes = collectScopedNotes();
    let inScope = false;
    for (let i = 0; i < scopedNotes.length; i++) {
      if (safeString(() => scopedNotes[i].id(), "") === targetNoteId) {
        inScope = true;
        break;
      }
    }
    if (!inScope) {
      throw new Error('Note with id "' + targetNoteId + '" is outside the requested accountName/folderName scope');
    }
  }

  return note;
}
`;
}

function buildGuardHelper(guards: NoteSafetyGuards): string {
  return `
const expectedName = ${jxaStringLiteral(guards.expectedName)};
const expectedPlaintextContains = ${jxaStringLiteral(guards.expectedPlaintextContains)};
const expectedModificationDate = ${jxaStringLiteral(guards.expectedModificationDate)};
const dryRun = ${guards.dryRun ? "true" : "false"};

function assertSafetyGuards(noteInfo) {
  if (expectedName !== null && noteInfo.name !== expectedName) {
    throw new Error('Safety guard failed: expectedName "' + expectedName + '" did not match note name "' + noteInfo.name + '"');
  }
  if (expectedPlaintextContains !== null && noteInfo.plaintext.indexOf(expectedPlaintextContains) === -1) {
    throw new Error('Safety guard failed: expectedPlaintextContains was not found in note plaintext');
  }
  if (expectedModificationDate !== null && noteInfo.modificationDate !== expectedModificationDate) {
    throw new Error('Safety guard failed: expectedModificationDate "' + expectedModificationDate + '" did not match note modificationDate "' + noteInfo.modificationDate + '"');
  }
}
`;
}

async function getAllNotes(scope: NotesScope = {}): Promise<Note[]> {
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    ${buildResolveHelper(scope)}
    ${NOTE_SERIALIZER_HELPER}

    const notes = collectScopedNotes();
    const result = [];

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];

      result.push(serializeNoteSummary(note));
    }

    return JSON.stringify({ success: true, data: result });
  `);

  const raw = await executeJXA<NotesScriptResult<Note[]>>(script);
  const notes = unwrapScriptResult(raw);
  return Array.isArray(notes) ? notes : [];
}

async function findNote(
  searchText: string,
  scope: NotesScope = {},
): Promise<Note[]> {
  const escapedSearchText = escapeJXAString(searchText);
  const hasScope = Boolean(scope.accountName || scope.folderName);

  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    ${buildResolveHelper(scope)}
    ${NOTE_SERIALIZER_HELPER}
    const searchText = "${escapedSearchText}";
    const lower = searchText.toLowerCase();

    let matches;
    if (${hasScope ? "true" : "false"}) {
      const candidates = collectScopedNotes();
      matches = [];
      for (let i = 0; i < candidates.length; i++) {
        const n = candidates[i];
        const name = ${JXAConverters.toString("n.name()", '""')};
        const body = ${JXAConverters.toString("n.plaintext()", '""')};
        if (name.toLowerCase().indexOf(lower) !== -1 || body.toLowerCase().indexOf(lower) !== -1) {
          matches.push(serializeNoteSummary(n));
        }
      }
      return JSON.stringify({ success: true, data: matches });
    }

    const notes = Notes.notes.whose({
      _or: [
        { name: { _contains: searchText } },
        { plaintext: { _contains: searchText } },
      ],
    })();
    const result = [];

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];

      result.push(serializeNoteSummary(note));
    }

    return JSON.stringify({ success: true, data: result });
  `);

  const raw = await executeJXA<NotesScriptResult<Note[]>>(script);
  const notes = unwrapScriptResult(raw);

  if (!Array.isArray(notes)) {
    return [];
  }

  return notes;
}

async function createNote(
  title: string,
  body: string,
  folderName: string = "Claude",
  accountName?: string,
): Promise<CreateNoteResult> {
  try {
    const formattedBody = body
      .replace(/^(#+)\s+(.+)$/gm, "$1 $2\n")
      .replace(/^-\s+(.+)$/gm, "\n- $1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const escapedTitle = escapeJXAString(title);
    const escapedBody = escapeJXAString(formattedBody);
    const escapedFolderName = escapeJXAString(folderName);
    const accountLiteral = jxaStringLiteral(accountName);

    const script = wrapJXAFunction(`
      const Notes = Application("Notes");
      ${NOTE_SERIALIZER_HELPER}
      const title = "${escapedTitle}";
      const body = "${escapedBody}";
      const folderName = "${escapedFolderName}";
      const accountName = ${accountLiteral};

      let targetFolder;
      let targetAccount = null;
      let usedDefaultFolder = false;
      let actualFolderName = folderName;
      let actualAccountName = null;

      if (accountName) {
        const matches = Notes.accounts.whose({ name: accountName })();
        if (!matches || matches.length === 0) {
          throw new Error('Account "' + accountName + '" not found');
        }
        targetAccount = matches[0];
        actualAccountName = accountName;

        const folders = targetAccount.folders.whose({ name: folderName })();
        if (folders && folders.length > 0) {
          targetFolder = folders[0];
        }
      } else {
        const accounts = Notes.accounts();
        const hits = [];
        for (let a = 0; a < accounts.length; a++) {
          const folders = accounts[a].folders.whose({ name: folderName })();
          if (folders && folders.length > 0) {
            for (let f = 0; f < folders.length; f++) {
              hits.push({ account: accounts[a], folder: folders[f] });
            }
          }
        }
        if (hits.length === 1) {
          targetFolder = hits[0].folder;
          targetAccount = hits[0].account;
          actualAccountName = ${JXAConverters.toString("hits[0].account.name()", "null")};
        } else if (hits.length > 1) {
          const names = [];
          for (let h = 0; h < hits.length; h++) {
            names.push(${JXAConverters.toString("hits[h].account.name()", '"?"')});
          }
          throw new Error('Folder "' + folderName + '" exists in multiple accounts (' + names.join(", ") + '). Specify accountName to disambiguate.');
        }
      }

      if (!targetFolder) {
        if (folderName === "Claude") {
          if (targetAccount) {
            Notes.make({ new: "folder", withProperties: { name: "Claude" }, at: targetAccount });
            const updated = targetAccount.folders.whose({ name: "Claude" })();
            if (updated && updated.length > 0) {
              targetFolder = updated[0];
            }
          } else {
            Notes.make({ new: "folder", withProperties: { name: "Claude" } });
            const updatedFolders = Notes.folders();
            for (let i = 0; i < updatedFolders.length; i++) {
              if (${JXAConverters.toString("updatedFolders[i].name()", '""')} === "Claude") {
                targetFolder = updatedFolders[i];
                break;
              }
            }
          }
          usedDefaultFolder = true;
        } else {
          throw new Error('Folder "' + folderName + '" not found' + (accountName ? ' in account "' + accountName + '"' : ''));
        }
      }

      let newNote;
      if (targetFolder) {
        newNote = Notes.make({
          new: "note",
          withProperties: { name: title, body: body },
          at: targetFolder,
        });
        actualFolderName = folderName;
      } else {
        newNote = Notes.make({
          new: "note",
          withProperties: { name: title, body: body },
        });
        actualFolderName = "Default";
      }

      if (!newNote) {
        throw new Error("Failed to create note");
      }

      return JSON.stringify({
        success: true,
        note: serializeNote(newNote),
        folderName: actualFolderName,
        accountName: actualAccountName,
        usedDefaultFolder,
      });
    `);

    const result = await executeJXA<CreateNoteResult>(script);
    return result ?? { success: false, message: "Failed to create note: empty response" };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return {
        success: false,
        message: `Failed to create note: ${error.message}`,
      };
    }

    return {
      success: false,
      message: `Failed to create note: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function getNote(noteId: string, scope: NotesScope = {}): Promise<Note> {
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    ${buildNoteIdHelper(noteId, scope)}

    const note = resolveNoteById();
    return JSON.stringify({ success: true, data: serializeNote(note) });
  `);

  const raw = await executeJXA<NotesScriptResult<Note>>(script);
  return unwrapScriptResult(raw);
}

async function updateNote(
  noteId: string,
  body: string,
  guards: NoteSafetyGuards = {},
): Promise<NoteMutationResult> {
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    const newBody = ${jxaStringLiteral(body)};
    ${buildNoteIdHelper(noteId, guards)}
    ${buildGuardHelper(guards)}

    const note = resolveNoteById();
    const before = serializeNote(note);
    assertSafetyGuards(before);

    if (dryRun) {
      return JSON.stringify({ success: true, dryRun: true, note: before, message: "Dry run: note body was not updated" });
    }

    note.body = newBody;
    const after = serializeNote(note);
    return JSON.stringify({ success: true, dryRun: false, note: after });
  `);

  const result = await executeJXA<NoteMutationResult>(script);
  return result ?? { success: false, message: "Failed to update note: empty response" };
}

async function deleteNote(
  noteId: string,
  guards: NoteSafetyGuards = {},
): Promise<NoteMutationResult> {
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    ${buildNoteIdHelper(noteId, guards)}
    ${buildGuardHelper(guards)}

    const note = resolveNoteById();
    const before = serializeNote(note);
    assertSafetyGuards(before);

    if (dryRun) {
      return JSON.stringify({ success: true, dryRun: true, note: before, message: "Dry run: note was not deleted" });
    }

    Notes.delete(note);
    return JSON.stringify({ success: true, dryRun: false, note: before });
  `);

  const result = await executeJXA<NoteMutationResult>(script);
  return result ?? { success: false, message: "Failed to delete note: empty response" };
}

async function listAccounts(): Promise<string[]> {
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    const accounts = Notes.accounts();
    const result = [];

    for (let i = 0; i < accounts.length; i++) {
      result.push(${JXAConverters.toString("accounts[i].name()", '""')});
    }

    return JSON.stringify({ success: true, data: result });
  `);

  const raw = await executeJXA<NotesScriptResult<string[]>>(script);
  const accounts = unwrapScriptResult(raw);
  return Array.isArray(accounts) ? accounts : [];
}

async function listFolders(accountName?: string): Promise<string[]> {
  const accountLiteral = jxaStringLiteral(accountName);
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    const accountName = ${accountLiteral};
    const result = [];

    if (accountName) {
      const matches = Notes.accounts.whose({ name: accountName })();
      if (!matches || matches.length === 0) {
        throw new Error('Account "' + accountName + '" not found');
      }
      const folders = matches[0].folders();
      for (let i = 0; i < folders.length; i++) {
        result.push(${JXAConverters.toString("folders[i].name()", '""')});
      }
    } else {
      const folders = Notes.folders();
      for (let i = 0; i < folders.length; i++) {
        result.push(${JXAConverters.toString("folders[i].name()", '""')});
      }
    }

    return JSON.stringify({ success: true, data: result });
  `);

  const raw = await executeJXA<NotesScriptResult<string[]>>(script);
  const folders = unwrapScriptResult(raw);
  return Array.isArray(folders) ? folders : [];
}

export type { Note, NotesScope, NoteSafetyGuards, CreateNoteResult, NoteMutationResult };

export default {
  getAllNotes,
  findNote,
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listAccounts,
  listFolders,
};
