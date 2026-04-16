import {
  executeJXA,
  JXAAppNotRunningError,
  JXAExecutionError,
  wrapJXAFunction,
} from "../core/jxa-bridge.js";

interface TrackItem {
  id: string;
  name: string;
  artist: string | null;
  album: string | null;
}

interface MusicSearchResult {
  success: boolean;
  tracks: TrackItem[];
  message: string;
}

interface PlayResult {
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

async function checkMusicAccess(): Promise<boolean> {
  try {
    const script = wrapJXAFunction(`
      const Music = Application("Music");
      Music.name();
      return JSON.stringify(true);
    `);
    const result = await executeJXA<boolean>(script);
    return result === true;
  } catch (_) {
    return false;
  }
}

async function searchSongs(query: string, limit = 5): Promise<MusicSearchResult> {
  try {
    if (!(await checkMusicAccess())) {
      return { success: false, tracks: [], message: "Cannot access Music app." };
    }

    const escapedQuery = escapeJXAString(query);
    const normalizedLimit = Math.max(0, Math.trunc(limit));
    const script = wrapJXAFunction(`
      const Music = Application("Music");
      const query = "${escapedQuery}";
      const limit = ${normalizedLimit};
      const allTracks = Music.sources[0].libraryPlaylists[0].tracks.whose({
        name: { _contains: query },
      })();
      const count = Math.min(allTracks.length, limit);
      const results = [];

      function toText(value, fallback) {
        if (value === null || value === undefined) {
          return fallback;
        }

        if (typeof value === "string") {
          return value;
        }

        try {
          const unwrapped = ObjC.unwrap(value);
          if (typeof unwrapped === "string") {
            return unwrapped;
          }

          if (unwrapped !== null && unwrapped !== undefined) {
            return String(unwrapped);
          }
        } catch (_) {
          // Fall through to plain coercion.
        }

        return String(value);
      }

      for (let i = 0; i < count; i++) {
        const t = allTracks[i];

        let id = "";
        try {
          id = toText(t.persistentID(), "");
        } catch (_) {}

        let name = "";
        try {
          name = toText(t.name(), "");
        } catch (_) {}

        let artist = null;
        try {
          artist = toText(t.artist(), null);
        } catch (_) {}

        let album = null;
        try {
          album = toText(t.album(), null);
        } catch (_) {}

        results.push({ id, name, artist, album });
      }

      return JSON.stringify(results);
    `);

    const tracks = await executeJXA<TrackItem[]>(script);
    const resolvedTracks = Array.isArray(tracks) ? tracks : [];

    return {
      success: true,
      tracks: resolvedTracks,
      message: `Found ${resolvedTracks.length} track(s)`,
    };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return {
        success: false,
        tracks: [],
        message: `Error searching songs: ${error.message}`,
      };
    }

    return {
      success: false,
      tracks: [],
      message: `Error searching songs: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function playSong(identifier: string): Promise<PlayResult> {
  try {
    if (!(await checkMusicAccess())) {
      return { success: false, message: "Cannot access Music app." };
    }

    const escapedIdentifier = escapeJXAString(identifier);
    const script = wrapJXAFunction(`
      const Music = Application("Music");
      const identifier = "${escapedIdentifier}";
      let tracks = Music.sources[0].libraryPlaylists[0].tracks.whose({
        persistentID: identifier,
      })();

      if (tracks.length === 0) {
        tracks = Music.sources[0].libraryPlaylists[0].tracks.whose({
          name: { _contains: identifier },
        })();
      }

      if (tracks.length === 0) {
        return JSON.stringify(false);
      }

      const track = tracks[0];
      Music.activate();
      track.play();

      return JSON.stringify(true);
    `);

    const result = await executeJXA<boolean>(script);

    return result
      ? { success: true, message: "Playing song" }
      : { success: false, message: "Song not found" };
  } catch (error) {
    if (error instanceof JXAAppNotRunningError || error instanceof JXAExecutionError) {
      return {
        success: false,
        message: `Error playing song: ${error.message}`,
      };
    }

    return {
      success: false,
      message: `Error playing song: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const music = { searchSongs, playSong };

export { checkMusicAccess };

export default music;
