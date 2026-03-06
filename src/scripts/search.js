/**
 * Search functionality: query the API and render results as cards.
 */

import { API, IMG } from "./api.js";
import { createCard, dedupItems } from "./ui.js";

const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

// Callbacks registered from main.js to avoid circular imports
let _addToQueue = null;
let _openArtist = null;
let _openAlbum = null;

/**
 * Register cross-module callbacks.
 * @param {{ addToQueue: Function, openArtist: Function, openAlbum: Function }} fns
 */
export function registerSearchCallbacks(fns) {
  _addToQueue = fns.addToQueue;
  _openArtist = fns.openArtist;
  _openAlbum = fns.openAlbum;
}

/**
 * Search all categories simultaneously.
 * @param {string} q
 */
export async function searchAll(q) {
  searchResults.innerHTML = "";
  if (!q.trim()) return;
  const query = API.includes("proxy") ? q.replaceAll(" ", "%2B") : q;
  await Promise.all([
    searchSection("Songs", "s", query, renderSongs),
    searchSection("Artists", "a", query, renderArtists),
    searchSection("Albums", "al", query, renderAlbums),
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
    container.appendChild(
      createCard(img, t.title, () => _addToQueue && _addToQueue(t)),
    );
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
        createCard(
          img,
          a.name,
          () =>
            _openArtist && _openArtist(a.id, a.name, a.picture),
        ),
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
    container.appendChild(
      createCard(img, al.title, () => _openAlbum && _openAlbum(al)),
    );
  });
}

/* --- Search input event listeners --- */

searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchAll(searchInput.value);
});

searchInput?.addEventListener("input", () => {
  if (!searchInput.value.trim()) return;
  clearTimeout(searchInput._searchTimeout);
  searchInput._searchTimeout = setTimeout(
    () => searchAll(searchInput.value),
    250,
  );
});
