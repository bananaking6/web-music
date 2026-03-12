import { formatTime, showToast } from "../utils/helpers";
import { preloadedAudio, index, queue } from "../lib/audioPlayer";
import { saveSessionStorage } from "../lib/sessionStorage";

const audio = document.getElementById("audio") as HTMLAudioElement;
const seekBar = document.getElementById("seekBar")!;
const progressBar = document.getElementById("progressBar")!;
const bufferBar = document.getElementById("bufferBar")!;
const timeTooltip = document.getElementById("timeTooltip")!;
const currentTimeEl = document.getElementById("currentTime")!;
const totalTimeEl = document.getElementById("totalTime")!;

let isDragging = false;
let animationFrameId: number;

function updateProgress() {
  if (!audio.duration) return;

  const isReversed = preloadedAudio[index]?.reversed || false;
  const pct = (audio.currentTime / audio.duration) * 100;

  if (isReversed) {
    progressBar.classList.add("reversed");
    progressBar.style.width = 100 - pct + "%";
  } else {
    progressBar.classList.remove("reversed");
    progressBar.style.width = pct + "%";
  }

  currentTimeEl.textContent = formatTime(audio.currentTime);
  totalTimeEl.textContent = "-" + formatTime(audio.duration - audio.currentTime);

  if (audio.buffered.length) {
    const end = audio.buffered.end(audio.buffered.length - 1);
    bufferBar.style.width = (end / audio.duration) * 100 + "%";
  }
}

function smoothUpdate() {
  updateProgress();
  if (!audio.paused && audio.duration) {
    animationFrameId = requestAnimationFrame(smoothUpdate);
  }
}

function seek(clientX: number) {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
}

function updatePlayIcon() {
  const btn = document.querySelector(".player-controls button:nth-child(3)") as HTMLButtonElement;
  if (!btn) return;
  if (audio.paused) {
    btn.innerHTML =
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  } else {
    btn.innerHTML =
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
  }
}

/** Initialize all player seek bar and progress listeners */
export function initPlayer() {
  // Seek bar — mouse
  seekBar.addEventListener("mousemove", (e) => {
    const rect = seekBar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    timeTooltip.style.left = pct * 100 + "%";
    if (audio.duration) timeTooltip.textContent = formatTime(pct * audio.duration);
  });

  seekBar.addEventListener("mousedown", (e) => {
    isDragging = true;
    seek(e.clientX);
  });
  window.addEventListener("mousemove", (e) => {
    if (isDragging) seek(e.clientX);
  });
  window.addEventListener("mouseup", () => (isDragging = false));

  // Seek bar — tooltip visibility
  seekBar.addEventListener("mousemove", (e) => {
    const rect = seekBar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    timeTooltip.textContent = formatTime(audio.duration * pct);
    timeTooltip.style.left = pct * 100 + "%";
    timeTooltip.style.opacity = "1";
  });
  seekBar.addEventListener("mouseleave", () => {
    timeTooltip.style.opacity = "0";
  });

  // Seek bar — touch
  seekBar.addEventListener("touchstart", (e) => {
    isDragging = true;
    seek(e.touches[0].clientX);
  });
  seekBar.addEventListener("touchmove", (e) => {
    if (isDragging) {
      seek(e.touches[0].clientX);
      e.preventDefault();
    }
  });
  seekBar.addEventListener("touchend", () => (isDragging = false));

  // Audio events
  audio.addEventListener("play", () => {
    updatePlayIcon();
    updateProgress();
    smoothUpdate();
  });
  audio.addEventListener("pause", () => {
    updatePlayIcon();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  });
  audio.addEventListener("canplay", () => {
    updateProgress();
    if (!audio.paused) smoothUpdate();
  });
  audio.addEventListener("seeking", updateProgress);
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("timeupdate", () => saveSessionStorage(queue, index));

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
    if (e.code === "Space") {
      e.preventDefault();
      import("../lib/audioPlayer").then(({ togglePlay }) => togglePlay());
    } else if (e.code === "ArrowRight") {
      if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    } else if (e.code === "ArrowLeft") {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    }
  });

  // Prevent pinch zoom on mobile
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener(
    "touchmove",
    (e) => { if (e.touches.length > 1) e.preventDefault(); },
    { passive: false },
  );

  // Clicking album cover opens album page
  document.getElementById("playerCover")!.addEventListener("click", () => {
    const track = queue[index];
    import("../lib/api").then(({ fetchAlbum }) =>
      fetchAlbum(track.album.id).then((data) => {
        if (data) import("../components/AlbumPage").then(({ openAlbum }) => openAlbum(data));
      }),
    );
  });

  // Clicking artist name opens artist page
  document.getElementById("playerArtist")!.addEventListener("click", () => {
    const track = queue[index];
    if (track?.artists?.[0]?.id) {
      import("../components/ArtistPage").then(({ openArtist }) =>
        openArtist(
          track.artists[0].id,
          track.artists[0].name,
          track.artists[0].picture || "",
        ),
      );
    }
  });
}
