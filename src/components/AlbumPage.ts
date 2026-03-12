import { fetchAlbum, fetchSimilarAlbums } from "../lib/api";
import { coverUrl } from "../lib/api";
import { formatTime, formatDate, showLoadingSpinner } from "../utils/helpers";
import { addToQueue, playTracks, downloadAlbum } from "../lib/audioPlayer";
import {
  openAddToPlaylistModal,
  openAddAlbumToPlaylistModal,
  loadPlaylists,
} from "../components/Playlists";
import { showView, addToViewHistory } from "../components/Navigation";
import {
  togglePinnedAlbum,
  deletePlaylist,
  getPlaylist,
  savePlaylist,
} from "../lib/localStorage";
import { showToast } from "../utils/helpers";

/** Show loading placeholder */
function showLoadingPlaceholder() {
  showLoadingSpinner("album");
}

/** Render a single track row for the album/playlist track list */
export function renderTrackRow(track: any, options?: { number?: number; isPlaylist?: boolean }): HTMLElement {
  const d = document.createElement("div");
  d.className = "song-row";
  
  const numberPart = options?.number !== undefined ? `<span style="min-width: 30px; text-align: right; color: var(--color-text-muted);">${options.number}</span>` : "";
  const albumIconPart = options?.isPlaylist ? `<img src="${coverUrl(track.album?.cover)}" alt="album" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;">` : "";
  const artistPart = options?.isPlaylist && track.artist ? `<span style="color: var(--color-text-muted); font-size: 0.9rem;">${track.artist.name || "Unknown"}</span>` : "";
  
  d.innerHTML = `
    ${numberPart}
    ${albumIconPart}
    <div style="flex: 1; overflow: hidden;">
      <div style="display: flex; align-items: center; gap: 4px; overflow: hidden;">
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.title}</span>
        ${track.explicit ? '<img src="e.svg" style="flex-shrink: 0;">' : ""}
      </div>
      ${artistPart}
    </div>
    <span class="right">${track.key ? `${track.key} ` : ""}${track.bpm ? `${track.bpm} BPM ` : ""}${formatTime(track.duration)}</span>
  `;
  d.onclick = () => addToQueue(track);
  d.oncontextmenu = (e) => {
    e.preventDefault();
    openAddToPlaylistModal(track);
  };
  return d;
}

/** Open the album view, fetching track data if needed */
export async function openAlbum(al: any) {
  // Push history with album ID
  const isPlaylist = al.type === "PLAYLIST";
  if (!al.skipRoutePush) {
    const { showView: sv } = await import("../components/Navigation");
    sv("album", true, { id: al.id, route: isPlaylist ? "playlist" : "album" });
  }
  await renderAlbumContent(al);
}

/** Open album by ID (used for history/deep-linking) */
export async function openAlbumById(id: string, pushHistory = true) {
  showLoadingPlaceholder();
  
  try {
    const pl = await getPlaylist(id);
    if (pl) {
      const { showView: sv } = await import("../components/Navigation");
      sv("album", pushHistory, { id, route: "playlist" });
      const al = { ...pl, type: "PLAYLIST" } as any;
      await renderAlbumContent(al);
    } else {
      const { showView: sv } = await import("../components/Navigation");
      sv("album", pushHistory, { id, route: "album" });
      // Try fetching as regular album
      const data = await fetchAlbum(id);
      if (data) {
        data.id = id;
        data.type = "ALBUM";
        data.artists = data.artists || [{ name: "Unknown Artist" }];
        await renderAlbumContent(data);
      } else {
        showToast("Failed to load album after multiple retries");
      }
    }
  } catch (error) {
    showToast("Error loading album");
    console.error(error);
  }
}

/** Render album/playlist content */
async function renderAlbumContent(al: any) {
  const el = document.getElementById("album")!;
  const isPlaylist = al.type === "PLAYLIST";
  const dateStr = formatDate(al.releaseDate);

  el.innerHTML = `
    <img id="albumCover" src="${coverUrl(al.cover)}" alt="cover">
    <div>
      <h2 id="albumTitle" style="cursor: ${isPlaylist ? "pointer" : "default"}">${al.title}</h2>
      <h3 id="albumArtist">${al.artists[0].name}${dateStr ? " • " + dateStr : ""}</h3>
      <span id="albumInfo">${al.numberOfTracks} ${al.numberOfTracks === 1 ? "song" : "songs"} • ${formatTime(al.duration)}${al.copyright ? " • " + al.copyright : ""}</span>
      <span style="display: block; font-size: 0.85rem; color: var(--color-text-muted); margin-top: var(--space-sm);">ID: ${al.id}</span>
    </div>
    <div style="margin-top: 20px; display: flex; gap: 10px;">
      <button class="album-action" id="playAll">PLAY</button>
      <button class="album-action secondary" id="shufflePlay">SHUFFLE</button>
      <button class="album-action secondary" id="addAllPlaylist">+ PLAYLIST</button>
      <button class="album-action secondary" id="extraAction" style="display: none;"></button>
      <button class="album-action secondary" id="downloadAlbum">↓</button>
    </div>
    <div id="albumTracks"></div>
  `;
  
  // Add to view history with cover icon (skip playlists)
  if (!isPlaylist) {
    addToViewHistory(al.id, al.title, "album", coverUrl(al.cover));
  }

  // Artist link (if artist info available)
  if (al.artists[0].id && al.artists[0].name && al.artists[0].picture) {
    const artistEl = el.querySelector("#albumArtist") as HTMLElement;
    artistEl.onclick = () => {
      import("../components/ArtistPage").then(({ openArtist }) =>
        openArtist(al.artists[0].id, al.artists[0].name, al.artists[0].picture),
      );
    };
    artistEl.classList.add("clickable");
  }

  let tracks: any[] = [];

  if (isPlaylist) {
    tracks = al.playlistTracks.map((t: any) => t);
    const titleEl = el.querySelector("#albumTitle") as HTMLElement;
    const extraBtn = el.querySelector("#extraAction") as HTMLButtonElement;
    extraBtn.textContent = "Delete Playlist";
    extraBtn.style.display = "inline-block";

    // Editable playlist title
    titleEl.addEventListener("click", () => {
      titleEl.contentEditable = "true";
      titleEl.focus();
      const save = async () => {
        titleEl.contentEditable = "false";
        const newTitle = titleEl.textContent?.trim();
        if (!newTitle) return;

        const current = await getPlaylist(al.id);
        if (current) {
          await savePlaylist(al.id, { ...current, title: newTitle });
          showToast(`Playlist renamed to "${newTitle}"`);
          await loadPlaylists();
        }
      };
      titleEl.addEventListener("blur", () => {
        void save();
      }, { once: true });
      titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void save();
        }
      }, { once: true });
    });

    extraBtn.onclick = async () => {
      if (confirm(`Delete "${al.title}"?`)) {
        await deletePlaylist(al.id);
        showToast(`Deleted "${al.title}"`);
        await loadPlaylists();
        import("../components/Navigation").then(({ showView: sv }) => sv("search"));
      }
    };

    // Playlist mosaic cover
    const grid = document.createElement("div");
    grid.className = "playlist-cover";
    const seenCovers = new Set<string>();
    const covers: string[] = [];
    for (const t of tracks) {
      if (t.album.cover && !seenCovers.has(t.album.cover)) {
        seenCovers.add(t.album.cover);
        covers.push(t.album.cover);
        if (covers.length === 4) break;
      }
    }
    const gridSize = Math.ceil(Math.sqrt(covers.length));
    grid.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
    covers.forEach((cover) => {
      const img = document.createElement("img");
      img.src = coverUrl(cover);
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
      grid.appendChild(img);
    });
    el.querySelector("#albumCover")!.replaceWith(grid);
  } else {
    // Regular album: fetch tracks from API
    const tracksContainer = el.querySelector("#albumTracks")!;
    tracksContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100px;"><div style="font-size: 2rem; animation: spin 2s linear infinite;">Σ</div></div>';
    
    const data = await fetchAlbum(al.id);
    if (data) {
      tracks = (data?.items || []).map((t: any) => t.item);
    } else {
      showToast("Failed to load album tracks");
      tracksContainer.innerHTML = '<div style="color: var(--color-text-muted); padding: 20px;">Failed to load tracks</div>';
    }

    const extraBtn = el.querySelector("#extraAction") as HTMLButtonElement;
    extraBtn.textContent = "Pin Album";
    extraBtn.style.display = "inline-block";
    extraBtn.onclick = () => {
      togglePinnedAlbum(al);
      loadPlaylists();
    };
  }

  const tracksContainer = el.querySelector("#albumTracks")!;
  tracksContainer.innerHTML = "";
  tracks.forEach((track, index) => {
    const options = isPlaylist 
      ? { isPlaylist: true }
      : { number: index + 1 };
    tracksContainer.appendChild(renderTrackRow(track, options));
  });

  el.querySelector("#playAll")!.addEventListener("click", () => playTracks(tracks, false));
  el.querySelector("#shufflePlay")!.addEventListener("click", () => playTracks(tracks, true));
  el.querySelector("#addAllPlaylist")!.addEventListener("click", () =>
    openAddAlbumToPlaylistModal(tracks, al.title),
  );
  el.querySelector("#downloadAlbum")!.addEventListener("click", () =>
    downloadAlbum(al, tracks),
  );

  // Load and display similar albums (only for non-playlist albums)
  if (!isPlaylist && al.id) {
    loadSimilarAlbums(al.id);
  }
}

/** Parse ISO 8601 duration string to milliseconds */
function parseDuration(durationStr: string | number | undefined): number {
  if (typeof durationStr === "number") return durationStr;
  if (!durationStr) return 0;
  // Parse ISO 8601 duration like "PT1H10M49S"
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseFloat(match[3] || "0");
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/** Normalize similar album data to match expected structure */
function normalizeSimilarAlbum(al: any): any {
  return {
    ...al,
    numberOfTracks: al.numberOfTracks || al.numberOfItems || 0,
    duration: parseDuration(al.duration) || 0,
    copyright: typeof al.copyright === "string" ? al.copyright : (al.copyright?.text || ""),
  };
}

/** Load and display similar albums */
async function loadSimilarAlbums(albumId: string) {
  const el = document.getElementById("album")!;
  try {
    const similar = await fetchSimilarAlbums(albumId);
    if (!similar || similar.length === 0) return;

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<h3>Similar Albums</h3>";

    const container = document.createElement("div");
    container.className = "cards";

    for (const al of similar.slice(0, 12)) {
      const card = document.createElement("div");
      card.style.cursor = "pointer";
      const img = coverUrl(al.cover);
      card.innerHTML = `
        <div style="position: relative; width: 100%; aspect-ratio: 1; border-radius: var(--radius-md); overflow: hidden; background: var(--color-bg-elevated);">
          <img src="${img}" alt="${al.title}" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
        <div style="padding: var(--space-sm) 0; min-height: 50px; display: flex; flex-direction: column; justify-content: center;">
          <div style="font-size: 0.9rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${al.title}</div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${al.artists?.[0]?.name || "Unknown"}</div>
        </div>
      `;
      card.onclick = () => {
        const normalized = normalizeSimilarAlbum(al);
        openAlbum({
          ...normalized,
          type: "ALBUM",
          artists: normalized.artists || [{ name: "Unknown Artist" }],
        });
      };
      container.appendChild(card);
    }

    row.appendChild(container);
    el.appendChild(row);
  } catch (error) {
    console.log("Could not load similar albums:", error);
  }
}
