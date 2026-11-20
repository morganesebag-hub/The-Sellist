// Vestiaire Collective: fills each step of the listing as it appears.
// Read on the live forms on 2026-11-13 (see FORMS.md):
//  step 1  /sell-clothes-online/   universe radios, <select id=preductAddCategory>, brand search
//  details proposer-un-article.shtml (or submit-an-item.shtml for drafts) #/informations  comboboxes #subcategory #material #color #pattern,
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
    const sel = () => document.getElementById("preductAddCategory");
    if (!sel() || done.v1) return;
    // the categories arrive from Vestiaire after the page shows: keep trying on the next ticks
    // until the choice holds (it once stayed empty for "Boucles d'oreilles")
    done.v1tries = (done.v1tries || 0) + 1;
    if (done.v1tries > 30) { done.v1 = true; return; }
    if (sel().options.length < 2) return;
    if (!done.v1universe) {
      const g = gender(f);
      const radio = [...document.querySelectorAll('input[name="universe"]')].find((r) => norm(r.id).includes(g));
      if (radio && !radio.checked) { press(radio.closest("label") || radio); await wait(800); }
      done.v1universe = true;
      if (sel().options.length < 2) return;
    }
    if (!done.v1cat) {
      const pick = bestByWords([...sel().options].slice(1).map((o) => o.text.trim()), words(f));
      if (pick) {
        setSelect(sel(), (o) => o.text.trim() === pick);
        await wait(700);
        if (!sel() || (sel().selectedOptions[0] || {}).text?.trim() !== pick) return; // not kept: next tick
        done.categorie = true;
      }
      done.v1cat = true;
    }
    const b = document.getElementById("depositForm__form__brands-input");
    if (b && f.marque && !done.marque) {
      b.focus(); setInput(b, f.marque);
      const want = norm(f.marque);
      for (let t = 0; t < 4000; t += 200) {
        const o = [...document.querySelectorAll("button")].find((e) => shown(e) && /optionsList__item/.test(e.className) && norm(e.innerText) === want);
        if (o) { o.click(); done.marque = true; break; }
        await wait(200);
      }
    }
    done.v1 = true;
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
    else if (query) setInput(el, ""); // don't leave unmatched text in the field
    el.blur();
    return !!o;
  }
  // tries each meaningful word in turn ("zèbre noir et beige" → zèbre: nothing, noir: Noir)
  async function comboWords(id, text) {
    const ws = [...new Set(norm(text).replace(/[0-9%]+/g, " ").split(/[^a-z-]+/).filter((w) => w.length > 2 && !/^(et|avec|des|les|pour)$/.test(w)))];
    for (const w of ws.slice(0, 4)) {
      if (await combo(id, w, (opts) => opts.find((o) => norm(o.innerText) === w) || (opts.length === 1 ? opts[0] : null))) return true;
    }
    return false;
  }
  const COND = { "neuf avec etiquette": "jamais porte avec etiquette", "neuf sans etiquette": "jamais porte", "tres bon etat": "tres bon etat", "bon etat": "bon etat", "satisfaisant": "correct" };
  async function details(f, done) {
    // shoes have no #subcategory on this step (seen 2026-11-17): start on any detail field
    if (done.v2 || !["subcategory", "condition", "material", "color"].some((id) => document.getElementById(id))) return;
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
    // material and colour: type each meaningful word, take the exact or only match
    if (f.matiere) done.matiere = await comboWords("material", f.matiere);
    if (f.couleur) done.couleur = await comboWords("color", f.couleur);
    // print: plain ("Uni") unless the fiche names a pattern as a whole word ("pois", "rayures"…).
    // Prefix matching picked "Pois" from words like "poignets" or "poitrine".
    await combo("pattern", "", (opts) => {
      const t = (" " + norm([f.titre, f.categorie, f.couleur, f.notes].join(" ")).replace(/[^a-z0-9]+/g, " ") + " ")
        .replace(/ (raye|rayee|rayes|rayees|marinieres?) /g, " rayures ").replace(/ (fleurs?|fleurie|fleuries|floral|florale) /g, " fleuri ")
        .replace(/ (croco) /g, " crocodile ").replace(/ (leo) /g, " leopard ").replace(/ (tartan|ecossaise|ecossaises) /g, " ecossais ");
      // options seen 2026-11-17: Uni, Zèbre, Python, Léopard, Ecossais, Pied-de-poule, Fleuri, Pois,
      // Prince de Galle, Vichy, Rayures, Crocodile, Autre
      const named = opts.find((o) => {
        const n = norm(o.innerText);
        if (!n || n === "uni" || n === "autre") return false;
        const w = n.replace(/[^a-z0-9]+/g, " ").trim();
        return w.length > 2 && new RegExp(" " + w.replace(/(s|x)$/, "") + "(s|x|es)? ").test(t);
      });
      return named || opts.find((o) => norm(o.innerText) === "uni");
    });
    // size: norm then value
    if (f.taille) {
      const sels = [...document.querySelectorAll("select")];
      const sz = document.getElementById("size");
      // clothes offer FR / International…, shoes only EU / UK / US / IT / KR
      const normSel = sels.find((s) => s !== sz && [...s.options].some((o) => /^(FR|EU|International)$/.test(o.text.trim())));
      const tok = String(f.taille).replace(/(\d),(\d)/g, "$1.$2").split(/[\/,; ]+/)
        .map((t) => t.trim()).filter((t) => t && !/^(taille|pointure)$/i.test(t));
      for (const t of tok) {
        const order = /^\d/.test(t) ? ["FR", "EU", "IT"] : ["International"];
        for (const name of normSel ? order : [null]) {
          if (name) { if (!setSelect(normSel, (o) => o.text.trim() === name)) continue; await wait(600); }
          if (sz && setSelect(sz, (o) => norm(o.text) === norm(t))) { done.taille = true; break; }
        }
        if (done.taille) break;
      }
    }
  }

  // price: Vestiaire pre-fills its own suggested price. Morgane's choice: keep it
  // (the seller sees their own price in the panel and can change it).
  async function tick(job, done) {
    const f = job.fiche || {};
    // past step 1 the brand is already chosen (shown at the top of the steps)
    if (/submit-an-item|proposer-un-article/.test(location.pathname) && f.marque) done.marque = true;
    try { await step1(f, done); } catch (e) {}
    try { await details(f, done); } catch (e) {}
  }
  return { tick };
})();
