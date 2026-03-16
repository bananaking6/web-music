import { API, IMG, PROXY } from "../utils/constants";

/** Retry a fetch operation with exponential backoff, up to 3 times */
export async function fetchWithRetry(url: string, maxRetries = 3): Promise<any> {
  let lastError: any = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      // Check if response contains upstream API error
      if (data?.detail && typeof data.detail === "string" && data.detail.includes("Upstream API error")) {
        throw new Error("Upstream API error");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        // Wait with exponential backoff before retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastError;
}

/** Fetch the streaming URL for a track */
export async function getTrackUrl(track: any): Promise<string> {
  const data = await fetchWithRetry(
    `${API}/track/?id=${track.id}${PROXY ? "%26" : "&"}quality=LOW`,
  );
  const manifest = data?.data?.manifest || data?.manifest;
  if (!manifest) throw new Error("No manifest found in track response");
  return PROXY + JSON.parse(atob(manifest)).urls[0];
}

/** Search for songs, artists, and albums */
export async function searchQuery(
  param: string,
  q: string,
): Promise<any | null> {
  if (PROXY) q = q.replaceAll(" ", "%20")
  try {
    const data = await fetchWithRetry(
      `${API}/search/?${param}=${encodeURIComponent(q)}`
    );
    return data?.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch full album data by id */
export async function fetchAlbum(id: string): Promise<any | null> {
  try {
    const data = await fetchWithRetry(`${API}/album/?id=${id}`);
    return data?.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch artist primary info */
export async function fetchArtist(id: string): Promise<any | null> {
  try {
    const data = await fetchWithRetry(`${API}/artist/?id=${id}`);
    return data?.data ?? data ?? null;
  } catch {
    return null;
  }
}

/** Fetch extended artist content (albums, singles, tracks) */
export async function fetchArtistContent(id: string): Promise<any | null> {
  try {
    const data = await fetchWithRetry(`${API}/artist/?f=${id}&skip_tracks=true`);
    return data?.data ?? data ?? null;
  } catch {
    return null;
  }
}

/** Fetch lyrics for a track */
export async function fetchLyrics(trackId: string): Promise<string | null> {
  try {
    const data = await fetchWithRetry(`${API}/lyrics/?id=${trackId}`);
    return data?.lyrics?.subtitles ?? null;
  } catch {
    return null;
  }
}

/** Fetch similar albums by album id */
export async function fetchSimilarAlbums(id: string): Promise<any | null> {
  try {
    const data = await fetchWithRetry(`${API}/album/similar/?id=${id}`);
    return data?.albums ?? null;
  } catch {
    return null;
  }
}

/** Fetch full track data by Tidal ID */
export async function fetchTidalTrack(id: string): Promise<any | null> {
  try {
    const data = await fetchWithRetry(`${API}/info/?id=${id}`);
    return data?.data ?? null;
  } catch {
    return null;
  }
}

/** Build a cover image URL from a cover id */
export function coverUrl(cover: string | undefined, size = "320x320"): string {
  if (!cover) return "";
  return `${IMG}${cover.replaceAll("-", "/")}/${size}.jpg`;
}
