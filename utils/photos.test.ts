import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.js";

let importCounter = 0;

async function importPhotos() {
  importCounter += 1;
  return await import(`./photos.js?test=${importCounter}`);
}

describe("photos", () => {
  afterEach(() => {
    mock.restore();
  });

  it("checkPhotosAccess returns true when the bridge resolves true", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue(true as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const photosModule = await importPhotos();
    const result = await photosModule.checkPhotosAccess();

    expect(result).toBe(true);
    expect(executeJXASpy).toHaveBeenCalledTimes(1);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(1);
    expect(String(executeJXASpy.mock.calls[0]?.[0])).toContain('Application("Photos")');
  });

  it("searchPhotos returns photo items and escapes the query", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce([
        {
          id: "photo-1",
          name: 'Sunset "Beach"',
          description: "A beautiful sunset",
          date: "2026-01-15",
        },
      ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const photosModule = await importPhotos();
    const result = await photosModule.default.searchPhotos('Sunset "Beach"', 3);

    expect(result).toEqual({
      success: true,
      photos: [
        {
          id: "photo-1",
          name: 'Sunset "Beach"',
          description: "A beautiful sunset",
          date: "2026-01-15",
        },
      ],
      message: "Found 1 photo(s)",
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(2);

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('const query = "Sunset \\"Beach\\""');
    expect(script).toContain("const limit = 3");
  });

  it("openPhoto returns success when photo is found", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const photosModule = await importPhotos();
    const result = await photosModule.default.openPhoto('photo-"123"');

    expect(result).toEqual({
      success: true,
      message: "Opened photo in Photos app",
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('const identifier = "photo-\\"123\\""');
  });

  it("openPhoto returns failure when photo is not found", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(false as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const photosModule = await importPhotos();
    const result = await photosModule.default.openPhoto("missing-photo");

    expect(result).toEqual({
      success: false,
      message: "Photo not found",
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
  });
});
