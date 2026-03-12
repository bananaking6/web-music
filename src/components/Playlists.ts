import {
  getPlaylistIds,
  getPlaylist,
  createPlaylist,
  deletePlaylist,
  toggleTrackInPlaylist,
  getPinned,
} from "../lib/localStorage";
import { coverUrl } from "../lib/api";
import { showToast } from "../utils/helpers";
import { queue, index } from "../lib/audioPlayer";
import { fetchAlbum } from "../lib/api";

const timeTooltip = document.getElementById("timeTooltip")!;
let tooltipHideTimeout: ReturnType<typeof setTimeout>;

/** Update tooltip position to follow cursor */
function updateTooltipPosition(e: MouseEvent) {
  timeTooltip.style.left = e.clientX + 10 + "px";
  timeTooltip.style.top = e.clientY - 30 + "px";
}

/** Show a tooltip with card information on hover */
function showCardTooltip(element: HTMLElement, text: string, e: MouseEvent) {
  clearTimeout(tooltipHideTimeout);
  timeTooltip.textContent = text;
  updateTooltipPosition(e);
  timeTooltip.classList.add("visible");
}

/** Hide the tooltip */
function hideCardTooltip() {
  tooltipHideTimeout = setTimeout(() => {
    timeTooltip.classList.remove("visible");
  }, 100);
}

/** Open a playlist in the album view */
export async function openPlaylist(id: string) {
  const pl = await getPlaylist(id);
  if (!pl) {
    console.warn("Playlist not found:", id);
    return;
  }
  import("../components/AlbumPage").then(({ openAlbum }) =>
    openAlbum({
      title: pl.title,
      type: "PLAYLIST",
      cover: "5806b59b-2f3d-4d0a-8541-e75de4e58f2c",
      releaseDate: `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 1}`,
      artists: [{ name: "You" }],
      playlistTracks: pl.tracks || [],
      duration: pl.duration,
      numberOfTracks: pl.numberOfTracks,
      id: pl.id,
    }),
  );
}

/** Render sidebar playlists and pinned items */
export async function loadPlaylists() {
  const playlistsBar = document.getElementById("playlists")!;
  playlistsBar.innerHTML = "";

  const playlistIds = await getPlaylistIds();
  for (const id of playlistIds) {
    const pl = await getPlaylist(id);
    if (!pl) continue;

    const plDiv = document.createElement("div");
    plDiv.className = "card";
    plDiv.title = pl.title;

    // Mosaic cover from up to 4 distinct album covers in the playlist
    const covers: string[] = [];
    const seenCovers = new Set<string>();
    for (const t of pl.tracks) {
      if (t.album?.cover && !seenCovers.has(t.album.cover)) {
        seenCovers.add(t.album.cover);
        covers.push(t.album.cover);
        if (covers.length === 4) break;
      }
    }

    if (covers.length > 0) {
      const grid = document.createElement("div");
      grid.style.cssText =
        "display: grid; grid-template-columns: repeat(2, 1fr); width: 100%; height: 100%;";
      covers.forEach((cover) => {
        const img = document.createElement("img");
        img.src = coverUrl(cover);
        img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
        grid.appendChild(img);
      });
      plDiv.appendChild(grid);
    }

    plDiv.onclick = () => openPlaylist(id);
    plDiv.addEventListener("mouseenter", (e) => 
      showCardTooltip(plDiv, `${pl.title} (${pl.numberOfTracks} ${pl.numberOfTracks === 1 ? "track" : "tracks"})`, e as MouseEvent)
    );
    plDiv.addEventListener("mousemove", updateTooltipPosition);
    plDiv.addEventListener("mouseleave", hideCardTooltip);
    playlistsBar.appendChild(plDiv);
  }

  // Pinned items
  const pinnedBar = document.getElementById("pinned")!;
  pinnedBar.innerHTML = "";
  const pinnedItems = await getPinned();
  pinnedItems.forEach((pinnedItem: any) => {
    const pDiv = document.createElement("div");
    pDiv.className = "card";

    if (pinnedItem.type === "album") {
      const al = pinnedItem.data;
      const img = document.createElement("img");
      img.src = coverUrl(al.cover);
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
      pDiv.appendChild(img);
      pDiv.onclick = () =>
        import("../components/AlbumPage").then(({ openAlbum }) => openAlbum(al));
      pDiv.addEventListener("mouseenter", (e) => 
        showCardTooltip(pDiv, al.title, e as MouseEvent)
      );
      pDiv.addEventListener("mousemove", updateTooltipPosition);
      pDiv.addEventListener("mouseleave", hideCardTooltip);
    } else if (pinnedItem.type === "artist") {
      const ar = pinnedItem.data;
      const img = document.createElement("img");
      img.src = coverUrl(ar[2]);
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
      pDiv.appendChild(img);
      pDiv.onclick = () =>
        import("../components/ArtistPage").then(({ openArtist }) =>
          openArtist(ar[0], ar[1], ar[2]),
        );
      pDiv.addEventListener("mouseenter", (e) => 
        showCardTooltip(pDiv, ar[1], e as MouseEvent)
      );
      pDiv.addEventListener("mousemove", updateTooltipPosition);
      pDiv.addEventListener("mouseleave", hideCardTooltip);
    }

    pinnedBar.appendChild(pDiv);
  });
}

/** Build the playlist checkbox list inside the modal */
export async function buildPlaylistListForModal(options: {
  tracks: any[];
  headerText?: string;
}) {
  const tracks = options.tracks || [];
  const modal = document.getElementById("playlistModal")!;
  const list = document.getElementById("playlistList")!;

  const header = modal.querySelector("h3");
  if (header && options.headerText !== undefined) header.textContent = options.headerText;

  list.innerHTML = "";

  const playlistIds = await getPlaylistIds();
  for (const id of playlistIds) {
    let pl = await getPlaylist(id);
    if (!pl) continue;

    const div = document.createElement("div");
    div.className = "playlist-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `chk-${id}`;

    const tracksInPlaylist = tracks.filter((t) =>
      pl!.tracks.some((p: any) => p.id === t.id),
    ).length;

    if (tracks.length === 1) {
      checkbox.checked = tracksInPlaylist === 1;
      checkbox.indeterminate = false;
    } else {
      checkbox.checked = tracksInPlaylist === tracks.length && tracks.length > 0;
      checkbox.indeterminate =
        tracksInPlaylist > 0 && tracksInPlaylist < tracks.length;
    }

    checkbox.onchange = async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (tracks.length === 1) {
        await toggleTrackInPlaylist(id, tracks[0], checked);
      } else {
        for (const t of tracks) {
          await toggleTrackInPlaylist(id, t, checked);
        }
      }
      pl = await getPlaylist(id);
      const updatedCount = tracks.filter((t) =>
        pl!.tracks.some((p: any) => p.id === t.id),
      ).length;
      checkbox.checked = updatedCount === tracks.length && tracks.length > 0;
      checkbox.indeterminate = updatedCount > 0 && updatedCount < tracks.length;
    };

    const label = document.createElement("label");
    label.htmlFor = `chk-${id}`;
    label.textContent = pl.title || "";

    div.appendChild(checkbox);
    div.appendChild(label);
    div.onclick = (e) => {
      if (e.target !== checkbox && e.target !== label) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };

    list.appendChild(div);
  }
}

/** Open the add-to-playlist modal for a single track */
export async function openAddToPlaylistModal(track?: any) {
  if (!track) {
    if (queue.length > 0) {
      track = queue[index];
    } else {
      showToast("No track selected");
      return;
    }
  }
  const modal = document.getElementById("playlistModal")!;
  modal.classList.remove("hidden");
  await buildPlaylistListForModal({
    tracks: [track],
    headerText: `Add "${track.title || track.name || "Track"}" to Playlist`,
  });
  modal.dataset.modalType = "single";
  modal.dataset.trackId = track.id;
}

/** Open the add-to-playlist modal for a full album */
export async function openAddAlbumToPlaylistModal(tracks: any[], albumTitle: string) {
  if (!tracks?.length) {
    showToast("No tracks to add");
    return;
  }
  const modal = document.getElementById("playlistModal")!;
  modal.classList.remove("hidden");
  await buildPlaylistListForModal({
    tracks,
    headerText: `Add "${albumTitle}" to Playlist`,
  });
  modal.dataset.modalType = "multi";
  delete modal.dataset.trackId;
}

/** Open the add-to-playlist modal for all tracks of an artist */
export async function openAddArtistToPlaylistModal(albums: any[], artist: any) {
  const modal = document.getElementById("playlistModal")!;
  if (!modal) return;
  try {
    const trackArrays = await Promise.all(
      albums.map((al) => fetchAlbum(al.id).then((data) => data?.items || [])),
    );
    const tracks = trackArrays.flat();
    modal.classList.remove("hidden");
    await buildPlaylistListForModal({
      tracks,
      headerText: `Add "${artist.name}" to Playlist`,
    });
    modal.dataset.modalType = "multi";
    delete modal.dataset.trackId;
  } catch (e) {
    console.error("Failed to fetch album tracks:", e);
  }
}

/** Close the playlist modal */
export async function closePlaylistModal() {
  document.getElementById("playlistModal")!.classList.add("hidden");
  await loadPlaylists();
}

/** Show a right-click context menu for a track */
export async function showTrackContextMenu(x: number, y: number, track: any) {
  let menu = document.getElementById("trackContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "trackContextMenu";
    menu.className = "context-menu";
    menu.style.cssText =
      "position:absolute;z-index:9999;background:#fff;border:1px solid rgba(0,0,0,0.12);box-shadow:0 2px 8px rgba(0,0,0,0.12);padding:4px 0;display:none;";
    document.body.appendChild(menu);
    document.addEventListener("click", () => { menu!.style.display = "none"; });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") menu!.style.display = "none";
    });
  }

  menu.innerHTML = "";

  const makeItem = (text: string, onClick: () => void) => {
    const it = document.createElement("div");
    it.className = "context-menu-item";
    it.style.cssText = "padding:8px 16px;cursor:pointer;";
    it.textContent = text;
    it.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onClick();
      menu!.style.display = "none";
    });
    it.addEventListener("mouseover", () => (it.style.background = "rgba(0,0,0,0.04)"));
    it.addEventListener("mouseout", () => (it.style.background = "transparent"));
    return it;
  };

  menu.appendChild(makeItem("Add to playlist...", () => openAddToPlaylistModal(track)));

  const divider = document.createElement("div");
  divider.style.cssText = "height:1px;margin:6px 0;background:rgba(0,0,0,0.06);";
  menu.appendChild(divider);

  let foundAny = false;
  const playlistIds = await getPlaylistIds();
  for (const id of playlistIds) {
    const pl = await getPlaylist(id);
    if (!pl) continue;
    menu.appendChild(
      makeItem(`Quick add to ${pl.title}`, async () => {
        await toggleTrackInPlaylist(id, track, true);
      }),
    );
    foundAny = true;
  }

  if (!foundAny) {
    menu.appendChild(
      makeItem("No playlists yet — create one", async () => {
        await createPlaylist();
        await loadPlaylists();
      }),
    );
  }

  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
}

/** Attach a right-click context menu to a track DOM element */
export function setupTrackContextMenu(el: HTMLElement, track: any) {
  if (!el || !track) return;
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showTrackContextMenu(e.pageX, e.pageY, track);
  });
}

/** Create a new playlist from within the modal */
export async function createNewPlaylistFromModal() {
  await createPlaylist();
  await closePlaylistModal();
}

/** Initialize playlist sidebar and modal close button */
export async function initPlaylists() {
  await loadPlaylists();

  // Modal backdrop close
  document.getElementById("playlistModal")!.addEventListener("click", async (e) => {
    if (e.target === document.getElementById("playlistModal")) await closePlaylistModal();
  });
}
