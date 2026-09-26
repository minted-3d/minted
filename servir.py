"""Servidor local da Minted: site estático + API da calculadora."""
from __future__ import annotations

import gzip
import json
import re
import urllib.error
import urllib.request
import mimetypes
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
CALC = ROOT / "admin"
if str(CALC) not in sys.path:
    sys.path.insert(0, str(CALC))

import sheet_db  # noqa: E402
import market  # noqa: E402

PORT = 8000

MW_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip",
    "Referer": "https://makerworld.com/",
}


def _mw_get(url: str) -> str:
    req = urllib.request.Request(url, headers=MW_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as res:
        raw = res.read()
        if res.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return raw.decode("utf-8", "replace")


def _mw_compact(design: dict) -> dict:
    insts = []
    for i in design.get("instances") or []:
        insts.append(
            {
                "id": i.get("id"),
                "profileId": i.get("profileId"),
                "title": i.get("title") or "",
                "prediction": i.get("prediction") or 0,
                "weight": i.get("weight") or 0,
            }
        )
    return {
        "ok": True,
        "id": design.get("id"),
        "title": design.get("title") or "",
        "defaultInstanceId": design.get("defaultInstanceId"),
        "instances": insts,
    }


def makerworld_lookup(model_id: str) -> dict:
    if not re.fullmatch(r"\d{1,12}", model_id or ""):
        return {"ok": False, "error": "id inválido"}
    errors = []
    try:
        data = json.loads(_mw_get(f"https://makerworld.com/api/v1/design-service/design/{model_id}"))
        if isinstance(data, dict) and data.get("instances"):
            return _mw_compact(data)
        errors.append("api sem perfis")
    except (urllib.error.URLError, ValueError, OSError) as exc:
        errors.append(f"api: {exc}")
    try:
        html = _mw_get(f"https://makerworld.com/pt/models/{model_id}")
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
        if m:
            design = json.loads(m.group(1)).get("props", {}).get("pageProps", {}).get("design")
            if isinstance(design, dict) and design.get("instances"):
                return _mw_compact(design)
        errors.append("página sem dados")
    except (urllib.error.URLError, ValueError, OSError) as exc:
        errors.append(f"página: {exc}")
    return {"ok": False, "error": "; ".join(errors)[:200]}
NOINDEX = "noindex, nofollow, noarchive, nosnippet"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        path = urlparse(self.path).path.lower()
        bare = path.rstrip("/")
        if bare in ("/calculadora", "/admin") or path.startswith("/calculadora/") or path.startswith("/admin/"):
            self.send_header("X-Robots-Tag", NOINDEX)
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        text = raw.decode("utf-8") if raw else ""
        if ctype == "application/x-www-form-urlencoded":
            parsed = parse_qs(text, keep_blank_values=True)
            return {k: (v[0] if v else "") for k, v in parsed.items()}
        try:
            data = json.loads(text or "{}")
        except json.JSONDecodeError:
            data = {}
        return data if isinstance(data, dict) else {}

    def _confirm(self, data: dict):
        fields = data.get("fields") if isinstance(data.get("fields"), dict) else data
        if isinstance(fields.get("json"), str) and fields.get("json").startswith("{"):
            try:
                parsed = json.loads(fields["json"])
                if isinstance(parsed, dict):
                    fields = parsed
            except json.JSONDecodeError:
                pass
        result = sheet_db.confirm(fields)
        if result.get("local") and result.get("error") == "missing_webapp":
            result = dict(result)
            result["ok"] = True
        code = 200 if result.get("ok") or result.get("local") else 502
        return self._json(code, result)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/api/makerworld", "/calculadora/api/makerworld", "/admin/api/makerworld"):
            model_id = (parse_qs(parsed.query).get("id") or [""])[0]
            result = makerworld_lookup(model_id)
            return self._json(200 if result.get("ok") else 502, result)
        if path in ("/api/market", "/calculadora/api/market", "/admin/api/market"):
            query = (parse_qs(parsed.query).get("q") or [""])[0]
            result = market.market_lookup(query)
            return self._json(200 if result.get("ok") else 502, result)
        if path in ("/api/calc-config", "/calculadora/api/calc-config", "/admin/api/calc-config"):
            cfg = sheet_db.load_config()
            return self._json(
                200,
                {
                    "ok": True,
                    "webappUrl": cfg.get("webappUrl") or "",
                    "sheetId": cfg.get("sheetId") or sheet_db.SHEET_ID,
                    "sheetUrl": sheet_db.SHEET_URL,
                    "configured": bool(cfg.get("webappUrl")),
                },
            )
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        data = self._read_body()
        if path in ("/api/calc-config", "/calculadora/api/calc-config", "/admin/api/calc-config"):
            cfg = sheet_db.save_config(data)
            return self._json(
                200,
                {
                    "ok": True,
                    "webappUrl": cfg.get("webappUrl") or "",
                    "sheetId": cfg.get("sheetId") or sheet_db.SHEET_ID,
                    "sheetUrl": sheet_db.SHEET_URL,
                    "configured": bool(cfg.get("webappUrl")),
                },
            )
        if (
            path in ("/api/calc-confirm", "/calculadora/api/calc-confirm", "/admin/api/calc-confirm", "/admin", "/calculadora", "/")
            or path.endswith("/admin/index.html")
            or path.endswith("/calculadora/index.html")
            or data.get("form-name") == "minted-projetos"
        ):
            return self._confirm(data)
        self.send_error(404, "Not found")


def main():
    mimetypes.add_type("text/javascript", ".js")
    mimetypes.add_type("image/svg+xml", ".svg")
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Minted em http://127.0.0.1:{PORT}/")
    print(f"Calculadora em http://127.0.0.1:{PORT}/calculadora/")
    print(f"Ficha completa em http://127.0.0.1:{PORT}/admin/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")


if __name__ == "__main__":
    main()
