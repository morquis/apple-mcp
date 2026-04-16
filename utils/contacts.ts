import {
  executeJXA,
  JXAConverters,
  wrapJXAFunction,
} from "../core/jxa-bridge.ts";

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
      for (var i = 0; i < phs.length; i++) {
        try { record.phones.push({ label: String(phs[i].label()), value: String(phs[i].value()) }); } catch(e) {}
      }
    } catch(e) {}
    try {
      var ems = p.emails();
      for (var i = 0; i < ems.length; i++) {
        try { record.emails.push({ label: String(ems[i].label()), value: String(ems[i].value()) }); } catch(e) {}
      }
    } catch(e) {}
    try {
      var us = p.urls();
      for (var i = 0; i < us.length; i++) {
        try { record.urls.push({ label: String(us[i].label()), value: String(us[i].value()) }); } catch(e) {}
      }
    } catch(e) {}
    try {
      var addrs = p.addresses();
      for (var i = 0; i < addrs.length; i++) {
        try {
          var a = {};
          a.label = String(addrs[i].label());
          try { var v = addrs[i].street(); if (v) a.street = String(v); } catch(e2) {}
          try { var v = addrs[i].city(); if (v) a.city = String(v); } catch(e2) {}
          try { var v = addrs[i].zip(); if (v) a.zip = String(v); } catch(e2) {}
          try { var v = addrs[i].state(); if (v) a.state = String(v); } catch(e2) {}
          try { var v = addrs[i].country(); if (v) a.country = String(v); } catch(e2) {}
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

// ---------- CRUD functions ----------

async function createContact(params: CreateContactParams): Promise<ContactResult> {
  try {
    if (!(await checkContactsAccess())) {
      return { success: false, error: "Cannot access Contacts app" };
    }

    // Normalize multi-value fields
    const phones = normalizeMultiValueField(params.phones);
    const emails = normalizeMultiValueField(params.emails);
    const urls = normalizeMultiValueField(params.urls);
    const addresses = params.addresses;

    // Escape simple string fields
    const escapedFirstName = escapeJXAString(params.firstName);
    const escapedLastName = params.lastName ? escapeJXAString(params.lastName) : null;
    const escapedOrganization = params.organization ? escapeJXAString(params.organization) : null;
    const escapedJobTitle = params.jobTitle ? escapeJXAString(params.jobTitle) : null;
    const escapedDepartment = params.department ? escapeJXAString(params.department) : null;
    const escapedNote = params.note ? escapeJXAString(params.note) : null;
    const escapedBirthday = params.birthday ? escapeJXAString(params.birthday) : null;

    // Build JXA array literals for multi-value fields
    const phonesJXA = phones
      ? phones.map(p => `{ label: "${escapeJXAString(p.label)}", value: "${escapeJXAString(p.value)}" }`).join(", ")
      : "";
    const emailsJXA = emails
      ? emails.map(e => `{ label: "${escapeJXAString(e.label)}", value: "${escapeJXAString(e.value)}" }`).join(", ")
      : "";
    const urlsJXA = urls
      ? urls.map(u => `{ label: "${escapeJXAString(u.label)}", value: "${escapeJXAString(u.value)}" }`).join(", ")
      : "";
    const addressesJXA = addresses
      ? addresses.map(a => {
          const label = a.label || "work";
          const parts: string[] = [];
          if (a.street) parts.push(`street: "${escapeJXAString(a.street)}"`);
          if (a.city) parts.push(`city: "${escapeJXAString(a.city)}"`);
          if (a.zip) parts.push(`zip: "${escapeJXAString(a.zip)}"`);
          if (a.state) parts.push(`state: "${escapeJXAString(a.state)}"`);
          if (a.country) parts.push(`country: "${escapeJXAString(a.country)}"`);
          return `{ label: "${escapeJXAString(label)}", ${parts.join(", ")} }`;
        }).join(", ")
      : "";

    const lastNameExpr = escapedLastName === null ? "null" : `"${escapedLastName}"`;
    const orgExpr = escapedOrganization === null ? "null" : `"${escapedOrganization}"`;
    const jobTitleExpr = escapedJobTitle === null ? "null" : `"${escapedJobTitle}"`;
    const deptExpr = escapedDepartment === null ? "null" : `"${escapedDepartment}"`;
    const noteExpr = escapedNote === null ? "null" : `"${escapedNote}"`;
    const birthdayExpr = escapedBirthday === null ? "null" : `"${escapedBirthday}"`;

    const script = wrapJXAFunction(`
      var Contacts = Application("Contacts");

      var personProps = { firstName: "${escapedFirstName}" };
      var lastName = ${lastNameExpr};
      if (lastName) personProps.lastName = lastName;

      var person = Contacts.Person(personProps);
      Contacts.people.push(person);

      // Multi-value fields: phones
      var phoneEntries = [${phonesJXA}];
      for (var i = 0; i < phoneEntries.length; i++) {
        person.phones.push(Contacts.Phone({ label: phoneEntries[i].label, value: phoneEntries[i].value }));
      }

      // Multi-value fields: emails
      var emailEntries = [${emailsJXA}];
      for (var i = 0; i < emailEntries.length; i++) {
        person.emails.push(Contacts.Email({ label: emailEntries[i].label, value: emailEntries[i].value }));
      }

      // Multi-value fields: urls
      var urlEntries = [${urlsJXA}];
      for (var i = 0; i < urlEntries.length; i++) {
        person.urls.push(Contacts.Url({ label: urlEntries[i].label, value: urlEntries[i].value }));
      }

      // Multi-value fields: addresses
      var addrEntries = [${addressesJXA}];
      for (var i = 0; i < addrEntries.length; i++) {
        var addrProps = {};
        if (addrEntries[i].street) addrProps.street = addrEntries[i].street;
        if (addrEntries[i].city) addrProps.city = addrEntries[i].city;
        if (addrEntries[i].zip) addrProps.zip = addrEntries[i].zip;
        if (addrEntries[i].state) addrProps.state = addrEntries[i].state;
        if (addrEntries[i].country) addrProps.country = addrEntries[i].country;
        person.addresses.push(Contacts.Address(addrProps));
      }

      // Simple string properties
      var organization = ${orgExpr};
      if (organization) person.organization = organization;

      var jobTitle = ${jobTitleExpr};
      if (jobTitle) person.jobTitle = jobTitle;

      var department = ${deptExpr};
      if (department) person.department = department;

      var note = ${noteExpr};
      if (note) person.note = note;

      // Birthday
      var birthday = ${birthdayExpr};
      if (birthday) {
        person.birthDate = new Date(birthday);
      }

      Contacts.save();

      // Read back persisted values
      var contact = ${buildReadContactJXA("person")};
      return JSON.stringify({ success: true, contact: contact });
    `);

    const result = await executeJXA<ContactResult>(script);
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

    // Build set-property statements
    const setStatements: string[] = [];

    if (params.firstName !== undefined) {
      setStatements.push(`person.firstName = "${escapeJXAString(params.firstName)}";`);
    }
    if (params.lastName !== undefined) {
      setStatements.push(`person.lastName = "${escapeJXAString(params.lastName)}";`);
    }
    if (params.organization !== undefined) {
      setStatements.push(`person.organization = "${escapeJXAString(params.organization)}";`);
    }
    if (params.jobTitle !== undefined) {
      setStatements.push(`person.jobTitle = "${escapeJXAString(params.jobTitle)}";`);
    }
    if (params.department !== undefined) {
      setStatements.push(`person.department = "${escapeJXAString(params.department)}";`);
    }
    if (params.note !== undefined) {
      setStatements.push(`person.note = "${escapeJXAString(params.note)}";`);
    }
    if (params.birthday !== undefined) {
      if (params.birthday === "" || params.birthday === null) {
        setStatements.push(`person.birthDate = null;`);
      } else {
        setStatements.push(`person.birthDate = new Date("${escapeJXAString(params.birthday)}");`);
      }
    }

    // Build multi-value field replacement code
    const multiValueCode: string[] = [];

    if (params.phones !== undefined) {
      const phonesJXA = params.phones
        .map(p => `{ label: "${escapeJXAString(p.label)}", value: "${escapeJXAString(p.value)}" }`)
        .join(", ");
      multiValueCode.push(`
        var existingPhones = person.phones();
        for (var i = existingPhones.length - 1; i >= 0; i--) { Contacts.delete(existingPhones[i]); }
        var newPhones = [${phonesJXA}];
        for (var i = 0; i < newPhones.length; i++) {
          person.phones.push(Contacts.Phone({ label: newPhones[i].label, value: newPhones[i].value }));
        }
      `);
    }

    if (params.emails !== undefined) {
      const emailsJXA = params.emails
        .map(e => `{ label: "${escapeJXAString(e.label)}", value: "${escapeJXAString(e.value)}" }`)
        .join(", ");
      multiValueCode.push(`
        var existingEmails = person.emails();
        for (var i = existingEmails.length - 1; i >= 0; i--) { Contacts.delete(existingEmails[i]); }
        var newEmails = [${emailsJXA}];
        for (var i = 0; i < newEmails.length; i++) {
          person.emails.push(Contacts.Email({ label: newEmails[i].label, value: newEmails[i].value }));
        }
      `);
    }

    if (params.urls !== undefined) {
      const urlsJXA = params.urls
        .map(u => `{ label: "${escapeJXAString(u.label)}", value: "${escapeJXAString(u.value)}" }`)
        .join(", ");
      multiValueCode.push(`
        var existingUrls = person.urls();
        for (var i = existingUrls.length - 1; i >= 0; i--) { Contacts.delete(existingUrls[i]); }
        var newUrls = [${urlsJXA}];
        for (var i = 0; i < newUrls.length; i++) {
          person.urls.push(Contacts.Url({ label: newUrls[i].label, value: newUrls[i].value }));
        }
      `);
    }

    if (params.addresses !== undefined) {
      const addressesJXA = params.addresses
        .map(a => {
          const label = a.label || "work";
          const parts: string[] = [];
          if (a.street) parts.push(`street: "${escapeJXAString(a.street)}"`);
          if (a.city) parts.push(`city: "${escapeJXAString(a.city)}"`);
          if (a.zip) parts.push(`zip: "${escapeJXAString(a.zip)}"`);
          if (a.state) parts.push(`state: "${escapeJXAString(a.state)}"`);
          if (a.country) parts.push(`country: "${escapeJXAString(a.country)}"`);
          return `{ label: "${escapeJXAString(label)}", ${parts.join(", ")} }`;
        })
        .join(", ");
      multiValueCode.push(`
        var existingAddrs = person.addresses();
        for (var i = existingAddrs.length - 1; i >= 0; i--) { Contacts.delete(existingAddrs[i]); }
        var newAddrs = [${addressesJXA}];
        for (var i = 0; i < newAddrs.length; i++) {
          var addrProps = {};
          if (newAddrs[i].street) addrProps.street = newAddrs[i].street;
          if (newAddrs[i].city) addrProps.city = newAddrs[i].city;
          if (newAddrs[i].zip) addrProps.zip = newAddrs[i].zip;
          if (newAddrs[i].state) addrProps.state = newAddrs[i].state;
          if (newAddrs[i].country) addrProps.country = newAddrs[i].country;
          person.addresses.push(Contacts.Address(addrProps));
        }
      `);
    }

    const script = wrapJXAFunction(`
      var Contacts = Application("Contacts");
      var matches = Contacts.people.whose({ id: "${escapedId}" })();
      if (matches.length === 0) {
        return JSON.stringify({ success: false, error: "Contact not found with ID: ${escapedId}" });
      }
      var person = matches[0];

      // Set simple properties
      ${setStatements.join("\n      ")}

      // Replace multi-value fields
      ${multiValueCode.join("\n      ")}

      Contacts.save();

      var contact = ${buildReadContactJXA("person")};
      return JSON.stringify({ success: true, contact: contact });
    `);

    const result = await executeJXA<ContactResult>(script);
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
      var Contacts = Application("Contacts");
      var matches = Contacts.people.whose({ id: "${escapedId}" })();
      if (matches.length === 0) {
        return JSON.stringify({ success: false, error: "Contact not found with ID: ${escapedId}" });
      }
      var person = matches[0];
      Contacts.delete(person);
      Contacts.save();
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
