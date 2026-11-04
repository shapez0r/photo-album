// photoalbum colour themes. Loaded synchronously in <head> (before the page is
// drawn) so a chosen theme is applied without a flash of the default colours.
// The choice is remembered in this browser (localStorage).
(() => {
  "use strict";
  const THEMES = [
    { id: "auto", label: "System (light/dark)", group: "" },
    { id: "blush", label: "Blush", group: "Light" },
    { id: "sage", label: "Sage", group: "Light" },
    { id: "oat", label: "Oat milk", group: "Light" },
    { id: "dusk", label: "Dusk", group: "Dark" },
    { id: "mocha", label: "Mocha", group: "Dark" },
  ];
  const KEY = "photoalbum.theme";
  const valid = (id) => THEMES.some((t) => t.id === id);

  function get() {
    try {
      const v = localStorage.getItem(KEY);
      return valid(v) ? v : "auto";
    } catch { return "auto"; }
  }

  function apply(id) {
    const root = document.documentElement;
    if (!valid(id) || id === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", id);
  }

  function set(id) {
    if (!valid(id)) id = "auto";
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
    apply(id);
    return id;
  }

  apply(get());
  window.PhotoalbumTheme = { list: THEMES, get, set };
})();
