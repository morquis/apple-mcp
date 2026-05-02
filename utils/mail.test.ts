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
      .mockResolvedValueOnce({
        messages: [
          {
            subject: "Invoice",
            sender: "billing@example.com",
            dateSent: "2026-04-20T10:00:00.000Z",
            isRead: true,
            mailbox: "Archive/Invoices",
            messageLink: "[Invoice](message:%3Cinvoice-1%40example.com%3E)",
            messageReference: {
              mailObjectId: "12345",
              messageId: "invoice-1@example.com",
              accountId: "account-1",
              accountName: "Work",
              mailboxPath: "Archive/Invoices",
              dateSent: "2026-04-20T10:00:00.000Z",
              dateReceived: "2026-04-20T10:01:00.000Z",
              sender: "billing@example.com",
              subject: "Invoice",
              messageSize: 4096,
            },
            attachmentCount: 1,
            attachmentNames: ["invoice.pdf"],
          },
        ],
        pageInfo: {
          hasMore: true,
          nextCursor: {
            dateSent: "2026-04-20T10:00:00.000Z",
            mailObjectId: "12345",
          },
          scannedCount: 3,
          returnedCount: 1,
          sort: "dateSentAsc",
          limit: 1,
          windowStart: null,
          windowEnd: null,
          truncated: true,
          searchTerm: null,
          searchFields: ["subject", "sender"],
        },
      } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.listMessageMetadata("Work", "Archive/Invoices", {
      limit: 1,
      includeAttachmentNames: true,
      sort: "dateSentAsc",
      cursor: {
        dateSent: "2026-04-19T10:00:00.000Z",
        mailObjectId: "11111",
      },
    });

    expect(result).toEqual({
      messages: [
        {
          subject: "Invoice",
          sender: "billing@example.com",
          dateSent: "2026-04-20T10:00:00.000Z",
          isRead: true,
          mailbox: "Archive/Invoices",
          messageLink: "[Invoice](message:%3Cinvoice-1%40example.com%3E)",
          messageReference: {
            mailObjectId: "12345",
            messageId: "invoice-1@example.com",
            accountId: "account-1",
            accountName: "Work",
            mailboxPath: "Archive/Invoices",
            dateSent: "2026-04-20T10:00:00.000Z",
            dateReceived: "2026-04-20T10:01:00.000Z",
            sender: "billing@example.com",
            subject: "Invoice",
            messageSize: 4096,
          },
          attachmentCount: 1,
          attachmentNames: ["invoice.pdf"],
        },
      ],
      pageInfo: {
        hasMore: true,
        nextCursor: {
          dateSent: "2026-04-20T10:00:00.000Z",
          mailObjectId: "12345",
        },
        scannedCount: 3,
        returnedCount: 1,
        sort: "dateSentAsc",
        limit: 1,
        windowStart: null,
        windowEnd: null,
        truncated: true,
        searchTerm: null,
        searchFields: ["subject", "sender"],
      },
    });

    const script = String(executeJXASpy.mock.calls[2]?.[0]);
    expect(script).toContain('const mailboxName = "Archive/Invoices"');
    expect(script).toContain("const limit = 1");
    expect(script).toContain('const sort = "dateSentAsc"');
    expect(script).toContain('"mailObjectId":"11111"');
    expect(script).toContain("messages = messages.sort(compareMessages)");
    expect(script).toContain("const hasMore = messages.length > limit");
    expect(script).toContain("const includeAttachmentNames = true");
    expect(script).toContain("buildMessageMetadata(message, accountMatches[0], resolvedMailboxName, includeAttachmentNames)");
    expect(script).toContain("message.messageId()");
    expect(script).toContain("message.id()");
    expect(script).toContain("message.messageSize()");
    expect(script).not.toContain("buildMessage(message, resolvedMailboxName");
  });

  it("searchMessageMetadata searches scoped metadata fields with a date window", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({
        messages: [],
        pageInfo: {
          hasMore: false,
          scannedCount: 0,
          returnedCount: 0,
          sort: "dateSentDesc",
          limit: 25,
          windowStart: "2026-01-01T00:00:00.000Z",
          windowEnd: "2026-02-01T00:00:00.000Z",
          truncated: false,
          searchTerm: "invoice",
          searchFields: ["subject", "attachmentNames"],
        },
      } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.searchMessageMetadata("Work", "Archive/Invoices", "invoice", {
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-02-01T00:00:00.000Z",
      searchFields: ["subject", "attachmentNames"],
    });

    expect(result.pageInfo.searchTerm).toBe("invoice");
    expect(result.pageInfo.searchFields).toEqual(["subject", "attachmentNames"]);

    const script = String(executeJXASpy.mock.calls[2]?.[0]);
    expect(script).toContain('const searchTerm = "invoice"');
    expect(script).toContain('const searchFields = ["subject","attachmentNames"]');
    expect(script).toContain("messageMatchesSearch");
    expect(script).toContain("message.mailAttachments()");
    expect(script).toContain("messages = messages.filter(messageMatchesSearch)");
    expect(script).not.toContain("buildMessage(message, resolvedMailboxName");
  });

  it("searchMessageMetadata requires an explicit date window", async () => {
    const mailModule = await importMail();

    await expect(mailModule.searchMessageMetadata("Work", "Archive/Invoices", "invoice")).rejects.toThrow(
      "startDate and endDate are required for metadata search",
    );
  });

  it("setMessageFlag sets a scoped Mail flag by object id", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({
        previous: {
          mailObjectId: "100001",
          accountName: "Work",
          mailboxPath: "Archive/Facility",
          subject: "Invoice",
          sender: "sender@example.com",
          dateSent: "2026-04-20T10:00:00.000Z",
          flaggedStatus: false,
          flagIndex: -1,
          flagColor: "none",
        },
        current: {
          mailObjectId: "100001",
          accountName: "Work",
          mailboxPath: "Archive/Facility",
          subject: "Invoice",
          sender: "sender@example.com",
          dateSent: "2026-04-20T10:00:00.000Z",
          flaggedStatus: true,
          flagIndex: 1,
          flagColor: "orange",
        },
      } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.setMessageFlag("Work", "Archive/Facility", "100001", "orange");

    expect(result.current.flagColor).toBe("orange");
    expect(result.current.flagIndex).toBe(1);

    const script = String(executeJXASpy.mock.calls[2]?.[0]);
    expect(script).toContain('const accountName = "Work"');
    expect(script).toContain('const mailboxName = "Archive/Facility"');
    expect(script).toContain('const mailObjectId = "100001"');
    expect(script).toContain("const flagIndex = 1");
    expect(script).toContain("findMessageByObjectId(targetMailbox, mailObjectId)");
    expect(script).toContain("message.flagIndex = flagIndex");
    expect(script).toContain("message.flaggedStatus = true");
    expect(script).not.toContain("Mail.messages()");
  });

  it("setMessageFlag rejects unsupported colors", async () => {
    const mailModule = await importMail();

    await expect(
      mailModule.setMessageFlag("Work", "Archive/Invoices", "100001", "pink" as any),
    ).rejects.toThrow("Unsupported Mail flag color 'pink'");
  });

  it("exportMessageArtifacts exports message source and all downloaded attachments in a scoped mailbox", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({
        exportDirectory: "/tmp/mail-export/2026-05-02-100001-Invoice",
        dryRun: false,
        messageReference: {
          mailObjectId: "100001",
          messageId: "invoice-1@example.com",
          accountId: "account-1",
          accountName: "Work",
          mailboxPath: "Archive/Facility",
          dateSent: "2026-04-20T10:00:00.000Z",
          sender: "sender@example.com",
          subject: "Invoice",
        },
        messageFile: {
          type: "message",
          name: "Invoice.eml",
          path: "/tmp/mail-export/2026-05-02-100001-Invoice/Invoice.eml",
          skipped: false,
        },
        attachments: [
          {
            type: "attachment",
            name: "invoice.pdf",
            path: "/tmp/mail-export/2026-05-02-100001-Invoice/invoice.pdf",
            mimeType: "application/pdf",
            fileSize: 1024,
            downloaded: true,
            skipped: false,
          },
          {
            type: "attachment",
            name: "image001.png",
            path: "/tmp/mail-export/2026-05-02-100001-Invoice/image001.png",
            mimeType: "image/png",
            fileSize: 20000,
            downloaded: true,
            skipped: false,
          },
        ],
        skippedAttachments: [],
      } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mailModule = await importMail();
    const result = await mailModule.exportMessageArtifacts("Work", "Archive/Facility", "100001", {
      exportDirectory: "/tmp/mail-export",
    });

    expect(result.attachments).toHaveLength(2);
    expect(result.skippedAttachments).toHaveLength(0);

    const script = String(executeJXASpy.mock.calls[2]?.[0]);
    expect(script).toContain('const accountName = "Work"');
    expect(script).toContain('const mailboxName = "Archive/Facility"');
    expect(script).toContain('const mailObjectId = "100001"');
    expect(script).toContain('const baseExportDirectory = "/tmp/mail-export"');
    expect(script).toContain('const attachmentMode = "all"');
    expect(script).toContain("const skipInlineImages = false");
    expect(script).toContain("message.source()");
    expect(script).toContain("Mail.save(attachment, { in: Path(attachmentPath) })");
    expect(script).toContain("classifyAttachmentForExport");
    expect(script).not.toContain("Mail.messages()");
  });

  it("exportMessageArtifacts rejects unsupported attachment modes", async () => {
    const mailModule = await importMail();

    await expect(
      mailModule.exportMessageArtifacts("Work", "Archive/Invoices", "100001", {
        attachmentMode: "imagesOnly" as any,
      }),
    ).rejects.toThrow("Unsupported attachment export mode 'imagesOnly'");
  });
});
