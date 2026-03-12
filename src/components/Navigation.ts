/** Show a view by id, hiding all others */
export function showView(id: string) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(id)!.classList.remove("hidden");
  window.dispatchEvent(new Event("showViewEvent"));
}

/** Initialize mobile nav visibility and highlight logic */
export function initNavigation() {
  const mobileNav = document.getElementById("mobileNav")!;
  const navButtons = mobileNav?.querySelectorAll("button");

  function updateNavVisibility() {
    if (window.innerWidth <= 768) {
      mobileNav?.classList.remove("hidden");
    } else {
      mobileNav?.classList.add("hidden");
    }
  }

  function updateNavHighlight() {
    const activeView = document.querySelector(".view:not(.hidden)");
    if (!activeView) return;
    navButtons?.forEach((btn) => btn.classList.remove("active"));
    if (activeView.id === "home")
      document.getElementById("navHome")?.classList.add("active");
    if (activeView.id === "search")
      document.getElementById("navSearch")?.classList.add("active");
  }

  navButtons?.forEach((btn) => {
    btn.addEventListener("click", () => setTimeout(updateNavHighlight, 50));
  });

  window.addEventListener("showViewEvent", updateNavHighlight);
  window.addEventListener("resize", updateNavVisibility);

  updateNavVisibility();
  updateNavHighlight();
}
