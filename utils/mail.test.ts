import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.js";

let importCounter = 0;

async function importMail() {
  importCounter += 1;
  return await import(`./mail.js?test=${importCounter}`);
}

describe("mail", () => {
  afterEach(() => {
    mock.restore();
  });

  it("checkMailAccess returns true when the bridge resolves true", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.checkMailAccess();

    expect(result).toBe(true);
    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(2);
    expect(String(executeJXASpy.mock.calls[0]?.[0])).toContain('Application("System Events")');
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain('Application("Mail")');
  });

  it("getUnreadMails returns email messages and normalizes the limit", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce([
        {
          subject: 'Unread "Mail"',
          sender: "sender@example.com",
          dateSent: "2026-04-14T09:00:00.000Z",
          content: "Preview",
          isRead: false,
          mailbox: "Inbox",
          headers: "Message-ID: <mail-1@example.com>\nX-Test: ignored",
        },
      ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.getUnreadMails(2.9, true, ["Message-ID"]);

    expect(result).toEqual([
      {
        subject: 'Unread "Mail"',
        sender: "sender@example.com",
        dateSent: "2026-04-14T09:00:00.000Z",
        content: "Preview",
        isRead: false,
        mailbox: "Inbox",
        headers: "Message-ID: <mail-1@example.com>",
        messageLink: "[Unread \"Mail\"](message:%3Cmail-1%40example.com%3E)",
      },
    ]);

    expect(executeJXASpy).toHaveBeenCalledTimes(3);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(3);

    const script = String(executeJXASpy.mock.calls[2]?.[0]);
    expect(script).toContain("const limit = 2");
    expect(script).toContain("const includeHeaders = true");
    expect(script).toContain("return JSON.stringify(results)");
  });

  it("searchMails escapes the search term and returns results", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce([
        {
          subject: "Match",
          sender: "sender@example.com",
          dateSent: "2026-04-14T10:00:00.000Z",
          content: "Result preview",
          isRead: true,
          mailbox: "Archive",
          headers: "Message-ID: <match@example.com>\nX-Spam-Score: 0.0",
        },
      ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.searchMails('subject "one"\nline\\tab', 4, true, ["Message-ID"]);

    expect(result).toEqual([
      {
        subject: "Match",
        sender: "sender@example.com",
        dateSent: "2026-04-14T10:00:00.000Z",
        content: "Result preview",
        isRead: true,
        mailbox: "Archive",
        headers: "Message-ID: <match@example.com>",
        messageLink: "[Match](message:%3Cmatch%40example.com%3E)",
      },
    ]);

    const script = String(executeJXASpy.mock.calls[2]?.[0]);
    expect(script).toContain('const searchTerm = "subject \\"one\\"\\nline\\\\tab"');
    expect(script).toContain("const limit = 4");
    expect(script).toContain("const includeHeaders = true");
  });

  it("sendMail escapes all string arguments", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.sendMail(
      'to+"quoted"@example.com',
      'Subject "One"',
      'Body line 1\nBody line 2\\end',
      'cc+"quoted"@example.com',
      'bcc+"quoted"@example.com',
    );

    expect(result).toBe('Email sent to to+"quoted"@example.com with subject "Subject "One""');

    const script = String(executeJXASpy.mock.calls[2]?.[0]);
    expect(script).toContain('const toAddress = "to+\\"quoted\\"@example.com"');
    expect(script).toContain('const subject = "Subject \\"One\\""');
    expect(script).toContain('const body = "Body line 1\\nBody line 2\\\\end"');
    expect(script).toContain('const ccAddress = "cc+\\"quoted\\"@example.com"');
    expect(script).toContain('const bccAddress = "bcc+\\"quoted\\"@example.com"');
    expect(script).toContain("message.send()");
  });

  it("getAccounts returns account names", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(["Personal", "Work"] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.getAccounts();

    expect(result).toEqual(["Personal", "Work"]);
    expect(String(executeJXASpy.mock.calls[2]?.[0])).toContain("Mail.accounts()");
  });

  it("getMailboxes returns mailbox names", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(["Inbox", "Archive"] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.getMailboxes();

    expect(result).toEqual(["Inbox", "Archive"]);
    expect(String(executeJXASpy.mock.calls[2]?.[0])).toContain("Mail.mailboxes()");
  });

  it("getAccountMailboxTree returns structured path metadata", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    const tree = [
      {
        name: "Archive",
        id: "mailbox-1",
        path: "Archive",
        parentPath: null,
        unreadCount: 0,
        totalCount: 0,
        directUnreadCount: 0,
        directMessageCount: 0,
        directChildCount: 1,
        children: [
          {
            name: "Invoices",
            id: "mailbox-2",
            path: "Archive/Invoices",
            parentPath: "Archive",
            unreadCount: 0,
            totalCount: 60,
            directUnreadCount: 0,
            directMessageCount: 60,
            directChildCount: 0,
            children: [],
          },
        ],
      },
    ];

    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(tree as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.getAccountMailboxTree("Work");

    expect(result).toEqual(tree);
    const script = String(executeJXASpy.mock.calls[2]?.[0]);
    expect(script).toContain("buildMailboxTree(mailboxes, accountName)");
    expect(script).toContain("currentMailbox.container()");
    expect(script).toContain('const accountName = "Work"');
  });

  it("listMessageMetadata uses mailbox paths and omits message content", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce([
        {
          subject: "Invoice",
          sender: "billing@example.com",
          dateSent: "2026-04-20T10:00:00.000Z",
          isRead: true,
          mailbox: "Archive/Invoices",
          attachmentCount: 1,
          attachmentNames: ["invoice.pdf"],
        },
      ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.listMessageMetadata("Work", "Archive/Invoices", {
      limit: 10,
      includeAttachmentNames: true,
    });

    expect(result).toEqual([
      {
        subject: "Invoice",
        sender: "billing@example.com",
        dateSent: "2026-04-20T10:00:00.000Z",
        isRead: true,
        mailbox: "Archive/Invoices",
        attachmentCount: 1,
        attachmentNames: ["invoice.pdf"],
      },
    ]);

    const script = String(executeJXASpy.mock.calls[2]?.[0]);
    expect(script).toContain('const mailboxName = "Archive/Invoices"');
    expect(script).toContain("const limit = 10");
    expect(script).toContain("const includeAttachmentNames = true");
    expect(script).toContain("buildMessageMetadata(message, resolvedMailboxName, includeAttachmentNames)");
    expect(script).not.toContain("buildMessage(message, resolvedMailboxName");
  });
});
