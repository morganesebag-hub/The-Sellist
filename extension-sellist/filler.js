// Runs on Vinted, Vestiaire Collective and Leboncoin. If The Sellist opened
// this tab with a listing, it fills the fields it recognises (title, description,
// price, photos) as they appear, and shows a small panel to copy everything else.
// It never clicks "Publier" and never reads anything else on the page.
(async () => {
  const job = await new Promise((res) => {
    try { chrome.runtime.sendMessage({ type: "GET_JOB" }, (j) => res(chrome.runtime.lastError ? null : j)); }
    catch (e) { res(null); }
  });
  if (!job) return;
  // only on the listing forms, not on the pages shown after publishing
  if (!/\/items\/new|submit-an-item|proposer-un-article|sell-clothes-online|deposer-une-annonce/.test(location.pathname)) return;

  // ---------- which field is which ----------
  // Matched on the field's label, placeholder, name, id or aria-label (lowercase, no accents).
  const MATCH = {
    titre: ["titre", "title", "intitule", "nom de l'article", "nom de l’article"],
    description: ["description", "decris", "decrivez", "describe"],
    prix: ["prix", "price"]
  };
  const NOT = ["recherche", "search", "filtre", "filter", "promo", "code"];
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function describe(el) {
    const bits = [el.getAttribute("placeholder"), el.getAttribute("name"), el.id, el.getAttribute("aria-label"), el.getAttribute("data-testid")];
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) bits.push(l.textContent); }
    const wrap = el.closest("label"); if (wrap) bits.push(wrap.textContent);
    const lb = el.getAttribute("aria-labelledby");
    if (lb) lb.split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) bits.push(n.textContent); });
    return norm(bits.filter(Boolean).join(" "));
  }
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  function setValue(el, v) {
    el.focus();
    if (el.isContentEditable) { el.textContent = v; }
    else {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); // works with React-controlled fields
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }

  const values = { titre: job.titre || "", description: job.description || "", prix: job.prix === "" || job.prix == null ? "" : String(job.prix) };
  const done = { titre: false, description: false, prix: false, photos: false };

  function fillFields() {
    const fields = [...document.querySelectorAll("input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true]")].filter(visible);
    for (const key of ["description", "titre", "prix"]) {
      if (done[key] || !values[key]) continue;
      const el = fields.find((f) => {
        const d = describe(f);
        if (!d || NOT.some((w) => d.includes(w))) return false;
        if (key === "description" && f.tagName === "INPUT") return false;
        if (key === "titre" && f.tagName === "TEXTAREA") return false;
        return MATCH[key].some((w) => d.includes(w));
      });
      if (el && !(el.value || el.textContent || "").trim()) { setValue(el, values[key]); done[key] = true; }
    }
  }

  async function fillPhotos() {
    if (done.photos || !(job.photos || []).length) return;
    // the listing's own photo input: never the header's "search by image",
    // never a receipt / invoice / proof upload (they accept PDFs or say so)
    const around = (i) => norm((i.closest("section, fieldset, form, [class*=upload], div") || i.parentElement || i).textContent || "").slice(0, 400);
    const input = document.querySelector('[data-testid="add-photos-input"]') ||
      [...document.querySelectorAll('input[type=file]')].find((i) =>
        !i.closest("header, nav, [role=search]") &&
        !/search|recherche|receipt|invoice|proof/i.test(i.id + i.name + (i.getAttribute("data-testid") || "")) &&
        i.accept && /image/.test(i.accept) && !/pdf|application/.test(i.accept) &&
        !/facture|recu|preuve|authenticit|justificatif/.test(around(i)));
    if (!input) return;
    done.photos = true;
    try {
      const dt = new DataTransfer();
      let n = 1;
      for (const url of job.photos) {
        const blob = await (await fetch(url)).blob();
        dt.items.add(new File([blob], `photo-${n++}.jpg`, { type: blob.type || "image/jpeg" }));
        if (!input.multiple) break;
      }
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) { done.photos = false; }
  }

  // ---------- panel ----------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
  const root = host.attachShadow({ mode: "closed" });
  const vinted = !!window.SellistVinted && /(^|\.)vinted\./.test(location.hostname) && /\/items\/new/.test(location.pathname);
  const vestiaire = !!window.SellistVestiaire && /vestiairecollective\./.test(location.hostname);
  const leboncoin = !!window.SellistLeboncoin && /leboncoin\./.test(location.hostname);
  const stepper = vestiaire || leboncoin; // sites filled step by step
  const f = job.fiche || {};
  const champs = (job.champs || []).filter((c) => c && c.valeur);
  const rows = [
    ["Titre", values.titre, "titre"],
    ["Description", values.description, "description"],
    ["Prix", values.prix ? values.prix + " €" : "", "prix"],
    ...(vinted || stepper
      ? [["Catégorie", f.categorie || f.titre, "categorie"], ["Marque", f.marque, "marque"], ["Taille", f.taille, "taille"],
         ["État", f.etat, "etat"], ["Couleur", f.couleur, "couleur"], ["Matière", f.matiere, "matiere"]]
      : champs.map((c) => [c.label, c.valeur, null]))
  ].filter((r) => r[1] && !(vestiaire && r[2] === "titre") && !(leboncoin && r[2] === "matiere")); // fields each site doesn't have
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  root.innerHTML = `<style>
    :host{all:initial}
    .p{width:300px;max-height:70vh;overflow:auto;background:#fff;color:#141414;border:1px solid #E3E3DF;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
    .h{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #E3E3DF;position:sticky;top:0;background:#fff}
    .h b{font-size:15px}.h i{font-family:Georgia,serif;color:#5B2149}
    .x{border:0;background:none;font-size:18px;cursor:pointer;color:#5E5A55}
    .s{padding:10px 14px;color:#5E5A55;font-size:13px;border-bottom:1px solid #EDEDEA}
    .r{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid #EDEDEA}
    .r div{min-width:0}.r small{display:block;color:#5E5A55;font-size:12px}
    .r span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px}
    .ok{color:#5B2149;font-weight:600;font-size:12px}
    button.c{flex:none;border:1px solid #E3E3DF;background:#F5F5F3;border-radius:999px;padding:5px 11px;font:500 13px system-ui,sans-serif;cursor:pointer;color:#141414}
    .f{padding:10px 14px;font-size:12px;color:#5E5A55}
    @media (prefers-color-scheme:dark){.p,.h{background:#1E1E1C;color:#F2F0EE;border-color:#33332F}.r,.s{border-color:#33332F}button.c{background:#151514;color:#F2F0EE;border-color:#33332F}.h i,.ok{color:#EDBACD}}
  </style>
  <div class="p" role="dialog" aria-label="The Sellist">
    <div class="h"><b><i>The</i> Sellist</b><button class="x" aria-label="Fermer">×</button></div>
    <div class="s" id="st">On remplit ce qu’on reconnaît. Pour le reste, copie et colle.</div>
    ${rows.map((r, i) => `<div class="r"><div><small>${esc(r[0])} <em class="ok" data-ok="${r[2] || ""}"></em></small><span>${esc(r[1])}</span></div><button class="c" data-i="${i}">Copier</button></div>`).join("")}
    <div class="f">Vérifie tout, puis clique toi-même sur « Publier ». Rien n’est publié sans toi.</div>
  </div>`;
  document.documentElement.appendChild(host);
  root.querySelector(".x").addEventListener("click", () => { host.remove(); chrome.runtime.sendMessage({ type: "DONE_JOB" }); try { stop(); } catch (e) {} });
  root.querySelectorAll("button.c").forEach((b) => b.addEventListener("click", async () => {
    const r = rows[+b.dataset.i];
    const v = r[2] === "prix" ? values.prix : r[1];
    try { await navigator.clipboard.writeText(v); b.textContent = "Copié"; setTimeout(() => (b.textContent = "Copier"), 1200); } catch (e) {}
  }));
  function refreshPanel() {
    root.querySelectorAll("[data-ok]").forEach((el) => { const k = el.dataset.ok; el.textContent = k && done[k] ? "· rempli" : ""; });
    const keys = ["titre", "description", "prix", "categorie", "marque", "taille", "etat", "couleur", "matiere"];
    const n = keys.filter((k) => done[k]).length + (done.photos ? 1 : 0);
    const missing = rows.filter((r) => r[2] && !done[r[2]]).map((r) => r[0].toLowerCase());
    root.getElementById("st").textContent = vinted
      ? (running ? "On remplit l’annonce… ne touche à rien quelques secondes."
        : missing.length ? `C’est rempli${done.photos ? ", photos comprises" : ""}. À compléter toi-même : ${missing.join(", ")}.`
        : `Tout est rempli${done.photos ? ", photos comprises" : ""}. Vérifie, puis clique sur « Ajouter ».`)
      : stepper ? `On remplit chaque étape dès qu’elle s’affiche${n ? ` (${n} élément${n > 1 ? "s" : ""} rempli${n > 1 ? "s" : ""}${done.photos ? ", photos comprises" : ""})` : ""}. Vérifie, puis clique sur « Continuer ».`
      : n ? `${n} élément${n > 1 ? "s" : ""} rempli${n > 1 ? "s" : ""}${done.photos ? ", photos comprises" : ""}. Pour le reste, copie et colle.`
      : "On remplit ce qu’on reconnaît au fil des étapes. En attendant, copie et colle.";
  }

  // ---------- publication: tell The Sellist once the listing is really online ----------
  // Only "code + site" leaves the browser, never the listing itself.
  const SITE_NAME = vinted ? "Vinted" : vestiaire ? "Vestiaire" : leboncoin ? "Leboncoin" : "";
  const FORM_PATH = /\/items\/new|submit-an-item|proposer-un-article|sell-clothes-online|deposer-une-annonce/;
  const SUCCESS_TEXT = /(f[ée]licitations|votre annonce (est|a bien|sera)|annonce (publi[ée]e|en ligne|en cours de (validation|v[ée]rification))|article (est )?en ligne|merci pour votre (annonce|d[ée]p[oô]t))/i;
  let reported = false, watching = 0;
  function published() {
    if (reported || !SITE_NAME) return;
    reported = true;
    try { chrome.runtime.sendMessage({ type: "PUBLISHED", site: SITE_NAME }); } catch (e) {}
    try { root.getElementById("st").textContent = "Bravo, ton annonce est en ligne !"; } catch (e) {}
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("button, [role=button], input[type=submit]");
    if (!b || host.contains(b) || reported) return;
    const startPath = location.pathname;
    clearInterval(watching);
    let t = 0;
    watching = setInterval(() => {
      t += 1;
      const left = location.pathname !== startPath && !FORM_PATH.test(location.pathname);
      const vintedItem = vinted && /^\/items\/\d+/.test(location.pathname);
      if (left || vintedItem || SUCCESS_TEXT.test((document.querySelector("main") || document.body).innerText.slice(0, 3000))) { clearInterval(watching); published(); }
      if (t > 40) clearInterval(watching);
    }, 1000);
  }, true);

  let running = false;
  if (vinted) {
    // Vinted: one pass that fills the whole form, menus included
    running = true; refreshPanel();
    // the photo input appears once Vinted's page has loaded: wait for it
    for (let t = 0; t < 10000 && !document.querySelector('[data-testid="add-photos-input"]'); t += 200) await new Promise((r) => setTimeout(r, 200));
    await fillPhotos();
    try { await window.SellistVinted.run(job, done, values, refreshPanel); } catch (e) {}
    running = false; refreshPanel();
    return;
  }

  // Other sites: forms appear step by step, keep looking for 15 minutes.
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (vestiaire) await window.SellistVestiaire.tick(job, done);
      fillFields();
      if (leboncoin) await window.SellistLeboncoin.tick(job, done);
      await fillPhotos(); refreshPanel();
    } finally { busy = false; }
  };
  const obs = new MutationObserver((muts) => {
    if (muts.every((m) => host.contains(m.target))) return; // our own panel
    clearTimeout(tick.t); tick.t = setTimeout(tick, 600);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setTimeout(() => obs.disconnect(), 15 * 60 * 1000);
  function stop() { obs.disconnect(); clearTimeout(timer); }
  tick();
})();
