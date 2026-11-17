// Runs on The Sellist web app. Tells the page the extension is here, and passes
// "fill this listing" requests to the background worker. Nothing else is read.
document.documentElement.dataset.sellistApp = "1";
document.documentElement.dataset.sellistVersion = chrome.runtime.getManifest().version;

function announce() {
  window.postMessage({ source: "sellist-app-ext", type: "READY" }, "*");
}
announce();

window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data || e.data.source !== "sellist-app") return;
  if (e.data.type === "PING") { announce(); return; }
  if (e.data.type === "CHECK_BRAND") {
    const done = (r) => window.postMessage({ source: "sellist-app-ext", type: "BRAND_RESULT", id: e.data.id, ...(r || { statut: "?" }) }, "*");
    try { chrome.runtime.sendMessage({ type: "CHECK_BRAND", marque: e.data.marque }, (r) => done(chrome.runtime.lastError ? null : r)); }
    catch (err) { done(null); }
    return;
  }
  if (e.data.type !== "FILL" || !e.data.job) return;
  const reqId = e.data.id;
  const answer = (ok, error) => window.postMessage({ source: "sellist-app-ext", type: "FILL_RESULT", id: reqId, ok, error }, "*");
  try {
    chrome.runtime.sendMessage({ type: "FILL", job: e.data.job }, (res) => {
      const err = chrome.runtime.lastError;
      answer(!err && !!(res && res.ok), err ? "L’extension n’a pas répondu. Recharge la page et réessaie." : (res && res.error) || "");
    });
  } catch (err) {
    // the extension was reloaded or updated while this page stayed open
    answer(false, "L’extension vient d’être mise à jour : recharge cette page (Cmd+R), puis réessaie.");
  }
});
