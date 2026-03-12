import { API, IMG, PROXY } from "../utils/constants";

/** Fetch the streaming URL for a track */
export async function getTrackUrl(track: any): Promise<string> {
  const res = await fetch(
    `${API}/track/?id=${track.id}${PROXY ? "%26" : "&"}quality=LOW`,
  );
  const data = await res.json();
  return PROXY + JSON.parse(atob(data.data.manifest)).urls[0];
}

/** Search for songs, artists, and albums */
export async function searchQuery(
  param: string,
  q: string,
): Promise<any | null> {
  try {
    const res = await fetch(
      `${API}/search/?${param}=${encodeURIComponent(q)}`,
    );
    const data = await res.json();
    return data?.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch full album data by id */
export async function fetchAlbum(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${API}/album/?id=${id}`);
    const data = await res.json();
    return data?.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch artist primary info */
export async function fetchArtist(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${API}/artist/?id=${id}`);
    const data = await res.json();
    return data?.data ?? data ?? null;
  } catch {
    return null;
  }
}

/** Fetch extended artist content (albums, singles, tracks) */
export async function fetchArtistContent(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${API}/artist/?f=${id}&skip_tracks=true`);
    const data = await res.json();
    return data?.data ?? data ?? null;
  } catch {
    return null;
  }
}

/** Fetch lyrics for a track */
export async function fetchLyrics(trackId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/lyrics/?id=${trackId}`);
    const data = await res.json();
    return data?.lyrics?.subtitles ?? null;
  } catch {
    return null;
  }
}

/** Build a cover image URL from a cover id */
export function coverUrl(cover: string, size = "320x320"): string {
  return `${IMG}${cover.replaceAll("-", "/")}/${size}.jpg`;
}
