"""Grava ficha da calculadora na planilha Google e no jsonl local."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
LOG_PATH = ROOT / "banco-projetos.jsonl"
SHEET_ID = "1zTLYjV0DHYYG1OI36FdBoEgLok5eLnPc9nVRxm9NdCQ"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {"sheetId": SHEET_ID, "webappUrl": ""}
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {}
    data.setdefault("sheetId", SHEET_ID)
    data.setdefault("webappUrl", "")
    return data


def save_config(data: dict) -> dict:
    cfg = load_config()
    if "webappUrl" in data:
        cfg["webappUrl"] = str(data.get("webappUrl") or "").strip()
    if "sheetId" in data and data["sheetId"]:
        cfg["sheetId"] = str(data["sheetId"]).strip()
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


def append_local(payload: dict) -> None:
    row = {
        "saved_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        **payload,
    }
    with LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def post_webapp(url: str, payload: dict) -> dict:
    body = json.dumps({"fields": payload}, ensure_ascii=False).encode("utf-8")
    req = Request(
        url,
        data=body,
        headers={"Content-Type": "text/plain;charset=utf-8"},
        method="POST",
    )
    with urlopen(req, timeout=25) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    try:
        return json.loads(raw) if raw else {"ok": True}
    except json.JSONDecodeError:
        return {"ok": True, "raw": raw[:200]}


def confirm(payload: dict) -> dict:
    fields = dict(payload or {})
    append_local({"fields": fields})
    cfg = load_config()
    url = (cfg.get("webappUrl") or "").strip()
    result: dict[str, Any] = {
        "ok": True,
        "local": True,
        "sheet": False,
        "sheetId": cfg.get("sheetId") or SHEET_ID,
        "sheetUrl": SHEET_URL,
        "configured": bool(url),
    }
    if not url:
        return result
    try:
        remote = post_webapp(url, fields)
        result["remote"] = remote
        if remote.get("ok") is False:
            result["error"] = remote.get("error") or "sheet_error"
        else:
            result["sheet"] = True
            result["row"] = remote.get("row")
    except URLError as exc:
        result["ok"] = False
        result["error"] = f"Falha ao gravar na planilha: {exc.reason or exc}"
    except Exception as exc:
        result["ok"] = False
        result["error"] = str(exc)
    return result
