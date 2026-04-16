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

type CreateNoteResult = {
  success: boolean;
  note?: Note;
  message?: string;
  folderName?: string;
  usedDefaultFolder?: boolean;
};

function escapeJXAString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

async function getAllNotes() {
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    const notes = Notes.notes();
    const result = [];

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];

      result.push({
        name: ${JXAConverters.toString("note.name()", '""')},
        content: ${JXAConverters.toString("note.plaintext()", '""')},
      });
    }

    return JSON.stringify(result);
  `);

  const notes = await executeJXA<Note[]>(script);
  return Array.isArray(notes) ? notes : [];
}

async function findNote(searchText: string) {
  const escapedSearchText = escapeJXAString(searchText);
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    const searchText = "${escapedSearchText}";
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

    return JSON.stringify(result);
  `);

  const notes = await executeJXA<Note[]>(script);

  if (notes.length === 0) {
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

    const script = wrapJXAFunction(`
      const Notes = Application("Notes");
      const title = "${escapedTitle}";
      const body = "${escapedBody}";
      const folderName = "${escapedFolderName}";

      let targetFolder;
      let usedDefaultFolder = false;
      let actualFolderName = folderName;

      const folders = Notes.folders();
      for (let i = 0; i < folders.length; i++) {
        if (${JXAConverters.toString("folders[i].name()", '""')} === folderName) {
          targetFolder = folders[i];
          break;
        }
      }

      if (!targetFolder) {
        if (folderName === "Claude") {
          Notes.make({ new: "folder", withProperties: { name: "Claude" } });
          usedDefaultFolder = true;

          const updatedFolders = Notes.folders();
          for (let i = 0; i < updatedFolders.length; i++) {
            if (${JXAConverters.toString("updatedFolders[i].name()", '""')} === "Claude") {
              targetFolder = updatedFolders[i];
              break;
            }
          }
        } else {
          throw new Error('Folder "' + folderName + '" not found');
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

export default { getAllNotes, findNote, createNote };
