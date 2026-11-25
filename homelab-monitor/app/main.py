"""Homelab Monitor — API + servidor da interface."""
import asyncio
import copy
import datetime as dt
import hmac
import json
import logging
import os
import time
from contextlib import asynccontextmanager

from urllib.parse import quote

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

import ai
import auth
import branding
import notify
import config as cfgmod
import diagram
import launcher
from collectors import TYPES
from collectors.base import event
from collectors.demo import DEMOS
from store import Store

VERSION = "1.11.0"
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("homelab")

READONLY = os.getenv("CONFIG_READONLY", "").lower() in ("1", "true", "yes", "sim")
store = Store(os.getenv("DB_PATH", "/data/homelab.db"))

RT = {"cfg": None, "collectors": [], "mtime": 0}
STATE = {"services": {}, "updated": 0, "hosts": [], "metrics": {}, "estimate": [], "power_measured": False}
POLL_LOCK = asyncio.Lock()


# ---------------- configuração ----------------
def settings():
    return RT["cfg"]["settings"]


def notify_cfg():
    return cfgmod.resolve(settings().get("notify") or {})


def twofa_policy():
    return (settings().get("security") or {}).get("require_2fa", "none")


def apply_config(cfg):
    cols = []
    for s in cfg["services"]:
        if s.get("enabled", True) is False or s.get("type") not in TYPES:
            continue
        try:
            c = TYPES[s["type"]](s, cfg["settings"])
            if hasattr(c, "store"):
                c.store = store
            cols.append(c)
        except Exception as e:  # noqa: BLE001
            log.error("Serviço %s inválido: %s", s.get("id"), e)
    RT.update(cfg=cfg, collectors=cols, mtime=cfgmod.mtime())
    keep = {c.id for c in cols}
    STATE["services"] = {k: v for k, v in STATE["services"].items() if k in keep}
    log.info("Configuração carregada: %d serviços ativos", len(cols))


def reload_if_changed():
    if cfgmod.mtime() != RT["mtime"]:
        try:
            cfg = cfgmod.load()
            errs = cfgmod.validate(cfg, TYPES)
            if errs:
                log.error("config.yml com erros, mantendo a anterior: %s", "; ".join(errs))
                RT["mtime"] = cfgmod.mtime()
                return
            apply_config(cfg)
        except Exception as e:  # noqa: BLE001
            log.error("Não foi possível ler config.yml: %s", e)
            RT["mtime"] = cfgmod.mtime()


# ---------------- coleta ----------------
def _wrap(c, mode, data, ok=True, error=None):
    for h in data["hosts"]:
        h.update(source=c.id, demo=mode == "demo")
    return dict(id=c.id, type=c.type, name=c.name, page=c.page, mode=mode, ok=ok, error=error,
                fleet=c.fleet, latency_ms=data.get("latency_ms"), **{k: data[k] for k in
                ("hosts", "services", "details", "events", "metrics")})


def friendly_error(e):
    import httpx
    if isinstance(e, httpx.HTTPStatusError):
        code = e.response.status_code
        hint = {401: "credencial recusada", 403: "sem permissão ou chave inválida", 404: "endereço ou API não encontrada"}.get(code, "")
        return f"HTTP {code}{' — ' + hint if hint else ''}"
    if isinstance(e, (httpx.ConnectError, ConnectionRefusedError, OSError)) and not isinstance(e, asyncio.TimeoutError):
        return f"Sem conexão: {str(e).splitlines()[0][:150] or type(e).__name__}"
    if isinstance(e, (asyncio.TimeoutError, httpx.TimeoutException)):
        return "Tempo de resposta esgotado"
    return f"{type(e).__name__}: {str(e).splitlines()[0] if str(e) else ''}"[:220]


async def run_one(c, use_demo=None):
    demo = settings()["demo_mode"] if use_demo is None else use_demo
    if demo == "on" or (not c.configured and demo == "auto"):
        return _wrap(c, "demo", DEMOS[c.type](c))
    if not c.configured:
        return _wrap(c, "off", c.result(), ok=False, error="Faltam campos obrigatórios")
    try:
        return _wrap(c, "live", await asyncio.wait_for(c.run(), timeout=c.timeout * 3))
    except Exception as e:  # noqa: BLE001
        msg = friendly_error(e)
        log.warning("%s falhou: %s", c.id, msg)
        prev = STATE["services"].get(c.id, {})
        data = c.result(hosts=[dict(h, status="offline", cpu=None, mem=None, note=msg) for h in prev.get("hosts", [])],
                        services=[dict(s, status="offline", summary=msg) for s in prev.get("services", [])]
                        or [c.svc("offline", summary=msg)],
                        details=prev.get("details", {}),
                        events=[event("crit", f"{c.name} sem resposta", msg, c.page)])
        return _wrap(c, "live", data, ok=False, error=msg)


def enrich_pve_temps(cols, services):
    """A API do Proxmox não traz temperatura: copia de um host do Zabbix ou de um sensor do Home Assistant."""
    all_hosts = {h["id"]: h for r in services.values() for h in r["hosts"]}
    watch = {w["id"]: w for r in services.values() if r["type"] == "homeassistant"
             for w in (r["details"] or {}).get("watch", [])}
    for c in cols:
        if c.type != "proxmox" or c.id not in services:
            continue
        r, srcs = services[c.id], c.temp_sources()
        thr = float(settings()["thresholds"].get("temp_warn", 75))
        for n in (r["details"] or {}).get("nodes", []):
            src = srcs.get(n["name"]) or srcs.get("*")
            if not src or n.get("temp_src") == "demonstração":
                continue
            val = None
            if src.startswith("ha:"):
                try:
                    val = float(watch.get(src[3:], {}).get("state"))
                except (TypeError, ValueError):
                    val = None
            elif src in all_hosts:
                val = all_hosts[src].get("temp")
            n.update(temp=round(val, 1) if val is not None else None, temp_src=src)
            h = next((h for h in r["hosts"] if h["name"] == n["name"]), None)
            if h and val is not None:
                h["temp"] = n["temp"]
                r["metrics"][f"{h['id']}.temp"] = n["temp"]
                if val >= thr:
                    r["events"].append(event("warn", f"{n['name']} a {n['temp']} °C", "Temperatura alta no nó Proxmox", "proxmox"))


def estimate_power(hosts):
    en = settings()["energy"]
    rows = []
    for h in hosts:
        lo, hi = (en.get("hosts") or {}).get(h["id"]) or (en.get("profile") or {}).get(h["kind"]) or (0, 0)
        if float(hi) <= 0 or h["status"] != "online":
            continue
        load = (h.get("cpu") or 0) / 100
        rows.append(dict(id=h["id"], name=h["name"], kind=h["kind"], watts=round(lo + (hi - lo) * load, 1)))
    return rows


async def poll_once():
    async with POLL_LOCK:
        reload_if_changed()
        cols = list(RT["collectors"])
        results = await asyncio.gather(*(run_one(c) for c in cols))
        services = {r["id"]: r for r in results}
        enrich_pve_temps(cols, services)
        hosts = [h for r in results if r["fleet"] for h in r["hosts"]]
        metrics = {}
        for r in results:
            metrics.update(r["metrics"])
        for r in results:
            for h in r["hosts"]:
                for f in ("cpu", "mem", "disk", "temp"):
                    if isinstance(h.get(f), (int, float)):
                        metrics[f"{h['id']}.{f}"] = h[f]
        est = estimate_power(hosts)
        measured = "power.w" in metrics
        metrics["power.est"] = round(sum(r["watts"] for r in est), 1)
        if not measured:
            metrics["power.w"] = metrics["power.est"]
        store.write(metrics)
        STATE.update(services=services, hosts=hosts, metrics=metrics, estimate=est,
                     power_measured=measured, updated=int(time.time()))
        live = {k: r for k, r in services.items() if r["mode"] == "live"}
        try:
            notify.process(notify_cfg(), build_events(live, [h for h in hosts if not h.get("demo")]),
                           branding.load()["app_name"])
        except Exception:  # noqa: BLE001
            log.exception("Falha ao preparar notificações")


async def loop():
    n = 0
    while True:
        try:
            await poll_once()
        except Exception:  # noqa: BLE001
            log.exception("Falha no ciclo de coleta")
        n += 1
        if n % 120 == 0:
            store.prune(int(settings()["retention_days"]))
        await asyncio.sleep(max(5, int(settings()["poll_interval"])))


@asynccontextmanager
async def lifespan(_app):
    apply_config(cfgmod.load())
    code = auth.setup_code()
    if code:
        log.warning("=" * 60)
        log.warning("PRIMEIRO ACESSO: código de configuração inicial: %s", code)
        log.warning("Digite este código na tela de login para criar o administrador.")
        log.warning("=" * 60)
    task = asyncio.create_task(loop())
    yield
    task.cancel()


app = FastAPI(title="Homelab Monitor", version=VERSION, lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


# ---------------- montagem do estado ----------------
def build_events(services, hosts):
    thr = settings()["thresholds"]
    evs = [e for s in services.values() for e in s["events"]]
    for h in hosts:
        if h["status"] != "online":
            if not any(h["name"] in e["title"] for e in evs):
                evs.append(event("crit", f"{h['name']} offline", h.get("note") or "", "visao"))
            continue
        if h.get("disk") and h["disk"] >= max(95, thr["disk_crit"]):
            evs.append(event("crit", f"Disco quase cheio em {h['name']}", f"{h['disk']}%", "visao"))
        if h.get("mem") and h["mem"] >= thr["mem_warn"] and h["kind"] != "truenas":  # ARC do ZFS usa RAM de propósito
            evs.append(event("warn", f"{h['name']} com {h['mem']}% de RAM", "Pouca memória livre", "visao"))
        if h.get("temp") and h["temp"] >= thr["temp_warn"]:
            evs.append(event("warn", f"{h['name']} a {h['temp']} °C", "Temperatura alta", "visao"))
    order = {"crit": 0, "warn": 1, "info": 2}
    seen, out = set(), []
    for e in sorted(evs, key=lambda e: order.get(e["level"], 3)):
        if (e["title"], e["detail"]) not in seen:
            seen.add((e["title"], e["detail"]))
            out.append(e)
    return out


def energy():
    en = settings()["energy"]
    tariff = float(en["tariff"])
    tz = dt.timezone(dt.timedelta(hours=float(settings()["tz_offset"])))
    now = dt.datetime.now(tz)
    w = STATE["metrics"].get("power.w", 0) or 0
    today, _ = store.energy_kwh("power.w", (now - now.replace(hour=0, minute=0, second=0, microsecond=0)).total_seconds())
    d7, _ = store.energy_kwh("power.w", 7 * 86400)
    d30, _ = store.energy_kwh("power.w", 30 * 86400)
    est = STATE["estimate"]
    est_total = sum(r["watts"] for r in est) or 1
    scale = w / est_total if STATE["power_measured"] else 1
    breakdown = sorted([dict(r, watts=round(r["watts"] * scale, 1), share=round(r["watts"] / est_total * 100, 1),
                             month=round(r["watts"] * scale * 24 * 30 / 1000 * tariff, 2)) for r in est],
                       key=lambda r: -r["watts"])
    return dict(watts=round(w, 1), measured=STATE["power_measured"], tariff=tariff, currency=en.get("currency", "BRL"),
                per_hour=round(w / 1000 * tariff, 4), per_month=round(w / 1000 * 24 * 30 * tariff, 2),
                today=dict(kwh=today, cost=round(today * tariff, 2)), d7=dict(kwh=d7, cost=round(d7 * tariff, 2)),
                d30=dict(kwh=d30, cost=round(d30 * tariff, 2)), breakdown=breakdown)


@app.get("/api/state")
async def api_state():
    if not STATE["updated"]:
        await poll_once()
    services, hosts = STATE["services"], STATE["hosts"]
    return dict(
        version=VERSION, updated=STATE["updated"], poll=int(settings()["poll_interval"]),
        hosts=hosts, apps=[s for r in services.values() for s in r["services"]],
        events=build_events(services, hosts), energy=energy(),
        instances=[dict(id=r["id"], type=r["type"], name=r["name"], page=r["page"], mode=r["mode"], ok=r["ok"],
                        error=r["error"], latency_ms=r["latency_ms"], details=r["details"],
                        host_ids=[h["id"] for h in r["hosts"]]) for r in services.values()],
    )


def _pve(iid, node):
    c = next((c for c in RT["collectors"] if c.id == iid and c.type == "proxmox"), None)
    if not c:
        raise HTTPException(404, "Proxmox não encontrado")
    nodes = {n["name"] for n in ((STATE["services"].get(iid) or {}).get("details") or {}).get("nodes", [])}
    if node not in nodes:   # só nós conhecidos: nada de caminhos livres na API do Proxmox
        raise HTTPException(404, "Nó não encontrado")
    demo = settings()["demo_mode"]
    return c, demo == "on" or (not c.configured and demo == "auto")


@app.get("/api/pve/rrd")
async def api_pve_rrd(iid: str, node: str, tf: str = "day", vmid: int = 0, gtype: str = ""):
    c, demo = _pve(iid, node)
    if tf not in c.TF or (vmid and gtype not in ("qemu", "lxc")):
        raise HTTPException(400, "Parâmetros inválidos")
    if demo:
        from collectors.demo import pve_rrd
        return pve_rrd(tf, vmid or None)
    try:
        return await asyncio.wait_for(c.rrd(node, tf, vmid or None, gtype or None), timeout=c.timeout * 2)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, friendly_error(e)) from e


@app.get("/api/pve/syslog")
async def api_pve_syslog(request: Request, iid: str, node: str, limit: int = 300):
    require_admin(request)   # logs do sistema podem conter informação sensível
    c, demo = _pve(iid, node)
    if demo:
        from collectors.demo import DEMO_SYSLOG
        now = time.time()
        return {"lines": [f"{time.strftime('%b %d %H:%M:%S', time.localtime(now - (len(DEMO_SYSLOG) - k) * 97))} {node} {x}" for k, x in enumerate(DEMO_SYSLOG)]}
    try:
        return {"lines": await asyncio.wait_for(c.syslog(node, max(20, min(limit, 1000))), timeout=c.timeout * 2)}
    except PermissionError as e:
        raise HTTPException(403, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, friendly_error(e)) from e


@app.get("/api/media/{iid}/image/{item_id}")
async def api_media_image(iid: str, item_id: str, w: int = 300):
    """Capas do Emby/Jellyfin pela dashboard: a chave fica no servidor e só itens exibidos na tela são liberados."""
    c = next((c for c in RT["collectors"] if c.id == iid and hasattr(c, "image")), None)
    if not c or not c.opt("show_posters"):
        raise HTTPException(404, "Imagem não encontrada")
    demo = settings()["demo_mode"]
    if demo == "on" or (not c.configured and demo == "auto"):
        from collectors.demo import poster_svg
        return Response(poster_svg(item_id), media_type="image/svg+xml", headers={"Cache-Control": "private, max-age=3600"})
    try:
        data, mime = await asyncio.wait_for(c.image(item_id, max(100, min(w, 600))), timeout=c.timeout)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, friendly_error(e)) from e
    return Response(data, media_type=mime if mime.startswith("image/") else "image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


@app.get("/api/series")
async def api_series(iid: str, kind: str, tf: str = "day"):
    """Histórico vindo da própria integração (PBS: RRD; Zabbix: history/trends)."""
    c = next((c for c in RT["collectors"] if c.id == iid and hasattr(c, "series")), None)
    if not c or tf not in getattr(c, "TF", {}):
        raise HTTPException(404, "Série não encontrada")
    demo = settings()["demo_mode"]
    if demo == "on" or (not c.configured and demo == "auto"):
        from collectors.demo import series as demo_series
        return demo_series(c.type, kind, tf)
    try:
        return await asyncio.wait_for(c.series(kind, tf), timeout=c.timeout * 3)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, friendly_error(e)) from e


@app.get("/api/spark")
async def api_spark(keys: str = Query(...), range: str = "1h"):  # noqa: A002
    """Minigráficos: muitas séries curtas de uma vez (até 80 chaves, ~30 pontos cada)."""
    return store.series([k for k in keys.split(",") if k][:80], range if range in ("1h", "6h", "24h") else "1h", points=30)


@app.get("/api/summary")
async def api_summary():
    """Resumo leve para o app Android (notificações em segundo plano e widget)."""
    if not STATE["updated"]:
        await poll_once()
    evs = [e for e in build_events(STATE["services"], STATE["hosts"]) if e["level"] in ("crit", "warn")]
    crit, warn = len([e for e in evs if e["level"] == "crit"]), len([e for e in evs if e["level"] == "warn"])
    e, b = energy(), branding.load()
    hosts = STATE["hosts"]
    return dict(app_name=b["app_name"], accent=b["accent"], version=VERSION, updated=STATE["updated"],
                health="crit" if crit else "warn" if warn else "ok", counts=dict(crit=crit, warn=warn),
                events=[dict(level=x["level"], title=x["title"], detail=x["detail"], source=x["source"]) for x in evs[:30]],
                hosts=dict(online=len([h for h in hosts if h["status"] == "online"]), total=len(hosts)),
                energy=dict(watts=e["watts"], per_hour=e["per_hour"], currency=e["currency"]))


@app.get("/api/history")
async def api_history(keys: str = Query(...), range: str = "6h"):  # noqa: A002
    return store.series([k for k in keys.split(",") if k][:12], range)


@app.get("/api/live/{iid}")
async def api_live(iid: str):
    """Leitura rápida da casa para a página Casa (só leitura, cache de 3 s)."""
    c = next((c for c in RT["collectors"] if c.id == iid and hasattr(c, "live")), None)
    if not c:
        raise HTTPException(404, "Serviço não encontrado")
    demo = settings()["demo_mode"]
    if demo == "on" or (not c.configured and demo == "auto"):
        return DEMOS[c.type](c)["details"]["house"]
    try:
        return await asyncio.wait_for(c.live(), timeout=c.timeout * 2)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, friendly_error(e)) from e


@app.get("/api/camera/{iid}/{entity}")
async def api_camera(iid: str, entity: str, request: Request, w: int = 640):
    """Imagem de uma câmera do Frigate pelo Home Assistant. Respeita a configuração de quem pode ver."""
    c = next((c for c in RT["collectors"] if c.id == iid and hasattr(c, "snapshot")), None)
    if not c:
        raise HTTPException(404, "Serviço não encontrado")
    cfg = c.camera_cfg
    if cfg["view"] != "image":
        raise HTTPException(403, "Imagens das câmeras desativadas nas configurações")
    if cfg["images_for"] == "admin" and request.state.user.get("role") != "admin":
        raise HTTPException(403, "Só administradores podem ver as imagens")
    demo = settings()["demo_mode"]
    if demo == "on" or (not c.configured and demo == "auto"):
        from collectors.demo import camera_svg
        house = DEMOS[c.type](c)["details"]["house"]
        cam = next((x for x in house["cameras"] if x["id"] == entity), None)
        if not cam:
            raise HTTPException(404, "Câmera não encontrada")
        return Response(camera_svg(cam["name"], cam["online"]), media_type="image/svg+xml", headers={"Cache-Control": "no-store"})
    if entity not in c._cam_ids:   # só câmeras liberadas na configuração, nunca outra rota do HA
        raise HTTPException(404, "Câmera não encontrada")
    try:
        data, ctype = await asyncio.wait_for(c.snapshot(entity, 1280 if w > 640 else 640), timeout=c.timeout)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, friendly_error(e)) from e
    return Response(data, media_type=ctype, headers={"Cache-Control": "no-store"})


# ---------------- atalhos ----------------
@app.get("/api/launcher")
async def api_launcher():
    return launcher.load(cfgmod.load())


@app.get("/api/launcher/default")
async def api_launcher_default():
    return launcher.default_from_config(cfgmod.load())


@app.put("/api/launcher")
async def api_launcher_put(request: Request, body: dict = Body(...)):
    require_admin(request)
    errs = launcher.validate(body)
    if errs:
        raise HTTPException(400, "; ".join(errs))
    launcher.save(body)
    return {"ok": True}


@app.get("/api/launcher/status")
async def api_launcher_status():
    return await launcher.check_status(launcher.load(cfgmod.load()))


@app.post("/api/launcher/icon")
async def api_launcher_icon(request: Request, body: dict = Body(...)):
    require_admin(request)
    try:
        return {"icon": await launcher.fetch_icon(str(body.get("url", "")))}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


# ---------------- inteligência artificial ----------------
def ai_cfg():
    return cfgmod.resolve(settings().get("ai") or {})


def ai_allowed(request):
    cfg, u = ai_cfg(), request.state.user
    return bool(cfg.get("enabled")) and (cfg.get("allowed") == "all" or u.get("role") == "admin")


def ai_cameras(request):
    """Câmeras que este usuário pode mandar para a IA."""
    if not (ai_cfg().get("share") or {}).get("cameras", True):
        return []
    out = []
    for c in RT["collectors"]:
        if not hasattr(c, "camera_cfg"):
            continue
        cc = c.camera_cfg
        if cc["view"] != "image" or (cc["images_for"] == "admin" and request.state.user.get("role") != "admin"):
            continue
        house = (STATE["services"].get(c.id, {}).get("details") or {}).get("house") or {}
        out += [dict(iid=c.id, id=x["id"], name=x["name"], online=x["online"]) for x in house.get("cameras", [])]
    return out


@app.get("/api/ai/status")
async def api_ai_status(request: Request):
    cfg = ai_cfg()
    p = cfg.get("provider", "anthropic")
    return dict(enabled=bool(cfg.get("enabled")), allowed=ai_allowed(request), provider=p,
                provider_label=ai.PROVIDERS.get(p, {}).get("label", p),
                model=cfg.get("model") or ai.PROVIDERS.get(p, {}).get("model"),
                share=cfg.get("share"), cameras=ai_cameras(request) if ai_allowed(request) else [],
                usage_today=ai.usage_today(), daily_limit=cfg.get("daily_limit"),
                providers={k: dict(label=v["label"], model=v["model"], url=v["url"]) for k, v in ai.PROVIDERS.items()})


@app.post("/api/ai/ask")
async def api_ai_ask(request: Request, body: dict = Body(...)):
    if not ai_allowed(request):
        raise HTTPException(403, "Assistente de IA desligado ou sem permissão para o seu usuário")
    cfg, user = ai_cfg(), request.state.user["username"]
    question = str(body.get("question") or "").strip()[:4000]
    try:
        ai.check_limits(user, cfg)
        if body.get("conversation"):
            conv = ai.get_conv(body["conversation"], user)
            if not question:
                raise ai.AIError("Escreva a pergunta")
        else:
            task = body.get("task", "livre")
            if task not in ai.TASKS:
                raise ai.AIError("Tipo de análise desconhecido")
            if task == "livre" and not question:
                raise ai.AIError("Escreva a pergunta")
            share, image, title = cfg.get("share") or {}, None, ""
            if task == "imagem":
                cam = body.get("camera") or {}
                allowed = {(x["iid"], x["id"]): x for x in ai_cameras(request)}
                meta = allowed.get((cam.get("iid"), cam.get("id")))
                if not meta:
                    raise ai.AIError("Câmera indisponível para análise (verifique as permissões de imagem e de envio para a IA)")
                c = next(x for x in RT["collectors"] if x.id == meta["iid"])
                demo = settings()["demo_mode"]
                if demo == "on" or (not c.configured and demo == "auto"):
                    data, mime = ai.demo_image(meta["name"], meta["online"])
                else:
                    data, mime = await asyncio.wait_for(c.snapshot(meta["id"], 1280), timeout=c.timeout)
                image, title = (ai.b64(data), mime.split(";")[0]), meta["name"]
                house = (STATE["services"][c.id]["details"] or {}).get("house") or {}
                info = next((x for x in house.get("cameras", []) if x["id"] == meta["id"]), {})
                context = json.dumps(dict(camera=meta["name"], online=info.get("online"), movimento=info.get("motion"),
                                          objetos_detectados=info.get("objects"), fps=info.get("fps"),
                                          horario=time.strftime("%d/%m/%Y %H:%M")), ensure_ascii=False)
                sent = [f"imagem da câmera {meta['name']}"]
            else:
                context, sent = ai.build_context(task, STATE, energy(), build_events(STATE["services"], STATE["hosts"]),
                                                 share, cfg.get("anonymize", True), store.series,
                                                 question if task == "livre" else "")
            cid = ai.new_conv(user, task, context, image, sent, title)
            conv = ai.get_conv(cid, user)
        system = ai.SYSTEM.format(lang=cfg.get("language") or "português do Brasil")
        text, model, usage = await ai.complete(cfg, system, ai.build_messages(conv, question))
    except ai.AIError as e:
        raise HTTPException(400, str(e)) from e
    except asyncio.TimeoutError as e:
        raise HTTPException(504, "A câmera não respondeu a tempo") from e
    conv["turns"].append(dict(q=question, a=text))
    cid = next(k for k, v in ai.CONV.items() if v is conv)
    log.info("IA: %s pediu '%s' (%s, tokens %s)", user, conv["task"], model, usage)
    return dict(conversation=cid, answer=text, model=model, usage=usage, sent=conv["sent"], task=conv["task"],
                title=conv["title"], usage_today=ai.usage_today())


@app.post("/api/ai/test")
async def api_ai_test(request: Request, body: dict = Body(...)):
    require_admin(request)
    cfg = cfgmod._merge(cfgmod.DEFAULT_SETTINGS["ai"], body.get("ai") or {})
    if cfg.get("api_key") == cfgmod.MASK:
        old = (cfgmod.load()["settings"].get("ai") or {})
        if (cfg.get("provider"), cfg.get("base_url") or "") != (old.get("provider"), old.get("base_url") or ""):
            raise HTTPException(400, "O provedor mudou: digite a chave de API de novo")
        cfg["api_key"] = old.get("api_key", "")
    cfg = cfgmod.resolve(cfg)
    cfg["max_tokens"] = 300
    t0 = time.monotonic()
    try:
        text, model, _ = await ai.complete(cfg, "Responda em uma frase curta.", [{"role": "user", "text": "Diga apenas: conexão funcionando."}], timeout=45)
    except ai.AIError as e:
        return dict(ok=False, error=str(e))
    return dict(ok=True, model=model, answer=text.strip()[:200], ms=round((time.monotonic() - t0) * 1000))


@app.get("/api/health")
async def api_health():
    ok = STATE["updated"] and time.time() - STATE["updated"] < int(settings()["poll_interval"]) * 4 + 30
    return JSONResponse({"ok": bool(ok), "updated": STATE["updated"]}, status_code=200 if ok else 503)


# ---------------- configuração pela interface ----------------
def require_admin(request: Request):
    u = getattr(request.state, "user", None)
    if not u:
        raise HTTPException(401, "Faça login")
    if auth.needs_enroll(u, twofa_policy()):
        raise HTTPException(403, "Configure o duplo fator (2FA) para continuar")
    if not u or u.get("role") != "admin":
        raise HTTPException(403, "Só administradores podem fazer isso")
    return u


@app.get("/api/types")
async def api_types():
    return [cls.schema() for cls in TYPES.values()]


@app.get("/api/config")
async def api_config_get(request: Request):
    require_admin(request)
    return dict(config=cfgmod.masked(RT["cfg"], api_types_map()), readonly=READONLY,
                path=cfgmod.PATH, mask=cfgmod.MASK)


def api_types_map():
    return {t: cls.schema() for t, cls in TYPES.items()}


@app.put("/api/config")
async def api_config_put(request: Request, body: dict = Body(...)):
    require_admin(request)
    if READONLY:
        raise HTTPException(403, "Configuração somente leitura (CONFIG_READONLY)")
    new = {"settings": cfgmod._merge(cfgmod.DEFAULT_SETTINGS, body.get("settings")), "services": body.get("services") or []}
    try:
        new = cfgmod.restore_secrets(new, cfgmod.load(), api_types_map())
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    errs = cfgmod.validate(new, TYPES)
    if errs:
        raise HTTPException(400, "; ".join(errs))
    cfgmod.save(new)
    apply_config(cfgmod.load())
    asyncio.create_task(poll_once())
    return {"ok": True}


@app.post("/api/test")
async def api_test(request: Request, body: dict = Body(...)):
    require_admin(request)
    svc = copy.deepcopy(body.get("service") or {})
    if svc.get("type") not in TYPES:
        raise HTTPException(400, "Tipo desconhecido")
    svc["id"] = svc.get("id") or "teste"
    try:
        svc = cfgmod.restore_secrets({"settings": {}, "services": [svc]}, cfgmod.load(), api_types_map())["services"][0]
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    c = TYPES[svc["type"]](svc, settings())
    if not c.configured:
        return dict(ok=False, error="Preencha os campos obrigatórios")
    r = await run_one(c, use_demo="off")
    return dict(ok=r["ok"], error=r["error"], latency_ms=r["latency_ms"],
                summary=f"{len(r['hosts'])} hosts, {len(r['events'])} alertas" +
                        (f" · {r['services'][0]['summary']}" if r["services"] else ""))



# ---------------- login ----------------
PUBLIC_EXACT = {"/login.html", "/login.js", "/style.css", "/branding.js", "/api/health", "/api/branding",
                "/branding/logo", "/branding/bg"}


@app.middleware("http")
async def require_login(request: Request, call_next):
    path = request.url.path
    if path in PUBLIC_EXACT or path.startswith("/api/auth/"):
        request.state.user = auth.user_from_request(request)   # rotas públicas ainda sabem quem está logado
        return await call_next(request)
    user = auth.user_from_request(request)
    if not user:
        if path.startswith("/api/"):
            return JSONResponse({"detail": "Sessão expirada. Entre de novo."}, status_code=401)
        nxt = "" if path in ("/", "/index.html") else f"?next={quote(path)}"
        return RedirectResponse(f"/login.html{nxt}", status_code=303)
    request.state.user = user
    if path.startswith("/api/") and not path.startswith(("/api/account/", "/api/auth/")) and auth.needs_enroll(user, twofa_policy()):
        return JSONResponse({"detail": "Configure o duplo fator (2FA) para continuar", "enroll": True}, status_code=403)
    return await call_next(request)


CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'")
MAX_BODY = 8 * 1024 * 1024
EXTRA_ORIGINS = {o.strip().rstrip("/") for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()}


@app.middleware("http")
async def security_layer(request: Request, call_next):
    method = request.method.upper()
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        # pedido vindo de outro site (CSRF): o navegador manda Origin; comparamos com o endereço da própria dashboard
        origin = (request.headers.get("origin") or "").rstrip("/")
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        if origin and origin not in EXTRA_ORIGINS and origin.split("://", 1)[-1] != host:
            return JSONResponse({"detail": "Origem não permitida"}, status_code=403)
        if not origin and request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "Origem não permitida"}, status_code=403)
        try:
            if int(request.headers.get("content-length") or 0) > MAX_BODY:
                return JSONResponse({"detail": "Pedido grande demais"}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Content-Length inválido"}, status_code=400)
    resp = await call_next(request)
    h = resp.headers
    h.setdefault("Content-Security-Policy", CSP)
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "no-referrer")
    h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
    h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if request.url.path.startswith("/api/"):
        h["Cache-Control"] = "no-store"
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        h.setdefault("Strict-Transport-Security", "max-age=31536000")
    return resp


def _set_cookie(request, resp, user, remember):
    token, exp = auth.make_session(user, remember)
    secure = os.getenv("COOKIE_SECURE", "auto").lower()
    is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    resp.set_cookie(auth.COOKIE, token, httponly=True, samesite="lax", path="/",
                    secure=is_https if secure == "auto" else secure == "true",
                    max_age=(exp - int(time.time())) if remember else None)
    return resp


def _ip(request):
    return request.client.host if request.client else "?"


@app.get("/api/auth/status")
async def api_auth_status(request: Request):
    u = auth.user_from_request(request)
    return dict(mode=auth.MODE, setup=auth.MODE == "local" and not auth.load_users(),
                user=(auth.public(u) if "hash" in u else u) if u else None,
                must_enroll=auth.needs_enroll(u, twofa_policy()), policy=twofa_policy())


@app.post("/api/auth/setup")
async def api_auth_setup(request: Request, body: dict = Body(...)):
    """Cria o primeiro administrador. Só funciona enquanto não existir nenhum usuário."""
    if auth.MODE != "local" or auth.load_users():
        raise HTTPException(403, "A configuração inicial já foi feita")
    ip = _ip(request)
    if auth.locked(ip, "#setup"):
        raise HTTPException(429, "Muitas tentativas. Espere alguns minutos e tente de novo.")
    code = auth.setup_code()
    given = str(body.get("setup_code") or "").strip().upper()
    if not code or not hmac.compare_digest(given, code):
        auth.register_fail(ip, "#setup")
        await asyncio.sleep(0.5)
        raise HTTPException(401, "Código de configuração incorreto. Ele aparece no log do container (docker compose logs).")
    name = auth.valid_username(body.get("username"))
    if not name:
        raise HTTPException(400, "Usuário inválido: use 2 a 32 letras, números, ponto, hífen ou sublinhado")
    err = auth.check_password_rules(body.get("password"))
    if err:
        raise HTTPException(400, err)
    u = dict(username=name, role="admin", hash=auth.hash_password(body["password"]), pw_v=1, created=int(time.time()))
    auth.save_users([u])
    log.info("Administrador %s criado", name)
    return _set_cookie(request, JSONResponse({"ok": True}), u, False)


@app.post("/api/auth/login")
async def api_auth_login(request: Request, body: dict = Body(...)):
    if auth.MODE != "local":
        raise HTTPException(400, "Login local desativado")
    name, pw, ip = str(body.get("username", "")).strip().lower(), str(body.get("password", "")), _ip(request)
    if auth.locked(ip, name):
        raise HTTPException(429, "Muitas tentativas. Espere alguns minutos e tente de novo.")
    u = auth.find(name)
    ok = auth.verify_password(pw, u["hash"]) if u else auth.verify_password(pw, auth.hash_password("x"))  # mesmo tempo
    if not (u and ok):
        if auth.register_fail(ip, name) == 5:
            notify.security(notify_cfg(), "Login bloqueado", f"5 senhas erradas para o usuário '{name}' a partir de {ip}. Bloqueio de 5 minutos.")
        log.warning("Login recusado para %s de %s", name, ip)
        await asyncio.sleep(0.5)
        raise HTTPException(401, "Usuário ou senha incorretos")
    auth.clear_fails(ip, name)
    if u.get("totp_on"):
        return {"need_2fa": True, "ticket": auth.make_ticket(u, bool(body.get("remember")))}
    _login_ok(u, ip)
    return _set_cookie(request, JSONResponse({"ok": True}), u, bool(body.get("remember")))


def _login_ok(u, ip):
    if notify_cfg().get("login_ok"):
        notify.security(notify_cfg(), "Novo login", f"{u['username']} entrou a partir de {ip}")


@app.post("/api/auth/2fa")
async def api_auth_2fa(request: Request, body: dict = Body(...)):
    u, remember = auth.read_ticket(str(body.get("ticket", "")))
    if not u:
        raise HTTPException(401, "O tempo para digitar o código acabou. Entre de novo.")
    ip, name = _ip(request), u["username"]
    if auth.locked(ip, name + "#2fa") or auth.locked(ip, ""):
        raise HTTPException(429, "Muitas tentativas. Espere alguns minutos e tente de novo.")
    code = str(body.get("code", "")).strip()
    used = {}

    def check(x):
        c = auth.totp_check(x.get("totp_secret"), code, x.get("totp_last", 0))
        if c:
            x["totp_last"] = c
            used["ok"] = "app"
        elif len(code) > 8 and auth.use_recovery(x, code):
            used["ok"] = "recovery"
    auth.update_user(name, check)
    if not used:
        if auth.register_fail(ip, name + "#2fa") == 5:
            notify.security(notify_cfg(), "2FA bloqueado", f"5 códigos errados para '{name}' a partir de {ip}. A senha dessa conta está correta: troque-a se não foi você.")
        await asyncio.sleep(0.5)
        raise HTTPException(401, "Código incorreto")
    auth.clear_fails(ip, name + "#2fa")
    if used["ok"] == "recovery":
        left = len(auth.find(name).get("recovery") or [])
        notify.security(notify_cfg(), "Código de recuperação usado", f"{name} entrou com um código de recuperação ({left} restantes).")
    _login_ok(u, ip)
    return _set_cookie(request, JSONResponse({"ok": True, "recovery_used": used["ok"] == "recovery"}), auth.find(name), remember)


# ---------------- duplo fator: minha conta ----------------
@app.get("/api/account/2fa")
async def api_2fa_info(request: Request):
    u = auth.find(request.state.user["username"]) or {}
    return dict(enabled=bool(u.get("totp_on")), recovery_left=len(u.get("recovery") or []), policy=twofa_policy(),
                required=auth.needs_enroll({**u, "totp_on": False}, twofa_policy()) if u else False, local=auth.MODE == "local")


@app.post("/api/account/2fa/start")
async def api_2fa_start(request: Request):
    if auth.MODE != "local":
        raise HTTPException(400, "O 2FA é feito pelo seu provedor de login")
    name, secret = request.state.user["username"], auth.totp_new_secret()
    auth.update_user(name, lambda x: x.update(totp_pending=secret))
    uri = auth.totp_uri(name, secret)
    return dict(secret=" ".join(secret[i:i + 4] for i in range(0, len(secret), 4)), uri=uri, qr=auth.qr_svg(uri))


@app.post("/api/account/2fa/confirm")
async def api_2fa_confirm(request: Request, body: dict = Body(...)):
    name, out = request.state.user["username"], {}

    def go(x):
        c = auth.totp_check(x.get("totp_pending"), body.get("code"))
        if not c:
            return
        codes, hashes = auth.new_recovery_codes()
        x.update(totp_secret=x.pop("totp_pending"), totp_on=True, totp_last=c, recovery=hashes)
        out["codes"] = codes
    auth.update_user(name, go)
    if not out:
        raise HTTPException(400, "Código incorreto. Confira o horário do celular e tente o código atual.")
    notify.security(notify_cfg(), "2FA ativado", f"{name} ativou o duplo fator.")
    return {"ok": True, "codes": out["codes"]}


@app.post("/api/account/2fa/disable")
async def api_2fa_disable(request: Request, body: dict = Body(...)):
    name = request.state.user["username"]
    u = auth.find(name)
    if auth.needs_enroll({**u, "totp_on": False}, twofa_policy()):
        raise HTTPException(400, "O 2FA é obrigatório para a sua conta")
    if not u or not auth.verify_password(str(body.get("password", "")), u["hash"]):
        raise HTTPException(400, "Senha incorreta")
    auth.update_user(name, lambda x: [x.pop(k, None) for k in ("totp_secret", "totp_on", "totp_last", "recovery", "totp_pending")])
    notify.security(notify_cfg(), "2FA desativado", f"{name} desativou o duplo fator.")
    return {"ok": True}


@app.post("/api/account/2fa/recovery")
async def api_2fa_recovery(request: Request, body: dict = Body(...)):
    name, out = request.state.user["username"], {}

    def go(x):
        if x.get("totp_on") and auth.totp_check(x.get("totp_secret"), body.get("code"), x.get("totp_last", 0)):
            codes, hashes = auth.new_recovery_codes()
            x["recovery"] = hashes
            out["codes"] = codes
    auth.update_user(name, go)
    if not out:
        raise HTTPException(400, "Código incorreto")
    return {"ok": True, "codes": out["codes"]}


# ---------------- notificações e aparência ----------------
@app.post("/api/notify/test")
async def api_notify_test(request: Request, body: dict = Body(...)):
    require_admin(request)
    cfg = _notify_from_body(body)
    try:
        await notify.send(cfg, f"✅ <b>{branding.load()['app_name']}</b>\nNotificações do Telegram funcionando.", silent=False)
    except notify.NotifyError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True}


@app.post("/api/notify/chats")
async def api_notify_chats(request: Request, body: dict = Body(...)):
    require_admin(request)
    cfg = _notify_from_body(body)
    try:
        return {"chats": await notify.discover_chats(cfg["telegram"]["bot_token"])}
    except notify.NotifyError as e:
        raise HTTPException(400, str(e)) from e


def _notify_from_body(body):
    cfg = cfgmod._merge(cfgmod.DEFAULT_SETTINGS["notify"], body.get("notify") or {})
    if cfg["telegram"].get("bot_token") == cfgmod.MASK:
        cfg["telegram"]["bot_token"] = ((cfgmod.load()["settings"].get("notify") or {}).get("telegram") or {}).get("bot_token", "")
    cfg = cfgmod.resolve(cfg)
    if not cfg["telegram"].get("bot_token"):
        raise HTTPException(400, "Informe o token do bot")
    return cfg


@app.get("/api/branding")
async def api_branding():
    return branding.load()


@app.put("/api/branding")
async def api_branding_put(request: Request, body: dict = Body(...)):
    require_admin(request)
    errs = branding.save(body)
    if errs:
        raise HTTPException(400, "; ".join(errs))
    return branding.load()


@app.get("/branding/{kind}")
async def branding_image(kind: str):
    if kind not in ("logo", "bg"):
        raise HTTPException(404)
    data, mime = branding.image(kind)
    if not data:
        raise HTTPException(404)
    # SVG enviado pelo usuário nunca executa script, mesmo aberto direto
    return Response(data, media_type=mime, headers={"Cache-Control": "public, max-age=86400",
                                                     "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
                                                     "X-Content-Type-Options": "nosniff"})


@app.post("/api/auth/logout")
async def api_auth_logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(auth.COOKIE, path="/")
    return resp


@app.post("/api/account/password")
async def api_account_password(request: Request, body: dict = Body(...)):
    me = request.state.user
    if auth.MODE != "local":
        raise HTTPException(400, "Senha gerenciada pelo seu provedor de login")
    users = auth.load_users()
    u = next((x for x in users if x["username"] == me["username"]), None)
    if not u or not auth.verify_password(str(body.get("current", "")), u["hash"]):
        raise HTTPException(400, "Senha atual incorreta")
    err = auth.check_password_rules(body.get("new"))
    if err:
        raise HTTPException(400, err)
    u.update(hash=auth.hash_password(body["new"]), pw_v=u.get("pw_v", 1) + 1)
    auth.save_users(users)
    return _set_cookie(request, JSONResponse({"ok": True}), u, False)


@app.post("/api/account/logout-all")
async def api_logout_all(request: Request):
    """Invalida todas as sessões da conta (inclusive em outros aparelhos) e renova a atual."""
    if auth.MODE != "local":
        raise HTTPException(400, "Sessões gerenciadas pelo seu provedor de login")
    u = auth.update_user(request.state.user["username"], lambda x: x.update(pw_v=x.get("pw_v", 1) + 1))
    notify.security(notify_cfg(), "Sessões encerradas", f"{u['username']} saiu de todos os dispositivos.")
    return _set_cookie(request, JSONResponse({"ok": True}), u, False)


@app.get("/api/users")
async def api_users(request: Request):
    require_admin(request)
    return [auth.public(u) for u in auth.load_users()]


@app.post("/api/users")
async def api_users_add(request: Request, body: dict = Body(...)):
    require_admin(request)
    users = auth.load_users()
    name = auth.valid_username(body.get("username"))
    if not name:
        raise HTTPException(400, "Usuário inválido: use 2 a 32 letras, números, ponto, hífen ou sublinhado")
    if any(u["username"] == name for u in users):
        raise HTTPException(400, "Esse usuário já existe")
    if body.get("role") not in auth.ROLES:
        raise HTTPException(400, "Papel inválido")
    err = auth.check_password_rules(body.get("password"))
    if err:
        raise HTTPException(400, err)
    users.append(dict(username=name, role=body["role"], hash=auth.hash_password(body["password"]), pw_v=1,
                      created=int(time.time())))
    auth.save_users(users)
    notify.security(notify_cfg(), "Usuário criado", f"{request.state.user['username']} criou '{name}' ({body['role']}).")
    return {"ok": True}


@app.put("/api/users/{name}")
async def api_users_edit(name: str, request: Request, body: dict = Body(...)):
    me = require_admin(request)
    users = auth.load_users()
    u = next((x for x in users if x["username"] == name), None)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if "role" in body:
        if body["role"] not in auth.ROLES:
            raise HTTPException(400, "Papel inválido")
        if u["role"] == "admin" and body["role"] != "admin" and sum(x["role"] == "admin" for x in users) == 1:
            raise HTTPException(400, "Precisa existir pelo menos um administrador")
        if u["username"] == me["username"] and body["role"] != "admin":
            raise HTTPException(400, "Você não pode tirar o seu próprio acesso de administrador")
        u["role"] = body["role"]
    if body.get("reset_2fa"):
        for k in ("totp_secret", "totp_on", "totp_last", "recovery", "totp_pending"):
            u.pop(k, None)
        notify.security(notify_cfg(), "2FA zerado", f"{me['username']} zerou o duplo fator de {name}.")
    if body.get("password"):
        err = auth.check_password_rules(body["password"])
        if err:
            raise HTTPException(400, err)
        u.update(hash=auth.hash_password(body["password"]), pw_v=u.get("pw_v", 1) + 1)  # derruba sessões abertas
    auth.save_users(users)
    return {"ok": True}


@app.delete("/api/users/{name}")
async def api_users_delete(name: str, request: Request):
    me = require_admin(request)
    users = auth.load_users()
    if name == me["username"]:
        raise HTTPException(400, "Você não pode remover a sua própria conta")
    rest = [u for u in users if u["username"] != name]
    if len(rest) == len(users):
        raise HTTPException(404, "Usuário não encontrado")
    if not any(u["role"] == "admin" for u in rest):
        raise HTTPException(400, "Precisa existir pelo menos um administrador")
    auth.save_users(rest)
    return {"ok": True}


# ---------------- diagrama ----------------
@app.get("/api/diagram")
async def api_diagram():
    return diagram.load()


@app.get("/api/diagram/default")
async def api_diagram_default():
    return diagram.default()


@app.put("/api/diagram")
async def api_diagram_put(request: Request, body: dict = Body(...)):
    require_admin(request)
    errs = diagram.validate(body)
    if errs:
        raise HTTPException(400, "; ".join(errs))
    diagram.save(body)
    return {"ok": True}


app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "web"), html=True), name="web")
