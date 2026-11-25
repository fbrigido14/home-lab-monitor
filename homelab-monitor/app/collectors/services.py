"""Zabbix, Emby e verificações genéricas (HTTP e TCP)."""
import asyncio
import time

import httpx

from .base import SSL, URL, Collector, F, host

SEVERITY = {0: "Não classificado", 1: "Informação", 2: "Atenção", 3: "Média", 4: "Alta", 5: "Desastre"}
KINDS = [["sbc", "Placa ARM (Orange Pi, Raspberry Pi)"], ["linux", "Servidor Linux"]]


class Zabbix(Collector):
    type, label, page, makes_hosts = "zabbix", "Zabbix", "zabbix", True
    description = "Problemas ativos e métricas de hosts com Zabbix agent (ex.: Orange Pi)."
    fields = [
        URL("http://192.168.1.13/zabbix", "Endereço do frontend, sem /api_jsonrpc.php"),
        F("token", "Token de API", "secret", required=True, help="Users › API tokens"),
        F("fleet_hosts", "Hosts para mostrar na frota", "list", default="orangepi=Orange Pi 4 Pro",
          placeholder="orangepi=Orange Pi 4 Pro",
          help="Nome técnico no Zabbix, opcionalmente =Nome exibido. Um por linha."),
        F("fleet_kind", "Tipo desses hosts", "select", default="sbc", options=KINDS),
        F("temp_key", "Item de temperatura", placeholder="sensor[thermal_zone0]", help="Opcional"),
        F("min_severity", "Severidade mínima nos alertas", "select", default="2",
          options=[[str(k), v] for k, v in SEVERITY.items()]),
        SSL,
    ]

    TF = {"hour": 3600, "day": 86400, "week": 604800, "month": 2592000}
    BASE_KEYS = {"system.cpu.util": "cpu", "vm.memory.utilization": "mem", "vfs.fs.dependent.size[/,pused]": "disk",
                 "vfs.fs.size[/,pused]": "disk", "system.cpu.load[all,avg1]": "load"}

    def __init__(self, inst, settings):
        super().__init__(inst, settings)
        self.hostids, self._cache = set(), {}

    async def _rpc(self, c, method, params, auth=True):
        headers = {"Content-Type": "application/json-rpc"}
        if auth:
            headers["Authorization"] = f"Bearer {self.opt('token')}"
        r = await c.post(self.base_url + "/api_jsonrpc.php",
                         json={"jsonrpc": "2.0", "method": method, "params": params, "id": 1}, headers=headers)
        body = r.raise_for_status().json()
        if "error" in body:
            raise RuntimeError(f"{method}: {body['error'].get('data') or body['error'].get('message')}")
        return body["result"]

    async def collect(self):
        wanted = {}
        for item in self.opt_list("fleet_hosts"):
            tech, _, display = item.partition("=")
            wanted[tech.strip()] = display.strip() or tech.strip()
        temp_key, min_sev = self.opt("temp_key"), int(self.opt("min_severity"))
        keys = ["system.cpu.util", "vm.memory.utilization", "vfs.fs.size[/,pused]", "vfs.fs.dependent.size[/,pused]",
                "system.uptime", "system.cpu.num", "system.cpu.load[all,avg1]"] + ([temp_key] if temp_key else [])
        async with self.client() as c:
            version = await self._rpc(c, "apiinfo.version", {}, auth=False)
            zhosts = await self._rpc(c, "host.get", {"output": ["hostid", "host", "name", "maintenance_status"],
                                                     "selectInterfaces": ["available", "ip", "type"], "filter": {"status": 0}})
            try:
                acks = {p["objectid"]: p for p in await self._rpc(c, "problem.get", {
                    "output": ["objectid", "acknowledged", "suppressed", "clock"], "source": 0, "object": 0})}
            except RuntimeError:
                acks = {}
            try:
                perf = {i["key_"]: i.get("lastvalue") for i in await self._rpc(c, "item.get", {
                    "output": ["key_", "lastvalue"], "filter": {"key_": ["zabbix[queue]", "zabbix[requiredperformance]",
                                                                            "zabbix[items_unsupported]", "zabbix[hosts]"]}})}
            except RuntimeError:
                perf = {}
            triggers = await self._rpc(c, "trigger.get", {
                "output": ["triggerid", "description", "priority", "lastchange"], "selectHosts": ["hostid", "name"],
                "filter": {"value": 1}, "monitored": True, "skipDependent": True, "expandDescription": True,
                "sortfield": "priority", "sortorder": "DESC", "limit": 50})
            ids = {h["hostid"]: h for h in zhosts if h["host"] in wanted}
            items = await self._rpc(c, "item.get", {"output": ["hostid", "key_", "lastvalue", "lastclock"],
                                                    "hostids": list(ids), "filter": {"key_": keys}}) if ids else []

        events, hosts, problems = [], [], []
        for t in triggers:
            sev = int(t.get("priority", 0))
            hname = ", ".join(h["name"] for h in t.get("hosts", []))
            ack = acks.get(t.get("triggerid"), {})
            problems.append(dict(severity=sev, severity_text=SEVERITY.get(sev), title=t["description"],
                                 host=hname, hostids=[h["hostid"] for h in t.get("hosts", [])], since=int(t.get("lastchange", 0)),
                                 ack=ack.get("acknowledged") == "1", suppressed=ack.get("suppressed") == "1"))
            if sev >= min_sev:
                events.append(self.ev("crit" if sev >= 4 else "warn", t["description"], f"Zabbix: {hname}"))

        for hid, zh in ids.items():
            mine = [i for i in items if i["hostid"] == hid]
            v = {i["key_"]: i.get("lastvalue") for i in mine}

            def num(k, v=v):
                try:
                    return round(float(v[k]), 2)
                except (KeyError, TypeError, ValueError):
                    return None

            last = max((int(i.get("lastclock") or 0) for i in mine), default=0)
            stale = time.time() - last > 600
            name = wanted[zh["host"]]
            h = host(f"zbx-{zh['host']}".lower().replace("_", "-").replace(" ", "-"), name, self.opt("fleet_kind"),
                     "offline" if stale else "online", os="Zabbix agent",
                     cpu=num("system.cpu.util"), mem=num("vm.memory.utilization"),
                     disk=num("vfs.fs.dependent.size[/,pused]") or num("vfs.fs.size[/,pused]"),
                     uptime=num("system.uptime"), cores=num("system.cpu.num"), load=num("system.cpu.load[all,avg1]"),
                     temp=num(temp_key) if temp_key else None, badges=["Zabbix"], note=zh["host"], zbx_hostid=hid)
            if stale:
                h["note"] = "Sem dados do agente há mais de 10 min"
                events.append(self.ev("crit", f"{name} sem dados", "Agente Zabbix parou de reportar"))
            hosts.append(h)

        unavailable = [h["name"] for h in zhosts if any(str(i.get("available")) == "2" for i in h.get("interfaces", []))]
        self.hostids = {h["hostid"] for h in zhosts}
        per_host = {}
        for p in problems:
            for hid in p["hostids"]:
                per_host[hid] = max(per_host.get(hid, -1), p["severity"])
        host_list = []
        for zh in zhosts[:300]:
            av = [str(i.get("available")) for i in zh.get("interfaces", [])]
            host_list.append(dict(id=zh["hostid"], name=zh["name"], tech=zh["host"],
                                  ip=next((i.get("ip") for i in zh.get("interfaces", []) if i.get("ip")), None),
                                  available="down" if "2" in av else "up" if "1" in av else "unknown",
                                  maintenance=zh.get("maintenance_status") == "1", worst=per_host.get(zh["hostid"]),
                                  problems=len([p for p in problems if zh["hostid"] in p["hostids"]])))
        sev_count = {k: len([p for p in problems if p["severity"] == k]) for k in range(6)}
        metrics = {f"{self.id}.problems": len(problems), f"{self.id}.problems.high": sev_count[4] + sev_count[5],
                   f"{self.id}.unavailable": len(unavailable)}
        num = lambda k: float(perf[k]) if perf.get(k) not in (None, "") else None  # noqa: E731
        if num("zabbix[queue]") is not None:
            metrics[f"{self.id}.queue"] = num("zabbix[queue]")
        if num("zabbix[requiredperformance]") is not None:
            metrics[f"{self.id}.nvps"] = num("zabbix[requiredperformance]")
        return self.result(hosts=hosts, events=events, metrics=metrics,
                           services=[self.svc(version=version, summary=f"{len(problems)} problemas, {len(zhosts)} hosts")],
                           details=dict(version=version, problems=problems, hosts=len(zhosts), unavailable=unavailable,
                                        host_list=sorted(host_list, key=lambda x: (-(x["worst"] if x["worst"] is not None else -1), x["name"])),
                                        sev_count=sev_count, perf=dict(queue=num("zabbix[queue]"), nvps=num("zabbix[requiredperformance]"),
                                                                       unsupported=num("zabbix[items_unsupported]"))))

    async def series(self, kind, tf):
        """kind: "host:<hostid>" — CPU, memória, disco, carga, temperatura e rede pelo histórico do Zabbix."""
        hid = kind.split(":", 1)[1] if kind.startswith("host:") else None
        if not hid or hid not in self.hostids or tf not in self.TF:
            raise ValueError("Série desconhecida")
        key = (hid, tf)
        hit = self._cache.get(key)
        if hit and time.time() - hit[0] < 60:
            return hit[1]
        now = int(time.time())
        since = now - self.TF[tf]
        temp_key = self.opt("temp_key")
        async with self.client() as c:
            items = await self._rpc(c, "item.get", {"output": ["itemid", "key_", "value_type"], "hostids": [hid],
                                                    "filter": {"key_": list(self.BASE_KEYS) + ([temp_key] if temp_key else [])}})
            net = await self._rpc(c, "item.get", {"output": ["itemid", "key_", "value_type", "lastvalue"], "hostids": [hid],
                                                  "search": {"key_": "net.if."}, "limit": 60})
            name = {i["itemid"]: self.BASE_KEYS.get(i["key_"], "temp") for i in items}
            ifs = [i for i in net if i["key_"].startswith(("net.if.in[", "net.if.out[")) and not any(
                x in i["key_"] for x in ("lo", "docker", "veth", "br-", "virbr", "tap", "fwbr", "fwpr", "fwln"))]
            if ifs:   # a interface com mais tráfego
                top = max(ifs, key=lambda i: float(i.get("lastvalue") or 0))["key_"].split("[", 1)[1].split(",")[0].rstrip("]")
                for i in ifs:
                    if f"[{top}" in i["key_"]:
                        name[i["itemid"]] = "netin" if i["key_"].startswith("net.if.in") else "netout"
                        items.append(i)
            ser = {}
            use_trend = tf in ("week", "month")
            by_type = {}
            for i in items:
                by_type.setdefault(int(i["value_type"]), []).append(i["itemid"])
            for vt, ids in by_type.items():
                if vt not in (0, 3):
                    continue
                if use_trend:
                    rows = await self._rpc(c, "trend.get", {"itemids": ids, "time_from": since, "output": ["itemid", "clock", "value_avg"]})
                    pts = [(r["itemid"], int(r["clock"]), float(r["value_avg"])) for r in rows]
                else:
                    rows = await self._rpc(c, "history.get", {"itemids": ids, "history": vt, "time_from": since,
                                                              "sortfield": "clock", "sortorder": "ASC", "output": "extend", "limit": 20000})
                    pts = [(r["itemid"], int(r["clock"]), float(r["value"])) for r in rows]
                for iid, t, v in pts:
                    k = name.get(iid)
                    if k in ("netin", "netout"):
                        v = v / 1e6   # bps -> Mbit/s
                    ser.setdefault(k, []).append([t, round(v, 3)])
        for k in ser:
            ser[k].sort()
            if len(ser[k]) > 600:   # reduz para no máximo ~600 pontos por série
                step = len(ser[k]) // 600 + 1
                ser[k] = ser[k][::step]
        bucket = max(60, self.TF[tf] // 300)
        out = dict(since=since, bucket=bucket, series=ser)
        self._cache[key] = (time.time(), out)
        if len(self._cache) > 100:
            self._cache.pop(next(iter(self._cache)))
        return out


class HttpCheck(Collector):
    type, label, page = "http", "Verificação HTTP", "servicos"
    description = "Qualquer serviço web: confere se responde e mede o tempo de resposta."
    fields = [
        URL("http://192.168.1.15:3000"),
        F("expect_status", "Status esperado", "number", default=200, help="0 aceita qualquer resposta abaixo de 500"),
        F("keyword", "Texto que deve aparecer na página", help="Opcional"),
        F("critical", "Alerta crítico se cair", "bool", default=True),
        SSL,
    ]

    async def collect(self):
        t0 = time.monotonic()
        async with self.client() as c:
            r = await c.get(self.base_url)
        ms = round((time.monotonic() - t0) * 1000)
        expect = int(self.opt("expect_status"))
        ok = (r.status_code == expect) if expect else r.status_code < 500
        kw = self.opt("keyword")
        if ok and kw and kw not in r.text:
            ok = False
        summary = f"HTTP {r.status_code} em {ms} ms" + ("" if ok or not kw or kw in r.text else f", sem '{kw}'")
        events = [] if ok else [self.ev("crit" if self.opt("critical") else "warn", f"{self.name} com problema", summary)]
        return self.result(services=[self.svc("online" if ok else "offline", summary=summary)], events=events,
                           metrics={f"{self.id}.latency": ms, f"{self.id}.up": 1 if ok else 0},
                           details=dict(status=r.status_code, latency_ms=ms, url=self.base_url))


class TcpCheck(Collector):
    type, label, page = "tcp", "Verificação de porta TCP", "servicos"
    description = "Confere se uma porta aceita conexão (SSH, banco de dados, MQTT…)."
    fields = [
        F("host", "Host ou IP", required=True, placeholder="192.168.1.13"),
        F("port", "Porta", "number", required=True, placeholder="1883"),
        F("critical", "Alerta crítico se cair", "bool", default=True),
    ]

    async def collect(self):
        t0 = time.monotonic()
        try:
            _, w = await asyncio.wait_for(asyncio.open_connection(self.opt("host"), int(self.opt("port"))), self.timeout)
            w.close()
            ok, summary = True, f"porta {self.opt('port')} aberta"
        except Exception as e:  # noqa: BLE001
            ok, summary = False, f"porta {self.opt('port')} fechada ({type(e).__name__})"
        ms = round((time.monotonic() - t0) * 1000)
        events = [] if ok else [self.ev("crit" if self.opt("critical") else "warn", f"{self.name} fora do ar", summary)]
        return self.result(services=[self.svc("online" if ok else "offline", summary=f"{summary}, {ms} ms")], events=events,
                           metrics={f"{self.id}.latency": ms, f"{self.id}.up": 1 if ok else 0},
                           details=dict(latency_ms=ms, target=f"{self.opt('host')}:{self.opt('port')}"))
