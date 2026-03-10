/**
 * Search functionality: query the API and render results as cards.
 */

import { IMG, imgUrl, searchCategory } from "./api.js";
import { createCard, dedupItems } from "./ui.js";

const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

let _addToQueue = null;
let _openArtist = null;
let _openAlbum = null;

export function registerSearchCallbacks(fns) {
  _addToQueue = fns.addToQueue;
  _openArtist = fns.openArtist;
  _openAlbum = fns.openAlbum;
}

export async function searchAll(q) {
  searchResults.innerHTML = "";
  if (!q.trim()) return;

  await Promise.all([
    renderSection("Songs", "s", q, renderSongs),
    renderSection("Artists", "a", q, renderArtists),
    renderSection("Albums", "al", q, renderAlbums),
  ]);
}

async function renderSection(title, type, q, render) {
  const data = await searchCategory(type, q);
  if (!data) return;

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<h3>${title}</h3><div class="cards"></div>`;
  searchResults.appendChild(row);
  render(data, row.querySelector(".cards"));
}

function renderSongs(data, container) {
  const tracks = data?.tracks?.items || data?.items || [];
  const deduped = dedupItems(
    tracks,
    (t) =>
      `${t.title.toLowerCase()}|${(t.artists || []).map((a) => a.name.toLowerCase()).sort().join(",")}`,
  );
  deduped.forEach((t) => {
    const img = t?.album?.cover ? imgUrl(t.album.cover) : "";
    container.appendChild(createCard(img, t.title, () => _addToQueue?.(t)));
  });
}

function renderArtists(data, container) {
  const artists = data?.artists?.items || data?.items || [];
  dedupItems(artists, (a) => a.name.toLowerCase().replace(/[\s-]/g, ""))
    .filter((a) => a.id && a.picture)
    .forEach((a) => {
      const img = imgUrl(a.picture);
      container.appendChild(
        createCard(img, a.name, () => _openArtist?.(a.id, a.name, a.picture)),
      );
    });
}

function renderAlbums(data, container) {
  const albums = data?.albums?.items || data?.items || [];
  const deduped = dedupItems(
    albums,
    (al) =>
      `${al.title.toLowerCase()}|${(al.artists || []).map((a) => a.name.toLowerCase()).sort().join(",")}`,
  );
  deduped.forEach((al) => {
    const img = al.cover ? imgUrl(al.cover) : "";
    container.appendChild(createCard(img, al.title, () => _openAlbum?.(al)));
  });
}

searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchAll(searchInput.value);
});

searchInput?.addEventListener("input", () => {
  if (!searchInput.value.trim()) return;
  clearTimeout(searchInput._timeout);
  searchInput._timeout = setTimeout(() => searchAll(searchInput.value), 250);
});
