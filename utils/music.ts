import { run } from '@jxa/run';

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

async function checkMusicAccess(): Promise<boolean> {
  try {
  await run(() => {
  const Music = Application('Music');
  return Music.name();
  });
  return true;
  } catch (error) {
  console.error(`Cannot access Music app: ${error instanceof Error ? error.message : String(error)}`);
  return false;
  }
}

async function searchSongs(query: string, limit = 5): Promise<MusicSearchResult> {
  try {
  if (!await checkMusicAccess()) {
  return { success: false, tracks: [], message: 'Cannot access Music app.' };
  }

  const tracks = await run((q: string, lim: number) => {
  const Music = Application('Music');
  // biome-ignore lint/suspicious/noExplicitAny: AppleScript objects
  const allTracks = Music.sources[0].libraryPlaylists[0].tracks.whose({ name: { _contains: q } })();
  const count = Math.min(allTracks.length, lim);
  const results: TrackItem[] = [];
  for (let i = 0; i < count; i++) {
  const t = allTracks[i] as any;
  let id = '';
  try { id = String(t.persistentID()); } catch {}
  let artist = null;
  try { artist = t.artist(); } catch {}
  let album = null;
  try { album = t.album(); } catch {}
  results.push({ id, name: t.name(), artist, album });
  }
  return results;
  }, query, limit) as TrackItem[];

  return { success: true, tracks, message: `Found ${tracks.length} track(s)` };
  } catch (error) {
  const message = `Error searching songs: ${error instanceof Error ? error.message : String(error)}`;
  return { success: false, tracks: [], message };
  }
}

async function playSong(identifier: string): Promise<PlayResult> {
  try {
  if (!await checkMusicAccess()) {
  return { success: false, message: 'Cannot access Music app.' };
  }

  const result = await run((id: string) => {
  const Music = Application('Music');
  let tracks = Music.sources[0].libraryPlaylists[0].tracks.whose({ persistentID: id })();
  if (tracks.length === 0) {
  tracks = Music.sources[0].libraryPlaylists[0].tracks.whose({ name: { _contains: id } })();
  }
  if (tracks.length === 0) return false;
  const t = tracks[0];
  Music.activate();
  t.play();
  return true;
  }, identifier) as boolean;

  return result ?
  { success: true, message: 'Playing song' } :
  { success: false, message: 'Song not found' };
  } catch (error) {
  return { success: false, message: `Error playing song: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export default { searchSongs, playSong };
