const audio = document.getElementById("audio") as HTMLAudioElement;

/** Save current queue and playback position to sessionStorage */
export function saveSessionStorage(queue: any[], index: number) {
  const sessionQueue = queue.map((obj) => JSON.stringify(obj)).join(", ");
  sessionStorage.setItem(
    "queue",
    JSON.stringify({
      items: sessionQueue,
      i: index,
      currentTime: audio.currentTime,
    }),
  );
}

/** Restore queue and playback position from sessionStorage */
export function loadSessionStorage() {
  const raw = sessionStorage.getItem("queue");
  if (!raw) return false;
  try {
    const newQueue = JSON.parse(raw);
    // We dynamically import audioPlayer to avoid circular deps at init time
    import("./audioPlayer").then(({ setQueue, setIndex, updateQueueUI, loadTrack }) => {
      const restored = JSON.parse("[" + newQueue.items + "]");
      setQueue(restored);
      setIndex(newQueue.i);
      updateQueueUI();
      loadTrack(newQueue.i).then(() => {
        audio.currentTime = newQueue.currentTime;
      });
    });
    return true;
  } catch {
    return false;
  }
}
