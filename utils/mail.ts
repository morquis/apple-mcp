import { run } from "@jxa/run";
import { runAppleScript } from "run-applescript";

async function checkMailAccess(): Promise<boolean> {
  try {
  // First check if Mail is running
  const isRunning = await runAppleScript(`
tell application "System Events"
  return application process "Mail" exists
end tell`);

  if (isRunning !== "true") {
  console.error("Mail app is not running, attempting to launch...");
  try {
  await runAppleScript(`
tell application "Mail" to activate
delay 2`);
  } catch (activateError) {
  console.error("Error activating Mail app:", activateError);
  throw new Error(
  "Could not activate Mail app. Please start it manually.",
  );
  }
  }

  // Try to get the count of mailboxes as a simple test
  try {
  await runAppleScript(`
tell application "Mail"
  count every mailbox
end tell`);
  return true;
  } catch (mailboxError) {
  console.error("Error accessing mailboxes:", mailboxError);

  // Try an alternative check
  try {
  const mailVersion = await runAppleScript(`
tell application "Mail"
  return its version
end tell`);
  console.error("Mail version:", mailVersion);
  return true;
  } catch (versionError) {
  console.error("Error getting Mail version:", versionError);
  throw new Error(
  "Mail app is running but cannot access mailboxes. Please check permissions and configuration.",
  );
  }
  }
  } catch (error) {
  console.error("Mail access check failed:", error);
  throw new Error(
  `Cannot access Mail app. Please make sure Mail is running and properly configured. Error: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

interface MailAttachment {
  name: string;
  mimeType: string;
  fileSize: number;
  downloaded: boolean;
  id: string;
}

interface EmailMessage {
  subject: string;
  sender: string;
  dateSent: string;
  content: string;
  isRead: boolean;
  mailbox: string;
  attachments?: MailAttachment[];
  headers?: string;
}

interface MailAccount {
  name: string;
  id: string;
  type: string;
  addresses: string[];
  enabled: boolean;
}

interface MailboxInfo {
  name: string;
  id: string;
  unreadCount: number;
  totalCount: number;
  children: MailboxInfo[];
}

interface MailAccountDetails extends MailAccount {
  server: string;
  port: number;
  usesSSL: boolean;
  authentication: string;
  fullName: string;
  accountDirectory: string;
  deliveryAccount: string;
}

async function getUnreadMails(limit = 10): Promise<EmailMessage[]> {
  try {
  if (!(await checkMailAccess())) {
  return [];
  }

  // First, try with AppleScript which might be more reliable for this case
  try {
  const script = `
tell application "Mail"
  set allMailboxes to every mailbox
  set resultList to {}

  repeat with m in allMailboxes
  try
  set unreadMessages to (messages of m whose read status is false)
  if (count of unreadMessages) > 0 then
  set msgLimit to ${limit}
  if (count of unreadMessages) < msgLimit then
  set msgLimit to (count of unreadMessages)
  end if

  repeat with i from 1 to msgLimit
  try
  set currentMsg to item i of unreadMessages
  set msgData to {subject:(subject of currentMsg), sender:(sender of currentMsg), ¬
  date:(date sent of currentMsg) as string, mailbox:(name of m)}

  try
  set msgContent to content of currentMsg
  if length of msgContent > 500 then
  set msgContent to (text 1 thru 500 of msgContent) & "..."
  end if
  set msgData to msgData & {content:msgContent}
  on error
  set msgData to msgData & {content:"[Content not available]"}
  end try

  set end of resultList to msgData
  end try
  end repeat

  if (count of resultList) ≥ ${limit} then exit repeat
  end if
  end try
  end repeat

  return resultList
end tell`;

  const asResult = await runAppleScript(script);

  // If we got results, parse them
  if (asResult && asResult.toString().trim().length > 0) {
  try {
  // Try to parse as JSON if the result looks like JSON
  if (asResult.startsWith("{") || asResult.startsWith("[")) {
  const parsedResults = JSON.parse(asResult);
  if (Array.isArray(parsedResults) && parsedResults.length > 0) {
  return parsedResults.map((msg) => ({
  subject: msg.subject || "No subject",
  sender: msg.sender || "Unknown sender",
  dateSent: msg.date || new Date().toString(),
  content: msg.content || "[Content not available]",
  isRead: false, // These are all unread by definition
  mailbox: msg.mailbox || "Unknown mailbox",
  }));
  }
  }

  // If it's not in JSON format, try to parse the plist/record format
  const parsedEmails: EmailMessage[] = [];

  // Very simple parsing for the record format that AppleScript might return
  // This is a best-effort attempt and might not be perfect
  const matches = asResult.match(/\{([^}]+)\}/g);
  if (matches && matches.length > 0) {
  for (const match of matches) {
  try {
  // Parse key-value pairs
  const props = match.substring(1, match.length - 1).split(",");
  const emailData: { [key: string]: string } = {};

  for (const prop of props) {
  const parts = prop.split(":");
  if (parts.length >= 2) {
  const key = parts[0].trim();
  const value = parts.slice(1).join(":").trim();
  emailData[key] = value;
  }
  }

  if (emailData.subject || emailData.sender) {
  parsedEmails.push({
  subject: emailData.subject || "No subject",
  sender: emailData.sender || "Unknown sender",
  dateSent: emailData.date || new Date().toString(),
  content: emailData.content || "[Content not available]",
  isRead: false,
  mailbox: emailData.mailbox || "Unknown mailbox",
  });
  }
  } catch (parseError) {
  console.error("Error parsing email match:", parseError);
  }
  }
  }

  if (parsedEmails.length > 0) {
  return parsedEmails;
  }
  } catch (parseError) {
  console.error("Error parsing AppleScript result:", parseError);
  // If parsing failed, continue to the JXA approach
  }
  }

  // If the raw result contains useful info but parsing failed
  if (
  asResult.includes("subject") &&
  asResult.includes("sender")
  ) {
  console.error("Returning raw AppleScript result for debugging");
  return [
  {
  subject: "Raw AppleScript Output",
  sender: "Mail System",
  dateSent: new Date().toString(),
  content: `Could not parse Mail data properly. Raw output: ${asResult}`,
  isRead: false,
  mailbox: "Debug",
  },
  ];
  }
  } catch (asError) {
  // Continue to JXA approach as fallback
  }

  console.error("Trying JXA approach for unread emails...");
  // Check Mail accounts as a different approach
  const accounts = await runAppleScript(`
tell application "Mail"
  set accts to {}
  repeat with a in accounts
  set end of accts to name of a
  end repeat
  return accts
end tell`);
  console.error("Available accounts:", accounts);

  // Try using direct AppleScript to check for unread messages across all accounts
  const unreadInfo = await runAppleScript(`
tell application "Mail"
  set unreadInfo to {}
  repeat with m in every mailbox
  try
  set unreadCount to count (messages of m whose read status is false)
  if unreadCount > 0 then
  set end of unreadInfo to {name of m, unreadCount}
  end if
  end try
  end repeat
  return unreadInfo
end tell`);
  console.error("Mailboxes with unread messages:", unreadInfo);

  // Fallback to JXA approach
  const unreadMails: EmailMessage[] = await run((limit: number) => {
  const Mail = Application("Mail");
  const results = [];

  try {
  const accounts = Mail.accounts();

  for (const account of accounts) {
  try {
  const accountName = account.name();
  try {
  const accountMailboxes = account.mailboxes();

  for (const mailbox of accountMailboxes) {
  try {
  const boxName = mailbox.name();

  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
  let unreadMessages;
  try {
  unreadMessages = mailbox.messages.whose({
  readStatus: false,
  })();

  const count = Math.min(
  unreadMessages.length,
  limit - results.length,
  );
  for (let i = 0; i < count; i++) {
  try {
  const msg = unreadMessages[i];
  results.push({
  subject: msg.subject(),
  sender: msg.sender(),
  dateSent: msg.dateSent().toString(),
  content: msg.content()
  ? msg.content().substring(0, 500)
  : "[No content]",
  isRead: false,
  mailbox: `${accountName} - ${boxName}`,
  });
  } catch (msgError) {}
  }
  } catch (unreadError) {}
  } catch (boxError) {}

  if (results.length >= limit) {
  break;
  }
  }
  } catch (mbError) {}

  if (results.length >= limit) {
  break;
  }
  } catch (accError) {}
  }
  } catch (error) {}

  return results;
  }, limit);

  return unreadMails;
  } catch (error) {
  console.error("Error in getUnreadMails:", error);
  throw new Error(
  `Error accessing mail: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function searchMails(
  searchTerm: string,
  limit = 10,
): Promise<EmailMessage[]> {
  try {
  if (!(await checkMailAccess())) {
  return [];
  }

  // Ensure Mail app is running
  await runAppleScript(`
if application "Mail" is not running then
  tell application "Mail" to activate
  delay 2
end if`);

  // First try the AppleScript approach which might be more reliable
  try {
  const script = `
tell application "Mail"
  set searchString to "${searchTerm.replace(/"/g, '\\"')}"
  set foundMsgs to {}
  set allBoxes to every mailbox

  repeat with currentBox in allBoxes
  try
  set boxMsgs to (messages of currentBox whose (subject contains searchString) or (content contains searchString))
  set foundMsgs to foundMsgs & boxMsgs
  if (count of foundMsgs) ≥ ${limit} then exit repeat
  end try
  end repeat

  set resultList to {}
  set msgCount to (count of foundMsgs)
  if msgCount > ${limit} then set msgCount to ${limit}

  repeat with i from 1 to msgCount
  try
  set currentMsg to item i of foundMsgs
  set msgInfo to {subject:subject of currentMsg, sender:sender of currentMsg, ¬
  date:(date sent of currentMsg) as string, isRead:read status of currentMsg, ¬
  boxName:name of (mailbox of currentMsg)}
  set end of resultList to msgInfo
  end try
  end repeat

  return resultList
end tell`;

  const asResult = await runAppleScript(script);

  // If we got results, parse them
  if (asResult && asResult.length > 0) {
  try {
  const parsedResults = JSON.parse(asResult);
  if (Array.isArray(parsedResults) && parsedResults.length > 0) {
  return parsedResults.map((msg) => ({
  subject: msg.subject || "No subject",
  sender: msg.sender || "Unknown sender",
  dateSent: msg.date || new Date().toString(),
  content: "[Content not available through AppleScript method]",
  isRead: msg.isRead || false,
  mailbox: msg.boxName || "Unknown mailbox",
  }));
  }
  } catch (parseError) {
  console.error("Error parsing AppleScript result:", parseError);
  // Continue to JXA approach if parsing fails
  }
  }
  } catch (asError) {
  // Continue to JXA approach
  }

  // JXA approach as fallback
  const searchResults: EmailMessage[] = await run(
  (searchTerm: string, limit: number) => {
  const Mail = Application("Mail");
  const results = [];

  try {
  const mailboxes = Mail.mailboxes();

  for (const mailbox of mailboxes) {
  try {
  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
  let messages;
  try {
  messages = mailbox.messages.whose({
  _or: [
  { subject: { _contains: searchTerm } },
  { content: { _contains: searchTerm } },
  ],
  })();

  const count = Math.min(messages.length, limit);

  for (let i = 0; i < count; i++) {
  try {
  const msg = messages[i];
  results.push({
  subject: msg.subject(),
  sender: msg.sender(),
  dateSent: msg.dateSent().toString(),
  content: msg.content()
  ? msg.content().substring(0, 500)
  : "[No content]", // Limit content length
  isRead: msg.readStatus(),
  mailbox: mailbox.name(),
  });
  } catch (msgError) {}
  }

  if (results.length >= limit) {
  break;
  }
  } catch (queryError) {
  }
  } catch (boxError) {}
  }
  } catch (mbError) {}

  return results.slice(0, limit);
  },
  searchTerm,
  limit,
  );

  return searchResults;
  } catch (error) {
  console.error("Error in searchMails:", error);
  throw new Error(
  `Error searching mail: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function sendMail(
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): Promise<string | undefined> {
  try {
  if (!(await checkMailAccess())) {
  throw new Error("Could not access Mail app");
  }

  // Ensure Mail app is running
  await runAppleScript(`
if application "Mail" is not running then
  tell application "Mail" to activate
  delay 2
end if`);

  // Escape special characters in strings for AppleScript
  const escapedTo = to.replace(/"/g, '\\"');
  const escapedSubject = subject.replace(/"/g, '\\"');
  const escapedBody = body.replace(/"/g, '\\"');
  const escapedCc = cc ? cc.replace(/"/g, '\\"') : "";
  const escapedBcc = bcc ? bcc.replace(/"/g, '\\"') : "";

  let script = `
tell application "Mail"
  set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}", visible:true}
  tell newMessage
  make new to recipient with properties {address:"${escapedTo}"}
`;

  if (cc) {
  script += `        make new cc recipient with properties {address:"${escapedCc}"}\n`;
  }

  if (bcc) {
  script += `        make new bcc recipient with properties {address:"${escapedBcc}"}\n`;
  }

  script += `    end tell
  send newMessage
  return "success"
end tell
`;

  try {
  const result = await runAppleScript(script);
  if (result === "success") {
  return `Email sent to ${to} with subject "${subject}"`;
  // biome-ignore lint/style/noUselessElse: <explanation>
  } else {
  }
  } catch (asError) {
  console.error("Error in AppleScript send:", asError);

  const jxaResult: string = await run(
  (to, subject, body, cc, bcc) => {
  try {
  const Mail = Application("Mail");

  const msg = Mail.OutgoingMessage().make();
  msg.subject = subject;
  msg.content = body;
  msg.visible = true;

  // Add recipients
  const toRecipient = Mail.ToRecipient().make();
  toRecipient.address = to;
  msg.toRecipients.push(toRecipient);

  if (cc) {
  const ccRecipient = Mail.CcRecipient().make();
  ccRecipient.address = cc;
  msg.ccRecipients.push(ccRecipient);
  }

  if (bcc) {
  const bccRecipient = Mail.BccRecipient().make();
  bccRecipient.address = bcc;
  msg.bccRecipients.push(bccRecipient);
  }

  msg.send();
  return "JXA send completed";
  } catch (error) {
  return `JXA error: ${error}`;
  }
  },
  to,
  subject,
  body,
  cc,
  bcc,
  );

  if (jxaResult.startsWith("JXA error:")) {
  throw new Error(jxaResult);
  }

  return `Email sent to ${to} with subject "${subject}"`;
  }
  } catch (error) {
  console.error("Error in sendMail:", error);
  throw new Error(
  `Error sending mail: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function getMailboxes(): Promise<string[]> {
  try {
  if (!(await checkMailAccess())) {
  return [];
  }

  // Ensure Mail app is running
  await runAppleScript(`
if application "Mail" is not running then
  tell application "Mail" to activate
  delay 2
end if`);

  const mailboxes: string[] = await run(() => {
  const Mail = Application("Mail");

  try {
  const mailboxes = Mail.mailboxes();

  if (!mailboxes || mailboxes.length === 0) {
  try {
  const result = Mail.execute({
  withObjectModel: "Mail Suite",
  withCommand: "get name of every mailbox",
  });

  if (result && result.length > 0) {
  return result;
  }
  } catch (execError) {}

  return [];
  }

  return mailboxes.map((box: unknown) => {
  try {
  return (box as { name: () => string }).name();
  } catch (nameError) {
  return "Unknown mailbox";
  }
  });
  } catch (error) {
  return [];
  }
  });

  return mailboxes;
  } catch (error) {
  console.error("Error in getMailboxes:", error);
  throw new Error(
  `Error getting mailboxes: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function getAccounts(): Promise<string[]> {
  try {
  if (!(await checkMailAccess())) {
  return [];
  }

  const accounts = await runAppleScript(`
tell application "Mail"
  set acctNames to {}
  repeat with a in accounts
  set end of acctNames to name of a
  end repeat
  return acctNames
end tell`);

  return accounts ? accounts.split(", ") : [];
  } catch (error) {
  console.error("Error getting accounts:", error);
  throw new Error(
  `Error getting mail accounts: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function getMailboxesForAccount(accountName: string): Promise<string[]> {
  try {
  if (!(await checkMailAccess())) {
  return [];
  }

  const mailboxes = await runAppleScript(`
tell application "Mail"
  set boxNames to {}
  try
  set targetAccount to first account whose name is "${accountName.replace(/"/g, '\\"')}"
  set acctMailboxes to every mailbox of targetAccount
  repeat with mb in acctMailboxes
  set end of boxNames to name of mb
  end repeat
  on error errMsg
  return "Error: " & errMsg
  end try
  return boxNames
end tell`);

  if (mailboxes?.startsWith("Error:")) {
  console.error(mailboxes);
  return [];
  }

  return mailboxes ? mailboxes.split(", ") : [];
  } catch (error) {
  console.error("Error getting mailboxes for account:", error);
  throw new Error(
  `Error getting mailboxes for account ${accountName}: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function getAccountSummaries(): Promise<MailAccount[]> {
  try {
  if (!(await checkMailAccess())) {
  return [];
  }

  const accounts = (await run(() => {
  const Mail = Application("Mail");
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  return Mail.accounts().map((acc: any) => {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  let id = "";
  try { id = String(acc.id()); } catch {}
  return {
  name: acc.name(),
  id,
  type: acc.accountType ? String(acc.accountType()) : "",
  addresses: acc.emailAddresses ? acc.emailAddresses() : [],
  enabled: acc.enabled ? acc.enabled() : false,
  } as MailAccount;
  });
  })) as MailAccount[];

  return accounts;
  } catch (error) {
  console.error("Error getting account summaries:", error);
  throw new Error(
  `Error getting account summaries: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function getAccountDetails(accountName: string): Promise<MailAccountDetails | undefined> {
  try {
  if (!(await checkMailAccess())) {
  return undefined;
  }

  const details = (await run((name: string) => {
  const Mail = Application("Mail");
  const matches = Mail.accounts.whose({ name })();
  if (!matches || matches.length === 0) return null;
  const acc = matches[0];
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  let id = "";
  try { id = String(acc.id()); } catch {}
  return {
  name: acc.name(),
  id,
  type: acc.accountType ? String(acc.accountType()) : "",
  addresses: acc.emailAddresses ? acc.emailAddresses() : [],
  enabled: acc.enabled ? acc.enabled() : false,
  server: acc.serverName ? acc.serverName() : "",
  port: acc.port ? acc.port() : 0,
  usesSSL: acc.usesSSL ? acc.usesSSL() : false,
  authentication: acc.authentication ? String(acc.authentication()) : "",
  fullName: acc.fullName ? acc.fullName() : "",
  accountDirectory: acc.accountDirectory ? acc.accountDirectory().toString() : "",
  deliveryAccount: acc.deliveryAccount ? acc.deliveryAccount().name() : "",
  } as MailAccountDetails;
  }, accountName)) as MailAccountDetails | null;

  if (!details) {
  throw new Error(`Account '${accountName}' not found`);
  }

  return details;
  } catch (error) {
  console.error("Error getting account details:", error);
  throw new Error(
  `Error getting account details: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function getMailboxProperties(
  accountName: string,
  mailboxName: string,
): Promise<MailboxInfo | undefined> {
  try {
  if (!(await checkMailAccess())) {
  return undefined;
  }

  const info = (await run((acct: string, mbx: string) => {
  const Mail = Application("Mail");
  const account = Mail.accounts.whose({ name: acct })();
  if (!account || account.length === 0) return null;
  const box = account[0].mailboxes.whose({ name: mbx })();
  if (!box || box.length === 0) return null;
  const target = box[0];

  let total = 0;
  try { total = target.messages().length; } catch {}
  let unread = 0;
  try { unread = target.unreadCount(); } catch {}
  let id = "";
  try { id = String(target.id()); } catch {}
  const children = [] as MailboxInfo[];
  try {
  const childBoxes = target.mailboxes();
  for (const child of childBoxes) {
  let cTotal = 0;
  let cUnread = 0;
  let cId = "";
  try { cTotal = child.messages().length; } catch {}
  try { cUnread = child.unreadCount(); } catch {}
  try { cId = String(child.id()); } catch {}
  children.push({
  name: child.name(),
  id: cId,
  unreadCount: cUnread,
  totalCount: cTotal,
  children: [],
  });
  }
  } catch {}

  return { name: target.name(), id, unreadCount: unread, totalCount: total, children } as MailboxInfo;
  }, accountName, mailboxName)) as MailboxInfo | null;

  return info ?? undefined;
  } catch (error) {
  console.error("Error getting mailbox properties:", error);
  throw new Error(
  `Error getting mailbox properties: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function getAccountMailboxTree(accountName: string): Promise<MailboxInfo[]> {
  try {
  if (!(await checkMailAccess())) {
  return [];
  }

  const tree = (await run((acct: string) => {
  const Mail = Application("Mail");
  const account = Mail.accounts.whose({ name: acct })();
  if (!account || account.length === 0) return null;

  function build(box: any): MailboxInfo {
  let total = 0;
  let unread = 0;
  let id = "";
  try { total = box.messages().length; } catch {}
  try { unread = box.unreadCount(); } catch {}
  try { id = String(box.id()); } catch {}
  const kids: MailboxInfo[] = [];
  try {
  const childBoxes = box.mailboxes();
  for (const child of childBoxes) {
  kids.push(build(child));
  }
  } catch {}
  return { name: box.name(), id, unreadCount: unread, totalCount: total, children: kids };
  }

  const mailboxes = account[0].mailboxes();
  return mailboxes.map((mb: any) => build(mb));
  }, accountName)) as MailboxInfo[] | null;

  if (!tree) {
  throw new Error(`Account '${accountName}' not found`);
  }

  return tree;
  } catch (error) {
  console.error("Error getting mailbox tree:", error);
  throw new Error(
  `Error getting mailbox tree: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function listMessages(
  accountName: string,
  mailboxName: string,
  opts?: {
    limit?: number;
    unreadOnly?: boolean;
    startDate?: string;
    endDate?: string;
    includeAttachments?: boolean;
    includeHeaders?: boolean;
  },
): Promise<EmailMessage[]> {
  try {
  if (!(await checkMailAccess())) {
  return [];
  }

  const messages = (await run(
  (acct: string, mbx: string, options: any) => {
  const Mail = Application("Mail");
  const acc = Mail.accounts.whose({ name: acct })();
  if (!acc || acc.length === 0) return [];
  const box = acc[0].mailboxes.whose({ name: mbx })();
  if (!box || box.length === 0) return [];

  let msgs = box[0].messages();
  if (options && options.unreadOnly) {
  msgs = box[0].messages.whose({ readStatus: false })();
  }
  if (options && options.startDate) {
  const d = new Date(options.startDate);
  msgs = msgs.whose({ dateSent: { _greaterThanEq: d } })();
  }
  if (options && options.endDate) {
  const d = new Date(options.endDate);
  msgs = msgs.whose({ dateSent: { _lessThanEq: d } })();
  }

  const limit = options && options.limit ? options.limit : msgs.length;
  const result: EmailMessage[] = [];
  const count = Math.min(msgs.length, limit);
  for (let i = 0; i < count; i++) {
    const m = msgs[i];
    const msg: EmailMessage = {
      subject: m.subject(),
      sender: m.sender(),
      dateSent: m.dateSent().toString(),
      content: m.content ? (m.content() as string).substring(0, 500) : "[No content]",
      isRead: m.readStatus(),
      mailbox: mbx,
    };

    if (options && options.includeAttachments) {
      try {
        const atts = m.mailAttachments();
        const attachments = [] as MailAttachment[];
        for (const a of atts) {
          attachments.push({
            name: a.name(),
            mimeType: a.mimeType ? String(a.mimeType()) : "",
            fileSize: a.fileSize ? a.fileSize() : 0,
            downloaded: a.downloaded ? a.downloaded() : false,
            id: a.id ? String(a.id()) : "",
          });
        }
        msg.attachments = attachments;
      } catch {}
    }

    if (options && options.includeHeaders) {
      try {
        msg.headers = m.allHeaders ? String(m.allHeaders()) : String(m.source());
      } catch {}
    }

    result.push(msg);
  }
  return result;
  },
  accountName,
  mailboxName,
  opts ?? {},
  )) as EmailMessage[];

  return messages;
  } catch (error) {
  console.error("Error listing messages:", error);
  throw new Error(
  `Error listing messages: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function createMailbox(
  accountName: string,
  parentMailbox: string | null,
  name: string,
): Promise<string> {
  try {
  if (!(await checkMailAccess())) {
  return "";
  }

  const acc = accountName.replace(/"/g, '\\"');
  const newName = name.replace(/"/g, '\\"');
  const parent = parentMailbox ? parentMailbox.replace(/"/g, '\\"') : null;
  const script = `
tell application "Mail"
  set theAccount to first account whose name is "${acc}"
  if theAccount is missing value then error "Account not found"
  ${parent ? `set parentBox to first mailbox of theAccount whose name is "${parent}"
  if parentBox is missing value then error "Parent mailbox not found"` : "set parentBox to theAccount"}
  make new mailbox with properties {name:"${newName}"} at parentBox
end tell`;
  await runAppleScript(script);
  return `Created mailbox '${name}'`;
  } catch (error) {
  console.error("Error creating mailbox:", error);
  throw new Error(
  `Error creating mailbox: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function deleteMailbox(accountName: string, mailboxName: string): Promise<string> {
  try {
  if (!(await checkMailAccess())) {
  return "";
  }

  const acc = accountName.replace(/"/g, '\\"');
  const box = mailboxName.replace(/"/g, '\\"');
  const script = `
tell application "Mail"
  set theAccount to first account whose name is "${acc}"
  if theAccount is missing value then error "Account not found"
  set targetBox to first mailbox of theAccount whose name is "${box}"
  if targetBox is missing value then error "Mailbox not found"
  delete targetBox
end tell`;
  await runAppleScript(script);
  return `Deleted mailbox '${mailboxName}'`;
  } catch (error) {
  console.error("Error deleting mailbox:", error);
  throw new Error(
  `Error deleting mailbox: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function renameMailbox(
  accountName: string,
  mailboxName: string,
  newName: string,
): Promise<string> {
  try {
  if (!(await checkMailAccess())) {
  return "";
  }

  const acc = accountName.replace(/"/g, '\\"');
  const box = mailboxName.replace(/"/g, '\\"');
  const newBoxName = newName.replace(/"/g, '\\"');
  const script = `
tell application "Mail"
  set theAccount to first account whose name is "${acc}"
  if theAccount is missing value then error "Account not found"
  set targetBox to first mailbox of theAccount whose name is "${box}"
  if targetBox is missing value then error "Mailbox not found"
  set name of targetBox to "${newBoxName}"
end tell`;
  await runAppleScript(script);
  return `Renamed mailbox '${mailboxName}' to '${newName}'`;
  } catch (error) {
  console.error("Error renaming mailbox:", error);
  throw new Error(
  `Error renaming mailbox: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

async function moveMailbox(
  accountName: string,
  mailboxName: string,
  targetParent: string,
): Promise<string> {
  try {
  if (!(await checkMailAccess())) {
  return "";
  }

  const acc = accountName.replace(/"/g, '\\"');
  const box = mailboxName.replace(/"/g, '\\"');
  const parent = targetParent.replace(/"/g, '\\"');
  const script = `
tell application "Mail"
  set theAccount to first account whose name is "${acc}"
  if theAccount is missing value then error "Account not found"
  set moveBox to first mailbox of theAccount whose name is "${box}"
  if moveBox is missing value then error "Mailbox not found"
  ${parent === "" ? "set destBox to theAccount" : `set destBox to first mailbox of theAccount whose name is "${parent}"
  if destBox is missing value then error "Target mailbox not found"`}
  move moveBox to destBox
end tell`;
  await runAppleScript(script);
  return `Moved mailbox '${mailboxName}' to '${targetParent}'`;
  } catch (error) {
  console.error("Error moving mailbox:", error);
  throw new Error(
  `Error moving mailbox: ${error instanceof Error ? error.message : String(error)}`,
  );
  }
}

export default {
  getUnreadMails,
  searchMails,
  sendMail,
  getMailboxes,
  getAccounts,
  getMailboxesForAccount,
  getAccountSummaries,
  getAccountDetails,
  getMailboxProperties,
  getAccountMailboxTree,
  listMessages,
  createMailbox,
  deleteMailbox,
  renameMailbox,
  moveMailbox,
};
