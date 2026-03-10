/**
 * Playlist CRUD, sidebar rendering, "Add to Playlist" modal, and context menu.
 */

import { imgUrl, fetchAlbumData } from "./api.js";
import { showToast, todayISO } from "./ui.js";
import { queue, index } from "./player.js";

// Injected by main.js after browse.js is loaded
let _openAlbum = null;
let _openArtist = null;

export function registerBrowseCallbacks({ openAlbum, openArtist }) {
  _openAlbum = openAlbum;
  _openArtist = openArtist;
}

/* --- Playlist CRUD --- */

/** Create a playlist and persist to localStorage. */
export function createPlaylist(id = crypto.randomUUID(), title = "Untitled Playlist") {
  const pl = { title, tracks: [], duration: 0, numberOfTracks: 0, id };
  localStorage.setItem(`playlist_${id}`, JSON.stringify(pl));
  loadPlaylists();
}

/** Delete a playlist by ID. */
export function deletePlaylist(id) {
  localStorage.removeItem(`playlist_${id}`);
  loadPlaylists();
}

/** Open a playlist in the album view. */
export function openPlaylist(id) {
  const pl = JSON.parse(localStorage.getItem(`playlist_${id}`) || "null");
  if (!pl) { console.warn("Playlist not found:", id); return; }
  _openAlbum?.({
    title: pl.title,
    type: "PLAYLIST",
    cover: pl.cover || "5806b59b-2f3d-4d0a-8541-e75de4e58f2c",
    releaseDate: todayISO(),
    artists: [{ name: "You" }],
    playlistTracks: pl.tracks || [],
    duration: pl.duration,
    numberOfTracks: pl.numberOfTracks,
    id: pl.id,
  });
}

/**
 * Add or remove a track from a playlist.
 * @param {string} plId
 * @param {Object} track
 * @param {boolean} add
 */
export function toggleTrackInPlaylist(plId, track, add) {
  try {
    const key = `playlist_${plId}`;
    const pl = JSON.parse(localStorage.getItem(key) || "null");
    if (!pl) return;
    pl.tracks = pl.tracks || [];

    if (add) {
      if (!pl.tracks.some((t) => t.id === track.id)) {
        pl.tracks.push(track);
        showToast(`Added to "${pl.title}"`);
      }
    } else {
      const before = pl.tracks.length;
      pl.tracks = pl.tracks.filter((t) => t.id !== track.id);
      if (pl.tracks.length !== before) showToast(`Removed from "${pl.title}"`);
    }
    localStorage.setItem(key, JSON.stringify(pl));
  } catch (e) {
    console.error("toggleTrackInPlaylist error", e);
  }
}

/** Re-render sidebar playlists and pinned items. */
export function loadPlaylists() {
  const playlistsBar = document.getElementById("playlists");
  if (!playlistsBar) return;
  playlistsBar.innerHTML = "";

  for (const key in localStorage) {
    if (!key.startsWith("playlist_")) continue;
    const pl = JSON.parse(localStorage.getItem(key));
    const plId = key.replace("playlist_", "");
    const plDiv = document.createElement("div");
    plDiv.className = "card";
    plDiv.title = pl.title;

    const covers = [];
    const seen = new Set();
    for (const t of pl.tracks) {
      if (t.album?.cover && !seen.has(t.album.cover)) {
        seen.add(t.album.cover);
        covers.push(t.album.cover);
        if (covers.length === 4) break;
      }
    }

    if (covers.length > 0) {
      const grid = document.createElement("div");
      grid.className = "cover-grid";
      covers.forEach((cover) => {
        const img = document.createElement("img");
        img.src = imgUrl(cover);
        grid.appendChild(img);
      });
      plDiv.appendChild(grid);
    }

    plDiv.onclick = () => openPlaylist(plId);
    playlistsBar.appendChild(plDiv);
  }

  const pinnedBar = document.getElementById("pinned");
  if (!pinnedBar) return;
  pinnedBar.innerHTML = "";
  const pinned = JSON.parse(localStorage.getItem("pinned")) || [];

  pinned.forEach(([type, data]) => {
    const pDiv = document.createElement("div");
    pDiv.className = "card";
    const img = document.createElement("img");

    if (type === "album") {
      pDiv.title = data.title;
      img.src = imgUrl(data.cover);
      pDiv.appendChild(img);
      pDiv.onclick = () => _openAlbum?.(data);
    } else if (type === "artist") {
      pDiv.title = data[1];
      img.src = imgUrl(data[2]);
      pDiv.appendChild(img);
      pDiv.onclick = () => _openArtist?.(data[0], data[1], data[2]);
    }
    pinnedBar.appendChild(pDiv);
  });
}

/* --- Playlist modal --- */

function buildPlaylistListForModal(tracks, headerText) {
  const modal = document.getElementById("playlistModal");
  const list = document.getElementById("playlistList");
  if (!modal || !list) return;

  if (headerText) {
    const h = modal.querySelector("h3");
    if (h) h.textContent = headerText;
  }
  list.innerHTML = "";

  for (const key in localStorage) {
    if (!Object.prototype.hasOwnProperty.call(localStorage, key)) continue;
    if (!key.startsWith("playlist_")) continue;
    try {
      const pl = JSON.parse(localStorage.getItem(key));
      const plId = key.replace("playlist_", "");

      const div = document.createElement("div");
      div.className = "playlist-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `chk-${plId}`;

      const count = tracks.filter((t) => pl.tracks.some((p) => p.id === t.id)).length;
      checkbox.checked = count === tracks.length && tracks.length > 0;
      checkbox.indeterminate = count > 0 && count < tracks.length;

      checkbox.onchange = (e) => {
        tracks.forEach((t) => toggleTrackInPlaylist(plId, t, e.target.checked));
        const updated_pl = JSON.parse(localStorage.getItem(key));
        const updated = tracks.filter((t) => updated_pl.tracks.some((p) => p.id === t.id)).length;
        checkbox.checked = updated === tracks.length && tracks.length > 0;
        checkbox.indeterminate = updated > 0 && updated < tracks.length;
      };

      const label = document.createElement("label");
      label.htmlFor = `chk-${plId}`;
      label.textContent = pl.title;

      div.append(checkbox, label);
      div.onclick = (e) => {
        if (e.target !== checkbox && e.target !== label) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
      };
      list.appendChild(div);
    } catch (e) {
      console.error("Error parsing playlist", key, e);
    }
  }
}

function showModal(tracks, headerText) {
  document.getElementById("playlistModal")?.classList.remove("hidden");
  buildPlaylistListForModal(tracks, headerText);
}

/** Open "Add to Playlist" modal for a single track (or current track). */
export function openAddToPlaylistModal(track) {
  const t = track || queue[index];
  if (!t) { showToast("No track selected"); return; }
  showModal([t], `Add "${t.title || "Track"}" to Playlist`);
}

/** Open modal for all tracks in an album. */
export function openAddAlbumToPlaylistModal(tracks, albumTitle) {
  if (!tracks?.length) { showToast("No tracks to add"); return; }
  showModal(tracks, `Add "${albumTitle}" to Playlist`);
}

/** Open modal for all tracks by an artist (fetches album tracks). */
export async function openAddArtistToPlaylistModal(albums, artist) {
  const modal = document.getElementById("playlistModal");
  if (!modal) return;
  try {
    const results = await Promise.all(
      albums.map((al) => fetchAlbumData(al.id).then((d) => d?.items || [])),
    );
    showModal(results.flat(), `Add "${artist.name}" to Playlist`);
  } catch (err) {
    console.error("Failed to fetch artist tracks:", err);
  }
}

/** Close the playlist modal and refresh the sidebar. */
export function closePlaylistModal() {
  document.getElementById("playlistModal")?.classList.add("hidden");
  loadPlaylists();
}

/** Prompt for a name and create a new playlist. */
export function createNewPlaylistFromModal() {
  const name = prompt("Playlist name:");
  if (!name?.trim()) return;
  createPlaylist(crypto.randomUUID(), name.trim());
  showToast(`Playlist "${name.trim()}" created`);
  buildPlaylistListForModal([], "Add to Playlist");
}

/* --- Context menu --- */

/** Attach a right-click context menu to a track element. */
export function setupTrackContextMenu(el, track) {
  el?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showTrackContextMenu(e.pageX, e.pageY, track);
  });
}

/** Show a floating context menu for a track. */
export function showTrackContextMenu(x, y, track) {
  let menu = document.getElementById("trackContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "trackContextMenu";
    menu.className = "context-menu";
    document.body.appendChild(menu);
    document.addEventListener("click", () => (menu.style.display = "none"));
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") menu.style.display = "none";
    });
  }

  menu.innerHTML = "";

  const item = (text, fn) => {
    const el = document.createElement("div");
    el.className = "context-menu-item";
    el.textContent = text;
    el.addEventListener("click", (e) => { e.stopPropagation(); fn(); menu.style.display = "none"; });
    return el;
  };

  menu.appendChild(item("Add to playlist…", () => openAddToPlaylistModal(track)));

  const divider = document.createElement("div");
  divider.className = "context-menu-divider";
  menu.appendChild(divider);

  let hasItems = false;
  for (const key in localStorage) {
    if (!Object.prototype.hasOwnProperty.call(localStorage, key)) continue;
    if (!key.startsWith("playlist_")) continue;
    try {
      const pl = JSON.parse(localStorage.getItem(key));
      const plId = key.replace("playlist_", "");
      menu.appendChild(item(`Quick add to ${pl.title}`, () => toggleTrackInPlaylist(plId, track, true)));
      hasItems = true;
    } catch { /* skip */ }
  }

  if (!hasItems) {
    menu.appendChild(item("No playlists yet — create one", createNewPlaylistFromModal));
  }

  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
}
