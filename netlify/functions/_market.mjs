// Busca preços em Shopee, Mercado Livre e Temu a partir do título do MakerWorld.
const UA_GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_FACEBOOK = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const NOISE = /\b(print[\s-]?in[\s-]?place|no[\s-]?supports?|supports?[\s-]?needed|stl|3mf|gcode|fdm|sla|ams|bambu(?:lab)?|remix|printable|3d[\s-]?print(?:ed|ing)?|makerworld|printables|v\d+(?:\.\d+)?|updated)\b/gi;
const TRANSLATE = [
  ['articulated', 'articulado'], ['dragon', 'dragão'], ['flexi', 'flexível'],
  ['flexible', 'flexível'], ['fidget', 'fidget'], ['keychain', 'chaveiro'],
  ['octopus', 'polvo'], ['dinosaur', 'dinossauro'], ['cat', 'gato'],
  ['kitten', 'gatinho'], ['dog', 'cachorro'], ['fox', 'raposa'],
  ['lizard', 'lagarto'], ['snake', 'cobra'], ['turtle', 'tartaruga'],
  ['axolotl', 'axolotl'], ['holder', 'suporte'], ['stand', 'suporte'],
  ['planter', 'vaso'], ['vase', 'vaso'], ['phone', 'celular'],
  ['headphone', 'fone'], ['crystal', 'cristal'], ['egg', 'ovo'],
  ['wing', 'asa'], ['flying', 'voador'], ['cute', 'fofo'], ['mini', 'mini']
];

function stripTags(raw) {
  return String(raw || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function parseBrl(raw) {
  let s = String(raw || '').replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  if ((s.match(/,/g) || []).length === 1 && !s.includes('.')) s = s.replace(',', '.');
  else if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 4 && n <= 800 ? n : null;
}

function moneyParts(frac, cents) {
  const whole = String(frac || '').replace(/[^\d]/g, '');
  const part = String(cents || '').replace(/[^\d]/g, '');
  if (!whole) return null;
  let val = parseInt(whole, 10);
  if (part) val += parseInt(part.padEnd(2, '0').slice(0, 2), 10) / 100;
  return val >= 4 && val <= 800 ? val : null;
}

export function cleanQuery(title) {
  let text = stripTags(title).replace(NOISE, ' ').replace(/[|/_\-–—]+/g, ' ')
    .replace(/[^\w\sÀ-ÿ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  const words = [];
  const used = new Set();
  for (const [en, pt] of TRANSLATE) {
    if (lower.includes(en) && !used.has(pt)) { words.push(pt); used.add(pt); }
  }
  const skip = new Set(['the', 'and', 'for', 'with', 'from', ...TRANSLATE.map((x) => x[0])]);
  for (const w of text.split(' ')) {
    const key = w.toLowerCase();
    if (w.length > 2 && !used.has(key) && !skip.has(key)) { words.push(w); used.add(key); }
    if (words.length >= 7) break;
  }
  if (!words.some((w) => /impress/i.test(w) || w.toLowerCase() === '3d')) words.push('impressão 3d');
  return words.slice(0, 8).join(' ').trim();
}

function stats(listings) {
  const prices = listings.map((x) => x.price).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!prices.length) return { count: 0, min: null, max: null, median: null };
  const mid = Math.floor(prices.length / 2);
  const med = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return { count: prices.length, min: round2(prices[0]), max: round2(prices[prices.length - 1]), median: round2(med) };
}

function round2(n) { return Math.round(n * 100) / 100; }

function pack(id, label, searchUrl, listings, error) {
  const seen = new Set();
  const uniq = [];
  for (const item of listings) {
    const key = round2(item.price) + '|' + String(item.title || '').toLowerCase().replace(/\W+/g, '').slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(item);
    if (uniq.length >= 8) break;
  }
  return { id, label, ok: uniq.length > 0, searchUrl, listings: uniq, error: uniq.length ? '' : (error || 'sem anúncios'), ...stats(uniq) };
}

async function getHtml(url, ua, extra) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      ...(extra || {})
    }
  });
  return r.text();
}

async function searchMercadoLivre(query) {
  const slug = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'impressao-3d';
  const searchUrl = 'https://lista.mercadolivre.com.br/' + slug;
  let html = '';
  try { html = await getHtml(searchUrl, UA_GOOGLEBOT); }
  catch (e) { return pack('mercadolivre', 'Mercado Livre', searchUrl, [], String(e.message || e).slice(0, 160)); }
  if (html.includes('suspicious-traffic')) return pack('mercadolivre', 'Mercado Livre', searchUrl, [], 'Mercado Livre bloqueou a leitura');
  const listings = [];
  const cards = html.split('<li class="ui-search-layout__item">').slice(1);
  for (const card of cards) {
    const titleM = card.match(/class="poly-component__title[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const hrefM = card.match(/href="(https:\/\/www\.mercadolivre\.com\.br\/[^"]+)"/);
    const fracM = card.match(/andes-money-amount__fraction[^>]*>([^<]+)</);
    const centsM = card.match(/andes-money-amount__cents[^>]*>([^<]+)</);
    const price = moneyParts(fracM && fracM[1], centsM && centsM[1]);
    const title = stripTags(titleM ? titleM[1] : '');
    const href = hrefM ? hrefM[1].replace(/&amp;/g, '&').split('#')[0] : '';
    if (price && title && href && !href.includes('lista.mercadolivre')) listings.push({ title: title.slice(0, 140), price: round2(price), url: href });
  }
  return pack('mercadolivre', 'Mercado Livre', searchUrl, listings, listings.length ? '' : 'sem anúncios legíveis');
}

async function searchShopee(query) {
  const searchUrl = 'https://shopee.com.br/search?keyword=' + encodeURIComponent(query);
  let html = '';
  try { html = await getHtml(searchUrl, UA_FACEBOOK, { Referer: 'https://shopee.com.br/' }); }
  catch (e) { return pack('shopee', 'Shopee', searchUrl, [], String(e.message || e).slice(0, 160)); }
  const titles = [];
  const titleRe = /line-clamp-2[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = titleRe.exec(html))) {
    const t = stripTags(m[1]);
    if (t.length >= 8) titles.push(t);
  }
  const prices = [];
  const priceRe = /aria-label="promotion price"[\s\S]*?<span class="truncate text-base\/5 font-medium">([\d.,]+)<\/span>/g;
  while ((m = priceRe.exec(html))) {
    const p = parseBrl(m[1]);
    if (p != null) prices.push(p);
  }
  if (!prices.length) {
    const alt = /<span class="font-medium mr-px text-xs\/sp14">R\$<\/span><span class="truncate text-base\/5 font-medium">([\d.,]+)<\/span>/g;
    while ((m = alt.exec(html))) {
      const p = parseBrl(m[1]);
      if (p != null) prices.push(p);
    }
  }
  const urls = [];
  const ld = html.match(/<script[^>]*>(\{[\s\S]*?"ItemList"[\s\S]*?\})<\/script>/);
  if (ld) {
    try {
      const data = JSON.parse(ld[1]);
      for (const x of data.itemListElement || []) if (x.url) urls.push(String(x.url));
    } catch (_) {}
  }
  if (!urls.length) {
    const seen = new Set();
    const idRe = /i\.(\d+\.\d+)/g;
    while ((m = idRe.exec(html))) {
      const u = 'https://shopee.com.br/-i.' + m[1];
      if (!seen.has(u)) { seen.add(u); urls.push(u); }
    }
  }
  const n = Math.min(titles.length, prices.length);
  const listings = [];
  for (let i = 0; i < n; i++) listings.push({ title: titles[i].slice(0, 140), price: round2(prices[i]), url: urls[i] || searchUrl });
  return pack('shopee', 'Shopee', searchUrl, listings, listings.length ? '' : 'Shopee não devolveu anúncios');
}

async function searchTemu(query) {
  const searchUrl = 'https://www.temu.com/search_result.html?search_key=' + encodeURIComponent(query);
  let html = '';
  let err = '';
  for (const ua of [UA_FACEBOOK, UA_GOOGLEBOT, UA_BROWSER]) {
    try {
      html = await getHtml(searchUrl, ua);
      if (html && (html.includes('R$') || /\$\s*\d/.test(html))) break;
    } catch (e) { err = String(e.message || e).slice(0, 160); html = ''; }
  }
  const listings = [];
  if (html) {
    const titles = [];
    const tRe = /<img[^>]+alt="([^"]{8,160})"/g;
    let m;
    while ((m = tRe.exec(html))) titles.push(stripTags(m[1]));
    const prices = [];
    const pRe = /(?:R\$|US\$|\$)\s*([\d.,]+)/g;
    while ((m = pRe.exec(html))) {
      const p = parseBrl(m[1]);
      if (p != null) prices.push(p);
    }
    const n = Math.min(titles.length, prices.length);
    for (let i = 0; i < n; i++) listings.push({ title: titles[i].slice(0, 140), price: round2(prices[i]), url: searchUrl });
  }
  if (listings.length) return pack('temu', 'Temu', searchUrl, listings);
  return pack('temu', 'Temu', searchUrl, [], err || 'Temu bloqueia leitura automática. Abra a busca para ver os preços.');
}

export async function marketLookup(title) {
  const raw = String(title || '').trim();
  const query = cleanQuery(raw);
  if (!query) return { ok: false, error: 'sem termo de busca', query: '', title: raw, marketplaces: [], all: stats([]), listings: [] };
  const [shopee, ml, temu] = await Promise.all([searchShopee(query), searchMercadoLivre(query), searchTemu(query)]);
  const marketplaces = [shopee, ml, temu];
  const combined = [];
  for (const m of marketplaces) for (const item of m.listings || []) combined.push({ ...item, marketplace: m.id, label: m.label });
  return { ok: marketplaces.some((m) => m.ok), query, title: raw, marketplaces, all: stats(combined), listings: combined.slice(0, 24) };
}
