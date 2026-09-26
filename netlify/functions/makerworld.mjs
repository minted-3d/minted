// Netlify Function: /api/makerworld?id=<modelo>
// Lê tempo de impressão (prediction, s) e peso (weight, g) de cada perfil do MakerWorld.
const HEADERS = {
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

const reply = (code, body) => new Response(JSON.stringify(body), {
  status: code,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600' }
});

export default async (req) => {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^\d{1,12}$/.test(id)) return reply(400, { ok: false, error: 'id inválido' });
  const errors = [];
  try {
    const r = await fetch('https://makerworld.com/api/v1/design-service/design/' + id, { headers: HEADERS });
    if (r.ok) {
      const d = await r.json();
      if (d && d.instances && d.instances.length) return reply(200, compact(d));
      errors.push('api sem perfis');
    } else errors.push('api ' + r.status);
  } catch (e) { errors.push('api: ' + e.message); }
  try {
    const r = await fetch('https://makerworld.com/pt/models/' + id, { headers: HEADERS });
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      const d = JSON.parse(m[1]).props?.pageProps?.design;
      if (d && d.instances && d.instances.length) return reply(200, compact(d));
    }
    errors.push('página ' + r.status);
  } catch (e) { errors.push('página: ' + e.message); }
  return reply(502, { ok: false, error: errors.join('; ').slice(0, 200) });
};

export const config = { path: ['/api/makerworld', '/calculadora/api/makerworld'] };
