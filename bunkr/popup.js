async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

// Run a scraper in the page to extract gallery tiles.
async function scrapeGallery(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // This runs in the page. Collect items that match your HTML.
      const items = [];
      document.querySelectorAll('.theItem').forEach(card => {
        const a = card.querySelector('a[href^="/f/"]');
        if (!a) return;
        const href = a.getAttribute('href'); // like "/f/hsypnH7UErZy8"
        const name = (card.querySelector('.theName')?.textContent || "").trim()
          || (card.getAttribute('title') || "").trim()
          || (card.querySelector('p[style*="display:none"]')?.textContent || "").trim();
        const thumb = card.querySelector('img.grid-images_box-img')?.src || "";
        items.push({ href, name, thumb });
      });
      return items;
    }
  });
  return result || [];
}

function render(items) {
  const container = document.getElementById('items');
  container.textContent = "";
  items.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <input type="checkbox" class="pick" data-idx="${idx}" />
      <img class="thumb" src="${it.thumb || ""}" />
      <div class="name" title="${it.name}">${it.name || it.href}</div>
    `;
    container.appendChild(row);
  });
}

function chosen(items) {
  const picks = [...document.querySelectorAll('.pick')].map((cb, i) => cb.checked ? i : -1).filter(i => i >= 0);
  return picks.map(i => items[i]);
}

function setStatus(s) {
  document.getElementById('status').textContent = s || "";
}

(async function main() {
  const tab = await getActiveTab();
  let items = await scrapeGallery(tab.id);
  render(items);
  setStatus(`Found ${items.length} item(s).`);

  document.getElementById('refresh').onclick = async () => {
    items = await scrapeGallery(tab.id);
    render(items);
    setStatus(`Found ${items.length} item(s).`);
  };

  document.getElementById('selectAll').onchange = (e) => {
    document.querySelectorAll('.pick').forEach(cb => cb.checked = e.target.checked);
  };

  document.getElementById('options').onclick = () => chrome.runtime.openOptionsPage();

  document.getElementById('download').onclick = async () => {
    const picks = chosen(items);
    if (picks.length === 0) {
      setStatus("Pick at least one item.");
      return;
    }
    const base = document.getElementById('baseUrl').value.trim() || "https://bunkr.cr/f/";
    setStatus(`Opening ${picks.length} file page(s)… You may have to allow multiple automatic downloads once.`);

    // Ask background to open tabs paced apart; it will also handle naming + optional auto-close.
    chrome.runtime.sendMessage({
      type: "BUNKR_OPEN_FILE_TABS",
      items: picks,
      base
    }, (resp) => {
      if (chrome.runtime.lastError) {
        setStatus("Error: " + chrome.runtime.lastError.message);
      } else {
        setStatus(`Queued ${picks.length} file page(s).`);
      }
    });
  };
})();
