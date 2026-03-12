import { searchQuery } from "../lib/api";
import { coverUrl } from "../lib/api";
import { dedupItems } from "../utils/helpers";
import { addToQueue } from "../lib/audioPlayer";

const searchInput = document.getElementById("searchInput") as HTMLInputElement;
const searchResults = document.getElementById("searchResults")!;

/** Create a card element for search results */
export function createCard(img: string, title: string, onclick: () => void): HTMLElement {
  const card = document.createElement("div");
  card.className = "card";
  card.title = title;
  card.innerHTML = `<img src="${img || ""}" alt="${title}"><span>${title}</span>`;
  card.onclick = onclick;
  return card;
}

function renderSongs(data: any, container: HTMLElement) {
  const tracks = data?.tracks?.items || data?.items || [];
  const deduped = dedupItems(
    tracks,
    (t: any) =>
      `${t.title.toLowerCase()}|${(t.artists || [])
        .map((a: any) => a.name.toLowerCase())
        .sort()
        .join(",")}`,
  );
  deduped.forEach((t: any) => {
    const img = t?.album?.cover ? coverUrl(t.album.cover) : "";
    container.appendChild(createCard(img, t.title, () => addToQueue(t)));
  });
}

function renderArtists(data: any, container: HTMLElement) {
  const artists = data?.artists?.items || data?.items || [];
  const deduped = dedupItems(artists, (a: any) =>
    a.name.toLowerCase().replace(/[\s-]/g, ""),
  );
  deduped
    .filter((a: any) => a.id && a.picture)
    .forEach((a: any) => {
      const img = coverUrl(a.picture);
      container.appendChild(
        createCard(img, a.name, () => {
          import("../components/ArtistPage").then(({ openArtist }) =>
            openArtist(a.id, a.name, a.picture),
          );
        }),
      );
    });
}

function renderAlbums(data: any, container: HTMLElement) {
  const albums = data?.albums?.items || data?.items || [];
  const deduped = dedupItems(
    albums,
    (al: any) =>
      `${al.title.toLowerCase()}|${(al.artists || [])
        .map((a: any) => a.name.toLowerCase())
        .sort()
        .join(",")}`,
  );
  deduped.forEach((al: any) => {
    const img = al.cover ? coverUrl(al.cover) : "";
    container.appendChild(
      createCard(img, al.title, () => {
        import("../components/AlbumPage").then(({ openAlbum }) => openAlbum(al));
      }),
    );
  });
}

async function searchSection(
  title: string,
  param: string,
  q: string,
  render: (data: any, container: HTMLElement) => void,
) {
  const data = await searchQuery(param, q);
  if (!data) return;
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<h3>${title}</h3><div class="cards"></div>`;
  searchResults.appendChild(row);
  render(data, row.querySelector(".cards")!);
}

async function searchAll(q: string) {
  searchResults.innerHTML = "";
  await Promise.all([
    searchSection("Songs", "s", q, renderSongs),
    searchSection("Artists", "a", q, renderArtists),
    searchSection("Albums", "al", q, renderAlbums),
  ]);
}

/** Wire up the search input listeners */
export function initSearch() {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchAll(searchInput.value);
  });
  searchInput.addEventListener("input", () => {
    if (!searchInput.value.trim()) return;
    clearTimeout((searchInput as any)._searchTimeout);
    (searchInput as any)._searchTimeout = setTimeout(
      () => searchAll(searchInput.value),
      250,
    );
  });
}
