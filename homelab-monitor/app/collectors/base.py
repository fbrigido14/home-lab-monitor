"""Base comum para todos os coletores.

Cada coletor descreve seus campos em `fields`; a página Configurações monta
o formulário a partir disso. Para criar uma integração nova, herde de
Collector, defina type/label/page/fields, implemente collect() e
registre a classe em collectors/__init__.py.
"""
import time

import httpx

from config import resolve


def pct(used, total):
    try:
        return round(float(used) / float(total) * 100, 1) if total else None
    except (TypeError, ValueError):
        return None


def gib(n):
    if n is None:
        return "?"
    n = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if abs(n) < 1024:
            return f"{n:.1f} {unit}" if unit not in ("B", "KB") else f"{n:.0f} {unit}"
        n /= 1024
    return f"{n:.1f} EB"


def host(id, name, kind, status="online", **kw):
    """Formato normalizado de host usado pela frota."""
    h = dict(id=id, name=name, kind=kind, status=status, os=None, ip=None,
             cpu=None, mem=None, disk=None, mem_text=None, disk_text=None,
             temp=None, uptime=None, cores=None, load=None, badges=[], note=None)
    h.update(kw)
    return h


def event(level, title, detail="", source=""):
    return dict(level=level, title=title, detail=detail, source=source)


def F(key, label, kind="text", required=False, default=None, placeholder="", help="", options=None):
    """Campo do formulário. kind: text | secret | bool | number | list | select"""
    return dict(key=key, label=label, kind=kind, required=required, default=default,
                placeholder=placeholder, help=help, options=options)


def URL(placeholder, help=""):
    return F("url", "Endereço", required=True, placeholder=placeholder, help=help)


SSL = F("verify_ssl", "Validar certificado HTTPS", "bool", default=False,
        help="Deixe desligado para certificados autoassinados")
FLEET = F("show_in_fleet", "Mostrar na frota", "bool", default=True)


class Collector:
    type = ""
    label = ""
    page = ""
    description = ""
    fields = []
    makes_hosts = False

    def __init__(self, inst, settings):
        self.raw = inst
        self.inst = resolve(inst)
        self.id = inst["id"]
        self.name = inst.get("name") or self.label
        self.settings = settings
        self.verify = bool(self.inst.get("verify_ssl", False))
        self.timeout = float(settings.get("http_timeout", 10))
        self.fleet = self.inst.get("show_in_fleet", True) is not False

    def opt(self, key, default=None):
        v = self.inst.get(key)
        if v in (None, ""):
            f = next((f for f in self.fields if f["key"] == key), None)
            return default if default is not None else (f or {}).get("default")
        return v

    def opt_list(self, key):
        v = self.opt(key) or []
        if isinstance(v, str):
            v = v.replace("\n", ",").split(",")
        return [str(x).strip() for x in v if str(x).strip()]

    @property
    def base_url(self):
        return str(self.opt("url", "")).rstrip("/")

    @property
    def configured(self):
        return all(self.opt(f["key"]) not in (None, "") for f in self.fields if f.get("required"))

    def headers(self):
        return {}

    def client(self, **kw):
        headers = {**self.headers(), **kw.pop("headers", {})}
        return httpx.AsyncClient(verify=self.verify, timeout=self.timeout, headers=headers,
                                 follow_redirects=True, **kw)

    @staticmethod
    def result(hosts=None, services=None, details=None, events=None, metrics=None):
        return dict(hosts=hosts or [], services=services or [], details=details or {},
                    events=events or [], metrics=metrics or {})

    def svc(self, status="online", version=None, summary=""):
        return dict(id=self.id, name=self.name, type=self.type, status=status, version=version, summary=summary)

    def ev(self, level, title, detail=""):
        return event(level, title, detail, self.page)

    async def collect(self):  # pragma: no cover
        raise NotImplementedError

    async def run(self):
        t0 = time.monotonic()
        data = await self.collect()
        data["latency_ms"] = round((time.monotonic() - t0) * 1000)
        return data

    @classmethod
    def schema(cls):
        return dict(type=cls.type, label=cls.label, page=cls.page, description=cls.description,
                    makes_hosts=cls.makes_hosts,
                    fields=[F("name", "Nome na dashboard", required=True, default=cls.label)] + cls.fields +
                    ([FLEET] if cls.makes_hosts else []))
