# Shasta Deals — UX research notes (grocery list / trip efficiency)

**Audience:** MeidasWell (Instacart shopper, Redding / Shasta County)  
**Date:** 2026-10-01 PT  
**Goal:** Organize listings and the shopping list for trip efficiency, glanceability, store grouping, mobile, a11y, and bargain workflows — without heavy frameworks or paid APIs.

---

## 1. Patterns that matter for multi-store grocery trips

| Pattern | Why it helps | How we apply it |
| --- | --- | --- |
| **Store clustering first** | Shoppers think in stops, not a flat SKU list. Multi-store optimizers (e.g. "one stop / few stops / lowest price") show that grouping by retailer is the primary mental model. | Default view = list **grouped by store**, not a flat list. Flat edit view is secondary / collapsible. |
| **Geographic trip order (city-level)** | Without aisle planograms, city geography still cuts drive time. Redding clusters: Lake Blvd north, Dana / mall east, Cypress–Churn Creek, Bechelli south, Eureka Way west. | `trip_order` + `zone` on stores; groups sorted north→east→south→west, out-of-area last. |
| **Aisle-agnostic trip sheets** | True aisle maps need store-specific layouts and community corrections. Generic category sort is often wrong. | Within a store: show **checkable trip sheet** (name, qty, unit price). Optional category tag for glanceability — not claimed as aisle order. |
| **Unit price / effective price** | Bargains are decided on $/oz, $/lb, multipacks — not shelf sticker alone. | Show deal effective price + unit; mark illustrative seed prices clearly. |
| **Mobile-first add → auto-store** | Instant capture while rushing; assignment can be automated. | Sticky add bar; heuristics assign store; chips from live deals for one-tap add. |
| **Progressive disclosure** | Tips, About, optional LLM, and advanced filters clutter the primary trip sheet. | Collapsible `<details>` for tips / about / LLM; deals board below the list. |
| **Offline localStorage** | In-store signal is unreliable; lists must survive refresh. | Persist list + checked state + prefs in `localStorage`; no backend required. |
| **Glanceability** | One glance: which stop next, how many left, known $ subtotal. | Store headers with count, subtotal, map link, trip-step badge. |
| **Bargain workflow** | Scan deals → add → see store impact. | Deal board: filter/sort + "Add" action; chips mirror top deals. |

Sources consulted (public product/design patterns, 2024–2026): store-section / route list apps (Sort My Shop, grocery-route-optimizer), multi-stop optimizers, WCAG 2.2 mobile guidance, vanilla local-first list PWAs.

---

## 2. Information architecture (target)

1. **Skip link** → main content  
2. **Compact header** + section nav (List · Deals · Stores · Tips)  
3. **Sticky Add bar** (item + qty + Add) + deal suggestion chips  
4. **Trip sheet** (primary): stores in Redding trip order, subtotals, OSM maps, check-off  
5. **List tools**: filter/sort, export / share / clear; flat edit under details  
6. **Deal board** (secondary): search, sort, add-from-deal  
7. **Stores directory**  
8. **Tips / About / optional LLM** — collapsed by default  

---

## 3. Accessibility (WCAG-minded)

- Contrast: light text on dark surfaces ≥ 4.5:1 (current palette passes AA for body + muted).  
- Visible `:focus-visible` rings; labels always visible (not placeholder-only).  
- Touch targets ≥ ~44×44 CSS px for qty / check / add.  
- `aria-live` for add/remove status; `role="region"` on trip groups.  
- Prefer `prefers-reduced-motion`.  
- Tables: proper `<th scope>`; mobile cards as progressive enhancement via CSS if needed.

---

## 4. Performance constraints

- No React/Vue/CDN UI kits — vanilla JS + CSS.  
- Small JSON data files; event delegation; no image-heavy hero.  
- Avoid layout thrash: render groups from a single pass after state change.

---

## 5. Redding-sensible trip zones (seed)

| Order | Zone | Example stores |
| --- | --- | --- |
| 1 | North / Lake | Raley's Lake, Dollar Tree Lake |
| 2 | Northeast / Old Alturas | WinCo |
| 3 | East / Dana–mall | Walmart Dana |
| 4 | Central / Pine–Placer | Safeway Pine, CVS Placer |
| 5 | Southeast / Cypress–Churn | Safeway Cypress, Walgreens Cypress, Grocery Outlet Churn |
| 6 | South / Bechelli | Costco |
| 7 | West / Eureka Way | Grocery Outlet Eureka |
| 99 | Out of area | Trader Joe's (reference only) |

Nearest-neighbor reordering from a user "home" pin is a future enhancement; seed `trip_order` is enough for v2 glanceability.

---

## 6. Out of scope (honest)

- Live Instacart / GasBuddy / proprietary circular scraping  
- Per-aisle planograms without community mapping  
- Custom-trained ML models (rules + optional user LLM key only)
