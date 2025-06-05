# Apple Map Mail Integration Plan

This document outlines the steps required to implement mailbox reading functions for the **apple-map** tool.  Requirements are derived from `.reference/apple-mail-requirements.md` and the `Mail.sdef` scripting definition.

## 1. Review of Current Implementation
- `utils/mail.ts` includes helper functions to communicate with Mail.app.
  - `getAccounts()` – returns a list of account names.
  - `getMailboxes()` – returns a flat list of mailbox names.
  - `getMailboxesForAccount(account)` – returns mailbox names for a given account.
  - `getUnreadMails`, `searchMails`, `sendMail` – basic message operations.
- **Implemented reading helpers**
  - `getAccountSummaries()` – structured list of accounts with id, type and addresses.
  - `getAccountDetails()` – detailed server settings for one account.
  - `getAccountMailboxTree()` – nested mailbox hierarchy per account.
  - `getMailboxProperties()` – metadata for a single mailbox.
  - `listMessages()` – list messages in a specific mailbox with filters.

## 2. Required Reading Features
1. **List All Accounts (REQ-ACC-001)**
   - Include account type, id, email addresses, enabled status.
2. **Get Account Details (REQ-ACC-002)**
   - Server settings (hostname, port, SSL), authentication, full name, local storage paths, associated SMTP account.
3. **Get Account Folder Structure (REQ-ACC-003 / REQ-MBX-001)**
   - Return nested folders for each account including system mailboxes and user folders.
4. **Get Mailbox Properties (REQ-MBX-002)**
   - Name, unread count, total count, parent mailbox, account association, mailbox type.
5. **List Messages in Mailbox (REQ-MSG-001)**
   - Fetch messages for a specific mailbox with filtering options (limit, unread only, date range).

## 3. Implementation Tasks
1. **Extend Account Listing**
   - Create `getAccountSummaries()` in `utils/mail.ts`.
   - Use AppleScript per `Mail.sdef` to iterate `accounts` collection and read properties: `account type`, `email addresses`, `enabled`, `identifier` etc.
   - Return array of objects:
     ```ts
     interface MailAccount {
       name: string;
       id: string;
       type: string;
       addresses: string[];
       enabled: boolean;
     }
     ```
2. **Account Detail Retrieval**
   - Implement `getAccountDetails(accountName: string)`.
   - Query additional properties (`server name`, `port`, `uses ssl`, `authentication`, `account directory`, `full name`, `delivery account`).
   - Surface errors when account is not found.
3. **Nested Mailbox Structure**
   - Add `getAccountMailboxTree(accountName: string)` that returns mailbox objects with child mailboxes recursively.
   - Use AppleScript: `every mailbox of <account>` and check `mailboxes` element for subfolders.
   - Define:
     ```ts
     interface MailboxInfo {
       name: string;
       id: string;
       unreadCount: number;
       totalCount: number;
       children: MailboxInfo[];
     }
     ```
4. **Mailbox Property Helper**
   - Create `getMailboxProperties(accountName: string, mailboxName: string)` using `messages of mailbox` to count totals and `unread count`.
5. **Message Listing by Mailbox**
   - Implement `listMessages(accountName: string, mailboxName: string, opts)` to fetch messages with optional filters (limit, unread only).
   - Reuse existing parsing logic from `getUnreadMails`/`searchMails` but scoped to specified mailbox.

## 4. Future Steps
- None. Write operations and detailed message retrieval are now implemented.

## 5. Status

All reading functions described above have been implemented in `utils/mail.ts`.
Key implementations can be found at:

- `getAccountSummaries` – account list with details【F:utils/mail.ts†L694-L735】
- `getAccountDetails` – server settings etc.【F:utils/mail.ts†L736-L773】
- `getMailboxProperties` – mailbox metadata helper【F:utils/mail.ts†L769-L817】
- `getAccountMailboxTree` – recursive mailbox listing【F:utils/mail.ts†L824-L879】
- `listMessages` – list messages within a mailbox【F:utils/mail.ts†L880-L938】
- `listMessages` now supports attachments and header retrieval【F:utils/mail.ts†L880-L938】

With these functions available through the `mail` tool (see `index.ts` around line 620), the Apple Map integration can read accounts, mailbox structures and messages. Write operations and detailed message retrieval (attachments and headers) have been added for more advanced workflows.

