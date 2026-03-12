let currentView = "home";
let currentState: any = { view: "home" };

/** Show a view by id with smooth fade transition */
export function showView(id: string, pushHistory = true, state?: any) {
  // Fade out current view
  const currentViewEl = document.querySelector(".view:not(.hidden)");
  if (currentViewEl && currentViewEl.id === id && !state) return; // Already showing

  currentViewEl?.classList.add("fade-out");

  // Switch view after fade
  setTimeout(() => {
    document.querySelectorAll(".view").forEach((v) => {
      v.classList.add("hidden");
      v.classList.remove("fade-out");
    });
    const newView = document.getElementById(id)!;
    newView.classList.remove("hidden");
    newView.classList.add("fade-in");

    currentView = id;
    currentState = { view: id, ...state };
    updateNavHighlight();
    window.dispatchEvent(new Event("showViewEvent"));

    // Push to browser history (use replaceState for initial/same view)
    if (pushHistory) {
      const url = state?.id ? `#${id}/${state.id}` : `#${id}`;
      window.history.pushState(currentState, "", url);
    }
  }, 200);
}

/** Update nav button highlights */
function updateNavHighlight() {
  document.querySelectorAll("#topNav button").forEach((btn) => {
    btn.classList.remove("active");
  });

  const navBtn = document.getElementById(`nav${currentView.charAt(0).toUpperCase() + currentView.slice(1)}`);
  if (navBtn) navBtn.classList.add("active");
}

/** Initialize top nav and history support */
export function initNavigation() {
  const topNav = document.getElementById("topNav")!;

  // Initialize nav highlight
  updateNavHighlight();

  // Handle browser back/forward
  window.addEventListener("popstate", (e) => {
    const state = e.state || { view: "home" };
    const targetView = state.view || "home";
    currentState = state;
    
    if (state.id) {
      // Restore page with ID (album, artist, playlist)
      if (targetView === "album") {
        import("../components/AlbumPage").then(({ openAlbumById }) =>
          openAlbumById(state.id, false),
        );
      } else if (targetView === "artist") {
        import("../components/ArtistPage").then(({ openArtistById }) =>
          openArtistById(state.id, false),
        );
      }
    } else {
      showView(targetView, false);
    }
  });

  // Parse initial hash if present
  const hash = window.location.hash.slice(1);
  if (hash) {
    const [view, id] = hash.split("/");
    if (["home", "search", "library", "album", "artist"].includes(view)) {
      if (id) {
        currentState = { view, id };
        if (view === "album") {
          import("../components/AlbumPage").then(({ openAlbumById }) =>
            openAlbumById(id, false),
          );
        } else if (view === "artist") {
          import("../components/ArtistPage").then(({ openArtistById }) =>
            openArtistById(id, false),
          );
        }
      } else {
        showView(view, false);
      }
    }
  }
}
