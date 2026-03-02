let PROXY = "https://api.codetabs.com/v1/proxy/?quest=";
PROXY = "";
const API = PROXY + "https://api.monochrome.tf";
const IMG = PROXY + "https://resources.tidal.com/images/";
const audio = document.getElementById("audio");
const lyricsView = document.getElementById("lyricsView");
const queueView = document.getElementById("queueView");
const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");
const link = document.querySelector("link[rel~='icon']");

let queue = [],
  index = 0,
  words = [],
  audioCtx,
  analyser,
  source;

/* --- MOBILE NAVIGATION --- */
function togglePlaylists() {
  showView("playlists-view");
}

document.addEventListener("DOMContentLoaded", () => {
  const mobileNav = document.getElementById("mobileNav");

  // Show mobile nav on mobile, hide on desktop
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
});

/* --- SPA --- */
function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  window.dispatchEvent(new Event("showViewEvent"));
}

/* --- SEARCH --- */
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchAll(searchInput.value);
});

searchInput.addEventListener("input", (e) => {
  if (searchInput.value.trim() === "") return;
  clearTimeout(searchInput._searchTimeout);
  searchInput._searchTimeout = setTimeout(
    () => searchAll(searchInput.value),
    250,
  );
});

async function searchAll(q) {
  searchResults.innerHTML = "";
  if (PROXY) q = q.replaceAll(" ", "%2B");
  await Promise.all([
    searchSection("Songs", "s", q, renderSongs),
    searchSection("Artists", "a", q, renderArtists),
    searchSection("Albums", "al", q, renderAlbums),
  ]);
}

async function searchSection(title, param, q, render) {
  const res = await fetch(`${API}/search/?${param}=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!data?.data) return;

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<h3>${title}</h3><div class="cards"></div>`;
  searchResults.appendChild(row);
  render(data.data, row.querySelector(".cards"));
}

/* --- CARD --- */
function createCard(img, title, onclick) {
  const card = document.createElement("div");
  card.className = "card";
  card.title = title;
  card.innerHTML = `<img src="${img || ""}" alt="${title}"><span>${title}</span>`;
  card.onclick = onclick;
  return card;
}

/* --- RENDERERS --- */
function dedupItems(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderSongs(data, container) {
  const tracks = data?.tracks?.items || data?.items || [];
  const deduped = dedupItems(
    tracks,
    (t) =>
      `${t.title.toLowerCase()}|${(t.artists || [])
        .map((a) => a.name.toLowerCase())
        .sort()
        .join(",")}`,
  );

  deduped.forEach((t) => {
    const img = t?.album?.cover
      ? `${IMG}${t.album.cover.replaceAll("-", "/")}/320x320.jpg`
      : "";
    container.appendChild(createCard(img, t.title, () => addToQueue(t)));
  });
}

function renderArtists(data, container) {
  const artists = data?.artists?.items || data?.items || [];
  const deduped = dedupItems(artists, (a) =>
    a.name.toLowerCase().replace(/[\s-]/g, ""),
  );

  deduped
    .filter((a) => a.id && a.picture)
    .forEach((a) => {
      const img = `${IMG}${a.picture.replaceAll("-", "/")}/320x320.jpg`;
      container.appendChild(
        createCard(img, a.name, () => openArtist(a.id, a.name, a.picture)),
      );
    });
}

function renderAlbums(data, container) {
  const albums = data?.albums?.items || data?.items || [];
  const deduped = dedupItems(
    albums,
    (al) =>
      `${al.title.toLowerCase()}|${(al.artists || [])
        .map((a) => a.name.toLowerCase())
        .sort()
        .join(",")}`,
  );

  deduped.forEach((al) => {
    const img = al.cover
      ? `${IMG}${al.cover.replaceAll("-", "/")}/320x320.jpg`
      : "";
    container.appendChild(createCard(img, al.title, () => openAlbum(al)));
  });
}

/* --- QUEUE --- */

// Simple toast function
function showToast(message) {
  const toast = document.createElement("div");
  toast.classList.add("toast");
  toast.textContent = message;

  document.body.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => (toast.style.opacity = 1));

  // Fade out after 2 seconds
  setTimeout(() => {
    toast.style.opacity = 0;
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Clear the queue
function clearQueue() {
  preloadedAudio = new Object();
  queue = [];
  index = 0;
  updateQueue();
}

// Add track to queue with double-click detection
function addToQueue(track) {
  // Check if same as last song in queue
  const lastTrack = queue[queue.length - 1];
  if (lastTrack && lastTrack.id === track.id) {
    clearQueue();
    queue = [track]; // reset queue
    index = 0;
    loadTrack(track); // play immediately
    showToast(`"${track.title}" is already in queue — restarted!`);
    updateQueue();
    return;
  }

  // Normal add
  queue.push(track);
  updateQueue();
  showToast(`"${track.title}" added to queue (double click to play now)`);

  // Play immediately if first track
  if (queue.length === 1) loadTrack(track);
}

// Update queue UI
function updateQueue() {
  queueView.innerHTML = "<h3>Queue</h3>";
  queue.forEach((t, i) => {
    const d = document.createElement("div");
    d.textContent = t.title;
    d.onclick = () => {
      index = i;
      loadTrack(t);
    };
    queueView.appendChild(d);
    queueView.appendChild(document.createElement("br"));
  });
}

// Toggle queue visibility
function toggleQueue() {
  queueView.classList.toggle("hidden");
}

/* --- PLAYER --- */
let preloadedAudio = {};

function adjustColor(hex, percent) {
  let num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.min(255, Math.max(0, r + percent));
  g = Math.min(255, Math.max(0, g + percent));
  b = Math.min(255, Math.max(0, b + percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

async function getTrackUrl(track) {
  const res = await fetch(
    `${API}/track/?id=${track.id}${PROXY ? "%26" : "&"}quality=LOW`,
  );
  const data = await res.json();
  return PROXY + JSON.parse(atob(data.data.manifest)).urls[0];
}

async function loadAudioBlob(track, trackIndex) {
  if (preloadedAudio[trackIndex]) return preloadedAudio[trackIndex];
  const url = await getTrackUrl(track);
  const blob = await fetch(url).then((r) => r.blob());
  const objectUrl = URL.createObjectURL(blob);
  return (preloadedAudio[trackIndex] = {
    blob,
    objectUrl,
    filename: `${track.title || "track"}.mp3`,
  });
}

function updatePlayerUI(track, trackIndex) {
  const img = track?.album?.cover
    ? `${IMG}${track.album.cover.replaceAll("-", "/")}/320x320.jpg`
    : "=";
  link.href = img;
  document.getElementById("playerCover").src = img;
  document.getElementById("bg").style.backgroundImage = `url(${img})`;
  document.getElementById("playerTitleSpan").textContent =
    track.title || "Unknown Title";
  document.getElementById("playerArtist").textContent =
    `${track.artists?.[0]?.name || "Unknown Artist"} - ${track.album.title || ""}`;
  document.title = `${track.title || "Unknown Title"} - ${track.artists?.[0]?.name || "Unknown Artist"}`;
  document.getElementById("playerExplicit").style.display = track.explicit
    ? "inline"
    : "none";

  document.documentElement.style.setProperty(
    "--main-color",
    track.album.vibrantColor,
  );
  document.documentElement.style.setProperty(
    "--secondary-color",
    adjustColor(track.album.vibrantColor, -50),
  );

  const queueItems = queueView.querySelectorAll("div");
  queueItems.forEach((item, i) =>
    item.classList.toggle("current", i === trackIndex),
  );
}

async function loadTrack(trackOrIndex) {
  let trackIndex, track;

  if (typeof trackOrIndex === "number") {
    trackIndex = trackOrIndex;
    track = queue[trackIndex];
  } else if (typeof trackOrIndex === "object") {
    track = trackOrIndex;
    trackIndex = queue.findIndex((t) => t.id === track.id);
  } else {
    console.warn("loadTrack: invalid argument", trackOrIndex);
    return;
  }

  if (!track) {
    console.warn(`loadTrack: no track found`, trackOrIndex);
    return;
  }

  // Reset reverse button state when loading new track
  const reverseBtn = document.getElementById("reverseBtn");
  const progressBar = document.getElementById("progressBar");
  reverseBtn?.classList.remove("active");
  progressBar?.classList.remove("reversed");

  updatePlayerUI(track, trackIndex);

  const trackData = await loadAudioBlob(track, trackIndex);
  audio.src = trackData.objectUrl;
  initAudioContext();
  audio.play();
  loadLyrics(track);
  saveSessionStorage();

  if (trackIndex + 1 < queue.length) {
    preloadTrack(queue[trackIndex + 1], trackIndex + 1);
  }
}

async function preloadTrack(track, trackIndex) {
  if (preloadedAudio[trackIndex]) return;
  await loadAudioBlob(track, trackIndex);
}

function next() {
  if (index + 1 < queue.length) {
    releaseTrack();
    index++;
    loadTrack(index);
  }
}

function prev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else if (index > 0) {
    index--;
    loadTrack(index);
  }
}

function togglePlay() {
  initAudioContext();
  audio.paused ? audio.play() : audio.pause();
}

function toggleLyrics() {
  lyricsView.classList.toggle("hidden");
}

function releaseTrack(trackIndex = index) {
  const cached = preloadedAudio[trackIndex];
  if (cached) {
    URL.revokeObjectURL(cached.objectUrl);
    delete preloadedAudio[trackIndex];
  }
}

function downloadTrack(trackIndex = index) {
  const cached = preloadedAudio[trackIndex];
  if (!cached) {
    alert("Track not preloaded yet");
    return;
  }
  const a = document.createElement("a");
  a.href = cached.objectUrl;
  a.download = cached.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadAlbum(album, tracks) {
  if (!tracks || tracks.length === 0) {
    alert("No tracks to download");
    return;
  }

  const confirmed = confirm(
    `Download ${tracks.length} tracks from "${album.title}"?\n\nNote: This will download available audio files.`,
  );
  if (!confirmed) return;

  showToast(`Preparing to download ${tracks.length} tracks...`);

  let downloadedCount = 0;
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const filename = `${(i + 1).toString().padStart(2, "0")} - ${track.title.replace(/[<>:"/\\|?*]/g, "_")}.mp3`;

    try {
      const trackUrl = await getTrackUrl(track);
      if (!trackUrl) continue;

      const response = await fetch(trackUrl);
      if (!response.ok) continue;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Small delay between downloads to avoid overwhelming the browser
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, i * 300);

      downloadedCount++;
    } catch (e) {
      console.log(`Could not download: ${track.title}`);
    }
  }

  setTimeout(() => {
    showToast(`Download started for ${downloadedCount} tracks!`);
  }, 500);
}

// Setup player click handlers once
document.getElementById("playerArtist").addEventListener("click", () => {
  const track = queue[index];
  if (track?.artists?.[0]?.id) {
    openArtist(
      track.artists[0].id,
      track.artists[0].name,
      track.artists[0].picture || "",
    );
  }
});

document.getElementById("playerCover").addEventListener("click", () => {
  const track = queue[index];
  fetch(`${API}/album/?id=${track.album.id}`)
    .then((r) => r.json())
    .then((data) => openAlbum(data.data));
});

// Seek bar
seek.oninput = () => (audio.currentTime = (seek.value / 100) * audio.duration);
audio.onended = next;

// Reverse the audio from preloaded Blob and auto-play
async function reverseAudio(trackIndex = index) {
  audio.pause();
  const cached = preloadedAudio[trackIndex];
  if (!cached?.blob) {
    alert("Track not preloaded yet!");
    return;
  }

  const reverseBtn = document.getElementById("reverseBtn");

  if (preloadedAudio[trackIndex].reversed) {
    preloadedAudio[trackIndex].reversed = false;
    reverseBtn?.classList.remove("active");
    loadTrack(trackIndex);
    return;
  }

  preloadedAudio[trackIndex].reversed = true;
  reverseBtn?.classList.add("active");
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const arrayBuffer = await cached.blob.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    buffer.getChannelData(c).reverse();
  }

  const wavBlob = bufferToWav(buffer);
  const url = URL.createObjectURL(wavBlob);

  audio.oncanplaythrough = () => {
    audio.oncanplaythrough = null;
    audio.currentTime = 0;
    audio.play().catch(() => console.warn("Autoplay blocked"));
  };

  audio.src = url;
  audio.load();

  function bufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

    let offset = 0;
    const writeString = (s) => {
      for (let i = 0; i < s.length; i++) {
        view.setUint8(offset++, s.charCodeAt(i));
      }
    };

    writeString("RIFF");
    view.setUint32(offset, 36 + length, true);
    offset += 4;
    writeString("WAVE");
    writeString("fmt ");
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 1, true);
    offset += 2;
    view.setUint16(offset, numChannels, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * numChannels * 2, true);
    offset += 4;
    view.setUint16(offset, numChannels * 2, true);
    offset += 2;
    view.setUint16(offset, 16, true);
    offset += 2;
    writeString("data");
    view.setUint32(offset, length, true);
    offset += 4;

    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = buffer.getChannelData(c)[i];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }
}

/* --- LYRICS --- */
async function loadLyrics(track) {
  lyricsView.innerHTML = "";
  words = [];
  lines = []; // store line timing info

  activeLyrics = false;

  url = `${API}/lyrics/?id=${track.id}`;
  data = await fetch(url).then((r) => r.json());
  data = data.lyrics.subtitles;
  const rawLines = data.split("\n");

  function parseTimeToMs(timeStr) {
    // Format: MM:SS.MS or M:SS.MS
    const [minutes, seconds] = timeStr.split(":");
    return (parseInt(minutes, 10) * 60 + parseFloat(seconds)) * 1000;
  }

  // Parse all lines to get timestamps
  const parsedLines = [];
  rawLines.forEach((line) => {
    const match = line.match(/\[(\d+:\d+\.\d+)\]\s*(.*)/);
    if (match) {
      const timeMs = parseTimeToMs(match[1]);
      const text = match[2];
      parsedLines.push({ time: timeMs, text });
    }
  });

  // Create line elements with proper durations
  parsedLines.forEach((lineData, index) => {
    const durationMs =
      index + 1 < parsedLines.length
        ? parsedLines[index + 1].time - lineData.time
        : audio.duration * 1000 - lineData.time;

    const lineDiv = document.createElement("div");
    lineDiv.className = "lyric-line";
    lineDiv.innerText = lineData.text;
    lineDiv.dataset.time = lineData.time;
    lineDiv.dataset.duration = durationMs;

    lines.push({ time: lineData.time, duration: durationMs, el: lineDiv });

    lineDiv.onclick = () => {
      audio.currentTime = lineData.time / 1000;
    };

    lyricsView.appendChild(lineDiv);
  });
}

audio.ontimeupdate = () => {
  saveSessionStorage();
  if (!lines.length) return;

  const now = audio.currentTime * 1000; // in ms
  let currentLine = null;

  // --- Line by line highlighting ---
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const start = line.time;
    const end = line.time + line.duration;

    if (now >= start && now <= end) {
      const progress = (now - start) / line.duration;
      line.el.classList.add("active");
      line.el.style.setProperty("--p", progress);
      currentLine ??= { el: line.el }; // scroll line if no word active
    } else if (now > end || now < start) {
      line.el.classList.remove("active");
      line.el.style.setProperty("--p", 0);
    }
  }

  // Scroll currently active word or line into view
  currentLine?.el.scrollIntoView({
    block: "center",
    behavior: "smooth",
  });
};

/* --- PLAYLISTS --- */
if (!localStorage.getItem("playlist-favorites")) {
  createPlaylist("favorites", "Favorites");
  localStorage.setItem("playlist-favorites", true);
}
function openPlaylist(id) {
  let pl = JSON.parse(localStorage.getItem(`playlist_${id}`) || "null");
  if (pl) {
    openAlbum({
      title: pl.title,
      type: "PLAYLIST",
      cover: pl.cover || "5806b59b-2f3d-4d0a-8541-e75de4e58f2c",
      releaseDate: `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 1}`,
      artists: [{ name: "You" }],
      playlistTracks: pl.tracks || "[]",
      duration: pl.duration,
      numberOfTracks: pl.numberOfTracks,
      id: pl.id,
    });
  } else {
    console.warn("Playlist not found:", id);
  }
}

function createPlaylist(id = crypto.randomUUID(), title = "Untitled Playlist") {
  const pl = {
    title: title,
    tracks: [],
    duration: 0,
    numberOfTracks: 0,
    id: id,
  };
  localStorage.setItem(`playlist_${id}`, JSON.stringify(pl));
  loadPlaylists();
}

function deletePlaylist(id) {
  localStorage.removeItem(`playlist_${id}`);
  loadPlaylists();
}

function addToPlaylist(id, track) {
  const key = `playlist_${id}`;
  const pl = JSON.parse(localStorage.getItem(key) || "null");

  if (!pl) return console.warn("Playlist not found:", id);

  const trackIndex = pl.tracks.findIndex((t) => t.id === track.id);

  if (trackIndex !== -1) {
    // Remove track
    pl.tracks.splice(trackIndex, 1);
    pl.duration = Math.max(0, (pl.duration || 0) - track.duration);
  } else {
    // Add track
    pl.tracks.push(track);
    pl.duration = (pl.duration || 0) + track.duration;
  }

  pl.numberOfTracks = pl.tracks.length;
  localStorage.setItem(key, JSON.stringify(pl));
}

function loadPlaylists() {
  let playlistsBar = document.getElementById("playlists");
  playlistsBar.innerHTML = "";
  for (let key in localStorage) {
    if (key.startsWith("playlist_")) {
      let pl = JSON.parse(localStorage.getItem(key));
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
          "display: grid; grid-template-columns: repeat(2, 1fr); width: 100%; height: 100%; background-color:pink;";
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
  }

  let pinnedBar = document.getElementById("pinned");
  pinnedBar.innerHTML = "";
  let pinned = JSON.parse(localStorage.getItem("pinned")) || [];
  pinned.forEach((pinnedItem) => {
    const pDiv = document.createElement("div");
    pDiv.className = "card";
    if (pinnedItem[0] == "album") {
      const al = pinnedItem[1];
      pDiv.title = al.title;
      const img = document.createElement("img");
      img.src = `${IMG}${al.cover.replaceAll("-", "/")}/320x320.jpg`;
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
      pDiv.appendChild(img);
      pDiv.onclick = () => openAlbum(al);
    } else if (pinnedItem[0] == "artist") {
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

document.addEventListener("DOMContentLoaded", loadPlaylists);

/* Improved playlist modal + context menu helpers */

/* Helper: toggle a track in a playlist by id (adds or removes, updates localStorage) */
function toggleTrackInPlaylist(plId, track, add) {
  try {
    const key = `playlist_${plId}`;
    const plRaw = localStorage.getItem(key);
    if (!plRaw) return;
    let pl = JSON.parse(plRaw);
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

/* Build playlist checkbox list for the modal.
   options: { tracks: [track,...], headerText: string } */
function buildPlaylistListForModal(options) {
  const tracks = options.tracks || [];
  const modal = document.getElementById("playlistModal");
  const list = document.getElementById("playlistList");
  if (!modal || !list) return;

  const header = modal.querySelector("h3");
  if (header && typeof options.headerText !== "undefined")
    header.textContent = options.headerText;

  list.innerHTML = "";

  for (let key in localStorage) {
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

      // Decide checked/indeterminate state based on number of tracks that exist in pl
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
        // For single track: add/remove that track.
        // For multiple tracks: add/remove all tracks.
        if (tracks.length === 1) {
          const t = tracks[0];
          if (e.target.checked) {
            toggleTrackInPlaylist(plId, t, true);
          } else {
            toggleTrackInPlaylist(plId, t, false);
          }
        } else {
          if (e.target.checked) {
            tracks.forEach((t) => toggleTrackInPlaylist(plId, t, true));
          } else {
            tracks.forEach((t) => toggleTrackInPlaylist(plId, t, false));
          }
        }
        // Refresh pl state for correct indeterminate/checked UI if needed
        pl = JSON.parse(localStorage.getItem(key));
        // Update checkbox state after mutation
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

/* Open modal for a single track (no longer overwrites the passed track).
   Pass a track object (with id and title) or nothing to use current queue[index]. */
function openAddToPlaylistModal(track) {
  if (!track) {
    if (
      typeof queue !== "undefined" &&
      queue.length > 0 &&
      typeof index !== "undefined"
    ) {
      track = queue[index];
    } else {
      showToast("No track selected");
      return;
    }
  }

  const modal = document.getElementById("playlistModal");
  const list = document.getElementById("playlistList");
  if (!modal || !list) return;

  const headerText = `Add "${track.title || track.name || "Track"}" to Playlist`;
  modal.classList.remove("hidden");
  // Use the builder helper:
  buildPlaylistListForModal({ tracks: [track], headerText });

  // store current context for modal if needed:
  modal.dataset.modalType = "single";
  modal.dataset.trackId = track.id;
}

/* Open modal for multiple tracks (album). */
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

/* Open modal for artist. */
async function openAddArtistToPlaylistModal(albums, artist) {
  console.log(albums, artist);

  const modal = document.getElementById("playlistModal");
  if (!modal) return;

  try {
    // 1. Create an array of promises and await them all
    const trackArrays = await Promise.all(
      albums.map(async (al) => {
        const response = await fetch(`${API}/album/?id=${al.id}`);
        const data = await response.json();
        return data?.data?.items || [];
      }),
    );

    // 2. Flatten the results into a single array
    const tracks = trackArrays.flat();

    const headerText = `Add "${artist.name}" to Playlist`;
    modal.classList.remove("hidden");

    // 3. This now runs only after the tracks are ready
    buildPlaylistListForModal({ tracks, headerText });

    modal.dataset.modalType = "multi";
    delete modal.dataset.trackId;
  } catch (error) {
    console.error("Failed to fetch album tracks:", error);
  }
}

/* Close */
function closePlaylistModal() {
  document.getElementById("playlistModal").classList.add("hidden");
  loadPlaylists();
}

/* Context menu: create a right-click menu for a track element
   Usage: call setupTrackContextMenu(el, track) after rendering track DOM nodes. */
function setupTrackContextMenu(el, track) {
  if (!el || !track) return;
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showTrackContextMenu(e.pageX, e.pageY, track);
  });
}

/* Show a small context menu at x,y with actions:
   - "Add to playlist..." -> opens modal for that track
   - quick-add items for each playlist to add immediately */
function showTrackContextMenu(x, y, track) {
  let menu = document.getElementById("trackContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "trackContextMenu";
    menu.className = "context-menu";
    // minimal styles - you should move these to your CSS file
    menu.style.position = "absolute";
    menu.style.zIndex = 9999;
    menu.style.background = "#fff";
    menu.style.border = "1px solid rgba(0,0,0,0.12)";
    menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
    menu.style.padding = "4px 0";
    menu.style.display = "none";
    document.body.appendChild(menu);

    // hide on any click elsewhere
    document.addEventListener("click", () => {
      menu.style.display = "none";
    });
    // hide on escape
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") menu.style.display = "none";
    });
  }

  menu.innerHTML = "";

  const makeItem = (text, onClick) => {
    const it = document.createElement("div");
    it.className = "context-menu-item";
    it.style.padding = "8px 16px";
    it.style.cursor = "pointer";
    it.textContent = text;
    it.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onClick(ev);
      menu.style.display = "none";
    });
    it.addEventListener(
      "mouseover",
      () => (it.style.background = "rgba(0,0,0,0.04)"),
    );
    it.addEventListener(
      "mouseout",
      () => (it.style.background = "transparent"),
    );
    return it;
  };

  // Primary action: open modal
  menu.appendChild(
    makeItem("Add to playlist...", () => openAddToPlaylistModal(track)),
  );

  // Divider
  menu.appendChild(() => {});
  const divider = document.createElement("div");
  divider.style.height = "1px";
  divider.style.margin = "6px 0";
  divider.style.background = "rgba(0,0,0,0.06)";
  menu.appendChild(divider);

  // Quick-add per playlist
  let foundAny = false;
  for (let key in localStorage) {
    if (!Object.prototype.hasOwnProperty.call(localStorage, key)) continue;
    if (!key.startsWith("playlist_")) continue;
    try {
      const pl = JSON.parse(localStorage.getItem(key));
      const plId = key.replace("playlist_", "");
      menu.appendChild(
        makeItem("Quick add to " + pl.title, () => {
          toggleTrackInPlaylist(plId, track, true);
        }),
      );
      foundAny = true;
    } catch (e) {
      // skip broken playlist entries
    }
  }

  if (!foundAny) {
    menu.appendChild(
      makeItem("No playlists yet — create one", () =>
        createNewPlaylistFromModal(x, y, track),
      ),
    );
  }

  // position & show
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
}

/* --- ARTIST PAGE --- */
// ===== Deduplicate albums =====
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

async function openArtist(id, name, pic) {
  showView("artist");
  const el = document.getElementById("artist");
  el.innerHTML = `<div id="artistBanner">
        <img src='${IMG + pic.replaceAll("-", "/")}/750x750.jpg' alt="artist">
        <h2>${name}</h2>
    </div>
    <div id="artistContent"></div>`;

  el.querySelector("h2").onclick = () => {
    const pinned = JSON.parse(localStorage.getItem("pinned")) || [];
    const item = ["artist", [id, name, pic]];

    // Check if already pinned
    const index = pinned.findIndex(
      ([type, data]) => type === "artist" && data[0] === id,
    );

    if (index !== -1) {
      // Remove if already pinned
      pinned.splice(index, 1);
    } else {
      // Add if not pinned
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

  //openAddArtistToPlaylistModal(allAlbums, rawArtist);

  // Separate full albums and singles/EPs
  const albums = allAlbums.filter((a) => !["EP", "SINGLE"].includes(a.type));
  const epsAndSingles = allAlbums.filter((a) =>
    ["EP", "SINGLE"].includes(a.type),
  );

  // ===== Render top tracks =====
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
        // fetch the album
        fetch(`${API}/album/?id=${t.album.id}`)
          .then((r) => r.json())
          .then((data) => {
            const fullTrack = data?.data?.items.find(
              (item) => item.item.id === t.id,
            )?.item;
            if (fullTrack) {
              openAddToPlaylistModal(fullTrack);
            } else {
              showToast("Failed to favorite track");
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

/* --- ALBUM PAGE --- */
function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (e) {
    return "";
  }
}

function renderTrackRow(track) {
  const d = document.createElement("div");
  d.className = "song-row";
  d.innerHTML = `
    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.title}</span>
    ${track.explicit ? '<img src="e.svg">' : ""}
    <span class="right">${track.key ? `${track.key} ` : ""}${track.bpm ? `${track.bpm} BPM ` : ""}${formatTime(track.duration)}</span>
  `;
  d.onclick = () => addToQueue(track);
  d.oncontextmenu = (e) => {
    e.preventDefault();
    openAddToPlaylistModal(track);
  };
  return d;
}

function playTracks(trackList, shuffle = false) {
  clearQueue();
  let toPlay = [...trackList]; // Copy to avoid mutating original
  if (shuffle) toPlay.sort(() => Math.random() - 0.5);
  toPlay.forEach((t) => queue.push(t));
  index = 0;
  loadTrack(queue[0]);
  updateQueue();
}

async function openAlbum(al) {
  showView("album");
  const el = document.getElementById("album");
  const isPlaylist = al.type === "PLAYLIST";
  const dateStr = formatDate(al.releaseDate);

  el.innerHTML = `
    <img id="albumCover" src="${IMG}${al.cover.replaceAll("-", "/")}/320x320.jpg" alt="cover">
    <div>
      <h2 id="albumTitle" style="cursor: ${isPlaylist ? "pointer" : "default"}">${al.title}</h2>
      <h3 id="albumArtist">${al.artists[0].name}${dateStr ? " • " + dateStr : ""}</h3>
      <span id="albumInfo">${al.numberOfTracks} ${al.numberOfTracks === 1 ? "song" : "songs"} • ${formatTime(al.duration)}${al.copyright ? " • " + al.copyright : ""}</span>
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

  // Artist link
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

    // Edit playlist title
    titleEl.addEventListener("click", () => {
      titleEl.contentEditable = true;
      titleEl.focus();
      const save = () => {
        titleEl.contentEditable = false;
        const newTitle = titleEl.textContent.trim();
        if (newTitle) {
          let pl = JSON.parse(
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

    // Delete button
    extraBtn.onclick = () => {
      if (confirm(`Delete "${al.title}"?`)) {
        deletePlaylist(al.id);
        showToast(`Deleted "${al.title}"`);
        loadPlaylists();
        showView("search");
      }
    };

    // Playlist cover grid
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
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
      grid.appendChild(img);
    });
    el.querySelector("#albumCover").replaceWith(grid);
  } else {
    // Regular album: fetch from API
    const data = await fetch(`${API}/album/?id=${al.id}`).then((r) => r.json());
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

  // Render tracks
  const tracksContainer = el.querySelector("#albumTracks");
  tracks.forEach((track) => tracksContainer.appendChild(renderTrackRow(track)));

  // Play buttons
  el.querySelector("#playAll").onclick = () => playTracks(tracks, false);
  el.querySelector("#shufflePlay").onclick = () => playTracks(tracks, true);
  el.querySelector("#addAllPlaylist").onclick = () =>
    openAddAlbumToPlaylistModal(tracks, al.title);
  el.querySelector("#downloadAlbum").onclick = () => downloadAlbum(al, tracks);
}

/* --- VISUALIZER --- */
function initAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  draw();
}

function draw() {
  requestAnimationFrame(draw);
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const barWidth = (canvas.width / data.length) * 1.15;
  data.forEach((v, i) => {
    const x = i * barWidth;
    const y = canvas.height - (v / 255) * canvas.height;
    const gradient = ctx.createLinearGradient(x, 0, x, canvas.height);
    const computedStyles = window.getComputedStyle(document.body);
    gradient.addColorStop(0, computedStyles.getPropertyValue("--main-color"));
    gradient.addColorStop(
      1,
      computedStyles.getPropertyValue("--secondary-color"),
    );
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, canvas.height - y);
  });
}

/* --- SESSION STORAGE --- */
function saveSessionStorage() {
  // sessionStorage queue info
  let sessionQueue = queue.map((obj) => JSON.stringify(obj)).join(", ");
  sessionStorage.setItem(
    "queue",
    JSON.stringify({
      items: sessionQueue,
      i: index,
      currentTime: audio.currentTime,
    }),
  );
}

function loadSessionStorage() {
  window.newQueue = JSON.parse(sessionStorage.getItem("queue"));
  queue = JSON.parse("[" + newQueue.items + "]");
  index = newQueue.i;
  updateQueue();
  loadTrack(index);
  audio.currentTime = newQueue.currentTime;
}

if (sessionStorage.getItem("queue")) loadSessionStorage();

/* --- PLAYER PROGRESS BAR --- */
const seekBar = document.getElementById("seekBar");
const progressBar = document.getElementById("progressBar");
const bufferBar = document.getElementById("bufferBar");
const timeTooltip = document.getElementById("timeTooltip");
const currentTimeEl = document.getElementById("currentTime");
const totalTimeEl = document.getElementById("totalTime");

let isDragging = false;

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateProgress() {
  if (!audio.duration) return;

  const isReversed = preloadedAudio[index]?.reversed || false;
  const pct = (audio.currentTime / audio.duration) * 100;

  // In reverse mode, progress goes from right to left
  if (isReversed) {
    progressBar.classList.add("reversed");
    progressBar.style.width = 100 - pct + "%";
  } else {
    progressBar.classList.remove("reversed");
    progressBar.style.width = pct + "%";
  }

  currentTimeEl.textContent = formatTime(audio.currentTime);
  totalTimeEl.textContent =
    "-" + formatTime(audio.duration - audio.currentTime);

  if (audio.buffered.length) {
    const end = audio.buffered.end(audio.buffered.length - 1);
    bufferBar.style.width = (end / audio.duration) * 100 + "%";
  }
}

let animationFrameId;
function smoothUpdate() {
  updateProgress();
  if (!audio.paused && audio.duration) {
    animationFrameId = requestAnimationFrame(smoothUpdate);
  }
}

function seek(clientX) {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
}

// Mouse
seekBar.addEventListener("mousemove", (e) => {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  timeTooltip.style.left = pct * 100 + "%";
  if (audio.duration) {
    timeTooltip.textContent = formatTime(pct * audio.duration);
  }
});

seekBar.addEventListener("mousedown", (e) => {
  isDragging = true;
  seek(e.clientX);
});
window.addEventListener("mousemove", (e) => {
  if (isDragging) seek(e.clientX);
});
window.addEventListener("mouseup", () => (isDragging = false));

// Keyboard shortcuts
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

// Touch event support for seek bar
seekBar.addEventListener("touchstart", (e) => {
  isDragging = true;
  seek(e.touches[0].clientX);
});
seekBar.addEventListener("touchmove", (e) => {
  if (isDragging) {
    seek(e.touches[0].clientX);
    e.preventDefault();
  }
});
seekBar.addEventListener("touchend", () => (isDragging = false));

// Prevent pinch zoom on mobile
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener(
  "touchmove",
  function (e) {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

// Hover tooltip
seekBar.addEventListener("mousemove", (e) => {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const hoverTime = audio.duration * pct;

  timeTooltip.textContent = formatTime(hoverTime);
  timeTooltip.style.left = pct * 100 + "%";
  timeTooltip.style.opacity = 1;
});

seekBar.addEventListener("mouseleave", () => {
  timeTooltip.style.opacity = 0;
});

// Auto update
audio.addEventListener("play", () => {
  updateProgress();
  smoothUpdate();
});
// Auto update on start
audio.addEventListener("canplay", () => {
  updateProgress();
  if (!audio.paused) smoothUpdate();
});
audio.addEventListener("pause", () => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});
audio.addEventListener("seeking", updateProgress);
audio.addEventListener("loadedmetadata", updateProgress);
