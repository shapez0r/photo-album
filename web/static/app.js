// photoalbum web UI: sign-in, camera capture, pinboard album, live slideshow.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const { t } = window.I18N;
  const POLL_MS = 15000;      // album refresh while the page is visible
  const SLIDE_MS = 7000;      // live slideshow interval
  const MAX_EDGE = 2048;      // longest side of uploaded photos
  const JPEG_QUALITY = 0.88;

  const state = {
    user: null, signup: false, authMode: "login",
    photos: [], known: new Set(), quota: 0, used: 0, maxFile: 0, model: "",
    stream: null, facing: "environment", shot: null, viewing: null,
    pollTimer: 0, liveTimer: 0, liveIndex: 0,
  };

  // ---------- API ----------
  class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  async function handle(res) {
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && state.user) { state.user = null; showAuth(t("auth.signInAgain")); }
      throw new HttpError(res.status, data.error || t("err.generic"));
    }
    return data;
  }
  async function api(method, path, body) {
    const opts = { method, credentials: "same-origin", headers: { "X-Requested-With": "photoalbum" } };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return handle(await fetch(`/api${path}`, opts));
  }
  async function uploadPhoto(blob, caption) {
    const res = await fetch(`/api/photos?caption=${encodeURIComponent(caption)}`, {
      method: "POST", credentials: "same-origin", body: blob,
      headers: { "Content-Type": blob.type || "image/jpeg", "X-Requested-With": "photoalbum" },
    });
    return handle(res);
  }
  const imageURL = (p) => `/api/photos/${encodeURIComponent(p.id)}/image`;

  // ---------- helpers ----------
  let toastTimer = 0;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }
  const fmtDate = (sec, opts) => new Intl.DateTimeFormat(window.I18N.lang, opts || { day: "numeric", month: "long", year: "numeric" }).format(new Date(sec * 1000));
  function fmtBytes(n) {
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${new Intl.NumberFormat(window.I18N.lang, { maximumFractionDigits: i ? 1 : 0 }).format(n)} ${units[i]}`;
  }

  // ---------- auth ----------
  function setAuthMode(mode) {
    state.authMode = mode;
    const signup = mode === "signup";
    $("tab-login").classList.toggle("active", !signup);
    $("tab-signup").classList.toggle("active", signup);
    $("tab-login").setAttribute("aria-selected", String(!signup));
    $("tab-signup").setAttribute("aria-selected", String(signup));
    $("name-field").hidden = !signup;
    $("confirm-field").hidden = !signup;
    $("auth-form").password_confirm.disabled = !signup;
    $("auth-password").autocomplete = signup ? "new-password" : "current-password";
    $("auth-submit").dataset.i18n = signup ? "auth.createAccount" : "auth.signIn";
    $("auth-submit").textContent = t($("auth-submit").dataset.i18n);
    $("auth-error").hidden = true;
  }

  function showAuth(msg) {
    stopPolling();
    closeLive();
    $("app-view").hidden = true;
    $("auth-view").hidden = false;
    $("tab-signup").hidden = !state.signup;
    $("signup-disabled").hidden = state.signup;
    if (!state.signup) setAuthMode("login");
    const err = $("auth-error");
    err.hidden = !msg;
    err.textContent = msg || "";
  }

  async function submitAuth(e) {
    e.preventDefault();
    const f = e.target;
    const err = $("auth-error");
    err.hidden = true;
    const body = { email: f.email.value.trim(), password: f.password.value };
    if (state.authMode === "signup") {
      if (body.password.length < 8) { err.textContent = t("auth.passwordShort"); err.hidden = false; return; }
      if (body.password !== f.password_confirm.value) { err.textContent = t("auth.passwordMismatch"); err.hidden = false; return; }
      body.password_confirm = f.password_confirm.value;
      body.display_name = f.display_name.value.trim();
    }
    $("auth-submit").disabled = true;
    try {
      state.user = await api("POST", `/auth/${state.authMode}`, body);
      f.reset();
      await showApp();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      $("auth-submit").disabled = false;
    }
  }

  async function logout() {
    try { await api("POST", "/auth/logout"); } catch { /* ignore */ }
    state.user = null;
    state.photos = [];
    state.known.clear();
    $("board").replaceChildren();
    $("settings").hidden = true;
    showAuth("");
  }

  // ---------- album ----------
  async function showApp() {
    $("auth-view").hidden = true;
    $("app-view").hidden = false;
    renderHeader();
    await refresh(true);
    startPolling();
  }

  function renderHeader() {
    $("today").textContent = fmtDate(Date.now() / 1000, { weekday: "long", day: "numeric", month: "long" });
    $("hello").textContent = t("album.hello", { name: state.user ? state.user.display_name : "" });
    const n = state.photos.length;
    $("count").textContent = n === 1 ? t("album.count1") : t("album.count", { n });
    $("storage").textContent = state.quota > 0
      ? t("album.storage", { used: fmtBytes(state.used), quota: fmtBytes(state.quota) })
      : fmtBytes(state.used);
    $("model").hidden = !state.model;
    $("model").textContent = state.model ? t("album.model", { model: state.model }) : "";
  }

  function pinFor(p, fresh) {
    const btn = document.createElement("a");
    btn.href = "#";
    btn.className = fresh ? "pin fresh" : "pin";
    btn.dataset.id = p.id;
    const fig = document.createElement("figure");
    const img = document.createElement("img");
    img.src = imageURL(p);
    img.alt = p.caption || "";
    img.loading = "lazy";
    img.decoding = "async";
    if (p.width && p.height) { img.width = p.width; img.height = p.height; }
    const cap = document.createElement("figcaption");
    if (p.caption) {
      const c = document.createElement("span");
      c.className = "cap";
      c.textContent = p.caption;
      cap.append(c);
    }
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = fmtDate(p.created_at);
    cap.append(when);
    fig.append(img, cap);
    btn.append(fig);
    btn.addEventListener("click", (e) => { e.preventDefault(); openViewer(p.id); });
    return btn;
  }

  // refresh reloads the album and updates the board in place: new photos
  // arrive with a gentle animation, removed ones disappear.
  async function refresh(first) {
    let data;
    try { data = await api("GET", "/photos"); } catch { return; }
    state.photos = data.photos;
    state.used = data.used_bytes;
    state.quota = data.quota_bytes;
    state.maxFile = data.max_file_bytes;
    const board = $("board");
    const existing = new Map([...board.children].map((el) => [el.dataset.id, el]));
    const nodes = state.photos.map((p) => {
      const old = existing.get(p.id);
      if (old && old.dataset.updated === String(p.updated_at)) return old;
      const el = pinFor(p, !first && !state.known.has(p.id));
      el.dataset.updated = String(p.updated_at);
      return el;
    });
    const same = nodes.length === board.children.length && nodes.every((n, i) => board.children[i] === n);
    if (!same) board.replaceChildren(...nodes);
    state.known = new Set(state.photos.map((p) => p.id));
    $("empty").hidden = state.photos.length > 0;
    renderHeader();
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => { if (!document.hidden && state.user) refresh(false); }, POLL_MS);
  }
  function stopPolling() { clearInterval(state.pollTimer); state.pollTimer = 0; }

  // ---------- capture ----------
  // toJPEG decodes any image the browser understands (EXIF orientation
  // applied), scales it to MAX_EDGE and re-encodes it as JPEG.
  async function toJPEG(source) {
    let bmp;
    if (source instanceof Blob) {
      try {
        bmp = await createImageBitmap(source, { imageOrientation: "from-image" });
      } catch {
        bmp = await new Promise((resolve, reject) => {
          const url = URL.createObjectURL(source);
          const img = new Image();
          img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("err.notImage"))); };
          img.src = url;
        });
      }
    } else {
      bmp = source;
    }
    const w = bmp.width || bmp.videoWidth, h = bmp.height || bmp.videoHeight;
    if (!w || !h) throw new Error(t("err.notImage"));
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error(t("err.generic"));
    return blob;
  }

  const canUseCamera = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);

  async function startStream() {
    stopStream();
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false,
    });
    const v = $("cam-video");
    v.srcObject = state.stream;
    v.hidden = false;
    await v.play().catch(() => {});
  }
  function stopStream() {
    if (state.stream) state.stream.getTracks().forEach((tr) => tr.stop());
    state.stream = null;
    $("cam-video").srcObject = null;
  }

  async function openCamera() {
    if (!canUseCamera()) { $("file-capture").click(); return; }
    resetShot();
    $("camera").showModal();
    try {
      await startStream();
    } catch {
      $("camera").close();
      toast(t("cam.noCamera"));
      $("file-capture").click();
    }
  }

  function resetShot() {
    if (state.shot) URL.revokeObjectURL(state.shot.url);
    state.shot = null;
    $("cam-preview").hidden = true;
    $("cam-preview").removeAttribute("src");
    $("cam-video").hidden = false;
    $("cam-confirm").hidden = true;
    $("cam-caption").value = "";
    document.querySelector(".cam-live").hidden = false;
  }

  function showShot(blob) {
    if (state.shot) URL.revokeObjectURL(state.shot.url);
    state.shot = { blob, url: URL.createObjectURL(blob) };
    $("cam-preview").src = state.shot.url;
    $("cam-preview").hidden = false;
    $("cam-video").hidden = true;
    document.querySelector(".cam-live").hidden = true;
    $("cam-confirm").hidden = false;
    $("cam-add").disabled = false;
    $("cam-add").textContent = t("cam.add");
  }

  async function shutter() {
    const v = $("cam-video");
    if (!v.videoWidth) return;
    try {
      const blob = await toJPEG(v);
      stopStream();
      showShot(blob);
    } catch (ex) { toast(ex.message); }
  }

  async function fromFile(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    try {
      const blob = await toJPEG(file);
      if (!$("camera").open) $("camera").showModal();
      showShot(blob);
    } catch (ex) { toast(ex.message || t("err.notImage")); }
  }

  async function addShot(e) {
    e.preventDefault();
    if (!state.shot) return;
    $("cam-add").disabled = true;
    $("cam-add").textContent = t("cam.adding");
    try {
      await uploadPhoto(state.shot.blob, $("cam-caption").value.trim());
      $("camera").close();
      toast(t("cam.added"));
      await refresh(false);
      window.scrollTo({ top: $("board").offsetTop - 80, behavior: "smooth" });
    } catch (ex) {
      toast(ex.message);
      $("cam-add").disabled = false;
      $("cam-add").textContent = t("cam.add");
    }
  }

  // ---------- viewer ----------
  function openViewer(id) {
    const p = state.photos.find((x) => x.id === id);
    if (!p) return;
    state.viewing = p;
    $("viewer-img").src = imageURL(p);
    $("viewer-img").alt = p.caption || "";
    $("viewer-caption").value = p.caption || "";
    $("viewer-date").textContent = fmtDate(p.created_at, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    $("viewer").showModal();
  }
  async function saveCaption(e) {
    e.preventDefault();
    const p = state.viewing;
    if (!p) return;
    try {
      await api("PATCH", `/photos/${encodeURIComponent(p.id)}`, { caption: $("viewer-caption").value });
      $("viewer").close();
      toast(t("view.saved"));
      await refresh(false);
    } catch (ex) { toast(ex.message); }
  }
  async function deleteViewing() {
    const p = state.viewing;
    if (!p || !confirm(t("view.confirmDelete"))) return;
    try {
      await api("DELETE", `/photos/${encodeURIComponent(p.id)}`);
      $("viewer").close();
      toast(t("view.deleted"));
      await refresh(false);
    } catch (ex) { toast(ex.message); }
  }

  // ---------- live slideshow ----------
  function liveShow() {
    const stage = $("live-stage");
    const list = state.photos;
    if (!list.length) {
      stage.replaceChildren();
      $("live-text").textContent = t("live.empty");
      $("live-date").textContent = "";
      return;
    }
    const p = list[state.liveIndex % list.length];
    const bg = new Image(), fg = new Image();
    bg.className = "bg";
    bg.alt = "";
    fg.alt = p.caption || "";
    bg.src = fg.src = imageURL(p);
    fg.onload = () => {
      [...stage.children].forEach((el) => el.classList.remove("on"));
      stage.append(bg, fg);
      requestAnimationFrame(() => { bg.classList.add("on"); fg.classList.add("on"); });
      setTimeout(() => { while (stage.children.length > 2) stage.firstChild.remove(); }, 2000);
      $("live-text").textContent = p.caption || "";
      $("live-date").textContent = fmtDate(p.created_at);
    };
  }
  function openLive() {
    state.liveIndex = 0;
    $("live").hidden = false;
    liveShow();
    clearInterval(state.liveTimer);
    state.liveTimer = setInterval(() => { state.liveIndex++; liveShow(); }, SLIDE_MS);
    if ($("live").requestFullscreen) $("live").requestFullscreen().catch(() => {});
  }
  function closeLive() {
    clearInterval(state.liveTimer);
    state.liveTimer = 0;
    $("live").hidden = true;
    $("live-stage").replaceChildren();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // ---------- settings ----------
  function fillSettings() {
    const ts = $("theme-select");
    ts.replaceChildren();
    const groups = {};
    for (const th of window.PhotoalbumTheme.list) {
      const opt = new Option(th.label, th.id);
      if (!th.group) { ts.append(opt); continue; }
      if (!groups[th.group]) { groups[th.group] = document.createElement("optgroup"); groups[th.group].label = th.group; ts.append(groups[th.group]); }
      groups[th.group].append(opt);
    }
    ts.value = window.PhotoalbumTheme.get();
    const ls = $("lang-select");
    ls.replaceChildren(new Option(t("lang.auto"), "auto"));
    for (const l of window.I18N.supported) ls.append(new Option(window.I18N.native[l], l));
    ls.value = window.I18N.choice;
  }

  // ---------- wiring ----------
  function wire() {
    $("tab-login").addEventListener("click", () => setAuthMode("login"));
    $("tab-signup").addEventListener("click", () => setAuthMode("signup"));
    $("auth-form").addEventListener("submit", submitAuth);
    $("logout").addEventListener("click", logout);

    $("settings-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      const open = $("settings").hidden;
      $("settings").hidden = !open;
      $("settings-toggle").setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => {
      if (!$("settings").hidden && !$("settings").contains(e.target)) {
        $("settings").hidden = true;
        $("settings-toggle").setAttribute("aria-expanded", "false");
      }
    });
    $("theme-select").addEventListener("change", (e) => window.PhotoalbumTheme.set(e.target.value));
    $("lang-select").addEventListener("change", (e) => {
      window.I18N.setLang(e.target.value);
      fillSettings();
      setAuthMode(state.authMode);
      if (state.user) { renderHeader(); $("board").replaceChildren(); refresh(true); }
    });

    $("take").addEventListener("click", openCamera);
    $("upload").addEventListener("click", () => $("file-pick").click());
    $("file-capture").addEventListener("change", (e) => fromFile(e.target));
    $("file-pick").addEventListener("change", (e) => fromFile(e.target));
    $("cam-shutter").addEventListener("click", shutter);
    $("cam-flip").addEventListener("click", async () => {
      state.facing = state.facing === "environment" ? "user" : "environment";
      try { await startStream(); } catch { toast(t("cam.noCamera")); }
    });
    $("cam-retake").addEventListener("click", async () => {
      resetShot();
      if (!canUseCamera()) { $("camera").close(); $("file-capture").click(); return; }
      try { await startStream(); } catch { $("camera").close(); toast(t("cam.noCamera")); }
    });
    $("cam-confirm").addEventListener("submit", addShot);
    $("camera").addEventListener("close", () => { stopStream(); resetShot(); });

    $("viewer-form").addEventListener("submit", saveCaption);
    $("viewer-delete").addEventListener("click", deleteViewing);
    $("viewer").addEventListener("close", () => { state.viewing = null; $("viewer-img").removeAttribute("src"); });

    document.querySelectorAll("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
    document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

    $("live-open").addEventListener("click", openLive);
    $("live-close").addEventListener("click", closeLive);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("live").hidden) closeLive(); });
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && !$("live").hidden) closeLive(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user) refresh(false); });
  }

  async function init() {
    window.I18N.apply();
    fillSettings();
    wire();
    try {
      const cfg = await api("GET", "/config");
      state.signup = !!cfg.signup_enabled;
      state.model = typeof cfg.model === "string" ? cfg.model : "";
    } catch { /* keep defaults */ }
    try {
      state.user = await api("GET", "/me");
      await showApp();
    } catch {
      showAuth("");
    }
  }

  init();
})();
