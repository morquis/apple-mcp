import {
  executeJXA,
  JXAAppNotRunningError,
  JXAConverters,
  JXAExecutionError,
  wrapJXAFunction,
} from "../core/jxa-bridge.js";

function escapeJXAString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

// Helper function to extract Message-ID from headers and create clickable link
function createMessageLink(headers: string | undefined, subject: string): string | undefined {
  if (!headers) return undefined;
  
  // Look for Message-ID in headers (case-insensitive, multiline)
  const messageIdMatch = headers.match(/Message-I[Dd]:\s*<([^>]+)>/mi);
  if (!messageIdMatch || !messageIdMatch[1]) return undefined;
  
  const messageId = messageIdMatch[1];
  // URL encode the Message-ID, keeping the angle brackets
  const encodedMessageId = encodeURIComponent(`<${messageId}>`);
  
  // Create markdown link in the format [Subject](message:%3CMessage-ID%3E)
  return `[${subject}](message:${encodedMessageId})`;
}

// Helper function to filter headers based on requested fields
function filterHeaders(allHeaders: string, requestedHeaders: string[]): string {
  if (!allHeaders || !requestedHeaders || requestedHeaders.length === 0) {
    return allHeaders;
  }
  
  // Create a case-insensitive lookup set
  const requestedLower = new Set(requestedHeaders.map(h => h.toLowerCase()));
  
  // Split headers into lines
  const lines = allHeaders.split('\n');
  const filteredLines: string[] = [];
  let currentHeader: string | null = null;
  let currentLines: string[] = [];
  
  for (const line of lines) {
    // Check if this is a new header (starts with non-whitespace)
    if (line && !line.startsWith(' ') && !line.startsWith('\t')) {
      // Process the previous header if any
      if (currentHeader && currentLines.length > 0) {
        const headerName = currentHeader.split(':')[0].trim().toLowerCase();
        if (requestedLower.has(headerName)) {
          filteredLines.push(...currentLines);
        }
      }
      
      // Start new header
      currentHeader = line;
      currentLines = [line];
    } else if (currentHeader) {
      // This is a continuation of the current header
      currentLines.push(line);
    }
  }
  
  // Don't forget the last header
  if (currentHeader && currentLines.length > 0) {
    const headerName = currentHeader.split(':')[0].trim().toLowerCase();
    if (requestedLower.has(headerName)) {
      filteredLines.push(...currentLines);
    }
  }
  
  return filteredLines.join('\n');
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
  flaggedStatus?: boolean;
  flagIndex?: number;
  flagColor?: MessageFlagColor;
  mailbox: string;
  attachments?: MailAttachment[];
  headers?: string;
  messageLink?: string;
}

interface MessageReference {
  mailObjectId: string;
  messageId?: string;
  accountId: string;
  accountName: string;
  mailboxPath: string;
  dateSent?: string;
  dateReceived?: string;
  sender: string;
  subject: string;
  messageSize?: number;
}

interface EmailMessageMetadata {
  subject: string;
  sender: string;
  dateSent: string;
  isRead: boolean;
  flaggedStatus?: boolean;
  flagIndex?: number;
  flagColor?: MessageFlagColor;
  mailbox: string;
  headers?: string;
  messageLink?: string;
  messageReference?: MessageReference;
  attachmentCount?: number;
  attachmentNames?: string[];
}

interface MessageMetadataCursor {
  dateSent: string;
  mailObjectId?: string;
}

type MessageMetadataSearchField = "subject" | "sender" | "attachmentNames";

type MessageFlagColor =
  | "none"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "gray";

interface MessageFlagState {
  mailObjectId: string;
  accountName: string;
  mailboxPath: string;
  subject: string;
  sender: string;
  dateSent: string;
  flaggedStatus: boolean;
  flagIndex: number;
  flagColor: MessageFlagColor;
}

interface MessageFlagUpdateResult {
  previous: MessageFlagState;
  current: MessageFlagState;
}

type AttachmentExportMode = "documentsOnly" | "all";

interface ExportedMessageArtifact {
  type: "message" | "attachment";
  name: string;
  path?: string;
  mimeType?: string;
  fileSize?: number;
  downloaded?: boolean;
  skipped: boolean;
  reason?: string;
}

interface MessageArtifactExportResult {
  exportDirectory: string;
  dryRun: boolean;
  messageReference: MessageReference;
  messageFile?: ExportedMessageArtifact;
  attachments: ExportedMessageArtifact[];
  skippedAttachments: ExportedMessageArtifact[];
}

interface MessageMoveResult {
  dryRun: boolean;
  moved: boolean;
  sourceMailbox: string;
  targetMailbox: string;
  messageReference: MessageReference;
}

const MESSAGE_FLAG_INDEX_BY_COLOR: Record<MessageFlagColor, number> = {
  none: -1,
  red: 0,
  orange: 1,
  yellow: 2,
  green: 3,
  blue: 4,
  purple: 5,
  gray: 6,
};

function normalizeMessageFlagColor(flagColor: string): MessageFlagColor {
  const normalized = flagColor.toLowerCase();

  if (normalized in MESSAGE_FLAG_INDEX_BY_COLOR) {
    return normalized as MessageFlagColor;
  }

  throw new Error(`Unsupported Mail flag color '${flagColor}'`);
}

function normalizeAttachmentExportMode(mode: string | undefined): AttachmentExportMode {
  if (mode === undefined || mode === "all") {
    return "all";
  }

  if (mode === "documentsOnly") {
    return "documentsOnly";
  }

  throw new Error(`Unsupported attachment export mode '${mode}'`);
}

interface MessageMetadataPageInfo {
  hasMore: boolean;
  nextCursor?: MessageMetadataCursor;
  scannedCount: number;
  returnedCount: number;
  sort: "dateSentAsc" | "dateSentDesc";
  limit: number;
  windowStart: string | null;
  windowEnd: string | null;
  truncated: boolean;
  searchTerm?: string | null;
  searchFields?: MessageMetadataSearchField[];
}

interface EmailMessageMetadataPage {
  messages: EmailMessageMetadata[];
  pageInfo: MessageMetadataPageInfo;
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
  path: string;
  parentPath: string | null;
  unreadCount: number;
  totalCount: number;
  directUnreadCount: number;
  directMessageCount: number;
  directChildCount: number;
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

const MAIL_JXA_HELPERS = `
ObjC.import("Foundation");

function toText(input, fallback = null) {
  return ${JXAConverters.toString("input", "fallback")};
}

function toISO(input, fallback = null) {
  return ${JXAConverters.toISOString("input", "fallback")};
}

function safeCall(fn, fallback) {
  try {
    const value = fn();
    return value === undefined ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function toBoolean(value, fallback = false) {
  return value === null || value === undefined ? fallback : Boolean(value);
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => toText(value, ""))
    .filter((value) => value.length > 0);
}

function flagColorFromIndex(flagIndex) {
  const index = Number(flagIndex);

  if (index === 0) return "red";
  if (index === 1) return "orange";
  if (index === 2) return "yellow";
  if (index === 3) return "green";
  if (index === 4) return "blue";
  if (index === 5) return "purple";
  if (index === 6) return "gray";

  return "none";
}

function sanitizeFileName(value, fallback = "untitled") {
  const sanitized = toText(value, fallback)
    .replace(/[\\\\/:*?"<>|,]/g, "-")
    .replace(/[\\r\\n\\t]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();

  if (sanitized.length === 0) {
    return fallback;
  }

  return sanitized.length > 140 ? sanitized.slice(0, 140).trim() : sanitized;
}

function pathJoin(directory, name) {
  return String(directory).replace(/\\/+$/, "") + "/" + String(name).replace(/^\\/+/, "");
}

function ensureDirectory(directory) {
  const fileManager = $.NSFileManager.defaultManager;
  const exists = Boolean(fileManager.fileExistsAtPath(directory));

  if (exists) {
    return true;
  }

  return Boolean(
    fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
      directory,
      true,
      undefined,
      null,
    ),
  );
}

function uniquePath(directory, fileName) {
  const fileManager = $.NSFileManager.defaultManager;
  const safeName = sanitizeFileName(fileName, "artifact");
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const extension = dotIndex > 0 ? safeName.slice(dotIndex) : "";
  let candidate = pathJoin(directory, safeName);
  let counter = 2;

  while (Boolean(fileManager.fileExistsAtPath(candidate))) {
    candidate = pathJoin(directory, baseName + " " + counter + extension);
    counter += 1;
  }

  return candidate;
}

function writeUtf8File(path, text) {
  const nsString = $.NSString.alloc.initWithUTF8String(String(text));
  return Boolean(nsString.writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null));
}

function extensionFromName(name) {
  const normalized = toText(name, "").toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");

  if (dotIndex < 0 || dotIndex === normalized.length - 1) {
    return "";
  }

  return normalized.slice(dotIndex + 1);
}

function classifyAttachmentForExport(name, mimeType, fileSize, attachmentMode, skipInlineImages) {
  const extension = extensionFromName(name);
  const mime = toText(mimeType, "").toLowerCase();
  const size = toNumber(fileSize, 0);
  const lowerName = toText(name, "").toLowerCase();
  const documentExtensions = [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "xlsm",
    "csv",
    "txt",
    "rtf",
    "rtfd",
    "xml",
    "zip",
    "7z",
    "eml",
    "msg",
    "ics",
    "pages",
    "numbers",
    "key",
    "odt",
    "ods",
  ];
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "heic", "webp", "tiff", "tif"];
  const isImage = mime.indexOf("image/") === 0 || imageExtensions.indexOf(extension) >= 0;
  const hasDocumentHint =
    /(invoice|receipt|contract)/i
      .test(lowerName);
  const looksLikeInlineImage =
    /^(image|logo|signature|signatur|cid|facebook|linkedin|instagram|twitter|xing|banner|icon)[-_ ]?\\d*/i
      .test(lowerName) || size <= 300000;

  if (skipInlineImages && isImage && looksLikeInlineImage && !hasDocumentHint) {
    return { shouldExport: false, reason: "inline-image" };
  }

  if (
    attachmentMode === "documentsOnly" &&
    documentExtensions.indexOf(extension) < 0 &&
    !(isImage && hasDocumentHint)
  ) {
    return { shouldExport: false, reason: "non-document-attachment" };
  }

  return { shouldExport: true, reason: null };
}

function getNestedMailboxes(mailboxes) {
  const result = [];
  const queue = Array.isArray(mailboxes) ? [...mailboxes] : [];

  while (queue.length > 0) {
    const mailbox = queue.shift();
    if (!mailbox) {
      continue;
    }

    result.push(mailbox);

    const children = safeCall(() => mailbox.mailboxes(), []);
    if (Array.isArray(children) && children.length > 0) {
      queue.push(...children);
    }
  }

  return result;
}

function findMailboxRecursive(mailboxes, targetName, accountName = "") {
  const allMailboxes = getNestedMailboxes(mailboxes);

  for (const mailbox of allMailboxes) {
    const mailboxName = toText(safeCall(() => mailbox.name(), null), null);
    if (mailboxName === targetName) {
      return mailbox;
    }

    if (targetName.indexOf("/") >= 0) {
      const mailboxPath = mailboxPathFromContainer(mailbox, mailboxName || targetName, accountName);
      if (mailboxPath === targetName) {
        return mailbox;
      }
    }
  }

  return null;
}

function getHeaders(message) {
  const allHeaders = safeCall(
    () => (typeof message.allHeaders === "function" ? message.allHeaders() : null),
    null,
  );
  if (allHeaders !== null && allHeaders !== undefined && allHeaders !== "") {
    return toText(allHeaders, null);
  }

  const source = safeCall(
    () => (typeof message.source === "function" ? message.source() : null),
    null,
  );
  if (source !== null && source !== undefined && source !== "") {
    return toText(source, null);
  }

  return null;
}

function getContentPreview(message) {
  const contentValue = safeCall(
    () => (typeof message.content === "function" ? message.content() : null),
    null,
  );
  const content = toText(contentValue, null);

  if (content === null || content.length === 0) {
    return "[No content]";
  }

  return content.length > 500 ? content.slice(0, 500) + "..." : content;
}

function buildAttachment(attachment) {
  return {
    name: toText(safeCall(() => attachment.name(), null), ""),
    mimeType: toText(
      safeCall(() => (typeof attachment.mimeType === "function" ? attachment.mimeType() : null), null),
      "",
    ),
    fileSize: toNumber(
      safeCall(() => (typeof attachment.fileSize === "function" ? attachment.fileSize() : 0), 0),
      0,
    ),
    downloaded: toBoolean(
      safeCall(() => (typeof attachment.downloaded === "function" ? attachment.downloaded() : false), false),
      false,
    ),
    id: toText(
      safeCall(() => (typeof attachment.id === "function" ? attachment.id() : null), null),
      "",
    ),
  };
}

function buildMessageFlagState(message, account, mailboxPath) {
  const flagIndex = toNumber(
    safeCall(() => (typeof message.flagIndex === "function" ? message.flagIndex() : -1), -1),
    -1,
  );
  const flaggedStatus = toBoolean(
    safeCall(() => (typeof message.flaggedStatus === "function" ? message.flaggedStatus() : flagIndex >= 0), flagIndex >= 0),
    flagIndex >= 0,
  );

  return {
    mailObjectId: toText(safeCall(() => message.id(), null), ""),
    accountName: toText(safeCall(() => account.name(), null), ""),
    mailboxPath,
    subject: toText(safeCall(() => message.subject(), null), "No subject"),
    sender: toText(safeCall(() => message.sender(), null), "Unknown sender"),
    dateSent: toISO(safeCall(() => message.dateSent(), null), "new Date().toISOString()"),
    flaggedStatus,
    flagIndex,
    flagColor: flaggedStatus ? flagColorFromIndex(flagIndex) : "none",
  };
}

function normalizeMessageId(messageId) {
  const text = toText(messageId, "").trim();

  if (text.length === 0) {
    return "";
  }

  return text.replace(/^<+/, "").replace(/>+$/, "");
}

function createMessageLinkFromMessageId(messageId, subject) {
  const normalizedMessageId = normalizeMessageId(messageId);

  if (normalizedMessageId.length === 0) {
    return null;
  }

  return "[" + subject + "](message:" + encodeURIComponent("<" + normalizedMessageId + ">") + ")";
}

function buildMessageReference(message, account, mailboxPath, subject, sender, dateSent) {
  const messageId = normalizeMessageId(
    safeCall(() => (typeof message.messageId === "function" ? message.messageId() : null), null),
  );
  const dateReceived = toISO(
    safeCall(() => (typeof message.dateReceived === "function" ? message.dateReceived() : null), null),
    null,
  );
  const messageSizeValue = safeCall(
    () => (typeof message.messageSize === "function" ? message.messageSize() : null),
    null,
  );
  const messageSize = messageSizeValue === null ? null : toNumber(messageSizeValue, null);

  const reference = {
    mailObjectId: toText(safeCall(() => message.id(), null), ""),
    accountId: toText(safeCall(() => account.id(), null), ""),
    accountName: toText(safeCall(() => account.name(), null), ""),
    mailboxPath,
    dateSent,
    sender,
    subject,
  };

  if (messageId.length > 0) {
    reference.messageId = messageId;
  }

  if (dateReceived !== null) {
    reference.dateReceived = dateReceived;
  }

  if (messageSize !== null) {
    reference.messageSize = messageSize;
  }

  return reference;
}

function buildMessage(message, mailboxName, includeAttachments, includeHeaders) {
  const flagIndex = toNumber(
    safeCall(() => (typeof message.flagIndex === "function" ? message.flagIndex() : -1), -1),
    -1,
  );
  const flaggedStatus = toBoolean(
    safeCall(() => (typeof message.flaggedStatus === "function" ? message.flaggedStatus() : flagIndex >= 0), flagIndex >= 0),
    flagIndex >= 0,
  );
  const result = {
    subject: toText(safeCall(() => message.subject(), null), "No subject"),
    sender: toText(safeCall(() => message.sender(), null), "Unknown sender"),
    dateSent: toISO(safeCall(() => message.dateSent(), null), "new Date().toISOString()"),
    content: getContentPreview(message),
    isRead: toBoolean(safeCall(() => message.readStatus(), false), false),
    flaggedStatus,
    flagIndex,
    flagColor: flaggedStatus ? flagColorFromIndex(flagIndex) : "none",
    mailbox: mailboxName,
  };

  if (includeAttachments) {
    const attachments = safeCall(() => message.mailAttachments(), []);
    result.attachments = Array.isArray(attachments)
      ? attachments.map((attachment) => buildAttachment(attachment))
      : [];
  }

  if (includeHeaders) {
    result.headers = getHeaders(message);
  }

  return result;
}

function buildMessageMetadata(message, account, mailboxName, includeAttachmentNames) {
  const subject = toText(safeCall(() => message.subject(), null), "No subject");
  const sender = toText(safeCall(() => message.sender(), null), "Unknown sender");
  const dateSent = toISO(safeCall(() => message.dateSent(), null), "new Date().toISOString()");
  const flagIndex = toNumber(
    safeCall(() => (typeof message.flagIndex === "function" ? message.flagIndex() : -1), -1),
    -1,
  );
  const flaggedStatus = toBoolean(
    safeCall(() => (typeof message.flaggedStatus === "function" ? message.flaggedStatus() : flagIndex >= 0), flagIndex >= 0),
    flagIndex >= 0,
  );
  const messageId = safeCall(
    () => (typeof message.messageId === "function" ? message.messageId() : null),
    null,
  );
  const result = {
    subject,
    sender,
    dateSent,
    isRead: toBoolean(safeCall(() => message.readStatus(), false), false),
    flaggedStatus,
    flagIndex,
    flagColor: flaggedStatus ? flagColorFromIndex(flagIndex) : "none",
    mailbox: mailboxName,
    messageLink: createMessageLinkFromMessageId(messageId, subject),
    messageReference: buildMessageReference(message, account, mailboxName, subject, sender, dateSent),
  };

  if (includeAttachmentNames) {
    const attachments = safeCall(() => message.mailAttachments(), []);
    const names = Array.isArray(attachments)
      ? attachments
          .map((attachment) => toText(safeCall(() => attachment.name(), null), ""))
          .filter((name) => name.length > 0)
      : [];
    result.attachmentCount = Array.isArray(attachments) ? attachments.length : 0;
    result.attachmentNames = names;
  }

  return result;
}

function buildMailboxSummary(mailbox) {
  const messages = safeCall(() => mailbox.messages(), []);
  const children = safeCall(() => mailbox.mailboxes(), []);
  const name = toText(safeCall(() => mailbox.name(), null), "Unknown mailbox");
  const unreadCount = toNumber(
    safeCall(() => (typeof mailbox.unreadCount === "function" ? mailbox.unreadCount() : 0), 0),
    0,
  );
  const directMessageCount = Array.isArray(messages) ? messages.length : 0;
  const directChildCount = Array.isArray(children) ? children.length : 0;

  return {
    name,
    id: toText(safeCall(() => mailbox.id(), null), ""),
    path: name,
    parentPath: null,
    unreadCount,
    totalCount: directMessageCount,
    directUnreadCount: unreadCount,
    directMessageCount,
    directChildCount,
    children: [],
  };
}

function mailboxPathFromContainer(mailbox, fallbackPath, accountName) {
  const pathParts = [toText(safeCall(() => mailbox.name(), null), "Unknown mailbox")];
  let currentMailbox = mailbox;

  for (let i = 0; i < 25; i += 1) {
    const parentMailbox = safeCall(
      () => (typeof currentMailbox.container === "function" ? currentMailbox.container() : null),
      null,
    );
    if (!parentMailbox) {
      break;
    }

    const parentName = toText(safeCall(() => parentMailbox.name(), null), "");
    if (!parentName || parentName === accountName) {
      break;
    }

    pathParts.unshift(parentName);
    currentMailbox = parentMailbox;
  }

  const path = pathParts.filter((part) => part.length > 0).join("/");
  return path || fallbackPath;
}

function parentPathFromPath(path) {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : null;
}

function buildMailboxInfo(mailbox, recursive, fallbackPath = "", accountName = "") {
  const summary = buildMailboxSummary(mailbox);
  summary.path = mailboxPathFromContainer(mailbox, fallbackPath || summary.name, accountName);
  summary.parentPath = parentPathFromPath(summary.path);

  const children = safeCall(() => mailbox.mailboxes(), []);

  if (!Array.isArray(children)) {
    return summary;
  }

  summary.children = children.map((child) =>
    recursive
      ? buildMailboxInfo(child, true, summary.path + "/" + toText(safeCall(() => child.name(), null), "Unknown mailbox"), accountName)
      : buildMailboxInfo(child, false, summary.path + "/" + toText(safeCall(() => child.name(), null), "Unknown mailbox"), accountName),
  );

  return summary;
}

function buildMailboxTree(mailboxes, accountName) {
  const byPath = {};

  function collect(mailbox, fallbackParentPath) {
    const mailboxName = toText(safeCall(() => mailbox.name(), null), "Unknown mailbox");
    const fallbackPath = fallbackParentPath ? fallbackParentPath + "/" + mailboxName : mailboxName;
    const summary = buildMailboxInfo(mailbox, false, fallbackPath, accountName);

    if (!byPath[summary.path]) {
      byPath[summary.path] = { ...summary, children: [] };
    }

    const children = safeCall(() => mailbox.mailboxes(), []);
    if (Array.isArray(children)) {
      for (const child of children) {
        collect(child, summary.path);
      }
    }
  }

  for (const mailbox of Array.isArray(mailboxes) ? mailboxes : []) {
    collect(mailbox, "");
  }

  const nodes = Object.values(byPath);
  nodes.sort((a, b) => {
    const depthDiff = a.path.split("/").length - b.path.split("/").length;
    return depthDiff !== 0 ? depthDiff : a.path.localeCompare(b.path);
  });

  const roots = [];
  for (const node of nodes) {
    const parent = node.parentPath ? byPath[node.parentPath] : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortChildren(node) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  roots.sort((a, b) => a.name.localeCompare(b.name));
  for (const root of roots) {
    sortChildren(root);
  }

  return roots;
}
`;

function buildMailScript(functionBody: string): string {
  return wrapJXAFunction(`
    ${MAIL_JXA_HELPERS}
    ${functionBody}
  `);
}

function normalizeLimit(limit: number): number {
  return Math.max(0, Math.trunc(limit));
}

function normalizeMetadataLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 25;
  }

  return Math.min(200, Math.max(0, Math.trunc(limit)));
}

function normalizeMetadataSearchFields(
  fields: MessageMetadataSearchField[] | undefined,
): MessageMetadataSearchField[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    return ["subject", "sender"];
  }

  const allowed = new Set<MessageMetadataSearchField>(["subject", "sender", "attachmentNames"]);
  const normalized = fields.filter((field): field is MessageMetadataSearchField => allowed.has(field));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : ["subject", "sender"];
}

function emptyMessageMetadataPage(
  opts?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
    sort?: "dateSentAsc" | "dateSentDesc";
    searchTerm?: string;
    searchFields?: MessageMetadataSearchField[];
  },
): EmailMessageMetadataPage {
  const sort = opts?.sort === "dateSentAsc" ? "dateSentAsc" : "dateSentDesc";
  const searchFields = normalizeMetadataSearchFields(opts?.searchFields);

  return {
    messages: [],
    pageInfo: {
      hasMore: false,
      scannedCount: 0,
      returnedCount: 0,
      sort,
      limit: normalizeMetadataLimit(opts?.limit),
      windowStart: opts?.startDate ?? null,
      windowEnd: opts?.endDate ?? null,
      truncated: false,
      searchTerm: opts?.searchTerm ?? null,
      searchFields,
    },
  };
}

function normalizeMessageMetadataPage(
  page: EmailMessageMetadataPage,
  limit: number,
  sort: "dateSentAsc" | "dateSentDesc",
  opts?: {
    startDate?: string;
    endDate?: string;
    searchTerm?: string;
    searchFields?: MessageMetadataSearchField[];
  },
): EmailMessageMetadataPage {
  if (!page || !Array.isArray(page.messages)) {
    return emptyMessageMetadataPage({
      limit,
      sort,
      startDate: opts?.startDate,
      endDate: opts?.endDate,
      searchTerm: opts?.searchTerm,
      searchFields: opts?.searchFields,
    });
  }

  const searchFields = normalizeMetadataSearchFields(
    page.pageInfo?.searchFields ?? opts?.searchFields,
  );

  return {
    messages: page.messages,
    pageInfo: {
      hasMore: page.pageInfo?.hasMore === true,
      nextCursor: page.pageInfo?.nextCursor,
      scannedCount: Number.isFinite(page.pageInfo?.scannedCount)
        ? page.pageInfo.scannedCount
        : page.messages.length,
      returnedCount: Number.isFinite(page.pageInfo?.returnedCount)
        ? page.pageInfo.returnedCount
        : page.messages.length,
      sort: page.pageInfo?.sort === "dateSentAsc" ? "dateSentAsc" : sort,
      limit: Number.isFinite(page.pageInfo?.limit) ? page.pageInfo.limit : limit,
      windowStart: page.pageInfo?.windowStart ?? opts?.startDate ?? null,
      windowEnd: page.pageInfo?.windowEnd ?? opts?.endDate ?? null,
      truncated: page.pageInfo?.truncated === true,
      searchTerm: page.pageInfo?.searchTerm ?? opts?.searchTerm ?? null,
      searchFields,
    },
  };
}

function processHeaders(messages: EmailMessage[], headerFilter?: string[]): EmailMessage[] {
  for (const message of messages) {
    if (!message.headers) {
      continue;
    }

    if (headerFilter && headerFilter.length > 0) {
      message.headers = filterHeaders(message.headers, headerFilter);
    }

    message.messageLink = createMessageLink(message.headers, message.subject);
  }

  return messages;
}

function toMailError(prefix: string, error: unknown): Error {
  if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
    return new Error(`${prefix}: ${error.message}`);
  }

  return new Error(`${prefix}: ${error instanceof Error ? error.message : String(error)}`);
}

async function checkMailAccess(): Promise<boolean> {
  try {
    const runningScript = buildMailScript(`
      const SystemEvents = Application("System Events");
      const isRunning = SystemEvents.processes.whose({ name: "Mail" })().length > 0;
      return JSON.stringify(isRunning);
    `);

    let isRunning = false;

    try {
      isRunning = (await executeJXA<boolean>(runningScript)) === true;
    } catch (error) {
      if (!(error instanceof JXAAppNotRunningError) && !(error instanceof JXAExecutionError)) {
        throw error;
      }
    }

    if (!isRunning) {
      const activateScript = buildMailScript(`
        const Mail = Application("Mail");
        Mail.activate();
        delay(2);
        return JSON.stringify(true);
      `);
      await executeJXA<boolean>(activateScript);
    }

    try {
      const mailboxScript = buildMailScript(`
        const Mail = Application("Mail");
        return JSON.stringify(Mail.mailboxes().length >= 0);
      `);
      return (await executeJXA<boolean>(mailboxScript)) === true;
    } catch (error) {
      if (!(error instanceof JXAAppNotRunningError) && !(error instanceof JXAExecutionError)) {
        throw error;
      }
    }

    const versionScript = buildMailScript(`
      const Mail = Application("Mail");
      const version = ${JXAConverters.toString("Mail.version()", '""')};
      return JSON.stringify(version.length > 0);
    `);

    return (await executeJXA<boolean>(versionScript)) === true;
  } catch (error) {
    throw toMailError(
      "Cannot access Mail app. Please make sure Mail is running and properly configured",
      error,
    );
  }
}

async function getUnreadMails(
  limit = 10,
  includeHeaders?: boolean,
  headerFilter?: string[],
  accountName?: string,
): Promise<EmailMessage[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const normalizedLimit = normalizeLimit(limit);
    if (normalizedLimit === 0) {
      return [];
    }

    const includeHeadersFlag = includeHeaders === true;
    const escapedAccountName = accountName ? escapeJXAString(accountName) : null;
    const accountExpression = escapedAccountName ? `"${escapedAccountName}"` : "null";

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const limit = ${normalizedLimit};
      const includeHeaders = ${includeHeadersFlag};
      const targetAccountName = ${accountExpression};
      const results = [];

      let accounts;
      if (targetAccountName) {
        const matched = safeCall(() => Mail.accounts.whose({ name: targetAccountName })(), []);
        accounts = Array.isArray(matched) ? matched : [];
      } else {
        accounts = safeCall(() => Mail.accounts(), []);
        accounts = Array.isArray(accounts) ? accounts : [];
      }

      for (let a = 0; a < accounts.length && results.length < limit; a++) {
        // Try to get the inbox directly instead of iterating all mailboxes
        const inboxNames = ["INBOX", "Posteingang", "Inbox"];
        let targetMailboxes = [];

        for (let n = 0; n < inboxNames.length && targetMailboxes.length === 0; n++) {
          targetMailboxes = safeCall(
            () => accounts[a].mailboxes.whose({ name: inboxNames[n] })(),
            [],
          );
        }

        // If we couldn't find inbox by name, just get the first mailbox
        if (!Array.isArray(targetMailboxes) || targetMailboxes.length === 0) {
          const allMailboxes = safeCall(() => accounts[a].mailboxes(), []);
          targetMailboxes = Array.isArray(allMailboxes) && allMailboxes.length > 0
            ? [allMailboxes[0]]
            : [];
        }

        for (let m = 0; m < targetMailboxes.length && results.length < limit; m++) {
          const mailbox = targetMailboxes[m];
          const mailboxName = toText(safeCall(() => mailbox.name(), null), "Unknown mailbox");
          const unreadMessages = safeCall(() => mailbox.messages.whose({ readStatus: false })(), []);
          const count = Math.min(unreadMessages.length, limit - results.length);

          for (let index = 0; index < count; index++) {
            results.push(buildMessage(unreadMessages[index], mailboxName, false, includeHeaders));
          }
        }
      }

      return JSON.stringify(results);
    `);

    const unreadMails = await executeJXA<EmailMessage[]>(script);
    const resolvedMails = Array.isArray(unreadMails) ? unreadMails : [];

    return includeHeadersFlag ? processHeaders(resolvedMails, headerFilter) : resolvedMails;
  } catch (error) {
    throw toMailError("Error accessing mail", error);
  }
}

async function searchMails(
  searchTerm: string,
  limit = 10,
  includeHeaders?: boolean,
  headerFilter?: string[],
): Promise<EmailMessage[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const normalizedLimit = normalizeLimit(limit);
    if (normalizedLimit === 0) {
      return [];
    }

    const escapedSearchTerm = escapeJXAString(searchTerm);
    const includeHeadersFlag = includeHeaders === true;
    const script = buildMailScript(`
      const Mail = Application("Mail");
      const searchTerm = "${escapedSearchTerm}";
      const normalizedSearchTerm = searchTerm.toLowerCase();
      const limit = ${normalizedLimit};
      const includeHeaders = ${includeHeadersFlag};
      const results = [];
      const accounts = safeCall(() => Mail.accounts(), []);

      for (const account of Array.isArray(accounts) ? accounts : []) {
        const mailboxes = getNestedMailboxes(safeCall(() => account.mailboxes(), []));

        for (const mailbox of mailboxes) {
          const mailboxName = toText(safeCall(() => mailbox.name(), null), "Unknown mailbox");
          const messages = safeCall(() => mailbox.messages(), []);

          for (const message of Array.isArray(messages) ? messages : []) {
            const subject = toText(safeCall(() => message.subject(), null), "").toLowerCase();
            const content = toText(
              safeCall(() => (typeof message.content === "function" ? message.content() : null), null),
              "",
            ).toLowerCase();

            if (!subject.includes(normalizedSearchTerm) && !content.includes(normalizedSearchTerm)) {
              continue;
            }

            results.push(buildMessage(message, mailboxName, false, includeHeaders));

            if (results.length >= limit) {
              break;
            }
          }

          if (results.length >= limit) {
            break;
          }
        }

        if (results.length >= limit) {
          break;
        }
      }

      return JSON.stringify(results);
    `);

    const searchResults = await executeJXA<EmailMessage[]>(script);
    const resolvedResults = Array.isArray(searchResults) ? searchResults : [];

    return includeHeadersFlag ? processHeaders(resolvedResults, headerFilter) : resolvedResults;
  } catch (error) {
    throw toMailError("Error searching mail", error);
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

    const escapedTo = escapeJXAString(to);
    const escapedSubject = escapeJXAString(subject);
    const escapedBody = escapeJXAString(body);
    const escapedCc = cc === undefined ? null : escapeJXAString(cc);
    const escapedBcc = bcc === undefined ? null : escapeJXAString(bcc);

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const toAddress = "${escapedTo}";
      const subject = "${escapedSubject}";
      const body = "${escapedBody}";
      const ccAddress = ${escapedCc === null ? "null" : `"${escapedCc}"`};
      const bccAddress = ${escapedBcc === null ? "null" : `"${escapedBcc}"`};

      Mail.activate();

      const message = Mail.OutgoingMessage().make();
      message.subject = subject;
      message.content = body;
      message.visible = true;

      const toRecipient = Mail.ToRecipient().make();
      toRecipient.address = toAddress;
      message.toRecipients.push(toRecipient);

      if (ccAddress !== null) {
        const ccRecipient = Mail.CcRecipient().make();
        ccRecipient.address = ccAddress;
        message.ccRecipients.push(ccRecipient);
      }

      if (bccAddress !== null) {
        const bccRecipient = Mail.BccRecipient().make();
        bccRecipient.address = bccAddress;
        message.bccRecipients.push(bccRecipient);
      }

      message.send();

      return JSON.stringify(true);
    `);

    const result = await executeJXA<boolean>(script);

    if (result !== true) {
      throw new Error("Mail send did not complete successfully");
    }

    return `Email sent to ${to} with subject "${subject}"`;
  } catch (error) {
    throw toMailError("Error sending mail", error);
  }
}

async function getMailboxes(): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const mailboxes = safeCall(() => Mail.mailboxes(), []);
      const result = Array.isArray(mailboxes)
        ? mailboxes.map((mailbox) => toText(safeCall(() => mailbox.name(), null), "Unknown mailbox"))
        : [];
      return JSON.stringify(result);
    `);

    const mailboxes = await executeJXA<string[]>(script);
    return Array.isArray(mailboxes) ? mailboxes : [];
  } catch (error) {
    throw toMailError("Error getting mailboxes", error);
  }
}

async function getAccounts(): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accounts = safeCall(() => Mail.accounts(), []);
      const result = Array.isArray(accounts)
        ? accounts.map((account) => toText(safeCall(() => account.name(), null), ""))
        : [];
      return JSON.stringify(result);
    `);

    const accounts = await executeJXA<string[]>(script);
    return Array.isArray(accounts) ? accounts : [];
  } catch (error) {
    throw toMailError("Error getting mail accounts", error);
  }
}

async function getMailboxesForAccount(accountName: string): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const escapedAccountName = escapeJXAString(accountName);
    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const matches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);

      if (!Array.isArray(matches) || matches.length === 0) {
        return JSON.stringify([]);
      }

      const mailboxes = safeCall(() => matches[0].mailboxes(), []);
      const result = Array.isArray(mailboxes)
        ? mailboxes.map((mailbox) => toText(safeCall(() => mailbox.name(), null), "Unknown mailbox"))
        : [];

      return JSON.stringify(result);
    `);

    const mailboxes = await executeJXA<string[]>(script);
    return Array.isArray(mailboxes) ? mailboxes : [];
  } catch (error) {
    throw toMailError(`Error getting mailboxes for account ${accountName}`, error);
  }
}

async function getAccountSummaries(): Promise<MailAccount[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accounts = safeCall(() => Mail.accounts(), []);
      const result = Array.isArray(accounts)
        ? accounts.map((account) => ({
            name: toText(safeCall(() => account.name(), null), ""),
            id: toText(safeCall(() => account.id(), null), ""),
            type: toText(
              safeCall(() => (typeof account.accountType === "function" ? account.accountType() : null), null),
              "",
            ),
            addresses: toStringArray(
              safeCall(() => (typeof account.emailAddresses === "function" ? account.emailAddresses() : []), []),
            ),
            enabled: toBoolean(
              safeCall(() => (typeof account.enabled === "function" ? account.enabled() : false), false),
              false,
            ),
          }))
        : [];
      return JSON.stringify(result);
    `);

    const accounts = await executeJXA<MailAccount[]>(script);
    return Array.isArray(accounts) ? accounts : [];
  } catch (error) {
    throw toMailError("Error getting account summaries", error);
  }
}

async function getAccountDetails(accountName: string): Promise<MailAccountDetails | undefined> {
  try {
    if (!(await checkMailAccess())) {
      return undefined;
    }

    const escapedAccountName = escapeJXAString(accountName);
    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const matches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);

      if (!Array.isArray(matches) || matches.length === 0) {
        return JSON.stringify(null);
      }

      const account = matches[0];
      const deliveryAccount = safeCall(
        () => (typeof account.deliveryAccount === "function" ? account.deliveryAccount() : null),
        null,
      );

      return JSON.stringify({
        name: toText(safeCall(() => account.name(), null), ""),
        id: toText(safeCall(() => account.id(), null), ""),
        type: toText(
          safeCall(() => (typeof account.accountType === "function" ? account.accountType() : null), null),
          "",
        ),
        addresses: toStringArray(
          safeCall(() => (typeof account.emailAddresses === "function" ? account.emailAddresses() : []), []),
        ),
        enabled: toBoolean(
          safeCall(() => (typeof account.enabled === "function" ? account.enabled() : false), false),
          false,
        ),
        server: toText(
          safeCall(() => (typeof account.serverName === "function" ? account.serverName() : null), null),
          "",
        ),
        port: toNumber(
          safeCall(() => (typeof account.port === "function" ? account.port() : 0), 0),
          0,
        ),
        usesSSL: toBoolean(
          safeCall(() => (typeof account.usesSSL === "function" ? account.usesSSL() : false), false),
          false,
        ),
        authentication: toText(
          safeCall(() => (typeof account.authentication === "function" ? account.authentication() : null), null),
          "",
        ),
        fullName: toText(
          safeCall(() => (typeof account.fullName === "function" ? account.fullName() : null), null),
          "",
        ),
        accountDirectory: toText(
          safeCall(
            () => (typeof account.accountDirectory === "function" ? account.accountDirectory() : null),
            null,
          ),
          "",
        ),
        deliveryAccount: deliveryAccount
          ? toText(safeCall(() => deliveryAccount.name(), null), "")
          : "",
      });
    `);

    const details = await executeJXA<MailAccountDetails | null>(script);

    if (!details) {
      throw new Error(`Account '${accountName}' not found`);
    }

    return details;
  } catch (error) {
    throw toMailError("Error getting account details", error);
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

    const escapedAccountName = escapeJXAString(accountName);
    const escapedMailboxName = escapeJXAString(mailboxName);
    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedMailboxName}";
      const matches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);

      if (!Array.isArray(matches) || matches.length === 0) {
        return JSON.stringify(null);
      }

      const mailbox = findMailboxRecursive(safeCall(() => matches[0].mailboxes(), []), mailboxName, accountName);
      if (!mailbox) {
        return JSON.stringify(null);
      }

      return JSON.stringify(buildMailboxInfo(mailbox, false, mailboxName, accountName));
    `);

    const info = await executeJXA<MailboxInfo | null>(script);
    return info ?? undefined;
  } catch (error) {
    throw toMailError("Error getting mailbox properties", error);
  }
}

async function getAccountMailboxTree(accountName: string): Promise<MailboxInfo[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const escapedAccountName = escapeJXAString(accountName);
    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const matches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);

      if (!Array.isArray(matches) || matches.length === 0) {
        return JSON.stringify(null);
      }

      const mailboxes = safeCall(() => matches[0].mailboxes(), []);
      const result = buildMailboxTree(mailboxes, accountName);

      return JSON.stringify(result);
    `);

    const tree = await executeJXA<MailboxInfo[] | null>(script);

    if (!tree) {
      throw new Error(`Account '${accountName}' not found`);
    }

    return Array.isArray(tree) ? tree : [];
  } catch (error) {
    throw toMailError("Error getting mailbox tree", error);
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
    headerFilter?: string[];
  },
): Promise<EmailMessage[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const escapedAccountName = escapeJXAString(accountName);
    const escapedMailboxName = escapeJXAString(mailboxName);
    const limitLiteral =
      opts?.limit === undefined ? "null" : String(normalizeLimit(opts.limit));
    const startDateLiteral =
      opts?.startDate === undefined ? "null" : `"${escapeJXAString(opts.startDate)}"`;
    const endDateLiteral =
      opts?.endDate === undefined ? "null" : `"${escapeJXAString(opts.endDate)}"`;
    const unreadOnly = opts?.unreadOnly === true;
    const includeAttachments = opts?.includeAttachments === true;
    const includeHeaders = opts?.includeHeaders === true;

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedMailboxName}";
      const limit = ${limitLiteral};
      const unreadOnly = ${unreadOnly};
      const includeAttachments = ${includeAttachments};
      const includeHeaders = ${includeHeaders};
      const startDate = ${startDateLiteral};
      const endDate = ${endDateLiteral};

      const accountMatches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);
      if (!Array.isArray(accountMatches) || accountMatches.length === 0) {
        return JSON.stringify([]);
      }

      // Try direct .whose() first (fast), fall back to recursive search
      let targetMailbox = null;
      const directMatch = safeCall(
        () => accountMatches[0].mailboxes.whose({ name: mailboxName })(),
        [],
      );
      if (Array.isArray(directMatch) && directMatch.length > 0) {
        targetMailbox = directMatch[0];
      } else {
        // Fallback: recursive search for nested mailboxes
        targetMailbox = findMailboxRecursive(
          safeCall(() => accountMatches[0].mailboxes(), []),
          mailboxName,
          accountName,
        );
      }
      if (!targetMailbox) {
        return JSON.stringify([]);
      }

      let messages;
      if (unreadOnly) {
        messages = safeCall(() => targetMailbox.messages.whose({ readStatus: false })(), []);
      } else {
        messages = safeCall(() => targetMailbox.messages(), []);
      }
      if (!Array.isArray(messages)) {
        messages = [];
      }

      if (startDate !== null || endDate !== null) {
        const startDateValue = startDate === null ? null : new Date(startDate);
        const endDateValue = endDate === null ? null : new Date(endDate);

        messages = messages.filter((message) => {
          const dateValue = safeCall(() => message.dateSent(), null);
          const messageDate = dateValue === null ? null : new Date(dateValue);

          if (messageDate === null || Number.isNaN(messageDate.getTime())) {
            return false;
          }

          if (startDateValue !== null && !Number.isNaN(startDateValue.getTime()) && messageDate < startDateValue) {
            return false;
          }

          if (endDateValue !== null && !Number.isNaN(endDateValue.getTime()) && messageDate > endDateValue) {
            return false;
          }

          return true;
        });
      }

      if (limit !== null) {
        messages = messages.slice(0, limit);
      }

      const resolvedMailboxName = toText(safeCall(() => targetMailbox.name(), null), mailboxName);
      const result = messages.map((message) =>
        buildMessage(message, resolvedMailboxName, includeAttachments, includeHeaders),
      );

      return JSON.stringify(result);
    `);

    const messages = await executeJXA<EmailMessage[]>(script);
    const resolvedMessages = Array.isArray(messages) ? messages : [];

    return includeHeaders ? processHeaders(resolvedMessages, opts?.headerFilter) : resolvedMessages;
  } catch (error) {
    throw toMailError("Error listing messages", error);
  }
}

async function listMessageMetadata(
  accountName: string,
  mailboxName: string,
  opts?: {
    limit?: number;
    unreadOnly?: boolean;
    startDate?: string;
    endDate?: string;
    includeAttachmentNames?: boolean;
    includeHeaders?: boolean;
    headerFilter?: string[];
    sort?: "dateSentAsc" | "dateSentDesc";
    cursor?: MessageMetadataCursor;
    searchTerm?: string;
    searchFields?: MessageMetadataSearchField[];
  },
): Promise<EmailMessageMetadataPage> {
  try {
    if (!(await checkMailAccess())) {
      return emptyMessageMetadataPage(opts);
    }

    const escapedAccountName = escapeJXAString(accountName);
    const escapedMailboxName = escapeJXAString(mailboxName);
    const normalizedLimit = normalizeMetadataLimit(opts?.limit);
    const limitLiteral = String(normalizedLimit);
    const startDateLiteral =
      opts?.startDate === undefined ? "null" : `"${escapeJXAString(opts.startDate)}"`;
    const endDateLiteral =
      opts?.endDate === undefined ? "null" : `"${escapeJXAString(opts.endDate)}"`;
    const unreadOnly = opts?.unreadOnly === true;
    const searchFields = normalizeMetadataSearchFields(opts?.searchFields);
    const includeAttachmentNames = opts?.includeAttachmentNames === true || searchFields.includes("attachmentNames");
    const includeHeaders = opts?.includeHeaders === true;
    const sort = opts?.sort === "dateSentAsc" ? "dateSentAsc" : "dateSentDesc";
    const searchTermLiteral =
      opts?.searchTerm === undefined ? "null" : `"${escapeJXAString(opts.searchTerm)}"`;
    const searchFieldsLiteral = JSON.stringify(searchFields);
    const cursorLiteral = opts?.cursor
      ? JSON.stringify({
        dateSent: opts.cursor.dateSent,
        mailObjectId: opts.cursor.mailObjectId ?? null,
      })
      : "null";

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedMailboxName}";
      const limit = ${limitLiteral};
      const unreadOnly = ${unreadOnly};
      const includeAttachmentNames = ${includeAttachmentNames};
      const includeHeaders = ${includeHeaders};
      const startDate = ${startDateLiteral};
      const endDate = ${endDateLiteral};
      const sort = "${sort}";
      const searchTerm = ${searchTermLiteral};
      const searchFields = ${searchFieldsLiteral};
      const cursor = ${cursorLiteral};

      function emptyPage() {
        return {
          messages: [],
          pageInfo: {
            hasMore: false,
            scannedCount: 0,
            returnedCount: 0,
            sort,
            limit,
            windowStart: startDate,
            windowEnd: endDate,
            truncated: false,
            searchTerm,
            searchFields,
          },
        };
      }

      function messageTimestamp(message) {
        const dateValue = safeCall(() => message.dateSent(), null);
        const messageDate = dateValue === null ? null : new Date(dateValue);
        return messageDate === null || Number.isNaN(messageDate.getTime())
          ? 0
          : messageDate.getTime();
      }

      function messageObjectId(message) {
        return toText(safeCall(() => message.id(), null), "");
      }

      function compareMessages(a, b) {
        const aTime = messageTimestamp(a);
        const bTime = messageTimestamp(b);
        if (aTime !== bTime) {
          return sort === "dateSentAsc" ? aTime - bTime : bTime - aTime;
        }

        return messageObjectId(a).localeCompare(messageObjectId(b));
      }

      function isAfterCursor(message) {
        if (cursor === null || !cursor.dateSent) {
          return true;
        }

        const cursorTime = new Date(cursor.dateSent).getTime();
        if (Number.isNaN(cursorTime)) {
          return true;
        }

        const messageTime = messageTimestamp(message);
        if (messageTime !== cursorTime) {
          return sort === "dateSentAsc"
            ? messageTime > cursorTime
            : messageTime < cursorTime;
        }

        if (!cursor.mailObjectId) {
          return false;
        }

        return messageObjectId(message).localeCompare(String(cursor.mailObjectId)) > 0;
      }

      function buildCursor(message) {
        return {
          dateSent: toISO(safeCall(() => message.dateSent(), null), "new Date().toISOString()"),
          mailObjectId: messageObjectId(message),
        };
      }

      function searchFieldEnabled(field) {
        return Array.isArray(searchFields) && searchFields.indexOf(field) >= 0;
      }

      function messageMatchesSearch(message) {
        if (searchTerm === null || searchTerm.length === 0) {
          return true;
        }

        const normalizedSearchTerm = searchTerm.toLowerCase();
        const values = [];

        if (searchFieldEnabled("subject")) {
          values.push(toText(safeCall(() => message.subject(), null), ""));
        }

        if (searchFieldEnabled("sender")) {
          values.push(toText(safeCall(() => message.sender(), null), ""));
        }

        if (searchFieldEnabled("attachmentNames")) {
          const attachments = safeCall(() => message.mailAttachments(), []);
          if (Array.isArray(attachments)) {
            for (const attachment of attachments) {
              values.push(toText(safeCall(() => attachment.name(), null), ""));
            }
          }
        }

        return values.some((value) => value.toLowerCase().includes(normalizedSearchTerm));
      }

      const accountMatches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);
      if (!Array.isArray(accountMatches) || accountMatches.length === 0) {
        return JSON.stringify(emptyPage());
      }

      let targetMailbox = null;
      const directMatch = mailboxName.indexOf("/") < 0
        ? safeCall(() => accountMatches[0].mailboxes.whose({ name: mailboxName })(), [])
        : [];
      if (Array.isArray(directMatch) && directMatch.length > 0) {
        targetMailbox = directMatch[0];
      } else {
        targetMailbox = findMailboxRecursive(
          safeCall(() => accountMatches[0].mailboxes(), []),
          mailboxName,
          accountName,
        );
      }
      if (!targetMailbox) {
        return JSON.stringify(emptyPage());
      }

      let messages;
      if (unreadOnly) {
        messages = safeCall(() => targetMailbox.messages.whose({ readStatus: false })(), []);
      } else {
        messages = safeCall(() => targetMailbox.messages(), []);
      }
      if (!Array.isArray(messages)) {
        messages = [];
      }

      if (startDate !== null || endDate !== null) {
        const startDateValue = startDate === null ? null : new Date(startDate);
        const endDateValue = endDate === null ? null : new Date(endDate);

        messages = messages.filter((message) => {
          const dateValue = safeCall(() => message.dateSent(), null);
          const messageDate = dateValue === null ? null : new Date(dateValue);

          if (messageDate === null || Number.isNaN(messageDate.getTime())) {
            return false;
          }

          if (startDateValue !== null && !Number.isNaN(startDateValue.getTime()) && messageDate < startDateValue) {
            return false;
          }

          if (endDateValue !== null && !Number.isNaN(endDateValue.getTime()) && messageDate > endDateValue) {
            return false;
          }

          return true;
        });
      }

      if (searchTerm !== null && searchTerm.length > 0) {
        messages = messages.filter(messageMatchesSearch);
      }

      messages = messages.sort(compareMessages);
      const scannedCount = messages.length;
      messages = messages.filter(isAfterCursor);

      const pageMessages = messages.slice(0, limit);
      const hasMore = messages.length > limit;

      const resolvedMailboxName = mailboxPathFromContainer(targetMailbox, mailboxName, accountName);
      const result = pageMessages.map((message) =>
        buildMessageMetadata(message, accountMatches[0], resolvedMailboxName, includeAttachmentNames),
      );

      if (includeHeaders) {
        for (let i = 0; i < result.length; i += 1) {
          result[i].headers = getHeaders(pageMessages[i]);
        }
      }

      const pageInfo = {
        hasMore,
        scannedCount,
        returnedCount: result.length,
        sort,
        limit,
        windowStart: startDate,
        windowEnd: endDate,
        truncated: hasMore,
        searchTerm,
        searchFields,
      };

      if (hasMore && pageMessages.length > 0) {
        pageInfo.nextCursor = buildCursor(pageMessages[pageMessages.length - 1]);
      }

      return JSON.stringify({ messages: result, pageInfo });
    `);

    const page = await executeJXA<EmailMessageMetadataPage>(script);
    const resolvedPage = normalizeMessageMetadataPage(page, normalizedLimit, sort, opts);

    return includeHeaders
      ? {
        ...resolvedPage,
        messages: processHeaders(
          resolvedPage.messages as EmailMessage[],
          opts?.headerFilter,
        ) as EmailMessageMetadata[],
      }
      : resolvedPage;
  } catch (error) {
    throw toMailError("Error listing message metadata", error);
  }
}

async function searchMessageMetadata(
  accountName: string,
  mailboxName: string,
  searchTerm: string,
  opts?: {
    limit?: number;
    unreadOnly?: boolean;
    startDate?: string;
    endDate?: string;
    includeAttachmentNames?: boolean;
    includeHeaders?: boolean;
    headerFilter?: string[];
    sort?: "dateSentAsc" | "dateSentDesc";
    cursor?: MessageMetadataCursor;
    searchFields?: MessageMetadataSearchField[];
  },
): Promise<EmailMessageMetadataPage> {
  if (!opts?.startDate || !opts?.endDate) {
    throw new Error("startDate and endDate are required for metadata search");
  }

  if (!searchTerm || searchTerm.trim().length === 0) {
    return emptyMessageMetadataPage({
      ...opts,
      searchTerm,
      searchFields: opts?.searchFields,
    });
  }

  return listMessageMetadata(accountName, mailboxName, {
    ...opts,
    searchTerm,
    searchFields: opts?.searchFields,
  });
}

async function setMessageFlag(
  accountName: string,
  mailboxName: string,
  mailObjectId: string,
  flagColor: MessageFlagColor,
): Promise<MessageFlagUpdateResult> {
  try {
    const normalizedFlagColor = normalizeMessageFlagColor(flagColor);

    if (!(await checkMailAccess())) {
      throw new Error("Mail access is not available");
    }

    const flagIndex = MESSAGE_FLAG_INDEX_BY_COLOR[normalizedFlagColor];
    const escapedAccountName = escapeJXAString(accountName);
    const escapedMailboxName = escapeJXAString(mailboxName);
    const escapedMailObjectId = escapeJXAString(mailObjectId);

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedMailboxName}";
      const mailObjectId = "${escapedMailObjectId}";
      const flagIndex = ${flagIndex};

      function findMessageByObjectId(mailbox, objectId) {
        const messages = safeCall(() => mailbox.messages(), []);

        if (!Array.isArray(messages)) {
          return null;
        }

        for (const message of messages) {
          const currentId = toText(safeCall(() => message.id(), null), "");
          if (currentId === objectId) {
            return message;
          }
        }

        return null;
      }

      const accountMatches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);
      if (!Array.isArray(accountMatches) || accountMatches.length === 0) {
        throw new Error("Account not found");
      }

      const account = accountMatches[0];
      let targetMailbox = null;
      const directMatch = mailboxName.indexOf("/") < 0
        ? safeCall(() => account.mailboxes.whose({ name: mailboxName })(), [])
        : [];
      if (Array.isArray(directMatch) && directMatch.length > 0) {
        targetMailbox = directMatch[0];
      } else {
        targetMailbox = findMailboxRecursive(safeCall(() => account.mailboxes(), []), mailboxName, accountName);
      }

      if (!targetMailbox) {
        throw new Error("Mailbox not found");
      }

      const message = findMessageByObjectId(targetMailbox, mailObjectId);
      if (!message) {
        throw new Error("Message not found");
      }

      const resolvedMailboxName = mailboxPathFromContainer(targetMailbox, mailboxName, accountName);
      const previous = buildMessageFlagState(message, account, resolvedMailboxName);

      if (flagIndex < 0) {
        message.flaggedStatus = false;
        message.flagIndex = -1;
      } else {
        message.flagIndex = flagIndex;
        message.flaggedStatus = true;
      }

      const current = buildMessageFlagState(message, account, resolvedMailboxName);
      return JSON.stringify({ previous, current });
    `);

    return await executeJXA<MessageFlagUpdateResult>(script);
  } catch (error) {
    throw toMailError("Error setting message flag", error);
  }
}

async function exportMessageArtifacts(
  accountName: string,
  mailboxName: string,
  mailObjectId: string,
  opts?: {
    exportDirectory?: string;
    includeMessageSource?: boolean;
    includeAttachments?: boolean;
    attachmentMode?: AttachmentExportMode;
    skipInlineImages?: boolean;
    dryRun?: boolean;
  },
): Promise<MessageArtifactExportResult> {
  try {
    if (!(await checkMailAccess())) {
      throw new Error("Mail access is not available");
    }

    const escapedAccountName = escapeJXAString(accountName);
    const escapedMailboxName = escapeJXAString(mailboxName);
    const escapedMailObjectId = escapeJXAString(mailObjectId);
    const escapedExportDirectory = escapeJXAString(opts?.exportDirectory ?? "/tmp/apple-mcp-mail-exports");
    const includeMessageSource = opts?.includeMessageSource !== false;
    const includeAttachments = opts?.includeAttachments !== false;
    const attachmentMode = normalizeAttachmentExportMode(opts?.attachmentMode);
    const skipInlineImages = opts?.skipInlineImages === true;
    const dryRun = opts?.dryRun === true;

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedMailboxName}";
      const mailObjectId = "${escapedMailObjectId}";
      const baseExportDirectory = "${escapedExportDirectory}";
      const includeMessageSource = ${includeMessageSource};
      const includeAttachments = ${includeAttachments};
      const attachmentMode = "${attachmentMode}";
      const skipInlineImages = ${skipInlineImages};
      const dryRun = ${dryRun};

      function findMessageByObjectId(mailbox, objectId) {
        const messages = safeCall(() => mailbox.messages(), []);

        if (!Array.isArray(messages)) {
          return null;
        }

        for (const message of messages) {
          const currentId = toText(safeCall(() => message.id(), null), "");
          if (currentId === objectId) {
            return message;
          }
        }

        return null;
      }

      const accountMatches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);
      if (!Array.isArray(accountMatches) || accountMatches.length === 0) {
        throw new Error("Account not found");
      }

      const account = accountMatches[0];
      let targetMailbox = null;
      const directMatch = mailboxName.indexOf("/") < 0
        ? safeCall(() => account.mailboxes.whose({ name: mailboxName })(), [])
        : [];
      if (Array.isArray(directMatch) && directMatch.length > 0) {
        targetMailbox = directMatch[0];
      } else {
        targetMailbox = findMailboxRecursive(safeCall(() => account.mailboxes(), []), mailboxName, accountName);
      }

      if (!targetMailbox) {
        throw new Error("Mailbox not found");
      }

      const message = findMessageByObjectId(targetMailbox, mailObjectId);
      if (!message) {
        throw new Error("Message not found");
      }

      const subject = toText(safeCall(() => message.subject(), null), "No subject");
      const sender = toText(safeCall(() => message.sender(), null), "Unknown sender");
      const dateSent = toISO(safeCall(() => message.dateSent(), null), "new Date().toISOString()");
      const resolvedMailboxName = mailboxPathFromContainer(targetMailbox, mailboxName, accountName);
      const messageReference = buildMessageReference(message, account, resolvedMailboxName, subject, sender, dateSent);
      const exportDirectory = pathJoin(
        baseExportDirectory,
        new Date().toISOString().replace(/[:.]/g, "-") + "-" + mailObjectId + "-" + sanitizeFileName(subject, "message"),
      );

      if (!dryRun && !ensureDirectory(exportDirectory)) {
        throw new Error("Could not create export directory");
      }

      let messageFile = null;
      if (includeMessageSource) {
        const messageFileName = sanitizeFileName(subject, "message") + ".eml";
        const messagePath = uniquePath(exportDirectory, messageFileName);
        messageFile = {
          type: "message",
          name: messageFileName,
          path: messagePath,
          skipped: false,
        };

        if (!dryRun) {
          const source = safeCall(() => message.source(), "");
          if (!writeUtf8File(messagePath, source)) {
            messageFile.skipped = true;
            messageFile.reason = "write-failed";
            delete messageFile.path;
          }
        }
      }

      const exportedAttachments = [];
      const skippedAttachments = [];

      if (includeAttachments) {
        const attachments = safeCall(() => message.mailAttachments(), []);

        for (const attachment of Array.isArray(attachments) ? attachments : []) {
          const name = toText(safeCall(() => attachment.name(), null), "attachment");
          const mimeType = toText(
            safeCall(() => (typeof attachment.mimeType === "function" ? attachment.mimeType() : null), null),
            "",
          );
          const fileSize = toNumber(
            safeCall(() => (typeof attachment.fileSize === "function" ? attachment.fileSize() : 0), 0),
            0,
          );
          const downloaded = toBoolean(
            safeCall(() => (typeof attachment.downloaded === "function" ? attachment.downloaded() : false), false),
            false,
          );
          const classification = classifyAttachmentForExport(name, mimeType, fileSize, attachmentMode, skipInlineImages);
          const baseArtifact = {
            type: "attachment",
            name,
            mimeType,
            fileSize,
            downloaded,
            skipped: false,
          };

          if (!classification.shouldExport) {
            skippedAttachments.push({
              ...baseArtifact,
              skipped: true,
              reason: classification.reason || "filtered",
            });
            continue;
          }

          const attachmentPath = uniquePath(exportDirectory, name);
          const exported = {
            ...baseArtifact,
            path: attachmentPath,
          };

          if (!dryRun) {
            try {
              Mail.save(attachment, { in: Path(attachmentPath) });
            } catch (error) {
              skippedAttachments.push({
                ...baseArtifact,
                skipped: true,
                reason: "save-failed: " + String(error),
              });
              continue;
            }
          }

          exportedAttachments.push(exported);
        }
      }

      return JSON.stringify({
        exportDirectory,
        dryRun,
        messageReference,
        messageFile,
        attachments: exportedAttachments,
        skippedAttachments,
      });
    `);

    return await executeJXA<MessageArtifactExportResult>(script);
  } catch (error) {
    throw toMailError("Error exporting message artifacts", error);
  }
}

async function moveMessage(
  accountName: string,
  mailboxName: string,
  mailObjectId: string,
  targetMailboxName: string,
  opts?: {
    dryRun?: boolean;
  },
): Promise<MessageMoveResult> {
  try {
    if (!(await checkMailAccess())) {
      throw new Error("Mail access is not available");
    }

    const escapedAccountName = escapeJXAString(accountName);
    const escapedMailboxName = escapeJXAString(mailboxName);
    const escapedMailObjectId = escapeJXAString(mailObjectId);
    const escapedTargetMailboxName = escapeJXAString(targetMailboxName);
    const dryRun = opts?.dryRun === true;

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedMailboxName}";
      const mailObjectId = "${escapedMailObjectId}";
      const targetMailboxName = "${escapedTargetMailboxName}";
      const dryRun = ${dryRun};

      function findMessageByObjectId(mailbox, objectId) {
        const messages = safeCall(() => mailbox.messages(), []);

        if (!Array.isArray(messages)) {
          return null;
        }

        for (const message of messages) {
          const currentId = toText(safeCall(() => message.id(), null), "");
          if (currentId === objectId) {
            return message;
          }
        }

        return null;
      }

      const accountMatches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);
      if (!Array.isArray(accountMatches) || accountMatches.length === 0) {
        throw new Error("Account not found");
      }

      const account = accountMatches[0];
      const sourceMailbox = findMailboxRecursive(safeCall(() => account.mailboxes(), []), mailboxName, accountName);
      if (!sourceMailbox) {
        throw new Error("Source mailbox not found");
      }

      const targetMailbox = findMailboxRecursive(safeCall(() => account.mailboxes(), []), targetMailboxName, accountName);
      if (!targetMailbox) {
        throw new Error("Target mailbox not found");
      }

      const message = findMessageByObjectId(sourceMailbox, mailObjectId);
      if (!message) {
        throw new Error("Message not found");
      }

      const subject = toText(safeCall(() => message.subject(), null), "No subject");
      const sender = toText(safeCall(() => message.sender(), null), "Unknown sender");
      const dateSent = toISO(safeCall(() => message.dateSent(), null), "new Date().toISOString()");
      const sourcePath = mailboxPathFromContainer(sourceMailbox, mailboxName, accountName);
      const targetPath = mailboxPathFromContainer(targetMailbox, targetMailboxName, accountName);
      const messageReference = buildMessageReference(message, account, sourcePath, subject, sender, dateSent);

      if (!dryRun) {
        Mail.move(message, { to: targetMailbox });
      }

      return JSON.stringify({
        dryRun,
        moved: !dryRun,
        sourceMailbox: sourcePath,
        targetMailbox: targetPath,
        messageReference,
      });
    `);

    return await executeJXA<MessageMoveResult>(script);
  } catch (error) {
    throw toMailError("Error moving message", error);
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

    const escapedAccountName = escapeJXAString(accountName);
    const escapedName = escapeJXAString(name);
    const parentMailboxLiteral =
      parentMailbox === null ? "null" : `"${escapeJXAString(parentMailbox)}"`;

    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedName}";
      const parentMailbox = ${parentMailboxLiteral};
      const accountMatches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);

      if (!Array.isArray(accountMatches) || accountMatches.length === 0) {
        throw new Error("Account not found");
      }

      let targetContainer = accountMatches[0];

      if (parentMailbox !== null) {
        const parent = findMailboxRecursive(safeCall(() => accountMatches[0].mailboxes(), []), parentMailbox, accountName);
        if (!parent) {
          throw new Error("Parent mailbox not found");
        }
        targetContainer = parent;
      }

      Mail.make({
        new: "mailbox",
        withProperties: { name: mailboxName },
        at: targetContainer,
      });

      return JSON.stringify(true);
    `);

    await executeJXA<boolean>(script);
    return `Created mailbox '${name}'`;
  } catch (error) {
    throw toMailError("Error creating mailbox", error);
  }
}

async function deleteMailbox(accountName: string, mailboxName: string): Promise<string> {
  try {
    if (!(await checkMailAccess())) {
      return "";
    }

    const escapedAccountName = escapeJXAString(accountName);
    const escapedMailboxName = escapeJXAString(mailboxName);
    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedMailboxName}";
      const accountMatches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);

      if (!Array.isArray(accountMatches) || accountMatches.length === 0) {
        throw new Error("Account not found");
      }

      const mailbox = findMailboxRecursive(safeCall(() => accountMatches[0].mailboxes(), []), mailboxName, accountName);
      if (!mailbox) {
        throw new Error("Mailbox not found");
      }

      Mail.delete(mailbox);
      return JSON.stringify(true);
    `);

    await executeJXA<boolean>(script);
    return `Deleted mailbox '${mailboxName}'`;
  } catch (error) {
    throw toMailError("Error deleting mailbox", error);
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

    const escapedAccountName = escapeJXAString(accountName);
    const escapedMailboxName = escapeJXAString(mailboxName);
    const escapedNewName = escapeJXAString(newName);
    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedMailboxName}";
      const newName = "${escapedNewName}";
      const accountMatches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);

      if (!Array.isArray(accountMatches) || accountMatches.length === 0) {
        throw new Error("Account not found");
      }

      const mailbox = findMailboxRecursive(safeCall(() => accountMatches[0].mailboxes(), []), mailboxName, accountName);
      if (!mailbox) {
        throw new Error("Mailbox not found");
      }

      mailbox.name = newName;
      return JSON.stringify(true);
    `);

    await executeJXA<boolean>(script);
    return `Renamed mailbox '${mailboxName}' to '${newName}'`;
  } catch (error) {
    throw toMailError("Error renaming mailbox", error);
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

    const escapedAccountName = escapeJXAString(accountName);
    const escapedMailboxName = escapeJXAString(mailboxName);
    const escapedTargetParent = escapeJXAString(targetParent);
    const script = buildMailScript(`
      const Mail = Application("Mail");
      const accountName = "${escapedAccountName}";
      const mailboxName = "${escapedMailboxName}";
      const targetParent = "${escapedTargetParent}";
      const accountMatches = safeCall(() => Mail.accounts.whose({ name: accountName })(), []);

      if (!Array.isArray(accountMatches) || accountMatches.length === 0) {
        throw new Error("Account not found");
      }

      const account = accountMatches[0];
      const mailbox = findMailboxRecursive(safeCall(() => account.mailboxes(), []), mailboxName, accountName);
      if (!mailbox) {
        throw new Error("Mailbox not found");
      }

      const destination =
        targetParent.length === 0
          ? account
          : findMailboxRecursive(safeCall(() => account.mailboxes(), []), targetParent, accountName);

      if (!destination) {
        throw new Error("Target mailbox not found");
      }

      Mail.move(mailbox, { to: destination });
      return JSON.stringify(true);
    `);

    await executeJXA<boolean>(script);
    return `Moved mailbox '${mailboxName}' to '${targetParent}'`;
  } catch (error) {
    throw toMailError("Error moving mailbox", error);
  }
}

const mail = {
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
  listMessageMetadata,
  searchMessageMetadata,
  setMessageFlag,
  exportMessageArtifacts,
  moveMessage,
  createMailbox,
  deleteMailbox,
  renameMailbox,
  moveMailbox,
};

export {
  checkMailAccess,
  createMailbox,
  deleteMailbox,
  filterHeaders,
  getAccountDetails,
  getAccountMailboxTree,
  getAccountSummaries,
  getAccounts,
  getMailboxProperties,
  getMailboxes,
  getMailboxesForAccount,
  getUnreadMails,
  exportMessageArtifacts,
  listMessageMetadata,
  listMessages,
  moveMessage,
  moveMailbox,
  renameMailbox,
  searchMessageMetadata,
  searchMails,
  sendMail,
  setMessageFlag,
};

export default mail;
