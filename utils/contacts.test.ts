import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.js";
import { userLabelForCNLabel } from "./contacts.js";

describe("contacts", () => {
  afterEach(() => {
    mock.restore();
  });

  it("getAllNumbers returns an object", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({ Alice: ["+15551234567"] } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    const result = await contacts.getAllNumbers();

    expect(result).toEqual({ Alice: ["+15551234567"] });
    expect(executeJXASpy).toHaveBeenCalledTimes(2);
  });

  it("findNumber searches by name and escapes special characters", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(["+15551234567"] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    const result = await contacts.findNumber('Ali"ce');

    expect(result).toEqual(["+15551234567"]);
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain('Ali\\"ce');
  });

  it("findContactByPhone normalizes the search input before executing JXA", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce("Alice" as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    const result = await contacts.findContactByPhone("(555) 123-4567");

    expect(result).toBe("Alice");
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain('"5551234567"');
  });

  it("findContactByPhone returns null when the bridge throws", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockRejectedValue(new Error("denied") as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    const result = await contacts.findContactByPhone("+15551234567");

    expect(result).toBeNull();
  });

  // Regression: passing CNLabeledValue / CN*Key items through a JS array
  // literal into $.NSArray.arrayWithArray([...]) coerces them to
  // __NSDictionaryM, which CNContact rejects with
  //   "Labeled value {} has incorrect type __NSDictionaryM for key
  //    phoneNumbers. It should be CNLabeledValue."
  // The fix is to build NSMutableArray and use addObject() instead.
  // This test guards against accidentally re-introducing the bad pattern.
  it("createContact emits NSMutableArray.addObject for CNLabeledValue, never arrayWithArray", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    // Access check, then create call — both succeed with minimal mocks.
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({ success: true, contact: { id: "x", firstName: "Alice", phones: [], emails: [], urls: [], addresses: [] } } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    await contacts.createContact({
      firstName: "Alice",
      lastName: "Tester",
      phones: [
        { label: "work", value: "+15551234567" },
        { label: "other", value: "+15557654321" },
      ],
      emails: [{ label: "work", value: "alice@example.com" }],
      urls: [{ label: "work", value: "https://example.com" }],
      addresses: [{ label: "work", city: "Hamburg", zip: "20901", country: "Deutschland" }],
    });

    const script = String(executeJXASpy.mock.calls[1]?.[0] ?? "");
    // Bridge-fixed pattern must be present.
    expect(script).toContain("NSMutableArray.alloc.init");
    expect(script).toContain("addObject($.CNLabeledValue.labeledValueWithLabelValue");
    // The broken pattern must not appear anywhere for labeled-value or address arrays.
    expect(script).not.toContain("arrayWithArray([$.CNLabeledValue");
    expect(script).not.toMatch(/arrayWithArray\(\[\(function\(\) \{ var _a = \$\.CNMutablePostalAddress/);
  });

  // Regression: same NSArray.arrayWithArray bridge bug applied to the
  // keysToFetch array in updateContact. The constants ($.CNContact*Key)
  // become __NSDictionaryM if passed through a JS array literal, which
  // silently breaks the unifiedContactsMatchingPredicate fetch.
  it("updateContact builds the keys array via NSMutableArray.addObject, not arrayWithArray", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({ success: true, contact: { id: "x", firstName: "Alice", phones: [], emails: [], urls: [], addresses: [] } } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    await contacts.updateContact({
      id: "ABC123",
      firstName: "Updated",
    });

    const script = String(executeJXASpy.mock.calls[1]?.[0] ?? "");
    // Keys must be built incrementally with addObject.
    expect(script).toContain("keys.addObject($.CNContactGivenNameKey)");
    expect(script).toContain("keys.addObject($.CNContactPhoneNumbersKey)");
    // The broken bulk-array pattern must be gone.
    expect(script).not.toContain("arrayWithArray([\n        $.CNContactGivenNameKey");
    expect(script).not.toMatch(/arrayWithArray\(\[\s*\$\.CNContactGivenNameKey/);
  });

  // Fax-label support: phones with label "workFax" / "homeFax" / "otherFax"
  // (and the bare "fax" alias for workFax) must be translated to the proper
  // Apple sentinel constants, not silently fall back to _$!<Work>!$_.
  //
  // We use the ABPerson-legacy uppercase FAX form (`_$!<WorkFAX>!$_`), not
  // the CN-API camelCase form (`_$!<WorkFax>!$_`). The CN form is silently
  // remapped by Apple's Scripting Bridge to the Assistant label — see the
  // comment block above USER_LABEL_TO_SENTINEL in utils/contacts.ts for the
  // empirical evidence (2026-05-08).
  it("createContact translates fax labels to the WorkFAX/HomeFAX/OtherFAX sentinels", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({ success: true, contact: { id: "x", firstName: "Faxer", phones: [], emails: [], urls: [], addresses: [] } } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    await contacts.createContact({
      firstName: "Faxer",
      lastName: "McFaxface",
      phones: [
        { label: "workFax", value: "+15550001111" },
        { label: "HomeFax", value: "+15550002222" }, // tolerate mixed case
        { label: "otherfax", value: "+15550003333" }, // tolerate lowercase
        { label: "fax", value: "+15550004444" },     // bare alias → WorkFAX
      ],
    });

    const script = String(executeJXASpy.mock.calls[1]?.[0] ?? "");
    expect(script).toContain("_$!<WorkFAX>!$_");
    expect(script).toContain("_$!<HomeFAX>!$_");
    expect(script).toContain("_$!<OtherFAX>!$_");
    // Guard against accidental regression to the CN-API form on the WRITE
    // side. The script also embeds a read-back lookup table that contains
    // both the canonical FAX form and the legacy Fax form (defensive), so
    // checking for the bare sentinel anywhere in the script would false-
    // positive on the lookup. Instead, assert no labeledValueWithLabelValue
    // call uses the CN-API form — that is the actual write path Apple's
    // Scripting Bridge silently remaps to the Assistant label.
    expect(script).not.toMatch(/labeledValueWithLabelValue\(\$\("_\$!<WorkFax>!\$_"\)/);
    expect(script).not.toMatch(/labeledValueWithLabelValue\(\$\("_\$!<HomeFax>!\$_"\)/);
    expect(script).not.toMatch(/labeledValueWithLabelValue\(\$\("_\$!<OtherFax>!\$_"\)/);
    // The bare "fax" alias must NOT collapse to plain Work.
    // (We can't easily count occurrences of WorkFAX vs Work here without a
    // false positive — but the absence of any "work" written by the script
    // for these phones is implied by the four fax sentinels above.)
    expect(script).not.toMatch(/labeledValueWithLabelValue\(\$\("_\$!<Work>!\$_"\)/);
  });

  // Read-path: the inverse mapping must turn Apple sentinels back into the
  // canonical user-facing labels (and pass unknown labels through unchanged
  // so custom user labels aren't corrupted).
  it("userLabelForCNLabel translates known sentinels and passes unknown labels through", () => {
    expect(userLabelForCNLabel("_$!<Work>!$_")).toBe("work");
    expect(userLabelForCNLabel("_$!<Home>!$_")).toBe("home");
    expect(userLabelForCNLabel("_$!<Other>!$_")).toBe("other");
    expect(userLabelForCNLabel("_$!<Mobile>!$_")).toBe("mobile");
    expect(userLabelForCNLabel("_$!<Main>!$_")).toBe("main");
    // Canonical fax form (uppercase FAX, ABPerson-legacy) — what Apple
    // actually stores and what we now write.
    expect(userLabelForCNLabel("_$!<WorkFAX>!$_")).toBe("workFax");
    expect(userLabelForCNLabel("_$!<HomeFAX>!$_")).toBe("homeFax");
    expect(userLabelForCNLabel("_$!<OtherFAX>!$_")).toBe("otherFax");
    // Defensive: legacy CN-API camelCase form must also map to the same
    // user-facing label, so any contacts written with the old (broken) form
    // still surface as "workFax" / "homeFax" / "otherFax" instead of
    // leaking the raw sentinel.
    expect(userLabelForCNLabel("_$!<WorkFax>!$_")).toBe("workFax");
    expect(userLabelForCNLabel("_$!<HomeFax>!$_")).toBe("homeFax");
    expect(userLabelForCNLabel("_$!<OtherFax>!$_")).toBe("otherFax");
    // Unknown / custom labels must round-trip unchanged so the client sees
    // exactly what Apple returned (e.g. user-defined "Schwiegermutter").
    expect(userLabelForCNLabel("Schwiegermutter")).toBe("Schwiegermutter");
    expect(userLabelForCNLabel("_$!<Pager>!$_")).toBe("_$!<Pager>!$_");
    expect(userLabelForCNLabel("")).toBe("");
  });

  // Read-path: the JXA scripts that read phones/emails/urls/addresses must
  // embed the sentinel-lookup translator so the client never sees raw
  // "_$!<...>!$_" strings.
  it("readContactById embeds the sentinel→user-label translator in the read script", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({ success: true, contact: { id: "x", firstName: "Alice", phones: [], emails: [], urls: [], addresses: [] } } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const contacts = (await import("./contacts.js")).default;
    // updateContact ends with a Scripting Bridge read-back that uses the same
    // buildReadContactJXA helper. Easier handle than calling the private
    // readContactById directly.
    await contacts.updateContact({ id: "ABC123", firstName: "Updated" });

    const script = String(executeJXASpy.mock.calls[1]?.[0] ?? "");
    // The translator function must be in the read script and both fax
    // sentinel forms must be embedded so a stored fax label is normalized
    // regardless of which form Apple delivered.
    expect(script).toContain("var _lblXlat =");
    // Tolerate either the spaced ("a": "b") or compact ("a":"b") JSON form.
    // Canonical uppercase FAX form (what Apple actually stores).
    expect(script).toMatch(/"_\$!<WorkFAX>!\$_":\s*"workFax"/);
    // Defensive: legacy CN-API camelCase form must also be in the lookup,
    // so contacts written by older builds of this MCP still read correctly.
    expect(script).toMatch(/"_\$!<WorkFax>!\$_":\s*"workFax"/);
    // The label() expressions for phones/emails/urls/addresses must all be
    // wrapped in the translator.
    expect(script).toContain("_lblXlat(String(phs[ph].label()))");
    expect(script).toContain("_lblXlat(String(ems[em].label()))");
    expect(script).toContain("_lblXlat(String(us[ur].label()))");
    expect(script).toContain("_lblXlat(String(addrs[ad].label()))");
  });
});
