/* Field Pilot — first-party analytics (sessions, durations, CTA clicks). Live domain only. */
(function () {
  try {
    if (!/(^|\.)field-pilot\.co$/.test(location.hostname)) return;
    if (localStorage.getItem('fp_notrack') === '1') return;
  } catch (e) { return; }

  var URL = 'https://hgelspdlugknazuqnygg.supabase.co/rest/v1/fp_events';
  var KEY = 'sb_publishable_NGlQXNGiNXe12q6zrVgTvA_EPO1JBAd';
  var rid = function () { return Math.random().toString(36).slice(2) + Date.now().toString(36); };

  var vid = localStorage.getItem('fp_vid');
  if (!vid) { vid = rid(); localStorage.setItem('fp_vid', vid); }

  var now = Date.now();
  var sid = localStorage.getItem('fp_sid');
  var last = +localStorage.getItem('fp_sid_t') || 0;
  var q = new URLSearchParams(location.search);
  var ref = '';
  try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) {}
  if (/(^|\.)field-pilot\.co$/.test(ref) || /stripe\.com$/.test(ref)) ref = '';
  if (!sid || now - last > 30 * 60 * 1000 || q.get('utm_source')) {
    sid = rid();
    localStorage.setItem('fp_sid', sid);
    localStorage.setItem('fp_src', q.get('utm_source') || (q.get('fbclid') ? 'facebook' : '') || (q.get('gclid') ? 'google' : '') || '');
    localStorage.setItem('fp_camp', q.get('utm_campaign') || '');
    localStorage.setItem('fp_ref', ref);
  }
  var touch = function () { localStorage.setItem('fp_sid_t', String(Date.now())); };
  touch();

  var path = location.pathname.replace(/\/+$/, '');
  var page = /signup/.test(path) ? 'signup' : /login/.test(path) ? 'login' : /app/.test(path) ? 'crm' : /analytics/.test(path) ? 'analytics' : 'landing';
  var device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

  function send(type) {
    touch();
    var body = JSON.stringify({
      visitor_id: vid, session_id: sid, type: type, page: page,
      referrer: localStorage.getItem('fp_ref') || null,
      utm_source: localStorage.getItem('fp_src') || null,
      utm_campaign: localStorage.getItem('fp_camp') || null,
      device: device
    });
    try {
      fetch(URL, { method: 'POST', keepalive: true, headers: { 'apikey': KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: body });
    } catch (e) {}
  }
  window.fpTrack = send;

  send('pageview');

  var marks = [10, 30, 60, 120, 180, 300, 600, 900, 1800], i = 0, t0 = Date.now();
  setInterval(function () {
    if (document.hidden || i >= marks.length) return;
    if ((Date.now() - t0) / 1000 >= marks[i]) { i++; send('ping'); }
  }, 2000);

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (/signup/.test(h)) send('try_click');
    else if (/buy\.stripe\.com/.test(h)) send('checkout_click');
    else if (/wa\.me/.test(h)) send('whatsapp_click');
    else if (/calendly\.com/.test(h)) send('book_call');
  }, true);
})();
