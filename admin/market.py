"""Busca preços públicos em Shopee, Mercado Livre e Temu a partir do título do MakerWorld."""
from __future__ import annotations

import html as htmllib
import json
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from statistics import median

UA_GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
UA_FACEBOOK = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
UA_BROWSER = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

NOISE = re.compile(
    r"\b("
    r"print[\s-]?in[\s-]?place|no[\s-]?supports?|supports?[\s-]?needed|"
    r"stl|3mf|gcode|fdm|sla|ams|bambu(?:lab)?|remix|printable|"
    r"3d[\s-]?print(?:ed|ing)?|makerworld|printables|"
    r"v\d+(?:\.\d+)?|updated|remix(?:ed)?"
    r")\b",
    re.I,
)
TRANSLATE = [
    ("articulated", "articulado"),
    ("dragon", "dragão"),
    ("flexi", "flexível"),
    ("flexible", "flexível"),
    ("fidget", "fidget"),
    ("keychain", "chaveiro"),
    ("octopus", "polvo"),
    ("dinosaur", "dinossauro"),
    ("cat", "gato"),
    ("kitten", "gatinho"),
    ("dog", "cachorro"),
    ("fox", "raposa"),
    ("lizard", "lagarto"),
    ("snake", "cobra"),
    ("turtle", "tartaruga"),
    ("axolotl", "axolotl"),
    ("holder", "suporte"),
    ("stand", "suporte"),
    ("planter", "vaso"),
    ("vase", "vaso"),
    ("phone", "celular"),
    ("headphone", "fone"),
    ("crystal", "cristal"),
    ("egg", "ovo"),
    ("wing", "asa"),
    ("flying", "voador"),
    ("cute", "fofo"),
    ("mini", "mini"),
    ("low poly", "low poly"),
]


def _strip_tags(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw or "")
    text = htmllib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_brl(raw: str) -> float | None:
    s = str(raw or "").strip()
    s = re.sub(r"[^\d,.\-]", "", s)
    if not s:
        return None
    if s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    elif s.count(",") == 1 and s.count(".") >= 1:
        s = s.replace(".", "").replace(",", ".")
    try:
        n = float(s)
    except ValueError:
        return None
    return n if 4.0 <= n <= 800.0 else None


def _money_parts(frac: str, cents: str = "") -> float | None:
    whole = re.sub(r"[^\d]", "", frac or "")
    frac_part = re.sub(r"[^\d]", "", cents or "")
    if not whole:
        return None
    val = float(int(whole))
    if frac_part:
        val += int(frac_part.ljust(2, "0")[:2]) / 100.0
    return val if 4.0 <= val <= 800.0 else None


def clean_query(title: str) -> str:
    text = _strip_tags(title)
    text = NOISE.sub(" ", text)
    text = re.sub(r"[|/_\-–—]+", " ", text)
    text = re.sub(r"[^\w\sÀ-ÿ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    lower = text.lower()
    words: list[str] = []
    used = set()
    for en, pt in TRANSLATE:
        if en in lower and pt not in used:
            words.append(pt)
            used.add(pt)
    leftover = [w for w in text.split() if len(w) > 2 and w.lower() not in {en for en, _ in TRANSLATE}]
    for w in leftover:
        key = w.lower()
        if key not in used and key not in {"the", "and", "for", "with", "from"}:
            words.append(w)
            used.add(key)
        if len(words) >= 7:
            break
    if not any("impress" in w.lower() or w.lower() == "3d" for w in words):
        words.append("impressão 3d")
    return " ".join(words[:8]).strip()


def _get(url: str, ua: str, extra: dict | None = None, timeout: int = 18) -> str:
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
    }
    if extra:
        headers.update(extra)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read(900000)
        return raw.decode("utf-8", "replace")


def _stats(listings: list[dict]) -> dict:
    prices = sorted(x["price"] for x in listings if isinstance(x.get("price"), (int, float)))
    if not prices:
        return {"count": 0, "min": None, "max": None, "median": None}
    return {
        "count": len(prices),
        "min": round(prices[0], 2),
        "max": round(prices[-1], 2),
        "median": round(float(median(prices)), 2),
    }


def _pack(mid: str, label: str, search_url: str, listings: list[dict], error: str = "") -> dict:
    seen = set()
    uniq: list[dict] = []
    for item in listings:
        key = (round(float(item["price"]), 2), re.sub(r"\W+", "", (item.get("title") or "").lower())[:40])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(item)
        if len(uniq) >= 8:
            break
    body = {
        "id": mid,
        "label": label,
        "ok": bool(uniq) and not error,
        "searchUrl": search_url,
        "listings": uniq,
        "error": error,
    }
    body.update(_stats(uniq))
    if uniq:
        body["ok"] = True
        body["error"] = ""
    return body


def search_mercadolivre(query: str) -> dict:
    slug = unicodedata.normalize("NFKD", query)
    slug = "".join(c for c in slug if not unicodedata.combining(c))
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", slug).strip("-").lower() or "impressao-3d"
    search_url = "https://lista.mercadolivre.com.br/" + slug
    try:
        html = _get(search_url, UA_GOOGLEBOT)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return _pack("mercadolivre", "Mercado Livre", search_url, [], str(exc)[:160])
    if "suspicious-traffic" in html:
        return _pack("mercadolivre", "Mercado Livre", search_url, [], "Mercado Livre bloqueou a leitura")
    listings = []
    for card in re.findall(r'<li class="ui-search-layout__item">(.*?)</li>', html, re.S):
        title_m = re.search(r'class="poly-component__title[^"]*"[^>]*>(.*?)</a>', card, re.S)
        href_m = re.search(r'href="(https://www\.mercadolivre\.com\.br/[^"]+)"', card)
        frac_m = re.search(r"andes-money-amount__fraction[^>]*>([^<]+)<", card)
        cents_m = re.search(r"andes-money-amount__cents[^>]*>([^<]+)<", card)
        price = _money_parts(frac_m.group(1) if frac_m else "", cents_m.group(1) if cents_m else "")
        title = _strip_tags(title_m.group(1) if title_m else "")
        href = htmllib.unescape(href_m.group(1) if href_m else "").split("#")[0]
        if price and title and href and "lista.mercadolivre" not in href:
            listings.append({"title": title[:140], "price": round(price, 2), "url": href})
    return _pack("mercadolivre", "Mercado Livre", search_url, listings, "" if listings else "sem anúncios legíveis")


def search_shopee(query: str) -> dict:
    search_url = "https://shopee.com.br/search?keyword=" + urllib.parse.quote(query)
    try:
        html = _get(
            search_url,
            UA_FACEBOOK,
            extra={"Referer": "https://shopee.com.br/", "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"},
        )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return _pack("shopee", "Shopee", search_url, [], str(exc)[:160])
    titles = [_strip_tags(t) for t in re.findall(r'line-clamp-2[^"]*"[^>]*>(.*?)</div>', html, re.S)]
    titles = [t for t in titles if len(t) >= 8]
    prices = [_parse_brl(p) for p in re.findall(
        r'aria-label="promotion price".*?<span class="truncate text-base/5 font-medium">([\d\.,]+)</span>',
        html,
        re.S,
    )]
    if not prices:
        prices = [_parse_brl(p) for p in re.findall(
            r'<span class="font-medium mr-px text-xs/sp14">R\$</span><span class="truncate text-base/5 font-medium">([\d\.,]+)</span>',
            html,
        )]
    prices = [p for p in prices if p is not None]
    urls: list[str] = []
    for m in re.finditer(r'<script[^>]*>(\{.*?ItemList.*?\})</script>', html, re.S):
        try:
            data = json.loads(m.group(1))
            urls = [str(x.get("url") or "") for x in (data.get("itemListElement") or []) if x.get("url")]
            if urls:
                break
        except json.JSONDecodeError:
            continue
    if not urls:
        seen: list[str] = []
        for shop_item in re.findall(r"i\.(\d+\.\d+)", html):
            u = "https://shopee.com.br/-i." + shop_item
            if u not in seen:
                seen.append(u)
        urls = seen
    listings = []
    n = min(len(titles), len(prices))
    for i in range(n):
        listings.append({
            "title": titles[i][:140],
            "price": round(prices[i], 2),
            "url": urls[i] if i < len(urls) else search_url,
        })
    return _pack("shopee", "Shopee", search_url, listings, "" if listings else "Shopee não devolveu anúncios")


def search_temu(query: str) -> dict:
    search_url = "https://www.temu.com/search_result.html?search_key=" + urllib.parse.quote(query)
    html = ""
    err = ""
    for ua in (UA_FACEBOOK, UA_GOOGLEBOT, UA_BROWSER):
        try:
            html = _get(search_url, ua, timeout=12)
            if html and ("R$" in html or re.search(r"\$\s*\d", html)):
                break
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            err = str(exc)[:160]
            html = ""
    listings = []
    if html:
        titles = [_strip_tags(t) for t in re.findall(r'<img[^>]+alt="([^"]{8,160})"', html)]
        prices = [_parse_brl(p) for p in re.findall(r"(?:R\$|US\$|\$)\s*([\d\.,]+)", html)]
        prices = [p for p in prices if p is not None]
        n = min(len(titles), len(prices))
        for i in range(n):
            listings.append({"title": titles[i][:140], "price": round(prices[i], 2), "url": search_url})
    if listings:
        return _pack("temu", "Temu", search_url, listings)
    return _pack(
        "temu",
        "Temu",
        search_url,
        [],
        err or "Temu bloqueia leitura automática. Abra a busca para ver os preços.",
    )


def market_lookup(title: str) -> dict:
    raw = (title or "").strip()
    query = clean_query(raw)
    if not query:
        return {"ok": False, "error": "sem termo de busca", "query": "", "title": raw, "marketplaces": [], "all": _stats([])}
    with ThreadPoolExecutor(max_workers=3) as pool:
        fut_ml = pool.submit(search_mercadolivre, query)
        fut_sh = pool.submit(search_shopee, query)
        fut_tm = pool.submit(search_temu, query)
        marketplaces = [fut_sh.result(), fut_ml.result(), fut_tm.result()]
    combined = []
    for m in marketplaces:
        for item in m.get("listings") or []:
            combined.append({**item, "marketplace": m["id"], "label": m["label"]})
    return {
        "ok": any(m.get("ok") for m in marketplaces),
        "query": query,
        "title": raw,
        "marketplaces": marketplaces,
        "all": _stats(combined),
        "listings": combined[:24],
    }
