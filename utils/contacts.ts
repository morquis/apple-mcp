import {
  executeJXA,
  JXAConverters,
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

// ---------- Types ----------

export type ContactField = { label: string; value: string };

export type ContactRecord = {
  id: string;
  firstName: string;
  lastName?: string;
  organization?: string;
  jobTitle?: string;
  department?: string;
  birthday?: string;
  // Note: the `note` field is intentionally not part of the public type.
  // Reading/writing CNContact.note requires the Apple-restricted
  // `com.apple.developer.contacts.notes` entitlement (granted only to
  // signed/notarized .app bundles), which is unavailable to MCP-hosted
  // JXA scripts. See https://developer.apple.com/contact/request/contact-note-field
  phones: ContactField[];
  emails: ContactField[];
  urls: ContactField[];
  addresses: Array<{
    label: string;
    street?: string;
    city?: string;
    zip?: string;
    state?: string;
    country?: string;
  }>;
};

export type CreateContactParams = {
  firstName: string;
  lastName?: string;
  phones?: string | ContactField[];
  emails?: string | ContactField[];
  urls?: string | ContactField[];
  organization?: string;
  jobTitle?: string;
  department?: string;
  birthday?: string;
  // `note` intentionally omitted — see ContactRecord comment.
  addresses?: Array<{
    label?: string;
    street?: string;
    city?: string;
    zip?: string;
    state?: string;
    country?: string;
  }>;
};

export type UpdateContactParams = {
  id: string;
  firstName?: string;
  lastName?: string;
  phones?: ContactField[];
  emails?: ContactField[];
  urls?: ContactField[];
  organization?: string;
  jobTitle?: string;
  department?: string;
  birthday?: string;
  // `note` intentionally omitted — see ContactRecord comment.
  addresses?: Array<{
    label?: string;
    street?: string;
    city?: string;
    zip?: string;
    state?: string;
    country?: string;
  }>;
};

export type ContactResult = {
  success: boolean;
  contact?: ContactRecord;
  error?: string;
};

// ---------- Helpers ----------

async function checkContactsAccess(): Promise<boolean> {
  try {
    const script = wrapJXAFunction(`
      const Contacts = Application("Contacts");
      Contacts.people().length;
      return JSON.stringify(true);
    `);

    const hasAccess = await executeJXA<boolean>(script);
    return hasAccess === true;
  } catch (_) {
    throw new Error(
      "Cannot access Contacts app. Please grant access in System Preferences > Security & Privacy > Privacy > Contacts.",
    );
  }
}

/**
 * Generates a JXA expression string that reads a contact person object into a ContactRecord.
 * The returned string is an IIFE that evaluates to a plain object.
 */
function buildReadContactJXA(personVarName: string): string {
  return `(function() {
    var p = ${personVarName};
    var _lblXlat = ${buildSentinelLookupJXA()};
    var record = { id: "", firstName: "", phones: [], emails: [], urls: [], addresses: [] };
    try { record.id = String(p.id()); } catch(e) {}
    try { record.firstName = String(p.firstName()); } catch(e) {}
    try { var ln = p.lastName(); if (ln) record.lastName = String(ln); } catch(e) {}
    try { var org = p.organization(); if (org) record.organization = String(org); } catch(e) {}
    try { var jt = p.jobTitle(); if (jt) record.jobTitle = String(jt); } catch(e) {}
    try { var dep = p.department(); if (dep) record.department = String(dep); } catch(e) {}
    // CNContact.note intentionally not read — see ContactRecord type comment.
    try {
      var bd = p.birthDate();
      if (bd) {
        var d = new Date(bd);
        record.birthday = d.getFullYear() + "-" +
          ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
          ("0" + d.getDate()).slice(-2);
      }
    } catch(e) {}
    try {
      var phs = p.phones();
      for (var ph = 0; ph < phs.length; ph++) {
        try { record.phones.push({ label: _lblXlat(String(phs[ph].label())), value: String(phs[ph].value()) }); } catch(e) {}
      }
    } catch(e) {}
    try {
      var ems = p.emails();
      for (var em = 0; em < ems.length; em++) {
        try { record.emails.push({ label: _lblXlat(String(ems[em].label())), value: String(ems[em].value()) }); } catch(e) {}
      }
    } catch(e) {}
    try {
      var us = p.urls();
      for (var ur = 0; ur < us.length; ur++) {
        try { record.urls.push({ label: _lblXlat(String(us[ur].label())), value: String(us[ur].value()) }); } catch(e) {}
      }
    } catch(e) {}
    try {
      var addrs = p.addresses();
      for (var ad = 0; ad < addrs.length; ad++) {
        try {
          var a = {};
          a.label = _lblXlat(String(addrs[ad].label()));
          try { var v = addrs[ad].street(); if (v) a.street = String(v); } catch(e2) {}
          try { var v = addrs[ad].city(); if (v) a.city = String(v); } catch(e2) {}
          try { var v = addrs[ad].zip(); if (v) a.zip = String(v); } catch(e2) {}
          try { var v = addrs[ad].state(); if (v) a.state = String(v); } catch(e2) {}
          try { var v = addrs[ad].country(); if (v) a.country = String(v); } catch(e2) {}
          record.addresses.push(a);
        } catch(e) {}
      }
    } catch(e) {}
    return record;
  })()`;
}

/**
 * Normalizes a field that can be a string shorthand or an array of {label, value}.
 * String becomes [{label: "work", value: str}].
 */
function normalizeMultiValueField(
  input: string | ContactField[] | undefined,
): ContactField[] | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === "string") return [{ label: "work", value: input }];
  return input;
}

// ---------- Legacy functions (kept for backwards compat) ----------

async function getAllNumbers() {
  try {
    if (!(await checkContactsAccess())) {
      return {};
    }

    const script = wrapJXAFunction(`
      var Contacts = Application("Contacts");
      var names = Contacts.people.name();
      var allPhones = Contacts.people.phones.value();
      var phoneNumbers = {};

      for (var i = 0; i < names.length; i++) {
        var name = names[i] || "";
        var phones = allPhones[i];
        if (!phones || phones.length === 0) continue;

        if (!Object.prototype.hasOwnProperty.call(phoneNumbers, name)) {
          phoneNumbers[name] = [];
        }

        for (var j = 0; j < phones.length; j++) {
          var value = String(phones[j] || "");
          if (value) {
            phoneNumbers[name].push(value);
          }
        }
      }

      return JSON.stringify(phoneNumbers);
    `);

    const nums = await executeJXA<{ [key: string]: string[] }>(script);
    return nums && typeof nums === "object" ? nums : {};
  } catch (error) {
    throw new Error(
      `Error accessing contacts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function findNumber(name: string) {
  try {
    if (!(await checkContactsAccess())) {
      return [];
    }

    const escapedName = escapeJXAString(name);
    const script = wrapJXAFunction(`
      const Contacts = Application("Contacts");
      const searchName = "${escapedName}";

      // First try exact .whose() match (fast)
      var people = Contacts.people.whose({ name: { _contains: searchName } })();

      // If no match, try case-insensitive partial match via firstName/lastName
      if (people.length === 0) {
        people = Contacts.people.whose({
          _or: [
            { firstName: { _contains: searchName } },
            { lastName: { _contains: searchName } },
          ],
        })();
      }

      if (people.length === 0) {
        return JSON.stringify([]);
      }

      var phones = people[0].phones();
      var result = [];

      for (var i = 0; i < phones.length; i++) {
        var value = ${JXAConverters.toString("phones[i].value()", '""')};

        if (value) {
          result.push(value);
        }
      }

      return JSON.stringify(result);
    `);

    return await executeJXA<string[]>(script);
  } catch (error) {
    throw new Error(
      `Error finding contact: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function findContactByPhone(phoneNumber: string): Promise<string | null> {
  try {
    if (!(await checkContactsAccess())) {
      return null;
    }

    const normalizedPhoneNumber = phoneNumber.replace(/[^0-9+]/g, "");
    const escapedPhoneNumber = escapeJXAString(normalizedPhoneNumber);
    const script = wrapJXAFunction(`
      var Contacts = Application("Contacts");
      var searchNumber = "${escapedPhoneNumber}";
      var names = Contacts.people.name();
      var allPhones = Contacts.people.phones.value();

      for (var i = 0; i < names.length; i++) {
        var phones = allPhones[i];
        if (!phones) continue;

        for (var j = 0; j < phones.length; j++) {
          var normalizedNumber = String(phones[j]).replace(/[^0-9+]/g, "");

          if (
            normalizedNumber === searchNumber ||
            normalizedNumber === "+" + searchNumber ||
            normalizedNumber === "+1" + searchNumber ||
            "+1" + normalizedNumber === searchNumber
          ) {
            return JSON.stringify(names[i]);
          }
        }
      }

      return JSON.stringify(null);
    `);

    const result = await executeJXA<string | null>(script);
    return result ?? null;
  } catch (_) {
    return null;
  }
}

// ---------- CNContact label mapping ----------
// The Scripting Bridge silently drops phones on write (macOS bug).
// We use the CNContacts ObjC framework for all writes and the Scripting Bridge for reads.
//
// Apple uses sentinel strings of the form `_$!<...>!$_` for the well-known
// CNLabel* constants (CNLabelWork, CNLabelPhoneNumberMobile,
// CNLabelPhoneNumberWorkFax, etc.). When MCP clients pass user-facing labels
// like "work" or "workFax", we translate to the sentinel for writes; on reads
// we translate back so clients never see the raw sentinel.

const USER_LABEL_TO_SENTINEL: Record<string, string> = {
  work: "_$!<Work>!$_",
  home: "_$!<Home>!$_",
  other: "_$!<Other>!$_",
  mobile: "_$!<Mobile>!$_",
  main: "_$!<Main>!$_",
  iphone: "_$!<Mobile>!$_",
  // Fax labels (CNLabelPhoneNumberWorkFax / HomeFax / OtherFax). Apple has no
  // unqualified "fax" sentinel — we alias bare "fax" to WorkFax because that
  // is by far the most common usage; clients that need home/other fax can
  // pass the qualified label.
  //
  // NOTE: Apple's Scripting Bridge expects the ABPerson-legacy uppercase FAX
  // form (`_$!<WorkFAX>!$_`), not the CN-API form `_$!<WorkFax>!$_`.
  // Empirically verified 2026-05-08: writing the CN form silently falls back
  // to `_$!<EX-AssistantPhone>!$_` (the Assistant label!), while reading a
  // fax that was set manually in Contacts.app returns the uppercase FAX form.
  workfax: "_$!<WorkFAX>!$_",
  homefax: "_$!<HomeFAX>!$_",
  otherfax: "_$!<OtherFAX>!$_",
  fax: "_$!<WorkFAX>!$_",
};

// Inverse map: sentinel → canonical user-facing label. Built once from the
// forward map so both directions stay in sync. We pick a canonical user label
// for each sentinel rather than reverse-mapping every alias (e.g. sentinel
// `_$!<Mobile>!$_` resolves to "mobile", not "iphone"; bare "fax" never
// appears on reads because we always emit "workFax" for `_$!<WorkFAX>!$_`).
//
// We accept BOTH sentinel forms for fax on the read path:
//   - `_$!<WorkFAX>!$_` (uppercase FAX, ABPerson-legacy form Apple actually
//     stores when a user adds a fax in Contacts.app — this is the canonical
//     form going forward)
//   - `_$!<WorkFax>!$_` (camelCase, the CN-API form documented by Apple but
//     not honored by the Scripting Bridge — kept defensively so any contacts
//     written by older builds of this MCP or by other CN-API clients still
//     read back as "workFax" instead of leaking the raw sentinel).
const SENTINEL_TO_USER_LABEL: Record<string, string> = {
  "_$!<Work>!$_": "work",
  "_$!<Home>!$_": "home",
  "_$!<Other>!$_": "other",
  "_$!<Mobile>!$_": "mobile",
  "_$!<Main>!$_": "main",
  "_$!<WorkFAX>!$_": "workFax",
  "_$!<HomeFAX>!$_": "homeFax",
  "_$!<OtherFAX>!$_": "otherFax",
  // Defensive: legacy CN-API form, in case any data was written with it.
  "_$!<WorkFax>!$_": "workFax",
  "_$!<HomeFax>!$_": "homeFax",
  "_$!<OtherFax>!$_": "otherFax",
};

function cnLabelForUserLabel(label: string): string {
  return USER_LABEL_TO_SENTINEL[label.toLowerCase()] ?? "_$!<Work>!$_";
}

/**
 * Translates an Apple CNLabel sentinel (e.g. `_$!<WorkFax>!$_`) back to the
 * canonical user-facing label (`"workFax"`). Unknown labels (custom user
 * labels, unmapped sentinels) are returned unchanged so the client at least
 * sees what Apple delivered instead of a misleading default like "work".
 */
export function userLabelForCNLabel(sentinel: string): string {
  if (!sentinel) return sentinel;
  return SENTINEL_TO_USER_LABEL[sentinel] ?? sentinel;
}

/**
 * Returns a JXA expression that, given a JXA local variable name holding a
 * sentinel string, evaluates to the canonical user-facing label. This must
 * stay in sync with SENTINEL_TO_USER_LABEL — it is embedded into the
 * read-path scripts so the client receives "workFax" instead of
 * "_$!<WorkFax>!$_".
 */
function buildSentinelLookupJXA(): string {
  const entries = Object.entries(SENTINEL_TO_USER_LABEL)
    .map(([sentinel, user]) => `${JSON.stringify(sentinel)}: ${JSON.stringify(user)}`)
    .join(", ");
  return `(function(_lbl) { var _m = {${entries}}; return (_lbl && _m[_lbl]) ? _m[_lbl] : _lbl; })`;
}

function buildCNLabeledValues(
  items: ContactField[],
  wrapValue: string,
): string {
  // wrapValue: JXA expression wrapping the value, e.g. "$.CNPhoneNumber.phoneNumberWithStringValue($(\"{v}\"))"
  // or just "$(\"{v}\")" for emails/urls
  //
  // IMPORTANT: We must NOT pass an array of CNLabeledValue objects to
  // $.NSArray.arrayWithArray([...]). JXA serializes ObjC objects that
  // travel through a JS array literal into __NSDictionaryM, which then
  // fails CNContact's type check with:
  //   "Labeled value {} has incorrect type __NSDictionaryM for key
  //    phoneNumbers. It should be CNLabeledValue."
  // Build an NSMutableArray and use addObject() instead — the bridge
  // keeps the CNLabeledValue identity intact on that path.
  if (items.length === 0) return "$.NSArray.array";
  const adds = items.map(item => {
    const escapedLabel = escapeJXAString(cnLabelForUserLabel(item.label));
    const escapedValue = escapeJXAString(item.value);
    const valueExpr = wrapValue.replace("{v}", escapedValue);
    return `_lv.addObject($.CNLabeledValue.labeledValueWithLabelValue($("${escapedLabel}"), ${valueExpr}));`;
  });
  return `(function() { var _lv = $.NSMutableArray.alloc.init; ${adds.join(" ")} return _lv; })()`;
}

function buildCNAddresses(
  addresses: Array<{ label?: string; street?: string; city?: string; zip?: string; state?: string; country?: string }>,
): string {
  // Same constraint as buildCNLabeledValues — see comment there.
  if (addresses.length === 0) return "$.NSArray.array";
  const adds = addresses.map(a => {
    const label = escapeJXAString(cnLabelForUserLabel(a.label || "work"));
    const lines: string[] = [];
    lines.push("var _a = $.CNMutablePostalAddress.alloc.init;");
    if (a.street) lines.push(`_a.street = $("${escapeJXAString(a.street)}");`);
    if (a.city) lines.push(`_a.city = $("${escapeJXAString(a.city)}");`);
    if (a.zip) lines.push(`_a.postalCode = $("${escapeJXAString(a.zip)}");`);
    if (a.state) lines.push(`_a.state = $("${escapeJXAString(a.state)}");`);
    if (a.country) lines.push(`_a.country = $("${escapeJXAString(a.country)}");`);
    return `(function() { ${lines.join(" ")} _lv.addObject($.CNLabeledValue.labeledValueWithLabelValue($("${label}"), _a)); })();`;
  });
  return `(function() { var _lv = $.NSMutableArray.alloc.init; ${adds.join(" ")} return _lv; })()`;
}

// ---------- CRUD functions ----------

/**
 * Reads back a contact by its Scripting Bridge ID using the Scripting Bridge.
 * Used after CNContact writes to return the persisted state.
 */
async function readContactById(contactId: string): Promise<ContactRecord | null> {
  const escapedId = escapeJXAString(contactId);
  const script = wrapJXAFunction(`
    var Contacts = Application("Contacts");
    var matches = Contacts.people.whose({id: "${escapedId}"})();
    if (matches.length === 0) return JSON.stringify(null);
    var people = matches;
    var i = 0;
    return JSON.stringify(${buildReadContactJXA("people[i]")});
  `);
  return await executeJXA<ContactRecord | null>(script);
}

async function createContact(params: CreateContactParams): Promise<ContactResult> {
  try {
    if (!(await checkContactsAccess())) {
      return { success: false, error: "Cannot access Contacts app" };
    }

    const phones = normalizeMultiValueField(params.phones) ?? [];
    const emails = normalizeMultiValueField(params.emails) ?? [];
    const urls = normalizeMultiValueField(params.urls) ?? [];
    const addresses = params.addresses ?? [];

    const escapedFirstName = escapeJXAString(params.firstName);
    const escapedLastName = params.lastName ? escapeJXAString(params.lastName) : null;
    const escapedOrg = params.organization ? escapeJXAString(params.organization) : null;
    const escapedJobTitle = params.jobTitle ? escapeJXAString(params.jobTitle) : null;
    const escapedDept = params.department ? escapeJXAString(params.department) : null;

    const phonesExpr = buildCNLabeledValues(phones, '$.CNPhoneNumber.phoneNumberWithStringValue($("{v}"))');
    const emailsExpr = buildCNLabeledValues(emails, '$("{v}")');
    const urlsExpr = buildCNLabeledValues(urls, '$("{v}")');
    const addrsExpr = buildCNAddresses(addresses);

    let birthdayCode = "";
    if (params.birthday) {
      const parts = params.birthday.split("-");
      if (parts.length >= 2) {
        const month = parseInt(parts[parts.length === 3 ? 1 : 0], 10);
        const day = parseInt(parts[parts.length === 3 ? 2 : 1], 10);
        const year = parts.length === 3 ? parseInt(parts[0], 10) : 0;
        birthdayCode = `
          var bday = $.NSDateComponents.alloc.init;
          ${year > 0 ? `bday.year = ${year};` : ""}
          bday.month = ${month};
          bday.day = ${day};
          contact.birthday = bday;
        `;
      }
    }

    const script = wrapJXAFunction(`
      ObjC.import("Contacts");

      var store = $.CNContactStore.alloc.init;
      var error = Ref();

      var contact = $.CNMutableContact.alloc.init;
      contact.givenName = $("${escapedFirstName}");
      ${escapedLastName !== null ? `contact.familyName = $("${escapedLastName}");` : ""}
      ${escapedOrg !== null ? `contact.organizationName = $("${escapedOrg}");` : ""}
      ${escapedJobTitle !== null ? `contact.jobTitle = $("${escapedJobTitle}");` : ""}
      ${escapedDept !== null ? `contact.departmentName = $("${escapedDept}");` : ""}
      // CNContact.note intentionally NOT set — requires the Apple-restricted
      // com.apple.developer.contacts.notes entitlement (granted only to
      // signed/notarized .app bundles). Setting it from an MCP-hosted JXA
      // script previously triggered SIGSEGV in osascript on save.

      contact.phoneNumbers = ${phonesExpr};
      contact.emailAddresses = ${emailsExpr};
      contact.urlAddresses = ${urlsExpr};
      contact.postalAddresses = ${addrsExpr};

      ${birthdayCode}

      var saveReq = $.CNSaveRequest.alloc.init;
      saveReq.addContactToContainerWithIdentifier(contact, null);
      var saved = store.executeSaveRequestError(saveReq, error);

      if (!saved) {
        var e = error[0];
        var msg = e ? ObjC.unwrap(e.localizedDescription) : "unknown error";
        return JSON.stringify({ success: false, error: msg });
      }

      // Read back via Scripting Bridge to get the canonical ID and persisted values
      delay(0.3);
      var Contacts = Application("Contacts");
      var searchName = "${escapedLastName !== null ? escapedLastName : escapedFirstName}";
      var matches = Contacts.people.whose({ ${escapedLastName !== null ? "lastName" : "firstName"}: { _equals: searchName } })();

      // Find the one we just created (most recent)
      var bestMatch = null;
      for (var i = 0; i < matches.length; i++) {
        var people = matches;
        var candidate = ${buildReadContactJXA("people[i]")};
        if (candidate.firstName === "${escapedFirstName}") {
          bestMatch = candidate;
          break;
        }
      }

      if (bestMatch) {
        return JSON.stringify({ success: true, contact: bestMatch });
      }

      return JSON.stringify({ success: true, contact: { id: "", firstName: "${escapedFirstName}", phones: [], emails: [], urls: [], addresses: [] } });
    `);

    const result = await executeJXA<ContactResult>(script, { timeout: 15_000 });
    return result ?? { success: false, error: "Failed to create contact: empty response" };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create contact: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function updateContact(params: UpdateContactParams): Promise<ContactResult> {
  try {
    if (!(await checkContactsAccess())) {
      return { success: false, error: "Cannot access Contacts app" };
    }

    const escapedId = escapeJXAString(params.id);

    // Build CNContact property assignments
    const setProps: string[] = [];
    if (params.firstName !== undefined) setProps.push(`mc.givenName = $("${escapeJXAString(params.firstName)}");`);
    if (params.lastName !== undefined) setProps.push(`mc.familyName = $("${escapeJXAString(params.lastName)}");`);
    if (params.organization !== undefined) setProps.push(`mc.organizationName = $("${escapeJXAString(params.organization)}");`);
    if (params.jobTitle !== undefined) setProps.push(`mc.jobTitle = $("${escapeJXAString(params.jobTitle)}");`);
    if (params.department !== undefined) setProps.push(`mc.departmentName = $("${escapeJXAString(params.department)}");`);
    // CNContact.note intentionally NOT writable — see createContact comment.

    let birthdayCode = "";
    if (params.birthday !== undefined) {
      if (params.birthday === "" || params.birthday === null) {
        birthdayCode = "mc.birthday = null;";
      } else {
        const parts = params.birthday.split("-");
        if (parts.length >= 2) {
          const month = parseInt(parts[parts.length === 3 ? 1 : 0], 10);
          const day = parseInt(parts[parts.length === 3 ? 2 : 1], 10);
          const year = parts.length === 3 ? parseInt(parts[0], 10) : 0;
          birthdayCode = `
            var bday = $.NSDateComponents.alloc.init;
            ${year > 0 ? `bday.year = ${year};` : ""}
            bday.month = ${month};
            bday.day = ${day};
            mc.birthday = bday;
          `;
        }
      }
    }

    // Multi-value field replacements
    const multiValueSets: string[] = [];
    if (params.phones !== undefined) {
      multiValueSets.push(`mc.phoneNumbers = ${buildCNLabeledValues(params.phones, '$.CNPhoneNumber.phoneNumberWithStringValue($("{v}"))') };`);
    }
    if (params.emails !== undefined) {
      multiValueSets.push(`mc.emailAddresses = ${buildCNLabeledValues(params.emails, '$("{v}")')};`);
    }
    if (params.urls !== undefined) {
      multiValueSets.push(`mc.urlAddresses = ${buildCNLabeledValues(params.urls, '$("{v}")')};`);
    }
    if (params.addresses !== undefined) {
      multiValueSets.push(`mc.postalAddresses = ${buildCNAddresses(params.addresses)};`);
    }

    const script = wrapJXAFunction(`
      ObjC.import("Contacts");

      var store = $.CNContactStore.alloc.init;
      var error = Ref();

      // The CNContact .identifier returns the FULL string "UUID:ABPerson"
      // (verified empirically: matching by name via
      // CNContact.predicateForContactsMatchingName and reading
      // contact.identifier yields e.g. "AAAF...:ABPerson"). Stripping
      // ":ABPerson" produces a CN identifier that no record has, and the
      // predicate fetch silently returns 0 matches. Pass the SB ID through
      // unchanged.
      var sbId = "${escapedId}";
      var cnId = sbId;

      // Build the keys array via NSMutableArray.addObject — see the comment
      // on buildCNLabeledValues. JS-array literals fed into
      // $.NSArray.arrayWithArray([...]) are coerced to __NSDictionaryM,
      // which silently breaks the predicate fetch (and can cause an empty
      // result that masks the real failure).
      var keys = $.NSMutableArray.alloc.init;
      keys.addObject($.CNContactGivenNameKey);
      keys.addObject($.CNContactFamilyNameKey);
      keys.addObject($.CNContactOrganizationNameKey);
      keys.addObject($.CNContactJobTitleKey);
      keys.addObject($.CNContactDepartmentNameKey);
      // CNContactNoteKey intentionally NOT requested — requires
      // com.apple.developer.contacts.notes entitlement.
      keys.addObject($.CNContactPhoneNumbersKey);
      keys.addObject($.CNContactEmailAddressesKey);
      keys.addObject($.CNContactUrlAddressesKey);
      keys.addObject($.CNContactPostalAddressesKey);
      keys.addObject($.CNContactBirthdayKey);
      keys.addObject($.CNContactIdentifierKey);

      var predicate = $.CNContact.predicateForContactsWithIdentifiers($.NSArray.arrayWithObject($(cnId)));
      var contacts = store.unifiedContactsMatchingPredicateKeysToFetchError(predicate, keys, error);

      if (!contacts || contacts.count === 0) {
        return JSON.stringify({ success: false, error: "Contact not found with ID: " + sbId });
      }

      var mc = contacts.objectAtIndex(0).mutableCopy;

      // Set scalar properties
      ${setProps.join("\n      ")}
      ${birthdayCode}

      // Set multi-value fields
      ${multiValueSets.join("\n      ")}

      var saveReq = $.CNSaveRequest.alloc.init;
      saveReq.updateContact(mc);
      var saved = store.executeSaveRequestError(saveReq, error);

      if (!saved) {
        var e = error[0];
        var msg = e ? ObjC.unwrap(e.localizedDescription) : "unknown error";
        return JSON.stringify({ success: false, error: msg });
      }

      // Read back via Scripting Bridge
      delay(0.3);
      var Contacts = Application("Contacts");
      var matches = Contacts.people.whose({ id: "${escapedId}" })();
      if (matches.length > 0) {
        var people = matches;
        var i = 0;
        var contact = ${buildReadContactJXA("people[i]")};
        return JSON.stringify({ success: true, contact: contact });
      }
      return JSON.stringify({ success: true, contact: { id: "${escapedId}", firstName: "", phones: [], emails: [], urls: [], addresses: [] } });
    `);

    const result = await executeJXA<ContactResult>(script, { timeout: 15_000 });
    return result ?? { success: false, error: "Failed to update contact: empty response" };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update contact: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function deleteContact(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await checkContactsAccess())) {
      return { success: false, error: "Cannot access Contacts app" };
    }

    const escapedId = escapeJXAString(id);

    const script = wrapJXAFunction(`
      ObjC.import("Contacts");

      var store = $.CNContactStore.alloc.init;
      var error = Ref();

      // The CNContact .identifier IS the full "UUID:ABPerson" string —
      // see updateContact for empirical verification. Do NOT strip the
      // suffix; the predicate fetch returns 0 matches if you do.
      var sbId = "${escapedId}";
      var cnId = sbId;

      var keys = $.NSArray.arrayWithObject($.CNContactIdentifierKey);
      var predicate = $.CNContact.predicateForContactsWithIdentifiers($.NSArray.arrayWithObject($(cnId)));
      var contacts = store.unifiedContactsMatchingPredicateKeysToFetchError(predicate, keys, error);

      if (!contacts || contacts.count === 0) {
        return JSON.stringify({ success: false, error: "Contact not found with ID: " + sbId });
      }

      var mc = contacts.objectAtIndex(0).mutableCopy;
      var saveReq = $.CNSaveRequest.alloc.init;
      saveReq.deleteContact(mc);
      var saved = store.executeSaveRequestError(saveReq, error);

      if (!saved) {
        var e = error[0];
        var msg = e ? ObjC.unwrap(e.localizedDescription) : "unknown error";
        return JSON.stringify({ success: false, error: msg });
      }

      return JSON.stringify({ success: true });
    `);

    const result = await executeJXA<{ success: boolean; error?: string }>(script);
    return result ?? { success: false, error: "Failed to delete contact: empty response" };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete contact: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function searchContacts(params: {
  name?: string;
  email?: string;
  phone?: string;
}): Promise<ContactRecord[]> {
  try {
    if (!(await checkContactsAccess())) {
      return [];
    }

    const readContactJXA = buildReadContactJXA("people[i]");

    if (params.name) {
      const escapedName = escapeJXAString(params.name);
      const script = wrapJXAFunction(`
        var Contacts = Application("Contacts");
        var searchName = "${escapedName}";

        // First try .whose() match on full name
        var people = Contacts.people.whose({ name: { _contains: searchName } })();

        // If no match, try firstName/lastName
        if (people.length === 0) {
          people = Contacts.people.whose({
            _or: [
              { firstName: { _contains: searchName } },
              { lastName: { _contains: searchName } },
            ],
          })();
        }

        var results = [];
        var limit = Math.min(people.length, 50);
        for (var i = 0; i < limit; i++) {
          try {
            results.push(${readContactJXA});
          } catch(e) {}
        }
        return JSON.stringify(results);
      `);

      const results = await executeJXA<ContactRecord[]>(script);
      return results ?? [];
    }

    if (params.email) {
      const escapedEmail = escapeJXAString(params.email.toLowerCase());
      const script = wrapJXAFunction(`
        var Contacts = Application("Contacts");
        var searchEmail = "${escapedEmail}";
        var allPeople = Contacts.people();
        var people = [];

        for (var j = 0; j < allPeople.length; j++) {
          try {
            var ems = allPeople[j].emails();
            for (var k = 0; k < ems.length; k++) {
              try {
                if (String(ems[k].value()).toLowerCase().indexOf(searchEmail) !== -1) {
                  people.push(allPeople[j]);
                  break;
                }
              } catch(e) {}
            }
          } catch(e) {}
          if (people.length >= 50) break;
        }

        var results = [];
        for (var i = 0; i < people.length; i++) {
          try {
            results.push(${readContactJXA});
          } catch(e) {}
        }
        return JSON.stringify(results);
      `);

      const results = await executeJXA<ContactRecord[]>(script);
      return results ?? [];
    }

    if (params.phone) {
      const normalizedSearch = params.phone.replace(/[^0-9+]/g, "");
      const escapedPhone = escapeJXAString(normalizedSearch);
      const script = wrapJXAFunction(`
        var Contacts = Application("Contacts");
        var searchNumber = "${escapedPhone}";
        var allPeople = Contacts.people();
        var people = [];

        for (var j = 0; j < allPeople.length; j++) {
          try {
            var phs = allPeople[j].phones();
            for (var k = 0; k < phs.length; k++) {
              try {
                var normalized = String(phs[k].value()).replace(/[^0-9+]/g, "");
                if (
                  normalized === searchNumber ||
                  normalized === "+" + searchNumber ||
                  normalized === "+1" + searchNumber ||
                  "+1" + normalized === searchNumber ||
                  normalized.indexOf(searchNumber) !== -1 ||
                  searchNumber.indexOf(normalized) !== -1
                ) {
                  people.push(allPeople[j]);
                  break;
                }
              } catch(e) {}
            }
          } catch(e) {}
          if (people.length >= 50) break;
        }

        var results = [];
        for (var i = 0; i < people.length; i++) {
          try {
            results.push(${readContactJXA});
          } catch(e) {}
        }
        return JSON.stringify(results);
      `);

      const results = await executeJXA<ContactRecord[]>(script);
      return results ?? [];
    }

    // No search criteria — return empty
    return [];
  } catch (error) {
    throw new Error(
      `Error searching contacts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export default {
  getAllNumbers,
  findNumber,
  findContactByPhone,
  createContact,
  updateContact,
  deleteContact,
  searchContacts,
};
