/* Department and item-type names from public pages. No invented prices. */
(function () {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function boot(pack) {
    if (document.getElementById("departments")) return;
    var nav = document.querySelector("header nav");
    if (nav && !nav.querySelector('a[href="#departments"]')) {
      var a = document.createElement("a");
      a.href = "#departments";
      a.textContent = "Departments";
      var stores = nav.querySelector('a[href="#stores"]');
      nav.insertBefore(a, stores || null);
    }
    var html = '<h3 class="section-title">Departments and item types</h3><p class="sub section-sub">' + esc(pack.note) + "</p>";
    (pack.stores || []).forEach(function (store) {
      html += '<article class="card" style="margin-top:0.75rem"><h3>' + esc(store.name) + "</h3>";
      html += '<p class="sub">' + esc(store.address) + "</p>";
      if (store.price_note) html += '<p class="sub">' + esc(store.price_note) + "</p>";
      (store.locations || []).forEach(function (loc) {
        html += '<p class="item-meta"><a href="' + esc(loc.url) + '">' + esc(loc.name) + "</a> · " + esc(loc.address) + "</p>";
      });
      (store.groups || []).forEach(function (g) {
        html += '<p class="item-meta">' + esc(g.heading);
        if (g.source) html += ' · <a href="' + esc(g.source) + '">source</a>';
        html += "</p><ul>";
        (g.departments || []).forEach(function (d) {
          var types = (d.types || []).filter(Boolean).join(", ");
          html += "<li><strong>" + esc(d.name) + "</strong>" + (types ? " — " + esc(types) : "") + "</li>";
        });
        html += "</ul>";
      });
      html += "</article>";
    });
    var section = document.createElement("section");
    section.id = "departments";
    section.className = "section";
    section.innerHTML = html;
    var anchor = document.getElementById("stores") || document.getElementById("deals");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor);
    else {
      var main = document.querySelector("main");
      if (main) main.appendChild(section);
    }
  }

  function start() {
    fetch("data/departments.json").then(function (r) {
      if (!r.ok) throw new Error("departments");
      return r.json();
    }).then(boot).catch(function (err) { console.error(err); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
