/** Rewrites relative data/* fetches to the repo CDN so Pages /docs works before docs/data is fully mirrored. */
(function () {
  var BASE = 'https://cdn.jsdelivr.net/gh/z9nf7sc985-cmd/shasta-deals@main/';
  var orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url;
    if (typeof url === 'string' && /^data\//.test(url)) {
      return orig(BASE + url, init);
    }
    return orig(input, init);
  };
})();
