(() => {
  "use strict";

  /** @type {string} */
  const TOKEN_STORAGE_KEY = "gb_admin_token_v1";

  /** @type {readonly string[]} */
  const ALLOWED_API_ORIGINS = Object.freeze([
    "https://necdetsanli-guestbook.sanlinecdet97.workers.dev",
  ]);

  /** @type {number} */
  const FETCH_TIMEOUT_MS = 10_000;

  const bodyEl = document.body;
  const apiBaseRaw =
    bodyEl instanceof HTMLElement ? bodyEl.dataset.apiBase : undefined;

  const formEl = document.getElementById("admin-auth");
  const tokenEl = document.getElementById("admin-token");
  const saveEl = document.getElementById("admin-save");
  const logoutEl = document.getElementById("admin-logout");
  const statusEl = document.getElementById("admin-status");

  const refreshEl = document.getElementById("admin-refresh");
  const loadMoreEl = document.getElementById("admin-loadmore");
  const listStatusEl = document.getElementById("admin-list-status");
  const entriesEl = document.getElementById("admin-entries");

  /** @type {string} */
  let nextCursor = "";

  /**
   * @param {HTMLElement | null} el
   * @param {string} text
   * @returns {void}
   */
  const setStatus = (el, text) => {
    if (el === null) return;
    el.textContent = text;
  };

  /**
   * @param {unknown} value
   * @returns {string}
   */
  const normalizeString = (value) => {
    return typeof value === "string" ? value.trim() : "";
  };

  /**
   * Very conservative token validation to avoid weird header/whitespace issues.
   * Accepts URL-safe/base64url-ish/hex-ish tokens.
   *
   * @param {string} raw
   * @returns {string}
   */
  const sanitizeToken = (raw) => {
    const t = raw.trim();
    if (t.length < 20) return "";
    if (t.length > 2048) return "";
    // Disallow whitespace/control characters
    if (/[\u0000-\u001F\u007F\s]/u.test(t)) return "";
    // Allow common safe token chars
    if (/^[A-Za-z0-9._~\-+=/]+$/u.test(t) === false) return "";
    return t;
  };

  /**
   * @returns {string}
   */
  const getToken = () => {
    const v = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    return typeof v === "string" ? v : "";
  };

  /**
   * @param {string} token
   * @returns {void}
   */
  const setToken = (token) => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  };

  /**
   * @returns {void}
   */
  const clearToken = () => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  };

  /**
   * @param {unknown} value
   * @returns {string | null}
   */
  const safeUrl = (value) => {
    const v = normalizeString(value);
    if (v.length === 0) return null;

    try {
      const u = new URL(v);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (u.username.length > 0 || u.password.length > 0) return null;
      return u.toString();
    } catch {
      return null;
    }
  };

  /**
   * @param {unknown} rawBase
   * @returns {URL | null}
   */
  const getApiBaseUrl = (rawBase) => {
    const b = normalizeString(rawBase);
    if (b.length < 8) return null;

    try {
      const u = new URL(b);
      if (u.protocol !== "https:") return null;

      const origin = u.origin;
      if (ALLOWED_API_ORIGINS.includes(origin) === false) return null;

      // Ensure base ends with a slash so URL(path, base) behaves predictably.
      const base = origin.endsWith("/") ? origin : `${origin}/`;
      return new URL(base);
    } catch {
      return null;
    }
  };

  const apiBaseUrl = getApiBaseUrl(apiBaseRaw);

  /**
   * @param {string} path
   * @returns {string | null}
   */
  const api = (path) => {
    if (apiBaseUrl === null) return null;
    if (typeof path !== "string" || path.startsWith("/") === false) return null;

    const u = new URL(path, apiBaseUrl);
    if (ALLOWED_API_ORIGINS.includes(u.origin) === false) return null;
    return u.toString();
  };

  /**
   * @param {Response} res
   * @returns {Promise<any | null>}
   */
  const readJsonSafe = async (res) => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  /**
   * @param {string} url
   * @param {RequestInit} init
   * @returns {Promise<Response>}
   */
  const authedFetch = async (url, init) => {
    const t = getToken();
    if (t.length < 20) throw new Error("missing-token");

    const headers = new Headers(init.headers ? init.headers : undefined);
    headers.set("authorization", `Bearer ${t}`);
    headers.set("accept", "application/json");
    headers.set("cache-control", "no-store");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS
    );

    try {
      return await fetch(url, {
        ...init,
        headers,
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  /**
   * @param {string} text
   * @returns {void}
   */
  const renderEmpty = (text) => {
    if (entriesEl === null) return;
    entriesEl.textContent = "";
    const div = document.createElement("div");
    div.className = "tiny";
    div.textContent = text;
    entriesEl.appendChild(div);
  };

  /**
   * @param {boolean} isSubmitting
   * @returns {void}
   */
  const setSubmitting = (isSubmitting) => {
    if (saveEl instanceof HTMLButtonElement)
      saveEl.disabled = isSubmitting === true;
    if (tokenEl instanceof HTMLInputElement)
      tokenEl.disabled = isSubmitting === true;
  };

  /**
   * @param {boolean} busy
   * @param {HTMLButtonElement} approveBtn
   * @param {HTMLButtonElement} delBtn
   * @returns {void}
   */
  const setRowBusy = (busy, approveBtn, delBtn) => {
    approveBtn.disabled = busy === true;
    delBtn.disabled = busy === true;
  };

  /**
   * @param {any[]} entries
   * @param {boolean} append
   * @returns {void}
   */
  const renderEntries = (entries, append) => {
    if (entriesEl === null) return;

    if (append === false) entriesEl.textContent = "";

    if (Array.isArray(entries) === false || entries.length === 0) {
      if (append === false) renderEmpty("No pending entries.");
      return;
    }

    for (const entry of entries) {
      const wrapper = document.createElement("div");
      wrapper.className = "guestbook-entry";

      const meta = document.createElement("div");
      meta.className = "guestbook-meta";

      const left = document.createElement("div");
      left.className = "guestbook-meta-left";

      const nameSpan = document.createElement("span");
      nameSpan.className = "guestbook-name";
      const name = normalizeString(entry && entry.name);
      nameSpan.textContent = name.length > 0 ? name : "Anonymous";
      left.appendChild(nameSpan);

      const websiteSafe = safeUrl(entry && entry.website);
      if (websiteSafe !== null) {
        const sep = document.createTextNode(" ");
        const link = document.createElement("a");
        link.className = "guestbook-site";
        link.href = websiteSafe;
        link.target = "_blank";
        link.rel = "noopener noreferrer nofollow";
        link.textContent = "(site)";
        left.appendChild(sep);
        left.appendChild(link);
      }

      const right = document.createElement("div");
      right.className = "guestbook-date";

      const createdAt = normalizeString(entry && entry.createdAt);
      const d = createdAt.length > 0 ? new Date(createdAt) : null;
      right.textContent =
        d !== null && Number.isNaN(d.getTime()) === false
          ? d.toLocaleString()
          : "";

      meta.appendChild(left);
      meta.appendChild(right);

      const msg = document.createElement("div");
      msg.className = "guestbook-message";
      msg.textContent =
        typeof (entry && entry.message) === "string" ? entry.message : "";

      const actions = document.createElement("div");
      actions.className = "gb-admin-actions";

      const approveBtn = document.createElement("button");
      approveBtn.type = "button";
      approveBtn.className = "guestbook-btn";
      approveBtn.textContent = "Approve";

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "guestbook-btn";
      delBtn.textContent = "Delete";

      const key = normalizeString(entry && entry.key);

      approveBtn.addEventListener("click", async () => {
        if (key.startsWith("pending:") === false) return;

        const url = api("/admin/approve");
        if (url === null) return;

        try {
          setRowBusy(true, approveBtn, delBtn);
          setStatus(listStatusEl, "Approving...");

          const res = await authedFetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key }),
          });

          if (res.ok === false) {
            setStatus(listStatusEl, `Approve failed (${res.status}).`);
            return;
          }

          setStatus(listStatusEl, "Approved.");
          await loadPending(true);
        } catch {
          setStatus(listStatusEl, "Network/auth error.");
        } finally {
          setRowBusy(false, approveBtn, delBtn);
        }
      });

      delBtn.addEventListener("click", async () => {
        if (key.length < 10) return;

        const url = api("/admin/delete");
        if (url === null) return;

        const ok = window.confirm("Delete this entry?");
        if (ok !== true) return;

        try {
          setRowBusy(true, approveBtn, delBtn);
          setStatus(listStatusEl, "Deleting...");

          const res = await authedFetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key }),
          });

          if (res.ok === false) {
            setStatus(listStatusEl, `Delete failed (${res.status}).`);
            return;
          }

          setStatus(listStatusEl, "Deleted.");
          await loadPending(true);
        } catch {
          setStatus(listStatusEl, "Network/auth error.");
        } finally {
          setRowBusy(false, approveBtn, delBtn);
        }
      });

      actions.appendChild(approveBtn);
      actions.appendChild(delBtn);

      wrapper.appendChild(meta);
      wrapper.appendChild(msg);
      wrapper.appendChild(actions);

      entriesEl.appendChild(wrapper);
    }
  };

  /**
   * @param {boolean} reset
   * @returns {Promise<void>}
   */
  const loadPending = async (reset) => {
    if (entriesEl === null) return;

    if (apiBaseUrl === null) {
      renderEmpty("Invalid/missing API base (data-api-base).");
      setStatus(listStatusEl, "");
      return;
    }

    const urlBase = api("/admin/pending");
    if (urlBase === null) {
      renderEmpty("Invalid API config.");
      setStatus(listStatusEl, "");
      return;
    }

    if (reset === true) {
      nextCursor = "";
      renderEmpty("Loading...");
    }

    try {
      setStatus(listStatusEl, "Loading...");

      const url = new URL(urlBase);
      url.searchParams.set("limit", "50");
      if (nextCursor.length > 0) url.searchParams.set("cursor", nextCursor);

      const res = await authedFetch(url.toString(), { method: "GET" });

      if (res.status === 401 || res.status === 403) {
        renderEmpty("Unauthorized. Paste GB_ADMIN_TOKEN above.");
        setStatus(listStatusEl, "");
        return;
      }

      if (res.ok === false) {
        renderEmpty(`Failed to load (${res.status}).`);
        setStatus(listStatusEl, "");
        return;
      }

      const data = await readJsonSafe(res);
      const ok = data !== null && data.ok === true;
      if (ok === false) {
        renderEmpty("Failed to load.");
        setStatus(listStatusEl, "");
        return;
      }

      const entries = Array.isArray(data.entries) ? data.entries : [];
      nextCursor = typeof data.nextCursor === "string" ? data.nextCursor : "";

      renderEntries(entries, reset === false);
      setStatus(listStatusEl, nextCursor.length > 0 ? "More available." : "");
    } catch {
      if (reset === true) renderEmpty("Network error.");
      setStatus(listStatusEl, "");
    }
  };

  // --- Wire up UI ---

  if (formEl !== null) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (tokenEl instanceof HTMLInputElement === false) return;

      const t = sanitizeToken(tokenEl.value);
      if (t.length < 20) {
        setStatus(statusEl, "Invalid token.");
        return;
      }

      setSubmitting(true);
      setToken(t);
      setStatus(statusEl, "Saved (session only).");
      await loadPending(true);
      setSubmitting(false);
    });
  }

  if (logoutEl !== null) {
    logoutEl.addEventListener("click", () => {
      clearToken();
      if (tokenEl instanceof HTMLInputElement) tokenEl.value = "";
      setStatus(statusEl, "Cleared.");
      setStatus(listStatusEl, "");
      nextCursor = "";
      renderEmpty("Paste GB_ADMIN_TOKEN above.");
    });
  }

  if (refreshEl !== null) {
    refreshEl.addEventListener("click", async () => {
      await loadPending(true);
    });
  }

  if (loadMoreEl !== null) {
    loadMoreEl.addEventListener("click", async () => {
      if (nextCursor.length < 1) {
        setStatus(listStatusEl, "No more.");
        return;
      }
      await loadPending(false);
    });
  }

  // Initialize
  if (tokenEl instanceof HTMLInputElement) {
    const existing = getToken();
    if (existing.length > 0) tokenEl.value = existing;
  }

  if (apiBaseUrl === null) {
    renderEmpty("Invalid/missing API base (data-api-base).");
  } else {
    renderEmpty("Paste GB_ADMIN_TOKEN above.");
  }
})();
