(function () {
  'use strict';

  const STORAGE_KEY = 'shasta-deals-list-v2';
  const STORAGE_LEGACY = 'shasta-deals-list-v1';
  const LLM_KEY = 'shasta-deals-llm-key';
  const PREFS_KEY = 'shasta-deals-prefs-v1';

  const state = {
    stores: [],
    deals: [],
    tips: [],
    list: [],
    meta: null,
    listFilter: '',
    listSort: 'trip',
    hideChecked: false,
    dealFilter: '',
    dealSort: 'price'
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  function announce(msg) {
    const live = $('#status-live');
    if (live) live.textContent = msg;
  }

  async function loadData() {
    const [storesRes, dealsRes, tipsRes] = await Promise.all([
      fetch('data/stores.json'),
      fetch('data/deals.json'),
      fetch('data/tips.json')
    ]);
    if (!storesRes.ok || !dealsRes.ok || !tipsRes.ok) {
      throw new Error('Data fetch failed');
    }
    const storesJson = await storesRes.json();
    const dealsJson = await dealsRes.json();
    const tipsJson = await tipsRes.json();

    // The FoodMaxx catalog is optional. A published catalog replaces the
    // illustrative seed board; the seed board remains a safe fallback until
    // the first real pickup catalog is imported.
    let foodmaxxJson = null;
    try {
      const foodmaxxRes = await fetch('data/foodmaxx.json');
      if (foodmaxxRes.ok) foodmaxxJson = await foodmaxxRes.json();
    } catch (_) {
      // Optional file is absent in older/local builds.
    }

    state.stores = storesJson.stores || [];
    const hasFoodmaxxCatalog = foodmaxxJson && Array.isArray(foodmaxxJson.deals);
    state.deals = hasFoodmaxxCatalog ? foodmaxxJson.deals : dealsJson.deals || [];
    const activeMeta = hasFoodmaxxCatalog ? foodmaxxJson : dealsJson;
    state.meta = {
      generated_at: activeMeta.generated_at,
      count: state.deals.length,
      disclaimer: activeMeta.disclaimer,
      foodmaxx: !!hasFoodmaxxCatalog
    };
    state.tips = tipsJson.tips || [];
    state.list = loadList();
    loadPrefs();
    reassignAll();
  }

  function loadList() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_LEGACY) || '[]';
      const parsed = JSON.parse(raw);
      return (parsed || []).map((it) => ({
        ...it,
        checked: !!it.checked,
        qty: Math.max(1, parseInt(it.qty, 10) || 1)
      }));
    } catch {
      return [];
    }
  }

  function saveList() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.list));
  }

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (p.listSort) state.listSort = p.listSort;
      if (typeof p.hideChecked === 'boolean') state.hideChecked = p.hideChecked;
      if (p.dealSort) state.dealSort = p.dealSort;
    } catch {
      /* ignore */
    }
  }

  function savePrefs() {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        listSort: state.listSort,
        hideChecked: state.hideChecked,
        dealSort: state.dealSort
      })
    );
  }

  function reassignAll() {
    state.list = state.list.map((it) => ({
      ...it,
      assignment: ShastaHeuristics.assignBestStore(it.name, state.deals, state.stores, it.qty)
    }));
    saveList();
  }

  function addItem(name, qty, opts) {
    const n = String(name || '').trim();
    if (!n) return;
    const q = Math.max(1, parseInt(qty, 10) || 1);
    const existing = state.list.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      existing.qty += q;
      existing.checked = false;
      existing.assignment = ShastaHeuristics.assignBestStore(existing.name, state.deals, state.stores, existing.qty);
    } else {
      state.list.push({
        id: 'i' + Date.now() + Math.random().toString(36).slice(2, 7),
        name: n,
        qty: q,
        checked: false,
        assignment: ShastaHeuristics.assignBestStore(n, state.deals, state.stores, q)
      });
    }
    saveList();
    renderList();
    const store = existing
      ? existing.assignment?.storeChain
      : state.list[state.list.length - 1]?.assignment?.storeChain;
    const msg = `Added ${n}` + (store ? ` → ${store}` : '');
    announce(msg);
    if (!opts || !opts.silent) toast(msg);
  }

  function removeItem(id) {
    const it = state.list.find((x) => x.id === id);
    state.list = state.list.filter((x) => x.id !== id);
    saveList();
    renderList();
    if (it) {
      announce(`Removed ${it.name}`);
      toast(`Removed ${it.name}`);
    }
  }

  function setQty(id, qty) {
    const it = state.list.find((x) => x.id === id);
    if (!it) return;
    it.qty = Math.max(1, qty);
    it.assignment = ShastaHeuristics.assignBestStore(it.name, state.deals, state.stores, it.qty);
    saveList();
    renderList();
  }

  function toggleChecked(id) {
    const it = state.list.find((x) => x.id === id);
    if (!it) return;
    it.checked = !it.checked;
    saveList();
    renderList();
  }

  function methodLabel(m) {
    if (m === 'algorithmic-price-match') return 'Price match';
    if (m === 'algorithmic-category-fallback') return 'Category guess';
    return 'Unassigned';
  }

  function osmLink(lat, lon) {
    if (lat == null || lon == null) return '';
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  }

  function filteredListItems() {
    const q = state.listFilter.toLowerCase().trim();
    if (!q) return state.list;
    return state.list.filter((it) => {
      const a = it.assignment || {};
      return (
        it.name.toLowerCase().includes(q) ||
        (a.storeChain || '').toLowerCase().includes(q) ||
        (a.category || '').toLowerCase().includes(q) ||
        (a.dealItem || '').toLowerCase().includes(q)
      );
    });
  }

  function sortedGroups(groups) {
    const copy = groups.slice();
    if (state.listSort === 'name') {
      copy.sort((a, b) => {
        if (a.storeId === '_unassigned') return 1;
        if (b.storeId === '_unassigned') return -1;
        return a.label.localeCompare(b.label);
      });
    } else if (state.listSort === 'subtotal') {
      copy.sort((a, b) => b.knownSubtotal - a.knownSubtotal);
    } else if (state.listSort === 'items') {
      copy.sort((a, b) => b.items.length - a.items.length);
    }
    // 'trip' already ordered by heuristics
    return copy;
  }

  function renderList() {
    const items = filteredListItems();
    const groups = sortedGroups(
      ShastaHeuristics.groupByStore(items, state.stores, { hideChecked: state.hideChecked })
    );
    const summary = ShastaHeuristics.tripSummary(
      ShastaHeuristics.groupByStore(state.list, state.stores, { hideChecked: false })
    );
    const flatEl = $('#list-flat');
    const groupEl = $('#list-by-store');
    const countEl = $('#list-count');
    const tripCard = $('#trip-summary');
    const tripStats = $('#trip-stats');

    countEl.textContent = `${state.list.length} item${state.list.length === 1 ? '' : 's'}`;

    if (state.list.length) {
      tripCard.hidden = false;
      const known = summary.known > 0 ? ` · ~$${summary.known.toFixed(2)} known` : '';
      const miss = summary.anyMissing ? ' · some TBD' : '';
      tripStats.innerHTML = `<span>${summary.stops}</span> stop${summary.stops === 1 ? '' : 's'} · <span>${summary.remaining}</span> left of ${summary.items}${known}${miss}`;
    } else {
      tripCard.hidden = true;
    }

    // Sync prefs UI
    const hideEl = $('#hide-checked');
    const sortEl = $('#list-sort');
    if (hideEl) hideEl.checked = state.hideChecked;
    if (sortEl) sortEl.value = state.listSort;

    if (!state.list.length) {
      groupEl.innerHTML =
        '<p class="empty">Add items above. Auto-assigns a Redding store using <strong>rules + seed prices</strong>, then groups in trip order.</p>';
      flatEl.innerHTML = '<p class="empty">Nothing yet.</p>';
      return;
    }

    if (!groups.length) {
      groupEl.innerHTML = '<p class="empty">No items match this filter / hide-checked setting.</p>';
    } else {
      groupEl.innerHTML = '';
      let step = 0;
      for (const g of groups) {
        step += 1;
        const div = document.createElement('section');
        div.className = 'store-group';
        div.setAttribute('role', 'region');
        div.setAttribute('aria-label', `Stop ${step}: ${g.label}`);
        const map =
          g.lat != null && g.lon != null
            ? `<a class="btn btn-sm" href="${osmLink(g.lat, g.lon)}" target="_blank" rel="noopener">Map</a>`
            : '';
        const phone = g.phone
          ? `<a class="btn btn-sm" href="tel:${escapeHtml(g.phone.replace(/[^\d+]/g, ''))}">Call</a>`
          : '';
        const sub =
          !g.missingPrices && g.knownSubtotal > 0
            ? `~$${g.knownSubtotal.toFixed(2)} known`
            : g.missingPrices
              ? 'some prices TBD'
              : '';
        const zone = g.zone ? `<span class="item-meta">${escapeHtml(g.zone)}</span>` : '';
        div.innerHTML = `
          <header>
            <div>
              <div class="store-title">
                <span class="badge step">Stop ${step}</span>
                <strong>${escapeHtml(g.label)}</strong>
              </div>
              <div class="store-meta">${escapeHtml(g.address || '')} ${zone}</div>
            </div>
            <div class="store-actions">
              <span class="item-meta">${g.remaining}/${g.items.length} left · ${sub}</span>
              ${map}${phone}
            </div>
          </header>
          <ul class="list trip-items"></ul>
          <div class="store-subtotal">
            <span>${escapeHtml(g.zone || 'Trip stop')}</span>
            <span>${sub || 'Subtotal TBD'}</span>
          </div>`;
        const gul = div.querySelector('ul');
        for (const it of g.items) {
          const a = it.assignment || {};
          const itemTotal = a.estimatedTotal != null ? Number(a.estimatedTotal) : a.price != null ? Number(a.price) * it.qty : null;
          const unit =
            a.price != null
              ? `<span class="price">$${itemTotal.toFixed(2)}</span>${
                  a.unit ? ` <span class="item-meta">(${it.qty}× $${Number(a.price).toFixed(2)}/${escapeHtml(a.unit)})</span>` : ''
                }`
              : '<span class="price muted">TBD</span>';
          const li = document.createElement('li');
          li.className = 'item-row' + (it.checked ? ' checked' : '');
          li.innerHTML = `
            <input class="item-check" type="checkbox" data-act="check" data-id="${it.id}"
              ${it.checked ? 'checked' : ''} aria-label="Got ${escapeHtml(it.name)}" />
            <div>
              <div class="item-title">${it.qty}× ${escapeHtml(it.name)}</div>
              <div class="item-meta">${escapeHtml(a.dealItem || a.category || methodLabel(a.method))} · ${escapeHtml(a.reason || 'price TBD')}${
                a.illustrative ? ' · <span class="illust">illustrative</span>' : ''
              }</div>
            </div>
            <div style="text-align:right">${unit}</div>`;
          gul.appendChild(li);
        }
        groupEl.appendChild(div);
      }
    }

    // Flat edit list
    flatEl.innerHTML = '<ul class="list"></ul>';
    const ul = flatEl.querySelector('ul');
    for (const it of state.list) {
      const a = it.assignment || {};
      const priceHtml =
        a.price != null
          ? `<span class="price">$${Number(a.price).toFixed(2)}</span>${a.unit ? ` <span class="item-meta">/${escapeHtml(a.unit)}</span>` : ''}`
          : `<span class="price muted">TBD</span>`;
      const li = document.createElement('li');
      if (it.checked) li.classList.add('checked');
      li.innerHTML = `
        <div>
          <div class="item-title">${escapeHtml(it.name)}</div>
          <div class="item-meta">
            ${a.storeChain ? escapeHtml(a.storeChain) : 'No store'} · ${methodLabel(a.method)} · ${escapeHtml(a.reason || 'price TBD')}
            ${a.illustrative ? ' · <span class="illust">illustrative</span>' : ''}
          </div>
          <div class="item-meta">${priceHtml}</div>
        </div>
        <div style="text-align:right">
          <div class="qty">
            <button type="button" data-act="dec" data-id="${it.id}" aria-label="Decrease quantity">−</button>
            <span aria-label="Quantity">${it.qty}</span>
            <button type="button" data-act="inc" data-id="${it.id}" aria-label="Increase quantity">+</button>
          </div>
          <div style="margin-top:0.35rem">
            <button type="button" class="btn btn-ghost btn-danger btn-sm" data-act="rm" data-id="${it.id}">Remove</button>
          </div>
        </div>`;
      ul.appendChild(li);
    }
  }

  function renderStores() {
    const el = $('#stores-grid');
    el.innerHTML = '';
    const ordered = state.stores.filter((s) => ShastaHeuristics.isReddingStore(s)).slice().sort((a, b) => {
      const ao = a.trip_order != null ? a.trip_order : 50;
      const bo = b.trip_order != null ? b.trip_order : 50;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
    for (const s of ordered) {
      const card = document.createElement('article');
      card.className = 'card store-card';
      const osm =
        s.lat != null && s.lon != null
          ? `<a href="${osmLink(s.lat, s.lon)}" target="_blank" rel="noopener">OSM map</a>`
          : '';
      const zone = s.zone ? `<div class="item-meta">Zone: ${escapeHtml(s.zone)}</div>` : '';
      const storeDeals = state.deals.filter((d) => d.store_id === s.id && d.effective_price != null);
      const hasRealPickup = storeDeals.some((d) => !d.illustrative);
      const pickupStatus = hasRealPickup
        ? `${storeDeals.filter((d) => !d.illustrative).length} store pickup price(s) listed`
        : storeDeals.length
          ? 'Sample data only — no online pickup price'
          : 'No online pickup price';
      card.innerHTML = `
        <div class="name">${escapeHtml(s.name)} <span class="tier ${escapeHtml(s.price_tier)}">${escapeHtml(s.price_tier)}</span></div>
        <div class="addr">${escapeHtml(s.address)}</div>
        ${zone}
        <div class="item-meta"><strong>${escapeHtml(pickupStatus)}</strong></div>
        <div class="item-meta">${escapeHtml(s.hours_note || '')}${s.phone ? ' · ' + escapeHtml(s.phone) : ''}</div>
        <div class="item-meta">${escapeHtml(s.notes || '')}</div>
        <div class="item-meta">${osm}</div>`;
      el.appendChild(card);
    }
  }

  function comparisonStores() {
    const stores = state.stores.filter((s) => {
      if (!ShastaHeuristics.isReddingStore(s)) return false;
      const types = s.type || [];
      return types.includes('grocery') || types.includes('warehouse') || types.includes('discount') ||
        state.deals.some((d) => d.store_id === s.id);
    }).map((s) => ({ ...s }));
    return stores.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  function comparisonRows() {
    const q = state.dealFilter.toLowerCase().trim();
    const matching = state.deals.filter((d) => {
      const store = state.stores.find((s) => s.id === d.store_id);
      if (!ShastaHeuristics.isReddingStore(store)) return false;
      if (!q) return true;
      const searchable = [
        d.item,
        d.normalized,
        d.department,
        d.category,
        d.store_chain,
        d.store_id
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(q);
    });
    const grouped = new Map();
    for (const d of matching) {
      const key = (d.normalized || d.item || '').toLowerCase().trim();
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, { key, product: d.item || d.normalized, department: d.department || d.category || '', offers: [] });
      grouped.get(key).offers.push(d);
    }
    const rows = [...grouped.values()].map((row) => {
      const listed = state.list.find((it) => ShastaHeuristics.normalizeQuery(it.name) === row.key);
      row.quantity = listed ? listed.qty : 1;
      row.choice = ShastaHeuristics.comparePickupPrices(row.offers, row.quantity);
      return row;
    });
    const lowest = (row) => row.choice?.unitPrice ?? Infinity;
    if (state.dealSort === 'price') {
      rows.sort((a, b) => lowest(a) - lowest(b) || a.product.localeCompare(b.product));
    } else if (state.dealSort === 'item') {
      rows.sort((a, b) => a.product.localeCompare(b.product));
    } else if (state.dealSort === 'category') {
      rows.sort((a, b) => a.department.localeCompare(b.department) || a.product.localeCompare(b.product));
    } else if (state.dealSort === 'store') {
      rows.sort((a, b) => (a.offers[0].store_chain || '').localeCompare(b.offers[0].store_chain || '') || a.product.localeCompare(b.product));
    }
    return rows;
  }

  function renderDeals() {
    const body = $('#deals-body');
    const head = $('#deals-head');
    const stores = comparisonStores();
    const rows = comparisonRows();
    if (head) {
      head.innerHTML = '<th scope="col">Product</th><th scope="col">Department</th>' +
        stores.map((s) => `<th scope="col">${escapeHtml(s.name || s.chain || s.id)}<br><span class="item-meta">Pickup price · unit/pack</span></th>`).join('') +
        '<th scope="col"><span class="sr-only">Add</span></th>';
    }
    body.innerHTML = rows.map((row) => {
      const choice = row.choice || {};
      const chosen = choice.offer;
      const chosenStore = chosen ? (chosen.store_chain || chosen.store_id || 'selected store') : 'No pickup price';
      const chosenText = chosen
        ? `<div class="item-meta"><strong>Chosen: ${escapeHtml(chosenStore)}</strong> · ${escapeHtml(choice.reason || 'regular price')} · qty ${row.quantity}</div>`
        : '<div class="item-meta">No Redding pickup price</div>';
      const byStore = new Map();
      for (const d of row.offers) {
        if (!byStore.has(d.store_id)) byStore.set(d.store_id, []);
        byStore.get(d.store_id).push(d);
      }
      const cells = stores.map((store) => {
        const storeOffers = byStore.get(store.id) || [];
        const regularOffer = storeOffers
          .filter((offer) => (offer.effective_price ?? offer.price) != null)
          .sort((a, b) => (a.effective_price ?? a.price) - (b.effective_price ?? b.price))[0];
        const dealOffers = storeOffers.filter((offer) => Number.isFinite(Number(offer.deal_qty)) && Number(offer.deal_qty) > 0 && Number.isFinite(Number(offer.deal_total)) && Number(offer.deal_total) > 0);
        const d = regularOffer || dealOffers[0];
        const price = d ? (d.effective_price ?? d.price) : null;
        if (!d) return '<td class="no-price">No online pickup price</td>';
        const isChosen = chosen && chosen.store_id === store.id;
        const sample = d.illustrative ? '<span class="illust">sample</span>' : '<span class="pickup-label">store pickup</span>';
        const chosenLabel = isChosen ? '<span class="cheapest-label">chosen</span>' : '';
        const unit = d.unit_price != null ? `$${Number(d.unit_price).toFixed(2)}/${escapeHtml(d.unit || 'unit')}` : price != null ? `$${Number(price).toFixed(2)}/${escapeHtml(d.unit || 'unit')}` : '—';
        const pack = d.pack_size || d.unit || '—';
        const deals = dealOffers.map((offer) => {
          const n = Number(offer.deal_qty), total = Number(offer.deal_total);
          return `<div class="item-meta">Buy ${n} for $${total.toFixed(2)} ($${(total / n).toFixed(2)} each)</div>`;
        }).join('');
        return `<td class="offer${isChosen ? ' cheapest' : ''}">
          ${price != null ? `<span class="price">$${Number(price).toFixed(2)}</span>` : '<span class="price">—</span>'} ${sample} ${chosenLabel}
          <div class="item-meta">Unit: ${unit}</div>
          <div class="item-meta">Pack: ${escapeHtml(pack)}</div>${deals}
        </td>`;
      }).join('');
      const addName = escapeAttr(row.product || row.key);
      return `<tr>
        <td><strong>${escapeHtml(row.product)}</strong>${chosenText}</td>
        <td>${escapeHtml(row.department)}</td>
        ${cells}
        <td><button type="button" class="btn btn-sm btn-primary" data-deal-add="${addName}" aria-label="Add ${escapeHtml(row.product)} to list">Add</button></td>
      </tr>`;
    }).join('');
    if (!rows.length) body.innerHTML = '<tr><td colspan="99" class="empty">No products match this search.</td></tr>';

    const catalogNote = $('#foodmaxx-note');
    if (catalogNote) {
      catalogNote.textContent = state.meta?.foodmaxx
        ? 'Pickup prices are from Walmart at 1515 Dana Dr and FoodMaxx at 1330 Churn Creek, captured Oct 4, 2026. Not a live feed, and not every item in the store. Delivery is not listed.'
        : 'FoodMaxx catalog not loaded: comparison rows use illustrative sample data so the layout remains usable. No live pickup prices are shown, and delivery is never listed.';
    }
    $('#deals-meta').textContent = state.meta
      ? `${rows.length} products · ${state.meta.count} price entries · generated ${formatPt(state.meta.generated_at)} · ${state.meta.disclaimer || ''}`
      : '';
    const sortEl = $('#deal-sort');
    if (sortEl) sortEl.value = state.dealSort;
  }

  function renderDealChips() {
    const el = $('#deal-chips');
    if (!el) return;
    el.innerHTML = '';
    // Prefer cheapest illustrative/real deals, unique normalized names
    const seen = new Set();
    const picks = [];
    const sorted = state.deals
      .slice()
      .filter((d) => d.effective_price != null)
      .sort((a, b) => a.effective_price - b.effective_price);
    for (const d of sorted) {
      const key = (d.normalized || d.item).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(d);
      if (picks.length >= 10) break;
    }
    // Always include staples if missing
    const staples = ['milk', 'eggs', 'bananas', 'bread', 'coffee'];
    for (const s of staples) {
      if (picks.length >= 12) break;
      if ([...seen].some((k) => k.includes(s))) continue;
      picks.push({ item: s, normalized: s, effective_price: null, store_chain: '' });
      seen.add(s);
    }
    for (const d of picks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      const label = d.normalized || d.item;
      b.innerHTML =
        escapeHtml(label) +
        (d.effective_price != null
          ? `<span class="chip-price">$${Number(d.effective_price).toFixed(2)}</span>`
          : '');
      b.title = d.store_chain ? `${d.item} @ ${d.store_chain}` : d.item;
      b.addEventListener('click', () => addItem(label, 1));
      el.appendChild(b);
    }
  }

  function renderTips() {
    const el = $('#tips-list');
    el.innerHTML = state.tips
      .map((t) => `<div class="tip"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.body)}</p></div>`)
      .join('');
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function formatPt(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' PT';
    } catch {
      return iso;
    }
  }

  function exportList() {
    const groups = ShastaHeuristics.groupByStore(state.list, state.stores);
    const text = ShastaHeuristics.exportText(groups, 'MeidasWell — Shasta Deals List');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shasta-shopping-list.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported .txt');
  }

  async function shareList() {
    const groups = ShastaHeuristics.groupByStore(state.list, state.stores);
    const text = ShastaHeuristics.exportText(groups, 'MeidasWell — Shasta Deals List');
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Shasta shopping list', text });
        return;
      } catch (_) {
        /* fall through */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('List copied to clipboard');
    } catch {
      toast('Could not copy — try Export');
    }
  }

  function measureHeader() {
    const h = document.querySelector('.app-header');
    if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
  }

  function wire() {
    $('#add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      addItem($('#item-name').value, $('#item-qty').value);
      $('#item-name').value = '';
      $('#item-qty').value = '1';
      $('#item-name').focus();
    });

    const onListClick = (e) => {
      const btn = e.target.closest('button[data-act]');
      const check = e.target.closest('input[data-act="check"]');
      if (check) {
        toggleChecked(check.dataset.id);
        return;
      }
      if (!btn) return;
      const id = btn.dataset.id;
      const it = state.list.find((x) => x.id === id);
      if (!it) return;
      if (btn.dataset.act === 'inc') setQty(id, it.qty + 1);
      if (btn.dataset.act === 'dec') setQty(id, Math.max(1, it.qty - 1));
      if (btn.dataset.act === 'rm') removeItem(id);
    };
    $('#list-flat').addEventListener('click', onListClick);
    // Checkbox toggles via change only (click would double-fire with change)
    $('#list-by-store').addEventListener('click', (e) => {
      if (e.target.closest('input[data-act="check"]')) return;
      onListClick(e);
    });
    $('#list-by-store').addEventListener('change', (e) => {
      const check = e.target.closest('input[data-act="check"]');
      if (check) toggleChecked(check.dataset.id);
    });

    $('#btn-clear').addEventListener('click', () => {
      if (confirm('Clear the whole list?')) {
        state.list = [];
        saveList();
        renderList();
        announce('List cleared');
        toast('List cleared');
      }
    });
    $('#btn-uncheck').addEventListener('click', () => {
      state.list.forEach((it) => {
        it.checked = false;
      });
      saveList();
      renderList();
      toast('Unchecked all');
    });
    $('#btn-export').addEventListener('click', exportList);
    $('#btn-share').addEventListener('click', shareList);

    $('#list-filter').addEventListener('input', (e) => {
      state.listFilter = e.target.value;
      renderList();
    });
    $('#list-sort').addEventListener('change', (e) => {
      state.listSort = e.target.value;
      savePrefs();
      renderList();
    });
    $('#hide-checked').addEventListener('change', (e) => {
      state.hideChecked = e.target.checked;
      savePrefs();
      renderList();
    });

    $('#deal-search').addEventListener('input', (e) => {
      state.dealFilter = e.target.value;
      renderDeals();
    });
    $('#deal-sort').addEventListener('change', (e) => {
      state.dealSort = e.target.value;
      savePrefs();
      renderDeals();
    });
    $('#deals-body').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-deal-add]');
      if (!btn) return;
      addItem(btn.getAttribute('data-deal-add'), 1);
    });

    const savedKey = localStorage.getItem(LLM_KEY) || '';
    $('#llm-key').value = savedKey;
    $('#btn-save-key').addEventListener('click', () => {
      localStorage.setItem(LLM_KEY, $('#llm-key').value.trim());
      toast('Key saved in this browser only');
    });
    $('#btn-llm-tip').addEventListener('click', async () => {
      const key = $('#llm-key').value.trim() || localStorage.getItem(LLM_KEY) || '';
      const names = state.list.map((i) => i.name).join(', ') || 'milk, eggs, produce';
      const out = $('#llm-out');
      out.hidden = false;
      out.textContent = 'Calling optional free LLM endpoint (if key present)…';
      const res = await ShastaHeuristics.optionalLlmPolish(
        `Shopping in Redding CA / Shasta County. My list: ${names}. Give 3 brief bargain tips. Do not invent exact dollar prices.`,
        { apiKey: key }
      );
      if (!res.ok) {
        out.textContent = `Skipped LLM: ${res.reason}\n\nFalling back to local tips (algorithmic / curated).`;
        return;
      }
      out.textContent = `[${res.label}]\n\n${res.text}`;
    });

    window.addEventListener('resize', measureHeader);
  }

  async function init() {
    measureHeader();
    wire();
    try {
      await loadData();
      renderStores();
      renderDeals();
      renderDealChips();
      renderTips();
      renderList();
      $('#algo-label').textContent = ShastaHeuristics.LABEL;
      measureHeader();
    } catch (err) {
      console.error(err);
      $('#boot-error').hidden = false;
      $('#boot-error').textContent =
        'Failed to load data files. If opening as a file:// URL, use a local static server (see README).';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
