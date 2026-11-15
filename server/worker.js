// The Sellist · serveur IA (Cloudflare Worker)
// Rôle : recevoir les photos d'un article, demander à Claude de remplir la fiche et
// d'écrire les 3 annonces, compter le quota de chaque testeuse.
// La clé Anthropic reste ici, côté serveur : le site ne la voit jamais.
//
// Réglages dans Cloudflare (Worker > Settings > Variables and Secrets) :
//   ANTHROPIC_API_KEY  (secret)  la clé sk-ant-…
//   MODEL              (texte)   ex. claude-sonnet-5-5, claude-haiku-5-5 ou claude-opus-5-5
//   CODES              (secret)  les codes testeuses, séparés par des virgules
//   LIMIT              (texte)   articles par testeuse (10 par défaut)
//   SHEET_URL          (texte, facultatif) adresse du Google Sheet de suivi (étape suivante)
// Stockage (Worker > Settings > Bindings) : un espace KV nommé QUOTAS.
//
// Le site envoie : POST /statut /analyse /annonces /interet  (voir index.html)
// Les photos ne sont pas stockées : elles passent à Claude puis sont oubliées.

const ALLOWED_ORIGINS = [
  "https://morganesebag-hub.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
const API = "https://api.anthropic.com/v1/messages";
const MAX_IMAGES = 4;
const MAX_BODY = 8 * 1024 * 1024; // 8 Mo

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ erreur: "methode" }, 405);
    if (!ALLOWED_ORIGINS.includes(origin)) return reply({ erreur: "origine" }, 403);
    if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY) return reply({ erreur: "trop_gros" }, 413);

    let body;
    try { body = await request.json(); } catch (e) { return reply({ erreur: "format" }, 400); }

    const code = String(body.code || "").trim().toUpperCase();
    const codes = String(env.CODES || "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (!code || !codes.includes(code)) return reply({ erreur: "code" }, 403);

    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    const quota = await readQuota(env, code);
    const log = (action, detail) => ctx.waitUntil(sendToSheet(env, { code, action, detail }));

    try {
      if (path === "/statut") {
        return reply({ restants: quota.restants, limite: quota.limite });
      }

      if (path === "/analyse") {
        const article = String(body.article || "").slice(0, 40);
        const already = quota.articles.includes(article);
        if (!already && quota.restants <= 0) { log("limite atteinte", ""); return reply({ erreur: "limite" }, 403); }
        const images = (Array.isArray(body.images) ? body.images : []).slice(0, MAX_IMAGES).filter((s) => typeof s === "string" && s.length < 3_000_000);
        if (!images.length) return reply({ erreur: "photos" }, 400);

        const out = await analyse(env, images);
        if (!already) { quota.articles.push(article); await saveQuota(env, code, quota); }
        const restants = Math.max(0, quota.limite - quota.articles.length);
        log("article analysé", `${restants} restants`);
        return reply({ fiche: out.fiche, annonces: out.annonces, restants, limite: quota.limite });
      }

      if (path === "/annonces") {
        const out = await rewrite(env, body.fiche || {});
        return reply({ annonces: out.annonces });
      }

      if (path === "/interet") {
        const r = body.reponse === "oui" ? "oui" : "non";
        log("intérêt pour 30 articles de plus", r);
        return reply({ ok: true });
      }

      if (path === "/evenement") {
        // remplissage lancé, etc. : uniquement pour le suivi
        const action = String(body.action || "").slice(0, 60);
        const detail = String(body.detail || "").slice(0, 200);
        if (action) log(action, detail);
        return reply({ ok: true });
      }

      return reply({ erreur: "chemin" }, 404);
    } catch (e) {
      log("erreur", String(e && e.message || e).slice(0, 200));
      return reply({ erreur: "serveur" }, 502);
    }
  }
};

// ---------- quota ----------
async function readQuota(env, code) {
  const limite = Number(env.LIMIT || 10);
  let saved = null;
  try { saved = await env.QUOTAS.get("q:" + code, "json"); } catch (e) {}
  const articles = (saved && Array.isArray(saved.articles)) ? saved.articles : [];
  const perso = saved && Number(saved.limite) > 0 ? Number(saved.limite) : limite; // limite personnalisée possible
  return { articles, limite: perso, restants: Math.max(0, perso - articles.length), perso: saved && saved.limite };
}
async function saveQuota(env, code, q) {
  const data = { articles: q.articles.slice(-200) };
  if (q.perso) data.limite = q.perso;
  await env.QUOTAS.put("q:" + code, JSON.stringify(data));
}

// ---------- suivi Google Sheet (facultatif) ----------
async function sendToSheet(env, row) {
  if (!env.SHEET_URL) return;
  try {
    await fetch(env.SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: new Date().toISOString(), ...row })
    });
  } catch (e) {}
}

// ---------- Claude ----------
const ETATS = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"];
const ANNONCE = {
  type: "object", additionalProperties: false, required: ["titre", "description"],
  properties: { titre: { type: "string" }, description: { type: "string" } }
};
const ANNONCES = {
  type: "object", additionalProperties: false, required: ["vinted", "leboncoin", "vestiaire"],
  properties: { vinted: ANNONCE, leboncoin: ANNONCE, vestiaire: ANNONCE }
};
const FICHE = {
  type: "object", additionalProperties: false,
  required: ["titre", "marque", "categorie", "taille", "couleur", "matiere", "etat", "notes"],
  properties: {
    titre: { type: "string" }, marque: { type: "string" }, categorie: { type: "string" },
    taille: { type: "string" }, couleur: { type: "string" }, matiere: { type: "string" },
    etat: { type: "string", enum: [...ETATS, ""] }, notes: { type: "string" }
  }
};
const STYLE = `Consignes par site (les annonces s'adressent aux acheteurs, en français, sans emoji, sans tutoiement ni vouvoiement appuyé) :
- vinted : marque, taille, état, couleur et matière ont leurs propres champs, la description ne les répète pas en liste. Elle est courte et directe (ce qui rend l'article désirable, détails, défauts), avec 3 à 5 mots-clés en fin précédés de #. Titre court : type d'article et marque.
- leboncoin : titre clair avec le type d'article et l'élément clé (marque, taille). Description informative et complète (état, taille, défauts, envoi ou remise en main propre), car les acheteurs y lisent tout.
- vestiaire : description soignée et sans superlatifs creux, qui décrit la coupe ou le modèle, les détails et l'état précis.
N'invente aucune information absente (ni mesure, ni matière, ni défaut). Mentionne honnêtement les défauts connus.`;

async function callClaude(env, content, schema) {
  if (!env.ANTHROPIC_API_KEY || !env.MODEL) throw new Error("réglages manquants (clé ou modèle)");
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2026-10-21"
    },
    body: JSON.stringify({
      model: env.MODEL,
      max_tokens: 6000,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content }]
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error("API " + res.status + " " + (data && data.error && data.error.message || ""));
  if (data.stop_reason === "refusal") throw new Error("refus");
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

async function analyse(env, images) {
  const content = [
    ...images.map((b64) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64.replace(/^data:image\/\w+;base64,/, "") } })),
    { type: "text", text:
`Voici ${images.length} photo(s) d'un article de seconde main que quelqu'un veut revendre en France.
1) Remplis la fiche à partir de ce que tu VOIS. N'invente rien : si une information n'est pas visible ou lisible (taille ou matière sur l'étiquette, par exemple), laisse une chaîne vide.
- titre : le type d'article en quelques mots, sans la marque (ex. "Veste en jean").
- categorie : le type d'article et pour qui (ex. "Vestes en jean femme").
- taille : telle qu'écrite sur l'étiquette (ex. "38" ou "M").
- couleur : la couleur principale en un ou deux mots (ex. "Bleu").
- matiere : la matière principale en un mot si l'étiquette la montre (ex. "Coton").
- etat : une valeur parmi ${ETATS.join(", ")}, ou vide si impossible à juger.
- notes : défauts ou détails visibles en une ou deux phrases, ou vide.
2) Rédige ensuite une annonce pour chacun des 3 sites, à partir de la fiche uniquement.
${STYLE}` }
  ];
  const schema = { type: "object", additionalProperties: false, required: ["fiche", "annonces"], properties: { fiche: FICHE, annonces: ANNONCES } };
  return await callClaude(env, content, schema);
}

async function rewrite(env, fiche) {
  const lignes = ["titre", "marque", "categorie", "taille", "couleur", "matiere", "etat", "notes"]
    .map((k) => `- ${k} : ${String(fiche[k] || "(non précisé)").slice(0, 400)}`).join("\n");
  const content = [{ type: "text", text: `Rédige une annonce pour chacun des 3 sites à partir de cette fiche d'article de seconde main :\n${lignes}\n\n${STYLE}` }];
  const schema = { type: "object", additionalProperties: false, required: ["annonces"], properties: { annonces: ANNONCES } };
  return await callClaude(env, content, schema);
}
