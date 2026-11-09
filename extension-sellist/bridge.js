// Runs on The Sellist web app. Tells the page the extension is here, and passes
// "fill this listing" requests to the background worker. Nothing else is read.
document.documentElement.dataset.sellistApp = "1";

function announce() {
  window.postMessage({ source: "sellist-app-ext", type: "READY" }, "*");
}
announce();

window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data || e.data.source !== "sellist-app") return;
  if (e.data.type === "PING") { announce(); return; }
  if (e.data.type !== "FILL" || !e.data.job) return;
  const reqId = e.data.id;
  chrome.runtime.sendMessage({ type: "FILL", job: e.data.job }, (res) => {
    const err = chrome.runtime.lastError;
    window.postMessage({
      source: "sellist-app-ext", type: "FILL_RESULT", id: reqId,
      ok: !err && !!(res && res.ok),
      error: err ? "L’extension n’a pas répondu. Recharge la page et réessaie." : (res && res.error) || ""
    }, "*");
  });
});
