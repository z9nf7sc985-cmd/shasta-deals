(function () {
  Promise.all([
    fetch("js/meals-a.js").then(function (r) { if (!r.ok) throw new Error("meals-a"); return r.text(); }),
    fetch("js/meals-b.js").then(function (r) { if (!r.ok) throw new Error("meals-b"); return r.text(); })
  ]).then(function (parts) {
    var s = document.createElement("script");
    s.textContent = parts[0] + "\n" + parts[1];
    document.body.appendChild(s);
  }).catch(function (err) { console.error(err); });
})();
