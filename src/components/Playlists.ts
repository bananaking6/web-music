import {
  getPlaylistIds,
  getPlaylist,
  createPlaylist,
  deletePlaylist,
  toggleTrackInPlaylist,
  getPinned,
} from "../lib/localStorage";
import { coverUrl } from "../lib/api";
import { showToast } from "../utils/helpers";
import { queue, index } from "../lib/audioPlayer";
import { fetchAlbum } from "../lib/api";

const timeTooltip = document.getElementById("timeTooltip")!;
let tooltipHideTimeout: ReturnType<typeof setTimeout>;

/** Update tooltip position to follow cursor */
function updateTooltipPosition(e: MouseEvent) {
  timeTooltip.style.left = e.clientX + 10 + "px";
  timeTooltip.style.top = e.clientY - 30 + "px";
}

/** Show a tooltip with card information on hover */
function showCardTooltip(element: HTMLElement, text: string, e: MouseEvent) {
  clearTimeout(tooltipHideTimeout);
  timeTooltip.textContent = text;
  updateTooltipPosition(e);
  timeTooltip.classList.add("visible");
}

/** Hide the tooltip */
function hideCardTooltip() {
  tooltipHideTimeout = setTimeout(() => {
    timeTooltip.classList.remove("visible");
  }, 100);
}

/** Open a playlist in the album view */
export async function openPlaylist(id: string, pushHistory = true) {
  const pl = await getPlaylist(id);
  if (!pl) {
    console.warn("Playlist not found:", id);
    return;
  }
  import("../components/Navigation").then(({ showView }) => {
    showView("album", pushHistory, { id: id, route: "playlist" });
    import("../components/AlbumPage").then(({ openAlbum }) =>
      openAlbum({
      title: pl.title,
      type: "PLAYLIST",
      cover: "5806b59b-2f3d-4d0a-8541-e75de4e58f2c",
      releaseDate: `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 1}`,
      artists: [{ name: "You" }],
      playlistTracks: pl.tracks || [],
      duration: pl.duration,
      numberOfTracks: pl.numberOfTracks,
      id: id,
      skipRoutePush: true,
    }),
    );
  });
}

/** Load and display pinned artists */
async function loadPinnedArtists() {
  const artistsBar = document.getElementById("artists");
  if (!artistsBar) return;
  
  artistsBar.innerHTML = "";
  const pinnedItems = await getPinned();
  const artists = pinnedItems.filter((item: any) => item.type === "artist");
  
  if (artists.length === 0) {
    artistsBar.innerHTML = '<div style="color: var(--color-text-muted); padding: var(--space-md); font-size: 0.9rem;">No pinned artists</div>';
    return;
  }
  
  artists.forEach((pinnedItem: any) => {
    const ar = pinnedItem.data;
    const pDiv = document.createElement("div");
    pDiv.className = "card";
    
    const img = document.createElement("img");
    img.src = coverUrl(ar[2]);
    img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
    pDiv.appendChild(img);
    pDiv.onclick = () =>
      import("../components/ArtistPage").then(({ openArtist }) =>
        openArtist(ar[0], ar[1], ar[2])
      );
    pDiv.addEventListener("mouseenter", (e) => 
      showCardTooltip(pDiv, ar[1], e as MouseEvent)
    );
    pDiv.addEventListener("mousemove", updateTooltipPosition);
    pDiv.addEventListener("mouseleave", hideCardTooltip);
    
    artistsBar.appendChild(pDiv);
  });
}

/** Load and display pinned albums */
async function loadPinnedAlbums() {
  const albumsBar = document.getElementById("albums");
  if (!albumsBar) return;
  
  albumsBar.innerHTML = "";
  const pinnedItems = await getPinned();
  const albums = pinnedItems.filter((item: any) => item.type === "album");
  
  if (albums.length === 0) {
    albumsBar.innerHTML = '<div style="color: var(--color-text-muted); padding: var(--space-md); font-size: 0.9rem;">No pinned albums</div>';
    return;
  }
  
  albums.forEach((pinnedItem: any) => {
    const al = pinnedItem.data;
    const pDiv = document.createElement("div");
    pDiv.className = "card";
    
    const img = document.createElement("img");
    img.src = coverUrl(al.cover);
    img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
    pDiv.appendChild(img);
    pDiv.onclick = () =>
      import("../components/AlbumPage").then(({ openAlbum }) => openAlbum(al));
    pDiv.addEventListener("mouseenter", (e) => 
      showCardTooltip(pDiv, al.title, e as MouseEvent)
    );
    pDiv.addEventListener("mousemove", updateTooltipPosition);
    pDiv.addEventListener("mouseleave", hideCardTooltip);
    
    albumsBar.appendChild(pDiv);
  });
}

/** Render sidebar playlists and pinned items */
export async function loadPlaylists() {
  const playlistsBar = document.getElementById("playlists")!;
  playlistsBar.innerHTML = "";

  const playlistIds = await getPlaylistIds();
  for (const id of playlistIds) {
    const pl = await getPlaylist(id);
    if (!pl) continue;

    const plDiv = document.createElement("div");
    plDiv.className = "card";

    // Mosaic cover from up to 4 distinct album covers in the playlist
    const covers: string[] = [];
    const seenCovers = new Set<string>();
    for (const t of pl.tracks) {
      if (t.album?.cover && !seenCovers.has(t.album.cover)) {
        seenCovers.add(t.album.cover);
        covers.push(t.album.cover);
        if (covers.length === 4) break;
      }
    }

    if (covers.length > 0) {
      const grid = document.createElement("div");
      grid.style.cssText =
        "display: grid; grid-template-columns: repeat(2, 1fr); width: 100%; height: 100%;";
      covers.forEach((cover) => {
        const img = document.createElement("img");
        img.src = coverUrl(cover);
        img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
        grid.appendChild(img);
      });
      plDiv.appendChild(grid);
    }

    plDiv.onclick = () => openPlaylist(id);
    plDiv.addEventListener("mouseenter", (e) => 
      showCardTooltip(plDiv, `${pl.title} (${pl.numberOfTracks} ${pl.numberOfTracks === 1 ? "track" : "tracks"})`, e as MouseEvent)
    );
    plDiv.addEventListener("mousemove", updateTooltipPosition);
    plDiv.addEventListener("mouseleave", hideCardTooltip);
    playlistsBar.appendChild(plDiv);
  }

  // Load and display pinned artists and albums
  await loadPinnedArtists();
  await loadPinnedAlbums();

  // Load and display history
  await loadHistory();

  // Load and display queue
  loadLibraryQueue();
}

/** Build the playlist checkbox list inside the modal */
export async function buildPlaylistListForModal(options: {
  tracks: any[];
  headerText?: string;
}) {
  const tracks = options.tracks || [];
  const modal = document.getElementById("playlistModal")!;
  const list = document.getElementById("playlistList")!;

  const header = modal.querySelector("h3");
  if (header && options.headerText !== undefined) header.textContent = options.headerText;

  list.innerHTML = "";

  const playlistIds = await getPlaylistIds();
  for (const id of playlistIds) {
    let pl = await getPlaylist(id);
    if (!pl) continue;

    const div = document.createElement("div");
    div.className = "playlist-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `chk-${id}`;

    const tracksInPlaylist = tracks.filter((t) => {
      return pl!.tracks.some((p: any) => p.id === t.id);
    }).length;

    if (tracks.length === 1) {
      checkbox.checked = tracksInPlaylist === 1;
      checkbox.indeterminate = false;
    } else {
      checkbox.checked = tracksInPlaylist === tracks.length && tracks.length > 0;
      checkbox.indeterminate =
        tracksInPlaylist > 0 && tracksInPlaylist < tracks.length;
    }

    checkbox.onchange = async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (tracks.length === 1) {
        await toggleTrackInPlaylist(id, tracks[0], checked);
      } else {
        for (const t of tracks) {
          await toggleTrackInPlaylist(id, t, checked);
        }
      }
      pl = await getPlaylist(id);
      const updatedCount = tracks.filter((t) =>
        pl!.tracks.some((p: any) => p.id === t.id),
      ).length;
      checkbox.checked = updatedCount === tracks.length && tracks.length > 0;
      checkbox.indeterminate = updatedCount > 0 && updatedCount < tracks.length;
    };

    const label = document.createElement("label");
    label.htmlFor = `chk-${id}`;
    label.textContent = pl.title || "";

    div.appendChild(checkbox);
    div.appendChild(label);
    div.onclick = (e) => {
      if (e.target !== checkbox && e.target !== label) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };

    list.appendChild(div);
  }
}

/** Open the add-to-playlist modal for a single track */
export async function openAddToPlaylistModal(track?: any) {
  if (!track) {
    if (queue.length > 0) {
      track = queue[index];
    } else {
      showToast("No track selected");
      return;
    }
  }
  const modal = document.getElementById("playlistModal")!;
  modal.classList.remove("hidden");
  await buildPlaylistListForModal({
    tracks: [track],
    headerText: `Add "${track.title || track.name || "Track"}" to Playlist`,
  });
  modal.dataset.modalType = "single";
  modal.dataset.trackId = track.id;
}

/** Open the add-to-playlist modal for a full album */
export async function openAddAlbumToPlaylistModal(tracks: any[], albumTitle: string) {
  if (!tracks?.length) {
    showToast("No tracks to add");
    return;
  }
  const modal = document.getElementById("playlistModal")!;
  modal.classList.remove("hidden");
  await buildPlaylistListForModal({
    tracks,
    headerText: `Add "${albumTitle}" to Playlist`,
  });
  modal.dataset.modalType = "multi";
  delete modal.dataset.trackId;
}

/** Open the add-to-playlist modal for all tracks of an artist */
export async function openAddArtistToPlaylistModal(albums: any[], artist: any) {
  const modal = document.getElementById("playlistModal")!;
  if (!modal) return;
  try {
    const trackArrays = await Promise.all(
      albums.map((al) => fetchAlbum(al.id).then((data) => data?.items || [])),
    );
    const tracks = trackArrays.flat();
    modal.classList.remove("hidden");
    await buildPlaylistListForModal({
      tracks,
      headerText: `Add "${artist.name}" to Playlist`,
    });
    modal.dataset.modalType = "multi";
    delete modal.dataset.trackId;
  } catch (e) {
    console.error("Failed to fetch album tracks:", e);
  }
}

/** Close the playlist modal */
export async function closePlaylistModal() {
  document.getElementById("playlistModal")!.classList.add("hidden");
  await loadPlaylists();
}

/** Show a right-click context menu for a track */
export async function showTrackContextMenu(x: number, y: number, track: any) {
  let menu = document.getElementById("trackContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "trackContextMenu";
    menu.className = "context-menu";
    menu.style.cssText =
      "position:absolute;z-index:9999;background:#fff;border:1px solid rgba(0,0,0,0.12);box-shadow:0 2px 8px rgba(0,0,0,0.12);padding:4px 0;display:none;";
    document.body.appendChild(menu);
    document.addEventListener("click", () => { menu!.style.display = "none"; });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") menu!.style.display = "none";
    });
  }

  menu.innerHTML = "";

  const makeItem = (text: string, onClick: () => void) => {
    const it = document.createElement("div");
    it.className = "context-menu-item";
    it.style.cssText = "padding:8px 16px;cursor:pointer;";
    it.textContent = text;
    it.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onClick();
      menu!.style.display = "none";
    });
    it.addEventListener("mouseover", () => (it.style.background = "rgba(0,0,0,0.04)"));
    it.addEventListener("mouseout", () => (it.style.background = "transparent"));
    return it;
  };

  menu.appendChild(makeItem("Add to playlist...", () => openAddToPlaylistModal(track)));

  const divider = document.createElement("div");
  divider.style.cssText = "height:1px;margin:6px 0;background:rgba(0,0,0,0.06);";
  menu.appendChild(divider);

  let foundAny = false;
  const playlistIds = await getPlaylistIds();
  for (const id of playlistIds) {
    const pl = await getPlaylist(id);
    if (!pl) continue;
    menu.appendChild(
      makeItem(`Quick add to ${pl.title}`, async () => {
        await toggleTrackInPlaylist(id, track, true);
      }),
    );
    foundAny = true;
  }

  if (!foundAny) {
    menu.appendChild(
      makeItem("No playlists yet — create one", async () => {
        await createPlaylist();
        await loadPlaylists();
      }),
    );
  }

  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
}

/** Attach a right-click context menu to a track DOM element */
export function setupTrackContextMenu(el: HTMLElement, track: any) {
  if (!el || !track) return;
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showTrackContextMenu(e.pageX, e.pageY, track);
  });
}

/** Load and display history of recently viewed albums and artists */
export async function loadHistory() {
  const { getHistory } = await import("../lib/localStorage");
  const history = await getHistory();
  
  const historyBar = document.getElementById("history");
  if (!historyBar) return;
  
  historyBar.innerHTML = "";
  
  if (history.length === 0) {
    historyBar.innerHTML = '<div style="color: var(--color-text-muted); padding: var(--space-md);">No recent items</div>';
    return;
  }
  
  history.forEach((item) => {
    const data = item.data;
    const card = document.createElement("div");
    card.className = "card";
    
    // Create card with icon and title
    const titleDiv = document.createElement("div");
    titleDiv.style.cssText = "padding: var(--space-md); background: var(--color-bg-elevated); border-radius: var(--radius-md); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 150px; gap: var(--space-sm);";
    
    // Add icon if available
    if (data.icon) {
      const img = document.createElement("img");
      // Icon is stored as full URL (from coverUrl for artists, or already a URL for albums)
      img.src = data.icon;
      img.style.cssText = "width: 80px; height: 80px; border-radius: var(--radius-md); object-fit: cover;";
      titleDiv.appendChild(img);
    }
    
    // Add title
    const textSpan = document.createElement("span");
    textSpan.textContent = item.title;
    textSpan.style.cssText = "font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;";
    titleDiv.appendChild(textSpan);
    
    card.appendChild(titleDiv);
    card.onclick = () => {
      if (data.view === "album") {
        import("../components/AlbumPage").then(({ openAlbumById }) =>
          openAlbumById(data.id, true)
        );
      } else if (data.view === "artist") {
        import("../components/ArtistPage").then(({ openArtistById }) =>
          openArtistById(data.id, true)
        );
      }
    };
    
    card.addEventListener("mouseenter", (e) => 
      showCardTooltip(card, item.title, e as MouseEvent)
    );
    card.addEventListener("mousemove", updateTooltipPosition);
    card.addEventListener("mouseleave", hideCardTooltip);
    
    historyBar.appendChild(card);
  });
}

/** Render the current queue in the library view */
export function loadLibraryQueue() {
  const el = document.getElementById("libraryQueue");
  if (!el) return;
  el.innerHTML = "";

  if (queue.length === 0) {
    el.innerHTML = '<div style="color: var(--color-text-muted); padding: var(--space-md);">Queue is empty</div>';
    return;
  }

  queue.forEach((t, i) => {
    const row = document.createElement("div");
    row.style.cssText = "display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-sm); cursor: pointer;";
    row.onmouseenter = () => row.style.background = "var(--color-bg-elevated)";
    row.onmouseleave = () => { row.style.background = ""; };

    const img = document.createElement("img");
    img.src = coverUrl(t.album?.cover);
    img.style.cssText = "width: 36px; height: 36px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0;";
    row.appendChild(img);

    const info = document.createElement("div");
    info.style.cssText = "flex: 1; min-width: 0; overflow: hidden;";
    const title = document.createElement("div");
    title.textContent = t.title || "Unknown";
    title.style.cssText = "font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
    info.appendChild(title);

    const artist = document.createElement("div");
    artist.textContent = t.artists?.map((a: any) => a.name).join(", ") || "";
    artist.style.cssText = "font-size: 0.75rem; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
    info.appendChild(artist);
    row.appendChild(info);

    row.onclick = () => {
      import("../lib/audioPlayer").then(({ loadTrack, setIndex }) => {
        setIndex(i);
        loadTrack(t);
      });
    };

    el.appendChild(row);
  });
}

/** Clear all history from localStorage */
export async function clearHistory() {
  const { clearHistoryItems } = await import("../lib/localStorage");
  await clearHistoryItems();
  await loadHistory();
  showToast("History cleared");
}

/** Create a new playlist from within the modal */
export async function createNewPlaylistFromModal() {
  await createPlaylist();
  await closePlaylistModal();
}

/** Create a new playlist from library and refresh instantly */
export async function createPlaylistAndRefresh() {
  await createPlaylist();
  await loadPlaylists();
}

/** Add entire queue to a playlist */
export async function addCurrentTrackToPlaylist() {
  const { queue } = await import("../lib/audioPlayer");
  if (queue.length === 0) {
    showToast("Queue is empty");
    return;
  }
  openAddAlbumToPlaylistModal(queue, "Queue");
}

/** Fetch all tracks from artist and auto-create a playlist */
export async function createArtistPlaylist(artistId: string, artistName: string) {
  try {
    showToast(`Loading ${artistName}'s tracks...`);
    const { fetchArtistContent } = await import("../lib/api");
    
    const content = await fetchArtistContent(artistId);
    if (!content || !content.tracks) {
      showToast("Could not fetch artist content");
      return;
    }
    
    // Use tracks directly from artist content, with smart deduplication
    const allTracks = content.tracks || [];
    const trackMap = new Map<string, any[]>();
    
    // Group tracks by ID to handle duplicates across albums/singles
    allTracks.forEach((t: any) => {
      const key = t.id;
      if (!trackMap.has(key)) {
        trackMap.set(key, []);
      }
      trackMap.get(key)!.push(t);
    });
    
    // Deduplicate by ID: prefer album versions, keep re-recordings
    const idDeduped: any[] = [];
    trackMap.forEach((versions) => {
      if (versions.length === 1) {
        idDeduped.push(versions[0]);
        return;
      }
      
      // Sort versions: albums first, then by metadata richness
      const sorted = versions.sort((a, b) => {
        const aIsAlbum = a.album?.type !== "SINGLE" && a.album?.type !== "EP";
        const bIsAlbum = b.album?.type !== "SINGLE" && b.album?.type !== "EP";
        
        if (aIsAlbum !== bIsAlbum) {
          return aIsAlbum ? -1 : 1; // Albums first
        }
        
        // If same type, prefer version with more metadata
        const aTags = a.album?.mediaMetadata?.tags?.length || 0;
        const bTags = b.album?.mediaMetadata?.tags?.length || 0;
        return bTags - aTags;
      });
      
      // Keep the best version plus any re-recordings
      idDeduped.push(sorted[0]);
      for (let i = 1; i < sorted.length; i++) {
        const title = sorted[i].title || "";
        if (title.toLowerCase().includes("rerecord") || title.toLowerCase().includes("re-record") || 
            title.toLowerCase().includes("remaster") || title.toLowerCase().includes("re-master")) {
          idDeduped.push(sorted[i]);
        }
      }
    });
    
    // Deduplicate by exact title: keep only one per title unless it's an alternate version
    const titleMap = new Map<string, any[]>();
    idDeduped.forEach((t: any) => {
      const title = t.title || "";
      const key = title.toLowerCase();
      if (!titleMap.has(key)) {
        titleMap.set(key, []);
      }
      titleMap.get(key)!.push(t);
    });
    
    const deduped: any[] = [];
    titleMap.forEach((versions) => {
      if (versions.length === 1) {
        deduped.push(versions[0]);
        return;
      }
      
      // Sort: prefer versions without alternate markers, then keep alternates
      const mainVersion = versions.find((v) => {
        const title = v.title || "";
        return !title.match(/\(.*?mix.*?\)|\(.*?alternate.*?\)|\(.*?version.*?\)|\(.*?edit.*?\)/i);
      }) || versions[0];
      
      deduped.push(mainVersion);
      
      // Keep alternate mixes/versions
      for (const v of versions) {
        if (v !== mainVersion) {
          const title = v.title || "";
          if (title.match(/\(.*?mix.*?\)|\(.*?alternate.*?\)|\(.*?version.*?\)|\(.*?edit.*?\)/i)) {
            deduped.push(v);
          }
        }
      }
    });
    
    if (deduped.length === 0) {
      showToast("No tracks found for this artist");
      return;
    }
    
    // Ensure each track has artist info and sort by release date
    const tracksWithArtist = deduped.map((t: any) => ({
      ...t,
      artist: { name: artistName },
      artists: t.artists || [{ name: artistName }],
    }));
    
    const sorted = tracksWithArtist.sort((a: any, b: any) => {
      const dateA = new Date(a.album?.releaseDate || "1970-01-01").getTime();
      const dateB = new Date(b.album?.releaseDate || "1970-01-01").getTime();
      return dateA - dateB; // Oldest first
    });
    
    // Auto-create playlist
    const plId = await createPlaylist(undefined, `${artistName}`);
    const duration = sorted.reduce((sum: number, t: any) => sum + (t.duration || 0), 0);
    const pl = {
      id: plId,
      title: artistName,
      tracks: sorted,
      numberOfTracks: sorted.length,
      duration,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const { savePlaylist } = await import("../lib/localStorage");
    await savePlaylist(plId, pl);
    await loadPlaylists();
    showToast(`Created "${artistName}" playlist with ${sorted.length} tracks`);
  } catch (error) {
    console.error("Error creating artist playlist:", error);
    showToast("Error creating playlist");
  }
}

/** Initialize playlist sidebar and modal close button */
export async function initPlaylists() {
  await loadPlaylists();

  // Modal backdrop close
  document.getElementById("playlistModal")!.addEventListener("click", async (e) => {
    if (e.target === document.getElementById("playlistModal")) await closePlaylistModal();
  });
}
