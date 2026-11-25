"""TrueNAS: JSON-RPC 2.0 por WebSocket (25.04+) ou REST (versões antigas)."""
import asyncio
import json
import ssl

import websockets

from .base import SSL, URL, Collector, F, gib, host, pct


class TrueNAS(Collector):
    type, label, page, makes_hosts = "truenas", "TrueNAS", "armazenamento", True
    description = "Pools ZFS, scrub, alertas e apps."
    fields = [
        URL("https://192.168.1.12"),
        F("api_key", "Chave de API", "secret", required=True, help="Menu do usuário › API Keys"),
        F("api_mode", "Tipo de API", "select", default="ws",
          options=[["ws", "WebSocket (25.04 ou mais novo)"], ["rest", "REST (versões antigas)"]]),
        SSL,
    ]

    async def _ws(self):
        ws_url = self.base_url.replace("https://", "wss://").replace("http://", "ws://") + "/api/current"
        ctx = None
        if ws_url.startswith("wss://"):
            ctx = ssl.create_default_context()
            if not self.verify:
                ctx.check_hostname, ctx.verify_mode = False, ssl.CERT_NONE
        out = {}
        async with websockets.connect(ws_url, ssl=ctx, open_timeout=self.timeout, max_size=2**24) as ws:
            seq = 0

            async def call(method, params=None):
                nonlocal seq
                seq += 1
                await ws.send(json.dumps({"jsonrpc": "2.0", "id": seq, "method": method, "params": params or []}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), self.timeout))
                    if msg.get("id") == seq:
                        if "error" in msg:
                            raise RuntimeError(f"{method}: {msg['error'].get('message')}")
                        return msg.get("result")

            if not await call("auth.login_with_api_key", [self.opt("api_key")]):
                raise RuntimeError("Chave de API do TrueNAS recusada")
            out["info"] = await call("system.info")
            out["pools"] = await call("pool.query")
            out["alerts"] = await call("alert.list")
            try:
                out["apps"] = await call("app.query", [[], {"select": ["name", "state"]}])
            except Exception:
                out["apps"] = []
            try:  # uma amostra de CPU/RAM em tempo real
                await call("core.subscribe", ["reporting.realtime"])
                loop = asyncio.get_running_loop()
                end = loop.time() + 4
                while loop.time() < end:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), 4))
                    if msg.get("method") == "collection_update":
                        out["realtime"] = (msg.get("params") or {}).get("fields", {})
                        break
            except Exception:
                pass
        return out

    async def _rest(self):
        base = self.base_url + "/api/v2.0"
        async with self.client(headers={"Authorization": f"Bearer {self.opt('api_key')}"}) as c:
            info = (await c.get(f"{base}/system/info")).raise_for_status().json()
            return {"info": info, "pools": (await c.get(f"{base}/pool")).json(),
                    "alerts": (await c.get(f"{base}/alert/list")).json(), "apps": []}

    async def collect(self):
        rest = self.opt("api_mode") == "rest"
        data = await (self._rest() if rest else self._ws())
        info, rt = data["info"] or {}, data.get("realtime") or {}
        thr = self.settings["thresholds"]
        events, pools = [], []

        cpu = mem = None
        for path in (("cpu", "cpu", "usage"), ("cpu", "average", "usage")):
            try:
                cpu = round(float(rt[path[0]][path[1]][path[2]]), 1)
                break
            except Exception:
                pass
        memf = rt.get("memory") or {}
        total = memf.get("physical_memory_total") or info.get("physmem")
        if total and memf.get("physical_memory_available") is not None:
            mem = pct(total - memf["physical_memory_available"], total)
        load = (info.get("loadavg") or [None])[0]
        if cpu is None and load is not None and info.get("cores"):
            cpu = round(min(100, load / info["cores"] * 100), 1)

        worst = None
        for p in data["pools"] or []:
            used = pct(p.get("allocated"), p.get("size"))
            scan = p.get("scan") or {}
            pools.append(dict(name=p.get("name"), status=p.get("status"), healthy=p.get("healthy"), used=used,
                              text=f"{gib(p.get('allocated'))} / {gib(p.get('size'))}",
                              scan=scan.get("function"), scan_state=scan.get("state"), scan_errors=scan.get("errors")))
            if not p.get("healthy", True) or p.get("status") not in ("ONLINE", None):
                events.append(self.ev("crit", f"Pool {p.get('name')} {p.get('status')}", "Verifique os discos no TrueNAS"))
            elif used and used >= thr["disk_warn"]:
                events.append(self.ev("crit" if used >= thr["disk_crit"] else "warn", f"Pool {p.get('name')} em {used}%",
                                      "ZFS perde desempenho acima de 80%"))
            worst = max(worst or 0, used or 0)

        alerts = []
        for a in data["alerts"] or []:
            if a.get("dismissed"):
                continue
            lvl = str(a.get("level", "INFO")).upper()
            alerts.append(dict(level=lvl, text=a.get("formatted") or a.get("klass")))
            if lvl in ("CRITICAL", "ALERT", "EMERGENCY", "ERROR"):
                events.append(self.ev("crit", f"Alerta {self.name}", (a.get("formatted") or "")[:140]))
            elif lvl == "WARNING":
                events.append(self.ev("warn", f"Aviso {self.name}", (a.get("formatted") or "")[:140]))

        h = host(self.id, info.get("hostname") or self.name, "truenas", badges=["NAS"],
                 os=f"TrueNAS {info.get('version', '')}".strip(), cpu=cpu, mem=mem,
                 mem_text=gib(total) if total else None, disk=worst, disk_text="pior pool",
                 uptime=info.get("uptime_seconds"), cores=info.get("cores"), load=load,
                 note=f"{len(pools)} pools, {len(alerts)} alertas")
        return self.result(hosts=[h], events=events,
                           details=dict(pools=pools, alerts=alerts, version=info.get("version"),
                                        api="REST" if rest else "WebSocket",
                                        apps=[dict(name=a.get("name"), state=a.get("state")) for a in data.get("apps") or []]))
