"""Atalhos (estilo Heimdall): guardados em /data/launcher.json."""
import asyncio
import base64
import json
import os
import re
import threading
import time
from urllib.parse import urljoin, urlparse

import httpx

DATA = os.path.dirname(os.getenv("CONFIG_PATH", "/data/config.yml")) or "."
PATH = os.getenv("LAUNCHER_PATH", os.path.join(DATA, "launcher.json"))
_lock = threading.Lock()
_ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
_ICON_DATA = re.compile(r"^data:image/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$")
MAX_ICON = 350_000          # ~256 KB de imagem em base64
_status = {"ts": 0, "data": {}}

DEFAULT_SETTINGS = {"open_in": "new", "search": True, "engine": "google", "size": "m", "layout": "groups",
                    "show_desc": True, "show_live": True, "home": False}

# Tipo de serviço → (grupo, ícone, cor, descrição)
STYLE = {
    "unifi": ("Rede", "router", "#1b74e4", "Gateway e Wi-Fi"),
    "proxmox": ("Infraestrutura", "server", "#e57000", "Virtualização"),
    "pbs": ("Infraestrutura", "backup", "#c95c1a", "Backups"),
    "truenas": ("Infraestrutura", "storage", "#0095d5", "Armazenamento"),
    "zabbix": ("Monitoramento", "activity", "#d40000", "Problemas e métricas"),
    "homeassistant": ("Casa", "home", "#18bcf2", "Automação"),
    "emby": ("Mídia", "play", "#52b54b", "Filmes e séries"),
    "jellyfin": ("Mídia", "play", "#7d4fbd", "Filmes e séries"),
    "nextcloud": ("Arquivos", "cloud", "#0082c9", "Arquivos e fotos"),
    "http": ("Outros", "globe", "#5f6b66", ""),
    "tcp": ("Outros", "network", "#5f6b66", ""),
}
ORDER = ["Infraestrutura", "Rede", "Casa", "Mídia", "Arquivos", "Monitoramento", "Outros", "Internet"]


def default_from_config(cfg):
    """Monta os atalhos iniciais a partir dos serviços já configurados."""
    groups, ha_host = {}, None
    for s in cfg.get("services", []):
        st = STYLE.get(s.get("type"))
        url = s.get("url") or (f"http://{s.get('host')}:{s.get('port')}" if s.get("host") else "")
        if not st or not url or "${" in url:
            continue
        g, icon, color, desc = st
        groups.setdefault(g, []).append(dict(id=f"a-{s['id']}", name=s.get("name") or s["id"], url=url, icon=icon,
                                             color=color, desc=desc, link=s["id"], check=True))
        if s.get("type") == "homeassistant":
            ha_host = urlparse(url).hostname
    if ha_host:  # Frigate costuma rodar junto do Home Assistant
        groups.setdefault("Casa", []).append(dict(id="a-frigate", name="Frigate", url=f"http://{ha_host}:5000", icon="camera",
                                                  color="#2f4f6f", desc="Câmeras e gravações", check=True))
    groups.setdefault("Internet", []).append(dict(id="a-sitemanager", name="UniFi Site Manager", url="https://unifi.ui.com",
                                                  icon="cloud", color="#0559c9", desc="Acesso remoto à UniFi", check=False))
    return dict(settings=dict(DEFAULT_SETTINGS),
                groups=[dict(id=f"g{k}", title=t, items=groups[t]) for k, t in enumerate(sorted(groups, key=lambda x: ORDER.index(x) if x in ORDER else 99))])


def load(cfg):
    try:
        with open(PATH, encoding="utf-8") as f:
            d = json.load(f)
    except FileNotFoundError:
        return default_from_config(cfg)
    d["settings"] = {**DEFAULT_SETTINGS, **(d.get("settings") or {})}
    return d


def save(d):
    os.makedirs(os.path.dirname(PATH) or ".", exist_ok=True)
    tmp = PATH + ".tmp"
    with _lock:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
        os.replace(tmp, PATH)
    _status["ts"] = 0


def safe_url(u):
    p = urlparse(str(u or ""))
    return p.scheme in ("http", "https") and bool(p.netloc)


def validate(d):
    errs, ids = [], set()
    if not isinstance(d, dict) or not isinstance(d.get("groups"), list):
        return ["Formato inválido"]
    if len(json.dumps(d)) > 4_000_000:
        return ["Atalhos grandes demais (ícones somam mais de 4 MB)"]
    st = d.get("settings") or {}
    if st.get("open_in", "new") not in ("new", "same") or st.get("size", "m") not in ("s", "m", "l") \
            or st.get("engine", "google") not in ("google", "duckduckgo", "bing", "startpage") \
            or st.get("layout", "groups") not in ("groups", "flat"):
        errs.append("Preferências inválidas")
    for g in d["groups"]:
        if not _ID.match(str(g.get("id", ""))) or g["id"] in ids:
            errs.append(f"Grupo com id inválido: {g.get('id')}")
        ids.add(g.get("id"))
        for it in g.get("items") or []:
            name = it.get("name") or "?"
            if not _ID.match(str(it.get("id", ""))) or it["id"] in ids:
                errs.append(f"Atalho com id inválido: {name}")
            ids.add(it.get("id"))
            if not safe_url(it.get("url")):   # bloqueia javascript:, data: etc.
                errs.append(f"{name}: o endereço precisa começar com http:// ou https://")
            if it.get("color") and not _COLOR.match(str(it["color"])):
                errs.append(f"{name}: cor inválida")
            ic = str(it.get("icon") or "")
            if ic.startswith("data:") and (len(ic) > MAX_ICON or not _ICON_DATA.match(ic)):
                errs.append(f"{name}: imagem do ícone inválida ou maior que 256 KB")
            if it.get("open") not in (None, "", "new", "same"):
                errs.append(f"{name}: modo de abrir inválido")
    return errs[:10]


async def check_status(d, timeout=4):
    """Confere se cada atalho com verificação ligada responde (cache de 30 s)."""
    if time.time() - _status["ts"] < 30:
        return _status["data"]
    items = [it for g in d.get("groups", []) for it in g.get("items", []) if it.get("check") and safe_url(it.get("url"))]

    async def one(c, it):
        t0 = time.monotonic()
        try:
            async with c.stream("GET", it["url"]) as r:   # só o status interessa: o corpo nem é baixado
                return it["id"], dict(up=r.status_code < 500, code=r.status_code, ms=round((time.monotonic() - t0) * 1000))
        except Exception as e:  # noqa: BLE001
            return it["id"], dict(up=False, error=type(e).__name__)

    # verify=False de propósito: serviços do homelab usam certificado autoassinado.
    # Nenhuma credencial é enviada e só o código de status é usado.
    async with httpx.AsyncClient(verify=False, timeout=timeout, follow_redirects=True,  # nosec B501
                                 headers={"User-Agent": "HomelabMonitor/1.0"}) as c:
        res = await asyncio.gather(*(one(c, it) for it in items))
    _status.update(ts=time.time(), data=dict(res))
    return _status["data"]


async def fetch_icon(url):
    """Busca o ícone de um site (apple-touch-icon, ícone declarado ou /favicon.ico) e devolve data URI."""
    if not safe_url(url):
        raise ValueError("Endereço precisa começar com http:// ou https://")
    async def limited(c, u, cap):
        """GET que para de baixar ao passar de `cap` bytes."""
        async with c.stream("GET", u) as r:
            buf = b""
            async for chunk in r.aiter_bytes():
                buf += chunk
                if len(buf) > cap:
                    break
            return r, buf[:cap + 1]

    # verify=False: mesmo motivo da verificação de status (só lê ícones públicos, sem credenciais)
    async with httpx.AsyncClient(verify=False, timeout=6, follow_redirects=True,  # nosec B501
                                 headers={"User-Agent": "Mozilla/5.0 HomelabMonitor"}) as c:
        candidates = []
        try:
            r, body = await limited(c, url, 400_000)
            html = body.decode(r.encoding or "utf-8", "replace") if "html" in r.headers.get("content-type", "") else ""
            base = str(r.url)
            for tag in re.findall(r"<link\b[^>]*>", html, re.I):
                rel = (re.search(r'rel=["\']([^"\']+)', tag, re.I) or [None, ""])[1].lower()
                href = (re.search(r'href=["\']([^"\']+)', tag, re.I) or [None, ""])[1]
                if href and "icon" in rel:
                    sizes = re.search(r'sizes=["\'](\d+)', tag, re.I)
                    score = (2 if "apple-touch" in rel else 1) * 1000 + (int(sizes[1]) if sizes else 32)
                    candidates.append((score, urljoin(base, href)))
        except httpx.HTTPError:
            base = url
        candidates.sort(reverse=True)
        tried = [u for _, u in candidates] + [urljoin(base, "/favicon.ico"), urljoin(base, "/favicon.png")]
        for u in tried[:6]:
            if u.startswith("data:image/"):
                if _ICON_DATA.match(u) and len(u) <= MAX_ICON:
                    return u
                continue
            if not safe_url(u):
                continue
            try:
                r, content = await limited(c, u, 256_000)
            except httpx.HTTPError:
                continue
            ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
            if r.status_code == 200 and ctype.startswith("image/") and 0 < len(content) <= 256_000:
                if ctype == "image/x-icon" or u.endswith(".ico"):
                    ctype = "image/x-icon"
                uri = f"data:{ctype};base64,{base64.b64encode(content).decode()}"
                if _ICON_DATA.match(uri):
                    return uri
    raise ValueError("Não encontrei um ícone nesse endereço")
