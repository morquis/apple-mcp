import { run } from '@jxa/run';

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

async function checkPhotosAccess(): Promise<boolean> {
  try {
  await run(() => {
  const Photos = Application('Photos');
  return Photos.name();
  });
  return true;
  } catch (error) {
  console.error(`Cannot access Photos app: ${error instanceof Error ? error.message : String(error)}`);
  return false;
  }
}

async function searchPhotos(query: string, limit = 5): Promise<PhotoSearchResult> {
  try {
  if (!await checkPhotosAccess()) {
  return { success: false, photos: [], message: 'Cannot access Photos app.' };
  }

  const photos = await run((q: string, lim: number) => {
  const Photos = Application('Photos');
  // biome-ignore lint/suspicious/noExplicitAny: AppleScript objects
  const items = Photos.mediaItems.whose({ name: { _contains: q } })();
  const count = Math.min(items.length, lim);
  const results: PhotoItem[] = [];
  for (let i = 0; i < count; i++) {
  const item = items[i] as any;
  let desc = null;
  try { desc = item.description(); } catch {}
  let date = null;
  try { date = item.date() ? item.date().toString() : null; } catch {}
  let id = '';
  try { id = String(item.id()); } catch {}
  results.push({
  id,
  name: item.name(),
  description: desc,
  date,
  });
  }
  return results;
  }, query, limit) as PhotoItem[];

  return { success: true, photos, message: `Found ${photos.length} photo(s)` };
  } catch (error) {
  const message = `Error searching photos: ${error instanceof Error ? error.message : String(error)}`;
  return { success: false, photos: [], message };
  }
}

async function openPhoto(identifier: string): Promise<PhotoOpenResult> {
  try {
  if (!await checkPhotosAccess()) {
  return { success: false, message: 'Cannot access Photos app.' };
  }

  const result = await run((id: string) => {
  const Photos = Application('Photos');
  let items = Photos.mediaItems.whose({ id })();
  if (items.length === 0) {
  items = Photos.mediaItems.whose({ name: { _contains: id } })();
  }
  if (items.length === 0) return false;
  const target = items[0];
  Photos.activate();
  try { Photos.reveal(target); } catch {}
  return true;
  }, identifier) as boolean;

  return result ?
  { success: true, message: 'Opened photo in Photos app' } :
  { success: false, message: 'Photo not found' };
  } catch (error) {
  return { success: false, message: `Error opening photo: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export default { searchPhotos, openPhoto };
