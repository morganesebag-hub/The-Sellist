// Leboncoin: fills each step of www.leboncoin.fr/deposer-une-annonce as it appears.
// Read on the live form on 2026-11-13 (see FORMS.md):
//  1 title input[name=subject] → category suggestions (buttons "Choix 1 : catégorie … dans la famille …")
//  2 photos input[type=file] (generic) + attribute comboboxes (Univers, Taille, Type, Marque, Couleur, État),
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
    const sugg = [...document.querySelectorAll("button[aria-label]")].filter((b) => /^Choix \d+ : catégorie/.test(b.getAttribute("aria-label")));
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
  async function attributes(f, done) {
    const combos = [...document.querySelectorAll("input[role=combobox]")].filter((i) => document.getElementById(i.id + "-menu") && !/location|adresse/i.test(i.name + i.placeholder));
    if (!combos.length || done.l2) return;
    done.l2 = true;
    await wait(600);
    for (const i of combos) {
      const tg = document.getElementById(i.id + "-toggle-button");
      if (!tg) continue;
      press(tg); await wait(600);
      const ul = document.getElementById(i.id + "-menu");
      const opts = ul ? [...ul.querySelectorAll("li[role=option], li")] : [];
      const names = opts.map((o) => norm(o.innerText));
      let field = null, want = null;
      if (names.includes("tres bon etat")) { field = "etat"; want = COND[norm(f.etat)] || norm(f.etat); }
      else if (names.some((n) => /^\d+ - /.test(n))) { field = "taille"; const t = norm(f.taille).split(/[\/ ,]+/)[0]; want = names.find((n) => n.startsWith(t + " -") || n.endsWith("- " + t)); }
      else if (names.includes("blanc")) { field = "couleur"; const c = norm(f.couleur).split(" ")[0]; want = names.find((n) => n.split(" / ")[0] === c || n.startsWith(c)); }
      else if (names.includes("femme") && names.includes("homme")) { field = "univers"; const w = norm([f.titre, f.categorie].join(" ")); want = /homme/.test(w) ? "homme" : /enfant|fille|garcon|bebe/.test(w) ? "enfant" : "femme"; }
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

  // step 3: our description (it carries the seller's notes) and price
  function recap(job, done) {
    const body = document.querySelector('textarea[name="body"]');
    if (!body || done.l3) return;
    done.l3 = true;
    if (job.description) { setValue(body, job.description); done.description = true; }
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
