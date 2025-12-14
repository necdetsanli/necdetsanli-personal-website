(() => {
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
  const hasCounted = localStorage.getItem(hasCountedKey) === "1";

  const url = hasCounted
    ? `https://api.counterapi.dev/v1/${encodeURIComponent(
        namespace
      )}/${encodeURIComponent(counterName)}/`
    : `https://api.counterapi.dev/v1/${encodeURIComponent(
        namespace
      )}/${encodeURIComponent(counterName)}/up`;

  fetch(url, { method: "GET", cache: "no-store" })
    .then((r) => r.json())
    .then((data) => {
      const count = typeof data.count === "number" ? data.count : null;
      visitorEl.textContent = count === null ? "???" : String(count);

      if (!hasCounted) {
        localStorage.setItem(hasCountedKey, "1");
      }
    })
    .catch(() => {
      visitorEl.textContent = "???";
    });
})();
