# Apple-MCP Function Catalog

This document provides an overview of the functions implemented in the repository along with example tool calls that can be used when testing an AI model through the Apple‑MCP integration.

## Contacts

### `getAllNumbers`
Returns all contacts and their phone numbers.

**Example**
```json
{"tool":"contacts","name":""}
```

### `findNumber`
Searches contacts by name and returns phone numbers.

**Example**
```json
{"tool":"contacts","name":"John"}
```

### `findContactByPhone`
Finds a contact name by phone number.

## Notes

### `getAllNotes`
Lists every note with its content.

**Example**
```json
{"tool":"notes","operation":"list"}
```

### `findNote`
Searches notes for a text fragment.

**Example**
```json
{"tool":"notes","operation":"search","searchText":"meeting"}
```

### `createNote`
Creates a new note in the specified folder.

**Example**
```json
{"tool":"notes","operation":"create","title":"Todo","body":"- buy milk","folderName":"Claude"}
```

## Messages

### `sendMessage`
Sends an iMessage to the specified phone number.

**Example**
```json
{"tool":"messages","operation":"send","phoneNumber":"+15551234567","message":"Hello"}
```

### `readMessages`
Reads recent messages from a phone number.

**Example**
```json
{"tool":"messages","operation":"read","phoneNumber":"+15551234567","limit":5}
```

### `scheduleMessage`
Schedules a message for future delivery.

**Example**
```json
{"tool":"messages","operation":"schedule","phoneNumber":"+15551234567","message":"Later","scheduledTime":"2030-01-01T10:00:00Z"}
```

### `getUnreadMessages`
Lists unread messages.

**Example**
```json
{"tool":"messages","operation":"unread","limit":5}
```

## Mail

### `getUnreadMails`
Returns unread emails.

**Example**
```json
{"tool":"mail","operation":"unread","limit":5}
```

### `searchMails`
Searches emails by text.

**Example**
```json
{"tool":"mail","operation":"search","searchTerm":"invoice","limit":10}
```

### `sendMail`
Sends an email.

**Example**
```json
{"tool":"mail","operation":"send","to":"user@example.com","subject":"Hi","body":"Hello"}
```

### `getMailboxes`
Lists all mailboxes.

**Example**
```json
{"tool":"mail","operation":"mailboxes"}
```

### `getAccounts`
Lists configured mail accounts.

**Example**
```json
{"tool":"mail","operation":"accounts"}
```

### `getMailboxesForAccount`
Lists mailboxes for an account.

**Example**
```json
{"tool":"mail","operation":"mailboxes","account":"Work"}
```

### `getAccountSummaries`
Retrieves account summaries with type and status.

**Example**
```json
{"tool":"mail","operation":"accountSummaries"}
```

### `getAccountDetails`
Returns detailed settings for an account.

**Example**
```json
{"tool":"mail","operation":"accountDetails","account":"Work"}
```

### `getMailboxProperties`
Shows properties for a mailbox.

**Example**
```json
{"tool":"mail","operation":"mailboxProps","account":"Work","mailbox":"Inbox"}
```

### `getAccountMailboxTree`
Lists mailboxes in a nested structure for an account.

**Example**
```json
{"tool":"mail","operation":"mailboxTree","account":"Work"}
```

### `listMessages`
Lists messages in a mailbox with optional filters.

**Example**
```json
{"tool":"mail","operation":"messages","account":"Work","mailbox":"Inbox","limit":5,"includeAttachments":true}
```

### `createMailbox`
Creates a mailbox.

**Example**
```json
{"tool":"mail","operation":"createMailbox","account":"Work","parentMailbox":null,"name":"Project"}
```

### `deleteMailbox`
Deletes a mailbox.

**Example**
```json
{"tool":"mail","operation":"deleteMailbox","account":"Work","mailbox":"Old"}
```

### `renameMailbox`
Renames a mailbox.

**Example**
```json
{"tool":"mail","operation":"renameMailbox","account":"Work","mailbox":"Old","newName":"Archive"}
```

### `moveMailbox`
Moves a mailbox under another mailbox.

**Example**
```json
{"tool":"mail","operation":"moveMailbox","account":"Work","mailbox":"Project","targetParent":"Archive"}
```

## Reminders

### `getAllLists`
Lists reminder lists.

**Example**
```json
{"tool":"reminders","operation":"list"}
```

### `getRemindersFromListById`
Returns reminders from a list by ID.

**Example**
```json
{"tool":"reminders","operation":"listById","listId":"A1"}
```

### `getAllReminders`
Lists reminders optionally filtered by list name.

**Example**
```json
{"tool":"reminders","operation":"list","listName":"Home"}
```

### `searchReminders`
Searches reminders for text.

**Example**
```json
{"tool":"reminders","operation":"search","searchText":"buy"}
```

### `createReminder`
Creates a reminder with optional due date and notes.

**Example**
```json
{"tool":"reminders","operation":"create","name":"Call mom","dueDate":"2030-01-01","notes":"Her birthday","listName":"Home"}
```

### `openReminder`
Opens the Reminders app focused on a search result.

**Example**
```json
{"tool":"reminders","operation":"open","searchText":"Call mom"}
```

## Calendar

### `searchEvents`
Searches calendar events.

**Example**
```json
{"tool":"calendar","operation":"search","searchText":"conference","fromDate":"2030-01-01","toDate":"2030-12-31"}
```

### `openEvent`
Opens a calendar event by ID.

**Example**
```json
{"tool":"calendar","operation":"open","eventId":"123"}
```

### `getEvents`
Lists upcoming events.

**Example**
```json
{"tool":"calendar","operation":"list","limit":5}
```

### `createEvent`
Creates a calendar event.

**Example**
```json
{"tool":"calendar","operation":"create","title":"Meeting","startDate":"2030-05-01T10:00:00","endDate":"2030-05-01T11:00:00","location":"Office"}
```

## Maps

### `searchLocations`
Searches for locations.

**Example**
```json
{"tool":"maps","operation":"search","query":"coffee","limit":3}
```

### `saveLocation`
Saves a location to favorites.

**Example**
```json
{"tool":"maps","operation":"save","name":"Cafe","address":"1 Infinite Loop"}
```

### `getDirections`
Gets directions between addresses.

**Example**
```json
{"tool":"maps","operation":"directions","fromAddress":"Home","toAddress":"1 Infinite Loop","transportType":"driving"}
```

### `dropPin`
Drops a pin on the map.

**Example**
```json
{"tool":"maps","operation":"pin","name":"Meeting","address":"1 Infinite Loop"}
```

### `listGuides`
Lists existing guides.

**Example**
```json
{"tool":"maps","operation":"listGuides"}
```

### `addToGuide`
Adds a location to a guide.

**Example**
```json
{"tool":"maps","operation":"addToGuide","address":"1 Infinite Loop","guideName":"Trip"}
```

### `createGuide`
Opens the guides view to create a new guide.

**Example**
```json
{"tool":"maps","operation":"createGuide","guideName":"Trip"}
```

## Photos

### `searchPhotos`
Searches photos by name.

**Example**
```json
{"tool":"photos","operation":"search","query":"holiday","limit":5}
```

### `openPhoto`
Opens a photo by identifier or name.

**Example**
```json
{"tool":"photos","operation":"open","identifier":"IMG_0001"}
```

## Music

### `searchSongs`
Searches the music library.

**Example**
```json
{"tool":"music","operation":"search","query":"Beatles","limit":3}
```

### `playSong`
Plays a song by persistent ID or name.

**Example**
```json
{"tool":"music","operation":"play","identifier":"123ABC"}
```

## Web Search

### `webSearch`
Performs a DuckDuckGo search and fetches result contents.

**Example**
```json
{"tool":"webSearch","query":"weather"}
```

