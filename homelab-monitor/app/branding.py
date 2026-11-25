"""Aparência da dashboard e da tela de login: /data/branding.json + imagens em /data/branding/."""
import base64
import json
import os
import re
import threading

DATA = os.path.dirname(os.getenv("CONFIG_PATH", "/data/config.yml")) or "."
PATH = os.path.join(DATA, "branding.json")
IMG_DIR = os.path.join(DATA, "branding")
_lock = threading.Lock()
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_URI = re.compile(r"^data:image/(png|jpeg|webp|gif|svg\+xml);base64,([A-Za-z0-9+/=]+)$")
EXT = {"png": "png", "jpeg": "jpg", "webp": "webp", "gif": "gif", "svg+xml": "svg"}
MIME = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "svg": "image/svg+xml"}
LIMITS = {"logo": 300_000, "bg": 1_500_000}

DEFAULT = {
    "app_name": "Homelab Monitor",
    "login_title": "Entrar",
    "login_message": "Entre para ver o seu homelab",
    "accent": "#116a67",
    "accent_dark": "",           # vazio = versão clara automática da cor principal
    "default_theme": "system",   # system | light | dark
    "login_bg": "plain",         # plain | color | gradient | image
    "bg_color": "#e6ebe8",
    "bg_color2": "#116a67",
    "show_rack": True,
    "logo_round": False,
}


def load():
    try:
        with open(PATH, encoding="utf-8") as f:
            d = {**DEFAULT, **json.load(f)}
    except FileNotFoundError:
        d = dict(DEFAULT)
    d["logo"] = _img_url("logo")
    d["bg_image"] = _img_url("bg")
    return d


def _img_path(kind):
    for ext in MIME:
        p = os.path.join(IMG_DIR, f"{kind}.{ext}")
        if os.path.exists(p):
            return p, ext
    return None, None


def _img_url(kind):
    p, _ = _img_path(kind)
    return f"/branding/{kind}?v={int(os.path.getmtime(p))}" if p else None


def image(kind):
    p, ext = _img_path(kind)
    if not p:
        return None, None
    with open(p, "rb") as f:
        return f.read(), MIME[ext]


def save(body):
    """Valida e grava. Imagens chegam como data URI; "" remove; ausente mantém."""
    errs, d = [], dict(DEFAULT)
    try:
        with open(PATH, encoding="utf-8") as f:
            d.update(json.load(f))
    except FileNotFoundError:
        pass
    for k, n in (("app_name", 40), ("login_title", 40), ("login_message", 160)):
        if k in body:
            d[k] = str(body[k] or "").strip()[:n] or DEFAULT[k]
    for k in ("accent", "accent_dark", "bg_color", "bg_color2"):
        if k in body:
            v = str(body[k] or "")
            if v and not _HEX.match(v):
                errs.append(f"Cor inválida: {k}")
            d[k] = v if v else ("" if k == "accent_dark" else DEFAULT[k])
    if body.get("default_theme", d["default_theme"]) not in ("system", "light", "dark"):
        errs.append("Tema padrão inválido")
    if body.get("login_bg", d["login_bg"]) not in ("plain", "color", "gradient", "image"):
        errs.append("Fundo do login inválido")
    for k in ("default_theme", "login_bg"):
        if k in body:
            d[k] = body[k]
    for k in ("show_rack", "logo_round"):
        if k in body:
            d[k] = bool(body[k])
    writes = {}
    for kind in ("logo", "bg"):
        if kind not in body:
            continue
        v = body[kind]
        if v in ("", None):
            writes[kind] = None
            continue
        m = _URI.match(str(v))
        if not m:
            errs.append(f"{'Logo' if kind == 'logo' else 'Imagem de fundo'}: use PNG, JPG, WEBP, GIF ou SVG")
            continue
        raw = base64.b64decode(m[2])
        if len(raw) > LIMITS[kind]:
            errs.append(f"{'Logo' if kind == 'logo' else 'Imagem de fundo'} maior que {LIMITS[kind] // 1000} KB")
            continue
        writes[kind] = (raw, EXT[m[1]])
    if errs:
        return errs
    with _lock:
        os.makedirs(IMG_DIR, exist_ok=True)
        for kind, w in writes.items():
            old, _ = _img_path(kind)
            if old:
                os.remove(old)
            if w:
                with open(os.path.join(IMG_DIR, f"{kind}.{w[1]}"), "wb") as f:
                    f.write(w[0])
        for k in ("logo", "bg_image"):
            d.pop(k, None)
        with open(PATH, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
    return []
