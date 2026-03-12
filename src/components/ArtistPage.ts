import { fetchArtist, fetchArtistContent, coverUrl, fetchAlbum } from "../lib/api";
import { IMG } from "../utils/constants";
import { addToQueue } from "../lib/audioPlayer";
import { openAddToPlaylistModal, loadPlaylists } from "../components/Playlists";
import { createCard } from "../components/Search";
import { showView, addToViewHistory } from "../components/Navigation";
import { togglePinnedArtist } from "../lib/localStorage";
import { showToast, showLoadingSpinner } from "../utils/helpers";

/** Show loading placeholder for artist page */
function showLoadingPlaceholder() {
  showLoadingSpinner("artist");
}

function deduplicateAlbums(albums: any[]): any[] {
  const unique = new Map<string, any>();
  for (const album of albums) {
    if (!album?.title) continue;
    const key = JSON.stringify([album.title, album.numberOfTracks || 0, album.explicit || false]);
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
  const { showView: sv } = await import("../components/Navigation");
  sv("artist", true, { id });
  await renderArtistContent(id, name, pic);
}

/** Open artist by ID (used for history/deep-linking) */
export async function openArtistById(id: string, pushHistory = true) {
  const { showView: sv } = await import("../components/Navigation");
  sv("artist", pushHistory, { id });
  showLoadingPlaceholder();
  
  try {
    const json = await fetchArtist(id);
    // Unwrap nested response (same logic as renderArtistContent uses internally)
    const data = json?.data || json;
    const artist = data?.artist || (Array.isArray(data) ? data[0] : data);
    if (artist) {
      await renderArtistContent(id, artist.name || "Artist", artist.picture || "");
    } else {
      await renderArtistContent(id, "Artist", "");
    }
  } catch (error) {
    showToast("Error loading artist");
    console.error(error);
  }
}

/** Render artist page content */
async function renderArtistContent(id: string, name: string, pic: string) {
  const el = document.getElementById("artist")!;
  el.innerHTML = `
    <div id="artistBanner">
      <img src="${IMG + pic.replaceAll("-", "/")}/750x750.jpg" alt="artist">
      <div>
        <h2>${name}</h2>
        <span style="font-size: 0.9rem; color: var(--color-text-muted); display: block; margin-top: var(--space-xs);">ID: ${id}</span>
      </div>
    </div>
    <div style="padding: 20px; display: flex; gap: 10px;">
      <button class="album-action" id="createPlaylistBtn">+ CREATE PLAYLIST</button>
      <button class="album-action secondary" id="pinBtn">📌 PIN</button>
    </div>
    <div id="artistContent"></div>
  `;
  
  // Add to view history with full picture URL (matching AlbumPage pattern)
  addToViewHistory(id, name, "artist", coverUrl(pic));

  // Handle create playlist button
  el.querySelector("#createPlaylistBtn")!.addEventListener("click", async () => {
    const { createArtistPlaylist } = await import("../components/Playlists");
    await createArtistPlaylist(id, name);
  });

  // Handle pin button
  el.querySelector("#pinBtn")!.addEventListener("click", () => {
    togglePinnedArtist(id, name, pic);
    import("../components/Playlists").then(({ loadPlaylists }) => loadPlaylists());
  });

  // Keep the h2 click handler removed since we have a separate pin button now

  const content = document.getElementById("artistContent")!;
  
  // Show loading spinner while fetching
  showLoadingSpinner("artistContent");

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

  content.innerHTML = ""; // Clear loading placeholder

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
      const card = createCard(img, al.title, () => {
        import("../components/AlbumPage").then(({ openAlbum }) => openAlbum(al));
      });
      if (al.explicit) {
        const explicitImg = document.createElement("img");
        explicitImg.src = "e.svg";
        explicitImg.style.position = "absolute";
        explicitImg.style.bottom = "4px";
        explicitImg.style.right = "4px";
        explicitImg.style.width = "16px";
        explicitImg.style.height = "16px";
        card.style.position = "relative";
        card.appendChild(explicitImg);
      }
      container.appendChild(card);
    });
    row.appendChild(container);
    content.appendChild(row);
  };

  renderSection("Albums", albums);
  renderSection("EPs & Singles", epsAndSingles);
}
