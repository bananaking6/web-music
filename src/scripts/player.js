/**
 * Music player: queue management, track loading, playback controls, lyrics,
 * seek bar, session storage, and Media Session API integration.
 */

import { API, IMG, PROXY, getTrackUrl } from "./api.js";
import { showToast, formatTime, showView } from "./ui.js";
import { initAudioContext } from "./visualizer.js";

export const audio = document.getElementById("audio");
const lyricsView = document.getElementById("lyricsView");
export const queueView = document.getElementById("queueView");
const link = document.querySelector("link[rel~='icon']");

export let queue = [];
export let index = 0;
export let preloadedAudio = {};

// Callbacks registered from main.js to avoid circular imports
let _openArtist = null;
let _openAlbum = null;

export function registerOpenArtist(fn) {
  _openArtist = fn;
}
export function registerOpenAlbum(fn) {
  _openAlbum = fn;
}

/* --- Lyrics state --- */
let lines = [];

/* --- Queue --- */

/** Clear the queue and release all preloaded audio. */
export function clearQueue() {
  preloadedAudio = {};
  queue = [];
  index = 0;
  updateQueue();
}

/**
 * Add a track to the queue.
 * Double-clicking the same track restarts it.
 * @param {Object} track
 */
export function addToQueue(track) {
  const lastTrack = queue[queue.length - 1];
  if (lastTrack && lastTrack.id === track.id) {
    clearQueue();
    queue = [track];
    index = 0;
    loadTrack(track);
    showToast(`"${track.title}" is already in queue — restarted!`);
    updateQueue();
    return;
  }
  queue.push(track);
  updateQueue();
  showToast(`"${track.title}" added to queue (double click to play now)`);
  if (queue.length === 1) loadTrack(track);
}

/** Re-render the queue overlay. */
export function updateQueue() {
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

/** Toggle the queue overlay visibility. */
export function toggleQueue() {
  queueView.classList.toggle("hidden");
}

/* --- Player --- */

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

/**
 * Load audio blob for a track, using cache when available.
 * @param {Object} track
 * @param {number} trackIndex
 * @returns {Promise<{blob: Blob, objectUrl: string, filename: string}>}
 */
export async function loadAudioBlob(track, trackIndex) {
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

/**
 * Update the player footer UI with track metadata and theme colours.
 * @param {Object} track
 * @param {number} trackIndex
 */
function updatePlayerUI(track, trackIndex) {
  const img = track?.album?.cover
    ? `${IMG}${track.album.cover.replaceAll("-", "/")}/320x320.jpg`
    : "";
  if (link) link.href = img;
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

/**
 * Load and play a track (by object or queue index).
 * @param {Object|number} trackOrIndex
 */
export async function loadTrack(trackOrIndex) {
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
    console.warn("loadTrack: no track found", trackOrIndex);
    return;
  }

  index = trackIndex;

  const reverseBtn = document.getElementById("reverseBtn");
  const progressBar = document.getElementById("progressBar");
  reverseBtn?.classList.remove("active");
  progressBar?.classList.remove("reversed");

  updatePlayerUI(track, trackIndex);

  const trackData = await loadAudioBlob(track, trackIndex);
  audio.src = trackData.objectUrl;
  initAudioContext(audio);
  audio.play();
  loadLyrics(track);
  saveSessionStorage();

  if (trackIndex + 1 < queue.length) {
    preloadTrack(queue[trackIndex + 1], trackIndex + 1);
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artists[0].name,
      album: track.album.name,
      artwork: [
        {
          src: `${IMG}${track.album.cover.replaceAll("-", "/")}/320x320.jpg`,
          sizes: "320x320",
          type: "image/jpeg",
        },
      ],
    });

    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const skip = details.seekOffset || 10;
      audio.currentTime = Math.max(0, audio.currentTime - skip);
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const skip = details.seekOffset || 10;
      audio.currentTime = Math.min(
        audio.duration || Infinity,
        audio.currentTime + skip,
      );
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.fastSeek && "fastSeek" in audio) {
        audio.fastSeek(details.seekTime);
      } else {
        audio.currentTime = details.seekTime;
      }
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());

    function updatePositionState() {
      if (
        "setPositionState" in navigator.mediaSession &&
        !isNaN(audio.duration)
      ) {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime,
        });
      }
    }

    audio.addEventListener("timeupdate", updatePositionState);
    audio.addEventListener("ratechange", updatePositionState);
  }
}

/** Silently preload the next track blob. */
export async function preloadTrack(track, trackIndex) {
  if (preloadedAudio[trackIndex]) return;
  await loadAudioBlob(track, trackIndex);
}

/** Advance to the next track in the queue. */
export function next() {
  if (index + 1 < queue.length) {
    releaseTrack();
    index++;
    loadTrack(index);
  }
}

/** Go to the previous track (or restart the current one). */
export function prev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else if (index > 0) {
    index--;
    loadTrack(index);
  }
}

/** Toggle playback. */
export function togglePlay() {
  initAudioContext(audio);
  audio.paused ? audio.play() : audio.pause();
}

/** Toggle lyrics overlay. */
export function toggleLyrics() {
  if (!lyricsView.innerHTML) {
    lyricsView.classList.add("hidden");
    showToast("No lyrics available");
  } else {
    lyricsView.classList.toggle("hidden");
  }
}

/**
 * Release a preloaded audio blob URL.
 * @param {number} [trackIndex]
 */
export function releaseTrack(trackIndex = index) {
  const cached = preloadedAudio[trackIndex];
  if (cached) {
    URL.revokeObjectURL(cached.objectUrl);
    delete preloadedAudio[trackIndex];
  }
}

/**
 * Trigger a download of the currently loaded track file.
 * @param {number} [trackIndex]
 */
export function downloadTrack(trackIndex = index) {
  const cached = preloadedAudio[trackIndex];
  if (!cached) {
    showToast("No track selected");
    return;
  }
  const a = document.createElement("a");
  a.href = cached.objectUrl;
  a.download = cached.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Download all tracks from an album.
 * @param {Object} album
 * @param {Array} tracks
 */
export async function downloadAlbum(album, tracks) {
  if (!tracks || tracks.length === 0) {
    showToast("No tracks in album to download");
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
    } catch {
      console.log(`Could not download: ${track.title}`);
    }
  }

  setTimeout(() => {
    showToast(`Download started for ${downloadedCount} tracks!`);
  }, 500);
}

/**
 * Reverse the current track audio and play it back.
 * @param {number} [trackIndex]
 */
export async function reverseAudio(trackIndex = index) {
  audio.pause();
  const cached = preloadedAudio[trackIndex];
  if (!cached?.blob) {
    showToast("No track selected");
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
      for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
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

/* --- Lyrics --- */

/**
 * Fetch and display lyrics for a track.
 * @param {Object} track
 */
export async function loadLyrics(track) {
  lyricsView.innerHTML = "";
  lines = [];

  try {
    const url = `${API}/lyrics/?id=${track.id}`;
    const data = await fetch(url).then((r) => r.json());
    const rawText = data.lyrics.subtitles;
    const rawLines = rawText.split("\n");

    function parseTimeToMs(timeStr) {
      const [minutes, seconds] = timeStr.split(":");
      return (parseInt(minutes, 10) * 60 + parseFloat(seconds)) * 1000;
    }

    const parsedLines = [];
    rawLines.forEach((line) => {
      const match = line.match(/\[(\d+:\d+\.\d+)\]\s*(.*)/);
      if (match) {
        parsedLines.push({ time: parseTimeToMs(match[1]), text: match[2] });
      }
    });

    parsedLines.forEach((lineData, i) => {
      const durationMs =
        i + 1 < parsedLines.length
          ? parsedLines[i + 1].time - lineData.time
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
  } catch {
    // No lyrics available
  }
}

audio.ontimeupdate = () => {
  saveSessionStorage();
  if (!lines.length) return;

  const now = audio.currentTime * 1000;
  let currentLine = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const start = line.time;
    const end = line.time + line.duration;

    if (now >= start && now <= end) {
      line.el.classList.add("active");
      line.el.style.setProperty("--p", (now - start) / line.duration);
      currentLine ??= { el: line.el };
    } else {
      line.el.classList.remove("active");
      line.el.style.setProperty("--p", 0);
    }
  }

  currentLine?.el.scrollIntoView({ block: "center", behavior: "smooth" });
};

audio.onended = next;

/* --- Player click handlers --- */

document.getElementById("playerArtist").addEventListener("click", () => {
  const track = queue[index];
  if (track?.artists?.[0]?.id && _openArtist) {
    _openArtist(
      track.artists[0].id,
      track.artists[0].name,
      track.artists[0].picture || "",
    );
  }
});

document.getElementById("playerCover").addEventListener("click", () => {
  const track = queue[index];
  if (!track || !_openAlbum) return;
  fetch(`${API}/album/?id=${track.album.id}`)
    .then((r) => r.json())
    .then((data) => _openAlbum(data.data));
});

/* --- Session Storage --- */

/** Persist queue state to sessionStorage. */
export function saveSessionStorage() {
  const sessionQueue = queue.map((obj) => JSON.stringify(obj)).join(", ");
  sessionStorage.setItem(
    "queue",
    JSON.stringify({
      items: sessionQueue,
      i: index,
      currentTime: audio.currentTime,
    }),
  );
}

/** Restore queue state from sessionStorage. */
export function loadSessionStorage() {
  const stored = JSON.parse(sessionStorage.getItem("queue"));
  if (!stored) return;
  queue = JSON.parse("[" + stored.items + "]");
  index = stored.i;
  updateQueue();
  loadTrack(index).then(() => {
    audio.currentTime = stored.currentTime;
  });
}

/* --- Seek Bar --- */

const seekBar = document.getElementById("seekBar");
const progressBar = document.getElementById("progressBar");
const bufferBar = document.getElementById("bufferBar");
const timeTooltip = document.getElementById("timeTooltip");
const currentTimeEl = document.getElementById("currentTime");
const totalTimeEl = document.getElementById("totalTime");

let isDragging = false;

function updateProgress() {
  if (!audio.duration) return;

  const isReversed = preloadedAudio[index]?.reversed || false;
  const pct = (audio.currentTime / audio.duration) * 100;

  if (isReversed) {
    progressBar.classList.add("reversed");
    progressBar.style.width = 100 - pct + "%";
  } else {
    progressBar.classList.remove("reversed");
    progressBar.style.width = pct + "%";
  }

  currentTimeEl.textContent = formatTime(audio.currentTime);
  totalTimeEl.textContent = "-" + formatTime(audio.duration - audio.currentTime);

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

function seekTo(clientX) {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
}

seekBar.addEventListener("mousemove", (e) => {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  timeTooltip.style.left = pct * 100 + "%";
  if (audio.duration) timeTooltip.textContent = formatTime(pct * audio.duration);
  timeTooltip.style.opacity = 1;
});

seekBar.addEventListener("mouseleave", () => {
  timeTooltip.style.opacity = 0;
});

seekBar.addEventListener("mousedown", (e) => {
  isDragging = true;
  seekTo(e.clientX);
});
window.addEventListener("mousemove", (e) => {
  if (isDragging) seekTo(e.clientX);
});
window.addEventListener("mouseup", () => (isDragging = false));

seekBar.addEventListener("touchstart", (e) => {
  isDragging = true;
  seekTo(e.touches[0].clientX);
});
seekBar.addEventListener(
  "touchmove",
  (e) => {
    if (isDragging) {
      seekTo(e.touches[0].clientX);
      e.preventDefault();
    }
  },
  { passive: false },
);
seekBar.addEventListener("touchend", () => (isDragging = false));

audio.addEventListener("play", () => {
  updateProgress();
  smoothUpdate();
  updatePlayIcon();
});
audio.addEventListener("canplay", () => {
  updateProgress();
  if (!audio.paused) smoothUpdate();
});
audio.addEventListener("pause", () => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  updatePlayIcon();
});
audio.addEventListener("seeking", updateProgress);
audio.addEventListener("loadedmetadata", updateProgress);

/* --- Play/Pause icon sync --- */

function updatePlayIcon() {
  const btn = document.querySelector(".player-controls button:nth-child(3)");
  if (!btn) return;
  if (audio.paused) {
    btn.innerHTML =
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  } else {
    btn.innerHTML =
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
  }
}
