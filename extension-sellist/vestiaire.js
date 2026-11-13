// Vestiaire Collective: fills each step of the listing as it appears.
// Read on the live forms on 2026-11-13 (see FORMS.md):
//  step 1  /sell-clothes-online/   universe radios, <select id=preductAddCategory>, brand search
//  details submit-an-item.shtml#/informations  comboboxes #subcategory #material #color #pattern,
//          condition dropdown #condition, size <select> norm + <select id=size>
//  photos  #/photos  input#file_upload (multiple)     description #/description  textarea#description
//  price   #/price   input#priceField
// Never clicks "Continuer" or publishes: the seller moves from step to step.
window.SellistVestiaire = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const stem = (w) => norm(w).replace(/(es|s|x)$/, "");
  const shown = (el) => !!(el && el.offsetHeight);
  function press(el) {
    const o = { bubbles: true, cancelable: true, view: window, button: 0 };
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"])
      el.dispatchEvent(new (t.startsWith("pointer") ? PointerEvent : MouseEvent)(t, o));
  }
  function setInput(el, v) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function setSelect(el, pred) {
    const o = [...el.options].find(pred);
    if (!o) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, o.value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  // the option whose name appears earliest in the item's own words ("veste en jean" → Veste…)
  function bestByWords(names, text) {
    const t = " " + norm(text) + " ";
    let best = null, pos = Infinity;
    for (const n of names) {
      const s = stem(n.split(/[ &/]/)[0]);
      if (!s || s.length < 3) continue;
      const i = t.search(new RegExp("\\b" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      if (i >= 0 && i < pos) { best = n; pos = i; }
    }
    return best;
  }
  const words = (f) => [f.titre, f.categorie].filter(Boolean).join(" ");
  const gender = (f) => {
    const w = norm(words(f));
    return /\bhomme/.test(w) ? "homme" : /\bfille/.test(w) ? "fille" : /\bgarcon/.test(w) ? "garcon" : "femme";
  };

  // ---------- step 1: type of item and brand ----------
  async function step1(f, done) {
    const sel = document.getElementById("preductAddCategory");
    if (!sel || done.v1) return;
    done.v1 = true;
    const g = gender(f);
    const radio = [...document.querySelectorAll('input[name="universe"]')].find((r) => norm(r.id).includes(g));
    if (radio && !radio.checked) { press(radio.closest("label") || radio); await wait(400); }
    const names = [...sel.options].slice(1).map((o) => o.text.trim());
    const pick = bestByWords(names, words(f));
    if (pick) { setSelect(sel, (o) => o.text.trim() === pick); done.categorie = true; await wait(500); }
    const b = document.getElementById("depositForm__form__brands-input");
    if (b && f.marque) {
      b.focus(); setInput(b, f.marque);
      const want = norm(f.marque);
      for (let t = 0; t < 4000; t += 200) {
        const o = [...document.querySelectorAll("button")].find((e) => shown(e) && /optionsList__item/.test(e.className) && norm(e.innerText) === want);
        if (o) { o.click(); done.marque = true; break; }
        await wait(200);
      }
    }
  }

  // ---------- details ----------
  async function combo(id, query, choose) {
    const el = document.getElementById(id);
    if (!el || el.value) return !!(el && el.value);
    el.focus(); press(el); setInput(el, query);
    await wait(800);
    const lb = document.getElementById(id + "-listbox");
    const opts = lb ? [...lb.querySelectorAll("[role=option]")] : [];
    const o = choose(opts);
    if (o) { press(o); await wait(500); }
    el.blur();
    return !!o;
  }
  const COND = { "neuf avec etiquette": "jamais porte avec etiquette", "neuf sans etiquette": "jamais porte", "tres bon etat": "tres bon etat", "bon etat": "bon etat", "satisfaisant": "correct" };
  async function details(f, done) {
    if (!document.getElementById("subcategory") || done.v2) return;
    done.v2 = true;
    await wait(500);
    // category: list every option, keep the one named in the item's words
    done.categorie = await combo("subcategory", "", (opts) => {
      const n = bestByWords(opts.map((o) => o.innerText.trim()), words(f));
      return n ? opts.find((o) => o.innerText.trim() === n) : null;
    }) || done.categorie;
    // condition
    const c = document.getElementById("condition");
    if (c && f.etat) {
      press(c); await wait(600);
      const want = COND[norm(f.etat)] || norm(f.etat);
      const lb = document.getElementById("condition-listbox");
      const o = lb && [...lb.querySelectorAll("[role=option]")].find((x) => norm(x.innerText.split("\n")[0]) === want);
      if (o) { press(o); done.etat = true; await wait(400); } else press(c);
    }
    // material and colour: type the first meaningful word, take the exact or only match
    const first = (s) => (norm(s).replace(/[0-9%]+/g, " ").split(/[ ,/]+/).find((w) => w.length > 2) || "");
    const exactOrOnly = (want) => (opts) => opts.find((o) => norm(o.innerText) === want) || (opts.length === 1 ? opts[0] : null);
    if (f.matiere) done.matiere = await combo("material", first(f.matiere), exactOrOnly(first(f.matiere)));
    if (f.couleur) done.couleur = await combo("color", first(f.couleur), exactOrOnly(first(f.couleur)));
    // print: plain unless the notes name a pattern
    await combo("pattern", "", (opts) => {
      const n = bestByWords(opts.map((o) => o.innerText.trim()), [f.notes, f.titre].join(" "));
      return opts.find((o) => o.innerText.trim() === (n || "Uni"));
    });
    // size: norm then value
    if (f.taille) {
      const sels = [...document.querySelectorAll("select")];
      const sz = document.getElementById("size");
      const normSel = sels.find((s) => s !== sz && [...s.options].some((o) => o.text.trim() === "FR"));
      const tok = String(f.taille).split(/[\/,; ]+/).map((t) => t.trim()).filter(Boolean);
      for (const t of tok) {
        const numeric = /^\d/.test(t);
        if (normSel) { setSelect(normSel, (o) => o.text.trim() === (numeric ? "FR" : "International")); await wait(600); }
        if (sz && setSelect(sz, (o) => norm(o.text) === norm(t))) { done.taille = true; break; }
      }
    }
  }

  async function tick(job, done) {
    const f = job.fiche || {};
    try { await step1(f, done); } catch (e) {}
    try { await details(f, done); } catch (e) {}
  }
  return { tick };
})();
