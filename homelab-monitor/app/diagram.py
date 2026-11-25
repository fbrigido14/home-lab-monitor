"""Diagrama da rede: guardado em /data/diagram.json e editado pela página Diagrama."""
import json
import os
import re
import threading

DATA = os.path.dirname(os.getenv("CONFIG_PATH", "/data/config.yml")) or "."
PATH = os.getenv("DIAGRAM_PATH", os.path.join(DATA, "diagram.json"))
DEFAULT = os.path.join(os.path.dirname(__file__), "diagram_default.json")
_lock = threading.Lock()
_ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
COLOR = re.compile(r"^(#[0-9a-fA-F]{6}|green|blue|purple|orange|teal|pink|yellow|red|ink)$")
KINDS = ("items", "notes", "legend")


def default():
    with open(DEFAULT, encoding="utf-8") as f:
        return json.load(f)


def load():
    try:
        with open(PATH, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default()


def validate(d):
    """Confere a estrutura e devolve uma lista de erros (vazia se estiver tudo certo)."""
    errs = []
    if not isinstance(d, dict):
        return ["Formato inválido"]
    if len(json.dumps(d)) > 512_000:
        return ["Diagrama grande demais (máximo 500 KB)"]
    types = d.get("types") or []
    groups = d.get("groups") or []
    links = d.get("links") or []
    tids, ids = set(), set()
    for t in types:
        if not _ID.match(str(t.get("id", ""))):
            errs.append(f"Tipo de ligação com id inválido: {t.get('id')}")
        if not COLOR.match(str(t.get("color", ""))):
            errs.append(f"Cor inválida no tipo {t.get('label')}")
        tids.add(t.get("id"))
    for g in groups:
        gid = str(g.get("id", ""))
        if not _ID.match(gid) or gid in ids:
            errs.append(f"Grupo com id inválido ou repetido: {gid}")
        ids.add(gid)
        if g.get("kind", "items") not in KINDS:
            errs.append(f"Grupo {g.get('title')}: tipo desconhecido")
        if not COLOR.match(str(g.get("color", "blue"))):
            errs.append(f"Grupo {g.get('title')}: cor inválida")
        for k in ("x", "y", "w"):
            if not isinstance(g.get(k), (int, float)) or not 0 <= g[k] <= 6000:
                errs.append(f"Grupo {g.get('title')}: posição inválida")
                break
        for it in g.get("items") or []:
            iid = str(it.get("id", ""))
            if not _ID.match(iid) or iid in ids:
                errs.append(f"Item com id inválido ou repetido: {iid}")
            ids.add(iid)
    for ln in links:
        if ln.get("from") not in ids or ln.get("to") not in ids:
            errs.append("Ligação aponta para um item ou grupo que não existe")
        if ln.get("type") not in tids:
            errs.append("Ligação com tipo desconhecido")
    return errs[:10]


def save(d):
    os.makedirs(os.path.dirname(PATH) or ".", exist_ok=True)
    tmp = PATH + ".tmp"
    with _lock:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
        os.replace(tmp, PATH)
