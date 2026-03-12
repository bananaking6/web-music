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
  (document.getElementById("playerExplicit") as HTMLImageElement).style.display =
    track.explicit ? "inline" : "none";

  document.documentElement.style.setProperty("--main-color", track.album.vibrantColor);
  document.documentElement.style.setProperty(
    "--secondary-color",
    adjustColor(track.album.vibrantColor, -50),
  );

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
