// content_file.js – injected on file pages and gallery pages (safe no-op on gallery)
(function () {
  const isOnBunkr = /bunkr/i.test(location.hostname);
  if (!isOnBunkr) return;

  // Helper: tell background the ogname (from page context)
  function reportOgname() {
    try {
      // Prefer window.ogname if present
      const nameFromVar = (window.ogname && String(window.ogname).trim()) || null;
      // fallback to visible title
      const title = document.querySelector("h1, .text-2xl")?.textContent?.trim() || document.title || null;
      const name = nameFromVar || title;
      if (name) {
        chrome.runtime.sendMessage({ type: "BUNKR_FILEPAGE_OGNAME", ogname: name });
      }
    } catch {}
  }

  // Only do the click routine if we see a Download button soon.
  function clickDownloadWhenReady() {
    const sel = 'a.ic-download-01, a[href*="get.bunkr"], a[href*="/file/"], #download-btn, a.btn-main';
    const tryClick = () => {
      const btn = document.querySelector(sel);
      if (btn) {
        reportOgname();
        // Some variants open in a new tab; that's fine. We simply click.
        btn.click();
        return true;
      }
      return false;
    };

    if (tryClick()) return;

    // Observe DOM until the button appears; many pages wire it late.
    const obs = new MutationObserver(() => {
      if (tryClick()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // Backstop timers
    setTimeout(tryClick, 2500);
    setTimeout(tryClick, 5000);
  }

  // Start once the DOM is at least interactive
  if (document.readyState === "complete" || document.readyState === "interactive") {
    clickDownloadWhenReady();
  } else {
    window.addEventListener("DOMContentLoaded", clickDownloadWhenReady, { once: true });
  }
})();
