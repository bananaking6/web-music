import { transferPlaylist, validatePlaylistID } from "../lib/playlistTransfer";
import { createPlaylist, savePlaylist } from "../lib/localStorage";
import { showToast, showLoadingSpinner } from "../utils/helpers";
import { loadPlaylists } from "./Playlists";

/** Initialize transfer view */
export function initTransfer() {
  const transferBtn = document.getElementById("transferBtn");
  if (transferBtn) {
    transferBtn.addEventListener("click", openTransferModal);
  }
}

/** Open transfer modal */
function openTransferModal() {
  const modal = document.createElement("div");
  modal.id = "transferModal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement("div");
  content.style.cssText = `
    background: var(--color-bg);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  `;

  content.innerHTML = `
    <h2 style="margin-top: 0;">Transfer Playlist</h2>
    <p style="color: var(--color-text-muted); margin-bottom: var(--space-md);">
      Import a playlist from Spotify or Apple Music
    </p>

    <div style="margin-bottom: var(--space-md);">
      <label style="display: block; margin-bottom: var(--space-sm); font-weight: 500;">
        Platform
      </label>
      <select id="platformSelect" style="
        width: 100%;
        padding: var(--space-sm);
        background: var(--color-bg-elevated);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md);
        color: currentColor;
        font-size: 1rem;
      ">
        <option value="spotify">Spotify</option>
        <option value="applemusic">Apple Music</option>
      </select>
    </div>

    <div style="margin-bottom: var(--space-md);">
      <label style="display: block; margin-bottom: var(--space-sm); font-weight: 500;">
        Playlist ID or URL
      </label>
      <input id="playlistInput" type="text" placeholder="Paste playlist ID or URL" style="
        width: 100%;
        padding: var(--space-sm);
        background: var(--color-bg-elevated);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md);
        color: currentColor;
        font-size: 1rem;
        box-sizing: border-box;
      ">
      <div style="color: var(--color-text-muted); font-size: 0.85rem; margin-top: var(--space-xs);">
        <span id="platformHint">Spotify: 22-character playlist ID</span>
      </div>
    </div>

    <div style="margin-bottom: var(--space-md);">
      <label style="display: block; margin-bottom: var(--space-sm); font-weight: 500;">
        Playlist Name
      </label>
      <input id="playlistNameInput" type="text" placeholder="My Imported Playlist" style="
        width: 100%;
        padding: var(--space-sm);
        background: var(--color-bg-elevated);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md);
        color: currentColor;
        font-size: 1rem;
        box-sizing: border-box;
      ">
    </div>

    <div id="progressContainer" style="display: none; margin-bottom: var(--space-md);">
      <div style="color: var(--color-text-muted); font-size: 0.9rem; margin-bottom: var(--space-xs);">
        <span id="progressText">Processing tracks: 0/0</span>
      </div>
      <div style="
        width: 100%;
        height: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        overflow: hidden;
      ">
        <div id="progressBar" style="
          width: 0%;
          height: 100%;
          background: var(--main-color);
          transition: width 0.2s ease;
        "></div>
      </div>
    </div>

    <div style="display: flex; gap: var(--space-sm); justify-content: flex-end;">
      <button id="cancelTransferBtn" class="modal-btn cancel" style="margin: 0;">
        Cancel
      </button>
      <button id="startTransferBtn" class="modal-btn" style="margin: 0;">
        Transfer
      </button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const platformSelect = document.getElementById("platformSelect") as HTMLSelectElement;
  const playlistInput = document.getElementById("playlistInput") as HTMLInputElement;
  const playlistNameInput = document.getElementById("playlistNameInput") as HTMLInputElement;
  const platformHint = document.getElementById("platformHint")!;
  const cancelBtn = document.getElementById("cancelTransferBtn") as HTMLButtonElement;
  const startBtn = document.getElementById("startTransferBtn") as HTMLButtonElement;

  platformSelect.addEventListener("change", () => {
    const platform = platformSelect.value as "spotify" | "applemusic";
    platformHint.textContent =
      platform === "spotify"
        ? "Spotify: 22-character playlist ID"
        : "Apple Music: 'pl.u-xxxxx' or numeric ID";
  });

  cancelBtn.addEventListener("click", () => {
    modal.remove();
  });

  startBtn.addEventListener("click", async () => {
    const platform = platformSelect.value as "spotify" | "applemusic";
    let playlistID = playlistInput.value.trim();

    // Extract ID from URL if pasted
    if (platform === "spotify" && playlistID.includes("spotify.com")) {
      const match = playlistID.match(/playlist\/([a-zA-Z0-9]{22})/);
      playlistID = match ? match[1] : playlistID;
    } else if (platform === "applemusic" && playlistID.includes("music.apple.com")) {
      const match = playlistID.match(/playlist\/([a-zA-Z0-9\-]+)/);
      playlistID = match ? match[1] : playlistID;
    }

    if (!playlistID) {
      showToast("Please enter a playlist ID or URL");
      return;
    }

    if (!validatePlaylistID(playlistID, platform as "spotify" | "applemusic")) {
      showToast(`Invalid ${platform} playlist ID format`);
      return;
    }

    const playlistName = playlistNameInput.value.trim() || "Imported Playlist";

    // Disable buttons and show progress
    startBtn.disabled = true;
    playlistInput.disabled = true;
    platformSelect.disabled = true;
    document.getElementById("progressContainer")!.style.display = "block";

    try {
      const tracks = await transferPlaylist(playlistID, platform as "spotify" | "applemusic", (current, total) => {
        const progressBar = document.getElementById("progressBar") as HTMLDivElement;
        const progressText = document.getElementById("progressText")!;
        progressBar.style.width = (current / total) * 100 + "%";
        progressText.textContent = `Processing tracks: ${current}/${total}`;
      });

      if (!tracks.length) {
        showToast("No tracks could be imported");
        modal.remove();
        return;
      }

      // Create playlist and add tracks
      const plId = await createPlaylist(undefined, playlistName);
      const pl = {
        id: plId,
        title: playlistName,
        tracks: tracks,
        numberOfTracks: tracks.length,
        duration: tracks.reduce((sum: number, t: any) => sum + (t.duration || 0), 0),
      };
      await savePlaylist(plId, pl);

      showToast(`Imported ${tracks.length} tracks to "${playlistName}"`);
      await loadPlaylists();
      modal.remove();
    } catch (error) {
      console.error("Transfer failed:", error);
      showToast(`Transfer failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      startBtn.disabled = false;
      playlistInput.disabled = false;
      platformSelect.disabled = false;
    }
  });

  // Close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
}
