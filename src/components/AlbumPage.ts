import { fetchAlbum } from "../lib/api";
import { coverUrl } from "../lib/api";
import { formatTime, formatDate, showLoadingSpinner } from "../utils/helpers";
import { addToQueue, playTracks, downloadAlbum } from "../lib/audioPlayer";
import {
  openAddToPlaylistModal,
  openAddAlbumToPlaylistModal,
  loadPlaylists,
} from "../components/Playlists";
import { showView, addToViewHistory } from "../components/Navigation";
import { togglePinnedAlbum, deletePlaylist, getPlaylist } from "../lib/localStorage";
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
  const { showView: sv } = await import("../components/Navigation");
  sv("album", true, { id: al.id });
  await renderAlbumContent(al);
}

/** Open album by ID (used for history/deep-linking) */
export async function openAlbumById(id: string, pushHistory = true) {
  const { showView: sv } = await import("../components/Navigation");
  sv("album", pushHistory, { id });
  showLoadingPlaceholder();
  
  try {
    const pl = await getPlaylist(id);
    if (pl) {
      const al = { ...pl, type: "PLAYLIST" } as any;
      await renderAlbumContent(al);
    } else {
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
  
  // Add to view history with cover icon
  addToViewHistory(al.id, al.title, "album", coverUrl(al.cover));

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
      const save = () => {
        titleEl.contentEditable = "false";
        const newTitle = titleEl.textContent?.trim();
        if (newTitle) {
          const key = `playlist_${al.id}`;
          const pl = JSON.parse(localStorage.getItem(key) || "null");
          if (pl) {
            pl.title = newTitle;
            localStorage.setItem(key, JSON.stringify(pl));
            showToast(`Playlist renamed to "${newTitle}"`);
            loadPlaylists();
          }
        }
      };
      titleEl.addEventListener("blur", save, { once: true });
      titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
      }, { once: true });
    });

    extraBtn.onclick = () => {
      if (confirm(`Delete "${al.title}"?`)) {
        deletePlaylist(al.id);
        showToast(`Deleted "${al.title}"`);
        loadPlaylists();
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
}
