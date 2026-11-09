// Opens the marketplace in a new tab and keeps the listing for that tab until
// the page there asks for it. Listings stay in this browser's session storage
// and are deleted once used.
const SITES = {
  vinted: "https://www.vinted.fr/items/new",
  vestiaire: "https://fr.vestiairecollective.com/",
  leboncoin: "https://www.leboncoin.fr/deposer-une-annonce",
  ebay: "https://www.ebay.fr/sl/sell"
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "FILL") {
    const job = msg.job || {};
    const url = SITES[job.site];
    if (!url) { reply({ ok: false, error: "Site non pris en charge." }); return; }
    chrome.tabs.create({ url }, async (tab) => {
      try {
        await chrome.storage.session.set({ ["job:" + tab.id]: { ...job, at: Date.now() } });
        reply({ ok: true });
      } catch (e) {
        reply({ ok: false, error: "Trop de photos d’un coup. Essaie avec moins de photos." });
      }
    });
    return true; // async reply
  }
  if (msg.type === "GET_JOB") {
    const key = "job:" + (sender.tab && sender.tab.id);
    chrome.storage.session.get(key).then((r) => {
      const job = r[key];
      // jobs older than 30 minutes are dropped
      reply(job && Date.now() - job.at < 30 * 60 * 1000 ? job : null);
    });
    return true;
  }
  if (msg.type === "DONE_JOB") {
    chrome.storage.session.remove("job:" + (sender.tab && sender.tab.id));
  }
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove("job:" + tabId));
