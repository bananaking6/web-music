/**
 * main.ts — App entry point
 *
 * Initializes all modules and sets up global event bindings.
 * State is managed by audioPlayer.ts (queue, index, preloadedAudio).
 */

import { initNavigation, showView } from "./components/Navigation";
import { initSearch } from "./components/Search";
import { initPlayer } from "./components/Player";
import { initLyrics, toggleLyrics } from "./components/LyricsView";
import {
  initPlaylists,
  openPlaylist,
  closePlaylistModal,
  createNewPlaylistFromModal,
  openAddToPlaylistModal,
} from "./components/Playlists";
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

  // Initialize default playlists first so they exist when loading UI
  const { initializeDefaultPlaylists } = await import("./lib/localStorage");
  await initializeDefaultPlaylists();

  // Load playlists into UI after defaults are created
  await initPlaylists();

  // Restore session if available
  loadSessionStorage();
});

// ─── Audio ended → advance queue ───────────────────────────────────────────
const audio = document.getElementById("audio") as HTMLAudioElement;
audio.onended = next;
