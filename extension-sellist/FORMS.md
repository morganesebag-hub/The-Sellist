# Marketplace listing forms (read on 2026-11-11, in Morgane's logged-in Chrome)

Read only: nothing was saved or published.

## Vinted: https://www.vinted.fr/items/new (single page, fields appear after the category)
- Photos: `input[type=file][data-testid="add-photos-input"]` (multiple, jpeg/gif/png/webp)
- Title: `[data-testid="title--input"]` (name `title`)
- Description: `[data-testid="description--input"]` (textarea, name `description`)
- Category: button `[data-testid="catalog-select-dropdown-input"]` opens a menu with a search box `#catalog-search-input`.
  Typing e.g. "veste en jean" lists results `#catalog-search-<id>-result` with a path
  ("Vestes en jean / Femmes > Vêtements > Manteaux et vestes > Vestes", id 1079; Hommes 1224).
- After a category is chosen:
  - Brand: `[data-testid="brand-select-dropdown-input"]`, search `#brand-search-input`, options `brand-radio-<id>`
  - Size: `[data-testid="category-size-single-grid_chips-input"]`, tabs S/M/L · EU · UK · FR · IT · US,
    options `[data-testid="size-group-<g>-grid-option-<id>"]` (role checkbox, text = size)
  - Condition: `[data-testid="category-condition-single-list-input"]`, radios `condition-radio-<id>`:
    6 Neuf avec étiquette · 1 Neuf sans étiquette · 2 Très bon état · 3 Bon état · 4 Satisfaisant
    (same wording as The Sellist's "état")
  - Colour: `[data-testid="color-select-dropdown-input"]` (2 max), Material: `[data-testid="category-material-multi-list-input"]`
  - Price: `[data-testid="price-input--input"]` (name `price`)
  - Parcel size: radios `[data-testid="package_type_selector_{1,2,3}--input"]`
- Buttons: `upload-form-save-draft-button`, `upload-form-save-button` ("Ajouter" = publish). Never click.
- Menus open on real clicks; a plain `element.click()` from script did not open them.

## Vestiaire Collective (filled by vestiaire.js, read 2026-11-13)
- Step 1 https://fr.vestiairecollective.com/sell-clothes-online/: universe radios `name="universe"`,
  `<select id="preductAddCategory">` (48 types), brand `#depositForm__form__brands-input` + result buttons
  `[class*=optionsList__item]`. "Continuer" (`#vc-preduct-add-submit`) creates a draft: left to the seller.
- Drafts: /sell-clothes-online/product-drafts, each opens submit-an-item.shtml?id=<draft>.
- After step 1, "Continuer" goes to /proposer-un-article.shtml?id=<draft> on fr (translated DEPOSIT_FORM.CONTINUE.URL, seen 2026-11-17). Same form as submit-an-item.shtml.
- `#/informations`: comboboxes `#subcategory` `#material` `#color` `#pattern` (type to filter, options
  `#<id>-listbox [role=option]`), condition `#condition` (role=button, `#condition-listbox`:
  Jamais porté avec étiquette / Jamais porté / Très bon état / Bon état / Correct),
  size norm `<select>` (FR/UK/US/IT/International…) then `<select id="size">`. Invoice upload `#product-form-bill-7` (never use).
- `#/photos`: `input#file_upload` (multiple, jpeg/png, min 900×900), plus slot inputs `#newPic0..2`.
- `#/description`: `textarea#description` (+ optional dimensions). `#/price`: `input#priceField`.

## Leboncoin (filled by leboncoin.js, read 2026-11-13)
- Step 1 https://www.leboncoin.fr/deposer-une-annonce: title `input[name="subject"]`; after typing, suggested
  categories are buttons with aria-label "Choix N : catégorie X dans la famille Y" (clothes: Mode > Vêtements).
  Choosing one moves straight to step 2.
- Step 2: photos `input[type=file]` (image/*, multiple, up to 20) + comboboxes `input[role=combobox]` with
  `#<id>-toggle-button` and `#<id>-menu li[role=option]`: Univers, Taille ("38 - M"), Type de vêtement,
  Marque ("Sezane"), Couleur ("Bleu / Ciel"), État (Neuf avec étiquette / Neuf sans étiquette / Très bon état /
  Bon état / État satisfaisant). Leboncoin pre-fills most of them from the title.
- Step 3 (recap, then publish): `textarea[name="body"]` (Leboncoin writes its own AI text, kept as is), `input[name="price_cents"]`
  (shows a recommended range), address combobox `location`. Not read beyond this page.
- 2026-11-17: category suggestions are now `div[role=button][aria-label^="Choix N : catégorie"]` (were buttons).
  Univers is pre-filled by Leboncoin from the title alone and is often wrong: we always set it from our fiche
  (categorie "… homme/femme/enfant") before the other menus, since sizes and types depend on it. Men's sizes are
  plain letters (S, M, L…), women's are "38 - M".

## eBay: https://www.ebay.fr/sl/prelist/suggest (multi-step)
- Step 1: keyword box "Dites-nous ce que vous vendez" + "Rechercher".
- Step 2: matching catalogue item / category. Step 3: full form (creates a draft). Not read.

## Notes 2026-11-17
- Vinted: once photos are added, the colour (and sometimes material) menu shows a "Suggestions" row that
  repeats options ("Noir" twice). Press each name only once, or the second press unticks it.
- Vestiaire `#pattern` options: Uni, Zèbre, Python, Léopard, Ecossais, Pied-de-poule, Fleuri, Pois,
  Prince de Galle, Vichy, Rayures, Crocodile, Autre. Default Uni; a pattern only when the fiche names it as a word.

## 2026-11-17 · shoes (Baskets)
- Vinted: the size menu for shoes is `category-size-single-grid` (clothes: `category-size-single-grid_chips`). `size()` now finds any `[data-testid^="category-size-"][data-testid$="-input"]`. Options are role=checkbox with plain labels ("37", "37.5"); "37,5" is turned into "37.5".
- Vestiaire step 2 for shoes has no `#subcategory` (only #condition, #material, #color, #pattern, the size norm select and #size). The norm select offers EU / UK / US / IT / KR (no FR); EU sizes are "34" … "43" with halves.
- Vestiaire colour and material: each word of the fiche is tried in turn ("Zèbre noir et beige" → Noir), and unmatched text is cleared from the field.
