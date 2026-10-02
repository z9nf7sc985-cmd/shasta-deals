/**
 * heuristics.js — RULES / ALGORITHMIC matching (not a trained ML model).
 *
 * Assigns shopping-list items to stores by:
 *  1) Exact / fuzzy match against deal.normalized + deal.item
 *  2) Lowest effective_price among matches
 *  3) Category fallback preferences for Redding (open knowledge rules)
 *  4) Optional user-pasted free LLM key later (see llmAssist) — OFF by default
 *
 * Label in UI: "Algorithmic (rules)" vs any optional LLM suggestion.
 */
(function (global) {
  'use strict';

  const CATEGORY_PREF = {
    dairy: ['WinCo', 'Walmart', 'Grocery Outlet', 'Safeway', 'Costco'],
    produce: ['WinCo', 'Walmart', 'Raley\'s', 'Grocery Outlet', 'Safeway'],
    meat: ['Costco', 'WinCo', 'Walmart', 'Safeway', 'Raley\'s'],
    pantry: ['WinCo', 'Walmart', 'Costco', 'Grocery Outlet', 'Dollar Tree'],
    bakery: ['WinCo', 'Walmart', 'Safeway', 'Grocery Outlet'],
    household: ['Walmart', 'Costco', 'Dollar Tree', 'WinCo'],
    hba: ['Walmart', 'Dollar Tree', 'CVS', 'Walgreens'],
    general: ['WinCo', 'Walmart', 'Grocery Outlet']
  };

  const ALIASES = {
    'gallon of milk': 'milk gallon',
    'whole milk': 'milk gallon',
    milk: 'milk gallon',
    eggs: 'eggs dozen',
    'dozen eggs': 'eggs dozen',
    banana: 'bananas',
    'chicken breasts': 'chicken breast',
    'ground beef': 'ground beef',
    bread: 'bread loaf',
    rice: 'rice 5lb',
    'peanut butter': 'peanut butter',
    'toilet paper': 'toilet paper',
    'tp': 'toilet paper',
    detergent: 'laundry detergent',
    laundry: 'laundry detergent',
    ibuprofen: 'ibuprofen',
    advil: 'ibuprofen',
    shampoo: 'shampoo',
    coffee: 'coffee ground',
    apple: 'apples',
    apples: 'apples',
    yogurt: 'yogurt tub',
    butter: 'butter',
    pasta: 'pasta',
    spaghetti: 'pasta'
  };

  function normalizeQuery(q) {
    const s = String(q || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (ALIASES[s]) return ALIASES[s];
    for (const [k, v] of Object.entries(ALIASES)) {
      if (s.includes(k)) return v;
    }
    return s;
  }

  function tokenize(s) {
    return normalizeQuery(s).split(' ').filter((t) => t.length > 1);
  }

  function scoreMatch(queryNorm, deal) {
    const dn = (deal.normalized || '').toLowerCase();
    const di = (deal.item || '').toLowerCase();
    if (!queryNorm) return 0;
    if (dn === queryNorm || di === queryNorm) return 100;
    if (dn.includes(queryNorm) || queryNorm.includes(dn)) return 80;
    if (di.includes(queryNorm) || queryNorm.includes(di.replace(/[^a-z0-9\s]/g, ' ').trim())) return 70;
    const qTokens = tokenize(queryNorm);
    const dTokens = new Set([...tokenize(dn), ...tokenize(di)]);
    let hit = 0;
    for (const t of qTokens) if (dTokens.has(t)) hit++;
    if (!qTokens.length) return 0;
    return Math.round((hit / qTokens.length) * 60);
  }

  function guessCategory(queryNorm) {
    const map = [
      [/milk|egg|butter|yogurt|cheese/, 'dairy'],
      [/banana|apple|produce|lettuce|tomato|onion/, 'produce'],
      [/chicken|beef|meat|pork|turkey/, 'meat'],
      [/rice|pasta|peanut|coffee|bean|cereal|oil/, 'pantry'],
      [/bread|bagel|tortilla/, 'bakery'],
      [/toilet|detergent|paper towel|trash|soap dish/, 'household'],
      [/shampoo|ibuprofen|toothpaste|deodorant|razor/, 'hba']
    ];
    for (const [re, cat] of map) if (re.test(queryNorm)) return cat;
    return 'general';
  }

  function assignBestStore(itemName, deals, stores) {
    const q = normalizeQuery(itemName);
    const category = guessCategory(q);
    const scored = [];
    for (const d of deals || []) {
      const sc = scoreMatch(q, d);
      if (sc < 35) continue;
      if (d.effective_price == null) continue;
      scored.push({ deal: d, score: sc });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.deal.effective_price - b.deal.effective_price;
    });
    if (scored.length) {
      const topScore = scored[0].score;
      const band = scored.filter((x) => x.score >= topScore - 15);
      band.sort((a, b) => a.deal.effective_price - b.deal.effective_price);
      const best = band[0];
      const alts = band.slice(1, 4).map((x) => ({
        store_id: x.deal.store_id,
        store_chain: x.deal.store_chain,
        price: x.deal.effective_price,
        item: x.deal.item
      }));
      return {
        storeId: best.deal.store_id,
        storeChain: best.deal.store_chain,
        price: best.deal.effective_price,
        unit: best.deal.unit,
        dealId: best.deal.id,
        dealItem: best.deal.item,
        method: 'algorithmic-price-match',
        confidence: Math.min(0.95, best.score / 100),
        alternatives: alts,
        category,
        illustrative: !!best.deal.illustrative
      };
    }
    const prefs = CATEGORY_PREF[category] || CATEGORY_PREF.general;
    const byChain = new Map();
    for (const s of stores || []) {
      if (s.lat == null && (s.tags || []).includes('out-of-area')) continue;
      if (!byChain.has(s.chain)) byChain.set(s.chain, s);
    }
    for (const chain of prefs) {
      const s = byChain.get(chain);
      if (s) {
        return {
          storeId: s.id,
          storeChain: s.chain,
          price: null,
          unit: '',
          dealId: null,
          dealItem: null,
          method: 'algorithmic-category-fallback',
          confidence: 0.35,
          alternatives: [],
          category,
          illustrative: true
        };
      }
    }
    return {
      storeId: null,
      storeChain: null,
      price: null,
      unit: '',
      dealId: null,
      dealItem: null,
      method: 'unassigned',
      confidence: 0,
      alternatives: [],
      category,
      illustrative: true
    };
  }

  function groupByStore(listItems, stores, opts) {
    const options = opts || {};
    const hideChecked = !!options.hideChecked;
    const storeMap = Object.fromEntries((stores || []).map((s) => [s.id, s]));
    const groups = new Map();
    for (const it of listItems) {
      if (hideChecked && it.checked) continue;
      const key = it.assignment?.storeId || '_unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    const ordered = [];
    for (const [storeId, items] of groups) {
      const store = storeMap[storeId] || null;
      const subtotal = items.reduce((sum, it) => {
        const p = it.assignment?.price;
        const q = it.qty || 1;
        return sum + (p != null ? p * q : 0);
      }, 0);
      const remaining = items.filter((it) => !it.checked).length;
      ordered.push({
        storeId,
        store,
        label: store ? store.name : 'Unassigned / check manually',
        address: store ? store.address : '',
        zone: store ? store.zone || '' : '',
        tripOrder: store && store.trip_order != null ? store.trip_order : 999,
        lat: store ? store.lat : null,
        lon: store ? store.lon : null,
        phone: store ? store.phone || '' : '',
        items,
        knownSubtotal: subtotal,
        missingPrices: items.some((it) => it.assignment?.price == null),
        remaining
      });
    }
    ordered.sort((a, b) => {
      if (a.storeId === '_unassigned') return 1;
      if (b.storeId === '_unassigned') return -1;
      if (a.tripOrder !== b.tripOrder) return a.tripOrder - b.tripOrder;
      return a.label.localeCompare(b.label);
    });
    return ordered;
  }

  function tripSummary(groups) {
    const stops = groups.filter((g) => g.storeId !== '_unassigned').length;
    const items = groups.reduce((n, g) => n + g.items.length, 0);
    const remaining = groups.reduce((n, g) => n + (g.remaining || 0), 0);
    const known = groups.reduce((n, g) => n + (g.knownSubtotal || 0), 0);
    const anyMissing = groups.some((g) => g.missingPrices);
    return { stops, items, remaining, known, anyMissing };
  }

  function exportText(groups, title) {
    const lines = [];
    lines.push(title || 'Shasta Deals Shopping List');
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('(Prices may be illustrative seed data — verify in store.)');
    lines.push('');
    for (const g of groups) {
      lines.push(`## ${g.label}`);
      if (g.address) lines.push(g.address);
      for (const it of g.items) {
        const p =
          it.assignment?.price != null
            ? ` — $${Number(it.assignment.price).toFixed(2)}${it.assignment.unit ? '/' + it.assignment.unit : ''}`
            : ' — price TBD';
        const flag = it.assignment?.illustrative ? ' [illustrative]' : '';
        lines.push(`- [${it.qty || 1}x] ${it.name}${p}${flag}`);
      }
      if (!g.missingPrices && g.knownSubtotal > 0) {
        lines.push(`  Subtotal (known): $${g.knownSubtotal.toFixed(2)}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  async function optionalLlmPolish(prompt, opts) {
    const key = (opts && opts.apiKey) || '';
    const endpoint =
      (opts && opts.endpoint) || 'https://api.groq.com/openai/v1/chat/completions';
    if (!key) {
      return { ok: false, reason: 'No API key — using algorithmic heuristics only.' };
    }
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: (opts && opts.model) || 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content:
                'You help with Redding CA grocery shopping tips. Be brief. Do not invent exact prices. Say when unsure.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 400
        })
      });
      if (!res.ok) {
        return { ok: false, reason: `LLM HTTP ${res.status}` };
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      return { ok: true, text, label: 'Optional free LLM (user key)' };
    } catch (e) {
      return { ok: false, reason: String(e.message || e) };
    }
  }

  global.ShastaHeuristics = {
    normalizeQuery,
    assignBestStore,
    groupByStore,
    tripSummary,
    exportText,
    optionalLlmPolish,
    guessCategory,
    CATEGORY_PREF,
    LABEL: 'Algorithmic (rules + price match) — not a trained custom model'
  };
})(typeof window !== 'undefined' ? window : globalThis);
