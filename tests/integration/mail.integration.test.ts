import { afterEach, expect, it } from "bun:test";

import mail from "../../utils/mail.js";
import { CleanupTracker } from "./helpers/cleanup-tracker.js";
import {
  integrationDescribe,
  INTEGRATION_TIMEOUT,
  INTEGRATION_TIMEOUT_LONG,
  uniqueName,
} from "./helpers/test-config.js";

const cleanup = new CleanupTracker();
let firstAccount: string | null = null;

integrationDescribe("mail integration", () => {
  afterEach(async () => {
    await cleanup.runAll();
  });

  it("getAccounts returns an array of account names", async () => {
    const accounts = await mail.getAccounts();
    expect(Array.isArray(accounts)).toBe(true);
    if (accounts.length > 0) {
      firstAccount = accounts[0];
      expect(typeof accounts[0]).toBe("string");
    }
  }, INTEGRATION_TIMEOUT);

  it("getMailboxes returns an array", async () => {
    const mailboxes = await mail.getMailboxes();
    expect(Array.isArray(mailboxes)).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it("getAccountSummaries returns account summary data", async () => {
    const summaries = await mail.getAccountSummaries();
    expect(Array.isArray(summaries)).toBe(true);
    if (summaries.length > 0) {
      expect(typeof summaries[0].name).toBe("string");
      expect(typeof summaries[0].enabled).toBe("boolean");
    }
  }, INTEGRATION_TIMEOUT);

  it("getUnreadMails returns an array", async () => {
    const mails = await mail.getUnreadMails(5);
    expect(Array.isArray(mails)).toBe(true);
    if (mails.length > 0) {
      expect(typeof mails[0].subject).toBe("string");
      expect(typeof mails[0].sender).toBe("string");
    }
  }, INTEGRATION_TIMEOUT_LONG);

  it("searchMails returns an array for a broad term", async () => {
    const results = await mail.searchMails("the", 3);
    expect(Array.isArray(results)).toBe(true);
  }, INTEGRATION_TIMEOUT_LONG);

  it("getMailboxesForAccount returns mailboxes for the first account", async () => {
    if (!firstAccount) {
      const accounts = await mail.getAccounts();
      if (accounts.length === 0) return; // skip if no accounts
      firstAccount = accounts[0];
    }

    const mailboxes = await mail.getMailboxesForAccount(firstAccount);
    expect(Array.isArray(mailboxes)).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it("getAccountDetails returns details for the first account", async () => {
    if (!firstAccount) {
      const accounts = await mail.getAccounts();
      if (accounts.length === 0) return;
      firstAccount = accounts[0];
    }

    const details = await mail.getAccountDetails(firstAccount);
    expect(details).toBeDefined();
    expect(details!.name).toBe(firstAccount);
  }, INTEGRATION_TIMEOUT);

  it("getAccountMailboxTree returns a nested structure", async () => {
    if (!firstAccount) {
      const accounts = await mail.getAccounts();
      if (accounts.length === 0) return;
      firstAccount = accounts[0];
    }

    const tree = await mail.getAccountMailboxTree(firstAccount);
    expect(Array.isArray(tree)).toBe(true);
    if (tree.length > 0) {
      expect(typeof tree[0].name).toBe("string");
      expect(Array.isArray(tree[0].children)).toBe(true);
    }
  }, INTEGRATION_TIMEOUT);

  it("createMailbox reports unsupported", async () => {
    await expect(
      mail.createMailbox(firstAccount ?? "Work", null, uniqueName("mailbox")),
    ).rejects.toThrow("structural mailbox operations are not supported via Apple Mail Automation");
  }, INTEGRATION_TIMEOUT);
});
