/** Load the Redding pickup catalog when present, otherwise keep normal data fetches. */
(function () {
  var orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url;
    if (typeof url === 'string' && /(^|\/)data\/deals\.json$/.test(url)) {
      return orig('data/catalog/manifest.json', init).then(function (res) {
        if (!res.ok) throw new Error('no manifest');
        return res.json();
      }).then(function (manifest) {
        var parts = manifest.parts || [];
        return Promise.all(parts.map(function (path) {
          return orig(path, init).then(function (r) {
            return r.ok ? r.json() : { deals: [] };
          }).catch(function () {
            return { deals: [] };
          });
        })).then(function (chunks) {
          var deals = [];
          chunks.forEach(function (chunk) {
            deals = deals.concat((chunk && chunk.deals) || []);
          });
          return new Response(JSON.stringify({
            generated_at: manifest.generated_at,
            count: deals.length,
            disclaimer: manifest.disclaimer,
            deals: deals
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
      }).catch(function () {
        return orig(input, init);
      });
    }
    return orig(input, init);
  };
})();
