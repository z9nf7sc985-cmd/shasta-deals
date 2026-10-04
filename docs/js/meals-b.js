  function categoryFromRow(tr) {
    var heads = document.querySelectorAll("#deals thead th, #deals-head th");
    var tds = tr.querySelectorAll("td");
    var catAt = 2;
    for (var i = 0; i < heads.length; i++) {
      var h = heads[i].textContent.toLowerCase();
      if (h.indexOf("cat") !== -1 || h.indexOf("department") !== -1) catAt = i;
    }
    return tds[catAt] ? tds[catAt].textContent.trim() : "";
  }

  function decorate(root) {
    if (!root) return;
    root.querySelectorAll("tr").forEach(function (tr) {
      if (tr.querySelector(".item-photo")) return;
      var td = tr.querySelector("td");
      if (!td) return;
      var name = td.textContent.trim();
      var cat = categoryFromRow(tr);
      var src = categorySrc(cat);
      if (!src && !name) return;
      var img = document.createElement("img");
      img.className = "item-photo";
      img.alt = "";
      img.src = src || "";
      td.insertBefore(img, td.firstChild);
      enqueue(name, img);
    });
    root.querySelectorAll(".item-title").forEach(function (title) {
      if (title.querySelector(".item-photo") || title.closest("#meals")) return;
      var name = title.textContent.replace(/^\d+×\s*/, "").trim();
      var cat = "";
      var meta = title.parentElement && title.parentElement.querySelector(".item-meta");
      if (meta) {
        var blob = meta.textContent.toLowerCase();
        Object.keys(photos.images || {}).forEach(function (key) {
          if (!cat && blob.indexOf(key) !== -1) cat = key;
        });
      }
      var src = categorySrc(cat);
      if (!src) return;
      var img = document.createElement("img");
      img.className = "item-photo";
      img.alt = "";
      img.src = src;
      title.insertBefore(img, title.firstChild);
      enqueue(name, img);
    });
  }

  function watch(id) {
    var el = document.getElementById(id);
    if (!el) return;
    decorate(el);
    new MutationObserver(function () { decorate(el); }).observe(el, { childList: true, subtree: true });
  }

  function addNames(text) {
    var form = document.getElementById("add-form");
    var input = document.getElementById("item-name");
    var qty = document.getElementById("item-qty");
    if (!form || !input) return;
    text.split("\n").forEach(function (name) {
      name = name.trim();
      if (!name) return;
      input.value = name;
      if (qty) qty.value = "1";
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
    var list = document.getElementById("list");
    if (list) list.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function mount(pack) {
    var nav = document.querySelector("header nav");
    if (nav && !nav.querySelector('a[href="#meals"]')) {
      var a = document.createElement("a");
      a.href = "#meals";
      a.textContent = "Meals";
      var dealsLink = nav.querySelector('a[href="#deals"]');
      nav.insertBefore(a, dealsLink || null);
    }
    if (!document.getElementById("meals")) {
      var section = document.createElement("section");
      section.id = "meals";
      section.className = "section";
      section.innerHTML =
        '<div class="card"><div class="card-head"><h3>Meals from the cheapest pickup items</h3>' +
        '<p class="sub">Each line is the lowest Redding pickup price that matches. A photo of the food shows first. A package photo replaces it when Open Food Facts has that item. Not a live shelf check.</p></div>' +
        '<div class="chip-row" id="meal-modes"></div><p class="sub" id="meal-blurb"></p><div id="meals-board" data-mode="road"></div>' +
        '<p class="item-meta">Food photos: Wikimedia Commons. Package photos: Open Food Facts, when the name matches.</p></div>';
      var deals = document.getElementById("deals");
      deals.parentNode.insertBefore(section, deals);
    }
    var modes = document.getElementById("meal-modes");
    modes.innerHTML = (pack.modes || []).map(function (m, i) {
      return '<button type="button" class="chip' + (i === 0 ? " is-on" : "") + '" data-mode="' + esc(m.id) + '">' + esc(m.label) + "</button>";
    }).join("");
    function show(id) {
      var mode = (pack.modes || []).filter(function (m) { return m.id === id; })[0];
      document.getElementById("meals-board").setAttribute("data-mode", id);
      document.getElementById("meal-blurb").textContent = mode ? mode.blurb : "";
      modes.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("is-on", b.getAttribute("data-mode") === id);
      });
      renderMeals(pack);
    }
    modes.addEventListener("click", function (e) {
      var b = e.target.closest("[data-mode]");
      if (b) show(b.getAttribute("data-mode"));
    });
    document.getElementById("meals").addEventListener("click", function (e) {
      var b = e.target.closest("[data-meal-id]");
      if (b) addNames((mealAdds[b.getAttribute("data-meal-id")] || []).join("\n"));
    });
    show("road");
    watch("deals-body");
    watch("list-by-store");
    watch("list-flat");
  }

  function loadCatalog() {
    return fetch("data/catalog/manifest.json").then(function (res) {
      if (!res.ok) throw new Error("no manifest");
      return res.json();
    }).then(function (man) {
      var files = man.files || man.parts || [];
      return Promise.all(files.map(function (f) {
        var path = typeof f === "string" ? f : f.path || f.file;
        if (path && path.indexOf("/") === -1) path = "data/catalog/" + path;
        return fetch(path).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      })).then(function (parts) {
        var all = [];
        parts.forEach(function (p) {
          if (!p) return;
          var rows = p.deals || p.items || (Array.isArray(p) ? p : []);
          all = all.concat(rows);
        });
        return all;
      });
    }).catch(function () {
      return fetch("data/deals.json").then(function (r) { return r.json(); }).then(function (d) { return d.deals || []; });
    });
  }

  function boot() {
    var style = document.createElement("style");
    style.textContent = [
      ".item-photo{width:44px;height:44px;object-fit:cover;border-radius:8px;margin-right:0.5rem;vertical-align:middle;background:#1c2430}",
      ".meal-card{margin-top:0.75rem}",
      ".meal-items{list-style:none;margin:0;padding:0}",
      ".meal-row{display:flex;gap:0.6rem;align-items:center;padding:0.45rem 0;border-top:1px solid rgba(255,255,255,0.08)}",
      ".meal-row .item-title{font-size:0.92rem}",
      ".meal-photo{width:64px;height:64px;object-fit:cover;border-radius:10px;background:#1c2430;flex:none}",
      ".meal-row .price{margin-left:auto;white-space:nowrap}",
      ".meal-foot{display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-top:0.4rem}",
      ".chip.is-on{outline:2px solid var(--accent,#3ecf8e)}",
      "#deals td .item-photo{float:left}"
    ].join("");
    document.head.appendChild(style);
    Promise.all([
      fetch("data/meals.json").then(function (r) { return r.json(); }),
      fetch("data/food-images.json").then(function (r) { return r.json(); }).catch(function () { return { images: {} }; }),
      loadCatalog()
    ]).then(function (all) {
      photos = all[1] || { images: {} };
      deals = all[2] || [];
      mount(all[0]);
    }).catch(function (err) { console.error(err); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
