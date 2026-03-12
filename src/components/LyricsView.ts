import { fetchLyrics } from "../lib/api";

const audio = document.getElementById("audio") as HTMLAudioElement;
const lyricsView = document.getElementById("lyricsView")!;

let lines: { time: number; duration: number; el: HTMLElement }[] = [];

function parseTimeToMs(timeStr: string): number {
  const [minutes, seconds] = timeStr.split(":");
  return (parseInt(minutes, 10) * 60 + parseFloat(seconds)) * 1000;
}

/** Load and display synced lyrics for the current track */
export async function loadLyrics(track: any) {
  lyricsView.innerHTML = "";
  lines = [];

  const rawData = await fetchLyrics(track.id);
  if (!rawData) return;

  const rawLines = rawData.split("\n");
  const parsedLines: { time: number; text: string }[] = [];

  rawLines.forEach((line) => {
    const match = line.match(/\[(\d+:\d+\.\d+)\]\s*(.*)/);
    if (match) {
      parsedLines.push({ time: parseTimeToMs(match[1]), text: match[2] });
    }
  });

  parsedLines.forEach((lineData, i) => {
    const durationMs =
      i + 1 < parsedLines.length
        ? parsedLines[i + 1].time - lineData.time
        : audio.duration * 1000 - lineData.time;

    const lineDiv = document.createElement("div");
    lineDiv.className = "lyric-line";
    lineDiv.innerText = lineData.text;
    lineDiv.dataset.time = String(lineData.time);
    lineDiv.dataset.duration = String(durationMs);
    lineDiv.onclick = () => { audio.currentTime = lineData.time / 1000; };

    lines.push({ time: lineData.time, duration: durationMs, el: lineDiv });
    lyricsView.appendChild(lineDiv);
  });
}

/** Toggle lyrics view visibility */
export function toggleLyrics() {
  if (lyricsView.innerHTML === "") {
    lyricsView.classList.add("hidden");
    import("../utils/helpers").then(({ showToast }) => showToast("No lyrics available"));
  } else {
    lyricsView.classList.toggle("hidden");
  }
}

/** Update lyrics highlighting based on current playback time */
export function updateLyrics() {
  if (!lines.length) return;
  const now = audio.currentTime * 1000;
  let currentLine: { el: HTMLElement } | null = null;

  for (const line of lines) {
    const start = line.time;
    const end = line.time + line.duration;
    if (now >= start && now <= end) {
      const progress = (now - start) / line.duration;
      line.el.classList.add("active");
      line.el.style.setProperty("--p", String(progress));
      currentLine ??= { el: line.el };
    } else {
      line.el.classList.remove("active");
      line.el.style.setProperty("--p", "0");
    }
  }

  currentLine?.el.scrollIntoView({ block: "center", behavior: "smooth" });
}

/** Attach the timeupdate handler for lyric sync */
export function initLyrics() {
  audio.addEventListener("timeupdate", updateLyrics);
}
