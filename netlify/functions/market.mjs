// Netlify Function: /api/market?q=<título>
// Varre Shopee, Mercado Livre e Temu para comparar com o preço da calculadora.
import { marketLookup } from './_market.mjs';

const reply = (code, body) => new Response(JSON.stringify(body), {
  status: code,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600' }
});

export default async (req) => {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q || q.length > 180) return reply(400, { ok: false, error: 'termo inválido' });
  try {
    const result = await marketLookup(q);
    return reply(result.ok ? 200 : 502, result);
  } catch (e) {
    return reply(502, { ok: false, error: String(e.message || e).slice(0, 200) });
  }
};

export const config = { path: ['/api/market', '/calculadora/api/market'] };
