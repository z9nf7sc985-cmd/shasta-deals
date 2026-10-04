(function () {
  'use strict';
  function inStock(deal) {
    if (!deal) return false;
    if (deal.in_stock === false || deal.in_stock === 0 || deal.in_stock === 'false') return false;
    var stock = String(deal.stock || deal.availability || '').toLowerCase();
    return !/out of stock|unavailable|sold out|not available/.test(stock);
  }
  function install() {
    var api = window.ShastaHeuristics;
    if (!api || typeof api.assignBestStore !== 'function' || api.assignBestStore.__stockWrapped) return;
    var orig = api.assignBestStore;
    function wrapped(itemName, deals, stores, quantityOrOptions) {
      var available = (deals || []).filter(inStock);
      return orig.call(this, itemName, available, stores, quantityOrOptions);
    }
    wrapped.__stockWrapped = true;
    api.assignBestStore = wrapped;
  }
  install();
})();
