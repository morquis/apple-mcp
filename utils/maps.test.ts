import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as jxaBridge from "../core/jxa-bridge.js";

let importCounter = 0;

async function importMaps() {
  importCounter += 1;
  return await import(`./maps.js?test=${importCounter}`);
}

describe("maps", () => {
  afterEach(() => {
    mock.restore();
  });

  it("checkMapsAccess returns true when the bridge resolves true", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy.mockResolvedValue(true as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mapsModule = await importMaps();
    const result = await mapsModule.checkMapsAccess();

    expect(result).toBe(true);
    expect(executeJXASpy).toHaveBeenCalledTimes(1);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(1);
    expect(String(executeJXASpy.mock.calls[0]?.[0])).toContain('Application("Maps")');
  });

  it("searchLocations returns mapped search results and escapes the query", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce([
        {
          id: "loc-1",
          name: 'Cafe "Blue"',
          address: "Berlin",
          latitude: 52.52,
          longitude: 13.405,
          category: "Cafe",
          isFavorite: false,
        },
      ] as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mapsModule = await importMaps();
    const result = await mapsModule.default.searchLocations('Cafe "Blue"\nBerlin', 3);

    expect(result).toEqual({
      success: true,
      locations: [
        {
          id: "loc-1",
          name: 'Cafe "Blue"',
          address: "Berlin",
          latitude: 52.52,
          longitude: 13.405,
          category: "Cafe",
          isFavorite: false,
        },
      ],
      message: 'Found 1 location(s) for "Cafe "Blue"\nBerlin"',
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(2);

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('const query = "Cafe \\"Blue\\"\\nBerlin"');
    expect(script).toContain("const limit = 3");
  });

  it("getDirections returns the bridge result and serializes its inputs", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({
        success: true,
        message: 'Displaying directions from "Berlin" to "Munich" by transit',
        route: {
          distance: "See Maps app for details",
          duration: "See Maps app for details",
          startAddress: "Berlin",
          endAddress: "Munich",
        },
      } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mapsModule = await importMaps();
    const result = await mapsModule.default.getDirections("Berlin", "Munich", "transit");

    expect(result).toEqual({
      success: true,
      message: 'Displaying directions from "Berlin" to "Munich" by transit',
      route: {
        distance: "See Maps app for details",
        duration: "See Maps app for details",
        startAddress: "Berlin",
        endAddress: "Munich",
      },
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(2);

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('const fromAddress = "Berlin"');
    expect(script).toContain('const toAddress = "Munich"');
    expect(script).toContain('const transportType = "transit"');
    expect(script).toContain("Maps.getDirections");
  });

  it("dropPin returns the bridge result and escapes its arguments", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({
        success: true,
        message:
          'Showing "1 Main St, \"Suite\" 2" in Maps. You can now manually drop a pin by right-clicking and selecting "Drop Pin".',
      } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mapsModule = await importMaps();
    const result = await mapsModule.default.dropPin('Office "HQ"', '1 Main St, "Suite" 2');

    expect(result).toEqual({
      success: true,
      message:
        'Showing "1 Main St, \"Suite\" 2" in Maps. You can now manually drop a pin by right-clicking and selecting "Drop Pin".',
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(2);

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('const name = "Office \\"HQ\\""');
    expect(script).toContain('const address = "1 Main St, \\"Suite\\" 2"');
    expect(script).toContain("Maps.search(address)");
  });

  it("saveLocation returns the bridge result and escapes its arguments", async () => {
    const executeJXASpy = spyOn(jxaBridge, "executeJXA");
    executeJXASpy
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce({
        success: true,
        message: 'Added "Office \\"HQ\\"" to favorites',
        location: {
          id: "loc-2",
          name: 'Office "HQ"',
          address: '1 Main St, "Suite" 2',
          latitude: 40.7128,
          longitude: -74.006,
          category: null,
          isFavorite: true,
        },
      } as never);

    const wrapJXAFunctionSpy = spyOn(jxaBridge, "wrapJXAFunction");
    wrapJXAFunctionSpy.mockImplementation((script: string) => script);

    const mapsModule = await importMaps();
    const result = await mapsModule.default.saveLocation('Office "HQ"', '1 Main St, "Suite" 2');

    expect(result).toEqual({
      success: true,
      message: 'Added "Office \\"HQ\\"" to favorites',
      location: {
        id: "loc-2",
        name: 'Office "HQ"',
        address: '1 Main St, "Suite" 2',
        latitude: 40.7128,
        longitude: -74.006,
        category: null,
        isFavorite: true,
      },
    });

    expect(executeJXASpy).toHaveBeenCalledTimes(2);
    expect(wrapJXAFunctionSpy).toHaveBeenCalledTimes(2);

    const script = String(executeJXASpy.mock.calls[1]?.[0]);
    expect(script).toContain('const name = "Office \\"HQ\\""');
    expect(script).toContain('const address = "1 Main St, \\"Suite\\" 2"');
    expect(script).toContain("Maps.addToFavorites");
  });
});
