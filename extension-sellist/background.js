// Opens the marketplace in a new tab and keeps the listing for that tab until
// the page there asks for it. Listings stay in this browser only and are
// deleted once the tab is closed, the panel is closed, or after 30 minutes.
const SITES = {
  vinted: "https://www.vinted.fr/items/new",
  leboncoin: "https://www.leboncoin.fr/deposer-une-annonce",
  vestiaire: "https://fr.vestiairecollective.com/sell-clothes-online/"
};
const MAX_AGE = 30 * 60 * 1000;

async function cleanOld() {
  const all = await chrome.storage.local.get(null);
  const old = Object.keys(all).filter((k) => k.startsWith("job:") && Date.now() - (all[k].at || 0) > MAX_AGE);
  if (old.length) await chrome.storage.local.remove(old);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "FILL") {
    const job = msg.job || {};
    const url = SITES[job.site];
    if (!url) { reply({ ok: false, error: "Site non pris en charge." }); return; }
    chrome.tabs.create({ url }, async (tab) => {
      try {
        await cleanOld();
        await chrome.storage.local.set({ ["job:" + tab.id]: { ...job, at: Date.now() } });
        reply({ ok: true });
      } catch (e) {
        reply({ ok: false, error: "Impossible de préparer l’annonce. Essaie avec moins de photos." });
      }
    });
    return true; // async reply
  }
  if (msg.type === "GET_JOB") {
    const key = "job:" + (sender.tab && sender.tab.id);
    chrome.storage.local.get(key).then((r) => {
      const job = r[key];
      reply(job && Date.now() - job.at < MAX_AGE ? job : null);
    });
    return true;
  }
  if (msg.type === "DONE_JOB") {
    chrome.storage.local.remove("job:" + (sender.tab && sender.tab.id));
  }
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.local.remove("job:" + tabId));
