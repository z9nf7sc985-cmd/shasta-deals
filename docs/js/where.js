/* Product links for stores that have a public pickup search. No aisle numbers are invented. */
(function () {
  function productLink(store, name) {
    var q = encodeURIComponent(String(name || "").replace(/\s+/g, " ").trim());
    var s = String(store || "").toLowerCase();
    if (!q) return null;
    if (s.indexOf("walmart") !== -1) {
      return {
        href: "https://www.walmart.com/search?q=" + q + "&stores=2537",
        label: "Open in Walmart",
        title: "Dana Drive store 2537. The Walmart app shows the aisle after you open the item. This list does not have aisle numbers."
      };
    }
    if (s.indexOf("foodmaxx") !== -1 || s.indexOf("food maxx") !== -1) {
      return {
        href: "https://shop.foodmaxx.com/store/foodmaxx/s?k=" + q,
        label: "Open in FoodMaxx",
        title: "FoodMaxx Churn Creek pickup search. Aisle is not in this price list."
      };
    }
    return null;
  }

  function storeFromRow(tr) {
    var heads = document.querySelectorAll("#deals thead th, #deals-head th");
    var tds = tr.querySelectorAll("td");
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].textContent.toLowerCase().indexOf("store") !== -1 && tds[i]) return tds[i].textContent;
    }
    var text = tr.textContent || "";
    if (/walmart/i.test(text) && !/foodmaxx/i.test(text)) return "Walmart";
    if (/foodmaxx/i.test(text) && !/walmart/i.test(text)) return "FoodMaxx";
    var chosen = text.match(/Chosen:\s*([^\u00b7]+)/i);
    return chosen ? chosen[1] : "";
  }

  function place(parent, store, name) {
    if (!parent || parent.querySelector(".where-link")) return;
    var info = productLink(store, name);
    if (!info) return;
    var a = document.createElement("a");
    a.className = "where-link";
    a.href = info.href;
    a.target = "_blank";
    a.rel = "noopener";
    a.title = info.title;
    a.textContent = info.label;
    parent.appendChild(document.createTextNode(" "));
    parent.appendChild(a);
  }

  function itemName(td) {
    var clone = td.cloneNode(true);
    clone.querySelectorAll(".where-link, img").forEach(function (n) { n.remove(); });
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function scan() {
    document.querySelectorAll("#deals-body tr").forEach(function (tr) {
      var td = tr.querySelector("td");
      if (!td) return;
      place(td, storeFromRow(tr), itemName(td));
    });
    document.querySelectorAll(".meal-row").forEach(function (row) {
      var title = row.querySelector(".item-title");
      var meta = row.querySelector(".item-meta");
      if (!title) return;
      place(title.parentElement || title, meta ? meta.textContent : "", title.textContent);
    });
    var note = document.getElementById("where-note");
    var deals = document.getElementById("deals");
    if (deals && !note) {
      var p = document.createElement("p");
      p.id = "where-note";
      p.className = "sub";
      p.textContent = "Walmart links open the Dana Drive store (2537) search, and on a phone they can open the Walmart app. The app shows the aisle after you tap the item. Aisle numbers were not on the price pages, so they are not listed here. FoodMaxx links open that store\u2019s pickup search.";
      var head = deals.querySelector(".card-head") || deals;
      head.appendChild(p);
    }
  }

  function boot() {
    var style = document.createElement("style");
    style.textContent = ".where-link{font-size:0.78rem;white-space:nowrap}";
    document.head.appendChild(style);
    scan();
    ["deals-body", "meals-board", "list-by-store"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(function () { scan(); }).observe(el, { childList: true, subtree: true });
    });
    var main = document.getElementById("main");
    if (main) new MutationObserver(function () { scan(); }).observe(main, { childList: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
