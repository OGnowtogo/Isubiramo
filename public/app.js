/* ISUBIRAMO — connected to the server API and persistent SQLite library. */
(() => {
  "use strict";

  const STORAGE_KEY = "isubiramo_data_v2";
  const FAVORITES_KEY = "isubiramo_favorites_v1";
  const THEME_KEY = "isubiramo_theme";

  const CLASSES = ["S1", "S2", "S3", "S4", "S5", "S6"];

  const TYPES = {
    books: { label: "Books", singular: "Book", icon: "book-open", className: "book" },
    papers: { label: "Past papers", singular: "Past paper", icon: "file-text", className: "paper" },
    videos: { label: "Videos", singular: "Video lesson", icon: "play-square", className: "video" }
  };

  const CLASS_STYLES = [
    ["#655bd7", "#efedff"], ["#2e9a83", "#e7f7f1"], ["#d68c3c", "#fff3e5"],
    ["#4789c8", "#eaf4ff"], ["#cf6c91", "#fff0f5"], ["#7762b8", "#f1edff"]
  ];

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const state = {
    tab: "books",
    currentClass: null,
    search: "",
    sort: "newest",
    favoritesOnly: false
  };

  let db = loadData();
  let favorites = loadFavorites();
  let previewItem = null;
  let isAdmin = false;

  function emptyDatabase() {
    return { books: {}, papers: {}, videos: {} };
  }

  function loadData() {
    return emptyDatabase();
  }

  function normalizeDatabase(source) {
    const clean = emptyDatabase();
    Object.keys(TYPES).forEach(type => {
      const group = source[type] && typeof source[type] === "object" ? source[type] : {};
      Object.keys(group).forEach(cls => {
        if (!CLASSES.includes(cls) || !Array.isArray(group[cls])) return;
        clean[type][cls] = group[cls].filter(item =>
          item && typeof item.title === "string" && typeof item.url === "string"
        ).map(item => ({
          id: item.id || makeId(),
          title: String(item.title).slice(0, 100),
          subject: String(item.subject || ""),
          url: String(item.url),
          desc: String(item.desc || ""),
          createdAt: Number(item.createdAt) || Date.now()
        }));
      });
    });
    return clean;
  }

  function loadFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY));
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      return true;
    } catch (error) {
      console.error(error);
      showToast("Storage is full or unavailable. Try removing some resources.", true);
      return false;
    }
  }

  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }
    catch (error) { console.warn("Could not save favorites:", error); }
  }

  function makeId() {
    return window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `resource-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function allResources() {
    const result = [];
    Object.keys(TYPES).forEach(type => {
      Object.keys(db[type] || {}).forEach(cls => {
        (db[type][cls] || []).forEach(item => result.push({ ...item, type, cls }));
      });
    });
    return result;
  }

  function countResources(type) {
    return Object.values(db[type] || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i data-lucide="${isError ? "alert-circle" : "check-circle-2"}"></i><span></span>`;
    toast.querySelector("span").textContent = message;
    $("#toastRegion").appendChild(toast);
    refreshIcons();
    window.setTimeout(() => toast.remove(), 3400);
  }

  function updateStats() {
    $("#totalCount").textContent = allResources().length;
    $("#bookCount").textContent = countResources("books");
    $("#paperCount").textContent = countResources("papers");
    $("#videoCount").textContent = countResources("videos");
  }

  function updateNavigation() {
    $$(".nav-link").forEach(button => {
      button.classList.toggle("active", button.dataset.tab === state.tab);
    });
  }

  function updateHero() {
    const hero = $("#hero");
    hero.classList.toggle("hidden", Boolean(state.currentClass));
  }

  function renderBreadcrumb() {
    const breadcrumb = $("#breadcrumb");
    breadcrumb.replaceChildren();

    const home = document.createElement("button");
    home.type = "button";
    home.textContent = state.tab === "favorites" ? "Saved resources" : TYPES[state.tab].label;
    home.addEventListener("click", goToTabHome);
    breadcrumb.appendChild(home);

    if (state.currentClass) {
      const separator = document.createElement("span");
      separator.className = "crumb-separator";
      separator.textContent = "›";
      const current = document.createElement("span");
      current.className = "crumb-current";
      current.textContent = state.currentClass;
      breadcrumb.append(separator, current);
    }
    if (state.search) {
      const separator = document.createElement("span");
      separator.className = "crumb-separator";
      separator.textContent = "›";
      const current = document.createElement("span");
      current.className = "crumb-current";
      current.textContent = `Search: "${state.search}"`;
      breadcrumb.append(separator, current);
    }
  }

  function renderClassChips() {
    const wrapper = $("#classChips");
    wrapper.replaceChildren();
    CLASSES.forEach(cls => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `class-chip${state.currentClass === cls ? " active" : ""}`;
      chip.textContent = cls;
      chip.addEventListener("click", () => {
        state.currentClass = state.currentClass === cls ? null : cls;
        render();
      });
      wrapper.appendChild(chip);
    });
    $("#filterRow").classList.toggle("hidden", state.tab === "favorites" || Boolean(state.search));
  }

  function render() {
    updateStats();
    updateNavigation();
    updateHero();
    renderBreadcrumb();
    renderClassChips();

    const grid = $("#contentGrid");
    const empty = $("#emptyState");
    grid.replaceChildren();
    empty.classList.add("hidden");

    if (state.search) {
      $("#sectionKicker").textContent = "SEARCH RESULTS";
      $("#sectionTitle").textContent = "Find your resource";
      $("#sectionDescription").textContent = `Showing matches for "${state.search}".`;
      renderSearchResults(grid);
    } else if (state.tab === "favorites") {
      $("#sectionKicker").textContent = "YOUR COLLECTION";
      $("#sectionTitle").textContent = "Saved resources";
      $("#sectionDescription").textContent = "Your bookmarked books, papers and video lessons.";
      renderFavorites(grid);
    } else if (state.currentClass) {
      $("#sectionKicker").textContent = `${TYPES[state.tab].label.toUpperCase()} · ${state.currentClass}`;
      $("#sectionTitle").textContent = `${state.currentClass} ${TYPES[state.tab].label}`;
      $("#sectionDescription").textContent = "Open a resource to preview it or access the original link.";
      renderResources(grid, (db[state.tab][state.currentClass] || []).map(item => ({ ...item, type: state.tab, cls: state.currentClass })));
    } else {
      $("#sectionKicker").textContent = "YOUR LIBRARY";
      $("#sectionTitle").textContent = `Explore ${TYPES[state.tab].label.toLowerCase()}`;
      $("#sectionDescription").textContent = "Choose your class to discover available resources.";
      renderClasses(grid);
    }
    refreshIcons();
  }

  function renderClasses(grid) {
    CLASSES.forEach((cls, index) => {
      const count = (db[state.tab][cls] || []).length;
      const style = CLASS_STYLES[index];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "class-card";
      card.style.setProperty("--class-color", style[0]);
      card.style.setProperty("--class-glow", style[1]);
      card.innerHTML = `
        <div class="class-card-top"><span class="class-icon"><i data-lucide="${TYPES[state.tab].icon}"></i></span><span class="class-arrow"><i data-lucide="arrow-up-right"></i></span></div>
        <div><h3>${cls}</h3><p>Study materials for ${cls}</p></div>
        <div class="class-card-bottom"><span><strong>${count}</strong> ${count === 1 ? "resource" : "resources"}</span><span>Explore class <i data-lucide="arrow-right"></i></span></div>`;
      card.addEventListener("click", () => {
        state.currentClass = cls;
        render();
        document.querySelector(".section-heading").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      grid.appendChild(card);
    });
  }

  function sorted(items) {
    const copy = [...items];
    if (state.sort === "az") copy.sort((a, b) => a.title.localeCompare(b.title));
    else if (state.sort === "za") copy.sort((a, b) => b.title.localeCompare(a.title));
    else copy.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return copy;
  }

  function renderResources(grid, items) {
    const ordered = sorted(items);
    if (!ordered.length) {
      showEmpty("No resources in this class yet", "When resources are added for this class, they will appear here.");
      return;
    }
    ordered.forEach((item, index) => grid.appendChild(createResourceCard(item, index)));
  }

  function renderSearchResults(grid) {
    const query = state.search.toLocaleLowerCase();
    const results = allResources().filter(item =>
      [item.title, item.subject, item.desc, item.cls, TYPES[item.type].label]
        .some(value => String(value || "").toLocaleLowerCase().includes(query))
    );
    if (!results.length) {
      showEmpty("No matching resources", "Try another title, subject or class name.");
      return;
    }
    sorted(results).forEach((item, index) => grid.appendChild(createResourceCard(item, index)));
  }

  function renderFavorites(grid) {
    const saved = allResources().filter(item => favorites.includes(item.id));
    if (!saved.length) {
      showEmpty("No saved resources yet", "Use the bookmark icon on any resource to keep it here.");
      return;
    }
    sorted(saved).forEach((item, index) => grid.appendChild(createResourceCard(item, index)));
  }

  function showEmpty(title, message) {
    $("#emptyTitle").textContent = title;
    $("#emptyText").textContent = message;
    $("#emptyState").classList.remove("hidden");
  }

  function createResourceCard(item, index) {
    const type = TYPES[item.type];
    const isSaved = favorites.includes(item.id);
    const card = document.createElement("article");
    card.className = "resource-card";
    card.style.animationDelay = `${Math.min(index * 45, 270)}ms`;
    card.innerHTML = `
      <div class="resource-top">
        <span class="resource-type-icon ${type.className}"><i data-lucide="${type.icon}"></i></span>
        <button class="save-button${isSaved ? " saved" : ""}" type="button" aria-label="${isSaved ? "Remove from saved" : "Save resource"}" title="${isSaved ? "Remove from saved" : "Save resource"}"><i data-lucide="${isSaved ? "bookmark-check" : "bookmark"}"></i></button>
      </div>
      <h3></h3>
      <p class="resource-description"></p>
      <div class="resource-meta"><span class="tag">${type.singular}</span><span class="tag class-tag">${escapeHTML(item.cls)}</span></div>
      <div class="resource-actions"><button class="button button-soft preview-action" type="button"><i data-lucide="eye"></i> ${item.type === "videos" ? "Watch preview" : "Preview"}</button><button class="button button-primary open-action" type="button"><i data-lucide="external-link"></i> Open</button></div>`;
    card.querySelector("h3").textContent = item.title;
    card.querySelector(".resource-description").textContent = item.desc || item.subject || "Open this resource to start learning.";
    card.querySelector(".save-button").addEventListener("click", () => toggleFavorite(item.id));
    card.querySelector(".preview-action").addEventListener("click", () => openPreview(item));
    card.querySelector(".open-action").addEventListener("click", () => openResource(item));
    return card;
  }

  function toggleFavorite(id) {
    favorites = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
    saveFavorites();
    render();
    showToast(favorites.includes(id) ? "Added to saved resources." : "Removed from saved resources.");
  }

  function openResource(item) {
    const url = safeUrl(item.url);
    if (!url) return showToast("This resource is not available.", true);
    if (item.type === "videos") window.open(url, "_blank", "noopener,noreferrer");
    else {
      const link = document.createElement("a");
      link.href = item.downloadUrl || url;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  function getEmbedUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./, "");
      let id = "";
      if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
      if (host === "youtube.com" || host === "m.youtube.com") {
        if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
        else if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) id = url.pathname.split("/")[2] || "";
      }
      if (/^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
      if (host === "vimeo.com" || host === "player.vimeo.com") {
        const match = url.pathname.match(/(\d+)/);
        if (match) return `https://player.vimeo.com/video/${match[1]}`;
      }
    } catch { /* invalid URL handled by caller */ }
    return null;
  }

  function openPreview(item) {
    previewItem = item;
    $("#previewTitle").textContent = item.title;
    const body = $("#previewBody");
    const footer = $("#previewFooter");
    body.replaceChildren();
    footer.replaceChildren();

    const info = document.createElement("p");
    info.className = "preview-info";
    info.textContent = [item.subject, item.cls, TYPES[item.type].singular, item.desc].filter(Boolean).join(" · ");
    body.appendChild(info);

    if (item.type === "videos") {
      const embed = getEmbedUrl(item.url);
      if (embed) {
        const frame = document.createElement("iframe");
        frame.className = "preview-video";
        frame.src = embed;
        frame.title = item.title;
        frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        body.appendChild(frame);
      } else {
        body.appendChild(createFallback("Video preview unavailable", "This link cannot be embedded here. Use the Open resource button to view it on its original website."));
      }
    } else if (safeUrl(item.url)) {
      const note = document.createElement("p");
      note.className = "preview-download-note";
      note.innerHTML = '<i data-lucide="file-check-2"></i> PDF document · Preview opens right here on the website';
      body.appendChild(note);
      const frame = document.createElement("iframe");
      frame.className = "preview-frame";
      frame.src = `${safeUrl(item.url)}#toolbar=1&navpanes=0&view=FitH`;
      frame.title = `${item.title} PDF preview`;
      frame.loading = "lazy";
      body.appendChild(frame);
    } else {
      body.appendChild(createFallback("Preview unavailable", "This resource does not have a valid web link."));
    }

    const open = document.createElement("button");
    open.className = "button button-primary";
    open.type = "button";
    open.innerHTML = '<i data-lucide="external-link"></i> Open resource';
    if (item.type === "videos") {
      open.innerHTML = '<i data-lucide="external-link"></i> Open video';
      open.addEventListener("click", () => openResource(item));
    } else {
      open.innerHTML = '<i data-lucide="download"></i> Download PDF';
      open.addEventListener("click", () => {
        const link = document.createElement("a");
        link.href = item.downloadUrl || safeUrl(item.url);
        link.download = "";
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    }
    const close = document.createElement("button");
    close.className = "button button-soft";
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => closeModal("previewModal"));
    footer.append(open, close);
    openModal("previewModal");
    refreshIcons();
  }

  function createFallback(title, message) {
    const box = document.createElement("div");
    box.className = "preview-fallback";
    box.innerHTML = '<div><i data-lucide="file-question"></i><h3></h3><p></p></div>';
    box.querySelector("h3").textContent = title;
    box.querySelector("p").textContent = message;
    return box;
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    const focusable = modal.querySelector("button, input, select, textarea");
    if (focusable) window.setTimeout(() => focusable.focus(), 30);
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("open");
    if (!$(".modal-backdrop.open")) document.body.style.overflow = "";
    if (id === "previewModal") {
      const frame = $("#previewBody iframe");
      if (frame) frame.src = "about:blank";
      previewItem = null;
    }
  }

  function openAdmin() {
    if (!isAdmin) {
      $("#loginMessage").textContent = "";
      $("#loginMessage").className = "form-message";
      $("#adminPassword").value = "";
      openModal("loginModal");
      return;
    }
    renderManagerList();
    $("#formMessage").textContent = "";
    $("#formMessage").className = "form-message";
    openModal("adminModal");
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    const message = $("#loginMessage");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: $("#adminPassword").value })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign in failed.");
      isAdmin = true;
      message.textContent = "";
      closeModal("loginModal");
      renderManagerList();
      openModal("adminModal");
      showToast("Administrator access granted.");
    } catch (error) {
      message.textContent = error.message || "Could not sign in. Check the server connection.";
      message.className = "form-message error";
      $("#adminPassword").select();
    }
  }

  async function adminLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    isAdmin = false;
    closeModal("adminModal");
    showToast("You have signed out of the admin area.");
  }

  async function renderManagerList() {
    const list = $("#managerList");
    const items = allResources().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 12);
    list.replaceChildren();
    $("#managerCount").textContent = `${allResources().length} ${allResources().length === 1 ? "item" : "items"}`;
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "manager-empty";
      empty.textContent = "Your library is empty. Add your first resource above.";
      list.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "manager-item";
      row.innerHTML = `<span class="manager-item-icon"><i data-lucide="${TYPES[item.type].icon}"></i></span><span class="manager-item-info"><strong></strong><span></span></span><button class="delete-item" type="button" title="Delete resource" aria-label="Delete resource"><i data-lucide="trash-2"></i></button>`;
      row.querySelector("strong").textContent = item.title;
      row.querySelector(".manager-item-info span").textContent = `${TYPES[item.type].singular} · ${item.cls}`;
      row.querySelector(".delete-item").addEventListener("click", () => deleteResource(item.id, item.title));
      list.appendChild(row);
    });
    refreshIcons();
  }

  function updateResourceUrlHint() {
    const isVideo = $("#adminType").value === "videos";
    $("#pdfUploadField").classList.toggle("hidden", isVideo);
    $("#videoUrlField").classList.toggle("hidden", !isVideo);
    $("#adminFile").required = !isVideo;
    $("#adminUrl").required = isVideo;
  }

  async function addResource(event) {
    event.preventDefault();
    if (!isAdmin) return showToast("Please sign in as administrator first.", true);
    const type = $("#adminType").value;
    const cls = $("#adminClass").value;
    const title = $("#adminTitle").value.trim();
    const subject = $("#adminSubject").value.trim();
    const desc = $("#adminDesc").value.trim();
    const message = $("#formMessage");
    if (!title) {
      message.textContent = "Please enter a resource title.";
      message.className = "form-message error";
      return;
    }
    const form = new FormData();
    form.append("type", type);
    form.append("classLevel", cls);
    form.append("title", title);
    form.append("subject", subject);
    form.append("description", desc);
    if (type === "videos") {
      const url = safeUrl($("#adminUrl").value.trim());
      if (!url || !getEmbedUrl(url)) {
        message.textContent = "Enter a valid YouTube or Vimeo URL.";
        message.className = "form-message error";
        return;
      }
      form.append("url", url);
    } else {
      const file = $("#adminFile").files[0];
      if (!file || file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
        message.textContent = "Choose a valid PDF file.";
        message.className = "form-message error";
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        message.textContent = "The PDF is larger than the 100 MB limit.";
        message.className = "form-message error";
        return;
      }
      form.append("file", file);
    }
    const submit = $("#resourceForm button[type=submit]");
    submit.disabled = true;
    submit.innerHTML = '<i data-lucide="loader-circle"></i> Uploading...';
    refreshIcons();
    try {
      const response = await fetch("/api/resources", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not add resource.");
      $("#resourceForm").reset();
      updateResourceUrlHint();
      message.textContent = "Resource uploaded and saved successfully.";
      message.className = "form-message success";
      await loadLibrary();
      state.tab = type;
      state.currentClass = cls;
      state.search = "";
      $("#globalSearch").value = "";
      render();
      renderManagerList();
      showToast("Your resource has been added to the library.");
    } catch (error) {
      message.textContent = error.message || "Upload failed. Please try again.";
      message.className = "form-message error";
    } finally {
      submit.disabled = false;
      submit.innerHTML = '<i data-lucide="plus-circle"></i> Add to library';
      refreshIcons();
    }
  }

  async function deleteResource(id, title) {
    if (!isAdmin) return showToast("Administrator sign-in required.", true);
    if (!window.confirm(`Delete "${title}" from the library?`)) return;
    try {
      const response = await fetch(`/api/resources/${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Delete failed.");
      favorites = favorites.filter(favoriteId => favoriteId !== id);
      saveFavorites();
      await loadLibrary();
      render();
      renderManagerList();
      showToast("Resource deleted.");
    } catch (error) { showToast(error.message, true); }
  }

  async function clearAllResources() {
    if (!isAdmin) return showToast("Administrator sign-in required.", true);
    if (!allResources().length) return showToast("The library is already empty.");
    if (!window.confirm("This will permanently delete every resource and uploaded PDF. Continue?")) return;
    try {
      const response = await fetch("/api/resources", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not clear library.");
      favorites = [];
      saveFavorites();
      state.currentClass = null;
      state.search = "";
      $("#globalSearch").value = "";
      await loadLibrary();
      render();
      renderManagerList();
      showToast("The library has been cleared.");
    } catch (error) { showToast(error.message, true); }
  }

  function goToTab(tab) {
    state.tab = tab;
    state.currentClass = null;
    state.search = "";
    $("#globalSearch").value = "";
    const navigation = $("#mainNav");
    if (navigation) navigation.classList.remove("mobile-open");
    render();
  }

  function goToTabHome() {
    state.currentClass = null;
    state.search = "";
    $("#globalSearch").value = "";
    render();
  }

  function handleSearch(event) {
    state.search = event.target.value.trim();
    state.currentClass = null;
    render();
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (error) {
      console.warn("Theme preference could not be saved:", error);
    }
    $("#themeToggle").innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`;
    refreshIcons();
  }

  function initTheme() {
    let saved = "light";
    try { saved = localStorage.getItem(THEME_KEY) || "light"; } catch {}
    setTheme(saved === "dark" ? "dark" : "light");
  }

  function bindEvents() {
    $$(".nav-link").forEach(button => button.addEventListener("click", () => goToTab(button.dataset.tab)));
    $("#homeLink").addEventListener("click", event => { event.preventDefault(); goToTab("books"); });
    $("#footerHome").addEventListener("click", event => { event.preventDefault(); goToTab("books"); });
    $("#adminBtn").addEventListener("click", openAdmin);
    $("#resourceForm").addEventListener("submit", addResource);
    $("#adminType").addEventListener("change", updateResourceUrlHint);
    $("#loginForm").addEventListener("submit", handleAdminLogin);
    $("#adminLogoutBtn").addEventListener("click", adminLogout);
    $("#clearAllBtn").addEventListener("click", clearAllResources);
    $("#globalSearch").addEventListener("input", handleSearch);
    $("#sortSelect").addEventListener("change", event => { state.sort = event.target.value; render(); });
    $("#themeToggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next);
    });
    $("#mobileMenuBtn").addEventListener("click", () => $("#mainNav").classList.toggle("mobile-open"));
    $$(".close-modal").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
    $$(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", event => {
      if (event.target === backdrop) closeModal(backdrop.id);
    }));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") $$(".modal-backdrop.open").forEach(modal => closeModal(modal.id));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        $("#globalSearch").focus();
      }
    });
  }

  async function loadLibrary() {
    try {
      const response = await fetch("/api/resources");
      if (!response.ok) throw new Error("Library could not be loaded.");
      const resources = await response.json();
      db = emptyDatabase();
      resources.forEach(item => {
        if (!db[item.type]) return;
        if (!db[item.type][item.cls]) db[item.type][item.cls] = [];
        db[item.type][item.cls].push({
          id: item.id, title: item.title, subject: item.subject || "",
          desc: item.description || "", url: item.url, downloadUrl: item.downloadUrl, createdAt: new Date(item.createdAt).getTime()
        });
      });
      render();
      if (isAdmin && $("#adminModal").classList.contains("open")) renderManagerList();
    } catch (error) {
      showToast("Cannot connect to the library server. Make sure the server is running.", true);
      console.error(error);
    }
  }

  function init() {
    $("#year").textContent = new Date().getFullYear();
    bindEvents();
    updateResourceUrlHint();
    initTheme();
    render();
    refreshIcons();
    loadLibrary();
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      isAdmin = Boolean(data.authenticated);
      if (isAdmin) $("#adminBtn").querySelector("span").textContent = "Admin";
    }).catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", init);
})(); 
