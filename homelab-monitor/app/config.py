"""Configuração editável: /data/config.yml.

- Pode ser editado à mão ou pela página Configurações da dashboard.
- Qualquer valor aceita ${VARIAVEL} para ler segredos do ambiente (.env).
- Segredos voltam mascarados para o navegador e nunca são reenviados a
  um endereço diferente sem que a chave seja digitada de novo.
"""
import copy
import os
import re
import shutil
import threading

import yaml

PATH = os.getenv("CONFIG_PATH", "/data/config.yml")
EXAMPLE = os.getenv("CONFIG_EXAMPLE", os.path.join(os.path.dirname(__file__), "..", "config.example.yml"))
MASK = "••••••"
_VAR = re.compile(r"\$\{([A-Za-z0-9_]+)\}")
_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
_lock = threading.Lock()

DEFAULT_SETTINGS = {
    "poll_interval": 30,
    "retention_days": 30,
    "demo_mode": "auto",          # auto | on | off
    "http_timeout": 10,
    "tz_offset": -3,
    "thresholds": {"disk_warn": 80, "disk_crit": 90, "mem_warn": 92, "temp_warn": 75},
    "energy": {
        "tariff": 0.95,
        "currency": "BRL",
        # watts ocioso / máximo por tipo de host (interpolado pela CPU)
        "profile": {"gateway": [7, 11], "ap": [4, 7], "proxmox": [35, 140], "pbs": [0, 0],
                    "truenas": [0, 0], "sbc": [3, 9], "linux": [10, 40]},
        "hosts": {},              # ajuste por id de host: {"pve-pve": [28, 120]}
    },
    "security": {"require_2fa": "none"},   # none | admin | all
    "notify": {
        "enabled": False,
        "telegram": {"bot_token": "", "chat_id": ""},
        "include_warn": False,        # também avisos (âmbar), não só críticos
        "notify_resolved": True,
        "confirm_cycles": 2,          # ciclos seguidos antes de avisar (evita alarme falso)
        "quiet_from": "", "quiet_to": "",   # horário silencioso, ex.: 23:00 e 07:00
        "security": True,             # bloqueios, 2FA, usuários
        "login_ok": False,            # avisar a cada login bem-sucedido
        "startup_summary": True,
    },
    "ai": {
        "enabled": False,
        "provider": "anthropic",  # anthropic | openai | gemini | compatible
        "model": "",
        "api_key": "",
        "base_url": "",           # só para "compatible" (Ollama, OpenRouter...)
        "language": "português do Brasil",
        "max_tokens": 2000,
        "daily_limit": 50,
        "allowed": "admin",       # admin | all
        "anonymize": True,        # remove IPs antes de enviar
        "share": {"energy": True, "homelab": True, "house": True, "cameras": True},
    },
}


def resolve(v):
    if isinstance(v, str):
        return _VAR.sub(lambda m: os.getenv(m.group(1), ""), v)
    if isinstance(v, dict):
        return {k: resolve(x) for k, x in v.items()}
    if isinstance(v, list):
        return [resolve(x) for x in v]
    return v


def _merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def mtime():
    try:
        return os.path.getmtime(PATH)
    except OSError:
        return 0


def load():
    with _lock:
        if not os.path.exists(PATH):
            os.makedirs(os.path.dirname(PATH) or ".", exist_ok=True)
            if os.path.exists(EXAMPLE):
                shutil.copy(EXAMPLE, PATH)
            else:
                with open(PATH, "w", encoding="utf-8") as f:
                    yaml.safe_dump({"settings": {}, "services": []}, f)
        with open(PATH, encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
    return {"settings": _merge(DEFAULT_SETTINGS, raw.get("settings")), "services": raw.get("services") or []}


def validate(cfg, types):
    errors, ids = [], set()
    if not isinstance(cfg.get("services"), list):
        return ["'services' precisa ser uma lista"]
    for i, s in enumerate(cfg["services"], 1):
        sid, t = str(s.get("id", "")), s.get("type")
        if not _ID.match(sid):
            errors.append(f"Serviço {i}: id '{sid}' inválido (use letras minúsculas, números e hífen)")
        if sid in ids:
            errors.append(f"Serviço {i}: id '{sid}' repetido")
        ids.add(sid)
        if t not in types:
            errors.append(f"Serviço {sid}: tipo '{t}' desconhecido")
    st = cfg.get("settings", {})
    try:
        if int(st.get("poll_interval", 30)) < 5:
            errors.append("Intervalo de coleta mínimo é 5 s")
    except (TypeError, ValueError):
        errors.append("Intervalo de coleta inválido")
    return errors


def save(cfg):
    data = {"settings": cfg["settings"], "services": cfg["services"]}
    tmp = PATH + ".tmp"
    with _lock:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("# Homelab Monitor — editado pela dashboard. Valores ${VAR} são lidos do ambiente.\n")
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True, default_flow_style=False)
        os.chmod(tmp, 0o600)   # tem chaves de API: só o usuário do container lê
        os.replace(tmp, PATH)


def secret_keys(types, t):
    return [f["key"] for f in types.get(t, {}).get("fields", []) if f.get("kind") == "secret"]


SETTING_SECRETS = [("ai", "api_key"), ("notify", "telegram", "bot_token")]


def _dig(d, path, create=False):
    for k in path[:-1]:
        if not isinstance(d.get(k), dict):
            if not create:
                return None
            d[k] = {}
        d = d[k]
    return d


def masked(cfg, types):
    out = copy.deepcopy(cfg)
    for path in SETTING_SECRETS:
        box = _dig(out["settings"], path)
        if box and box.get(path[-1]) and not str(box[path[-1]]).startswith("${"):
            box[path[-1]] = MASK
    for s in out["services"]:
        for k in secret_keys(types, s.get("type")):
            v = s.get(k)
            if v and not str(v).startswith("${"):
                s[k] = MASK
    return out


def restore_secrets(new, old, types):
    """Troca a máscara pelo segredo salvo. Se o endereço mudou, exige a chave de novo."""
    for path in SETTING_SECRETS[1:]:   # a chave da IA tem regra própria abaixo
        nb, ob = _dig(new["settings"], path), _dig(old["settings"], path)
        if nb and nb.get(path[-1]) == MASK:
            nb[path[-1]] = (ob or {}).get(path[-1], "")
    nai, oai = new["settings"].get("ai") or {}, old["settings"].get("ai") or {}
    if nai.get("api_key") == MASK:
        if (nai.get("provider"), nai.get("base_url") or "") != (oai.get("provider"), oai.get("base_url") or ""):
            raise ValueError("Inteligência artificial: o provedor mudou, digite a chave de API de novo")
        nai["api_key"] = oai.get("api_key", "")
    prev = {s.get("id"): s for s in old["services"]}
    for s in new["services"]:
        o = prev.get(s.get("id"), {})
        for k in secret_keys(types, s.get("type")):
            if s.get(k) != MASK:
                continue
            if not o.get(k) or o.get("type") != s.get("type"):
                raise ValueError(f"{s.get('name') or s.get('id')}: digite o campo '{k}'")
            if (o.get("url"), o.get("host")) != (s.get("url"), s.get("host")):
                raise ValueError(f"{s.get('name') or s.get('id')}: o endereço mudou, digite '{k}' de novo")
            s[k] = o[k]
    return new
