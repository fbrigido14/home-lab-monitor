"""Proxmox VE e Proxmox Backup Server via API REST com token."""
import time

from .base import SSL, URL, Collector, F, gib, host, pct


class Proxmox(Collector):
    type, label, page, makes_hosts = "proxmox", "Proxmox VE", "proxmox", True
    description = "Cluster, nós, VMs, containers LXC, storages, tarefas e discos (role PVEAuditor)."
    fields = [
        URL("https://192.168.1.10:8006"),
        F("token_id", "Token ID", required=True, placeholder="monitor@pve!dashboard"),
        F("token_secret", "Segredo do token", "secret", required=True),
        F("hide_guests", "Ocultar VMs/LXC (IDs ou nomes)", "list", placeholder="9000, template-debian"),
        F("smart", "Ler saúde dos discos (SMART)", "bool", default=True, help="Atualiza a cada 10 minutos"),
        F("temp_from", "Temperatura do nó vem de", "list", placeholder="zbx-pve\npve=ha:sensor.pve_cpu_temperatura",
          help="A API do Proxmox não informa temperatura. Use um host do Zabbix com item de temperatura (id do host na "
               "frota, ex.: zbx-pve) ou um sensor do Home Assistant (ha:sensor.x, listado em Outras entidades). "
               "Com vários nós, use nó=origem, um por linha."),
        SSL,
    ]

    def __init__(self, inst, settings):
        super().__init__(inst, settings)
        self._prev, self._disks, self._disks_ts = {}, {}, 0
        self._ifaces, self._ifaces_ts, self._rrd = {}, 0, {}
        self.nodes_known = set()

    def headers(self):
        return {"Authorization": f"PVEAPIToken={self.opt('token_id')}={self.opt('token_secret')}"}

    def temp_sources(self):
        """{nó ou "*": origem} a partir do campo temp_from."""
        out = {}
        for line in self.opt_list("temp_from"):
            node, sep, src = line.partition("=")
            if sep and not node.strip().startswith("ha:"):
                out[node.strip()] = src.strip()
            else:
                out["*"] = line.strip()
        return out

    TF = {"hour": 60, "day": 1800, "week": 10800, "month": 43200, "year": 604800}

    async def rrd(self, node, tf, vmid=None, gtype=None):
        """Séries do histórico do Proxmox, já em unidades da tela (%, GB, Mbit/s, MB/s). Cache de 60 s."""
        key = (node, tf, vmid, gtype)
        hit = self._rrd.get(key)
        if hit and time.time() - hit[0] < 60:
            return hit[1]
        path = f"/nodes/{node}/{gtype}/{vmid}/rrddata" if vmid else f"/nodes/{node}/rrddata"
        async with self.client() as c:
            r = await c.get(f"{self.base_url}/api2/json{path}", params={"timeframe": tf, "cf": "AVERAGE"})
            r.raise_for_status()
            rows = r.json().get("data", [])
        out = rrd_series(rows, vmid is not None)
        self._rrd[key] = (time.time(), out)
        if len(self._rrd) > 200:
            self._rrd.pop(next(iter(self._rrd)))
        return out

    async def syslog(self, node, limit=300):
        async with self.client() as c:
            r = await c.get(f"{self.base_url}/api2/json/nodes/{node}/syslog", params={"limit": limit})
            if r.status_code == 403:
                raise PermissionError("O token não tem a permissão Sys.Syslog (o papel PVEAuditor não inclui). "
                                      "Adicione um papel com Sys.Syslog em /nodes para ver os logs.")
            r.raise_for_status()
            return [x.get("t", "") for x in r.json().get("data", [])]

    def _rate(self, key, value, now):
        """Converte contadores acumulados (bytes) em taxa por segundo entre duas coletas."""
        prev = self._prev.get(key)
        self._prev[key] = (value, now)
        if not prev or value is None or value < prev[0] or now <= prev[1]:
            return None
        return round((value - prev[0]) / (now - prev[1]), 1)

    async def collect(self):
        base = self.base_url + "/api2/json"
        thr = self.settings["thresholds"]
        hide = set(self.opt_list("hide_guests"))
        hosts, events, guests, storages, nodes, metrics = [], [], [], [], [], {}
        now = time.time()
        async with self.client() as c:
            get = lambda p, **kw: c.get(f"{base}{p}", **kw)  # noqa: E731
            res = (await get("/cluster/resources")).raise_for_status().json()["data"]
            cluster = {"name": None, "quorate": None, "nodes": 0}
            try:
                for x in (await get("/cluster/status")).json().get("data", []):
                    if x.get("type") == "cluster":
                        cluster.update(name=x.get("name"), quorate=bool(x.get("quorate")), nodes=x.get("nodes"))
            except Exception:
                pass
            try:
                tasks_raw = (await get("/cluster/tasks")).json().get("data", [])
            except Exception:
                tasks_raw = []
            ha = {}
            try:
                for x in (await get("/cluster/ha/status/current")).json().get("data", []):
                    if x.get("sid"):
                        ha[x["sid"].split(":")[-1]] = x.get("state")
            except Exception:
                pass

            for r in [r for r in res if r.get("type") == "node"]:
                name, online = r["node"], r.get("status") == "online"
                n = dict(name=name, online=online, cpu=round(r.get("cpu", 0) * 100, 1) if online else None,
                         cores=r.get("maxcpu"), mem_used=r.get("mem"), mem_total=r.get("maxmem"),
                         root_used=r.get("disk"), root_total=r.get("maxdisk"), uptime=r.get("uptime"))
                if online:
                    try:
                        st = (await get(f"/nodes/{name}/status")).json()["data"]
                        ci, sw = st.get("cpuinfo") or {}, st.get("swap") or {}
                        parts = str(st.get("pveversion", "")).split("/")
                        n.update(model=ci.get("model"), sockets=ci.get("sockets"), threads=ci.get("cpus"),
                                 load=[float(x) for x in (st.get("loadavg") or [])][:3],
                                 swap_used=sw.get("used"), swap_total=sw.get("total"),
                                 iowait=round(float(st["wait"]) * 100, 2) if st.get("wait") is not None else None,
                                 version=parts[1] if len(parts) > 1 else None,
                                 kernel=(st.get("current-kernel") or {}).get("release") or (str(st.get("kversion", "")).split(" ") + [None, None])[1],
                                 boot=(st.get("boot-info") or {}).get("mode"), secureboot=(st.get("boot-info") or {}).get("secureboot"),
                                 cpu_cores=ci.get("cores"), mhz=ci.get("mhz"))
                    except Exception:
                        pass
                    try:  # taxa de rede e I/O wait mais recentes do próprio Proxmox
                        rrd = (await get(f"/nodes/{name}/rrddata", params={"timeframe": "hour", "cf": "AVERAGE"})).json().get("data", [])
                        last = next((x for x in reversed(rrd) if x.get("cpu") is not None), {})
                        n.update(netin=last.get("netin"), netout=last.get("netout"),
                                 arc=last.get("arcsize"), mem_avail=last.get("memavailable"))
                        if n.get("iowait") is None and last.get("iowait") is not None:
                            n["iowait"] = round(last["iowait"] * 100, 2)
                    except Exception:
                        pass
                    if now - self._ifaces_ts > 300:
                        try:
                            self._ifaces[name] = [dict(iface=x.get("iface"), type=x.get("type"), address=x.get("address"), cidr=x.get("cidr"),
                                                       gateway=x.get("gateway"), active=bool(x.get("active")), autostart=bool(x.get("autostart")),
                                                       ports=x.get("bridge_ports") or x.get("slaves"), vlan_aware=bool(x.get("bridge_vlan_aware")),
                                                       comments=x.get("comments"))
                                                  for x in (await get(f"/nodes/{name}/network")).json().get("data", [])]
                        except Exception:
                            pass
                    if self.opt("smart") and now - self._disks_ts > 600:
                        try:
                            self._disks[name] = [dict(dev=d.get("devpath"), model=d.get("model"), size=d.get("size"),
                                                      type=d.get("type"), health=d.get("health"), wearout=d.get("wearout"))
                                                 for d in (await get(f"/nodes/{name}/disks/list")).json().get("data", [])]
                        except Exception:
                            pass
                else:
                    events.append(self.ev("crit", f"Nó {name} offline", "Proxmox não responde por este nó"))
                nodes.append(n)
            if nodes and self.opt("smart") and now - self._disks_ts > 600:
                self._disks_ts = now
            if nodes and now - self._ifaces_ts > 300:
                self._ifaces_ts = now

            for r in res:
                t = r.get("type")
                if t in ("qemu", "lxc") and not r.get("template"):
                    if str(r.get("vmid")) in hide or r.get("name") in hide:
                        continue
                    vid, running = r.get("vmid"), r.get("status") == "running"
                    net_in = self._rate(f"g{vid}.in", r.get("netin"), now) if running else 0
                    net_out = self._rate(f"g{vid}.out", r.get("netout"), now) if running else 0
                    d_r = self._rate(f"g{vid}.dr", r.get("diskread"), now) if running else 0
                    d_w = self._rate(f"g{vid}.dw", r.get("diskwrite"), now) if running else 0
                    g = dict(vmid=vid, name=r.get("name"), type="VM" if t == "qemu" else "LXC", node=r.get("node"),
                             status=r.get("status"), cpu=round(r.get("cpu", 0) * 100, 1), cores=r.get("maxcpu"),
                             mem=pct(r.get("mem"), r.get("maxmem")), mem_text=f"{gib(r.get('mem'))} / {gib(r.get('maxmem'))}",
                             mem_used=r.get("mem"), disk=pct(r.get("disk"), r.get("maxdisk")) if t == "lxc" else None,
                             uptime=r.get("uptime"), netin=net_in, netout=net_out, diskread=d_r, diskwrite=d_w,
                             tags=[x for x in str(r.get("tags") or "").replace(",", ";").split(";") if x],
                             ha=ha.get(str(vid)) or r.get("hastate"), lock=r.get("lock"))
                    guests.append(g)
                    if running:
                        metrics[f"{self.id}.g{vid}.cpu"] = g["cpu"]
                        if g["mem"] is not None:
                            metrics[f"{self.id}.g{vid}.mem"] = g["mem"]
                        if net_in is not None and net_out is not None:
                            metrics[f"{self.id}.g{vid}.net"] = round((net_in + net_out) / 1024, 1)   # KB/s
                elif t == "storage":
                    used = pct(r.get("disk"), r.get("maxdisk"))
                    storages.append(dict(name=r.get("storage"), node=r.get("node"), type=r.get("plugintype"),
                                         status=r.get("status"), used=used, shared=bool(r.get("shared")),
                                         used_b=r.get("disk"), total_b=r.get("maxdisk"),
                                         content=r.get("content"), text=f"{gib(r.get('disk'))} / {gib(r.get('maxdisk'))}"))
                    if used and used >= thr["disk_crit"]:
                        events.append(self.ev("crit", f"Storage {r.get('storage')} quase cheio", f"{used}% em {r.get('node')}"))
                    elif used and used >= thr["disk_warn"]:
                        events.append(self.ev("warn", f"Storage {r.get('storage')} em {used}%", r.get("node")))

        running = [g for g in guests if g["status"] == "running"]
        for g in running:
            if g["mem"] and g["mem"] >= thr["mem_warn"]:
                events.append(self.ev("warn", f"{g['name']} com pouca RAM", f"{g['type']} {g['vmid']} usando {g['mem']}%"))
        if cluster["quorate"] is False:
            events.append(self.ev("crit", "Cluster sem quórum", "VMs com HA podem parar e configurações ficam bloqueadas"))

        tasks = []
        for t in tasks_raw[:40]:
            st = t.get("status") or ("rodando" if not t.get("endtime") else "")
            tasks.append(dict(type=t.get("type"), id=t.get("id"), node=t.get("node"), user=t.get("user"),
                              start=t.get("starttime"), end=t.get("endtime"), status=st))
        failed = [t for t in tasks if t["status"] not in ("OK", "rodando", "") and not str(t["status"]).startswith("WARNINGS")
                  and (t["start"] or 0) > now - 3600]
        for t in failed[:3]:
            events.append(self.ev("warn", f"Tarefa {t['type']} falhou", f"{t['id'] or ''} em {t['node']}: {t['status']}"[:140]))

        disks = [dict(d, node=nd) for nd, lst in self._disks.items() for d in lst]
        for d in disks:
            if d.get("health") and str(d["health"]).upper() not in ("PASSED", "OK", "UNKNOWN"):
                events.append(self.ev("crit", f"Disco com falha SMART em {d['node']}", f"{d['dev']} ({d.get('model') or ''}): {d['health']}"))
            elif isinstance(d.get("wearout"), (int, float)) and d["wearout"] >= 80 and d.get("type") in ("ssd", "nvme"):
                events.append(self.ev("warn", f"SSD desgastado em {d['node']}", f"{d['dev']}: desgaste {d['wearout']}%"))

        for n in nodes:
            hid = f"{self.id}-{n['name']}"
            h = host(hid, n["name"], "proxmox", "online" if n["online"] else "offline",
                     cpu=n["cpu"], mem=pct(n["mem_used"], n["mem_total"]),
                     mem_text=f"{gib(n['mem_used'])} / {gib(n['mem_total'])}",
                     disk=pct(n["root_used"], n["root_total"]), disk_text=f"{gib(n['root_used'])} / {gib(n['root_total'])}",
                     cores=n["cores"], uptime=n["uptime"], badges=["PVE"],
                     load=(n.get("load") or [None])[0], os=f"Proxmox VE {n.get('version') or ''}".strip(),
                     note=f"{len([g for g in running if g['node'] == n['name']])} guests ativos")
            hosts.append(h)
            n["guests_running"] = len([g for g in running if g["node"] == n["name"]])
            n["guests_total"] = len([g for g in guests if g["node"] == n["name"]])
            for k in ("iowait", "netin", "netout"):
                if isinstance(n.get(k), (int, float)):
                    metrics[f"{hid}.{k}"] = round(n[k] / (1024 if k != "iowait" else 1), 2)   # rede em KB/s
            if n.get("load"):
                metrics[f"{hid}.load"] = n["load"][0]

        on = [n for n in nodes if n["online"]]
        seen_shared, st_used, st_total = set(), 0, 0
        for s in storages:
            if s["status"] != "available" or not s["total_b"]:
                continue
            if s["shared"]:
                if s["name"] in seen_shared:
                    continue
                seen_shared.add(s["name"])
            st_used += s["used_b"] or 0
            st_total += s["total_b"] or 0
        totals = dict(cpu_used=round(sum((n["cpu"] or 0) / 100 * (n["cores"] or 0) for n in on), 1),
                      cpu_total=sum(n["cores"] or 0 for n in on),
                      mem_used=sum(n["mem_used"] or 0 for n in on), mem_total=sum(n["mem_total"] or 0 for n in on),
                      st_used=st_used, st_total=st_total,
                      vms=[len([g for g in running if g["type"] == "VM"]), len([g for g in guests if g["type"] == "VM"])],
                      cts=[len([g for g in running if g["type"] == "LXC"]), len([g for g in guests if g["type"] == "LXC"])])
        cluster.update(online=len(on), total=len(nodes))
        guests.sort(key=lambda g: (g["status"] != "running", -(g["cpu"] or 0)))
        metrics[f"{self.id}.running"] = len(running)
        if totals["cpu_total"]:
            metrics[f"{self.id}.cluster.cpu"] = round(totals["cpu_used"] / totals["cpu_total"] * 100, 1)
        if totals["mem_total"]:
            metrics[f"{self.id}.cluster.mem"] = round(totals["mem_used"] / totals["mem_total"] * 100, 1)
        return self.result(hosts=hosts, events=events, metrics=metrics,
                           details=dict(cluster=cluster, totals=totals, nodes=nodes, guests=guests, storages=storages,
                                        tasks=tasks, disks=disks, running=len(running), total=len(guests),
                                        ifaces={k: v for k, v in self._ifaces.items()}))


class PBS(Collector):
    type, label, page, makes_hosts = "pbs", "Proxmox Backup", "backups", True
    description = "Datastores, grupos de backup, jobs, GC e tarefas (role Audit)."
    fields = [
        URL("https://192.168.1.11:8007"),
        F("token_id", "Token ID", required=True, placeholder="monitor@pbs!dashboard"),
        F("token_secret", "Segredo do token", "secret", required=True),
        F("max_backup_age_h", "Avisar se não houver backup há (horas)", "number", default=26),
        SSL,
    ]
    TF = {"hour": 60, "day": 1800, "week": 10800, "month": 43200, "year": 604800}

    def __init__(self, inst, settings):
        super().__init__(inst, settings)
        self._slow, self._slow_ts, self._rrd = {}, 0, {}
        self.stores = set()

    def headers(self):
        return {"Authorization": f"PBSAPIToken={self.opt('token_id')}:{self.opt('token_secret')}"}

    async def _slow_data(self, c, base, stores):
        """Grupos, snapshots, GC e jobs mudam pouco: relê a cada 5 minutos."""
        if time.time() - self._slow_ts < 300 and self._slow:
            return self._slow
        out = {"groups": [], "gc": {}, "jobs": []}
        for st in stores:
            try:
                snaps = (await c.get(f"{base}/admin/datastore/{st}/snapshots")).json().get("data", [])
            except Exception:
                snaps = []
            by = {}
            for x in snaps:
                k = (x.get("backup-type"), x.get("backup-id"), x.get("ns") or "")
                g = by.setdefault(k, dict(store=st, type=x.get("backup-type"), id=x.get("backup-id"), ns=x.get("ns") or "",
                                          count=0, last=0, size=None, verify=None, protected=0, comment=None, owner=x.get("owner")))
                g["count"] += 1
                g["protected"] += 1 if x.get("protected") else 0
                if (x.get("backup-time") or 0) >= g["last"]:
                    g.update(last=x.get("backup-time") or 0, size=x.get("size"), comment=x.get("comment") or g["comment"],
                             verify=(x.get("verification") or {}).get("state"))
            out["groups"] += list(by.values())
            try:
                gc = (await c.get(f"{base}/admin/datastore/{st}/gc")).json().get("data", {}) or {}
                idx, disk = gc.get("index-data-bytes"), gc.get("disk-bytes")
                out["gc"][st] = dict(dedup=round(idx / disk, 2) if idx and disk else None, removed=gc.get("removed-bytes"),
                                     pending=gc.get("pending-bytes"), last_state=gc.get("last-run-state"),
                                     last_end=gc.get("last-run-endtime"), next=gc.get("next-run"), schedule=gc.get("schedule"))
            except Exception:
                pass
        for kind, label in (("verify", "Verificação"), ("sync", "Sincronização"), ("prune", "Limpeza (prune)")):
            try:
                for j in (await c.get(f"{base}/admin/{kind}")).json().get("data", []):
                    out["jobs"].append(dict(kind=label, id=j.get("id"), store=j.get("store"), schedule=j.get("schedule"),
                                            last_state=j.get("last-run-state"), last_end=j.get("last-run-endtime"),
                                            next=j.get("next-run"), comment=j.get("comment"), remote=j.get("remote")))
            except Exception:
                pass
        self._slow, self._slow_ts = out, time.time()
        return out

    async def collect(self):
        base = self.base_url + "/api2/json"
        thr = self.settings["thresholds"]
        events, stores, tasks, metrics = [], [], [], {}
        async with self.client() as c:
            usage = (await c.get(f"{base}/status/datastore-usage")).raise_for_status().json()["data"]
            for d in usage:
                used = pct(d.get("used"), d.get("total"))
                full = d.get("estimated-full-date")
                hist, h0, dt_ = d.get("history") or [], d.get("history-start"), d.get("history-delta")
                history = [[h0 + k * dt_, round(v * 100, 2)] for k, v in enumerate(hist) if v is not None] if h0 and dt_ else []
                stores.append(dict(name=d.get("store"), used=used, used_b=d.get("used"), total_b=d.get("total"), avail_b=d.get("avail"),
                                   text=f"{gib(d.get('used'))} / {gib(d.get('total'))}", history=history,
                                   full_date=full if full and full > 0 else None))
                if used is not None:
                    metrics[f"{self.id}.ds.{d.get('store')}"] = used
                if used and used >= thr["disk_warn"]:
                    events.append(self.ev("crit" if used >= thr["disk_crit"] else "warn",
                                          f"Datastore {d.get('store')} em {used}%", "Rode prune/GC ou amplie o espaço"))
            self.stores = {s["name"] for s in stores}

            node = {}
            h = host(self.id, self.name, "pbs", badges=["PBS"], os="Proxmox Backup Server")
            try:
                st = (await c.get(f"{base}/nodes/localhost/status")).json()["data"]
                mem, root, swap, ci = st.get("memory", {}), st.get("root", {}), st.get("swap", {}), st.get("cpuinfo") or {}
                node = dict(cpu=round(st.get("cpu", 0) * 100, 1), mem_used=mem.get("used"), mem_total=mem.get("total"),
                            root_used=root.get("used"), root_total=root.get("total"), swap_used=swap.get("used"), swap_total=swap.get("total"),
                            load=[float(x) for x in (st.get("loadavg") or [])][:3], uptime=st.get("uptime"), model=ci.get("model"),
                            threads=ci.get("cpus"), kernel=(st.get("current-kernel") or {}).get("release") or st.get("kversion"),
                            iowait=round(float(st["wait"]) * 100, 2) if st.get("wait") is not None else None)
                h.update(cpu=node["cpu"], mem=pct(mem.get("used"), mem.get("total")),
                         mem_text=f"{gib(mem.get('used'))} / {gib(mem.get('total'))}",
                         disk=pct(root.get("used"), root.get("total")),
                         disk_text=f"{gib(root.get('used'))} / {gib(root.get('total'))}",
                         uptime=st.get("uptime"), load=(node["load"] or [None])[0], cores=ci.get("cpus"))
            except Exception:
                pass
            try:
                v = (await c.get(f"{base}/version")).json().get("data", {})
                node["version"] = f"{v.get('version')}-{v.get('release')}" if v.get("release") else v.get("version")
                h["os"] = f"Proxmox Backup Server {v.get('version', '')}".strip()
            except Exception:
                pass
            raw = (await c.get(f"{base}/nodes/localhost/tasks",
                               params={"limit": 300, "since": int(time.time()) - 7 * 86400})).json().get("data", [])
            slow = await self._slow_data(c, base, self.stores)

        kinds = {"backup": "Backup", "verificationjob": "Verificação", "verify": "Verificação", "verify_snapshot": "Verificação",
                 "garbage_collection": "GC", "prune": "Prune", "prunejob": "Prune", "syncjob": "Sync", "reader": "Restauração"}
        for t in raw:
            if t.get("worker_type") in kinds:
                tasks.append(dict(type=kinds[t["worker_type"]], target=t.get("worker_id"), start=t.get("starttime"),
                                  end=t.get("endtime"), status=t.get("status") or "rodando", user=t.get("user")))
        tasks.sort(key=lambda x: x["start"] or 0, reverse=True)
        now, day = time.time(), time.time() - 86400
        failed = [t for t in tasks if (t["start"] or 0) > day and t["status"] not in ("OK", "rodando")
                  and not str(t["status"]).startswith("WARNINGS")]
        for t in failed[:5]:
            events.append(self.ev("crit", f"{t['type']} falhou", f"{t['target']}: {t['status']}"))
        last_ok = max((t["end"] or 0 for t in tasks if t["type"] == "Backup" and t["status"] == "OK"), default=0)
        max_age = float(self.opt("max_backup_age_h")) * 3600
        if last_ok and now - last_ok > max_age:
            events.append(self.ev("warn", "Sem backup recente", f"Último backup OK há {int((now - last_ok) / 3600)} h"))
        stale = [g for g in slow["groups"] if g["last"] and now - g["last"] > max_age]
        for g in stale[:5]:
            events.append(self.ev("warn", f"{g['type']}/{g['id']} sem backup recente", f"Último há {int((now - g['last']) / 3600)} h em {g['store']}"))
        for j in slow["jobs"]:
            if j["last_state"] and j["last_state"] != "OK" and not str(j["last_state"]).startswith("WARNINGS"):
                events.append(self.ev("warn", f"Job de {j['kind'].lower()} '{j['id']}' falhou", str(j["last_state"])[:140]))

        days = []   # backups por dia (7 dias): OK x falhas
        for k in range(6, -1, -1):
            d0 = int((now // 86400 - k) * 86400)
            bk = [t for t in tasks if t["type"] == "Backup" and d0 <= (t["start"] or 0) < d0 + 86400]
            days.append(dict(day=d0, ok=len([t for t in bk if t["status"] == "OK"]), fail=len([t for t in bk if t["status"] not in ("OK", "rodando")])))
        ok24 = len([t for t in tasks if t["type"] == "Backup" and t["status"] == "OK" and (t["start"] or 0) > day])
        h["note"] = f"{ok24} backups OK em 24 h"
        metrics[f"{self.id}.failed24h"] = len(failed)
        return self.result(hosts=[h], events=events, metrics=metrics,
                           details=dict(datastores=stores, tasks=tasks[:120], last_ok=last_ok, ok_24h=ok24, failed_24h=len(failed),
                                        node=node, groups=sorted(slow["groups"], key=lambda g: -(g["last"] or 0)), gc=slow["gc"],
                                        jobs=slow["jobs"], days=days, stale=len(stale)))

    async def series(self, kind, tf):
        """kind: "node" ou "ds:<datastore>" — histórico do próprio PBS."""
        if kind == "node":
            path = "/nodes/localhost/rrd"
        elif kind.startswith("ds:") and kind[3:] in self.stores:
            path = f"/admin/datastore/{kind[3:]}/rrd"
        else:
            raise ValueError("Série desconhecida")
        key = (kind, tf)
        hit = self._rrd.get(key)
        if hit and time.time() - hit[0] < 60:
            return hit[1]
        async with self.client() as c:
            r = await c.get(f"{self.base_url}/api2/json{path}", params={"timeframe": tf, "cf": "AVERAGE"})
            r.raise_for_status()
            rows = r.json().get("data", [])
        out = rrd_series(rows) if kind == "node" else ds_series(rows)
        self._rrd[key] = (time.time(), out)
        return out

def rrd_series(rows, guest=False):
    """Converte o rrddata do Proxmox nas séries usadas pelos gráficos."""
    G = 1024 ** 3
    ser = {k: [] for k in ("cpu", "load", "iowait", "mem_total", "mem_used", "arc", "mem_avail", "swap_used",
                           "netin", "netout", "diskread", "diskwrite", "root_used")}
    ts = []
    for x in rows:
        t = x.get("time")
        if t is None or x.get("cpu") is None:
            continue
        ts.append(t)
        add = lambda k, v: v is not None and ser[k].append([t, round(v, 3)])  # noqa: E731
        add("cpu", x["cpu"] * 100)
        add("load", x.get("loadavg"))
        add("iowait", x["iowait"] * 100 if x.get("iowait") is not None else None)
        mt = x.get("memtotal") or x.get("maxmem")
        mu = x.get("memused") if x.get("memused") is not None else x.get("mem")
        add("mem_total", mt / G if mt else None)
        add("mem_used", mu / G if mu is not None else None)
        add("arc", x["arcsize"] / G if x.get("arcsize") is not None else None)
        av = x.get("memavailable")
        add("mem_avail", av / G if av is not None else ((mt - mu) / G if mt and mu is not None else None))
        add("swap_used", x["swapused"] / G if x.get("swapused") is not None else None)
        add("netin", x["netin"] * 8 / 1e6 if x.get("netin") is not None else None)      # Mbit/s
        add("netout", x["netout"] * 8 / 1e6 if x.get("netout") is not None else None)
        add("diskread", x["diskread"] / 1e6 if x.get("diskread") is not None else None)  # MB/s
        add("diskwrite", x["diskwrite"] / 1e6 if x.get("diskwrite") is not None else None)
        add("root_used", x["rootused"] / G if x.get("rootused") is not None else None)
    bucket = int((ts[-1] - ts[0]) / max(1, len(ts) - 1)) if len(ts) > 1 else 60
    return dict(since=ts[0] if ts else int(time.time()) - 3600, bucket=max(60, bucket), series={k: v for k, v in ser.items() if v})


def ds_series(rows):
    """rrd de datastore do PBS: espaço (GB) e I/O (MB/s, operações/s)."""
    G = 1024 ** 3
    ser = {k: [] for k in ("used", "total", "available", "read", "write", "read_ios", "write_ios")}
    ts = []
    for x in rows:
        t = x.get("time")
        if t is None or x.get("total") is None:
            continue
        ts.append(t)
        for k, src, div in (("used", "used", G), ("total", "total", G), ("available", "available", G),
                            ("read", "read_bytes", 1e6), ("write", "write_bytes", 1e6), ("read_ios", "read_ios", 1), ("write_ios", "write_ios", 1)):
            if x.get(src) is not None:
                ser[k].append([t, round(x[src] / div, 3)])
    bucket = int((ts[-1] - ts[0]) / max(1, len(ts) - 1)) if len(ts) > 1 else 60
    return dict(since=ts[0] if ts else int(time.time()) - 3600, bucket=max(60, bucket), series={k: v for k, v in ser.items() if v})
