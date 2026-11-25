"""Home Assistant — somente leitura.

- Cômodos: lidos das áreas do Home Assistant (API de template).
- Tomadas: dispositivos com sensor de potência (W); custo vem das estatísticas
  de energia do próprio HA (recorder/statistics_during_period via WebSocket).
- Luzes: entidades light.* e switch.* sem medição de potência.
- Zigbee: bateria, qualidade de sinal (LQI) e disponibilidade.

Nenhum comando é enviado ao Home Assistant.
"""
import datetime as dt
import json
import re
import ssl
import time

import websockets

from .base import SSL, URL, Collector, F

# Uma chamada só devolve áreas → entidades → dispositivo
AREAS_TEMPLATE = r"""{%- set ns = namespace(out=[]) -%}
{%- for a in areas() -%}
{%- set es = namespace(l=[]) -%}
{%- for e in area_entities(a) -%}
{%- set d = device_id(e) -%}
{%- set dn = (device_attr(d, "name_by_user") or device_attr(d, "name")) if d else "" -%}
{%- set es.l = es.l + [[e, d or "", dn or ""]] -%}
{%- endfor -%}
{%- set ns.out = ns.out + [{"id": a, "name": area_name(a), "entities": es.l}] -%}
{%- endfor -%}
{{ {"areas": ns.out, "frigate": integration_entities("frigate") | select("match", "^camera[.]") | list} | tojson }}"""

CACHE_REGISTRY = 600   # áreas mudam pouco: relê a cada 10 min
CACHE_STATS = 600      # estatísticas de energia do HA são por hora


def _num(s):
    try:
        return float(s["state"])
    except (TypeError, ValueError, KeyError):
        return None


def _attr(s, k):
    return (s or {}).get("attributes", {}).get(k)


def _ts(iso):
    try:
        return dt.datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _key(eid):
    return re.sub(r"[^a-z0-9]+", "-", eid.split(".", 1)[-1].lower()).strip("-")[:60]


def build_house(states, registry, stats, opts, tariff, fallback=None):
    """Monta cômodos, tomadas, luzes e saúde Zigbee a partir dos estados do HA.
    states: {entity_id: state}; registry: [{id, name, entities: [[eid, device_id, device_name]]}]
    stats: {energy_entity_id: {today, d7, d30}} em kWh; fallback(key) -> idem ou None."""
    wanted = {x.lower() for x in opts.get("areas") or []}
    ignore = set(opts.get("ignore") or [])
    rack_eid = opts.get("power_entity") or ""
    rooms, zigbee, now = [], [], time.time()

    for area in registry:
        if wanted and area["name"].lower() not in wanted and area["id"].lower() not in wanted:
            continue
        groups = {}
        for eid, dev, dname in area["entities"]:
            if eid in ignore or eid not in states:
                continue
            groups.setdefault(dev or eid, {"name": dname, "eids": []})["eids"].append(eid)

        lights, plugs = [], []
        for g in groups.values():
            ss = [states[e] for e in g["eids"]]
            sensor = lambda dc: next((s for s in ss if s["entity_id"].startswith("sensor.") and _attr(s, "device_class") == dc), None)  # noqa: E731
            power, energy, batt = sensor("power"), sensor("energy"), sensor("battery")
            lqi = next((s for s in ss if "linkquality" in s["entity_id"] or
                        (_attr(s, "device_class") == "signal_strength" and str(_attr(s, "unit_of_measurement")).lower() == "lqi")), None)
            sw = [s for s in ss if s["entity_id"].split(".")[0] in ("light", "switch")]
            if not (power or sw or batt or lqi):
                continue
            down = all(s["state"] == "unavailable" for s in (sw or ss))
            name = g["name"] or _attr((sw or ss)[0], "friendly_name") or (sw or ss)[0]["entity_id"]
            if batt or lqi or down:
                zigbee.append(dict(name=name, room=area["name"], unavailable=down,
                                   battery=_num(batt) if batt else None, lqi=_num(lqi) if lqi else None))
            rest = sw
            if power:
                w = _num(power)
                if w is not None and _attr(power, "unit_of_measurement") == "kW":
                    w *= 1000
                plug_sw = next((s for s in sw if s["entity_id"].startswith("switch.")), None)
                rest = [s for s in sw if s is not plug_sw]
                key = _key(power["entity_id"])
                st = (stats.get(energy["entity_id"]) if energy else None) or (fallback(key) if fallback else None) or {}
                plugs.append(dict(
                    key=key, name=name, room=area["name"], power=round(w, 1) if w is not None else None,
                    on=(plug_sw["state"] == "on") if plug_sw else (w or 0) > 1,
                    unavailable=down or power["state"] == "unavailable",
                    since=_ts(plug_sw.get("last_changed")) if plug_sw else None,
                    rack=power["entity_id"] == rack_eid,
                    measured="medidor" if energy and energy["entity_id"] in stats else "estimado",
                    kwh={k: round(st.get(k, 0) or 0, 3) for k in ("today", "d7", "d30")},
                    cost={k: round((st.get(k, 0) or 0) * tariff, 2) for k in ("today", "d7", "d30")}))
            for s in rest:
                lights.append(dict(id=s["entity_id"], name=_attr(s, "friendly_name") or s["entity_id"],
                                   on=s["state"] == "on", unavailable=s["state"] == "unavailable",
                                   since=_ts(s.get("last_changed")), room=area["name"],
                                   brightness=round(_attr(s, "brightness") / 2.55) if _attr(s, "brightness") else None))
        if lights or plugs:
            lights.sort(key=lambda x: x["name"])
            plugs.sort(key=lambda x: -(x["power"] or 0))
            rooms.append(dict(id=area["id"], name=area["name"], lights=lights, plugs=plugs,
                              power=round(sum(p["power"] or 0 for p in plugs), 1),
                              lights_on=len([x for x in lights if x["on"]])))

    if wanted:  # respeita a ordem escolhida pelo usuário
        order = [x.lower() for x in opts["areas"]]
        rooms.sort(key=lambda r: order.index(r["name"].lower()) if r["name"].lower() in order else
                   (order.index(r["id"].lower()) if r["id"].lower() in order else 99))
    bw, lw = float(opts.get("battery_warn") or 0), float(opts.get("lqi_warn") or 0)
    for z in zigbee:
        z["issue"] = z["unavailable"] or (z["battery"] is not None and z["battery"] <= bw) or \
            (z["lqi"] is not None and z["lqi"] <= lw)
    plugs = [p for r in rooms for p in r["plugs"]]
    lights = [x for r in rooms for x in r["lights"]]
    total = lambda k: round(sum(p["cost"][k] for p in plugs), 2)  # noqa: E731
    return dict(
        rooms=rooms, zigbee=sorted(zigbee, key=lambda z: (not z["unavailable"], z["battery"] or 101)),
        power=round(sum(p["power"] or 0 for p in plugs), 1),
        lights_on=len([x for x in lights if x["on"]]), lights_total=len(lights), plugs_total=len(plugs),
        cost=dict(today=total("today"), d7=total("d7"), d30=total("d30")),
        kwh=dict(today=round(sum(p["kwh"]["today"] for p in plugs), 2), d30=round(sum(p["kwh"]["d30"] for p in plugs), 1)),
        updated=int(now))


SUFFIX = re.compile(r"_(power|energy|linkquality|battery|current|voltage|consumo|potencia|energia)$")


def _plain(t):
    import unicodedata
    return unicodedata.normalize("NFKD", str(t)).encode("ascii", "ignore").decode().lower().replace(" ", "_")


def registry_by_name(states, areas):
    """Plano B sem permissão de template: cômodo = nome da área contido no
    entity_id ou no nome amigável; dispositivo = entity_id sem o sufixo."""
    out = []
    for a in areas:
        key, ents = _plain(a), []
        for eid, s in states.items():
            if eid.split(".")[0] not in ("light", "switch", "sensor"):
                continue
            if key in _plain(eid) or key in _plain(_attr(s, "friendly_name") or ""):
                stem = SUFFIX.sub("", eid.split(".", 1)[1])
                main = states.get(f"switch.{stem}") or states.get(f"light.{stem}")
                ents.append([eid, stem, _attr(main, "friendly_name") or ""])
        out.append(dict(id=key, name=a, entities=ents))
    return out


def build_cameras(states, wanted, frigate):
    """Câmeras do Frigate a partir das entidades que a integração cria no HA:
    camera.<cam>, sensor.<cam>_camera_fps, binary_sensor.<cam>_motion,
    sensor.<cam>_<objeto>_count, switch.<cam>_detect e switch.<cam>_recordings."""
    names = {}
    for item in wanted:
        eid, _, name = item.partition("=")
        names[eid.strip()] = name.strip()
    ids = list(names) or frigate or sorted(e for e in states if e.startswith("camera."))
    cams = []
    for eid in ids:
        s, base = states.get(eid), eid.split(".", 1)[-1]
        fps_s = states.get(f"sensor.{base}_camera_fps")
        fps = _num(fps_s) if fps_s else None
        objects = {}
        for k, v in states.items():
            if k.startswith(f"sensor.{base}_") and k.endswith("_count") and not k.endswith("_all_count"):
                n = _num(v)
                if n:
                    objects[k[len(f"sensor.{base}_"):-len("_count")].replace("_", " ")] = int(n)
        sw = lambda name: (states.get(f"switch.{base}_{name}") or {}).get("state")  # noqa: E731
        online = bool(s) and s["state"] != "unavailable" and (fps is None or fps > 0)
        cams.append(dict(id=eid, name=names.get(eid) or _attr(s, "friendly_name") or base.replace("_", " ").title(),
                         online=online, state=(s or {}).get("state", "não encontrada"), fps=fps,
                         motion=(states.get(f"binary_sensor.{base}_motion") or {}).get("state") == "on",
                         objects=objects, detect=sw("detect"), recordings=sw("recordings"),
                         since=_ts((s or {}).get("last_changed"))))
    return cams


def house_events(house, opts, page):
    evs, now = [], time.time()
    long_h = float(opts.get("light_on_alert_h") or 0)
    for x in [x for r in house["rooms"] for x in r["lights"]]:
        if x["on"] and long_h and x["since"] and now - x["since"] > long_h * 3600:
            evs.append(dict(level="info", title=f"{x['name']} acesa há {int((now - x['since']) / 3600)} h",
                            detail=x["room"], source=page))
    high = float(opts.get("plug_high_w") or 0)
    for p in [p for r in house["rooms"] for p in r["plugs"]]:
        if high and (p["power"] or 0) > high and not p["rack"]:
            evs.append(dict(level="warn", title=f"{p['name']} consumindo {p['power']:.0f} W",
                            detail=f"{p['room']}: acima de {high:.0f} W", source=page))
    if opts.get("camera_offline_alert", True):
        for cam in house.get("cameras") or []:
            if not cam["online"]:
                evs.append(dict(level="crit", title=f"Câmera {cam['name']} offline",
                                detail="Sem imagem no Frigate" if cam["state"] != "não encontrada" else "Entidade não encontrada", source=page))
    bw, lw = float(opts.get("battery_warn") or 0), float(opts.get("lqi_warn") or 0)
    for z in house["zigbee"]:
        if z["unavailable"]:
            evs.append(dict(level="warn", title=f"{z['name']} indisponível", detail=f"Zigbee · {z['room']}", source=page))
        elif z["battery"] is not None and z["battery"] <= bw:
            evs.append(dict(level="warn", title=f"Bateria fraca: {z['name']}", detail=f"{z['battery']:.0f}% · {z['room']}", source=page))
        elif z["lqi"] is not None and z["lqi"] <= lw:
            evs.append(dict(level="info", title=f"Sinal Zigbee fraco: {z['name']}", detail=f"LQI {z['lqi']:.0f} · {z['room']}", source=page))
    return evs


class HomeAssistant(Collector):
    type, label, page = "homeassistant", "Home Assistant", "casa"
    description = "Cômodos, luzes, tomadas com consumo e dispositivos Zigbee (somente leitura)."
    fields = [
        URL("http://192.168.1.13:8123"),
        F("token", "Token de longa duração", "secret", required=True, help="Perfil › Segurança"),
        F("areas", "Cômodos a mostrar (na ordem)", "list", placeholder="Cozinha\nSala\nSuíte\nEscritório\nSegundo quarto",
          help="Nomes das áreas do Home Assistant. Vazio mostra todas que têm luzes ou tomadas."),
        F("ignore", "Entidades para esconder", "list", placeholder="switch.tomada_teste"),
        F("power_entity", "Sensor de potência do rack (W)", placeholder="sensor.tomada_rack_power",
          help="A tomada que alimenta o homelab. Usada no custo da Visão geral."),
        F("light_on_alert_h", "Avisar luz acesa há mais de (horas)", "number", default=6, help="0 desliga"),
        F("plug_high_w", "Avisar tomada acima de (W)", "number", default=0, help="0 desliga"),
        F("battery_warn", "Avisar bateria abaixo de (%)", "number", default=20),
        F("lqi_warn", "Avisar sinal Zigbee (LQI) abaixo de", "number", default=30),
        F("camera_view", "Câmeras do Frigate", "select", default="image",
          options=[["image", "Mostrar imagem e status"], ["status", "Só status (online ou offline)"], ["off", "Não mostrar"]]),
        F("cameras", "Câmeras (na ordem)", "list", placeholder="camera.garagem=Garagem",
          help="Vazio mostra todas as câmeras do Frigate. Use =Nome para renomear."),
        F("camera_refresh_s", "Atualizar imagens a cada (segundos)", "number", default=10),
        F("camera_images_for", "Quem pode ver as imagens", "select", default="all",
          options=[["all", "Todos os usuários"], ["admin", "Só administradores"]]),
        F("camera_offline_alert", "Alertar quando uma câmera cair", "bool", default=True),
        F("entities", "Outras entidades para acompanhar", "list", placeholder="sensor.temperatura_rack"),
        F("unavailable_warn", "Avisar com mais de N entidades indisponíveis", "number", default=10),
        SSL,
    ]
    registry_mode = "areas"
    store = None  # definido pelo main para estimar kWh de tomadas sem sensor de energia

    def __init__(self, inst, settings):
        super().__init__(inst, settings)
        self._reg, self._reg_ts, self._stats, self._stats_ts = [], 0, {}, 0
        self._frigate, self._cam_ids, self._snaps = [], set(), {}
        self._live, self._live_ts = None, 0

    def headers(self):
        return {"Authorization": f"Bearer {self.opt('token')}"}

    @property
    def opts(self):
        return dict(areas=self.opt_list("areas"), ignore=self.opt_list("ignore"),
                    power_entity=self.opt("power_entity"), light_on_alert_h=self.opt("light_on_alert_h"),
                    plug_high_w=self.opt("plug_high_w"), battery_warn=self.opt("battery_warn"),
                    lqi_warn=self.opt("lqi_warn"), camera_offline_alert=self.opt("camera_offline_alert"))

    @property
    def camera_cfg(self):
        return dict(view=self.opt("camera_view"), refresh=max(2, int(self.opt("camera_refresh_s") or 10)),
                    images_for=self.opt("camera_images_for"))

    def add_cameras(self, house, states):
        cams = [] if self.opt("camera_view") == "off" else build_cameras(states, self.opt_list("cameras"), self._frigate)
        self._cam_ids = {c["id"] for c in cams}
        house.update(cameras=cams, camera_cfg=self.camera_cfg)
        return house

    async def snapshot(self, entity, width):
        """Imagem da câmera pelo proxy do HA (o token fica só no servidor). Cache de 2 s."""
        key = (entity, width)
        hit = self._snaps.get(key)
        if hit and time.time() - hit[0] < 2:
            return hit[1], hit[2]
        async with self.client() as c:
            r = await c.get(f"{self.base_url}/api/camera_proxy/{entity}", params={"width": width})
            r.raise_for_status()
        self._snaps[key] = (time.time(), r.content, r.headers.get("content-type", "image/jpeg"))
        return r.content, self._snaps[key][2]

    @property
    def tariff(self):
        return float(self.settings["energy"]["tariff"])

    def _midnight(self):
        tz = dt.timezone(dt.timedelta(hours=float(self.settings.get("tz_offset", -3))))
        n = dt.datetime.now(tz)
        return n.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()

    def _fallback(self, key):
        """kWh integrados pela própria dashboard para tomadas sem sensor de energia."""
        if not self.store:
            return None
        k = f"{self.id}.p.{key}"
        return dict(today=self.store.energy_kwh(k, time.time() - self._midnight())[0],
                    d7=self.store.energy_kwh(k, 7 * 86400)[0], d30=self.store.energy_kwh(k, 30 * 86400)[0])

    async def _states(self, c):
        return {s["entity_id"]: s for s in (await c.get(f"{self.base_url}/api/states")).raise_for_status().json()}

    async def _registry(self, c, states):
        if time.time() - self._reg_ts > CACHE_REGISTRY or not self._reg:
            r = await c.post(f"{self.base_url}/api/template", json={"template": AREAS_TEMPLATE})
            if r.status_code in (401, 403):
                # Usuário sem permissão de template: usa o nome das entidades
                self._reg, self.registry_mode = registry_by_name(states, self.opt_list("areas")), "nomes"
            else:
                r.raise_for_status()
                out = json.loads(r.text)
                self._reg, self._frigate, self.registry_mode = out["areas"], out.get("frigate") or [], "areas"
            self._reg_ts = time.time()
        return self._reg

    async def _energy_stats(self, ids):
        if not ids or (time.time() - self._stats_ts < CACHE_STATS and self._stats):
            return self._stats
        url = self.base_url.replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"
        ctx = None
        if url.startswith("wss://"):
            ctx = ssl.create_default_context()
            if not self.verify:
                ctx.check_hostname, ctx.verify_mode = False, ssl.CERT_NONE
        start = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=31)
        async with websockets.connect(url, ssl=ctx, open_timeout=self.timeout, max_size=2**24) as ws:
            await ws.recv()  # auth_required
            await ws.send(json.dumps({"type": "auth", "access_token": self.opt("token")}))
            if json.loads(await ws.recv()).get("type") != "auth_ok":
                raise RuntimeError("Token recusado pelo WebSocket do Home Assistant")
            await ws.send(json.dumps({"id": 1, "type": "recorder/statistics_during_period",
                                      "start_time": start.isoformat(), "statistic_ids": ids, "period": "hour",
                                      "types": ["change"], "units": {"energy": "kWh"}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == 1:
                    break
        if not msg.get("success"):
            raise RuntimeError(f"Estatísticas: {msg.get('error', {}).get('message')}")
        midnight, now, out = self._midnight(), time.time(), {}
        for sid, rows in (msg.get("result") or {}).items():
            agg = {"today": 0.0, "d7": 0.0, "d30": 0.0}
            for r in rows:
                t = r.get("start")
                t = t / 1000 if isinstance(t, (int, float)) else _ts(t)
                ch = r.get("change") or 0
                if t is None:
                    continue
                if t >= midnight:
                    agg["today"] += ch
                if t >= now - 7 * 86400:
                    agg["d7"] += ch
                if t >= now - 30 * 86400:
                    agg["d30"] += ch
            out[sid] = agg
        self._stats, self._stats_ts = out, time.time()
        return out

    async def _house(self, c, states):
        reg = await self._registry(c, states)
        energy_ids = sorted({eid for a in reg for eid, _, _ in a["entities"]
                             if eid in states and _attr(states[eid], "device_class") == "energy"})
        try:
            stats = await self._energy_stats(energy_ids)
        except Exception:  # noqa: BLE001 - sem estatísticas, cai na estimativa local
            stats = self._stats
        return self.add_cameras(build_house(states, reg, stats, self.opts, self.tariff, self._fallback), states)

    async def live(self):
        """Atualização rápida para a página Casa (cache de 3 s)."""
        if self._live and time.time() - self._live_ts < 3:
            return self._live
        async with self.client() as c:
            self._live = await self._house(c, await self._states(c))
            self._live_ts = time.time()
        return self._live

    async def collect(self):
        events, metrics = [], {}
        async with self.client() as c:
            cfg = (await c.get(f"{self.base_url}/api/config")).raise_for_status().json()
            by_id = await self._states(c)
            house = await self._house(c, by_id)
        self._live, self._live_ts = house, time.time()
        states = list(by_id.values())
        unavailable = [s["entity_id"] for s in states if s.get("state") in ("unavailable", "unknown")
                       and s["entity_id"].split(".")[0] in ("sensor", "switch", "light", "binary_sensor", "climate", "cover")]
        updates = [s for s in states if s["entity_id"].startswith("update.") and s.get("state") == "on"]

        power, pid = None, self.opt("power_entity")
        if pid:
            try:
                s = by_id[pid]
                power = float(s["state"]) * (1000 if _attr(s, "unit_of_measurement") == "kW" else 1)
                metrics["power.w"] = round(power, 1)
            except (KeyError, TypeError, ValueError):
                events.append(self.ev("warn", "Sensor de energia do rack sem leitura", pid))

        watch = []
        for eid in self.opt_list("entities"):
            s = by_id.get(eid)
            watch.append(dict(id=eid, name=_attr(s, "friendly_name") or eid, state=(s or {}).get("state", "não encontrada"),
                              unit=_attr(s, "unit_of_measurement") or ""))
        if len(unavailable) > int(self.opt("unavailable_warn")):
            events.append(self.ev("warn", f"{len(unavailable)} entidades indisponíveis", self.name))
        if updates:
            events.append(self.ev("info", f"{len(updates)} atualizações no {self.name}",
                                  ", ".join(_attr(u, "title") or u["entity_id"] for u in updates[:3])))
        events += house_events(house, self.opts, self.page)

        metrics[f"{self.id}.house.w"] = house["power"]
        metrics[f"{self.id}.lights_on"] = house["lights_on"]
        for r in house["rooms"]:
            for p in r["plugs"]:
                if p["power"] is not None:
                    metrics[f"{self.id}.p.{p['key']}"] = p["power"]
        cams = house.get("cameras") or []
        cam_txt = f", {len(cams)} câmeras" + (f" ({len([c for c in cams if not c['online']])} offline)" if any(not c["online"] for c in cams) else "") if cams else ""
        summary = f"{house['lights_on']} luzes acesas, casa em {house['power']:.0f} W{cam_txt}" if house["rooms"] \
            else f"{len(states)} entidades, {len(unavailable)} indisponíveis"
        return self.result(events=events, metrics=metrics,
                           services=[self.svc(version=cfg.get("version"), summary=summary)],
                           details=dict(version=cfg.get("version"), entities=len(states), unavailable=unavailable[:40],
                                        watch=watch, power_w=power, house=house, registry_mode=self.registry_mode,
                                        updates=[_attr(u, "title") or u["entity_id"] for u in updates]))
