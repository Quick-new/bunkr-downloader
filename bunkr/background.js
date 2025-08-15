// background.js (MV3 service worker)
const STATE = {
  // tabId -> { ogname, startedAt }
  fileTabs: new Map(),
  // options
  opts: {
    subfolder: "Bunkr",
    preferOgName: true,
    autoCloseSecs: 5, // close file tab N seconds after download starts (0 = never)
    openTabsPacingMs: 800 // delay between opening file tabs to avoid spam prompts
  }
};

async function loadOpts() {
  const saved = await chrome.storage.sync.get([
    "subfolder",
    "preferOgName",
    "autoCloseSecs",
    "openTabsPacingMs"
  ]);
  Object.assign(STATE.opts, Object.fromEntries(
    Object.entries(saved).filter(([, v]) => v !== undefined)
  ));
}
loadOpts();

chrome.runtime.onInstalled.addListener(loadOpts);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (newValue !== undefined && k in STATE.opts) STATE.opts[k] = newValue;
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "BUNKR_FILEPAGE_OGNAME" && sender.tab?.id != null) {
    const rec = STATE.fileTabs.get(sender.tab.id) || {};
    rec.ogname = msg.ogname;
    rec.startedAt = Date.now();
    STATE.fileTabs.set(sender.tab.id, rec);
    sendResponse({ ok: true });
    return; // non-async
  }
  if (msg?.type === "BUNKR_OPEN_FILE_TABS") {
    // msg.items: array of { id, name?, href }
    // msg.base: e.g., "https://bunkr.cr/f/"
    (async () => {
      await loadOpts();
      let delay = 0;
      for (const it of msg.items) {
        setTimeout(async () => {
          // Construct candidate URLs. You asked for base + id + id as well—try both.
          const id = it.href.replace(/^\/?f\//, "").replace(/^\//, "");
          const base = msg.base.endsWith("/") ? msg.base : msg.base + "/";
          const candidates = [
            base + id,
            base + id + id // your “double id” variant
          ];
          for (const u of candidates) {
            try {
              const tab = await chrome.tabs.create({ url: u, active: false });
              STATE.fileTabs.set(tab.id, { ogname: it.name || null, startedAt: Date.now() });
              break; // open the first; file page will redirect/resolve if valid
            } catch (e) {
              console.warn("[BunkrDL] failed to open tab", u, e);
            }
          }
        }, delay);
        delay += STATE.opts.openTabsPacingMs;
      }
      sendResponse({ ok: true, opened: msg.items.length });
    })();
    return true; // keep channel open for async sendResponse
  }
});

// Name the download and optionally auto-close the file tab after it starts.
chrome.downloads.onDeterminingFilename.addListener(async (item, suggest) => {
  const url = item.finalUrl || item.url || "";
  const isBunkr = /\/\/[^/]*bunkr/i.test(url);
  if (!isBunkr) return;

  await loadOpts();
  const { subfolder, preferOgName } = STATE.opts;

  // Attempt to locate the most recent Bunkr tab; MV3 doesn't give us tab directly here.
  // We pick the most recently updated tab that we saw.
  let hint = null;
  let hintTabId = null;
  for (const [tid, rec] of STATE.fileTabs.entries()) {
    if (!hint || (rec.startedAt || 0) > (hint.startedAt || 0)) {
      hint = rec;
      hintTabId = tid;
    }
  }

  const sanitize = (s) => (s || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const baseName = sanitize(
    (preferOgName && hint?.ogname) ? hint.ogname :
    item.filename || "file.bin"
  );

  const hasExt = /\.[a-z0-9]{2,5}$/i.test(baseName);
  const finalName = hasExt ? baseName : `${baseName}.bin`;

  suggest({ filename: `${subfolder}/${finalName}`, conflictAction: "uniquify" });

  // Auto-close tab soon after the download is *named* (i.e., started)
  const secs = Number(STATE.opts.autoCloseSecs || 0);
  if (secs > 0 && hintTabId != null) {
    setTimeout(() => {
      chrome.tabs.remove(hintTabId).catch(() => {});
      STATE.fileTabs.delete(hintTabId);
    }, secs * 1000);
  }
});
