import {
  executeJXA,
  JXAConverters,
  wrapJXAFunction,
} from "../core/jxa-bridge.js";

// Define types for our calendar events
interface CalendarEvent {
  id: string;
  title: string;
  location: string | null;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  calendarName: string;
  isAllDay: boolean;
  url: string | null;
}

// Configuration for timeouts
const CONFIG = {
  // Calendar.app scripting for create.
  TIMEOUT_MS: 300_000,
  // open: EventKit lookup plus Calendar.app show(); allows for launching
  // Calendar.app if it is not running.
  OPEN_TIMEOUT_MS: 60_000,
  // EventKit queries (list/search) answer in milliseconds; anything slower
  // is a real failure and must surface as an error.
  EVENTKIT_TIMEOUT_MS: 30_000,
};

function escapeJXAString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function toOptionalStringExpression(value?: string): string {
  return value === undefined ? "null" : `"${escapeJXAString(value)}"`;
}

/**
 * EventKit query helper (JXA ObjC bridge).
 *
 * Calendar.app's scripting interface returns stored events only: a recurring
 * series is one master item dated at its first occurrence, so date-range
 * `whose()` queries miss every series that started before the range, and on
 * Exchange calendars each query takes 30-100 s. EventKit's
 * eventsMatchingPredicate expands recurring series into occurrences
 * (including exceptions and detached instances) and answers across all
 * calendars in milliseconds. It needs Calendar "Full Access" for the process
 * that launched the server.
 */
const EVENTKIT_JXA_HELPERS = `
ObjC.import("EventKit");
ObjC.import("Foundation");

function ekString(value) {
  if (value === undefined || value === null) return null;
  try {
    var js = ObjC.unwrap(value);
    return js === undefined || js === null || js === "" ? null : String(js);
  } catch (_) {
    return null;
  }
}

function ekDate(nsDate) {
  if (!nsDate) return null;
  var seconds = Number(nsDate.timeIntervalSince1970);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

function toNSDate(date) {
  return $.NSDate.dateWithTimeIntervalSince1970(date.getTime() / 1000);
}

function requireEventKitAccess() {
  var status = Number($.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent));
  // 3 = EKAuthorizationStatusFullAccess (macOS 14+; "authorized" before).
  if (status !== 3) {
    throw new Error(
      "Calendar access denied (EventKit authorization status " + status +
      "). Grant Full Access in System Settings > Privacy & Security > Calendars " +
      "to the app that launches the MCP server."
    );
  }
  return $.EKEventStore.alloc.init;
}

// Returns occurrences overlapping [rangeStart, rangeEnd], sorted by start.
// Throws on missing access or unknown calendar name, never returns a silent [].
function queryEventKit(rangeStart, rangeEnd, calendarName, matchesFn) {
  var store = requireEventKitAccess();
  var calendars = $();
  if (calendarName) {
    var all = store.calendarsForEntityType($.EKEntityTypeEvent);
    var matched = $.NSMutableArray.array;
    var available = [];
    for (var c = 0; c < Number(all.count); c++) {
      var cal = all.objectAtIndex(c);
      var title = ekString(cal.title);
      available.push(title);
      if (title === calendarName) matched.addObject(cal);
    }
    if (Number(matched.count) === 0) {
      throw new Error(
        'Calendar "' + calendarName + '" not found. Available: ' + available.join(", ")
      );
    }
    calendars = matched;
  }

  var predicate = store.predicateForEventsWithStartDateEndDateCalendars(
    toNSDate(rangeStart), toNSDate(rangeEnd), calendars
  );
  var events = store.eventsMatchingPredicate(predicate);
  var results = [];

  for (var i = 0; i < Number(events.count); i++) {
    var ev = events.objectAtIndex(i);
    var item = {
      // calendarItemIdentifier equals Calendar.app's AppleScript uid, which
      // openEvent looks up; occurrences of one series share this id.
      id: ekString(ev.calendarItemIdentifier) || ekString(ev.eventIdentifier) || "",
      title: ekString(ev.title) || "Unknown Title",
      location: ekString(ev.location),
      notes: ekString(ev.notes),
      startDate: ekDate(ev.startDate),
      endDate: ekDate(ev.endDate),
      calendarName: ekString(ev.calendar.title) || "",
      isAllDay: ev.isAllDay === true,
      url: ev.URL && !ev.URL.isNil() ? ekString(ev.URL.absoluteString) : null,
    };
    if (!matchesFn || matchesFn(item)) results.push(item);
  }

  results.sort(function (a, b) {
    return (a.startDate || "").localeCompare(b.startDate || "");
  });
  return results;
}

function parseRange(fromDateInput, toDateInput, defaultDays) {
  var today = new Date();
  var rangeStart = fromDateInput ? new Date(fromDateInput) : today;
  var rangeEnd = toDateInput
    ? new Date(toDateInput)
    : new Date(today.getTime() + defaultDays * 24 * 60 * 60 * 1000);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    throw new Error("Invalid date range");
  }
  if (rangeEnd <= rangeStart) {
    throw new Error("toDate must be after fromDate");
  }
  return { start: rangeStart, end: rangeEnd };
}
`;

async function executeEventKitScript<T>(
  functionBody: string,
  timeout: number = CONFIG.EVENTKIT_TIMEOUT_MS,
): Promise<T> {
  const script = wrapJXAFunction(EVENTKIT_JXA_HELPERS + "\n" + functionBody);
  return await executeJXA<T>(script, { timeout });
}

async function executeCalendarScript<T>(functionBody: string): Promise<T> {
  const script = wrapJXAFunction(functionBody);
  return await executeJXA<T>(script, { timeout: CONFIG.TIMEOUT_MS });
}

/**
 * Check if the Calendar app is accessible
 * @returns Promise resolving to true if Calendar is accessible, throws error otherwise
 */
async function checkCalendarAccess(): Promise<boolean> {
  try {
    const result = await executeCalendarScript<boolean>(`
      const Calendar = Application("Calendar");
      Calendar.name();
      return JSON.stringify(true);
    `);

    return result === true;
  } catch (error) {
    console.error(
      `Cannot access Calendar app: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Search for calendar events (occurrences, including recurring series) whose
 * title, location or notes contain the search text (case-insensitive).
 * Errors (missing access, unknown calendar, timeout) are thrown, never
 * reported as an empty result.
 * @param searchText Text to search for
 * @param limit Optional limit on the number of results (default 10)
 * @param fromDate Optional start date in ISO format (default: now)
 * @param toDate Optional end date in ISO format (default: 30 days from now)
 * @param calendarName Optional calendar name (all calendars if not specified)
 */
async function searchEvents(
  searchText: string,
  limit = 10,
  fromDate?: string,
  toDate?: string,
  calendarName?: string,
): Promise<CalendarEvent[]> {
  const escapedSearchText = escapeJXAString(searchText);
  const normalizedLimit = Math.max(0, Math.trunc(limit));

  const events = await executeEventKitScript<CalendarEvent[]>(`
    var searchText = "${escapedSearchText}";
    var requestedLimit = ${normalizedLimit};
    var fromDateInput = ${toOptionalStringExpression(fromDate)};
    var toDateInput = ${toOptionalStringExpression(toDate)};
    var targetCalendarName = ${toOptionalStringExpression(calendarName)};

    var range = parseRange(fromDateInput, toDateInput, 30);
    var needle = searchText.toLowerCase();
    var matches = queryEventKit(range.start, range.end, targetCalendarName, function (ev) {
      return [ev.title, ev.location, ev.notes].some(function (field) {
        return typeof field === "string" && field.toLowerCase().indexOf(needle) !== -1;
      });
    });

    return JSON.stringify(matches.slice(0, requestedLimit));
  `);

  return Array.isArray(events) ? events : [];
}

/**
 * Open a specific calendar event in the Calendar app.
 * The event is resolved through EventKit (calendarItemIdentifier, the id that
 * search/list return) and addressed in Calendar.app directly by calendar id
 * and event id, so no whose() scan over Exchange calendars is needed.
 * @param eventId ID of the event to open
 * @returns Result object indicating success or failure
 */
async function openEvent(eventId: string): Promise<{ success: boolean; message: string }> {
  try {
    const escapedEventId = escapeJXAString(eventId);
    return await executeEventKitScript<{ success: boolean; message: string }>(`
      var eventId = "${escapedEventId}";
      var store = requireEventKitAccess();
      var item = store.calendarItemWithIdentifier(eventId);

      if (!item || item.isNil()) {
        return JSON.stringify({
          success: false,
          message: "No event found with ID: " + eventId,
        });
      }

      var calendarId = ekString(item.calendar.calendarIdentifier);
      var Calendar = Application("Calendar");
      var event = Calendar.calendars.byId(calendarId).events.byId(eventId);
      var title = String(event.summary() || "Unknown Title");
      Calendar.activate();
      event.show();

      return JSON.stringify({
        success: true,
        message: "Successfully opened event: " + title,
      });
    `, CONFIG.OPEN_TIMEOUT_MS);
  } catch (error) {
    // index.ts prefixes "Error opening event: " itself.
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get all calendar event occurrences overlapping a date range, including
 * occurrences of recurring series. Errors are thrown, never reported as an
 * empty result.
 * @param limit Optional limit on the number of results (default 10)
 * @param fromDate Optional start date in ISO format (default: now)
 * @param toDate Optional end date in ISO format (default: 7 days from now)
 * @param calendarName Optional calendar name (all calendars if not specified)
 */
async function getEvents(
  limit = 10,
  fromDate?: string,
  toDate?: string,
  calendarName?: string,
): Promise<CalendarEvent[]> {
  const normalizedLimit = Math.max(0, Math.trunc(limit));

  const events = await executeEventKitScript<CalendarEvent[]>(`
    var requestedLimit = ${normalizedLimit};
    var fromDateInput = ${toOptionalStringExpression(fromDate)};
    var toDateInput = ${toOptionalStringExpression(toDate)};
    var targetCalendarName = ${toOptionalStringExpression(calendarName)};

    var range = parseRange(fromDateInput, toDateInput, 7);
    var events = queryEventKit(range.start, range.end, targetCalendarName, null);

    return JSON.stringify(events.slice(0, requestedLimit));
  `);

  return Array.isArray(events) ? events : [];
}

/**
 * Create a new calendar event
 * @param title Title of the event
 * @param startDate Start date/time in ISO format
 * @param endDate End date/time in ISO format
 * @param location Optional location of the event
 * @param notes Optional notes for the event
 * @param isAllDay Optional flag to create an all-day event
 * @param calendarName Optional calendar name to add the event to (uses default if not specified)
 * @returns Result object indicating success or failure, including the created event ID
 */
async function createEvent(
  title: string,
  startDate: string,
  endDate: string,
  location?: string,
  notes?: string,
  isAllDay = false,
  calendarName?: string,
): Promise<{ success: boolean; message: string; eventId?: string }> {
  try {
    if (!(await checkCalendarAccess())) {
      return {
        success: false,
        message:
          "Cannot access Calendar app. Please grant access in System Settings > Privacy & Security > Automation.",
      };
    }

    console.error(`createEvent - Attempting to create event: "${title}"`);

    const escapedTitle = escapeJXAString(title);
    const escapedStartDate = escapeJXAString(startDate);
    const escapedEndDate = escapeJXAString(endDate);
    const locationExpression = toOptionalStringExpression(location);
    const notesExpression = toOptionalStringExpression(notes);
    const calendarNameExpression = toOptionalStringExpression(calendarName);

    const result = await executeCalendarScript<{
      success: boolean;
      message: string;
      eventId?: string;
    }>(`
      const Calendar = Application("Calendar");
      const title = "${escapedTitle}";
      const startDateInput = "${escapedStartDate}";
      const endDateInput = "${escapedEndDate}";
      const location = ${locationExpression};
      const notes = ${notesExpression};
      const isAllDay = ${JSON.stringify(isAllDay)};
      const calendarName = ${calendarNameExpression};

      const startDateTime = new Date(startDateInput);
      const endDateTime = new Date(endDateInput);

      if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
        throw new Error("Invalid startDate or endDate");
      }

      let targetCalendar;

      if (calendarName) {
        const calendars = Calendar.calendars.whose({
          name: { _equals: calendarName },
        })();

        if (calendars.length > 0) {
          targetCalendar = calendars[0];
        } else {
          return JSON.stringify({
            success: false,
            message: 'Calendar "' + calendarName + '" not found.',
          });
        }
      } else {
        const allCalendars = Calendar.calendars();

        if (allCalendars.length === 0) {
          return JSON.stringify({
            success: false,
            message: "No calendars found in Calendar app.",
          });
        }

        targetCalendar = allCalendars[0];
      }

      const newEvent = Calendar.Event({
        summary: title,
        startDate: startDateTime,
        endDate: endDateTime,
        location: location || "",
        description: notes || "",
        alldayEvent: isAllDay,
      });

      targetCalendar.events.push(newEvent);

      const eventId = ${JXAConverters.toString(
        JXAConverters.safeGet("newEvent", "uid", "null"),
        "null",
      )};

      if (eventId) {
        return JSON.stringify({
          success: true,
          message: 'Event "' + title + '" created successfully.',
          eventId,
        });
      }

      return JSON.stringify({
        success: true,
        message: 'Event "' + title + '" created successfully.',
      });
    `);

    return result;
  } catch (error) {
    return {
      success: false,
      message: `Error creating event: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const calendar = {
  searchEvents,
  openEvent,
  getEvents,
  createEvent,
};

export default calendar;
