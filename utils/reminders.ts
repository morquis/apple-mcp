import {
  executeJXA,
  JXAConverters,
  wrapJXAFunction,
} from "../core/jxa-bridge.ts";

// Define types for our reminders
interface ReminderList {
  name: string;
  id: string;
}

interface Reminder {
  name: string;
  id: string;
  body: string;
  completed: boolean;
  dueDate: string | null;
  listName: string;
  completionDate?: string | null;
  creationDate?: string | null;
  modificationDate?: string | null;
  remindMeDate?: string | null;
  priority?: number;
}

interface OpenReminderResult {
  success: boolean;
  message: string;
  reminder?: Reminder;
}

const DEFAULT_REMINDER_PROPS = [
  "name",
  "body",
  "id",
  "completed",
  "completionDate",
  "creationDate",
  "dueDate",
  "modificationDate",
  "remindMeDate",
  "priority",
] as const;

function escapeJXAString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function serializeJXAStringArray(values: string[]): string {
  return `[${values.map((value) => `"${escapeJXAString(value)}"`).join(", ")}]`;
}

/**
 * Get all reminder lists
 * @returns Array of reminder lists with their names and IDs
 */
async function getAllLists(): Promise<ReminderList[]> {
  const script = wrapJXAFunction(`
    const Reminders = Application("Reminders");
    const lists = Reminders.lists();
    const result = [];

    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];

      result.push({
        name: ${JXAConverters.toString("list.name()", '""')},
        id: ${JXAConverters.toString("list.id()", '""')},
      });
    }

    return JSON.stringify(result);
  `);

  const lists = await executeJXA<ReminderList[]>(script);
  return Array.isArray(lists) ? lists : [];
}

/**
 * Get reminders from a specific list by ID with customizable properties
 * @param listId ID of the list to get reminders from
 * @param props Array of properties to include (optional)
 * @returns Array of reminders with specified properties
 */
async function getRemindersFromListById(
  listId: string,
  props?: string[]
): Promise<any[]> {
  const escapedListId = escapeJXAString(listId);
  const selectedProps = props ?? [...DEFAULT_REMINDER_PROPS];
  const propsExpression = serializeJXAStringArray([...selectedProps]);

  const script = wrapJXAFunction(`
    const Reminders = Application("Reminders");
    const listId = "${escapedListId}";
    const props = ${propsExpression};
    const reminderList = Reminders.lists.byId(listId);
    const reminders = reminderList.reminders();
    const dateProps = {
      completionDate: true,
      creationDate: true,
      dueDate: true,
      modificationDate: true,
      remindMeDate: true,
    };

    function toStringValue(value, fallback = "") {
      if (value === null || value === undefined) {
        return fallback;
      }

      if (typeof value === "string") {
        return value;
      }

      try {
        const unwrapped = ObjC.unwrap(value);
        if (typeof unwrapped === "string") {
          return unwrapped;
        }

        if (unwrapped !== null && unwrapped !== undefined) {
          return String(unwrapped);
        }
      } catch (_) {
        // Fall through to non-ObjC coercion.
      }

      if (typeof value.js === "string") {
        return value.js;
      }

      return String(value);
    }

    function toISOStringOrNull(value) {
      if (value === null || value === undefined) {
        return null;
      }

      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    function normalizeReminderValue(prop, value) {
      if (value === null || value === undefined) {
        return null;
      }

      if (prop === "name" || prop === "body" || prop === "id" || prop === "listName") {
        return toStringValue(value, "");
      }

      if (dateProps[prop]) {
        return toISOStringOrNull(value);
      }

      try {
        return ObjC.unwrap(value);
      } catch (_) {
        return value;
      }
    }

    const result = [];
    for (let i = 0; i < reminders.length; i++) {
      const reminder = reminders[i];
      const entry = {};

      for (let j = 0; j < props.length; j++) {
        const prop = props[j];

        if (prop === "listName") {
          entry[prop] = ${JXAConverters.toString("reminderList.name()", '""')};
          continue;
        }

        try {
          const candidate = reminder[prop];
          // In JXA, methods on Application objects must be called via
          // target[prop]() — .call() loses the bridge context.
          const value = typeof candidate === "function" ? reminder[prop]() : candidate;
          entry[prop] = normalizeReminderValue(prop, value);
        } catch (_) {
          entry[prop] = null;
        }
      }

      result.push(entry);
    }

    return JSON.stringify(result);
  `);

  const reminders = await executeJXA<any[]>(script);
  return Array.isArray(reminders) ? reminders : [];
}

/**
 * Get all reminders from a specific list or all lists
 * @param listName Optional list name to filter by
 * @returns Array of reminders
 */
async function getAllReminders(listName?: string): Promise<Reminder[]> {
  const escapedListName = listName === undefined ? null : escapeJXAString(listName);
  const targetListExpression = escapedListName === null ? "null" : `"${escapedListName}"`;

  const script = wrapJXAFunction(`
    const Reminders = Application("Reminders");
    const targetListName = ${targetListExpression};
    let allReminders = [];

    function mapReminder(reminder, listName) {
      return {
        name: ${JXAConverters.toString("reminder.name()", '""')},
        id: ${JXAConverters.toString("reminder.id()", '""')},
        body: ${JXAConverters.toString("reminder.body()", '""')},
        completed: Boolean(reminder.completed()),
        dueDate: ${JXAConverters.toISOString("reminder.dueDate()", "null")},
        listName,
      };
    }

    if (targetListName) {
      const lists = Reminders.lists.whose({ name: targetListName })();
      if (lists.length > 0) {
        const list = lists[0];
        const resolvedListName = ${JXAConverters.toString("list.name()", '""')};
        const reminders = list.reminders();

        for (let i = 0; i < reminders.length; i++) {
          allReminders.push(mapReminder(reminders[i], resolvedListName));
        }
      }
    } else {
      const lists = Reminders.lists();

      for (let i = 0; i < lists.length; i++) {
        const list = lists[i];
        const reminders = list.reminders();
        const resolvedListName = ${JXAConverters.toString("list.name()", '""')};

        for (let j = 0; j < reminders.length; j++) {
          allReminders.push(mapReminder(reminders[j], resolvedListName));
        }
      }
    }

    return JSON.stringify(allReminders);
  `);

  const reminders = await executeJXA<Reminder[]>(script);
  return Array.isArray(reminders) ? reminders : [];
}

/**
 * Search for reminders by text
 * @param searchText Text to search for in reminder names or notes
 * @returns Array of matching reminders
 */
async function searchReminders(searchText: string): Promise<Reminder[]> {
  const escapedSearchText = escapeJXAString(searchText);
  const script = wrapJXAFunction(`
    const Reminders = Application("Reminders");
    const searchText = "${escapedSearchText}";
    const lists = Reminders.lists();
    let matchingReminders = [];

    function mapReminder(reminder, listName) {
      return {
        name: ${JXAConverters.toString("reminder.name()", '""')},
        id: ${JXAConverters.toString("reminder.id()", '""')},
        body: ${JXAConverters.toString("reminder.body()", '""')},
        completed: Boolean(reminder.completed()),
        dueDate: ${JXAConverters.toISOString("reminder.dueDate()", "null")},
        listName,
      };
    }

    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      const remindersInList = list.reminders.whose({
        _or: [
          { name: { _contains: searchText } },
          { body: { _contains: searchText } },
        ],
      })();

      if (remindersInList.length === 0) {
        continue;
      }

      const resolvedListName = ${JXAConverters.toString("list.name()", '""')};

      for (let j = 0; j < remindersInList.length; j++) {
        matchingReminders.push(mapReminder(remindersInList[j], resolvedListName));
      }
    }

    return JSON.stringify(matchingReminders);
  `);

  const reminders = await executeJXA<Reminder[]>(script);
  return Array.isArray(reminders) ? reminders : [];
}

/**
 * Create a new reminder
 * @param name Name of the reminder
 * @param listName Name of the list to add the reminder to (creates if doesn't exist)
 * @param notes Optional notes for the reminder
 * @param dueDate Optional due date for the reminder (ISO string)
 * @returns The created reminder
 */
async function createReminder(
  name: string,
  listName: string = "Reminders",
  notes?: string,
  dueDate?: string
): Promise<Reminder> {
  const escapedName = escapeJXAString(name);
  const escapedListName = escapeJXAString(listName);
  const escapedNotes = notes === undefined ? null : escapeJXAString(notes);
  const escapedDueDate = dueDate === undefined ? null : escapeJXAString(dueDate);
  const notesExpression = escapedNotes === null ? "null" : `"${escapedNotes}"`;
  const dueDateExpression = escapedDueDate === null ? "null" : `"${escapedDueDate}"`;

  const script = wrapJXAFunction(`
    const Reminders = Application("Reminders");
    const name = "${escapedName}";
    const listName = "${escapedListName}";
    const notes = ${notesExpression};
    const dueDate = ${dueDateExpression};

    let list;
    const existingLists = Reminders.lists.whose({ name: listName })();

    if (existingLists.length > 0) {
      list = existingLists[0];
    } else {
      list = Reminders.make({
        new: "list",
        withProperties: { name: listName },
      });
    }

    const reminderProps = {
      name,
    };

    if (notes) {
      reminderProps.body = notes;
    }

    if (dueDate) {
      reminderProps.dueDate = new Date(dueDate);
    }

    const newReminder = Reminders.Reminder(reminderProps);
    list.reminders.push(newReminder);

    return JSON.stringify({
      name: ${JXAConverters.toString("newReminder.name()", '""')},
      id: ${JXAConverters.toString("newReminder.id()", '""')},
      body: ${JXAConverters.toString("newReminder.body()", '""')},
      completed: Boolean(newReminder.completed()),
      dueDate: ${JXAConverters.toISOString("newReminder.dueDate()", "null")},
      listName: ${JXAConverters.toString("list.name()", '""')},
    });
  `);

  return await executeJXA<Reminder>(script);
}

/**
 * Open the Reminders app and show a specific reminder
 * @param searchText Text to search for in reminder names or notes
 * @returns Result of the operation
 */
async function openReminder(searchText: string): Promise<OpenReminderResult> {
  const matchingReminders = await searchReminders(searchText);

  if (matchingReminders.length === 0) {
    return { success: false, message: "No matching reminders found" };
  }

  const reminder = matchingReminders[0];
  const escapedReminderId = escapeJXAString(reminder.id);
  const script = wrapJXAFunction(`
    const reminderId = "${escapedReminderId}";
    const Reminders = Application("Reminders");
    void reminderId;

    Reminders.activate();
    return JSON.stringify(true);
  `);

  await executeJXA<boolean>(script);

  return {
    success: true,
    message: "Reminders app opened",
    reminder,
  };
}

export default {
  getAllLists,
  getAllReminders,
  searchReminders,
  createReminder,
  openReminder,
  getRemindersFromListById,
};
