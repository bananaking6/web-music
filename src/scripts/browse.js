/**
 * Browse views: artist page and album/playlist page rendering.
 */

import { imgUrl, fetchArtist, fetchArtistContent, fetchAlbum } from "./api.js";
import { showView, showToast, formatTime, formatDate, createCard } from "./ui.js";
import { addToQueue, clearQueue, queue, loadTrack, updateQueue, downloadAlbum } from "./player.js";
import {
  openAddToPlaylistModal,
  openAddAlbumToPlaylistModal,
  loadPlaylists,
} from "./playlists.js";

/* --- Artist page --- */

function deduplicateAlbums(albums) {
  const unique = new Map();
  for (const album of albums) {
    if (!album?.title) continue;
    const key = JSON.stringify([album.title, album.numberOfTracks || 0]);
    if (!unique.has(key)) { unique.set(key, album); continue; }
    const existing = unique.get(key);
    // Prefer explicit version over non-explicit
    if (album.explicit && !existing.explicit) { unique.set(key, album); continue; }
    if (!album.explicit && existing.explicit) continue;
    // Then prefer more metadata tags, then higher popularity
    const existingTags = existing.mediaMetadata?.tags?.length || 0;
    const newTags = album.mediaMetadata?.tags?.length || 0;
    if (newTags > existingTags) { unique.set(key, album); continue; }
    if ((album.popularity || 0) > (existing.popularity || 0)) {
      unique.set(key, album);
    }
  }
  return [...unique.values()];
}

/**
 * Navigate to and render an artist page.
 * @param {string} id
 * @param {string} name
 * @param {string} pic
 */
export async function openArtist(id, name, pic) {
  showView("artist");
  const el = document.getElementById("artist");
  el.innerHTML = `
    <div id="artistBanner">
      <img src="${imgUrl(pic, "750x750")}" alt="${name}">
      <h2>${name}</h2>
    </div>
    <div id="artistContent"></div>`;

  el.querySelector("h2").onclick = () => {
    const pinned = JSON.parse(localStorage.getItem("pinned")) || [];
    const idx = pinned.findIndex(([t, d]) => t === "artist" && d[0] === id);
    if (idx !== -1) pinned.splice(idx, 1);
    else pinned.push(["artist", [id, name, pic]]);
    localStorage.setItem("pinned", JSON.stringify(pinned));
    loadPlaylists();
  };

  const content = document.getElementById("artistContent");
  const [entries] = await Promise.all([fetchArtistContent(id)]);

  const albumMap = new Map();
  const trackMap = new Map();
  const isTrack = (v) => v?.id && v.duration && v.album;
  const isAlbum = (v) => v?.id && "numberOfTracks" in v;

  const scan = (value, visited = new Set()) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) { value.forEach((item) => scan(item, visited)); return; }
    const item = value.item || value;
    if (isAlbum(item)) albumMap.set(item.id, item);
    if (isTrack(item)) trackMap.set(item.id, item);
    Object.values(value).forEach((n) => scan(n, visited));
  };
  entries.forEach((entry) => scan(entry));

  const allAlbums = deduplicateAlbums([...albumMap.values()]);
  const albums = allAlbums.filter((a) => !["EP", "SINGLE"].includes(a.type));
  const epsAndSingles = allAlbums.filter((a) => ["EP", "SINGLE"].includes(a.type));

  const topTracks = [...trackMap.values()]
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 15);

  if (topTracks.length) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<h3>Top Tracks</h3>";
    const container = document.createElement("div");
    topTracks.forEach((t) => {
      const d = document.createElement("div");
      d.className = "song-row";
      d.textContent = t.title;
      d.onclick = () => addToQueue(t);
      d.oncontextmenu = async (e) => {
        e.preventDefault();
        const tracks = await fetchAlbum(t.album.id);
        const full = tracks.find((tr) => tr.id === t.id);
        full ? openAddToPlaylistModal(full) : showToast("Failed to find track");
      };
      container.appendChild(d);
    });
    row.appendChild(container);
    content.appendChild(row);
  }

  const addSection = (title, items) => {
    if (!items.length) return;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<h3>${title}</h3>`;
    const cards = document.createElement("div");
    cards.className = "cards";
    items.forEach((al) => {
      const img = al.cover ? imgUrl(al.cover) : "";
      cards.appendChild(createCard(img, al.title, () => openAlbum(al)));
    });
    row.append(cards);
    content.appendChild(row);
  };

  addSection("Albums", albums);
  addSection("EPs & Singles", epsAndSingles);
}

/* --- Album page --- */

function renderTrackRow(track) {
  const d = document.createElement("div");
  d.className = "song-row";
  d.innerHTML = `
    <span class="song-title">${track.title}</span>
    ${track.explicit ? '<img src="/e.svg" class="explicit-badge">' : ""}
    <span class="right">${track.key ? `${track.key} ` : ""}${track.bpm ? `${track.bpm} BPM ` : ""}${formatTime(track.duration)}</span>
  `;
  d.onclick = () => addToQueue(track);
  d.oncontextmenu = (e) => { e.preventDefault(); openAddToPlaylistModal(track); };
  return d;
}

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
 * @param {Object} al
 */
export async function openAlbum(al) {
  showView("album");
  const el = document.getElementById("album");
  const isPlaylist = al.type === "PLAYLIST";
  const dateStr = formatDate(al.releaseDate);

  el.innerHTML = `
    <img id="albumCover" src="${imgUrl(al.cover)}" alt="cover">
    <div class="album-meta">
      <h2 id="albumTitle" style="cursor:${isPlaylist ? "pointer" : "default"}">${al.title}</h2>
      <h3 id="albumArtist">${al.artists[0].name}${dateStr ? ` • ${dateStr}` : ""}</h3>
      <span id="albumInfo">${al.numberOfTracks} ${al.numberOfTracks === 1 ? "song" : "songs"} • ${formatTime(al.duration)}${al.copyright ? ` • ${al.copyright}` : ""}</span>
    </div>
    <div class="album-actions">
      <button class="album-action" id="playAll">PLAY</button>
      <button class="album-action secondary" id="shufflePlay">SHUFFLE</button>
      <button class="album-action secondary" id="addAllPlaylist">+ PLAYLIST</button>
      <button class="album-action secondary" id="extraAction" style="display:none;"></button>
      <button class="album-action secondary" id="downloadAlbum">↓</button>
    </div>
    <div id="albumTracks"></div>
  `;

  if (al.artists[0].id && al.artists[0].picture) {
    const artistEl = el.querySelector("#albumArtist");
    artistEl.classList.add("clickable");
    artistEl.onclick = () => openArtist(al.artists[0].id, al.artists[0].name, al.artists[0].picture);
  }

  let tracks = [];

  if (isPlaylist) {
    tracks = al.playlistTracks;
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
          const pl = JSON.parse(localStorage.getItem(`playlist_${al.id}`) || "null");
          if (pl) {
            pl.title = newTitle;
            localStorage.setItem(`playlist_${al.id}`, JSON.stringify(pl));
            showToast(`Playlist renamed to "${newTitle}"`);
            loadPlaylists();
          }
        }
      };
      titleEl.addEventListener("blur", save, { once: true });
      titleEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }, { once: true });
    });

    extraBtn.onclick = () => {
      if (confirm(`Delete "${al.title}"?`)) {
        import("./playlists.js").then(({ deletePlaylist }) => {
          deletePlaylist(al.id);
          showToast(`Deleted "${al.title}"`);
          showView("search");
        });
      }
    };

    const grid = document.createElement("div");
    grid.className = "playlist-cover";
    const seen = new Set();
    const covers = [];
    for (const t of tracks) {
      if (t.album?.cover && !seen.has(t.album.cover)) {
        seen.add(t.album.cover);
        covers.push(t.album.cover);
        if (covers.length === 4) break;
      }
    }
    grid.style.gridTemplateColumns = `repeat(${Math.ceil(Math.sqrt(covers.length))}, 1fr)`;
    covers.forEach((cover) => {
      const img = document.createElement("img");
      img.src = imgUrl(cover);
      img.style.cssText = "width:100%;height:100%;object-fit:cover;";
      grid.appendChild(img);
    });
    el.querySelector("#albumCover").replaceWith(grid);
  } else {
    tracks = await fetchAlbum(al.id);
    const extraBtn = el.querySelector("#extraAction");
    extraBtn.textContent = "Pin Album";
    extraBtn.style.display = "inline-block";
    extraBtn.onclick = () => {
      const pinned = JSON.parse(localStorage.getItem("pinned")) || [];
      const idx = pinned.findIndex(([t, d]) => t === "album" && d.id === al.id);
      if (idx !== -1) pinned.splice(idx, 1);
      else pinned.push(["album", al]);
      localStorage.setItem("pinned", JSON.stringify(pinned));
      loadPlaylists();
    };
  }

  el.querySelector("#albumTracks").append(...tracks.map(renderTrackRow));
  el.querySelector("#playAll").onclick = () => playTracks(tracks, false);
  el.querySelector("#shufflePlay").onclick = () => playTracks(tracks, true);
  el.querySelector("#addAllPlaylist").onclick = () => openAddAlbumToPlaylistModal(tracks, al.title);
  el.querySelector("#downloadAlbum").onclick = () => downloadAlbum(al, tracks);
}
