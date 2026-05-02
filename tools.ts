import { type Tool } from "@modelcontextprotocol/sdk/types.js";

const RUNTIME_INFO_TOOL: Tool = {
  name: "runtimeInfo",
  description: "Report apple-mcp runtime, build, git, and tool capability information without accessing Apple apps.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const CONTACTS_TOOL: Tool = {
    name: "contacts",
    description: "Search, create, update, and delete contacts in Apple Contacts. Search returns full contact details including ID for follow-up operations.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation to perform",
          enum: ["search", "create", "update", "delete"]
        },
        // Search fields
        name: {
          type: "string",
          description: "Name to search for (partial match). Used with search operation."
        },
        // Create/Update fields
        id: {
          type: "string",
          description: "Contact ID (required for update and delete operations, returned by search and create)"
        },
        firstName: {
          type: "string",
          description: "First name (required for create)"
        },
        lastName: {
          type: "string",
          description: "Last name"
        },
        phones: {
          oneOf: [
            { type: "string", description: "Single phone number (labeled as 'work')" },
            {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Label: work, home, mobile, iPhone, main, other" },
                  value: { type: "string", description: "Phone number" }
                },
                required: ["label", "value"]
              }
            }
          ],
          description: "Phone number(s). String for single work number, or array of {label, value} for multiple."
        },
        emails: {
          oneOf: [
            { type: "string", description: "Single email (labeled as 'work')" },
            {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Label: work, home, other" },
                  value: { type: "string", description: "Email address" }
                },
                required: ["label", "value"]
              }
            }
          ],
          description: "Email address(es). String for single work email, or array of {label, value} for multiple."
        },
        urls: {
          oneOf: [
            { type: "string", description: "Single URL (labeled as 'work')" },
            {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Label: work, home, other" },
                  value: { type: "string", description: "URL" }
                },
                required: ["label", "value"]
              }
            }
          ],
          description: "URL(s). String for single work URL, or array of {label, value} for multiple."
        },
        organization: { type: "string", description: "Organization/company name" },
        jobTitle: { type: "string", description: "Job title" },
        department: { type: "string", description: "Department" },
        birthday: { type: "string", description: "Birthday in ISO date format (YYYY-MM-DD)" },
        note: { type: "string", description: "Notes" },
        addresses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Label: work, home, other" },
              street: { type: "string" },
              city: { type: "string" },
              zip: { type: "string" },
              state: { type: "string" },
              country: { type: "string" }
            }
          },
          description: "Postal addresses with labels"
        },
        // Deprecated fields — kept for backwards compatibility
        phone: {
          type: "string",
          description: "Deprecated: use 'phones' instead. Single phone number (also used for search)."
        },
        email: {
          type: "string",
          description: "Deprecated: use 'emails' instead. Single email address (also used for search)."
        },
        url: {
          type: "string",
          description: "Deprecated: use 'urls' instead. Single URL."
        },
        address: {
          type: "object",
          description: "Deprecated: use 'addresses' instead. Single address.",
          properties: {
            street: { type: "string", description: "Street address" },
            city: { type: "string", description: "City" },
            zip: { type: "string", description: "ZIP/postal code" },
            state: { type: "string", description: "State/province" },
            country: { type: "string", description: "Country" }
          }
        }
      },
      required: ["operation"]
    }
  };
  
  const NOTES_TOOL: Tool = {
    name: "notes", 
    description: "Search, retrieve and create notes in Apple Notes app",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation to perform: 'search', 'list', or 'create'",
          enum: ["search", "list", "create"]
        },
        searchText: {
          type: "string",
          description: "Text to search for in notes (required for search operation)"
        },
        title: {
          type: "string",
          description: "Title of the note to create (required for create operation)"
        },
        body: {
          type: "string",
          description: "Content of the note to create (required for create operation)"
        },
        folderName: {
          type: "string",
          description: "Name of the folder to create the note in (optional for create operation, defaults to 'Claude')"
        }
      },
      required: ["operation"]
    }
  };
  
  const MESSAGES_TOOL: Tool = {
    name: "messages",
    description: "Interact with Apple Messages app - send, read, schedule messages and check unread messages",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation to perform: 'send', 'read', 'schedule', or 'unread'",
          enum: ["send", "read", "schedule", "unread"]
        },
        phoneNumber: {
          type: "string",
          description: "Phone number to send message to (required for send, read, and schedule operations)"
        },
        message: {
          type: "string",
          description: "Message to send (required for send and schedule operations)"
        },
        limit: {
          type: "number",
          description: "Number of messages to read (optional, for read and unread operations)"
        },
        startDate: {
          type: "string",
          description: "Start date filter in ISO format YYYY-MM-DD (optional for read operation)"
        },
        endDate: {
          type: "string",
          description: "End date filter in ISO format YYYY-MM-DD (optional for read operation)"
        },
        scheduledTime: {
          type: "string",
          description: "ISO string of when to send the message (required for schedule operation)"
        }
      },
      required: ["operation"]
    }
  };
  
  const MAIL_TOOL: Tool = {
    name: "mail",
    description: "Interact with Apple Mail app - read unread emails, search emails, set message flags, and send emails. When retrieving messages, clickable message links are automatically generated in the format [Subject](message:%3CMessage-ID%3E). PERFORMANCE: For 'unread', 'messages', 'messageMetadata', 'searchMetadata', and 'setMessageFlag', always specify 'account' and 'mailbox' to avoid scanning all mailboxes across all accounts — this is critical for IMAP/Exchange accounts with hundreds of mailboxes.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation to perform: 'unread', 'latest', 'search', 'searchMetadata', 'setMessageFlag', 'send', 'mailboxes', 'accounts', 'accountSummaries', 'accountDetails', 'mailboxTree', 'mailboxProps', 'messages', or 'messageMetadata'",
          enum: [
            "unread",
            "latest",
            "search",
            "searchMetadata",
            "setMessageFlag",
            "send",
            "mailboxes",
            "accounts",
            "accountSummaries",
            "accountDetails",
            "mailboxTree",
            "mailboxProps",
            "messages",
            "messageMetadata"
          ]
        },
        account: {
          type: "string",
          description: "Email account name to use. Strongly recommended — without it, all accounts are scanned which is slow with multiple IMAP/Exchange accounts. Use 'accounts' operation first to discover account names."
        },
        mailbox: {
          type: "string",
          description: "Mailbox name (e.g. 'INBOX', 'Posteingang'). Without it, only the inbox of each account is checked. Required together with 'account' for the 'messages' operation."
        },
        limit: {
          type: "number",
          description: "Number of emails to retrieve (optional, for unread and search operations)"
        },
        unreadOnly: {
          type: "boolean",
          description: "Only return unread messages (optional for messages operation)"
        },
        startDate: {
          type: "string",
          description: "Start date filter in ISO format (optional for messages operation)"
        },
        endDate: {
          type: "string",
          description: "End date filter in ISO format (optional for messages operation)"
        },
        searchTerm: {
          type: "string",
          description: "Text to search for in emails. Required for search and searchMetadata."
        },
        searchFields: {
          type: "array",
          items: {
            type: "string",
            enum: ["subject", "sender", "attachmentNames"]
          },
          description: "Metadata fields searched by searchMetadata. Defaults to subject and sender. attachmentNames stays metadata-only but may read attachment names."
        },
        to: {
          type: "string",
          description: "Recipient email address (required for send operation)"
        },
        subject: {
          type: "string",
          description: "Email subject (required for send operation)"
        },
        body: {
          type: "string",
          description: "Email body content (required for send operation)"
        },
        cc: {
          type: "string",
          description: "CC email address (optional for send operation)"
        },
        bcc: {
          type: "string",
          description: "BCC email address (optional for send operation)"
        },
        includeAttachments: {
          type: "boolean",
          description: "Include attachment information in the response (optional for messages operation)"
        },
        includeAttachmentNames: {
          type: "boolean",
          description: "Include attachment count and attachment names without message body content (optional for messageMetadata operation)"
        },
        sort: {
          type: "string",
          enum: ["dateSentDesc", "dateSentAsc"],
          description: "Sort order for messageMetadata pagination. Defaults to dateSentDesc."
        },
        cursor: {
          type: "object",
          description: "Cursor returned by a previous messageMetadata call. Used with account, mailbox, and the same filters to fetch the next page.",
          properties: {
            dateSent: {
              type: "string",
              description: "Date of the last message from the previous page."
            },
            mailObjectId: {
              type: "string",
              description: "Apple Mail object id of the last message from the previous page."
            }
          },
          required: ["dateSent"]
        },
        mailObjectId: {
          type: "string",
          description: "Apple Mail object id from messageReference.mailObjectId. Required for setMessageFlag."
        },
        flagColor: {
          type: "string",
          enum: ["none", "red", "orange", "yellow", "green", "blue", "purple", "gray"],
          description: "Apple Mail flag color to set. Use 'none' to clear the flag. Required for setMessageFlag."
        },
        includeHeaders: {
          type: "boolean",
          description: "Include email headers in the response (optional for messages operation)"
        },
        headerFilter: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Specific header names to include (e.g., ['Message-ID', 'In-Reply-To', 'References']). Only used when includeHeaders is true. If not provided, all headers are included."
        }
      },
      required: ["operation"]
    }
  };
  
  const REMINDERS_TOOL: Tool = {
    name: "reminders",
    description: "Search, create, and open reminders in Apple Reminders app",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation to perform: 'list', 'search', 'open', 'create', or 'listById'",
          enum: ["list", "search", "open", "create", "listById"]
        },
        searchText: {
          type: "string",
          description: "Text to search for in reminders (required for search and open operations)"
        },
        name: {
          type: "string",
          description: "Name of the reminder to create (required for create operation)"
        },
        listName: {
          type: "string",
          description: "Name of the list to create the reminder in (optional for create operation)"
        },
        listId: {
          type: "string",
          description: "ID of the list to get reminders from (required for listById operation)"
        },
        props: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Properties to include in the reminders (optional for listById operation)"
        },
        notes: {
          type: "string",
          description: "Additional notes for the reminder (optional for create operation)"
        },
        dueDate: {
          type: "string",
          description: "Due date for the reminder in ISO format (optional for create operation)"
        }
      },
      required: ["operation"]
    }
  };
  
  const WEB_SEARCH_TOOL: Tool = {
    name: "webSearch",
    description: "Search the web using DuckDuckGo and retrieve content from search results",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to look up"
        }
      },
      required: ["query"]
    }
  };
  
const CALENDAR_TOOL: Tool = {
  name: "calendar",
  description: "Search, create, and open calendar events in Apple Calendar app. PERFORMANCE: For 'search' and 'list', always specify 'calendarName' to avoid scanning all calendars — Exchange/IMAP calendars with thousands of events take 30-90s each. Ask the user which calendar to use.",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform: 'search', 'open', 'list', or 'create'",
        enum: ["search", "open", "list", "create"]
      },
      searchText: {
        type: "string",
        description: "Text to search for in event titles, locations, and notes (required for search operation)"
      },
      eventId: {
        type: "string",
        description: "ID of the event to open (required for open operation)"
      },
      limit: {
        type: "number",
        description: "Number of events to retrieve (optional, default 10)"
      },
      fromDate: {
        type: "string",
        description: "Start date for search range in ISO format (optional, default is today)"
      },
      toDate: {
        type: "string",
        description: "End date for search range in ISO format (optional, default is 30 days from now for search, 7 days for list)"
      },
      title: {
        type: "string",
        description: "Title of the event to create (required for create operation)"
      },
      startDate: {
        type: "string",
        description: "Start date/time of the event in ISO format (required for create operation)"
      },
      endDate: {
        type: "string",
        description: "End date/time of the event in ISO format (required for create operation)"
      },
      location: {
        type: "string",
        description: "Location of the event (optional for create operation)"
      },
      notes: {
        type: "string",
        description: "Additional notes for the event (optional for create operation)"
      },
      isAllDay: {
        type: "boolean",
        description: "Whether the event is an all-day event (optional for create operation, default is false)"
      },
      calendarName: {
        type: "string",
        description: "Name of the calendar to search/list/create in (optional, searches all calendars if not specified). Recommended for search/list on Exchange calendars to avoid timeouts."
      }
    },
    required: ["operation"]
  }
};
  
const MAPS_TOOL: Tool = {
  name: "maps",
  description: "Search locations, manage guides, save favorites, and get directions using Apple Maps",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform with Maps",
        enum: ["search", "save", "directions", "pin", "listGuides", "addToGuide", "createGuide"]
      },
      query: {
        type: "string",
        description: "Search query for locations (required for search)"
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (optional for search)"
      },
      name: {
        type: "string",
        description: "Name of the location (required for save and pin)"
      },
      address: {
        type: "string",
        description: "Address of the location (required for save, pin, addToGuide)"
      },
      fromAddress: {
        type: "string",
        description: "Starting address for directions (required for directions)"
      },
      toAddress: {
        type: "string",
        description: "Destination address for directions (required for directions)"
      },
      transportType: {
        type: "string",
        description: "Type of transport to use (optional for directions)",
        enum: ["driving", "walking", "transit"]
      },
      guideName: {
        type: "string",
        description: "Name of the guide (required for createGuide and addToGuide)"
      }
    },
    required: ["operation"]
  }
};

const PHOTOS_TOOL: Tool = {
  name: "photos",
  description: "Search and open photos in Apple Photos app",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform with Photos",
        enum: ["search", "open"],
      },
      query: {
        type: "string",
        description: "Search query for photos (required for search)",
      },
      identifier: {
        type: "string",
        description: "Identifier or name of the photo to open (required for open)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return for search",
      },
    },
    required: ["operation"],
  },
};

const MUSIC_TOOL: Tool = {
  name: "music",
  description: "Search and play songs in Apple Music app",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform with Music",
        enum: ["search", "play"],
      },
      query: {
        type: "string",
        description: "Search query for songs (required for search)",
      },
      identifier: {
        type: "string",
        description: "Persistent ID or name of the song to play (required for play)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return for search",
      },
    },
    required: ["operation"],
  },
};

const tools = [
  RUNTIME_INFO_TOOL,
  CONTACTS_TOOL,
  NOTES_TOOL,
  MESSAGES_TOOL,
  MAIL_TOOL,
  REMINDERS_TOOL,
  WEB_SEARCH_TOOL,
  CALENDAR_TOOL,
  MAPS_TOOL,
  PHOTOS_TOOL,
  MUSIC_TOOL,
];

export default tools;
