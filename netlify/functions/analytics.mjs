// Netlify Function — reads GA4 data for the private /analytics.html dashboard.
// Required Netlify environment variables:
//   DASHBOARD_PASSWORD   e.g. 0246
//   GA_PROPERTY_ID       numeric GA4 property id (Admin → Property settings)
//   GA_CLIENT_EMAIL      service-account email
//   GA_PRIVATE_KEY       service-account private key (paste the full "-----BEGIN PRIVATE KEY-----..." value)
import crypto from 'node:crypto';

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

const b64url = (input) => Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function getAccessToken(email, key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = signer.sign(key).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${sig}` })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('token: ' + JSON.stringify(data));
  return data.access_token;
}

const iso = (d) => d.toISOString().slice(0, 10);
const shift = (d, days) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + days); return x; };

function ranges(range, from, to) {
  switch (range) {
    case 'yesterday': return { cur: { startDate: 'yesterday', endDate: 'yesterday' }, prev: { startDate: '2daysAgo', endDate: '2daysAgo' }, hourly: true };
    case '7d': return { cur: { startDate: '6daysAgo', endDate: 'today' }, prev: { startDate: '13daysAgo', endDate: '7daysAgo' }, hourly: false };
    case '30d': return { cur: { startDate: '29daysAgo', endDate: 'today' }, prev: { startDate: '59daysAgo', endDate: '30daysAgo' }, hourly: false };
    case 'custom': {
      const s = new Date(from + 'T00:00:00Z'), e = new Date(to + 'T00:00:00Z');
      if (isNaN(s) || isNaN(e) || e < s) throw new Error('bad_range');
      const len = Math.round((e - s) / 86400000) + 1;
      return { cur: { startDate: iso(s), endDate: iso(e) }, prev: { startDate: iso(shift(s, -len)), endDate: iso(shift(s, -1)) }, hourly: len === 1 };
    }
    default: return { cur: { startDate: 'today', endDate: 'today' }, prev: { startDate: 'yesterday', endDate: 'yesterday' }, hourly: true };
  }
}

const num = (v) => Number(v || 0);

export default async (req) => {
  const env = process.env;
  const key = req.headers.get('x-dash-key') || '';
  if (!env.DASHBOARD_PASSWORD) return json(500, { error: 'not_configured' });
  if (key !== env.DASHBOARD_PASSWORD) return json(401, { error: 'unauthorized' });
  if (!env.GA_PROPERTY_ID || !env.GA_CLIENT_EMAIL || !env.GA_PRIVATE_KEY) return json(500, { error: 'not_configured' });

  try {
    const url = new URL(req.url);
    const { cur, prev, hourly } = ranges(url.searchParams.get('range') || 'today', url.searchParams.get('from'), url.searchParams.get('to'));
    const token = await getAccessToken(env.GA_CLIENT_EMAIL, env.GA_PRIVATE_KEY.replace(/\\n/g, '\n'));
    const timeDim = hourly ? 'hour' : 'date';

    const body = {
      requests: [
        { dateRanges: [cur, prev], metrics: ['sessions', 'totalUsers', 'newUsers', 'averageSessionDuration', 'screenPageViews', 'engagementRate'].map(name => ({ name })) },
        { dateRanges: [cur], dimensions: [{ name: timeDim }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }], orderBys: [{ dimension: { dimensionName: timeDim } }] },
        { dateRanges: [cur], dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }] },
        { dateRanges: [cur], dimensions: [{ name: 'country' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 },
        { dateRanges: [cur], dimensions: [{ name: 'eventName' }, { name: 'linkUrl' }], metrics: [{ name: 'eventCount' }],
          dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['click', 'form_submit'] } } },
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 20 }
      ]
    };

    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${env.GA_PROPERTY_ID}:batchRunReports`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) return json(502, { error: 'ga_error', detail: data.error?.message });
    const [rTot, rSeries, rDev, rCountry, rClicks] = data.reports;

    const pick = (rangeName) => {
      const row = (rTot.rows || []).find(r => r.dimensionValues?.[0]?.value === rangeName) || { metricValues: [] };
      const m = row.metricValues.map(v => num(v.value));
      return { sessions: m[0] || 0, users: m[1] || 0, newUsers: m[2] || 0, avgDuration: m[3] || 0, pageviews: m[4] || 0, engagementRate: m[5] || 0 };
    };

    let series = (rSeries.rows || []).map(r => ({ key: r.dimensionValues[0].value, sessions: num(r.metricValues[0].value), users: num(r.metricValues[1].value) }));
    if (hourly) {
      const byHour = Object.fromEntries(series.map(s => [Number(s.key), s]));
      series = Array.from({ length: 24 }, (_, h) => ({ key: String(h), sessions: byHour[h]?.sessions || 0, users: byHour[h]?.users || 0 }));
    }

    return json(200, {
      hourly,
      totals: pick('date_range_0'),
      prev: pick('date_range_1'),
      series,
      devices: (rDev.rows || []).map(r => ({ name: r.dimensionValues[0].value, sessions: num(r.metricValues[0].value), users: num(r.metricValues[1].value) })),
      countries: (rCountry.rows || []).map(r => ({ name: r.dimensionValues[0].value, sessions: num(r.metricValues[0].value) })),
      clicks: (rClicks.rows || []).map(r => ({ event: r.dimensionValues[0].value, url: r.dimensionValues[1].value, count: num(r.metricValues[0].value) }))
    });
  } catch (e) {
    return json(500, { error: e.message === 'bad_range' ? 'bad_range' : 'server_error', detail: String(e.message || e) });
  }
};
