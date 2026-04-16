import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.ts";

describe("reminders", () => {
  afterEach(() => {
    mock.restore();
  });

  it("getAllLists returns reminder lists", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue([{ name: "Inbox", id: "list-1" }] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const reminders = (await import("./reminders.ts")).default;
    const result = await reminders.getAllLists();

    expect(result).toEqual([{ name: "Inbox", id: "list-1" }]);
    expect(executeJXASpy).toHaveBeenCalledTimes(1);
  });

  it("getRemindersFromListById escapes the list id and props", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue([{ name: "Task", dueDate: null }] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const reminders = (await import("./reminders.ts")).default;
    const result = await reminders.getRemindersFromListById('list"1', ['name', 'due"Date']);

    expect(result).toEqual([{ name: "Task", dueDate: null }]);
    expect(String(executeJXASpy.mock.calls[0]?.[0])).toContain('list\\"1');
    expect(String(executeJXASpy.mock.calls[0]?.[0])).toContain('due\\"Date');
  });

  it("getAllReminders filters by an escaped list name", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue([
      {
        name: "Pay rent",
        id: "reminder-1",
        body: "",
        completed: false,
        dueDate: null,
        listName: 'Home"Tasks',
      },
    ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const reminders = (await import("./reminders.ts")).default;
    const result = await reminders.getAllReminders('Home"Tasks');

    expect(result).toEqual([
      {
        name: "Pay rent",
        id: "reminder-1",
        body: "",
        completed: false,
        dueDate: null,
        listName: 'Home"Tasks',
      },
    ]);
    expect(String(executeJXASpy.mock.calls[0]?.[0])).toContain('Home\\"Tasks');
  });

  it("searchReminders escapes the search text before executing JXA", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue([
      {
        name: 'Plan "trip"',
        id: "reminder-2",
        body: "Book hotel",
        completed: false,
        dueDate: null,
        listName: "Travel",
      },
    ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const reminders = (await import("./reminders.ts")).default;
    const result = await reminders.searchReminders('Plan "trip"\nsoon');

    expect(result).toEqual([
      {
        name: 'Plan "trip"',
        id: "reminder-2",
        body: "Book hotel",
        completed: false,
        dueDate: null,
        listName: "Travel",
      },
    ]);
    expect(String(executeJXASpy.mock.calls[0]?.[0])).toContain('Plan \\"trip\\"\\nsoon');
  });

  it("createReminder escapes user inputs and returns the created reminder", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue({
      name: 'Review "PR"',
      id: "reminder-3",
      body: "Check diff",
      completed: false,
      dueDate: "2026-04-15T08:00:00.000Z",
      listName: 'Work"Queue',
    } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const reminders = (await import("./reminders.ts")).default;
    const result = await reminders.createReminder(
      'Review "PR"',
      'Work"Queue',
      'Check\ndiff',
      "2026-04-15T08:00:00.000Z",
    );

    expect(result).toEqual({
      name: 'Review "PR"',
      id: "reminder-3",
      body: "Check diff",
      completed: false,
      dueDate: "2026-04-15T08:00:00.000Z",
      listName: 'Work"Queue',
    });
    const script = String(executeJXASpy.mock.calls[0]?.[0]);
    expect(script).toContain('Review \\"PR\\"');
    expect(script).toContain('Work\\"Queue');
    expect(script).toContain('Check\\ndiff');
    expect(script).toContain("2026-04-15T08:00:00.000Z");
  });

  it("openReminder searches first and then activates Reminders", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce([
        {
          name: "Buy milk",
          id: "reminder-4",
          body: "",
          completed: false,
          dueDate: null,
          listName: "Groceries",
        },
      ] as never)
      .mockResolvedValueOnce(true as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const reminders = (await import("./reminders.ts")).default;
    const result = await reminders.openReminder("Buy milk");

    expect(result).toEqual({
      success: true,
      message: "Reminders app opened",
      reminder: {
        name: "Buy milk",
        id: "reminder-4",
        body: "",
        completed: false,
        dueDate: null,
        listName: "Groceries",
      },
    });
    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain('const reminderId = "reminder-4"');
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain("Reminders.activate()");
  });
});
