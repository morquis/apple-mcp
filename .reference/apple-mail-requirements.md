# Apple Mail Integration Requirements Document

## 1. Document Overview

### 1.1 Purpose
This document defines the functional requirements for an Apple Mail integration system focused on email management, organization, and analysis capabilities. The system aims to provide programmatic access to Apple Mail for cleaning up email structure and analyzing email content.

### 1.2 Scope
- **In Scope**: Email reading, organization, folder management, rule creation, and email analysis
- **Out of Scope**: Email composition, sending, or reply functionality

### 1.3 Definitions
- **Mailbox**: A folder containing email messages (Apple Mail terminology)
- **Smart Mailbox**: A virtual folder showing emails matching specific criteria
- **Rule**: Automated action triggered by incoming email conditions

## 2. Functional Requirements

### 2.1 Account Management

#### REQ-ACC-001: List All Accounts
- **Description**: Retrieve a list of all configured email accounts
- **Details**: Should include POP, IMAP, iCloud, and Exchange accounts
- **Data Required**: 
  - Account name
  - Account type (POP/IMAP/iCloud/Exchange)
  - Account ID
  - Email addresses associated with account
  - Enabled/disabled status

#### REQ-ACC-002: Get Account Details
- **Description**: Retrieve detailed information for a specific account
- **Details**: 
  - Server settings (hostname, port, SSL status)
  - Authentication method
  - Full name configured
  - Storage locations on disk
  - Delivery account (SMTP server) association

#### REQ-ACC-003: Get Account Folder Structure
- **Description**: Retrieve the complete folder hierarchy for an account
- **Details**: Should return nested folder structure with parent-child relationships

### 2.2 Mailbox (Folder) Management

#### REQ-MBX-001: List Mailboxes
- **Description**: Get all mailboxes/folders within an account or container
- **Details**: 
  - Support for nested folder structures
  - Include system folders (Inbox, Sent, Trash, Drafts, Junk)
  - Include custom user-created folders

#### REQ-MBX-002: Get Mailbox Properties
- **Description**: Retrieve mailbox metadata
- **Data Required**:
  - Mailbox name
  - Unread message count
  - Total message count
  - Parent mailbox (if nested)
  - Associated account
  - Mailbox type (standard/smart)

#### REQ-MBX-003: Create Mailbox
- **Description**: Create new mailboxes/folders
- **Parameters**:
  - Name
  - Parent mailbox (for nested folders)
  - Account association

#### REQ-MBX-004: Delete Mailbox
- **Description**: Delete existing mailboxes
- **Constraints**: System mailboxes should be protected from deletion

#### REQ-MBX-005: Rename Mailbox
- **Description**: Rename existing mailboxes
- **Parameters**: 
  - Current name/ID
  - New name

#### REQ-MBX-006: Move Mailbox
- **Description**: Move mailbox to different parent or account
- **Parameters**:
  - Source mailbox
  - Target parent/location

### 2.3 Smart Mailbox Management

#### REQ-SMB-001: List Smart Mailboxes
- **Description**: Retrieve all smart mailboxes
- **Details**: Include criteria/rules for each smart mailbox

#### REQ-SMB-002: Create Smart Mailbox
- **Description**: Create new smart mailboxes with criteria
- **Parameters**:
  - Name
  - Search criteria (multiple conditions)
  - Included mailboxes scope
  - AND/OR logic for multiple criteria

#### REQ-SMB-003: Edit Smart Mailbox
- **Description**: Modify existing smart mailbox criteria
- **Parameters**:
  - Smart mailbox identifier
  - New criteria/conditions
  - New name (optional)

#### REQ-SMB-004: Delete Smart Mailbox
- **Description**: Remove smart mailboxes
- **Parameters**: Smart mailbox identifier

### 2.4 Message Operations

#### REQ-MSG-001: List Messages in Mailbox
- **Description**: Retrieve messages from a specific mailbox with filtering
- **Filter Options**:
  - Number of newest messages (e.g., last 50)
  - Unread only
  - Date range
  - Flagged status
  - Has attachments
  - From specific sender
  - Subject contains text
- **Sort Options**:
  - Date (ascending/descending)
  - Sender
  - Subject
  - Size

#### REQ-MSG-002: Get Message Content
- **Description**: Retrieve full message content
- **Data Required**:
  - Plain text content
  - HTML content (if available)
  - Rich text with formatting

#### REQ-MSG-003: Get Message Metadata
- **Description**: Retrieve message headers and properties
- **Data Required**:
  - Message ID
  - Subject
  - From/To/CC/BCC recipients
  - Date sent/received
  - Size
  - Read/unread status
  - Flagged status and flag color
  - Junk mail status
  - All headers (optional)
  - Reply-to address
  - Message source (raw)

#### REQ-MSG-004: Get Message Attachments
- **Description**: Access message attachments
- **Data Required**:
  - Attachment name
  - MIME type
  - File size
  - Download status
  - Ability to save attachment to disk

#### REQ-MSG-005: Move Messages
- **Description**: Move messages between mailboxes
- **Parameters**:
  - Source message(s)
  - Target mailbox
  - Support bulk operations

#### REQ-MSG-006: Delete Messages
- **Description**: Delete messages
- **Options**:
  - Move to trash
  - Permanent deletion
  - Support bulk operations

#### REQ-MSG-007: Update Message Status
- **Description**: Modify message properties
- **Capabilities**:
  - Mark as read/unread
  - Flag/unflag with color
  - Mark as junk/not junk

### 2.5 Rule Management

#### REQ-RUL-001: List Rules
- **Description**: Retrieve all mail rules
- **Data Required**:
  - Rule name
  - Enabled/disabled status
  - Conditions
  - Actions
  - Stop processing flag

#### REQ-RUL-002: Create Rule
- **Description**: Create new mail rules
- **Parameters**:
  - Name
  - Conditions (multiple with AND/OR logic)
  - Actions (move, copy, mark, forward, etc.)
  - Enabled status
  - Stop evaluating subsequent rules flag

#### REQ-RUL-003: Edit Rule
- **Description**: Modify existing rules
- **Capabilities**:
  - Change conditions
  - Change actions
  - Enable/disable
  - Rename

#### REQ-RUL-004: Delete Rule
- **Description**: Remove rules
- **Parameters**: Rule identifier

#### REQ-RUL-005: Rule Conditions Support
- **Required Condition Types**:
  - From/To/CC headers
  - Subject contains
  - Message content contains
  - Has attachments
  - Date received
  - Size thresholds
  - Sender in contacts
  - Account received in

#### REQ-RUL-006: Rule Actions Support
- **Required Action Types**:
  - Move to mailbox
  - Copy to mailbox
  - Mark as read
  - Flag with color
  - Delete message
  - Forward to address
  - Run AppleScript
  - Play sound

### 2.6 Email Analysis Features

#### REQ-ANL-001: Summarize Email Content
- **Description**: Generate summaries of email messages
- **Capabilities**:
  - Single email summary
  - Thread/conversation summary
  - Folder digest summary

#### REQ-ANL-002: Extract Action Items
- **Description**: Identify and extract tasks/action items from emails
- **Output**: Structured list of identified tasks with context

#### REQ-ANL-003: Categorize Emails
- **Description**: Automatically categorize emails
- **Categories Examples**:
  - Work/Personal
  - Project-based
  - Urgency levels
  - Type (newsletter, notification, conversation, etc.)

#### REQ-ANL-004: Email Pattern Analysis
- **Description**: Analyze email patterns for insights
- **Insights**:
  - Most frequent senders
  - Email volume trends
  - Response time patterns
  - Unread email aging

#### REQ-ANL-005: Priority Scoring
- **Description**: Score emails by importance/priority
- **Factors**:
  - Sender importance
  - Keywords in subject/content
  - Time sensitivity
  - Thread activity

#### REQ-ANL-006: Bulk Analysis
- **Description**: Analyze multiple emails collectively
- **Use Cases**:
  - "Analyze all emails in @Action folder and create prioritized work plan"
  - "Find all emails requiring response"
  - "Identify emails that can be archived"

### 2.7 Search and Query

#### REQ-SRH-001: Search Messages
- **Description**: Search across mailboxes
- **Search Criteria**:
  - Full text search
  - Header-specific search
  - Date ranges
  - Attachment names
  - Complex queries with AND/OR/NOT logic

#### REQ-SRH-002: Save Searches
- **Description**: Save frequently used searches
- **Details**: Convert to smart mailbox creation where possible

## 3. Non-Functional Requirements

### 3.1 Performance
- Bulk operations should handle 1000+ messages efficiently
- Search operations should return results within 2 seconds for typical queries
- Background analysis should not block UI operations

### 3.2 Data Integrity
- No email data loss during operations
- Maintain message flags and metadata during moves
- Preserve folder hierarchy during operations

### 3.3 Error Handling
- Graceful handling of offline accounts
- Clear error messages for failed operations
- Rollback capability for bulk operations

### 3.4 Compatibility
- Support Mail.app on macOS 11 (Big Sur) and later
- Handle different account types appropriately
- Work with existing Mail plugins/extensions

## 4. Technical Constraints

### 4.1 Apple Mail Limitations
- Smart mailbox creation may have API limitations
- Some operations may require Mail.app to be running
- Certain metadata may be read-only

### 4.2 Security
- Respect macOS privacy settings
- Handle email credentials securely
- No unauthorized access to email content

## 5. Use Case Examples

### 5.1 Email Cleanup Workflow
1. Analyze inbox for old, unread emails
2. Categorize by sender and importance
3. Create rules for future similar emails
4. Move low-priority emails to archive folders
5. Generate summary report of actions taken

### 5.2 Project Email Organization
1. Search for all emails related to specific project
2. Create project-specific folder structure
3. Move related emails to appropriate folders
4. Set up rules for future project emails
5. Create smart folder for active project items

### 5.3 Action Item Extraction
1. Scan @Action smart folder
2. Extract all action items from emails
3. Prioritize based on sender, date, and content
4. Generate task list with email references
5. Mark processed emails with specific flag

## 6. Future Considerations

- Integration with calendar for meeting-related emails
- Export capabilities (PDF, archive formats)
- Batch processing scheduler
- Email template detection
- Automated response suggestions