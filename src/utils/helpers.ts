/** Format seconds to H:MM:SS or M:SS */
export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Lighten or darken a hex color by a percentage offset */
export function adjustColor(hex: string | null | undefined, percent: number): string {
  if (!hex) return "#888888"; // Default gray color if no hex provided
  let num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.min(255, Math.max(0, r + percent));
  g = Math.min(255, Math.max(0, g + percent));
  b = Math.min(255, Math.max(0, b + percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Remove duplicate items from an array using a key function */
export function dedupItems<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Show a brief toast notification */
export function showToast(message: string): void {
  const toast = document.createElement("div");
  toast.classList.add("toast");
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = "1"));
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/** Format a date string as a readable locale date */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/** Show a loading spinner with spinning sigma */
export function showLoadingSpinner(elementId: string = "album"): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 400px;">
      <div style="font-size: 4rem; animation: spin 2s linear infinite;">Σ</div>
    </div>
  `;
}
