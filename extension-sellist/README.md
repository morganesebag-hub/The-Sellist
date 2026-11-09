# The Sellist · Publier (Morgane's extension)

Separate from `extension/` (Lucie's). Fills listings on Vinted, Vestiaire Collective, Leboncoin and eBay from the web app.

- `bridge.js` runs on the web app (morganesebag-hub.github.io, localhost). It sets `data-sellist-app` on `<html>` and relays `{source:"sellist-app", type:"FILL", job}` to the background.
- `background.js` opens the site in a new tab and keeps the job in `chrome.storage.session` for that tab (30 min max).
- `filler.js` fills title, description, price and photos when it recognises them (by label/placeholder/name), keeps looking for 3 minutes as multi-step forms reveal fields, and shows a copy panel for everything. It never clicks Publish.

Field matching is generic and has not been checked on the live sites yet. Test in real Chrome.
After any change here, run `./build-extension-sellist.sh` to rebuild `the-sellist-publier.zip`.
