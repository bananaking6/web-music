/**
 * Application entry point.
 *
 * Imports all modules, defines browse/playlist functions, registers
 * cross-module callbacks, and sets up global event listeners.
 */

import { API, IMG } from "./api.js";
import { showView, showToast, formatTime, formatDate, createCard, dedupItems } from "./ui.js";
import {
  audio,
  queue,
  index,
  preloadedAudio,
  addToQueue,
  clearQueue,
  updateQueue,
  toggleQueue,
  loadTrack,
  next,
  prev,
  togglePlay,
  toggleLyrics,
  releaseTrack,
  downloadTrack,
  downloadAlbum,
  reverseAudio,
  saveSessionStorage,
  loadSessionStorage,
  registerOpenArtist,
  registerOpenAlbum,
} from "./player.js";
import { registerSearchCallbacks } from "./search.js";

/* --- Playlist management --- */

/** Initialise the default "Favorites" playlist on first run. */
if (!localStorage.getItem("playlist-favorites")) {
  createPlaylist("favorites", "Favorites");
  localStorage.setItem("playlist-favorites", "true");
}

/** Open a saved playlist as an album view. */
function openPlaylist(id) {
  const pl = JSON.parse(localStorage.getItem(`playlist_${id}`) || "null");
  if (pl) {
    openAlbum({
      title: pl.title,
      type: "PLAYLIST",
      cover: pl.cover || "5806b59b-2f3d-4d0a-8541-e75de4e58f2c",
      // Use getDate()-1 because formatDate() adds +1 day to correct for UTC
      // parsing; together they display today's date correctly.
      releaseDate: `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 1}`,
      artists: [{ name: "You" }],
      playlistTracks: pl.tracks || [],
      duration: pl.duration,
      numberOfTracks: pl.numberOfTracks,
      id: pl.id,
    });
  } else {
    console.warn("Playlist not found:", id);
  }
}

/**
 * Create a new playlist and persist it.
 * @param {string} [id]
 * @param {string} [title]
 */
function createPlaylist(
  id = crypto.randomUUID(),
  title = "Untitled Playlist",
) {
  const pl = { title, tracks: [], duration: 0, numberOfTracks: 0, id };
  localStorage.setItem(`playlist_${id}`, JSON.stringify(pl));
  loadPlaylists();
}

/** Delete a playlist by ID. */
function deletePlaylist(id) {
  localStorage.removeItem(`playlist_${id}`);
  loadPlaylists();
}

/**
 * Toggle a track's presence in a playlist.
 * @param {string} plId
 * @param {Object} track
 * @param {boolean} add
 */
function toggleTrackInPlaylist(plId, track, add) {
  try {
    const key = `playlist_${plId}`;
    const plRaw = localStorage.getItem(key);
    if (!plRaw) return;
    const pl = JSON.parse(plRaw);
    if (!pl.tracks) pl.tracks = [];

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

/** Re-render the sidebar playlists and pinned items. */
function loadPlaylists() {
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
    const seenCovers = new Set();
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
        img.src = `${IMG}${cover.replaceAll("-", "/")}/320x320.jpg`;
        img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
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
  pinned.forEach((pinnedItem) => {
    const pDiv = document.createElement("div");
    pDiv.className = "card";
    if (pinnedItem[0] === "album") {
      const al = pinnedItem[1];
      pDiv.title = al.title;
      const img = document.createElement("img");
      img.src = `${IMG}${al.cover.replaceAll("-", "/")}/320x320.jpg`;
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
      pDiv.appendChild(img);
      pDiv.onclick = () => openAlbum(al);
    } else if (pinnedItem[0] === "artist") {
      const ar = pinnedItem[1];
      pDiv.title = ar[1];
      const img = document.createElement("img");
      img.src = `${IMG}${ar[2].replaceAll("-", "/")}/320x320.jpg`;
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
      pDiv.appendChild(img);
      pDiv.onclick = () => openArtist(ar[0], ar[1], ar[2]);
    }
    pinnedBar.appendChild(pDiv);
  });
}

/* --- Playlist modal --- */

/**
 * Populate and show the "Add to Playlist" modal.
 * @param {{ tracks: Object[], headerText: string }} options
 */
function buildPlaylistListForModal(options) {
  const tracks = options.tracks || [];
  const modal = document.getElementById("playlistModal");
  const list = document.getElementById("playlistList");
  if (!modal || !list) return;

  const header = modal.querySelector("h3");
  if (header && options.headerText !== undefined)
    header.textContent = options.headerText;

  list.innerHTML = "";

  for (const key in localStorage) {
    if (!Object.prototype.hasOwnProperty.call(localStorage, key)) continue;
    if (!key.startsWith("playlist_")) continue;

    try {
      let pl = JSON.parse(localStorage.getItem(key));
      const plId = key.replace("playlist_", "");
      const div = document.createElement("div");
      div.className = "playlist-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `chk-${plId}`;

      const tracksInPlaylist = tracks.filter((t) =>
        pl.tracks.some((p) => p.id === t.id),
      ).length;

      if (tracks.length === 1) {
        checkbox.checked = tracksInPlaylist === 1;
        checkbox.indeterminate = false;
      } else {
        checkbox.checked =
          tracksInPlaylist === tracks.length && tracks.length > 0;
        checkbox.indeterminate =
          tracksInPlaylist > 0 && tracksInPlaylist < tracks.length;
      }

      checkbox.onchange = (e) => {
        if (tracks.length === 1) {
          toggleTrackInPlaylist(plId, tracks[0], e.target.checked);
        } else {
          tracks.forEach((t) =>
            toggleTrackInPlaylist(plId, t, e.target.checked),
          );
        }
        pl = JSON.parse(localStorage.getItem(key));
        const updatedCount = tracks.filter((t) =>
          pl.tracks.some((p) => p.id === t.id),
        ).length;
        checkbox.checked = updatedCount === tracks.length && tracks.length > 0;
        checkbox.indeterminate =
          updatedCount > 0 && updatedCount < tracks.length;
      };

      const label = document.createElement("label");
      label.htmlFor = `chk-${plId}`;
      label.textContent = pl.title;

      div.appendChild(checkbox);
      div.appendChild(label);

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

/** Open the "Add to Playlist" modal for a single track (or the current track). */
function openAddToPlaylistModal(track) {
  if (!track) {
    if (queue.length > 0) {
      track = queue[index];
    } else {
      showToast("No track selected");
      return;
    }
  }
  const modal = document.getElementById("playlistModal");
  if (!modal) return;
  const headerText = `Add "${track.title || track.name || "Track"}" to Playlist`;
  modal.classList.remove("hidden");
  buildPlaylistListForModal({ tracks: [track], headerText });
  modal.dataset.modalType = "single";
  modal.dataset.trackId = track.id;
}

/** Open the "Add to Playlist" modal for an entire album's tracks. */
function openAddAlbumToPlaylistModal(tracks, albumTitle) {
  if (!tracks || tracks.length === 0) {
    showToast("No tracks to add");
    return;
  }
  const modal = document.getElementById("playlistModal");
  if (!modal) return;
  const headerText = `Add "${albumTitle}" to Playlist`;
  modal.classList.remove("hidden");
  buildPlaylistListForModal({ tracks, headerText });
  modal.dataset.modalType = "multi";
  delete modal.dataset.trackId;
}

/** Open the "Add to Playlist" modal for all tracks by an artist. */
async function openAddArtistToPlaylistModal(albums, artist) {
  const modal = document.getElementById("playlistModal");
  if (!modal) return;
  try {
    const trackArrays = await Promise.all(
      albums.map(async (al) => {
        const response = await fetch(`${API}/album/?id=${al.id}`);
        const data = await response.json();
        return data?.data?.items || [];
      }),
    );
    const tracks = trackArrays.flat();
    const headerText = `Add "${artist.name}" to Playlist`;
    modal.classList.remove("hidden");
    buildPlaylistListForModal({ tracks, headerText });
    modal.dataset.modalType = "multi";
    delete modal.dataset.trackId;
  } catch (error) {
    console.error("Failed to fetch album tracks:", error);
  }
}

/** Close the playlist modal and refresh the sidebar. */
function closePlaylistModal() {
  document.getElementById("playlistModal")?.classList.add("hidden");
  loadPlaylists();
}

/**
 * Create a new playlist from within the modal dialog (triggered by the
 * "+ New Playlist" button).
 */
function createNewPlaylistFromModal() {
  const name = prompt("Playlist name:");
  if (name?.trim()) {
    createPlaylist(crypto.randomUUID(), name.trim());
    showToast(`Playlist "${name.trim()}" created`);
    // Refresh the modal list if it is open
    const modal = document.getElementById("playlistModal");
    if (modal && !modal.classList.contains("hidden")) {
      buildPlaylistListForModal({ tracks: [], headerText: "Add to Playlist" });
    }
  }
}

/* --- Context menu --- */

/** Attach a right-click context menu to a track element. */
function setupTrackContextMenu(el, track) {
  if (!el || !track) return;
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showTrackContextMenu(e.pageX, e.pageY, track);
  });
}

/** Show a floating context menu at (x, y) for the given track. */
function showTrackContextMenu(x, y, track) {
  let menu = document.getElementById("trackContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "trackContextMenu";
    menu.className = "context-menu";
    menu.style.cssText =
      "position:absolute;z-index:9999;background:#fff;border:1px solid rgba(0,0,0,.12);box-shadow:0 2px 8px rgba(0,0,0,.12);padding:4px 0;display:none;";
    document.body.appendChild(menu);
    document.addEventListener("click", () => (menu.style.display = "none"));
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") menu.style.display = "none";
    });
  }

  menu.innerHTML = "";

  const makeItem = (text, onClick) => {
    const it = document.createElement("div");
    it.className = "context-menu-item";
    it.style.cssText = "padding:8px 16px;cursor:pointer;";
    it.textContent = text;
    it.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onClick(ev);
      menu.style.display = "none";
    });
    it.addEventListener("mouseover", () => (it.style.background = "rgba(0,0,0,.04)"));
    it.addEventListener("mouseout", () => (it.style.background = "transparent"));
    return it;
  };

  menu.appendChild(
    makeItem("Add to playlist...", () => openAddToPlaylistModal(track)),
  );

  const divider = document.createElement("div");
  divider.style.cssText = "height:1px;margin:6px 0;background:rgba(0,0,0,.06);";
  menu.appendChild(divider);

  let foundAny = false;
  for (const key in localStorage) {
    if (!Object.prototype.hasOwnProperty.call(localStorage, key)) continue;
    if (!key.startsWith("playlist_")) continue;
    try {
      const pl = JSON.parse(localStorage.getItem(key));
      const plId = key.replace("playlist_", "");
      menu.appendChild(
        makeItem("Quick add to " + pl.title, () =>
          toggleTrackInPlaylist(plId, track, true),
        ),
      );
      foundAny = true;
    } catch {
      // skip broken entries
    }
  }

  if (!foundAny) {
    menu.appendChild(
      makeItem("No playlists yet — create one", () =>
        createNewPlaylistFromModal(),
      ),
    );
  }

  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
}

/* --- Browse: Artist page --- */

function deduplicateAlbums(albums) {
  const unique = new Map();
  for (const album of albums) {
    if (!album || !album.title) continue;
    const key = JSON.stringify([album.title, album.numberOfTracks || 0]);
    if (unique.has(key)) {
      const existing = unique.get(key);
      const existingExplicit = existing.explicit || false;
      const newExplicit = album.explicit || false;
      if (newExplicit && !existingExplicit) {
        unique.set(key, album);
        continue;
      }
      if (!newExplicit && existingExplicit) continue;
      const existingTags = existing.mediaMetadata?.tags?.length || 0;
      const newTags = album.mediaMetadata?.tags?.length || 0;
      if (newTags > existingTags) {
        unique.set(key, album);
        continue;
      }
      if ((album.popularity || 0) > (existing.popularity || 0)) {
        unique.set(key, album);
      }
    } else {
      unique.set(key, album);
    }
  }
  return Array.from(unique.values());
}

/**
 * Navigate to and render an artist page.
 * @param {string} id
 * @param {string} name
 * @param {string} pic
 */
async function openArtist(id, name, pic) {
  showView("artist");
  const el = document.getElementById("artist");
  el.innerHTML = `<div id="artistBanner">
    <img src="${IMG + pic.replaceAll("-", "/")}/750x750.jpg" alt="${name}">
    <h2>${name}</h2>
  </div>
  <div id="artistContent"></div>`;

  el.querySelector("h2").onclick = () => {
    const pinned = JSON.parse(localStorage.getItem("pinned")) || [];
    const item = ["artist", [id, name, pic]];
    const idx = pinned.findIndex(
      ([type, data]) => type === "artist" && data[0] === id,
    );
    if (idx !== -1) {
      pinned.splice(idx, 1);
    } else {
      pinned.push(item);
    }
    localStorage.setItem("pinned", JSON.stringify(pinned));
    loadPlaylists();
  };

  const content = document.getElementById("artistContent");

  const [primaryResponse, contentResponse] = await Promise.all([
    fetch(`${API}/artist/?id=${id}`),
    fetch(`${API}/artist/?f=${id}&skip_tracks=true`),
  ]);

  const primaryJson = await primaryResponse.json();
  const primaryData = primaryJson.data || primaryJson;
  const rawArtist =
    primaryData.artist ||
    (Array.isArray(primaryData) ? primaryData[0] : primaryData);

  const contentJson = await contentResponse.json();
  const contentData = contentJson.data || contentJson;
  const entries = Array.isArray(contentData) ? contentData : [contentData];

  const albumMap = new Map();
  const trackMap = new Map();
  const isTrack = (v) => v?.id && v.duration && v.album;
  const isAlbum = (v) => v?.id && "numberOfTracks" in v;

  const scan = (value, visited = new Set()) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => scan(item, visited));
      return;
    }
    const item = value.item || value;
    if (isAlbum(item)) albumMap.set(item.id, item);
    if (isTrack(item)) trackMap.set(item.id, item);
    Object.values(value).forEach((n) => scan(n, visited));
  };
  entries.forEach((entry) => scan(entry));

  const allAlbums = deduplicateAlbums(Array.from(albumMap.values()));
  const albums = allAlbums.filter((a) => !["EP", "SINGLE"].includes(a.type));
  const epsAndSingles = allAlbums.filter((a) =>
    ["EP", "SINGLE"].includes(a.type),
  );

  const tracks = Array.from(trackMap.values())
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 15);

  if (tracks.length) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<h3>Top Tracks</h3>";
    const container = document.createElement("div");
    tracks.forEach((t) => {
      const d = document.createElement("div");
      d.className = "song-row";
      d.textContent = t.title;
      d.onclick = () => addToQueue(t);
      d.oncontextmenu = (e) => {
        e.preventDefault();
        fetch(`${API}/album/?id=${t.album.id}`)
          .then((r) => r.json())
          .then((data) => {
            const fullTrack = data?.data?.items.find(
              (item) => item.item.id === t.id,
            )?.item;
            if (fullTrack) {
              openAddToPlaylistModal(fullTrack);
            } else {
              showToast("Failed to find track");
            }
          });
      };
      container.appendChild(d);
    });
    row.appendChild(container);
    content.appendChild(row);
  }

  const renderSection = (title, items) => {
    if (!items.length) return;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<h3>${title}</h3>`;
    const container = document.createElement("div");
    container.className = "cards";
    items.forEach((al) => {
      const img = al.cover
        ? `${IMG}${al.cover.replaceAll("-", "/")}/320x320.jpg`
        : "";
      container.appendChild(createCard(img, al.title, () => openAlbum(al)));
    });
    row.appendChild(container);
    content.appendChild(row);
  };

  renderSection("Albums", albums);
  renderSection("EPs & Singles", epsAndSingles);
}

/* --- Browse: Album page --- */

function renderTrackRow(track) {
  const d = document.createElement("div");
  d.className = "song-row";
  d.innerHTML = `
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${track.title}</span>
    ${track.explicit ? '<img src="/e.svg">' : ""}
    <span class="right">${track.key ? `${track.key} ` : ""}${track.bpm ? `${track.bpm} BPM ` : ""}${formatTime(track.duration)}</span>
  `;
  d.onclick = () => addToQueue(track);
  d.oncontextmenu = (e) => {
    e.preventDefault();
    openAddToPlaylistModal(track);
  };
  return d;
}

/**
 * Play a list of tracks, optionally shuffled.
 * @param {Object[]} trackList
 * @param {boolean} [shuffle=false]
 */
function playTracks(trackList, shuffle = false) {
  clearQueue();
  const toPlay = [...trackList];
  if (shuffle) toPlay.sort(() => Math.random() - 0.5);
  toPlay.forEach((t) => queue.push(t));
  loadTrack(queue[0]);
  updateQueue();
}

/**
 * Navigate to and render an album or playlist view.
 * @param {Object} al - Album or playlist object
 */
async function openAlbum(al) {
  showView("album");
  const el = document.getElementById("album");
  const isPlaylist = al.type === "PLAYLIST";
  const dateStr = formatDate(al.releaseDate);

  el.innerHTML = `
    <img id="albumCover" src="${IMG}${al.cover.replaceAll("-", "/")}/320x320.jpg" alt="cover">
    <div>
      <h2 id="albumTitle" style="cursor:${isPlaylist ? "pointer" : "default"}">${al.title}</h2>
      <h3 id="albumArtist">${al.artists[0].name}${dateStr ? " • " + dateStr : ""}</h3>
      <span id="albumInfo">${al.numberOfTracks} ${al.numberOfTracks === 1 ? "song" : "songs"} • ${formatTime(al.duration)}${al.copyright ? " • " + al.copyright : ""}</span>
    </div>
    <div style="margin-top:20px;display:flex;gap:10px;">
      <button class="album-action" id="playAll">PLAY</button>
      <button class="album-action secondary" id="shufflePlay">SHUFFLE</button>
      <button class="album-action secondary" id="addAllPlaylist">+ PLAYLIST</button>
      <button class="album-action secondary" id="extraAction" style="display:none;"></button>
      <button class="album-action secondary" id="downloadAlbum">↓</button>
    </div>
    <div id="albumTracks"></div>
  `;

  if (al.artists[0].id && al.artists[0].name && al.artists[0].picture) {
    el.querySelector("#albumArtist").onclick = () => {
      openArtist(al.artists[0].id, al.artists[0].name, al.artists[0].picture);
    };
    el.querySelector("#albumArtist").classList.add("clickable");
  }

  let tracks = [];

  if (isPlaylist) {
    tracks = al.playlistTracks.map((t) => t);
    const titleEl = el.querySelector("#albumTitle");
    const extraBtn = el.querySelector("#extraAction");
    extraBtn.textContent = "Delete Playlist";
    extraBtn.style.display = "inline-block";

    titleEl.addEventListener("click", () => {
      titleEl.contentEditable = true;
      titleEl.focus();
      const save = () => {
        titleEl.contentEditable = false;
        const newTitle = titleEl.textContent.trim();
        if (newTitle) {
          const pl = JSON.parse(
            localStorage.getItem(`playlist_${al.id}`) || "null",
          );
          if (pl) {
            pl.title = newTitle;
            localStorage.setItem(`playlist_${al.id}`, JSON.stringify(pl));
            showToast(`Playlist renamed to "${newTitle}"`);
            loadPlaylists();
          }
        }
      };
      titleEl.addEventListener("blur", save, { once: true });
      titleEl.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        },
        { once: true },
      );
    });

    extraBtn.onclick = () => {
      if (confirm(`Delete "${al.title}"?`)) {
        deletePlaylist(al.id);
        showToast(`Deleted "${al.title}"`);
        loadPlaylists();
        showView("search");
      }
    };

    const grid = document.createElement("div");
    grid.className = "playlist-cover";
    const seenCovers = new Set();
    const covers = [];
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
      img.src = `${IMG}${cover.replaceAll("-", "/")}/320x320.jpg`;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;";
      grid.appendChild(img);
    });
    el.querySelector("#albumCover").replaceWith(grid);
  } else {
    const data = await fetch(`${API}/album/?id=${al.id}`).then((r) =>
      r.json(),
    );
    tracks = (data?.data?.items || []).map((t) => t.item);

    const extraBtn = el.querySelector("#extraAction");
    extraBtn.textContent = "Pin Album";
    extraBtn.style.display = "inline-block";
    extraBtn.onclick = () => {
      const pinned = JSON.parse(localStorage.getItem("pinned")) || [];
      const item = ["album", al];
      const idx = pinned.findIndex(
        ([type, data]) => type === "album" && data.id === al.id,
      );
      if (idx !== -1) pinned.splice(idx, 1);
      else pinned.push(item);
      localStorage.setItem("pinned", JSON.stringify(pinned));
      loadPlaylists();
    };
  }

  const tracksContainer = el.querySelector("#albumTracks");
  tracks.forEach((track) =>
    tracksContainer.appendChild(renderTrackRow(track)),
  );

  el.querySelector("#playAll").onclick = () => playTracks(tracks, false);
  el.querySelector("#shufflePlay").onclick = () => playTracks(tracks, true);
  el.querySelector("#addAllPlaylist").onclick = () =>
    openAddAlbumToPlaylistModal(tracks, al.title);
  el.querySelector("#downloadAlbum").onclick = () => downloadAlbum(al, tracks);
}

/* --- Register cross-module callbacks --- */

registerOpenArtist(openArtist);
registerOpenAlbum(openAlbum);
registerSearchCallbacks({ addToQueue, openArtist, openAlbum });

/* --- Mobile navigation --- */

document.addEventListener("DOMContentLoaded", () => {
  const mobileNav = document.getElementById("mobileNav");

  function updateNavVisibility() {
    if (window.innerWidth <= 768) {
      mobileNav?.classList.remove("hidden");
    } else {
      mobileNav?.classList.add("hidden");
    }
  }

  const navButtons = mobileNav?.querySelectorAll("button");

  function updateNavHighlight() {
    const activeView = document.querySelector(".view:not(.hidden)");
    if (!activeView) return;
    navButtons?.forEach((btn) => btn.classList.remove("active"));
    if (activeView.id === "home")
      document.getElementById("navHome")?.classList.add("active");
    if (activeView.id === "search")
      document.getElementById("navSearch")?.classList.add("active");
  }

  navButtons?.forEach((btn) => {
    btn.addEventListener("click", () => setTimeout(updateNavHighlight, 50));
  });

  window.addEventListener("showViewEvent", updateNavHighlight);
  window.addEventListener("resize", updateNavVisibility);

  updateNavVisibility();
  updateNavHighlight();

  loadPlaylists();

  // Restore session
  if (sessionStorage.getItem("queue")) loadSessionStorage();
});

/* --- Sidebar "Queue" button --- */
document.getElementById("queueSidebarBtn")?.addEventListener("click", () => {
  openAlbum({
    title: "Queue",
    type: "PLAYLIST",
    cover: "",
    // Use getDate()-1 because formatDate() adds +1 day to correct for UTC
    // parsing; together they display today's date correctly.
    releaseDate: `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 1}`,
    artists: [{ name: "Various Artists" }],
    playlistTracks: queue,
    duration: queue.reduce((sum, t) => sum + t.duration, 0),
    numberOfTracks: queue.length,
    id: "queue",
  });
});

/* --- Playlist modal backdrop close --- */
document.getElementById("playlistModal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closePlaylistModal();
});

/* --- Nav button event listeners --- */
document.getElementById("navHome")?.addEventListener("click", () => showView("home"));
document.getElementById("navSearch")?.addEventListener("click", () => showView("search"));
document.getElementById("sideHome")?.addEventListener("click", () => showView("home"));
document.getElementById("sideSearch")?.addEventListener("click", () => showView("search"));
document.getElementById("sideNewPlaylist")?.addEventListener("click", () => createPlaylist());

/* --- Player control buttons --- */
document.getElementById("btnPrev")?.addEventListener("click", prev);
document.getElementById("btnPlay")?.addEventListener("click", togglePlay);
document.getElementById("btnNext")?.addEventListener("click", next);
document.getElementById("reverseBtn")?.addEventListener("click", () => reverseAudio());
document.getElementById("lyricsBtn")?.addEventListener("click", toggleLyrics);
document.getElementById("queueBtn")?.addEventListener("click", toggleQueue);
document.getElementById("addToPlaylistBtn")?.addEventListener("click", () =>
  openAddToPlaylistModal(),
);
document.getElementById("downloadBtn")?.addEventListener("click", () =>
  downloadTrack(),
);

/* --- Home page buttons --- */
document.getElementById("homeSearchBtn")?.addEventListener("click", () =>
  showView("search"),
);
document.getElementById("homeFavoritesBtn")?.addEventListener("click", () =>
  openPlaylist("favorites"),
);

/* --- Playlist modal buttons --- */
document.getElementById("closePlaylistModalBtn")?.addEventListener("click", closePlaylistModal);
document.getElementById("createPlaylistModalBtn")?.addEventListener("click", createNewPlaylistFromModal);

/* --- Keyboard shortcuts --- */
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  } else if (e.code === "ArrowRight") {
    if (audio.duration)
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  } else if (e.code === "ArrowLeft") {
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }
});

/* --- Mobile gesture prevention --- */
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);
