import { showToast } from "../utils/helpers";
import {
  getAllItems,
  getItemById,
  saveItem,
  deleteItem,
  initDB,
  STORES,
  PlaylistItem,
  PinnedItem,
  SavedAlbum,
  SavedArtist,
} from "./db";

// Initialize database on module load
initDB().catch(console.error);

// Default playlists to create on first load (using fixed UUIDs)
const DEFAULT_PLAYLISTS = [
  { id: "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`, title: "Liked Songs" }
];

/** Initialize default playlists if they don't exist */
export async function initializeDefaultPlaylists(): Promise<void> {
  try {
    for (const defaultPl of DEFAULT_PLAYLISTS) {
      const existing = await getPlaylist(defaultPl.id);
      if (!existing) {
        await createPlaylist(defaultPl.id, defaultPl.title);
      }
    }
  } catch (error) {
    console.error("Failed to initialize default playlists:", error);
  }
}

// ─── PLAYLISTS ───────────────────────────────────────────────────────────

/** Get all playlist ids */
export async function getPlaylistIds(): Promise<string[]> {
  const playlists = await getAllItems<PlaylistItem>(STORES.PLAYLISTS);
  return playlists.map((p) => p.id);
}

/** Load a playlist by id */
export async function getPlaylist(id: string): Promise<PlaylistItem | null> {
  const playlist = await getItemById<PlaylistItem>(STORES.PLAYLISTS, id);
  return playlist || null;
}

/** Save a playlist */
export async function savePlaylist(id: string, pl: any): Promise<void> {
  await saveItem<PlaylistItem>(STORES.PLAYLISTS, {
    id,
    title: pl.title,
    tracks: pl.tracks || [],
    duration: pl.duration || 0,
    numberOfTracks: pl.numberOfTracks || 0,
    createdAt: pl.createdAt,
    updatedAt: pl.updatedAt,
  });
}

/** Create a new playlist */
export async function createPlaylist(
  id = crypto.randomUUID(),
  title = "Untitled Playlist",
): Promise<string> {
  const now = Date.now();
  const pl = { title, tracks: [], duration: 0, numberOfTracks: 0, id, createdAt: now, updatedAt: now };
  await savePlaylist(id, pl);
  return id;
}

/** Delete a playlist by id */
export async function deletePlaylist(id: string): Promise<void> {
  await deleteItem(STORES.PLAYLISTS, id);
}

/** Toggle a track in a playlist */
export async function toggleTrackInPlaylist(
  plId: string,
  track: any,
  add: boolean,
): Promise<void> {
  const pl = await getPlaylist(plId);
  if (!pl) return;

  let changed = false;

  if (add) {
    if (!pl.tracks.some((t: any) => t.id === track.id)) {
      pl.tracks.push(track);
      pl.numberOfTracks = pl.tracks.length;
      showToast(`Added to "${pl.title}"`);
      changed = true;
    }
  } else {
    const before = pl.tracks.length;
    pl.tracks = pl.tracks.filter((t: any) => t.id !== track.id);
    pl.numberOfTracks = pl.tracks.length;
    if (pl.tracks.length !== before) {
      showToast(`Removed from "${pl.title}"`);
      changed = true;
    }
  }

  if (changed) {
    // Recalculate duration and update timestamps
    pl.duration = pl.tracks.reduce((sum: number, t: any) => sum + (t.duration || 0), 0);
    pl.updatedAt = Date.now();
    await savePlaylist(plId, pl);
  }
}

// ─── PINNED ──────────────────────────────────────────────────────────────

/** Get all pinned items */
export async function getPinned(): Promise<PinnedItem[]> {
  return getAllItems<PinnedItem>(STORES.PINNED);
}

/** Toggle a pinned album */
export async function togglePinnedAlbum(al: any): Promise<void> {
  const pinnedId = `pinned-album-${al.id}`;
  const existing = await getItemById<PinnedItem>(STORES.PINNED, pinnedId);

  if (existing) {
    await deleteItem(STORES.PINNED, pinnedId);
  } else {
    await saveItem<PinnedItem>(STORES.PINNED, {
      id: pinnedId,
      type: "album",
      title: al.title,
      data: al,
    });
  }
}

/** Toggle a pinned artist */
export async function togglePinnedArtist(
  id: string,
  name: string,
  pic: string,
): Promise<void> {
  const pinnedId = `pinned-artist-${id}`;
  const existing = await getItemById<PinnedItem>(STORES.PINNED, pinnedId);

  if (existing) {
    await deleteItem(STORES.PINNED, pinnedId);
    showToast(`Unpinned "${name}"`);
  } else {
    await saveItem<PinnedItem>(STORES.PINNED, {
      id: pinnedId,
      type: "artist",
      title: name,
      data: [id, name, pic],
    });
    showToast(`Pinned "${name}"`);
  }
}

// ─── HISTORY ──────────────────────────────────────────────────────────────

/** Add item to history (no duplicates, max 50 items, sorted by most recent) */
export async function addToHistory(
  id: string,
  title: string,
  viewType: "album" | "artist",
  icon?: string,
): Promise<void> {
  const historyId = `history-${viewType}-${id}`;
  const existing = await getItemById<PinnedItem>(STORES.PINNED, historyId);

  // Remove if exists (to move to top as most recent)
  if (existing) {
    await deleteItem(STORES.PINNED, historyId);
  }

  // Add as most recent
  await saveItem<PinnedItem>(STORES.PINNED, {
    id: historyId,
    type: "history",
    title,
    data: { id, view: viewType, icon },
    updatedAt: Date.now(),
  });

  // Enforce max 50 items - get all history and delete oldest if needed
  const allItems = await getAllItems<PinnedItem>(STORES.PINNED);
  const historyItems = allItems
    .filter(item => item.type === "history")
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (historyItems.length > 50) {
    const toDelete = historyItems.slice(50);
    for (const item of toDelete) {
      await deleteItem(STORES.PINNED, item.id);
    }
  }
}

/** Get all history items sorted by most recent first */
export async function getHistory(): Promise<PinnedItem[]> {
  const allItems = await getAllItems<PinnedItem>(STORES.PINNED);
  return allItems
    .filter(item => item.type === "history")
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Clear all history */
export async function clearHistoryItems(): Promise<void> {
  const allItems = await getAllItems<PinnedItem>(STORES.PINNED);
  const historyItems = allItems.filter(item => item.type === "history");
  for (const item of historyItems) {
    await deleteItem(STORES.PINNED, item.id);
  }
}

// ─── SAVED ALBUMS (LIBRARY) ──────────────────────────────────────────────

/** Get all saved albums */
export async function getSavedAlbums(): Promise<SavedAlbum[]> {
  return getAllItems<SavedAlbum>(STORES.SAVED_ALBUMS);
}

/** Get a saved album by id */
export async function getSavedAlbum(id: string): Promise<SavedAlbum | null> {
  const album = await getItemById<SavedAlbum>(STORES.SAVED_ALBUMS, id);
  return album || null;
}

/** Check if an album is saved */
export async function isAlbumSaved(id: string): Promise<boolean> {
  const album = await getSavedAlbum(id);
  return !!album;
}

/** Save an album to library */
export async function saveAlbum(album: any): Promise<void> {
  await saveItem<SavedAlbum>(STORES.SAVED_ALBUMS, {
    id: album.id,
    title: album.title,
    artists: album.artists || [],
    cover: album.cover,
    releaseDate: album.releaseDate,
    numberOfTracks: album.numberOfTracks || 0,
    data: album,
  });
  showToast(`Saved "${album.title}"`);
}

/** Remove an album from library */
export async function deleteAlbum(id: string): Promise<void> {
  await deleteItem(STORES.SAVED_ALBUMS, id);
}

/** Toggle album save status */
export async function toggleSaveAlbum(album: any): Promise<void> {
  const isSaved = await isAlbumSaved(album.id);
  if (isSaved) {
    await deleteAlbum(album.id);
    showToast(`Removed "${album.title}"`);
  } else {
    await saveAlbum(album);
  }
}

// ─── SAVED ARTISTS (LIBRARY) ─────────────────────────────────────────────

/** Get all saved artists */
export async function getSavedArtists(): Promise<SavedArtist[]> {
  return getAllItems<SavedArtist>(STORES.SAVED_ARTISTS);
}

/** Get a saved artist by id */
export async function getSavedArtist(id: string): Promise<SavedArtist | null> {
  const artist = await getItemById<SavedArtist>(STORES.SAVED_ARTISTS, id);
  return artist || null;
}

/** Check if an artist is saved */
export async function isArtistSaved(id: string): Promise<boolean> {
  const artist = await getSavedArtist(id);
  return !!artist;
}

/** Save an artist to library */
export async function saveArtist(id: string, name: string, picture: string, data?: any): Promise<void> {
  await saveItem<SavedArtist>(STORES.SAVED_ARTISTS, {
    id,
    name,
    picture,
    data,
  });
  showToast(`Saved "${name}"`);
}

/** Remove an artist from library */
export async function deleteArtist(id: string): Promise<void> {
  await deleteItem(STORES.SAVED_ARTISTS, id);
}

/** Toggle artist save status */
export async function toggleSaveArtist(id: string, name: string, picture: string): Promise<void> {
  const isSaved = await isArtistSaved(id);
  if (isSaved) {
    await deleteArtist(id);
    showToast(`Removed "${name}"`);
  } else {
    await saveArtist(id, name, picture);
  }
}
