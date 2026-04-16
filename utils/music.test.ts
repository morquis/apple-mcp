import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.ts";

let importCounter = 0;

async function importMusic() {
  importCounter += 1;
  return await import(`./music.ts?test=${importCounter}`);
}

describe("music", () => {
  afterEach(() => {
    mock.restore();
  });

  it("checkMusicAccess returns true when the bridge resolves true", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue(true as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const musicModule = await importMusic();
    const result = await musicModule.checkMusicAccess();

    expect(result).toBe(true);
    expect(executeJXASpy).toHaveBeenCalledTimes(1);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(1);
    expect(String(executeJXASpy.mock.calls[0]?.[0])).toContain('Application("Music")');
  });

  it("searchSongs returns track items and escapes the query", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce([
        {
          id: "track-1",
          name: 'Song "One"',
          artist: "Artist",
          album: "Album",
        },
      ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const musicModule = await importMusic();
    const result = await musicModule.default.searchSongs('Song "One"\nTab\tSlash\\', 3.8);

    expect(result).toEqual({
      success: true,
      tracks: [
        {
          id: "track-1",
          name: 'Song "One"',
          artist: "Artist",
          album: "Album",
        },
      ],
      message: "Found 1 track(s)",
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(2);

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('const query = "Song \\"One\\"\\nTab\\tSlash\\\\"');
    expect(script).toContain("const limit = 3");
    expect(script).toContain("return JSON.stringify(results)");
  });

  it("playSong returns success when a track is found", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const musicModule = await importMusic();
    const result = await musicModule.default.playSong('track-"123"');

    expect(result).toEqual({
      success: true,
      message: "Playing song",
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain('const identifier = "track-\\"123\\""');
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain("return JSON.stringify(true)");
  });

  it("playSong returns failure when a track is not found", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(false as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const musicModule = await importMusic();
    const result = await musicModule.default.playSong("missing-track");

    expect(result).toEqual({
      success: false,
      message: "Song not found",
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain('const identifier = "missing-track"');
    expect(String(executeJXASpy.mock.calls[1]?.[0])).toContain("return JSON.stringify(false)");
  });
});
