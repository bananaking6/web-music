import { showToast } from "../utils/helpers";

/** Get all playlist ids from localStorage */
export function getPlaylistIds(): string[] {
  const ids: string[] = [];
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key) && key.startsWith("playlist_")) {
      ids.push(key.replace("playlist_", ""));
    }
  }
  return ids;
}

/** Load a playlist by id */
export function getPlaylist(id: string): any | null {
  try {
    return JSON.parse(localStorage.getItem(`playlist_${id}`) || "null");
  } catch {
    return null;
  }
}

/** Save a playlist to localStorage */
export function savePlaylist(id: string, pl: any): void {
  localStorage.setItem(`playlist_${id}`, JSON.stringify(pl));
}

/** Create a new playlist */
export function createPlaylist(
  id = crypto.randomUUID(),
  title = "Untitled Playlist",
): string {
  const pl = { title, tracks: [], duration: 0, numberOfTracks: 0, id };
  savePlaylist(id, pl);
  return id;
}

/** Delete a playlist by id */
export function deletePlaylist(id: string): void {
  localStorage.removeItem(`playlist_${id}`);
}

/** Toggle a track in a playlist (add if absent, remove if present) */
export function toggleTrackInPlaylist(
  plId: string,
  track: any,
  add: boolean,
): void {
  const key = `playlist_${plId}`;
  const plRaw = localStorage.getItem(key);
  if (!plRaw) return;
  let pl = JSON.parse(plRaw);
  if (!pl.tracks) pl.tracks = [];

  if (add) {
    if (!pl.tracks.some((t: any) => t.id === track.id)) {
      pl.tracks.push(track);
      showToast(`Added to "${pl.title}"`);
    }
  } else {
    const before = pl.tracks.length;
    pl.tracks = pl.tracks.filter((t: any) => t.id !== track.id);
    if (pl.tracks.length !== before) showToast(`Removed from "${pl.title}"`);
  }

  localStorage.setItem(key, JSON.stringify(pl));
}

/** Get all pinned items */
export function getPinned(): any[] {
  return JSON.parse(localStorage.getItem("pinned") || "[]");
}

/** Save pinned items */
export function savePinned(pinned: any[]): void {
  localStorage.setItem("pinned", JSON.stringify(pinned));
}

/** Toggle a pinned album */
export function togglePinnedAlbum(al: any): void {
  const pinned = getPinned();
  const idx = pinned.findIndex(
    ([type, data]: any) => type === "album" && data.id === al.id,
  );
  if (idx !== -1) pinned.splice(idx, 1);
  else pinned.push(["album", al]);
  savePinned(pinned);
}

/** Toggle a pinned artist */
export function togglePinnedArtist(id: string, name: string, pic: string): void {
  const pinned = getPinned();
  const idx = pinned.findIndex(
    ([type, data]: any) => type === "artist" && data[0] === id,
  );
  if (idx !== -1) pinned.splice(idx, 1);
  else pinned.push(["artist", [id, name, pic]]);
  savePinned(pinned);
}
