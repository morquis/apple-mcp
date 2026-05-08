import {
  executeJXA,
  JXAAppNotRunningError,
  JXAConverters,
  JXAExecutionError,
  wrapJXAFunction,
} from "../core/jxa-bridge.js";

type Note = {
  name: string;
  content: string;
};

type NotesScope = {
  accountName?: string;
  folderName?: string;
};

type CreateNoteResult = {
  success: boolean;
  note?: Note;
  message?: string;
  folderName?: string;
  accountName?: string;
  usedDefaultFolder?: boolean;
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

async function getAllNotes(scope: NotesScope = {}): Promise<Note[]> {
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    ${buildResolveHelper(scope)}

    const notes = collectScopedNotes();
    const result = [];

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];

      result.push({
        name: ${JXAConverters.toString("note.name()", '""')},
        content: ${JXAConverters.toString("note.plaintext()", '""')},
      });
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
          matches.push({ name: name, content: body });
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

      result.push({
        name: ${JXAConverters.toString("note.name()", '""')},
        content: ${JXAConverters.toString("note.plaintext()", '""')},
      });
    }

    return JSON.stringify({ success: true, data: result });
  `);

  const raw = await executeJXA<NotesScriptResult<Note[]>>(script);
  const notes = unwrapScriptResult(raw);

  if (!Array.isArray(notes)) {
    return [];
  }

  if (notes.length === 0 && !hasScope) {
    const allNotes = await getAllNotes();
    const closestMatch = allNotes.find(({ name }) =>
      name.toLowerCase().includes(searchText.toLowerCase()),
    );

    return closestMatch
      ? [
          {
            name: closestMatch.name,
            content: closestMatch.content,
          },
        ]
      : [];
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
        note: {
          name: title,
          content: body,
        },
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

export type { Note, NotesScope, CreateNoteResult };

export default {
  getAllNotes,
  findNote,
  createNote,
  listAccounts,
  listFolders,
};
