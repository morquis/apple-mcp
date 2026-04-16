import {
  executeJXA,
  JXAConverters,
  wrapJXAFunction,
} from "../core/jxa-bridge.ts";

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

// Configuration for timeouts and limits
const CONFIG = {
  // Maximum time (in ms) to wait for calendar operations.
  // Exchange calendars with thousands of events can take 30-90s per calendar for
  // .whose() queries depending on server load. With multiple Exchange calendars,
  // total time can reach 4-5 minutes. Set to 5 minutes as maximum.
  TIMEOUT_MS: 300_000,
  // Maximum number of events to process per calendar in getEvents
  MAX_EVENTS_PER_CALENDAR: 200,
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
 * JXA helper functions for RRULE expansion and event building.
 * JXA/AppleScript does not expand recurring events into individual occurrences,
 * so we need to parse RRULE strings and compute occurrences within a date range.
 */
const CALENDAR_JXA_HELPERS = `
function parseRRule(rrule) {
  if (!rrule || typeof rrule !== "string") return null;
  var parts = {};
  var pairs = rrule.split(";");
  for (var i = 0; i < pairs.length; i++) {
    var kv = pairs[i].split("=");
    if (kv.length === 2) parts[kv[0]] = kv[1];
  }
  return parts;
}

function expandOccurrences(eventStart, eventEnd, rrule, rangeStart, rangeEnd) {
  var parsed = parseRRule(rrule);
  if (!parsed || !parsed.FREQ) return [];

  var freq = parsed.FREQ;
  var interval = parsed.INTERVAL ? parseInt(parsed.INTERVAL, 10) : 1;
  var until = parsed.UNTIL ? parseUntilDate(parsed.UNTIL) : null;
  var count = parsed.COUNT ? parseInt(parsed.COUNT, 10) : null;

  var durationMs = eventEnd.getTime() - eventStart.getTime();
  var occurrences = [];
  var current = new Date(eventStart.getTime());
  var generated = 0;
  var maxIterations = 1000;

  while (maxIterations-- > 0) {
    if (until && current > until) break;
    if (count !== null && generated >= count) break;
    if (current > rangeEnd) break;

    var occEnd = new Date(current.getTime() + durationMs);
    if (occEnd >= rangeStart && current <= rangeEnd) {
      occurrences.push({ start: new Date(current.getTime()), end: occEnd });
    }

    generated++;
    if (freq === "DAILY") {
      current.setDate(current.getDate() + interval);
    } else if (freq === "WEEKLY") {
      current.setDate(current.getDate() + 7 * interval);
    } else if (freq === "MONTHLY") {
      current.setMonth(current.getMonth() + interval);
    } else if (freq === "YEARLY") {
      current.setFullYear(current.getFullYear() + interval);
    } else {
      break;
    }
  }

  return occurrences;
}

function parseUntilDate(s) {
  // UNTIL format: 20270131T225959Z or 20270131
  if (s.length >= 15) {
    return new Date(
      parseInt(s.substr(0,4),10), parseInt(s.substr(4,2),10)-1, parseInt(s.substr(6,2),10),
      parseInt(s.substr(9,2),10), parseInt(s.substr(11,2),10), parseInt(s.substr(13,2),10)
    );
  }
  if (s.length >= 8) {
    return new Date(parseInt(s.substr(0,4),10), parseInt(s.substr(4,2),10)-1, parseInt(s.substr(6,2),10));
  }
  return null;
}
`;

async function executeCalendarScript<T>(functionBody: string): Promise<T> {
  const script = wrapJXAFunction(CALENDAR_JXA_HELPERS + "\n" + functionBody);
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
 * Search for calendar events that match the search text
 * @param searchText Text to search for in event titles (summary field only; location/notes search disabled due to Exchange performance)
 * @param limit Optional limit on the number of results (default 10)
 * @param fromDate Optional start date for search range in ISO format (default: today)
 * @param toDate Optional end date for search range in ISO format (default: 30 days from now)
 * @param calendarName Optional calendar name to search in (searches all if not specified)
 * @returns Array of calendar events matching the search criteria
 */
async function searchEvents(
  searchText: string,
  limit = 10,
  fromDate?: string,
  toDate?: string,
  calendarName?: string,
): Promise<CalendarEvent[]> {
  try {
    if (!(await checkCalendarAccess())) {
      return [];
    }

    console.error(`searchEvents - Processing calendars for search: "${searchText}"${calendarName ? ` in calendar: "${calendarName}"` : ""}`);

    const escapedSearchText = escapeJXAString(searchText);
    const fromDateExpression = toOptionalStringExpression(fromDate);
    const toDateExpression = toOptionalStringExpression(toDate);
    const calendarNameExpression = toOptionalStringExpression(calendarName);
    const normalizedLimit = Math.max(0, Math.trunc(limit));

    const events = await executeCalendarScript<CalendarEvent[]>(`
      var Calendar = Application("Calendar");
      var searchText = "${escapedSearchText}";
      var requestedLimit = ${normalizedLimit};
      var fromDateInput = ${fromDateExpression};
      var toDateInput = ${toDateExpression};
      var targetCalendarName = ${calendarNameExpression};
      var maxEventsPerCalendar = ${CONFIG.MAX_EVENTS_PER_CALENDAR};

      var today = new Date();
      var rangeStart = fromDateInput ? new Date(fromDateInput) : today;
      var rangeEnd = toDateInput
        ? new Date(toDateInput)
        : new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
        throw new Error("Invalid date range");
      }

      var matchingEvents = [];
      var seenIds = {};
      var allCalendars = targetCalendarName
        ? Calendar.calendars.whose({ name: targetCalendarName })()
        : Calendar.calendars();

      function readEvent(event, calendarName) {
        var title = ${JXAConverters.toString(
          JXAConverters.safeGet("event", "summary", '""'),
          '"Unknown Title"',
        )};
        var location = ${JXAConverters.toString(
          JXAConverters.safeGet("event", "location", '""'),
          '""',
        )};
        var notes = ${JXAConverters.toString(
          JXAConverters.safeGet("event", "description", '""'),
          '""',
        )};
        var uid = ${JXAConverters.toString(
          JXAConverters.safeGet("event", "uid", "null"),
          '"unknown-" + Date.now() + "-" + Math.random()',
        )};
        var isAllDay = Boolean(${JXAConverters.safeGet("event", "alldayEvent", "false")});
        var url = ${JXAConverters.toString(
          JXAConverters.safeGet("event", "url", "null"),
          "null",
        )};
        var evStart = ${JXAConverters.safeGet("event", "startDate", "null")};
        var evEnd = ${JXAConverters.safeGet("event", "endDate", "null")};
        var rrule = null;
        try { rrule = event.recurrence(); } catch(_) {}

        return { title: title, location: location, notes: notes, uid: uid,
                 isAllDay: isAllDay, url: url, evStart: evStart, evEnd: evEnd,
                 rrule: rrule, calendarName: calendarName };
      }

      function toOutput(info, startOverride, endOverride) {
        var startD = startOverride || info.evStart;
        var endD = endOverride || info.evEnd;
        return {
          id: info.uid, title: info.title, location: info.location, notes: info.notes,
          startDate: startD instanceof Date && !Number.isNaN(startD.getTime()) ? startD.toISOString() : null,
          endDate: endD instanceof Date && !Number.isNaN(endD.getTime()) ? endD.toISOString() : null,
          calendarName: info.calendarName, isAllDay: info.isAllDay, url: info.url,
        };
      }

      // Strategy: search by summary first (.whose() query), then check each
      // match for recurrence and expand if needed. Exchange calendars with
      // thousands of events take 15-20s per .whose() query, so we use a
      // single query per calendar (summary only — _or doubles the time).
      for (var i = 0; i < allCalendars.length && matchingEvents.length < requestedLimit; i++) {
        try {
          var calendar = allCalendars[i];
          var calendarName = ${JXAConverters.toString("calendar.name()", '""')};

          var textMatches = calendar.events.whose({ summary: { _contains: searchText } })();

          for (var j = 0; j < textMatches.length && matchingEvents.length < requestedLimit; j++) {
            try {
              var info = readEvent(textMatches[j], calendarName);
              if (seenIds[info.uid]) continue;
              seenIds[info.uid] = true;

              if (info.rrule && info.evStart && info.evEnd) {
                // Recurring event: expand occurrences within range
                var occurrences = expandOccurrences(info.evStart, info.evEnd, info.rrule, rangeStart, rangeEnd);
                for (var o = 0; o < occurrences.length && matchingEvents.length < requestedLimit; o++) {
                  matchingEvents.push(toOutput(info, occurrences[o].start, occurrences[o].end));
                }
              } else if (info.evStart && info.evStart >= rangeStart && info.evStart <= rangeEnd) {
                // Non-recurring: include if in range
                matchingEvents.push(toOutput(info, null, null));
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      // Sort by startDate
      matchingEvents.sort(function(a, b) {
        return (a.startDate || "").localeCompare(b.startDate || "");
      });

      return JSON.stringify(matchingEvents.slice(0, requestedLimit));
    `);

    if (!Array.isArray(events) || events.length === 0) {
      console.error("searchEvents - No events found");
      return [];
    }

    return events;
  } catch (error) {
    console.error(`Error searching events: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Open a specific calendar event in the Calendar app
 * @param eventId ID of the event to open
 * @returns Result object indicating success or failure
 */
async function openEvent(eventId: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!(await checkCalendarAccess())) {
      return {
        success: false,
        message:
          "Cannot access Calendar app. Please grant access in System Settings > Privacy & Security > Automation.",
      };
    }

    console.error(`openEvent - Attempting to open event with ID: ${eventId}`);

    const escapedEventId = escapeJXAString(eventId);
    const result = await executeCalendarScript<{ success: boolean; message: string }>(`
      const Calendar = Application("Calendar");
      const eventId = "${escapedEventId}";
      const allCalendars = Calendar.calendars();

      for (let i = 0; i < allCalendars.length; i++) {
        try {
          const calendar = allCalendars[i];
          const events = calendar.events.whose({
            uid: { _equals: eventId },
          })();

          if (events.length === 0) {
            continue;
          }

          const event = events[0];
          Calendar.activate();
          event.show();

          return JSON.stringify({
            success: true,
            message: "Successfully opened event: " + ${JXAConverters.toString(
              JXAConverters.safeGet("event", "summary", '""'),
              '"Unknown Title"',
            )},
          });
        } catch (_) {
          // Skip calendars that can't be processed.
        }
      }

      return JSON.stringify({
        success: false,
        message: "No event found with ID: " + eventId,
      });
    `);

    return result;
  } catch (error) {
    console.error(`Error opening event: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      message: `Error opening event: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get all calendar events in a specified date range
 * @param limit Optional limit on the number of results (default 10)
 * @param fromDate Optional start date for search range in ISO format (default: today)
 * @param toDate Optional end date for search range in ISO format (default: 7 days from now)
 * @param calendarName Optional calendar name to filter (searches all if not specified)
 * @returns Array of calendar events in the specified date range
 */
async function getEvents(
  limit = 10,
  fromDate?: string,
  toDate?: string,
  calendarName?: string,
): Promise<CalendarEvent[]> {
  try {
    console.error("getEvents - Starting to fetch calendar events");

    if (!(await checkCalendarAccess())) {
      console.error("getEvents - Failed to access Calendar app");
      return [];
    }
    console.error("getEvents - Calendar access check passed");

    const fromDateExpression = toOptionalStringExpression(fromDate);
    const toDateExpression = toOptionalStringExpression(toDate);
    const calendarNameExpression = toOptionalStringExpression(calendarName);
    const normalizedLimit = Math.max(0, Math.trunc(limit));

    const events = await executeCalendarScript<CalendarEvent[]>(`
      var Calendar = Application("Calendar");
      var requestedLimit = ${normalizedLimit};
      var fromDateInput = ${fromDateExpression};
      var toDateInput = ${toDateExpression};
      var targetCalendarName = ${calendarNameExpression};
      var maxEventsPerCalendar = ${CONFIG.MAX_EVENTS_PER_CALENDAR};

      var today = new Date();
      var rangeStart = fromDateInput ? new Date(fromDateInput) : today;
      var rangeEnd = toDateInput
        ? new Date(toDateInput)
        : new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
        throw new Error("Invalid date range");
      }

      var calendars = targetCalendarName
        ? Calendar.calendars.whose({ name: targetCalendarName })()
        : Calendar.calendars();
      var allEvents = [];
      var seenIds = {};

      function readEventData(event, calendarName) {
        return {
          uid: ${JXAConverters.toString(
            JXAConverters.safeGet("event", "uid", "null"),
            '"unknown-" + Date.now() + "-" + Math.random()',
          )},
          title: ${JXAConverters.toString(
            JXAConverters.safeGet("event", "summary", '""'),
            '"Unknown Title"',
          )},
          location: ${JXAConverters.toString(
            JXAConverters.safeGet("event", "location", "null"),
            "null",
          )},
          notes: ${JXAConverters.toString(
            JXAConverters.safeGet("event", "description", "null"),
            "null",
          )},
          evStart: ${JXAConverters.safeGet("event", "startDate", "null")},
          evEnd: ${JXAConverters.safeGet("event", "endDate", "null")},
          calendarName: calendarName,
          isAllDay: Boolean(${JXAConverters.safeGet("event", "alldayEvent", "false")}),
          url: ${JXAConverters.toString(
            JXAConverters.safeGet("event", "url", "null"),
            "null",
          )},
          rrule: (function() { try { return event.recurrence(); } catch(_) { return null; } })(),
        };
      }

      function toResult(info, startOverride, endOverride) {
        var s = startOverride || info.evStart;
        var e = endOverride || info.evEnd;
        return {
          id: info.uid, title: info.title, location: info.location, notes: info.notes,
          startDate: s instanceof Date && !Number.isNaN(s.getTime()) ? s.toISOString() : null,
          endDate: e instanceof Date && !Number.isNaN(e.getTime()) ? e.toISOString() : null,
          calendarName: info.calendarName, isAllDay: info.isAllDay, url: info.url,
        };
      }

      for (var i = 0; i < calendars.length; i++) {
        try {
          var calendar = calendars[i];
          var calendarName = ${JXAConverters.toString("calendar.name()", '""')};

          // Fetch events overlapping the date range.
          // This query returns events where startDate < rangeEnd AND
          // endDate > rangeStart, which captures all events that overlap.
          // Note: recurring events whose original start is before rangeStart
          // won't be found here — JXA doesn't support filtering on recurrence.
          // We expand recurrence for any recurring events that do match.
          var candidates = calendar.events.whose({
            _and: [
              { startDate: { _lessThan: rangeEnd } },
              { endDate: { _greaterThan: rangeStart } },
            ],
          })();
          var candidateCount = Math.min(candidates.length, maxEventsPerCalendar);

          for (var j = 0; j < candidateCount; j++) {
            try {
              var info = readEventData(candidates[j], calendarName);
              if (seenIds[info.uid]) continue;
              seenIds[info.uid] = true;

              if (info.rrule && info.evStart && info.evEnd) {
                // Recurring event: expand occurrences within range
                var occurrences = expandOccurrences(info.evStart, info.evEnd, info.rrule, rangeStart, rangeEnd);
                for (var o = 0; o < occurrences.length; o++) {
                  allEvents.push(toResult(info, occurrences[o].start, occurrences[o].end));
                }
              } else if (info.evStart && info.evStart >= rangeStart && info.evStart <= rangeEnd) {
                // Non-recurring: include if start is within range
                allEvents.push(toResult(info, null, null));
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      // Sort by startDate, then limit
      allEvents.sort(function(a, b) {
        return (a.startDate || "").localeCompare(b.startDate || "");
      });

      return JSON.stringify(allEvents.slice(0, requestedLimit));
    `);

    if (!Array.isArray(events) || events.length === 0) {
      console.error("getEvents - No events found");
      return [];
    }

    return events;
  } catch (error) {
    console.error(`Error getting events: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
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
