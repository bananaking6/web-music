import { fetchArtist, fetchArtistContent, coverUrl, fetchAlbum } from "../lib/api";
import { IMG } from "../utils/constants";
import { addToQueue } from "../lib/audioPlayer";
import { openAddToPlaylistModal, loadPlaylists } from "../components/Playlists";
import { createCard } from "../components/Search";
import { showView } from "../components/Navigation";
import { togglePinnedArtist } from "../lib/localStorage";
import { showToast } from "../utils/helpers";

function deduplicateAlbums(albums: any[]): any[] {
  const unique = new Map<string, any>();
  for (const album of albums) {
    if (!album?.title) continue;
    const key = JSON.stringify([album.title, album.numberOfTracks || 0]);
    if (unique.has(key)) {
      const existing = unique.get(key)!;
      const existingExplicit = existing.explicit || false;
      const newExplicit = album.explicit || false;
      if (newExplicit && !existingExplicit) { unique.set(key, album); continue; }
      if (!newExplicit && existingExplicit) continue;
      const existingTags = existing.mediaMetadata?.tags?.length || 0;
      const newTags = album.mediaMetadata?.tags?.length || 0;
      if (newTags > existingTags) { unique.set(key, album); continue; }
      if ((album.popularity || 0) > (existing.popularity || 0)) unique.set(key, album);
    } else {
      unique.set(key, album);
    }
  }
  return Array.from(unique.values());
}

/** Open the artist page */
export async function openArtist(id: string, name: string, pic: string) {
  showView("artist");
  const el = document.getElementById("artist")!;
  el.innerHTML = `
    <div id="artistBanner">
      <img src="${IMG + pic.replaceAll("-", "/")}/750x750.jpg" alt="artist">
      <h2>${name}</h2>
    </div>
    <div id="artistContent"></div>
  `;

  // Toggle pin on artist name click
  el.querySelector("h2")!.addEventListener("click", () => {
    togglePinnedArtist(id, name, pic);
    loadPlaylists();
  });

  const content = document.getElementById("artistContent")!;

  const [primaryJson, contentJson] = await Promise.all([
    fetchArtist(id),
    fetchArtistContent(id),
  ]);

  const primaryData = primaryJson?.data || primaryJson;
  const rawArtist =
    primaryData?.artist ||
    (Array.isArray(primaryData) ? primaryData[0] : primaryData);

  const contentData = contentJson?.data || contentJson;
  const entries = Array.isArray(contentData) ? contentData : [contentData];

  const albumMap = new Map<string, any>();
  const trackMap = new Map<string, any>();

  const isTrack = (v: any) => v?.id && v.duration && v.album;
  const isAlbum = (v: any) => v?.id && "numberOfTracks" in v;

  const scan = (value: any, visited = new Set<any>()) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) { value.forEach((item) => scan(item, visited)); return; }
    const item = value.item || value;
    if (isAlbum(item)) albumMap.set(item.id, item);
    if (isTrack(item)) trackMap.set(item.id, item);
    Object.values(value).forEach((n) => scan(n, visited));
  };
  entries.forEach((entry) => scan(entry));

  const allAlbums = deduplicateAlbums(Array.from(albumMap.values()));
  const albums = allAlbums.filter((a) => !["EP", "SINGLE"].includes(a.type));
  const epsAndSingles = allAlbums.filter((a) => ["EP", "SINGLE"].includes(a.type));

  // Top tracks
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
        fetchAlbum(t.album.id).then((data) => {
          const fullTrack = data?.items?.find((item: any) => item.item.id === t.id)?.item;
          if (fullTrack) openAddToPlaylistModal(fullTrack);
          else showToast("Failed to load track");
        });
      };
      container.appendChild(d);
    });
    row.appendChild(container);
    content.appendChild(row);
  }

  const renderSection = (title: string, items: any[]) => {
    if (!items.length) return;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<h3>${title}</h3>`;
    const container = document.createElement("div");
    container.className = "cards";
    items.forEach((al) => {
      const img = al.cover ? coverUrl(al.cover) : "";
      container.appendChild(
        createCard(img, al.title, () => {
          import("../components/AlbumPage").then(({ openAlbum }) => openAlbum(al));
        }),
      );
    });
    row.appendChild(container);
    content.appendChild(row);
  };

  renderSection("Albums", albums);
  renderSection("EPs & Singles", epsAndSingles);
}
