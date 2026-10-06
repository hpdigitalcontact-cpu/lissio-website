/* Field Pilot — Supabase client (public, safe to ship) */
(function () {
  var URL = 'https://hgelspdlugknazuqnygg.supabase.co';
  var KEY = 'sb_publishable_NGlQXNGiNXe12q6zrVgTvA_EPO1JBAd';
  function make() {
    if (window.fpdb) return window.fpdb;
    if (window.supabase && window.supabase.createClient) {
      window.fpdb = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      return window.fpdb;
    }
    return null;
  }
  window.getFPDB = function () {
    return new Promise(function (resolve) {
      var tries = 0;
      (function attempt() {
        var c = make();
        if (c || tries++ > 120) return resolve(c);
        setTimeout(attempt, 50);
      })();
    });
  };
  window.fpIsLiveHost = function () {
    return /(^|\.)field-pilot\.co$/.test(location.hostname);
  };
})();
