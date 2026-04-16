import {
  executeJXA,
  JXAAppNotRunningError,
  JXAExecutionError,
  wrapJXAFunction,
} from "../core/jxa-bridge.js";

// Type definitions
interface MapLocation {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  isFavorite: boolean;
}

interface Guide {
  id: string;
  name: string;
  itemCount: number;
}

interface SearchResult {
  success: boolean;
  locations: MapLocation[];
  message?: string;
}

interface SaveResult {
  success: boolean;
  message: string;
  location?: MapLocation;
}

interface DirectionResult {
  success: boolean;
  message: string;
  route?: {
    distance: string;
    duration: string;
    startAddress: string;
    endAddress: string;
  };
}

interface GuideResult {
  success: boolean;
  message: string;
  guides?: Guide[];
}

interface AddToGuideResult {
  success: boolean;
  message: string;
  guideName?: string;
  locationName?: string;
}

function escapeJXAString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

/**
 * Check if Maps app is accessible
 */
async function checkMapsAccess(): Promise<boolean> {
  try {
    const script = wrapJXAFunction(`
      const Maps = Application("Maps");
      Maps.name();
      return JSON.stringify(true);
    `);

    const hasAccess = await executeJXA<boolean>(script);
    return hasAccess === true;
  } catch (_) {
    return false;
  }
}

/**
 * Search for locations on the map
 * @param query Search query for locations
 * @param limit Maximum number of results to return
 */
async function searchLocations(query: string, limit: number = 5): Promise<SearchResult> {
  try {
    if (!(await checkMapsAccess())) {
      return {
        success: false,
        locations: [],
        message:
          "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation.",
      };
    }

    const escapedQuery = escapeJXAString(query);
    const normalizedLimit = Math.max(0, Math.trunc(limit));
    const script = wrapJXAFunction(`
      const Maps = Application("Maps");
      const query = "${escapedQuery}";
      const limit = ${normalizedLimit};

      Maps.activate();

      const encodedQuery = encodeURIComponent(query);
      Maps.openLocation("maps://?q=" + encodedQuery);

      try {
        Maps.search(query);
      } catch (_) {
        // Ignore search API availability issues on older Maps builds.
      }

      delay(2);

      const locations = [];

      try {
        const selectedLocation = Maps.selectedLocation();

        if (selectedLocation) {
          locations.push({
            id: "loc-" + Date.now() + "-" + Math.random(),
            name: selectedLocation.name() || query,
            address: selectedLocation.formattedAddress() || "Address not available",
            latitude: selectedLocation.latitude(),
            longitude: selectedLocation.longitude(),
            category: selectedLocation.category ? selectedLocation.category() : null,
            isFavorite: false,
          });
        } else {
          locations.push({
            id: "loc-" + Date.now() + "-" + Math.random(),
            name: query,
            address: "Search results - address details not available",
            latitude: null,
            longitude: null,
            category: null,
            isFavorite: false,
          });
        }
      } catch (_) {
        locations.push({
          id: "loc-" + Date.now() + "-" + Math.random(),
          name: query,
          address: "Search result - address details not available",
          latitude: null,
          longitude: null,
          category: null,
          isFavorite: false,
        });
      }

      return JSON.stringify(locations.slice(0, limit));
    `);

    const locations = await executeJXA<MapLocation[]>(script);
    const resolvedLocations = Array.isArray(locations) ? locations : [];

    return {
      success: resolvedLocations.length > 0,
      locations: resolvedLocations,
      message:
        resolvedLocations.length > 0
          ? `Found ${resolvedLocations.length} location(s) for "${query}"`
          : `No locations found for "${query}"`,
    };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return {
        success: false,
        locations: [],
        message: `Error: ${error.message}`,
      };
    }

    return {
      success: false,
      locations: [],
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Save a location to favorites
 * @param name Name of the location
 * @param address Address to save (as a string)
 */
async function saveLocation(name: string, address: string): Promise<SaveResult> {
  try {
    if (!(await checkMapsAccess())) {
      return {
        success: false,
        message:
          "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation.",
      };
    }

    const escapedName = escapeJXAString(name);
    const escapedAddress = escapeJXAString(address);
    const script = wrapJXAFunction(`
      const Maps = Application("Maps");
      const name = "${escapedName}";
      const address = "${escapedAddress}";

      Maps.activate();
      Maps.search(address);

      delay(2);

      const location = Maps.selectedLocation();

      if (!location) {
        return JSON.stringify({
          success: false,
          message: 'Could not find location for "' + address + '"',
        });
      }

      try {
        Maps.addToFavorites(location, { withProperties: { name: name } });

        return JSON.stringify({
          success: true,
          message: 'Added "' + name + '" to favorites',
          location: {
            id: "loc-" + Date.now(),
            name,
            address: location.formattedAddress() || address,
            latitude: location.latitude(),
            longitude: location.longitude(),
            category: null,
            isFavorite: true,
          },
        });
      } catch (_) {
        return JSON.stringify({
          success: false,
          message:
            'Location found but unable to automatically add to favorites. Please manually save "' +
            name +
            '" from the Maps app.',
        });
      }
    `);

    const result = await executeJXA<SaveResult>(script);
    return result ?? { success: false, message: "Error: empty response" };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return { success: false, message: `Error: ${error.message}` };
    }

    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get directions between two locations
 * @param fromAddress Starting address
 * @param toAddress Destination address
 * @param transportType Type of transport to use (default is driving)
 */
async function getDirections(
  fromAddress: string,
  toAddress: string,
  transportType: "driving" | "walking" | "transit" = "driving",
): Promise<DirectionResult> {
  try {
    if (!(await checkMapsAccess())) {
      return {
        success: false,
        message:
          "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation.",
      };
    }

    const escapedFromAddress = escapeJXAString(fromAddress);
    const escapedToAddress = escapeJXAString(toAddress);
    const escapedTransportType = escapeJXAString(transportType);
    const script = wrapJXAFunction(`
      const Maps = Application("Maps");
      const fromAddress = "${escapedFromAddress}";
      const toAddress = "${escapedToAddress}";
      const transportType = "${escapedTransportType}";

      Maps.activate();
      Maps.getDirections({
        from: fromAddress,
        to: toAddress,
        by: transportType,
      });

      delay(2);

      return JSON.stringify({
        success: true,
        message:
          'Displaying directions from "' +
          fromAddress +
          '" to "' +
          toAddress +
          '" by ' +
          transportType,
        route: {
          distance: "See Maps app for details",
          duration: "See Maps app for details",
          startAddress: fromAddress,
          endAddress: toAddress,
        },
      });
    `);

    const result = await executeJXA<DirectionResult>(script);
    return result ?? { success: false, message: "Error: empty response" };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return { success: false, message: `Error: ${error.message}` };
    }

    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create a pin at a specified location
 * @param name Name of the pin
 * @param address Location address
 */
async function dropPin(name: string, address: string): Promise<SaveResult> {
  try {
    if (!(await checkMapsAccess())) {
      return {
        success: false,
        message:
          "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation.",
      };
    }

    const escapedName = escapeJXAString(name);
    const escapedAddress = escapeJXAString(address);
    const script = wrapJXAFunction(`
      const Maps = Application("Maps");
      const name = "${escapedName}";
      const address = "${escapedAddress}";

      Maps.activate();
      Maps.search(address);

      delay(2);

      return JSON.stringify({
        success: true,
        message:
          'Showing "' +
          address +
          '" in Maps. You can now manually drop a pin by right-clicking and selecting "Drop Pin".',
      });
    `);

    const result = await executeJXA<SaveResult>(script);
    return result ?? { success: false, message: "Error: empty response" };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return { success: false, message: `Error: ${error.message}` };
    }

    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * List all guides in Apple Maps
 * @returns Promise resolving to a list of guides
 */
async function listGuides(): Promise<GuideResult> {
  try {
    if (!(await checkMapsAccess())) {
      return {
        success: false,
        message:
          "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation.",
      };
    }

    const script = wrapJXAFunction(`
      const app = Application.currentApplication();
      app.includeStandardAdditions = true;

      const Maps = Application("Maps");
      Maps.activate();

      app.openLocation("maps://?show=guides");

      return JSON.stringify({
        success: true,
        message: "Opened guides view in Maps",
        guides: [],
      });
    `);

    const result = await executeJXA<GuideResult>(script);
    return result ?? { success: false, message: "Error: empty response" };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return { success: false, message: `Error: ${error.message}` };
    }

    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Add a location to a specific guide
 * @param locationAddress The address of the location to add
 * @param guideName The name of the guide to add to
 * @returns Promise resolving to result of the operation
 */
async function addToGuide(locationAddress: string, guideName: string): Promise<AddToGuideResult> {
  try {
    if (!(await checkMapsAccess())) {
      return {
        success: false,
        message:
          "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation.",
      };
    }

    const escapedLocationAddress = escapeJXAString(locationAddress);
    const escapedGuideName = escapeJXAString(guideName);
    const script = wrapJXAFunction(`
      const app = Application.currentApplication();
      app.includeStandardAdditions = true;

      const Maps = Application("Maps");
      const locationAddress = "${escapedLocationAddress}";
      const guideName = "${escapedGuideName}";

      Maps.activate();

      const encodedAddress = encodeURIComponent(locationAddress);
      app.openLocation("maps://?q=" + encodedAddress);

      return JSON.stringify({
        success: true,
        message:
          'Showing "' +
          locationAddress +
          '" in Maps. Add to "' +
          guideName +
          '" guide by clicking location pin, "..." button, then "Add to Guide".',
        guideName,
        locationName: locationAddress,
      });
    `);

    const result = await executeJXA<AddToGuideResult>(script);
    return result ?? { success: false, message: "Error: empty response" };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return { success: false, message: `Error: ${error.message}` };
    }

    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create a new guide with the given name
 * @param guideName The name for the new guide
 * @returns Promise resolving to result of the operation
 */
async function createGuide(guideName: string): Promise<AddToGuideResult> {
  try {
    if (!(await checkMapsAccess())) {
      return {
        success: false,
        message:
          "Cannot access Maps app. Please grant access in System Settings > Privacy & Security > Automation.",
      };
    }

    const escapedGuideName = escapeJXAString(guideName);
    const script = wrapJXAFunction(`
      const app = Application.currentApplication();
      app.includeStandardAdditions = true;

      const Maps = Application("Maps");
      const guideName = "${escapedGuideName}";

      Maps.activate();
      app.openLocation("maps://?show=guides");

      return JSON.stringify({
        success: true,
        message:
          'Opened guides view to create new guide "' +
          guideName +
          '". Click "+" button and select "New Guide".',
        guideName,
      });
    `);

    const result = await executeJXA<AddToGuideResult>(script);
    return result ?? { success: false, message: "Error: empty response" };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return { success: false, message: `Error: ${error.message}` };
    }

    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const maps = {
  searchLocations,
  saveLocation,
  getDirections,
  dropPin,
  listGuides,
  addToGuide,
  createGuide,
};

export { checkMapsAccess };

export default maps;
