// Cloudflare Worker:
//   GET /?id=<modelo>     -> tempo e gramas do MakerWorld
//   GET /market?q=<título> -> preços na Shopee, Mercado Livre e Temu
// Usado pela calculadora da Minted no site publicado (o Netlify é bloqueado pelo MakerWorld).
import { marketLookup } from './market.js';

const ALLOWED = [/^https:\/\/(www\.)?minted\.com\.br$/, /\.netlify\.app$/, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/];

const MW_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'application/json, text/html;q=0.9, */*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Referer': 'https://makerworld.com/'
};

const compact = (d) => ({
  ok: true,
  id: d.id,
  title: d.title || '',
  defaultInstanceId: d.defaultInstanceId,
  instances: (d.instances || []).map((i) => ({
    id: i.id, profileId: i.profileId, title: i.title || '',
    prediction: i.prediction || 0, weight: i.weight || 0
  }))
});

function cors(origin) {
  const ok = origin && ALLOWED.some((re) => re.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://www.minted.com.br',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  };
}

function reply(code, body, origin) {
  return new Response(JSON.stringify(body), {
    status: code,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': code === 200 ? 'public, max-age=86400' : 'no-store',
      ...cors(origin)
    }
  });
}

async function lookup(id) {
  const errors = [];
  try {
    const r = await fetch('https://makerworld.com/api/v1/design-service/design/' + id, { headers: MW_HEADERS });
    if (r.ok) {
      const d = await r.json();
      if (d && d.instances && d.instances.length) return compact(d);
      errors.push('api sem perfis');
    } else errors.push('api ' + r.status);
  } catch (e) { errors.push('api: ' + e.message); }
  try {
    const r = await fetch('https://makerworld.com/pt/models/' + id, { headers: MW_HEADERS });
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      const d = JSON.parse(m[1]).props?.pageProps?.design;
      if (d && d.instances && d.instances.length) return compact(d);
    }
    errors.push('página ' + r.status);
  } catch (e) { errors.push('página: ' + e.message); }
  return { ok: false, error: errors.join('; ').slice(0, 200) };
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/market') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q || q.length > 180) return reply(400, { ok: false, error: 'termo inválido' }, origin);
      const cacheKey = new Request('https://cache.minted/market/' + encodeURIComponent(q.toLowerCase()));
      const hit = await caches.default.match(cacheKey);
      if (hit) return reply(200, await hit.json(), origin);
      const result = await marketLookup(q);
      if (result.ok) {
        ctx.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' }
        })));
        return reply(200, result, origin);
      }
      return reply(502, result, origin);
    }

    const id = url.searchParams.get('id') || '';
    if (!/^\d{1,12}$/.test(id)) return reply(400, { ok: false, error: 'id inválido' }, origin);

    // Cache de 1 dia na borda do Cloudflare (por modelo).
    const cacheKey = new Request('https://cache.minted/mw/' + id);
    const hit = await caches.default.match(cacheKey);
    if (hit) return reply(200, await hit.json(), origin);

    const result = await lookup(id);
    if (result.ok) {
      ctx.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' }
      })));
      return reply(200, result, origin);
    }
    return reply(502, result, origin);
  }
};
