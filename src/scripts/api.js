/**
 * API configuration and all remote fetch helpers.
 */

export const PROXY =
  location.hostname === "localhost"
    ? ""
    : "https://api.codetabs.com/v1/proxy/?quest=";

export const API = PROXY + "https://api.monochrome.tf";
export const IMG = PROXY + "https://resources.tidal.com/images/";

/** Build a TIDAL image URL from a cover UUID. */
export function imgUrl(cover, size = "320x320") {
  return `${IMG}${cover.replaceAll("-", "/")}/${size}.jpg`;
}

/** Fetch the streaming URL for a track. */
export async function getTrackUrl(track) {
  const res = await fetch(
    `${API}/track/?id=${track.id}${PROXY ? "%26" : "&"}quality=LOW`,
  );
  const data = await res.json();
  return PROXY + JSON.parse(atob(data.data.manifest)).urls[0];
}

/** Fetch full album metadata (cover, artists, release date, etc.). */
export async function fetchAlbumData(id) {
  const res = await fetch(`${API}/album/?id=${id}`);
  const data = await res.json();
  return data?.data ?? null;
}

/** Fetch an album and return its track list. */
export async function fetchAlbum(id) {
  const res = await fetch(`${API}/album/?id=${id}`);
  const data = await res.json();
  return (data?.data?.items || []).map((t) => t.item);
}

/** Fetch primary artist metadata. */
export async function fetchArtist(id) {
  const res = await fetch(`${API}/artist/?id=${id}`);
  const json = await res.json();
  const d = json.data || json;
  return d.artist || (Array.isArray(d) ? d[0] : d);
}

/** Fetch full artist content (albums, singles, tracks). */
export async function fetchArtistContent(id) {
  const res = await fetch(`${API}/artist/?f=${id}&skip_tracks=true`);
  const json = await res.json();
  const d = json.data || json;
  return Array.isArray(d) ? d : [d];
}

/** Fetch synchronized lyrics for a track. */
export async function fetchLyrics(id) {
  const res = await fetch(`${API}/lyrics/?id=${id}`);
  const data = await res.json();
  return data?.lyrics?.subtitles ?? null;
}

/**
 * Search a single category and return raw API data.
 * @param {"s"|"a"|"al"} type - songs (s), artists (a), albums (al)
 * @param {string} q - search query
 */
export async function searchCategory(type, q) {
  const encoded = PROXY ? q.replaceAll(" ", "%2B") : encodeURIComponent(q);
  const res = await fetch(`${API}/search/?${type}=${encoded}`);
  const data = await res.json();
  return data?.data ?? null;
}
