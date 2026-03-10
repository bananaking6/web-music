/**
 * Application entry point: wires modules together and boots the app.
 */

import { showView } from "./ui.js";
import {
  addToQueue,
  audio,
  togglePlay,
  registerOpenArtist,
  registerOpenAlbum,
  loadSessionStorage,
} from "./player.js";
import { registerSearchCallbacks } from "./search.js";
import { registerBrowseCallbacks, createPlaylist, loadPlaylists } from "./playlists.js";
import { openArtist, openAlbum } from "./browse.js";

/* --- Register cross-module callbacks --- */

registerOpenArtist(openArtist);
registerOpenAlbum(openAlbum);
registerBrowseCallbacks({ openAlbum, openArtist });
registerSearchCallbacks({ addToQueue, openArtist, openAlbum });

/* --- Init --- */

document.addEventListener("DOMContentLoaded", () => {
  // Ensure the default Favorites playlist exists
  if (!localStorage.getItem("playlist-favorites")) {
    createPlaylist("favorites", "Favorites");
    localStorage.setItem("playlist-favorites", "true");
  }

  loadPlaylists();

  if (sessionStorage.getItem("queue")) loadSessionStorage();
});

/* --- Keyboard shortcuts --- */

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  } else if (e.code === "ArrowRight" && audio.duration) {
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  } else if (e.code === "ArrowLeft") {
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }
});

/* --- Mobile gesture prevention --- */

document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

