// Leboncoin: fills each step of www.leboncoin.fr/deposer-une-annonce as it appears.
// Read on the live form on 2026-11-13 (see FORMS.md):
//  1 title input[name=subject] → category suggestions (div role=button "Choix 1 : catégorie … dans la famille …")
//  2 photos input[type=file] (generic) + attribute comboboxes (Univers, Taille, Type, Marque, Couleur, État; men's sizes are S/M/L),
//    many pre-filled by Leboncoin from the title
//  3 recap: textarea[name=body] (Leboncoin writes its own text), input[name=price_cents], address
// Never clicks "Continuer" or publishes.
window.SellistLeboncoin = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  function press(el) {
    const o = { bubbles: true, cancelable: true, view: window, button: 0 };
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"])
      el.dispatchEvent(new (t.startsWith("pointer") ? PointerEvent : MouseEvent)(t, o));
  }
  function setValue(el, v) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // step 1: pick the suggested category (clothes → Mode > Vêtements)
  async function category(f, done) {
    if (done.l1) return;
    // suggestions were <button>, now <div role=button> (2026-11-17): match any element
    const sugg = [...document.querySelectorAll("[aria-label]")].filter((b) => /^Choix \d+ : catégorie/.test(b.getAttribute("aria-label")));
    if (!sugg.length) return;
    done.l1 = true;
    const label = (b) => norm(b.getAttribute("aria-label"));
    const pick = sugg.find((b) => /famille mode/.test(label(b))) || sugg[0];
    press(pick);
    done.categorie = true;
    await wait(500);
  }

  // step 2: attribute menus; Leboncoin pre-fills most of them from the title, we fill what is empty
  const COND = { "satisfaisant": "etat satisfaisant" };
  // who the item is for, from our own fiche ("Vestes en jean homme"); null if the fiche doesn't say
  function univers(f) {
    const w = " " + norm([f.categorie, f.titre].join(" ")) + " ";
    if (/\b(enfant|enfants|fille|filles|garcon|garcons|bebe|bebes|junior)\b/.test(w)) return "enfant";
    if (/\bhommes?\b/.test(w)) return "homme";
    if (/\bfemmes?\b/.test(w)) return "femme";
    return null;
  }
  const findCombos = () => [...document.querySelectorAll("input[role=combobox]")].filter((i) => document.getElementById(i.id + "-menu") && !/location|adresse/i.test(i.name + i.placeholder));
  async function openMenu(i) {
    const tg = document.getElementById(i.id + "-toggle-button");
    if (!tg) return null;
    press(tg); await wait(600);
    const ul = document.getElementById(i.id + "-menu");
    const opts = ul ? [...ul.querySelectorAll("li[role=option], li")] : [];
    return { tg, opts, names: opts.map((o) => norm(o.innerText)) };
  }
  // Univers first, and always ours when the fiche names it: Leboncoin guesses it from the
  // title alone (often "Femme"), and the size and type menus depend on it.
  async function setUnivers(f) {
    const want = univers(f);
    for (const i of findCombos()) {
      const m = await openMenu(i);
      if (!m) continue;
      if (!(m.names.includes("femme") && m.names.includes("homme"))) { press(m.tg); await wait(300); continue; }
      const o = want && m.opts.find((x) => norm(x.innerText) === want);
      if (o && norm(i.value) !== want) { press(o); await wait(1200); return true; }
      press(m.tg); await wait(300);
      return false;
    }
    return false;
  }
  async function attributes(f, done) {
    if (!findCombos().length || done.l2) return;
    done.l2 = true;
    await wait(600);
    try { if (await setUnivers(f)) done.univers = true; } catch (e) {}
    for (const i of findCombos()) {
      const m = await openMenu(i);
      if (!m) continue;
      const { tg, opts, names } = m;
      if (names.includes("femme") && names.includes("homme")) { press(tg); await wait(300); continue; } // done above
      let field = null, want = null;
      if (names.includes("tres bon etat")) { field = "etat"; want = COND[norm(f.etat)] || norm(f.etat); }
      else if (names.some((n) => /^\d+ - /.test(n)) || (names.includes("xs") && names.includes("xl"))) {
        // sizes are "38 - M" (women) or "M" (men): try each part of our size ("M / 38")
        field = "taille";
        const toks = norm(f.taille).split(/[\/ ,;]+/).filter(Boolean);
        for (const t of toks) { want = names.find((n) => n === t || n.startsWith(t + " -") || n.endsWith("- " + t)); if (want) break; }
      }
      else if (names.includes("blanc")) { field = "couleur"; const c = norm(f.couleur).split(" ")[0]; want = names.find((n) => n.split(" / ")[0] === c || n.startsWith(c)); }
      else if (names.some((n) => /manteaux/.test(n))) { field = "type"; const w = " " + norm([f.titre, f.categorie].join(" ")); want = names.find((n) => n.split(/[ /&]+/).some((x) => x.length > 3 && w.includes(" " + x.replace(/s$/, "")))); }
      else { field = "marque"; want = norm(f.marque); }
      const hasValue = !!i.value.trim();
      // condition is always ours; the others only when Leboncoin left them empty
      if (want && (field === "etat" || !hasValue)) {
        const o = opts.find((x) => norm(x.innerText) === want);
        if (o) { press(o); await wait(400); if (["etat", "taille", "couleur", "marque"].includes(field)) done[field] = true; continue; }
      } else if (hasValue && ["taille", "couleur", "marque"].includes(field)) done[field] = true;
      if (field === "etat" && hasValue) done.etat = true;
      press(tg); await wait(300); // close the menu
    }
  }

  // step 3: Leboncoin writes its own description: Morgane's choice is to keep it
  // (ours only goes in if theirs is empty). Then the price.
  function recap(job, done) {
    const body = document.querySelector('textarea[name="body"]');
    if (!body || done.l3) return;
    done.l3 = true;
    if (!body.value.trim() && job.description) { setValue(body, job.description); }
    done.description = true;
    const price = document.querySelector('input[name="price_cents"]');
    if (price && !price.value && job.prix !== "" && job.prix != null) { setValue(price, String(job.prix)); done.prix = true; }
  }

  async function tick(job, done) {
    const f = job.fiche || {};
    try { await category(f, done); } catch (e) {}
    try { await attributes(f, done); } catch (e) {}
    try { recap(job, done); } catch (e) {}
  }
  return { tick };
})();
