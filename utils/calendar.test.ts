import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.js";

let importCounter = 0;

async function importCalendar() {
  importCounter += 1;
  return (await import(`./calendar.js?test=${importCounter}`)).default;
}

describe("calendar", () => {
  afterEach(() => {
    mock.restore();
  });

  it("searchEvents returns an empty array when calendar access fails", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockImplementation(() => Promise.reject(new Error("denied")) as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const calendar = await importCalendar();
    const result = await calendar.searchEvents("trip");

    expect(result).toEqual([]);
    expect(executeJXASpy).toHaveBeenCalledTimes(1);
    expect(String(executeJXASpy.mock.calls[0]?.[0])).toContain('Application("Calendar")');
  });

  it("searchEvents escapes search text and date arguments before executing JXA", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce([
        {
          id: "event-1",
          title: 'Plan "trip"',
          location: "Berlin",
          notes: "Discuss itinerary",
          startDate: "2026-04-14T09:00:00.000Z",
          endDate: "2026-04-14T10:00:00.000Z",
          calendarName: "Travel",
          isAllDay: false,
          url: null,
        },
      ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const calendar = await importCalendar();
    const result = await calendar.searchEvents(
      'Plan "trip"\nsoon',
      3,
      "2026-04-14T09:00:00.000Z",
      "2026-05-14T09:00:00.000Z",
    );

    expect(result).toEqual([
      {
        id: "event-1",
        title: 'Plan "trip"',
        location: "Berlin",
        notes: "Discuss itinerary",
        startDate: "2026-04-14T09:00:00.000Z",
        endDate: "2026-04-14T10:00:00.000Z",
        calendarName: "Travel",
        isAllDay: false,
        url: null,
      },
    ]);

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('var searchText = "Plan \\"trip\\"\\nsoon"');
    expect(script).toContain('var fromDateInput = "2026-04-14T09:00:00.000Z"');
    expect(script).toContain('var toDateInput = "2026-05-14T09:00:00.000Z"');
    expect(script).toContain("expandOccurrences");
  });

  it("openEvent opens a matching event by escaped id", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({
        success: true,
        message: 'Successfully opened event: Demo "Day"',
      } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const calendar = await importCalendar();
    const result = await calendar.openEvent('event-"123"');

    expect(result).toEqual({
      success: true,
      message: 'Successfully opened event: Demo "Day"',
    });

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('const eventId = "event-\\"123\\""');
    expect(script).toContain("event.show()");
    expect(script).toContain("Calendar.activate()");
  });

  it("getEvents serializes date arguments through the bridge-backed script", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce([
        {
          id: "event-2",
          title: "Weekly Review",
          location: null,
          notes: null,
          startDate: "2026-04-15T08:00:00.000Z",
          endDate: "2026-04-15T09:00:00.000Z",
          calendarName: "Work",
          isAllDay: false,
          url: "https://example.com/review",
        },
      ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const calendar = await importCalendar();
    const result = await calendar.getEvents(
      5,
      "2026-04-15T00:00:00.000Z",
      "2026-04-22T23:59:59.000Z",
    );

    expect(result).toEqual([
      {
        id: "event-2",
        title: "Weekly Review",
        location: null,
        notes: null,
        startDate: "2026-04-15T08:00:00.000Z",
        endDate: "2026-04-15T09:00:00.000Z",
        calendarName: "Work",
        isAllDay: false,
        url: "https://example.com/review",
      },
    ]);

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('var fromDateInput = "2026-04-15T00:00:00.000Z"');
    expect(script).toContain('var toDateInput = "2026-04-22T23:59:59.000Z"');
    expect(script).toContain("expandOccurrences");
  });

  it("createEvent escapes user inputs and interpolates date strings into the JXA script", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({
        success: true,
        message: 'Event "Demo \\"Day\\"" created successfully.',
        eventId: "created-1",
      } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const calendar = await importCalendar();
    const result = await calendar.createEvent(
      'Demo "Day"',
      "2026-04-16T09:30:00.000Z",
      "2026-04-16T10:30:00.000Z",
      'Room "A"',
      "Bring\nnotes",
      true,
      'Work "Team"',
    );

    expect(result).toEqual({
      success: true,
      message: 'Event "Demo \\"Day\\"" created successfully.',
      eventId: "created-1",
    });

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('const title = "Demo \\"Day\\""');
    expect(script).toContain('const startDateInput = "2026-04-16T09:30:00.000Z"');
    expect(script).toContain('const endDateInput = "2026-04-16T10:30:00.000Z"');
    expect(script).toContain('const location = "Room \\"A\\""');
    expect(script).toContain('const notes = "Bring\\nnotes"');
    expect(script).toContain('const calendarName = "Work \\"Team\\""');
    expect(script).toContain("const startDateTime = new Date(startDateInput)");
    expect(script).toContain("const endDateTime = new Date(endDateInput)");
  });
});
