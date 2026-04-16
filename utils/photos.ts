import {
  executeJXA,
  JXAAppNotRunningError,
  JXAConverters,
  JXAExecutionError,
  wrapJXAFunction,
} from "../core/jxa-bridge.ts";

interface PhotoItem {
  id: string;
  name: string;
  description: string | null;
  date: string | null;
}

interface PhotoSearchResult {
  success: boolean;
  photos: PhotoItem[];
  message: string;
}

interface PhotoOpenResult {
  success: boolean;
  message: string;
}

function escapeJXAString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

async function checkPhotosAccess(): Promise<boolean> {
  try {
    const script = wrapJXAFunction(`
      const Photos = Application("Photos");
      Photos.name();
      return JSON.stringify(true);
    `);

    const result = await executeJXA<boolean>(script);
    return result === true;
  } catch (_) {
    return false;
  }
}

async function searchPhotos(query: string, limit = 5): Promise<PhotoSearchResult> {
  try {
    if (!(await checkPhotosAccess())) {
      return { success: false, photos: [], message: "Cannot access Photos app." };
    }

    const escapedQuery = escapeJXAString(query);
    const normalizedLimit = Math.max(0, Math.trunc(limit));
    const script = wrapJXAFunction(`
      const Photos = Application("Photos");
      const query = "${escapedQuery}";
      const limit = ${normalizedLimit};
      const items = Photos.mediaItems.whose({ name: { _contains: query } })();
      const count = Math.min(items.length, limit);
      const results = [];

      for (let i = 0; i < count; i++) {
        const item = items[i];

        let desc = null;
        try { desc = ${JXAConverters.toString("item.description()", "null")}; } catch (_) {}

        let date = null;
        try {
          const d = item.date();
          date = d ? d.toString() : null;
        } catch (_) {}

        let id = "";
        try { id = String(item.id()); } catch (_) {}

        const name = ${JXAConverters.toString("item.name()", '""')};

        results.push({ id, name, description: desc, date });
      }

      return JSON.stringify(results);
    `);

    const photos = await executeJXA<PhotoItem[]>(script);
    const resolvedPhotos = Array.isArray(photos) ? photos : [];

    return {
      success: true,
      photos: resolvedPhotos,
      message: `Found ${resolvedPhotos.length} photo(s)`,
    };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return {
        success: false,
        photos: [],
        message: `Error searching photos: ${error.message}`,
      };
    }

    return {
      success: false,
      photos: [],
      message: `Error searching photos: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function openPhoto(identifier: string): Promise<PhotoOpenResult> {
  try {
    if (!(await checkPhotosAccess())) {
      return { success: false, message: "Cannot access Photos app." };
    }

    const escapedIdentifier = escapeJXAString(identifier);
    const script = wrapJXAFunction(`
      const Photos = Application("Photos");
      const identifier = "${escapedIdentifier}";
      let items = Photos.mediaItems.whose({ id: identifier })();

      if (items.length === 0) {
        items = Photos.mediaItems.whose({ name: { _contains: identifier } })();
      }

      if (items.length === 0) {
        return JSON.stringify(false);
      }

      const target = items[0];
      Photos.activate();

      try { Photos.reveal(target); } catch (_) {}

      return JSON.stringify(true);
    `);

    const result = await executeJXA<boolean>(script);

    return result
      ? { success: true, message: "Opened photo in Photos app" }
      : { success: false, message: "Photo not found" };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return { success: false, message: `Error opening photo: ${error.message}` };
    }

    return {
      success: false,
      message: `Error opening photo: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export { checkPhotosAccess };

export default { searchPhotos, openPhoto };
