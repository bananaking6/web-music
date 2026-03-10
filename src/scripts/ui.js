/**
 * UI utility functions: view management, toasts, formatting, and card creation.
 */

/**
 * Show a named view section, hiding all others.
 * @param {string} id - The element ID of the view to show
 */
export function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(id)?.classList.remove("hidden");
  window.dispatchEvent(new Event("showViewEvent"));
}

/**
 * Display a temporary toast notification.
 * @param {string} message
 */
export function showToast(message) {
  const toast = document.createElement("div");
  toast.classList.add("toast");
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = 1));
  setTimeout(() => {
    toast.style.opacity = 0;
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * Format seconds into M:SS string.
 * @param {number} sec
 * @returns {string}
 */
export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format an ISO date string (YYYY-MM-DD) into a localised readable string.
 * Replaces dashes with slashes so the date is parsed as local time, not UTC.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr.replace(/-/g, "/"));
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/** Return today's date as a YYYY-MM-DD string in local time. */
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Create a card element (image + title) with a click handler.
 * @param {string} img
 * @param {string} title
 * @param {Function} onclick
 * @returns {HTMLElement}
 */
export function createCard(img, title, onclick) {
  const card = document.createElement("div");
  card.className = "card";
  card.title = title;
  card.innerHTML = `<img src="${img || ""}" alt="${title}"><span>${title}</span>`;
  card.onclick = onclick;
  return card;
}

/**
 * Deduplicate an array of items using a key function.
 * @param {Array} items
 * @param {Function} keyFn
 * @returns {Array}
 */
export function dedupItems(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
