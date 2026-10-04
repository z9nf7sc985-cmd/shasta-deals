/* Meal lists tied to the cheapest Redding pickup row, plus item photos. */
(function () {
  var CACHE_KEY = "shasta-deals-photo-v1";
  var photos = {};
  var deals = [];
  var queue = [];
  var pumping = false;
  var memory = new Map();
  var mealAdds = {};

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function priceOf(d) {
    var n = d.effective_price != null ? d.effective_price : d.price;
    n = Number(n);
    return Number.isFinite(n) ? n : null;
  }

  function outOfStock(d) {
    var blob = [d.in_stock, d.stock, d.availability, d.item].join(" ").toLowerCase();
    if (d.in_stock === false || d.in_stock === 0 || d.in_stock === "false") return true;
    return /out of stock|sold out|unavailable|not available/.test(blob);
  }

  function hasAll(name, words) {
    if (!words || !words.length) return true;
    return words.every(function (w) { return name.indexOf(String(w).toLowerCase()) !== -1; });
  }

  function hasBan(name, words) {
    if (!words) return false;
    return words.some(function (w) { return w && name.indexOf(String(w).toLowerCase()) !== -1; });
  }

  function pick(spec) {
    var cat = (spec.category || "").toLowerCase();
    var best = null;
    for (var i = 0; i < deals.length; i++) {
      var d = deals[i];
      if (d.illustrative || outOfStock(d)) continue;
      var name = String(d.item || "").toLowerCase();
      var c = String(d.category || "").toLowerCase();
      if (cat && c !== cat) continue;
      if (!hasAll(name, spec.need)) continue;
      if (hasBan(name, spec.ban)) continue;
      var price = priceOf(d);
      if (price == null) continue;
      if (!best || price < best.price) best = { deal: d, price: price };
    }
    return best;
  }

  function categorySrc(cat) {
    if (!cat || !photos.images) return "";
    return photos.images[cat] || photos.images[cat.toLowerCase()] || "";
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch (e) { return {}; }
  }

  function writeCache(key, url) {
    try {
      var all = readCache();
      all[key] = { u: url || "", t: Date.now() };
      var keys = Object.keys(all);
      if (keys.length > 400) delete all[keys[0]];
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch (e) { /* private mode */ }
  }

  function score(query, productName) {
    var skip = { the: 1, and: 1, with: 1, for: 1, oz: 1, fl: 1, count: 1, great: 1, value: 1 };
    var words = query.toLowerCase().split(/[^a-z0-9]+/).filter(function (w) {
      return w.length > 2 && !skip[w];
    });
    if (!words.length) return 0;
    var pn = (productName || "").toLowerCase();
    var hit = 0;
    for (var i = 0; i < words.length; i++) if (pn.indexOf(words[i]) !== -1) hit++;
    return hit / words.length;
  }

  function enqueue(name, img) {
    var key = String(name || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 140);
    if (!key || !img) return;
    if (memory.has(key)) {
      if (memory.get(key)) img.src = memory.get(key);
      return;
    }
    var saved = readCache()[key];
    if (saved && saved.u) {
      memory.set(key, saved.u);
      img.src = saved.u;
      return;
    }
    if (saved && !saved.u && Date.now() - saved.t < 6 * 60 * 60 * 1000) return;
    queue.push({ key: key, img: img });
    pump();
  }

  function pump() {
    if (pumping) return;
    var job = queue.shift();
    if (!job) return;
    pumping = true;
    var q = job.key.split(",")[0].slice(0, 70);
    var url = "https://world.openfoodfacts.org/api/v2/search?search_terms=" +
      encodeURIComponent(q) + "&page_size=5&fields=product_name,image_front_small_url";
    fetch(url, { headers: { Accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var best = "";
        var bestScore = 0.45;
        var products = (data && data.products) || [];
        for (var i = 0; i < products.length; i++) {
          var img = products[i].image_front_small_url;
          if (!img) continue;
          var s = score(q, products[i].product_name);
          if (s > bestScore) { bestScore = s; best = img; }
        }
        if (best) {
          memory.set(job.key, best);
          if (job.img && job.img.isConnected) job.img.src = best;
          writeCache(job.key, best);
        } else {
          memory.set(job.key, "");
          writeCache(job.key, "");
        }
      })
      .catch(function () { /* keep the food photo */ })
      .then(function () {
        pumping = false;
        setTimeout(pump, 700);
      });
  }

  function imgTag(cat, name, cls) {
    var src = categorySrc(cat);
    var alt = name || cat || "item";
    return '<img class="' + cls + '" alt="' + esc(alt) + '" src="' + esc(src) + '" data-photo-name="' + esc(name || "") + '" data-photo-cat="' + esc(cat || "") + '">';
  }

  function renderMeals(pack) {
    var host = document.getElementById("meals-board");
    if (!host) return;
    var mode = host.getAttribute("data-mode") || "road";
    var meals = (pack.meals || []).filter(function (m) { return m.mode === mode; });
    host.innerHTML = meals.map(function (meal) {
      var rows = meal.ingredients.map(function (spec) {
        var found = pick(spec);
        if (!found) {
          return '<li class="meal-row miss"><span>' + esc(spec.label) + '</span><span class="item-meta">Not in the loaded pickup list</span></li>';
        }
        var d = found.deal;
        return '<li class="meal-row" data-add="' + esc(d.item) + '">' +
          imgTag(d.category, d.item, "meal-photo") +
          '<div><div class="item-title">' + esc(d.item) + '</div>' +
          '<div class="item-meta">' + esc(d.store_chain || "") + ' · pickup</div></div>' +
          '<span class="price">$' + found.price.toFixed(2) + '</span></li>';
      }).join("");
      var total = 0;
      var named = [];
      meal.ingredients.forEach(function (spec) {
        var found = pick(spec);
        if (!found) return;
        total += found.price;
        named.push(found.deal.item);
      });
      var add = named.length
        ? '<button type="button" class="btn btn-primary btn-sm" data-meal-id="' + esc(meal.id) + '">Add these to the list</button>'
        : "";
      mealAdds[meal.id] = named;
      return '<article class="card meal-card"><h3>' + esc(meal.title) + '</h3><p class="sub">' + esc(meal.note) + '</p><ul class="meal-items">' +
        rows + '</ul><div class="meal-foot"><span class="item-meta">Cheapest pickup total $' + total.toFixed(2) + '</span>' + add + '</div></article>';
    }).join("");
    host.querySelectorAll("img[data-photo-name]").forEach(function (img) {
      enqueue(img.getAttribute("data-photo-name"), img);
    });
  }

