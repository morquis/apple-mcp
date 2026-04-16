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

export default { getAllNumbers, findNumber, findContactByPhone };
