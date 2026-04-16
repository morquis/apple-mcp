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
  note?: string;
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
  note?: string;
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
  note?: string;
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
    var record = { id: "", firstName: "", phones: [], emails: [], urls: [], addresses: [] };
    try { record.id = String(p.id()); } catch(e) {}
    try { record.firstName = String(p.firstName()); } catch(e) {}
    try { var ln = p.lastName(); if (ln) record.lastName = String(ln); } catch(e) {}
    try { var org = p.organization(); if (org) record.organization = String(org); } catch(e) {}
    try { var jt = p.jobTitle(); if (jt) record.jobTitle = String(jt); } catch(e) {}
    try { var dep = p.department(); if (dep) record.department = String(dep); } catch(e) {}
    try { var nt = p.note(); if (nt) record.note = String(nt); } catch(e) {}
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
        try { record.phones.push({ label: String(phs[ph].label()), value: String(phs[ph].value()) }); } catch(e) {}
      }
    } catch(e) {}
    try {
      var ems = p.emails();
      for (var em = 0; em < ems.length; em++) {
        try { record.emails.push({ label: String(ems[em].label()), value: String(ems[em].value()) }); } catch(e) {}
      }
    } catch(e) {}
    try {
      var us = p.urls();
      for (var ur = 0; ur < us.length; ur++) {
        try { record.urls.push({ label: String(us[ur].label()), value: String(us[ur].value()) }); } catch(e) {}
      }
    } catch(e) {}
    try {
      var addrs = p.addresses();
      for (var ad = 0; ad < addrs.length; ad++) {
        try {
          var a = {};
          a.label = String(addrs[ad].label());
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

function cnLabelForUserLabel(label: string): string {
  const map: Record<string, string> = {
    work: "_$!<Work>!$_",
    home: "_$!<Home>!$_",
    other: "_$!<Other>!$_",
    mobile: "_$!<Mobile>!$_",
    main: "_$!<Main>!$_",
    iphone: "_$!<Mobile>!$_",
  };
  return map[label.toLowerCase()] ?? "_$!<Work>!$_";
}

function buildCNLabeledValues(
  items: ContactField[],
  wrapValue: string,
): string {
  // wrapValue: JXA expression wrapping the value, e.g. "$.CNPhoneNumber.phoneNumberWithStringValue($(\"{v}\"))"
  // or just "$(\"{v}\")" for emails/urls
  if (items.length === 0) return "$.NSArray.array";
  const elements = items.map(item => {
    const escapedLabel = escapeJXAString(cnLabelForUserLabel(item.label));
    const escapedValue = escapeJXAString(item.value);
    const valueExpr = wrapValue.replace("{v}", escapedValue);
    return `$.CNLabeledValue.alloc.initWithLabelValue($("${escapedLabel}"), ${valueExpr})`;
  });
  return `$.NSArray.arrayWithArray([${elements.join(", ")}])`;
}

function buildCNAddresses(
  addresses: Array<{ label?: string; street?: string; city?: string; zip?: string; state?: string; country?: string }>,
): string {
  if (addresses.length === 0) return "$.NSArray.array";
  const elements = addresses.map(a => {
    const label = escapeJXAString(cnLabelForUserLabel(a.label || "work"));
    const lines: string[] = [];
    lines.push("var _a = $.CNMutablePostalAddress.alloc.init;");
    if (a.street) lines.push(`_a.street = $("${escapeJXAString(a.street)}");`);
    if (a.city) lines.push(`_a.city = $("${escapeJXAString(a.city)}");`);
    if (a.zip) lines.push(`_a.postalCode = $("${escapeJXAString(a.zip)}");`);
    if (a.state) lines.push(`_a.state = $("${escapeJXAString(a.state)}");`);
    if (a.country) lines.push(`_a.country = $("${escapeJXAString(a.country)}");`);
    return `(function() { ${lines.join(" ")} return $.CNLabeledValue.alloc.initWithLabelValue($("${label}"), _a); })()`;
  });
  return `$.NSArray.arrayWithArray([${elements.join(", ")}])`;
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
    const escapedNote = params.note ? escapeJXAString(params.note) : null;

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
      ${escapedNote !== null ? `contact.note = $("${escapedNote}");` : ""}

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
    if (params.note !== undefined) setProps.push(`mc.note = $("${escapeJXAString(params.note)}");`);

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

      // Find the contact by its Scripting Bridge ID
      // The SB ID has the format "UUID:ABPerson" — the CNContact identifier is just the UUID part
      var sbId = "${escapedId}";
      var cnId = sbId.indexOf(":") !== -1 ? sbId.split(":")[0] : sbId;

      var keys = $.NSArray.arrayWithArray([
        $.CNContactGivenNameKey, $.CNContactFamilyNameKey,
        $.CNContactOrganizationNameKey, $.CNContactJobTitleKey,
        $.CNContactDepartmentNameKey, $.CNContactNoteKey,
        $.CNContactPhoneNumbersKey, $.CNContactEmailAddressesKey,
        $.CNContactUrlAddressesKey, $.CNContactPostalAddressesKey,
        $.CNContactBirthdayKey, $.CNContactIdentifierKey
      ]);

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

      var sbId = "${escapedId}";
      var cnId = sbId.indexOf(":") !== -1 ? sbId.split(":")[0] : sbId;

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
