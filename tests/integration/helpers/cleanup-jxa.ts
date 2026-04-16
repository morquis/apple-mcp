import {
  executeJXA,
  wrapJXAFunction,
} from "../../../core/jxa-bridge.js";

function escapeJXA(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

export async function deleteNoteByName(name: string): Promise<void> {
  const escaped = escapeJXA(name);
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    const matches = Notes.notes.whose({ name: "${escaped}" })();
    for (let i = 0; i < matches.length; i++) {
      Notes.delete(matches[i]);
    }
    return JSON.stringify(true);
  `);
  await executeJXA(script, { timeout: 10_000 });
}

export async function deleteNotesFolderByName(name: string): Promise<void> {
  const escaped = escapeJXA(name);
  const script = wrapJXAFunction(`
    const Notes = Application("Notes");
    const folders = Notes.folders.whose({ name: "${escaped}" })();
    for (let i = 0; i < folders.length; i++) {
      Notes.delete(folders[i]);
    }
    return JSON.stringify(true);
  `);
  await executeJXA(script, { timeout: 10_000 });
}

export async function deleteReminderListByName(name: string): Promise<void> {
  const escaped = escapeJXA(name);
  const script = wrapJXAFunction(`
    const Reminders = Application("Reminders");
    const lists = Reminders.lists.whose({ name: "${escaped}" })();
    for (let i = 0; i < lists.length; i++) {
      Reminders.delete(lists[i]);
    }
    return JSON.stringify(true);
  `);
  await executeJXA(script, { timeout: 10_000 });
}

export async function deleteCalendarEventByTitle(title: string): Promise<void> {
  const escaped = escapeJXA(title);
  const script = wrapJXAFunction(`
    const Calendar = Application("Calendar");
    const calendars = Calendar.calendars();
    for (let i = 0; i < calendars.length; i++) {
      const events = calendars[i].events.whose({ summary: "${escaped}" })();
      for (let j = 0; j < events.length; j++) {
        Calendar.delete(events[j]);
      }
    }
    return JSON.stringify(true);
  `);
  await executeJXA(script, { timeout: 45_000 });
}

export async function createReminderList(name: string): Promise<void> {
  const escaped = escapeJXA(name);
  const script = wrapJXAFunction(`
    const Reminders = Application("Reminders");
    Reminders.make({ new: "list", withProperties: { name: "${escaped}" } });
    return JSON.stringify(true);
  `);
  await executeJXA(script, { timeout: 10_000 });
}
