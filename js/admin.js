(() => {
  "use strict";

  const tokenKey = "gb_admin_token_v1";

  const bodyEl = document.body;
  const apiBase = bodyEl instanceof HTMLElement ? bodyEl.dataset.apiBase : null;

  const formEl = document.getElementById("admin-auth");
  const tokenEl = document.getElementById("admin-token");
  const saveEl = document.getElementById("admin-save");
  const logoutEl = document.getElementById("admin-logout");
  const statusEl = document.getElementById("admin-status");

  const refreshEl = document.getElementById("admin-refresh");
  const loadMoreEl = document.getElementById("admin-loadmore");
  const listStatusEl = document.getElementById("admin-list-status");
  const entriesEl = document.getElementById("admin-entries");

  let nextCursor = "";
  let lastMode = "pending"; // future-proof if you later add an "approved" tab

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
   * @returns {string}
   */
  const getToken = () => {
    const t = sessionStorage.getItem(tokenKey);
    return typeof t === "string" ? t : "";
  };

  /**
   * @param {string} t
   * @returns {void}
   */
  const setToken = (t) => {
    sessionStorage.setItem(tokenKey, t);
  };

  /**
   * @returns {void}
   */
  const clearToken = () => {
    sessionStorage.removeItem(tokenKey);
  };

  /**
   * @param {unknown} value
   * @returns {string | null}
   */
  const safeUrl = (value) => {
    const v = typeof value === "string" ? value.trim() : "";
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
   * @param {string} path
   * @returns {string | null}
   */
  const api = (path) => {
    if (typeof apiBase !== "string" || apiBase.length < 8) return null;
    return new URL(path, apiBase).toString();
  };

  /**
   * @param {string} url
   * @param {RequestInit | undefined} init
   * @returns {Promise<Response>}
   */
  const authedFetch = async (url, init) => {
    const t = getToken();
    if (t.length < 20) throw new Error("missing-token");

    const headers = new Headers(
      init && init.headers ? init.headers : undefined
    );
    headers.set("authorization", `Bearer ${t}`);
    headers.set("cache-control", "no-store");
    headers.set("accept", "application/json");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    try {
      return await fetch(url, {
        ...init,
        headers,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
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
   * @param {any[]} entries
   * @param {boolean} append
   * @returns {void}
   */
  const renderEntries = (entries, append) => {
    if (entriesEl === null) return;

    if (append === false) {
      entriesEl.textContent = "";
    }

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
      nameSpan.textContent =
        typeof entry.name === "string" && entry.name.trim().length > 0
          ? entry.name
          : "Anonymous";

      left.appendChild(nameSpan);

      const websiteSafe = safeUrl(entry.website);
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

      const createdAt =
        typeof entry.createdAt === "string" ? entry.createdAt : "";
      const d = createdAt.length > 0 ? new Date(createdAt) : null;
      right.textContent =
        d !== null && Number.isNaN(d.getTime()) === false
          ? d.toLocaleString()
          : "";

      meta.appendChild(left);
      meta.appendChild(right);

      const msg = document.createElement("div");
      msg.className = "guestbook-message";
      msg.textContent = typeof entry.message === "string" ? entry.message : "";

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

      const key = typeof entry.key === "string" ? entry.key : "";

      /**
       * @param {boolean} busy
       * @returns {void}
       */
      const setBusy = (busy) => {
        approveBtn.disabled = busy === true;
        delBtn.disabled = busy === true;
      };

      approveBtn.addEventListener("click", async () => {
        if (key.startsWith("pending:") === false) return;

        const url = api("/admin/approve");
        if (url === null) return;

        try {
          setBusy(true);
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
          setBusy(false);
        }
      });

      delBtn.addEventListener("click", async () => {
        if (key.length < 10) return;

        const url = api("/admin/delete");
        if (url === null) return;

        const ok = window.confirm("Delete this entry?");
        if (ok !== true) return;

        try {
          setBusy(true);
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
          setBusy(false);
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

    const urlBase = api("/admin/pending");
    if (urlBase === null) {
      renderEmpty("Missing API base (data-api-base).");
      return;
    }

    lastMode = "pending";

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

      const data = await res.json().catch(() => null);
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

  if (formEl !== null) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (tokenEl instanceof HTMLInputElement === false) return;
      const t = tokenEl.value.trim();

      if (t.length < 20) {
        setStatus(statusEl, "Token too short.");
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

  const existing = getToken();
  if (tokenEl instanceof HTMLInputElement && existing.length > 0) {
    tokenEl.value = existing;
  }

  renderEmpty("Paste GB_ADMIN_TOKEN above.");
})();
