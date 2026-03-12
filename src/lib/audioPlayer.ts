import { getTrackUrl } from "./api";
import { coverUrl } from "./api";
import { IMG } from "../utils/constants";
import { adjustColor, showToast } from "../utils/helpers";
import { saveSessionStorage } from "./sessionStorage";
import { initAudioContext } from "./visualizer";

// Shared state — imported and mutated by other modules
export let queue: any[] = [];
export let index = 0;
export let preloadedAudio: Record<number, any> = {};

export function setQueue(newQueue: any[]) { queue.splice(0, queue.length, ...newQueue); }
export function setIndex(i: number) { index = i; }
export function setPreloadedAudio(val: Record<number, any>) { preloadedAudio = val; }

const audio = document.getElementById("audio") as HTMLAudioElement;
const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;

/** Load audio blob for a track (uses preload cache) */
export async function loadAudioBlob(track: any, trackIndex: number) {
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

/** Update player UI elements to reflect the current track */
export function updatePlayerUI(track: any, trackIndex: number) {
  const img = track?.album?.cover ? coverUrl(track.album.cover) : "=";
  link.href = img;
  (document.getElementById("playerCover") as HTMLImageElement).src = img;
  document.getElementById("bg")!.style.backgroundImage = `url(${img})`;
  document.getElementById("playerTitleSpan")!.textContent =
    track.title || "Unknown Title";
  document.getElementById("playerArtist")!.textContent =
    `${track.artists?.[0]?.name || "Unknown Artist"} - ${track.album.title || ""}`;
  document.title = `${track.title || "Unknown Title"} - ${track.artists?.[0]?.name || "Unknown Artist"}`;

  document.documentElement.style.setProperty("--main-color", track.album.vibrantColor);
  document.documentElement.style.setProperty(
    "--secondary-color",
    adjustColor(track.album.vibrantColor, -50),
  );
  
  // Render fullscreen player if it's visible
  renderFullscreenPlayer(track, trackIndex);

  const queueView = document.getElementById("queueView")!;
  const queueItems = queueView.querySelectorAll("div");
  queueItems.forEach((item, i) => item.classList.toggle("current", i === trackIndex));
}

/** Load and play a track by queue index or track object */
export async function loadTrack(trackOrIndex: number | any) {
  let trackIndex: number;
  let track: any;

  if (typeof trackOrIndex === "number") {
    trackIndex = trackOrIndex;
    track = queue[trackIndex];
  } else {
    track = trackOrIndex;
    trackIndex = queue.findIndex((t) => t.id === track.id);
  }

  if (!track) {
    console.warn("loadTrack: no track found", trackOrIndex);
    return;
  }

  // Reset reverse button state
  document.getElementById("reverseBtn")?.classList.remove("active");
  document.getElementById("progressBar")?.classList.remove("reversed");

  updatePlayerUI(track, trackIndex);

  const trackData = await loadAudioBlob(track, trackIndex);
  audio.src = trackData.objectUrl;
  initAudioContext();
  audio.play();

  // Lazy import to avoid circular dependency
  const { loadLyrics } = await import("../components/LyricsView");
  loadLyrics(track);

  saveSessionStorage(queue, trackIndex);

  // Preload next track
  if (trackIndex + 1 < queue.length) {
    preloadTrack(queue[trackIndex + 1], trackIndex + 1);
  }

  // MediaSession API
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
    navigator.mediaSession.setActionHandler("seekbackward", (d) => {
      audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", (d) => {
      audio.currentTime = Math.min(
        audio.duration || Infinity,
        audio.currentTime + (d.seekOffset || 10),
      );
    });
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.fastSeek && "fastSeek" in audio) {
        (audio as any).fastSeek(d.seekTime);
      } else {
        audio.currentTime = d.seekTime!;
      }
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());

    const updatePositionState = () => {
      if ("setPositionState" in navigator.mediaSession && !isNaN(audio.duration)) {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime,
        });
      }
    };
    audio.addEventListener("timeupdate", updatePositionState);
    audio.addEventListener("ratechange", updatePositionState);
  }
}

export async function preloadTrack(track: any, trackIndex: number) {
  if (preloadedAudio[trackIndex]) return;
  await loadAudioBlob(track, trackIndex);
}

export function next() {
  if (index + 1 < queue.length) {
    releaseTrack();
    index++;
    loadTrack(index);
  }
}

export function prev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else if (index > 0) {
    index--;
    loadTrack(index);
  }
}

export function togglePlay() {
  initAudioContext();
  audio.paused ? audio.play() : audio.pause();
}

export function releaseTrack(trackIndex = index) {
  const cached = preloadedAudio[trackIndex];
  if (cached) {
    URL.revokeObjectURL(cached.objectUrl);
    delete preloadedAudio[trackIndex];
  }
}

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

export async function downloadAlbum(album: any, tracks: any[]) {
  if (!tracks?.length) {
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

  setTimeout(() => showToast(`Download started for ${downloadedCount} tracks!`), 500);
}

/** Reverse the currently playing track audio */
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

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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
}

function bufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  let offset = 0;
  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + length, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * numChannels * 2, true); offset += 4;
  view.setUint16(offset, numChannels * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString("data");
  view.setUint32(offset, length, true); offset += 4;

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

/** Clear queue and reset state */
export function clearQueue() {
  // Revoke all cached object URLs before clearing
  for (const key in preloadedAudio) {
    if (preloadedAudio[key]?.objectUrl) {
      URL.revokeObjectURL(preloadedAudio[key].objectUrl);
    }
  }
  setPreloadedAudio({});
  queue.length = 0;
  index = 0;
  updateQueueUI();
}

/** Add a track to the queue */
export function addToQueue(track: any) {
  const lastTrack = queue[queue.length - 1];
  if (lastTrack && lastTrack.id === track.id) {
    clearQueue();
    queue.push(track);
    index = 0;
    loadTrack(track);
    showToast(`"${track.title}" is already in queue — restarted!`);
    updateQueueUI();
    return;
  }
  queue.push(track);
  updateQueueUI();
  showToast(`"${track.title}" added to queue (double click to play now)`);
  if (queue.length === 1) loadTrack(track);
}

/** Render the queue view */
export function updateQueueUI() {
  const queueView = document.getElementById("queueView")!;
  queueView.innerHTML = "<h3>Queue</h3>";
  queue.forEach((t, i) => {
    const d = document.createElement("div");
    d.textContent = t.title;
    d.onclick = () => { index = i; loadTrack(t); };
    queueView.appendChild(d);
    queueView.appendChild(document.createElement("br"));
  });
}

export function toggleQueue() {
  document.getElementById("queueView")!.classList.toggle("hidden");
}

/** Render the fullscreen player view */
export function renderFullscreenPlayer(track: any, trackIndex: number) {
  const playerView = document.getElementById("playerView")!;
  const img = track?.album?.cover ? coverUrl(track.album.cover) : "=";
  
  playerView.innerHTML = `
    <button onclick="showView('home')" style="position: absolute; top: 20px; left: 20px; background: rgba(255,255,255,0.1); border: none; color: white; width: 44px; height: 44px; border-radius: 50%; font-size: 24px; cursor: pointer;">←</button>
    
    <img src="${img}" alt="Album" class="player-fullscreen-cover">
    
    <div class="player-fullscreen-info">
      <div class="player-fullscreen-title">${track.title || "Unknown Title"}</div>
      <div class="player-fullscreen-artist">${track.artists?.[0]?.name || "Unknown Artist"}</div>
    </div>
    
    <div class="player-fullscreen-progress">
      <div class="player-fullscreen-progress-bar" id="fullscreenProgressBar"></div>
    </div>
    
    <div class="player-fullscreen-time">
      <span id="fullscreenCurrentTime">0:00</span>
      <span id="fullscreenTotalTime">0:00</span>
    </div>
    
    <div class="player-fullscreen-controls">
      <button class="player-fullscreen-btn" onclick="reverseAudio()" title="Reverse" id="fullscreenReverseBtn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 7v6h-6"></path>
          <path d="M3 17a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 7"></path>
        </svg>
      </button>
      <button class="player-fullscreen-btn" onclick="prev()" title="Previous">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="19 20 9 12 19 4 19 20"></polygon>
          <line x1="5" y1="19" x2="5" y2="5"></line>
        </svg>
      </button>
      <button class="player-fullscreen-btn play" onclick="togglePlay()" title="Play/Pause">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
      <button class="player-fullscreen-btn" onclick="next()" title="Next">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 4 15 12 5 20 5 4"></polygon>
          <line x1="19" y1="5" x2="19" y2="19"></line>
        </svg>
      </button>
      <button class="player-fullscreen-btn" onclick="toggleQueue()" title="Queue">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
      </button>
    </div>
    
    <div class="player-fullscreen-actions">
      <button class="player-fullscreen-action-btn" onclick="toggleLyrics()" title="Lyrics">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
        Lyrics
      </button>
      <button class="player-fullscreen-action-btn" onclick="downloadTrack()" title="Download">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download
      </button>
      <button class="player-fullscreen-action-btn" onclick="openAddToPlaylistModal()" title="Add to Playlist">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Save
      </button>
    </div>
  `;
}

/** Play a list of tracks, optionally shuffled */
export function playTracks(trackList: any[], shuffle = false) {
  clearQueue();
  let toPlay = [...trackList];
  if (shuffle) toPlay.sort(() => Math.random() - 0.5);
  toPlay.forEach((t) => queue.push(t));
  index = 0;
  loadTrack(queue[0]);
  updateQueueUI();
}
