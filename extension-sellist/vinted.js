// Vinted: fills the whole "Vends ton article" form (www.vinted.fr/items/new).
// Field hooks were read on the live form on 2026-11-11 (see FORMS.md).
// Menus only open on a full pointer/mouse sequence; options are role=radio/checkbox.
// Never clicks "Ajouter" (publish) or "Sauvegarder le brouillon".
window.SellistVinted = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const $t = (id) => document.querySelector(`[data-testid="${id}"]`);
  const shown = (el) => !!(el && el.offsetHeight);

  function press(el) {
    const o = { bubbles: true, cancelable: true, view: window, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new MouseEvent("mousedown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.dispatchEvent(new MouseEvent("click", o));
  }
  function setInput(el, v) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function waitFor(fn, ms = 8000) {
    for (let t = 0; t < ms; t += 150) { const r = fn(); if (r) return r; await wait(150); }
    return null;
  }
  async function openMenu(key) {
    const content = () => $t(key + "-content");
    if (!shown(content())) { const b = $t(key + "-input"); if (!b) return null; press(b); }
    return waitFor(() => (shown(content()) ? content() : null), 3000);
  }
  async function closeMenu(key) {
    if (shown($t(key + "-content"))) { press($t(key + "-input")); await wait(300); }
  }
  const options = (c) => [...c.querySelectorAll("[role=radio],[role=checkbox]")].filter(shown);
  const label = (e) => norm(((e.querySelector("[data-testid$='--title']") || e).innerText || "").split("\n")[0]);
  const valueOf = (key) => { const b = $t(key + "-input"); return b ? b.innerText.trim() : ""; };

  // ---------- each field ----------
  async function category(fiche) {
    const words = norm([fiche.categorie, fiche.titre].filter(Boolean).join(" "));
    const gender = /\b(homme|hommes|masculin)\b/.test(words) ? "hommes"
      : /\b(enfant|enfants|fille|garcon|bebe)\b/.test(words) ? "enfants" : "femmes";
    const strip = (s) => norm(s).replace(/\b(femmes?|hommes?|enfants?|filles?|garcons?|bebes?|pour|de|du|la|le|les)\b/g, " ")
      .replace(norm(fiche.marque || "") || "\u0000", " ").replace(/\s+/g, " ").trim();
    const queries = [...new Set([strip(fiche.categorie), strip(fiche.titre), strip(fiche.titre).split(" ").slice(0, 2).join(" ")].filter(Boolean))];
    const c = await openMenu("catalog-select-dropdown");
    if (!c) return false;
    const search = c.querySelector("#catalog-search-input");
    if (!search) { await closeMenu("catalog-select-dropdown"); return false; }
    for (const q of queries) {
      setInput(search, q);
      const results = await waitFor(() => {
        const r = [...c.querySelectorAll('[id^="catalog-search-"][id$="-result"]')].filter(shown);
        return r.length ? r : null;
      }, 4000);
      if (!results) continue;
      const path = (el) => norm(el.innerText.split("\n").slice(1).join(" "));
      const pick = results.find((el) => path(el).startsWith(gender)) || results[0];
      press(pick);
      // the brand menu appears once a category is set
      if (await waitFor(() => $t("brand-select-dropdown-input"), 4000)) return true;
    }
    await closeMenu("catalog-select-dropdown");
    return false;
  }

  async function brand(name) {
    if (!name) return false;
    const c = await openMenu("brand-select-dropdown");
    if (!c) return false;
    const s = c.querySelector("#brand-search-input");
    if (s) setInput(s, name);
    const want = norm(name);
    const o = await waitFor(() => options(c).find((e) => label(e) === want), 4000);
    if (o) { press(o); await wait(400); }
    await closeMenu("brand-select-dropdown");
    return !!o;
  }

  async function size(taille) {
    if (!taille) return false;
    const key = "category-size-single-grid_chips";
    const c = await openMenu(key);
    if (!c) return false;
    const tokens = String(taille).split(/[\/,;|]| ou /i).map((t) => t.trim()).filter(Boolean);
    const tabs = [...c.querySelectorAll("button")];
    const tab = (name) => tabs.find((b) => b.textContent.trim() === name);
    const clean = (e) => norm(e.textContent.trim().replace(/^(FR|EU|UK|IT|US)\s+/, ""));
    for (const tok of tokens) {
      const t = norm(tok.replace(/^taille\s*/i, ""));
      if (t === "unique" || t === "taille unique") {
        const o = options(c).find((e) => clean(e) === "taille unique");
        if (o) { press(o); await wait(400); await closeMenu(key); return true; }
      }
      const order = /^\d/.test(t) ? ["FR", "EU", "IT", "UK", "US"] : ["S/M/L", "UK", "US"];
      for (const name of [null, ...order]) {
        if (name) { const b = tab(name); if (!b) continue; press(b); await wait(400); }
        const o = options(c).find((e) => clean(e) === t);
        if (o) { press(o); await wait(400); await closeMenu(key); return true; }
      }
    }
    await closeMenu(key);
    return false;
  }

  async function condition(etat) {
    if (!etat) return false;
    const key = "category-condition-single-list";
    const c = await openMenu(key);
    if (!c) return false;
    const o = options(c).find((e) => label(e).startsWith(norm(etat)));
    if (o) { press(o); await wait(400); }
    await closeMenu(key);
    return !!o;
  }

  // multi-select lists: picks every option whose name appears in the text (max n)
  async function multi(key, text, max) {
    if (!text) return false;
    const c = await openMenu(key);
    if (!c) return false;
    const t = " " + norm(text) + " ";
    const found = options(c)
      .map((e) => ({ e, n: label(e) }))
      .filter((x) => x.n && t.includes(" " + x.n + " "))
      .sort((a, b) => b.n.length - a.n.length)
      .slice(0, max);
    for (const x of found) { press(x.e); await wait(300); }
    await closeMenu(key);
    return found.length > 0;
  }

  // ---------- run ----------
  async function run(job, done, values, step) {
    const f = job.fiche || {};
    const title = await waitFor(() => $t("title--input"));
    if (!title) return;
    if (values.titre && !title.value) { setInput(title, values.titre); done.titre = true; }
    const desc = $t("description--input");
    if (desc && values.description && !desc.value) { setInput(desc, values.description); done.description = true; }
    step();
    if (f.categorie || f.titre) done.categorie = await category(f); step();
    if (done.categorie) {
      done.marque = await brand(f.marque); step();
      done.taille = await size(f.taille); step();
      done.etat = await condition(f.etat); step();
      done.couleur = await multi("color-select-dropdown", f.couleur, 2); step();
      done.matiere = await multi("category-material-multi-list", f.matiere, 3); step();
    }
    const price = $t("price-input--input");
    if (price && values.prix && !price.value) { setInput(price, String(values.prix).replace(".", ",")); done.prix = true; }
    step();
    return { categorie: valueOf("catalog-select-dropdown"), taille: valueOf("category-size-single-grid_chips") };
  }

  return { run };
})();
