# Shasta Deals

**Free, always-on shopping deals + shopping lists for MeidasWell** () in **Redding, CA / Shasta County**.

Static site · GitHub Pages · open-source stack only · **no paid APIs** · **no proprietary app scraping**.

Live path (after you enable Pages): `https://<your-user>.github.io/shasta-deals/`

---

## What it does

1. **Deal board** — browse seed / manually curated prices for local chains.
2. **Shopping list** — add items; the app **assigns a suggested store** and **groups the list by store**.
3. **Export / share** — download `.txt` or copy/share the grouped list.
4. **Store catalog** — WinCo, Safeway, Raley’s, Walmart, Grocery Outlet, Costco, CVS, Walgreens, Dollar Tree, etc., with addresses and OSM map links.
5. **Bargain tips** — open-knowledge tips (not scraped from Instacart / GasBuddy / private apps).

### “AI” — honest labeling

| Mode | What it is |
|------|------------|
| **Default** | **Algorithmic heuristics** (alias match → lowest seed price → category fallback for Redding). Runs fully offline in the browser. **Not a trained custom model.** |
| **Optional** | Paste a **free** LLM API key in the UI (stored in `localStorage` only), or use **Ollama** locally with a compatible OpenAI-style endpoint. Documented below — never required. |

---

## Open locally

```bash
cd shasta-deals
node scripts/refresh-deals.js   # rebuild data/deals.json from CSV
npx --yes serve -l 4173 .       # or: python3 -m http.server 4173
```

Open **http://localhost:4173**

> Opening `index.html` as `file://` may block `fetch()` of JSON — use a tiny static server.

---

## Enable GitHub Pages (fork / push)

1. Create a GitHub repo (e.g. `shasta-deals`) and push this directory.
2. **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions** (required — repo includes `.github/workflows/pages.yml`)
3. Ensure **Actions** are allowed (Settings → Actions → General). Push to `main` (or run **Deploy GitHub Pages** workflow manually).
4. Open `https://<user>.github.io/shasta-deals/`
5. The **Refresh deals JSON** workflow rebuilds `data/deals.json` when you edit `data/deals.csv` (and weekly as a nudge).

### First push example

```bash
cd shasta-deals
git init
git add .
git commit -m "Initial Shasta Deals site for MeidasWell"
gh repo create shasta-deals --public --source=. --remote=origin --push
# then enable Pages as above
```

If `gh auth login` is required, complete that first — this project does **not** force-push to your account without auth.

---

## Data & deal ingest (legal / open only)

### What we ship

- `data/stores.json` — local store seed (public locator / open knowledge; verify addresses).
- `data/deals.csv` → `data/deals.json` — **seed / illustrative** prices until you update from open circulars.
- `data/tips.json` — curated tips.
- `data/inbox/*.csv` — optional drop folder merged by the refresh script.

### What we do **not** do

- ❌ Scrape **Instacart**, **GasBuddy**, proprietary store apps, or content that breaks ToS.
- ❌ Call **Flipp FlyerKit** without a partner-issued token (not self-serve / not free for this use).
- ❌ Use Google Maps paid SDK (OSM links only).

### How to update deals

1. Open a store’s **public weekly ad** page you are allowed to view/copy from, or type prices you observed.
2. Edit `data/deals.csv` (same columns as the header row) **or** drop a CSV in `data/inbox/`.
3. Run `node scripts/refresh-deals.js` locally, **or** push and let GitHub Actions commit the refreshed JSON.
4. Mark `illustrative=false` when the price is from a real open circular entry you verified.

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the CSV schema and source policy.

---

## Optional free LLM / Ollama

- **In-browser (optional):** UI panel accepts a free-tier key (e.g. Groq). Key never goes into the repo.
- **Ollama (local):** run a model locally, expose an OpenAI-compatible `/v1/chat/completions` endpoint, then point a future config or proxy at it. The heuristics still power store assignment without any LLM.

Roadmap ideas (still free): more CSV circular packs, PWA offline cache, better fuzzy matching, printable aisle-agnostic trip sheets.

---

## Stack

- Vanilla HTML / CSS / JS (no build step required for Pages)
- Node script for CSV → JSON (GitHub Actions)
- MIT license

---

## Limitations (read this)

- Seed prices are **illustrative** until replaced with curated open data.
- Store assignment confidence is only as good as the deal CSV + alias rules.
- Membership stores (Costco) need membership; dollar-store sizes vary — always check unit price in person.
- This is a **personal / community FOSS helper**, not affiliated with any retailer.

Built for **MeidasWell** · Redding / Shasta County · 2026

## Features

- **Trip-ordered list-by-store** (Redding zones) with sticky add bar, deal chips, check-off, subtotals, OSM maps
- Mobile-first / WCAG-minded (labels, focus rings, live status, contrast)
- Offline `localStorage` list · vanilla JS · no heavy deps
- See `docs/UX_RESEARCH.md` for IA research notes

## GitHub Pages

This repo publishes from the **`docs/`** folder (branch `main` → `/docs`). Keep site copies under `docs/` in sync with root `index.html`, `css/`, `js/`, `data/` when you edit the site.
