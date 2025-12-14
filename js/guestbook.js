(() => {
  /** @type {string} */
  const API_URL =
    "https://https://necdetsanli-guestbook.sanlinecdet97.workers.dev/guestbook";

  /** @type {number} */
  const FETCH_TIMEOUT_MS = 8000;

  const formEl = document.getElementById("guestbook-form");
  const entriesEl = document.getElementById("guestbook-entries");
  const statusEl = document.getElementById("gb-status");
  const submitEl = document.getElementById("gb-submit");

  const nameEl = document.getElementById("gb-name");
  const websiteEl = document.getElementById("gb-website");
  const messageEl = document.getElementById("gb-message");
  const companyEl = document.getElementById("gb-company");

  /** @param {string} text */
  const setStatus = (text) => {
    if (statusEl === null) return;
    statusEl.textContent = text;
  };

  /** @param {string} value */
  const safeUrl = (value) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    try {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  };

  /** @param {boolean} isSubmitting */
  const setSubmitting = (isSubmitting) => {
    if (submitEl === null) return;
    submitEl.disabled = isSubmitting === true;
  };

  const abortableFetch = async (input, init) => {
    const controller = new AbortController();
    const t = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(input, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
      });
      return res;
    } finally {
      window.clearTimeout(t);
    }
  };

  /** @param {any[]} entries */
  const renderEntries = (entries) => {
    if (entriesEl === null) return;

    entriesEl.textContent = "";

    if (Array.isArray(entries) === false || entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tiny";
      empty.textContent =
        "No entries yet (or awaiting approval). Be the first!";
      entriesEl.appendChild(empty);
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
        typeof entry.name === "string" ? entry.name : "Anonymous";

      const website = typeof entry.website === "string" ? entry.website : "";
      const websiteSafe = safeUrl(website);

      if (websiteSafe !== null) {
        const sep = document.createTextNode(" ");
        const link = document.createElement("a");
        link.className = "guestbook-site";
        link.href = websiteSafe;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "(site)";

        left.appendChild(nameSpan);
        left.appendChild(sep);
        left.appendChild(link);
      } else {
        left.appendChild(nameSpan);
      }

      const right = document.createElement("div");
      right.className = "guestbook-date";

      const createdAt =
        typeof entry.createdAt === "string" ? entry.createdAt : "";
      const date = createdAt.length > 0 ? new Date(createdAt) : null;
      right.textContent =
        date !== null && Number.isNaN(date.getTime()) === false
          ? date.toLocaleString()
          : "";

      meta.appendChild(left);
      meta.appendChild(right);

      const msg = document.createElement("div");
      msg.className = "guestbook-message";
      msg.textContent = typeof entry.message === "string" ? entry.message : "";

      wrapper.appendChild(meta);
      wrapper.appendChild(msg);
      entriesEl.appendChild(wrapper);
    }
  };

  const loadEntries = async () => {
    if (entriesEl === null) return;

    try {
      const res = await abortableFetch(API_URL, { method: "GET" });
      if (res.ok !== true) throw new Error("bad status");

      const data = await res.json().catch(() => null);
      const entries =
        data !== null && Array.isArray(data.entries) ? data.entries : [];
      renderEntries(entries);
    } catch {
      entriesEl.textContent = "";
      const err = document.createElement("div");
      err.className = "tiny";
      err.textContent = "Failed to load entries.";
      entriesEl.appendChild(err);
    }
  };

  const readTurnstileToken = () => {
    const input = document.querySelector('input[name="cf-turnstile-response"]');
    if (input instanceof HTMLInputElement === false) return "";
    return input.value.trim();
  };

  if (formEl !== null) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (nameEl instanceof HTMLInputElement === false) return;
      if (messageEl instanceof HTMLTextAreaElement === false) return;

      const name = nameEl.value.trim();
      const message = messageEl.value.trim();

      const website =
        websiteEl instanceof HTMLInputElement ? websiteEl.value.trim() : "";
      const company =
        companyEl instanceof HTMLInputElement ? companyEl.value.trim() : "";

      if (name.length < 1) {
        setStatus("Name is required.");
        return;
      }

      if (message.length < 1) {
        setStatus("Message is required.");
        return;
      }

      const turnstileToken = readTurnstileToken();
      if (turnstileToken.length < 10) {
        setStatus("Please complete the anti-spam check.");
        return;
      }

      setSubmitting(true);
      setStatus("Signing...");

      try {
        const payload = { name, message, website, company, turnstileToken };

        const res = await abortableFetch(API_URL, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => null);
        const ok = data !== null && data.ok === true;

        if (ok !== true) {
          const retry =
            data !== null && typeof data.retryAfterSec === "number"
              ? data.retryAfterSec
              : null;

          if (retry !== null) {
            setStatus(`Too fast. Try again in ${retry}s.`);
          } else {
            setStatus("Could not sign. Try again.");
          }
          return;
        }

        const status =
          data !== null && typeof data.status === "string" ? data.status : "";
        if (status === "pending") {
          setStatus("Signed! ✨ (Awaiting approval)");
        } else {
          setStatus("Signed! ✨");
        }

        if (websiteEl instanceof HTMLInputElement) websiteEl.value = "";
        messageEl.value = "";

        if (
          typeof window.turnstile !== "undefined" &&
          window.turnstile &&
          typeof window.turnstile.reset === "function"
        ) {
          window.turnstile.reset();
        }

        await loadEntries();
      } catch {
        setStatus("Network error. Try again.");
      } finally {
        setSubmitting(false);
      }
    });
  }

  loadEntries();
})();
