/** Save current queue and playback position to sessionStorage */
export function saveSessionStorage(queue: any[], index: number) {
  const audio = document.getElementById("audio") as HTMLAudioElement | null;
  sessionStorage.setItem(
    "queue",
    JSON.stringify({
      items: queue,
      i: index,
      currentTime: audio?.currentTime || 0,
    }),
  );
}

/** Restore queue and playback position from sessionStorage */
export function loadSessionStorage() {
  const raw = sessionStorage.getItem("queue");
  if (!raw) return false;

  try {
    const saved = JSON.parse(raw);

    // Backward compatibility with old storage format (stringified items list)
    let restoredItems: any[] = [];
    if (Array.isArray(saved.items)) {
      restoredItems = saved.items;
    } else if (typeof saved.items === "string") {
      restoredItems = saved.items.trim()
        ? JSON.parse("[" + saved.items + "]")
        : [];
    }

    if (!restoredItems.length) return false;

    const restoredIndex = Number.isInteger(saved.i) ? saved.i : 0;
    const safeIndex = Math.min(Math.max(restoredIndex, 0), restoredItems.length - 1);
    const restoredCurrentTime =
      typeof saved.currentTime === "number" && !Number.isNaN(saved.currentTime)
        ? saved.currentTime
        : 0;

    // We dynamically import audioPlayer to avoid circular deps at init time
    import("./audioPlayer").then(({ setQueue, setIndex, updateQueueUI, loadTrack }) => {
      const audio = document.getElementById("audio") as HTMLAudioElement | null;
      setQueue(restoredItems);
      setIndex(safeIndex);
      updateQueueUI();
      loadTrack(safeIndex).then(() => {
        if (audio) audio.currentTime = restoredCurrentTime;
      });
    });

    return true;
  } catch {
    return false;
  }
}
