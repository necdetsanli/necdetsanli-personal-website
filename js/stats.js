(() => {
  /**
   * @param {string} key
   * @returns {string|null}
   */
  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  /**
   * @param {string} key
   * @param {string} value
   * @returns {void}
   */
  function safeLocalStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }

  const visitorEl = document.getElementById("visitor-count");
  const updatedEl = document.getElementById("last-updated");

  if (updatedEl !== null) {
    const last = document.lastModified;
    updatedEl.textContent = last ? new Date(last).toLocaleString() : "unknown";
  }

  if (visitorEl === null) return;

  const namespace = "necdetsanli";
  const counterName = "site-visits";

  const hasCountedKey = "necdet_site_visit_counted_v1";
  const hasCounted = safeLocalStorageGet(hasCountedKey) === "1";

  const base = `https://api.counterapi.dev/v1/${encodeURIComponent(
    namespace
  )}/${encodeURIComponent(counterName)}`;

  const url = hasCounted ? `${base}/` : `${base}/up`;

  const controller = new AbortController();
  const timeoutMs = 3500;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  fetch(url, {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: controller.signal,
  })
    .then((r) => r.json())
    .then((data) => {
      const count = typeof data?.count === "number" ? data.count : null;
      visitorEl.textContent = count === null ? "???" : String(count);

      if (!hasCounted) {
        safeLocalStorageSet(hasCountedKey, "1");
      }
    })
    .catch(() => {
      visitorEl.textContent = "???";
    })
    .finally(() => {
      window.clearTimeout(timeoutId);
    });
})();
