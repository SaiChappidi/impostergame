# Imposter

Pass-and-play **Imposter** for one phone or tablet: no accounts, no server. Two modes—**word** (secret word + category for imposters) and **question** (crew vs imposter questions with written answers)—then discussion and reveal.

## Run locally

Open `index.html` in a browser, or serve the folder so optional JSON packs load reliably:

```bash
cd impostergame
python3 -m http.server 8766
```

Then visit `http://localhost:8766`.

If a port is busy, pick another (e.g. `8767`).

## How to play (short)

1. **Play** → choose word or question mode, pick categories for the pool, set imposter count and options.
2. Add **players** (order = pass order).
3. **Start** → each player sees their screen privately (word or their question), then locks an answer in question mode.
4. **Discussion** → one player starts; in question mode everyone sees the **crew** question to argue around.
5. **Reveal** when the group is ready.

## Packs & content

- Default lists ship in **`words.js`** / **`questions.js`** (and mirrored **`word-packs.json`** / **`question-packs.json`**).
- On load, the app **fetches** `word-packs.json` and `question-packs.json` when present; if the fetch works, that data is used instead of the built-in arrays for those packs.
- Under **Packs** you can edit **any** category (defaults included). Edits to built-in categories are stored in **localStorage** on this device only (`imposter_word_overrides`, `imposter_question_overrides`). Use **Reset to default** inside a pack to drop overrides. Your own categories live in `imposter_custom_packs` / `imposter_custom_question_packs`.

## Regenerate default pack files

After editing the pack source in `scripts/build-default-packs.mjs`:

```bash
node scripts/build-default-packs.mjs
```

That refreshes `words.js`, `questions.js`, `word-packs.json`, and `question-packs.json`.

## Deploy (free static hosting)

This is a static site: upload or connect the repo to **GitHub Pages**, **Cloudflare Pages**, **Netlify**, or similar. Publish the **repository root** (where `index.html` lives). Ensure `word-packs.json` and `question-packs.json` are deployed if you rely on them.

## Tech

- Plain **HTML**, **CSS**, **JavaScript** (no build step for the app itself).
- **PWA**: `manifest.json` (add icons if you want a full home-screen experience).

## License

Add a license file if you plan to open-source the project.
