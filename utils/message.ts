import { executeJXA, wrapJXAFunction } from "../core/jxa-bridge.ts";
import Database from "better-sqlite3";
import { homedir } from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_PATH = path.join(homedir(), "Library/Messages/chat.db");

// ---------------------------------------------------------------------------
// Database helper — singleton, read-only
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) {
    try {
      // Quick liveness check — will throw if the handle was closed externally
      _db.pragma("journal_mode");
      return _db;
    } catch {
      _db = null;
    }
  }
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  db.pragma("journal_mode = WAL");
  db.pragma("query_only = ON");
  _db = db;
  return db;
}

// ---------------------------------------------------------------------------
// Phone / handle helpers  (kept from original, adapted for better-sqlite3)
// ---------------------------------------------------------------------------

function isEmailOrServiceId(identifier: string): boolean {
  return identifier.includes("@") || /^[a-zA-Z]/.test(identifier);
}

function normalizePhoneNumber(phone: string): string[] {
  // Email addresses and service IDs (e.g. "o2Business") are valid handle IDs
  if (isEmailOrServiceId(phone)) {
    return [phone];
  }

  const cleaned = phone.replace(/[^0-9+]/g, "");
  if (!cleaned) return [];

  const formats = new Set<string>();

  // Already in E.164 international format (+49…, +1…, +212…) — use as-is
  if (cleaned.startsWith("+")) {
    formats.add(cleaned);
    return Array.from(formats);
  }

  // German local format: 0163… → +49163…
  if (cleaned.startsWith("0")) {
    formats.add(`+49${cleaned.slice(1)}`);
    formats.add(`+${cleaned}`);
    return Array.from(formats);
  }

  // US 10-digit: 2125551234 → +12125551234
  if (cleaned.length === 10) {
    formats.add(`+1${cleaned}`);
  }

  // US 11-digit starting with 1: 12125551234 → +12125551234
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    formats.add(`+${cleaned}`);
  }

  // Generic fallback: try with + prefix
  formats.add(`+${cleaned}`);

  return Array.from(formats);
}

/**
 * Resolve a user-supplied identifier (phone number, e-mail, service id) to
 * the actual `handle.id` values stored in chat.db.
 *
 * Three-step resolution:
 *  1. Exact match with normalized formats
 *  2. Digits-only substring match (for phone numbers)
 *  3. Case-insensitive LIKE (for email / service IDs)
 */
function resolveHandleIds(db: Database.Database, identifier: string): string[] {
  // Step 1 — exact match against normalized candidates
  const candidates = normalizePhoneNumber(identifier);
  if (candidates.length > 0) {
    const placeholders = candidates.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT DISTINCT id FROM handle WHERE id IN (${placeholders})`)
      .all(...candidates) as { id: string }[];
    if (rows.length > 0) return rows.map((r) => r.id);
  }

  // Step 2 — digits-only substring match
  const digits = identifier.replace(/[^0-9]/g, "");
  if (digits.length >= 6) {
    const rows = db
      .prepare(
        `SELECT DISTINCT id FROM handle
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(id, ' ', ''), '-', ''), '(', ''), ')', '')
               LIKE '%' || ? || '%'`
      )
      .all(digits) as { id: string }[];
    if (rows.length > 0) return rows.map((r) => r.id);
  }

  // Step 3 — case-insensitive email / service-id match
  if (isEmailOrServiceId(identifier)) {
    const rows = db
      .prepare(`SELECT DISTINCT id FROM handle WHERE id LIKE ?`)
      .all(identifier) as { id: string }[];
    if (rows.length > 0) return rows.map((r) => r.id);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Binary attributedBody decoder (NSKeyedArchiver / NSMutableString)
// ---------------------------------------------------------------------------

function extractTextFromAttributedBody(blob: Buffer): string | null {
  if (!blob || blob.length === 0) return null;
  try {
    const nsStringMarker = Buffer.from("NSString");
    let idx = blob.indexOf(nsStringMarker);
    let markerLen = nsStringMarker.length;
    if (idx === -1) {
      const nsMutableMarker = Buffer.from("NSMutableString");
      idx = blob.indexOf(nsMutableMarker);
      markerLen = nsMutableMarker.length;
    }
    if (idx === -1) return null;

    const preambleLen = 5;
    const contentStart = idx + markerLen + preambleLen;
    if (contentStart >= blob.length) return null;

    const content = blob.subarray(contentStart);
    let textLength: number;
    let textStart: number;

    if (content[0] === 0x81) {
      if (content.length < 3) return null;
      textLength = content[1] | (content[2] << 8);
      textStart = 3;
    } else {
      textLength = content[0];
      textStart = 1;
    }

    if (textStart + textLength > content.length) return null;
    const text = content.subarray(textStart, textStart + textLength).toString("utf-8");
    return text.trim() || null;
  } catch {
    return null;
  }
}

function getMessageText(row: { text: string | null; attributedBody: Buffer | null }): string | null {
  if (row.text && row.text !== "\ufffc" && !row.text.startsWith("\ufffc\ufffc")) {
    return row.text;
  }
  if (row.attributedBody) {
    return extractTextFromAttributedBody(row.attributedBody);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Attachment lookup
// ---------------------------------------------------------------------------

function getAttachmentPaths(db: Database.Database, messageRowid: number): string[] {
  try {
    const rows = db
      .prepare(
        `SELECT filename FROM attachment
         JOIN message_attachment_join ON attachment.ROWID = message_attachment_join.attachment_id
         WHERE message_attachment_join.message_id = ?`
      )
      .all(messageRowid) as { filename: string }[];
    return rows.map((r) => r.filename).filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Message interface
// ---------------------------------------------------------------------------

interface Message {
  content: string;
  date: string;
  sender: string;
  is_from_me: boolean;
  group_name?: string;
  chat_id?: string;
  attachments?: string[];
}

// ---------------------------------------------------------------------------
// Row type returned by the base query
// ---------------------------------------------------------------------------

interface MessageRow {
  rowid: number;
  text: string | null;
  attributedBody: Buffer | null;
  is_from_me: number;
  date: string;
  handle: string | null;
  group_name: string | null;
  chat_id: string | null;
  has_attachment: number;
}

// ---------------------------------------------------------------------------
// readMessages — read messages for a given contact, with optional date range
// ---------------------------------------------------------------------------

async function readMessages(
  phoneNumber: string,
  limit = 10,
  startDate?: string,
  endDate?: string
): Promise<Message[]> {
  try {
    const db = getDb();

    // Resolve handle IDs
    const handleIds = resolveHandleIds(db, phoneNumber);
    console.error("Resolved handle IDs:", handleIds);

    if (handleIds.length === 0) {
      console.error("No matching handles found in database for:", phoneNumber);
      return [];
    }

    // Find chats involving this handle (via chat_handle_join)
    const handlePlaceholders = handleIds.map(() => "?").join(",");
    const chatRows = db
      .prepare(
        `SELECT DISTINCT chat_id FROM chat_handle_join
         WHERE handle_id IN (SELECT ROWID FROM handle WHERE id IN (${handlePlaceholders}))`
      )
      .all(...handleIds) as { chat_id: number }[];

    if (chatRows.length === 0) {
      console.error("No chats found for handles:", handleIds);
      return [];
    }

    const chatIds = chatRows.map((r) => r.chat_id);
    const chatPlaceholders = chatIds.map(() => "?").join(",");

    // Build WHERE conditions
    const conditions: string[] = [
      `c.ROWID IN (${chatPlaceholders})`,
      "m.associated_message_type = 0", // filter tapbacks/reactions
    ];
    const params: (string | number)[] = [...chatIds];

    if (startDate) {
      conditions.push(
        "datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') >= ?"
      );
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(
        "datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') <= ?"
      );
      params.push(endDate);
    }

    const sql = `
      SELECT
        m.ROWID as rowid,
        m.text,
        m.attributedBody,
        m.is_from_me,
        datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        h.id as handle,
        c.display_name as group_name,
        c.chat_identifier as chat_id,
        m.cache_has_attachments as has_attachment
      FROM message m
      JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
      JOIN chat c ON cmj.chat_id = c.ROWID
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE ${conditions.join(" AND ")}
      ORDER BY m.date DESC
      LIMIT ?
    `;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as MessageRow[];

    const messages: Message[] = [];
    for (const row of rows) {
      const text = getMessageText(row);
      if (!text) continue; // skip empty / object-replacement-only messages

      const msg: Message = {
        content: text,
        date: row.date,
        sender: row.handle ?? "Unknown",
        is_from_me: Boolean(row.is_from_me),
      };

      if (row.group_name) msg.group_name = row.group_name;
      if (row.chat_id) msg.chat_id = row.chat_id;

      if (row.has_attachment) {
        const attachments = getAttachmentPaths(db, row.rowid);
        if (attachments.length > 0) {
          msg.attachments = attachments;
          msg.content += `\n[Attachments: ${attachments.length}]`;
        }
      }

      messages.push(msg);
    }

    return messages;
  } catch (error) {
    console.error("Error reading messages:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack trace:", error.stack);
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// getUnreadMessages — unread messages across all conversations
// ---------------------------------------------------------------------------

async function getUnreadMessages(limit = 10): Promise<Message[]> {
  try {
    const db = getDb();

    const sql = `
      SELECT
        m.ROWID as rowid,
        m.text,
        m.attributedBody,
        m.is_from_me,
        datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        h.id as handle,
        c.display_name as group_name,
        c.chat_identifier as chat_id,
        m.cache_has_attachments as has_attachment
      FROM message m
      JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
      JOIN chat c ON cmj.chat_id = c.ROWID
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE m.is_from_me = 0
        AND m.is_read = 0
        AND m.associated_message_type = 0
      ORDER BY m.date DESC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(limit) as MessageRow[];

    const messages: Message[] = [];
    for (const row of rows) {
      const text = getMessageText(row);
      if (!text) continue;

      const msg: Message = {
        content: text,
        date: row.date,
        sender: row.handle ?? "Unknown",
        is_from_me: false,
      };

      if (row.group_name) msg.group_name = row.group_name;
      if (row.chat_id) msg.chat_id = row.chat_id;

      if (row.has_attachment) {
        const attachments = getAttachmentPaths(db, row.rowid);
        if (attachments.length > 0) {
          msg.attachments = attachments;
          msg.content += `\n[Attachments: ${attachments.length}]`;
        }
      }

      messages.push(msg);
    }

    return messages;
  } catch (error) {
    console.error("Error reading unread messages:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack trace:", error.stack);
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// sendMessage — JXA-based (unchanged)
// ---------------------------------------------------------------------------

async function sendMessage(phoneNumber: string, message: string) {
  const script = wrapJXAFunction(`
    const Messages = Application("Messages");
    const phoneNumber = ${JSON.stringify(phoneNumber)};
    const messageText = ${JSON.stringify(message)};

    const services = Messages.services.whose({
      serviceType: "iMessage",
    })();
    const targetService = services[0];

    if (!targetService) {
      throw new Error("No iMessage service available");
    }

    const buddies = targetService.buddies.whose({
      handle: phoneNumber,
    })();
    const targetBuddy = buddies[0];

    if (!targetBuddy) {
      throw new Error(\`No Messages buddy found for \${phoneNumber}\`);
    }

    Messages.send(messageText, {
      to: targetBuddy,
    });

    return "";
  `);

  return await executeJXA(script, { parseJSON: false });
}

// ---------------------------------------------------------------------------
// scheduleMessage — JXA-based (unchanged)
// ---------------------------------------------------------------------------

async function scheduleMessage(phoneNumber: string, message: string, scheduledTime: Date) {
  const scheduledMessages = new Map();

  const delay = scheduledTime.getTime() - Date.now();

  if (delay < 0) {
    throw new Error("Cannot schedule message in the past");
  }

  const timeoutId = setTimeout(async () => {
    try {
      await sendMessage(phoneNumber, message);
      scheduledMessages.delete(timeoutId);
    } catch (error) {
      console.error("Failed to send scheduled message:", error);
    }
  }, delay);

  scheduledMessages.set(timeoutId, {
    phoneNumber,
    message,
    scheduledTime,
    timeoutId,
  });

  return {
    id: timeoutId,
    scheduledTime,
    message,
    phoneNumber,
  };
}

export default { sendMessage, readMessages, scheduleMessage, getUnreadMessages };
