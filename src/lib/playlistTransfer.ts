const PROXY = "https://api.codetabs.com/v1/proxy/?quest=";
const SONG_LINK_API = "https://api.song.link/v1-alpha.1/links?url=";

/** Cache for album data to avoid re-fetching */
const albumCache = new Map<string, any>();

/** Fetch and cache full track details from Tidal with album info */
async function fetchTidalTrackWithAlbum(tidalID: string): Promise<any | null> {
  try {
    const { fetchAlbum } = await import("./api");
    
    // First fetch the track to get album ID
    const { fetchTidalTrack } = await import("./api");
    const track = await fetchTidalTrack(tidalID);
    
    if (!track) return null;
    
    const albumId = track.album?.id;
    if (!albumId) return track; // Return track if no album
    
    // Check cache first
    let album = albumCache.get(albumId);
    
    // Fetch album if not cached
    if (!album) {
      album = await fetchAlbum(albumId);
      if (album) {
        albumCache.set(albumId, album);
      }
    }
    
    // Merge track with album data
    if (album) {
      return {
        ...track,
        album: {
          ...track.album,
          ...album,
          id: albumId,
        },
      };
    }
    
    return track;
  } catch {
    return null;
  }
}

/** Extract playlist tracks from Spotify playlist page */
async function getSpotifyPlaylistTracks(playlistID: string): Promise<any[]> {
  try {
    const res = await fetch(
      `${PROXY}${encodeURIComponent(`https://open.spotify.com/embed/playlist/${playlistID}`)}`,
    );
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const scriptTag = doc.querySelector("#__NEXT_DATA__");
    if (!scriptTag?.textContent) throw new Error("Could not parse Spotify playlist");
    const data = JSON.parse(scriptTag.textContent);
    return data.props.pageProps.state.data.entity.trackList || [];
  } catch (error) {
    console.error("Failed to fetch Spotify playlist:", error);
    return [];
  }
}

/** Extract playlist tracks from Apple Music playlist page */
async function getAppleMusicPlaylistTracks(playlistID: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${PROXY}${encodeURIComponent(`https://music.apple.com/us/playlist/${playlistID}`)}`,
    );
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const scriptTag = doc.querySelector("#serialized-server-data");
    if (!scriptTag?.textContent) throw new Error("Could not parse Apple Music playlist");
    const json = JSON.parse(scriptTag.textContent);
    return json.data[0].data.sections[1].items
      .map((track: any) => track?.contentDescriptor?.identifiers?.storeAdamID)
      .filter(Boolean);
  } catch (error) {
    console.error("Failed to fetch Apple Music playlist:", error);
    return [];
  }
}

/** Get track links from song.link API */
async function getTrackLinks(query: string): Promise<any> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const res = await fetch(
      `${PROXY}${encodeURIComponent(SONG_LINK_API + encodedQuery)}`,
    );
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch track links:", error);
    return null;
  }
}

/** Get Tidal track ID from Spotify track URI */
async function getSpotifyTrackID(spotifyTrack: any): Promise<string | null> {
  if (!spotifyTrack?.uri) return null;
  const query = "spotify%3Atrack%3A" + spotifyTrack.uri.replace("spotify:track:", "");
  const data = await getTrackLinks(query);
  if (!data?.linksByPlatform?.tidal?.url) return null;
  const tidalID = data.linksByPlatform.tidal.url.replace("https://listen.tidal.com/track/", "");
  return tidalID;
}

/** Get Tidal track ID from Apple Music ID */
async function getAppleMusicTrackID(appleMusicID: string): Promise<string | null> {
  const query = "song.link/i/" + appleMusicID;
  const data = await getTrackLinks(query);
  if (!data?.linksByPlatform?.tidal?.url) return null;
  const tidalID = data.linksByPlatform.tidal.url.replace("https://listen.tidal.com/track/", "");
  return tidalID;
}

/** Transfer a playlist from external platform with constant 5-concurrent downloads */
export async function transferPlaylist(
  playlistID: string,
  platform: "spotify" | "applemusic",
  onProgress?: (current: number, total: number) => void,
): Promise<any[]> {
  let sourceTracks: any[] = [];

  // Fetch tracks from source platform
  if (platform === "spotify") {
    sourceTracks = await getSpotifyPlaylistTracks(playlistID);
  } else if (platform === "applemusic") {
    const ids = await getAppleMusicPlaylistTracks(playlistID);
    sourceTracks = ids;
  }

  if (!sourceTracks.length) {
    throw new Error(`No tracks found in ${platform} playlist`);
  }

  // Convert object to array if needed
  const trackArray = Array.isArray(sourceTracks) ? sourceTracks : Object.values(sourceTracks);
  
  if (!trackArray.length) {
    throw new Error(`No tracks found in ${platform} playlist`);
  }

  // First pass: Get all Tidal IDs
  const tidalIDs = await Promise.allSettled(
    trackArray.map((track) => {
      if (platform === "spotify") {
        return getSpotifyTrackID(track);
      } else {
        return getAppleMusicTrackID(track);
      }
    })
  );

  // Build a queue of Tidal IDs with their original indices
  const queue: { tidalId: string; index: number }[] = [];
  tidalIDs.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      queue.push({ tidalId: result.value, index });
    }
  });

  if (!queue.length) {
    throw new Error("No tracks could be mapped to Tidal");
  }

  // Second pass: Fetch album data with constant 5-concurrent downloads
  const results: any[] = [];
  let completed = 0;
  const total = queue.length;

  const processQueue = async () => {
    const workers: Promise<void>[] = [];

    // Start 5 workers
    for (let i = 0; i < Math.min(5, queue.length); i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const item = queue.shift();
            if (!item) break;

            const track = await fetchTidalTrackWithAlbum(item.tidalId);
            if (track) {
              results[item.index] = track;
            }

            completed++;
            onProgress?.(completed, total);
          }
        })()
      );
    }

    await Promise.all(workers);
  };

  await processQueue();
  return results.filter((t) => t !== undefined);
}

/** Validate external playlist ID format */
export function validatePlaylistID(id: string, platform: "spotify" | "applemusic"): boolean {
  if (platform === "spotify") {
    // Spotify playlist IDs are typically alphanumeric, 22 chars
    return /^[a-zA-Z0-9]{22}$/.test(id);
  } else if (platform === "applemusic") {
    // Apple Music playlist IDs contain "pl.u-" prefix
    return id.startsWith("pl.u-") || /^[a-zA-Z0-9]{10,}$/.test(id);
  }
  return false;
}
