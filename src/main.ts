/**
 * main.ts — App entry point
 *
 * Initializes all modules and sets up global event bindings.
 * State is managed by audioPlayer.ts (queue, index, preloadedAudio).
 */

import { initNavigation, showView, addToViewHistory } from "./components/Navigation";
import { initSearch } from "./components/Search";
import { initPlayer } from "./components/Player";
import { initLyrics, toggleLyrics } from "./components/LyricsView";
import {
  initPlaylists,
  openPlaylist,
  closePlaylistModal,
  createNewPlaylistFromModal,
  openAddToPlaylistModal,
  clearHistory,
  createPlaylistAndRefresh,
  addCurrentTrackToPlaylist,
} from "./components/Playlists";
import { initTransfer } from "./components/Transfer";
import {
  togglePlay,
  next,
  prev,
  toggleQueue,
  reverseAudio,
  downloadTrack,
  queue,
} from "./lib/audioPlayer";
import { loadSessionStorage } from "./lib/sessionStorage";
import { createPlaylist } from "./lib/localStorage";

// ─── Expose globals for inline HTML onclick handlers ───────────────────────
// The index.html uses onclick="..." attributes, so we expose functions on window.

declare const window: Window & typeof globalThis & Record<string, any>;

window.showView = showView;
window.togglePlay = togglePlay;
window.next = next;
window.prev = prev;
window.toggleQueue = toggleQueue;
window.toggleLyrics = toggleLyrics;
window.reverseAudio = reverseAudio;
window.downloadTrack = downloadTrack;
window.openAddToPlaylistModal = openAddToPlaylistModal;
window.closePlaylistModal = closePlaylistModal;
window.createNewPlaylistFromModal = createNewPlaylistFromModal;
window.createPlaylist = createPlaylist;
window.openPlaylist = openPlaylist;
window.clearHistory = clearHistory;
window.createPlaylistAndRefresh = createPlaylistAndRefresh;
window.addCurrentTrackToPlaylist = addCurrentTrackToPlaylist;

// queue is mutated in-place so window.queue always reflects the current state
window.queue = queue;

// Expose openAlbum and openArtist (used by inline onclick in index.html)
import("./components/AlbumPage").then(({ openAlbum }) => {
  window.openAlbum = openAlbum;
});
import("./components/ArtistPage").then(({ openArtist }) => {
  window.openArtist = openArtist;
});

// ─── Bootstrap ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  initNavigation();
  initSearch();
  initPlayer();
  initLyrics();
  initTransfer();

  // Initialize default playlists first so they exist when loading UI
  const { initializeDefaultPlaylists } = await import("./lib/localStorage");
  await initializeDefaultPlaylists();

  // Load playlists into UI after defaults are created
  const { loadPlaylists } = await import("./components/Playlists");
  await loadPlaylists();

  // Restore session if available
  loadSessionStorage();

  // Set up volume slider
  const volumeSlider = document.getElementById("volumeSlider") as HTMLInputElement;
  const audio = document.getElementById("audio") as HTMLAudioElement;
  
  // Set initial volume from localStorage or default to 100
  const savedVolume = localStorage.getItem("playerVolume");
  const initialVolume = savedVolume ? parseInt(savedVolume) : 100;
  volumeSlider.value = String(initialVolume);
  audio.volume = initialVolume / 100;
  
  // Update volume on slider change
  volumeSlider.addEventListener("input", (e) => {
    const volume = parseInt((e.target as HTMLInputElement).value);
    audio.volume = volume / 100;
    localStorage.setItem("playerVolume", String(volume));
  });
});

// ─── Audio ended → advance queue ───────────────────────────────────────────
const audio = document.getElementById("audio") as HTMLAudioElement;
audio.onended = next;
