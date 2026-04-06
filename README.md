# Imposter

Pass-and-play **Imposter** for one phone or tablet: no accounts, no server. Two modes—**word** (secret word + category for imposters) and **question** (crew vs imposter questions with written answers)—then discussion and reveal.

## Run locally

Open `index.html` in a browser, or serve the folder so optional JSON library files load reliably:

```bash
cd impostergame
python3 -m http.server 8766
```

Then visit `http://localhost:8766`.

If a port is busy, pick another (e.g. `8767`).

## How to play (short)

1. **Play** → choose word or question mode, pick categories for the pool, set imposter count and options. Use **Library** to add or edit words and questions.
2. Add **players** (order still used for who goes first in discussion).
3. **Start** → everyone sees a **grid of names** (like the home screen). Each person taps **their** tile, then **taps the card** to reveal their word or question; question mode then locks an answer before returning to the grid. When all players are done, discussion starts.
4. **Discussion** → one player starts; in question mode everyone sees the **crew** question to argue around.
5. **Reveal** when the group is ready.

## Library & content

- Default lists ship in **`words.js`** / **`questions.js`** (and mirrored **`word-packs.json`** / **`question-packs.json`**).
- On load, the app **fetches** `word-packs.json` and `question-packs.json` when present; if the fetch works, that data is used instead of the built-in arrays.
- The **Library** tab is where you edit **any** category (defaults included). Use **Backup & restore** there to export/import a JSON file (custom categories + overrides). Edits to built-in categories are stored in **localStorage** on this device only (`imposter_word_overrides`, `imposter_question_overrides`). Use **Reset to default** on a built-in category to drop overrides. Your own categories live in `imposter_custom_packs` / `imposter_custom_question_packs`.

## Regenerate default content files

After editing list data in `scripts/build-default-packs.mjs`:

```bash
node scripts/build-default-packs.mjs
```

That refreshes `words.js`, `questions.js`, `word-packs.json`, and `question-packs.json`.

## Deploy (free static hosting)

This is a static site: upload or connect the repo to **GitHub Pages**, **Cloudflare Pages**, **Netlify**, or similar. Publish the **repository root** (where `index.html` lives). Ensure `word-packs.json` and `question-packs.json` are deployed if you rely on them.

**Social / link previews:** `og:image` and `twitter:image` point at `icon-512.png` (relative URL). For best results on some platforms, replace those meta `content` values in `index.html` with your **full deployed URL**, e.g. `https://yourname.github.io/impostergame/icon-512.png`.

## Features (quick)

- **Library → Backup & restore:** export/import JSON for custom categories and on-device overrides to built-in lists.
- After everyone finishes their reveal cards, **Everyone ready?** appears before discussion starts.
- **Quit to menu** during a round (with confirm) from discussion, reveal steps, and the name grid.
- Face-down card: **Esc** returns to the name grid (same as Back to names).

## Tech

- Plain **HTML**, **CSS**, **JavaScript** (no build step for the app itself).
- **PWA**: `manifest.json` with `icon-192.png` and `icon-512.png`.

## License

[MIT](LICENSE) — adjust the copyright line in `LICENSE` if needed.
