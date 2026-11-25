"""Dados simulados por tipo, usados enquanto uma integração não tem credenciais
(demo_mode: auto). Cada função recebe o coletor para usar o id e o nome da instância."""
import datetime as dt
import math
import unicodedata
import random
import time

from .base import event, host


def w(seed, base, amp, period=1800, lo=0, hi=100):
    v = base + amp * math.sin(time.time() / period * 2 * math.pi + seed) + random.uniform(-amp / 3, amp / 3)
    return round(max(lo, min(hi, v)), 1)


def _r(**kw):
    out = dict(hosts=[], services=[], details={}, events=[], metrics={})
    out.update(kw)
    return out


def unifi(c):
    rx, tx = w(1, 180, 150, 600, 2, 900), w(2, 25, 20, 700, 1, 300)
    gw = host(f"{c.id}-gw", "Gateway Ultra", "gateway", os="UniFi UCG-Ultra", ip="192.168.1.1",
              cpu=w(0, 14, 8), mem=w(3, 58, 3), uptime=1_814_000, load=w(1, 0.6, 0.3, lo=0, hi=4),
              temp=w(7, 52, 3, lo=30, hi=90), badges=["Gateway"], note="WAN 300/150 Mbps")
    ap = host(f"{c.id}-ap1", "U6 Lite escritório", "ap", os="UniFi U6-Lite", ip="192.168.1.20",
              cpu=w(4, 11, 6), mem=w(5, 66, 2), uptime=950_000, badges=["AP"], note="14 clientes")
    u24, u5 = w(8, 46, 14, 500, 5, 100), w(9, 18, 8, 500, 2, 100)
    radios = [dict(ap=ap["name"], ap_id=ap["id"], band="2,4 GHz", channel=6, width=20, util=u24, self_util=round(u24 * 0.35, 1), clients=6, satisfaction=88, tx_power=17, retries=9.4),
              dict(ap=ap["name"], ap_id=ap["id"], band="5 GHz", channel=44, width=80, util=u5, self_util=round(u5 * 0.6, 1), clients=8, satisfaction=96, tx_power=20, retries=3.1)]
    devices = [dict(id=gw["id"], name=gw["name"], kind="gateway", model="UCG-Ultra", model_name="Cloud Gateway Ultra", ip=gw["ip"], online=True, version="4.3.6",
                    cpu=gw["cpu"], mem=gw["mem"], temp=gw["temp"], uptime=gw["uptime"], load=gw["load"], clients=26, satisfaction=None,
                    uplink="1000 Mbps", uplink_name="WAN (Vivo)", ports_up=3, ports_total=5, upgradable=False),
               dict(id=ap["id"], name=ap["name"], kind="ap", model="U6-Lite", model_name="U6 Lite", ip=ap["ip"], online=True, version="6.7.31",
                    cpu=ap["cpu"], mem=ap["mem"], temp=None, uptime=ap["uptime"], load=None, clients=14, satisfaction=92,
                    uplink="1000 Mbps", uplink_name="Gateway Ultra porta 2", ports_up=None, ports_total=None, upgradable=True)]
    people = [("iPhone da Ana", "Apple", "5 GHz", "ax", 44, -52, 98, 18e3, 2e3), ("MacBook Air", "Apple", "5 GHz", "ax", 44, -58, 95, 410e3, 52e3),
              ("Galaxy S24", "Samsung", "5 GHz", "ax", 44, -61, 93, 6e3, 1e3), ("Smart TV Sala", "LG", "5 GHz", "ac", 44, -67, 84, 2.1e6, 30e3),
              ("Kindle", "Amazon", "2,4 GHz", "n", 6, -70, 79, 0, 0), ("Echo Dot", "Amazon", "2,4 GHz", "n", 6, -63, 90, 2e3, 1e3),
              ("Aspirador", "Xiaomi", "2,4 GHz", "n", 6, -76, 62, 1e3, 1e3), ("Notebook trabalho", "Dell", "5 GHz", "ax", 44, -55, 97, 120e3, 80e3)]
    client_list = [dict(name=n, ip=f"192.168.1.{110 + k}", mac=f"a4:83:e7:{k:02x}:1b:{k * 7:02x}", wired=False, vendor=v, network="LAN",
                        essid="Casa" if k != 6 else "Casa-IoT", band=b, proto=p, channel=ch, signal=sig, satisfaction=sat, via=ap["name"],
                        port=None, rx=rxr, tx=txr, uptime=3600 * (k + 2) * 3) for k, (n, v, b, p, ch, sig, sat, rxr, txr) in enumerate(people)]
    client_list += [dict(name=n, ip=ip, mac=f"00:1b:21:{k:02x}:4c:9e", wired=True, vendor=v, network="LAN", essid=None, band=None, proto=None, channel=None,
                         signal=None, satisfaction=None, via="Gateway Ultra", port=port, rx=rxr, tx=txr, uptime=2_000_000)
                    for k, (n, ip, v, port, rxr, txr) in enumerate([("pve", "192.168.1.10", "ASRock", 1, 2.4e6, 1.1e6), ("orangepi", "192.168.1.13", "Xunlong", 3, 40e3, 22e3),
                                                                      ("U6 Lite escritório", "192.168.1.20", "Ubiquiti", 2, 900e3, 300e3)])]
    metrics = {f"{c.id}.wan.rx": rx, f"{c.id}.wan.tx": tx, f"{c.id}.wan.latency": w(3, 9, 3, lo=3, hi=60),
               f"{c.id}.clients": 26, f"{c.id}-ap1.clients": 14, f"{c.id}.wifi": 14, f"{c.id}.wired": 12,
               f"{ap['id']}.cu.24ghz": u24, f"{ap['id']}.cu.5ghz": u5}
    return _r(hosts=[gw, ap], metrics=metrics,
              details=dict(gateway="Gateway Ultra", clients=26, wifi_clients=14, wired_clients=12, legacy=True,
                           wan=dict(rx_mbps=rx, tx_mbps=tx, isp="Vivo Fibra", latency=9, drops=1, uptime=1_700_000, gw_name="Gateway Ultra"),
                           speedtest=dict(down=487.3, up=246.1, ping=6, at=int(time.time()) - 5 * 3600),
                           aps=[dict(name="U6 Lite escritório", model="U6-Lite", online=True, clients=14,
                                     radios=[dict(band=2.4, retries=9.4), dict(band=5, retries=3.1)])],
                           devices=devices, radios=radios, client_list=client_list))


def proxmox(c):
    now = int(time.time())
    cpu = w(0, 22, 15)
    node = host(f"{c.id}-pve", "pve", "proxmox", os="Proxmox VE 9.0.10", cpu=cpu, mem=w(1, 71, 4),
                mem_text="45.4 GB / 64.0 GB", disk=w(2, 38, 0.2), disk_text="35.1 GB / 93.9 GB",
                cores=12, uptime=2_406_000, load=round(cpu / 100 * 12, 2), badges=["PVE"], note="5 guests ativos")
    G = 1024 ** 3
    spec = [  # vmid, nome, tipo, status, cpu base, núcleos, ram usada, ram total, disco, rede KB/s, tags, ha
        (100, "truenas", "VM", "running", 6, 4, 14.1, 16, None, 820, ["nas"], "started"),
        (101, "pbs", "VM", "running", 3, 2, 1.8, 4, None, 140, ["backup"], None),
        (102, "emby", "LXC", "running", 18, 4, 3.3, 8, 62, 2400, ["midia"], None),
        (103, "docker-apps", "LXC", "running", 7, 2, 2.7, 4, 44, 95, ["docker"], None),
        (104, "pihole", "LXC", "running", 1.1, 1, 0.1, 0.5, 31, 12, ["dns"], None),
        (110, "win11-lab", "VM", "stopped", 0, 4, 0, 8, None, 0, ["lab"], None),
    ]
    guests, metrics = [], {}
    for k, (vid, name, typ, status, cb, cores, mu, mt, dk, net, tags, ha) in enumerate(spec):
        run = status == "running"
        cpu_g = w(k, cb, cb * 0.8, 400 + k * 90, 0, 100) if run else 0
        mem_g = round(min(99, mu / mt * 100 + w(k + 3, 0, 3, lo=-5, hi=5)), 1) if run else None
        n_rate = w(k + 7, net, net * 0.6, 300, 0, 99999) if run else 0
        guests.append(dict(vmid=vid, name=name, type=typ, node="pve", status=status, cpu=cpu_g, cores=cores, mem=mem_g,
                           mem_text=f"{mu:.1f} GB / {mt:.1f} GB" if run else f"0 B / {mt:.1f} GB", mem_used=mu * G if run else 0,
                           disk=dk, uptime=(700_000 if typ == "LXC" else 2_400_000) if run else 0,
                           netin=round(n_rate * 1024 * 0.7), netout=round(n_rate * 1024 * 0.3), diskread=round(w(k, 900, 700, lo=0, hi=1e6) * 1024) if run else 0,
                           diskwrite=round(w(k + 2, 400, 300, lo=0, hi=1e6) * 1024) if run else 0, tags=tags, ha=ha, lock=None))
        if run:
            metrics.update({f"{c.id}.g{vid}.cpu": cpu_g, f"{c.id}.g{vid}.mem": mem_g, f"{c.id}.g{vid}.net": n_rate})
    hide = set(c.opt_list("hide_guests"))
    guests = [g for g in guests if str(g["vmid"]) not in hide and g["name"] not in hide]
    guests.sort(key=lambda g: (g["status"] != "running", -(g["cpu"] or 0)))
    storages = [dict(name="local-lvm", node="pve", type="lvmthin", status="available", used=84.3, shared=False, used_b=389 * G, total_b=461 * G, content="images,rootdir", text="389 GB / 461 GB"),
                dict(name="local", node="pve", type="dir", status="available", used=37.4, shared=False, used_b=35 * G, total_b=94 * G, content="iso,vztmpl,backup", text="35.1 GB / 93.9 GB"),
                dict(name="pbs-store", node="pve", type="pbs", status="available", used=61.2, shared=True, used_b=1100 * G, total_b=1800 * G, content="backup", text="1.1 TB / 1.8 TB"),
                dict(name="nas-iso", node="pve", type="nfs", status="available", used=12.0, shared=True, used_b=86 * G, total_b=720 * G, content="iso", text="86 GB / 720 GB")]
    nodes = [dict(name="pve", online=True, cpu=cpu, cores=12, mem_used=45.4 * G, mem_total=64 * G, root_used=35.1 * G, root_total=93.9 * G,
                  uptime=2_406_000, model="AMD Ryzen 5 5600G with Radeon Graphics", sockets=1, threads=12,
                  load=[round(cpu / 100 * 12, 2), round(cpu / 100 * 11, 2), round(cpu / 100 * 10, 2)],
                  swap_used=0.4 * G, swap_total=8 * G, iowait=w(4, 1.2, 1, lo=0, hi=30), netin=w(5, 2600, 1500, lo=0, hi=1e5) * 1024,
                  netout=w(6, 900, 600, lo=0, hi=1e5) * 1024, version="9.0.10", kernel="6.14.8-2-pve", guests_running=5, guests_total=6,
                  boot="efi", secureboot=False, cpu_cores=6, mhz=3900, arc=8.2 * G, mem_avail=18.6 * G,
                  temp=w(9, 46, 5, lo=30, hi=95), temp_src="demonstração")]
    for k in ("iowait", "netin", "netout"):
        metrics[f"{c.id}-pve.{k}"] = round(nodes[0][k] / (1024 if k != "iowait" else 1), 2)
    metrics[f"{c.id}-pve.load"] = nodes[0]["load"][0]
    tasks = [dict(type="vzdump", id="100", node="pve", user="root@pam", start=now - 3 * 3600, end=now - 3 * 3600 + 410, status="OK"),
             dict(type="vzdump", id="102", node="pve", user="root@pam", start=now - 3 * 3600 + 420, end=now - 3 * 3600 + 520, status="OK"),
             dict(type="qmstart", id="101", node="pve", user="ana@pve", start=now - 26 * 3600, end=now - 26 * 3600 + 4, status="OK"),
             dict(type="vncproxy", id="110", node="pve", user="ana@pve", start=now - 30 * 3600, end=now - 30 * 3600 + 900, status="OK"),
             dict(type="aptupdate", id=None, node="pve", user="root@pam", start=now - 40 * 3600, end=now - 40 * 3600 + 30, status="OK"),
             dict(type="qmsnapshot", id="110", node="pve", user="ana@pve", start=now - 50 * 3600, end=now - 50 * 3600 + 12,
                  status="VM 110 qmp command 'savevm-start' failed - unable to connect")]
    disks = [dict(node="pve", dev="/dev/nvme0n1", model="Samsung SSD 980 PRO 1TB", size=1000 * 10 ** 9, type="nvme", health="PASSED", wearout=6),
             dict(node="pve", dev="/dev/sda", model="Crucial MX500 500GB", size=500 * 10 ** 9, type="ssd", health="PASSED", wearout=23),
             dict(node="pve", dev="/dev/sdb", model="WDC WD40EFRX", size=4000 * 10 ** 9, type="hdd", health="PASSED", wearout=None)]
    running = len([g for g in guests if g["status"] == "running"])
    totals = dict(cpu_used=round(cpu / 100 * 12, 1), cpu_total=12, mem_used=45.4 * G, mem_total=64 * G,
                  st_used=sum(s["used_b"] for s in storages), st_total=sum(s["total_b"] for s in storages),
                  vms=[len([g for g in guests if g["type"] == "VM" and g["status"] == "running"]), len([g for g in guests if g["type"] == "VM"])],
                  cts=[len([g for g in guests if g["type"] == "LXC" and g["status"] == "running"]), len([g for g in guests if g["type"] == "LXC"])])
    metrics.update({f"{c.id}.running": running, f"{c.id}.cluster.cpu": cpu, f"{c.id}.cluster.mem": round(45.4 / 64 * 100, 1)})
    return _r(hosts=[node], metrics=metrics,
              events=[event("warn", "Storage local-lvm em 84.3%", "pve", c.page)],
              details=dict(cluster=dict(name=None, quorate=None, nodes=1, online=1, total=1), totals=totals, nodes=nodes,
                           guests=guests, storages=storages, tasks=tasks, disks=disks, running=running, total=len(guests),
                           ifaces={"pve": [
                               dict(iface="vmbr0", type="bridge", address="192.168.1.10", cidr="192.168.1.10/24", gateway="192.168.1.1", active=True, autostart=True, ports="enp3s0", vlan_aware=True, comments="LAN"),
                               dict(iface="vmbr1", type="bridge", address=None, cidr=None, gateway=None, active=True, autostart=True, ports="enp4s0", vlan_aware=False, comments="IoT / câmeras"),
                               dict(iface="enp3s0", type="eth", address=None, cidr=None, gateway=None, active=True, autostart=True, ports=None, vlan_aware=False, comments=None),
                               dict(iface="enp4s0", type="eth", address=None, cidr=None, gateway=None, active=True, autostart=True, ports=None, vlan_aware=False, comments=None),
                               dict(iface="wlp2s0", type="eth", address=None, cidr=None, gateway=None, active=False, autostart=False, ports=None, vlan_aware=False, comments=None)]}))


def pbs(c):
    now = int(time.time())
    G = 1024 ** 3
    tasks = []
    for d in range(7):
        for k, vm in enumerate(["vm/100", "vm/101", "ct/102", "ct/103", "ct/104"]):
            st = now - d * 86400 - 3 * 3600 - k * 400
            fail = d == 3 and vm == "ct/103"
            tasks.append(dict(type="Backup", target=f"backup:{vm}", start=st, end=st + 240 + k * 60, status="unable to acquire lock" if fail else "OK", user="root@pam"))
        tasks.append(dict(type="GC", target="backup", start=now - d * 86400 - 3600, end=now - d * 86400 - 3300, status="OK", user="root@pam"))
    tasks.insert(2, dict(type="Verificação", target="backup:v-8c1d", start=now - 9000, end=now - 8100, status="verification failed on 1 snapshot", user="root@pam"))
    tasks.sort(key=lambda t: -t["start"])
    days = []
    for k in range(6, -1, -1):
        d0 = int((now // 86400 - k) * 86400)
        bk = [t for t in tasks if t["type"] == "Backup" and d0 <= t["start"] < d0 + 86400]
        days.append(dict(day=d0, ok=len([t for t in bk if t["status"] == "OK"]), fail=len([t for t in bk if t["status"] != "OK"])))
    h = host(c.id, c.name if c.name != c.label else "pbs", "pbs", os="Proxmox Backup Server 4.0", cpu=w(1, 4, 3),
             mem=w(2, 46, 2), mem_text="1.8 GB / 4.0 GB", disk=22.0, disk_text="7.0 GB / 32 GB",
             uptime=2_400_000, cores=2, badges=["PBS"], note="5 backups OK em 24 h")
    hist = [[now - 30 * 86400 + k * 86400, round(48 + k * 0.45 + math.sin(k) * 0.6, 2)] for k in range(31)]
    groups = [dict(store="backup", type=t, id=i, ns="", count=n, last=now - 3 * 3600 - k * 400, size=sz * G, verify=v, protected=p, comment=cm, owner="root@pam")
              for k, (t, i, n, sz, v, p, cm) in enumerate([("vm", "100", 21, 32.4, "ok", 1, "truenas"), ("vm", "101", 21, 4.1, "ok", 0, "pbs"),
                                                           ("ct", "102", 21, 6.8, "ok", 0, "emby"), ("ct", "103", 20, 3.2, "failed", 0, "docker-apps"),
                                                           ("ct", "104", 21, 0.6, None, 0, "pihole"), ("host", "orangepi", 9, 2.2, "ok", 0, "Orange Pi")])]
    groups[-1]["last"] = now - 3 * 86400
    jobs = [dict(kind="Verificação", id="v-semanal", store="backup", schedule="sat 02:00", last_state="verification failed on 1 snapshot", last_end=now - 8100, next=now + 4 * 86400, comment=None, remote=None),
            dict(kind="Limpeza (prune)", id="p-diario", store="backup", schedule="daily", last_state="OK", last_end=now - 20 * 3600, next=now + 4 * 3600, comment="7 diários, 4 semanais, 6 mensais", remote=None),
            dict(kind="Sincronização", id="s-offsite", store="backup", schedule="sun 04:00", last_state="OK", last_end=now - 2 * 86400, next=now + 5 * 86400, comment="cópia no NAS do escritório", remote="nas-escritorio")]
    return _r(hosts=[h], metrics={f"{c.id}.ds.backup": 61.2, f"{c.id}.failed24h": 1},
              events=[event("crit", "Verificação falhou", "backup:v-8c1d: verification failed on 1 snapshot", c.page),
                      event("warn", "host/orangepi sem backup recente", "Último há 72 h em backup", c.page)],
              details=dict(datastores=[dict(name="backup", used=61.2, used_b=1.1 * 1024 * G, total_b=1.8 * 1024 * G, avail_b=0.7 * 1024 * G,
                                            text="1.1 TB / 1.8 TB", full_date=now + 86400 * 210, history=hist)],
                           tasks=tasks, last_ok=now - 3 * 3600, ok_24h=5, failed_24h=1, stale=1, days=days, groups=groups, jobs=jobs,
                           gc={"backup": dict(dedup=18.4, removed=42 * G, pending=3.1 * G, last_state="OK", last_end=now - 3300, next=now + 20 * 3600, schedule="daily")},
                           node=dict(cpu=h["cpu"], mem_used=1.8 * G, mem_total=4 * G, root_used=7 * G, root_total=32 * G, swap_used=0, swap_total=2 * G,
                                     load=[0.12, 0.2, 0.18], uptime=2_400_000, model="QEMU Virtual CPU", threads=2, kernel="6.14.8-2-pve",
                                     iowait=0.4, version="4.0.14-1")))


def truenas(c):
    pools = [dict(name="tank", status="ONLINE", healthy=True, used=81.7, text="5.8 TB / 7.1 TB", scan="SCRUB", scan_state="FINISHED", scan_errors=0),
             dict(name="ssd", status="ONLINE", healthy=True, used=34.0, text="302 GB / 888 GB", scan="SCRUB", scan_state="FINISHED", scan_errors=0)]
    h = host(c.id, "truenas", "truenas", os="TrueNAS 25.10", cpu=w(2, 9, 6), mem=88.0, mem_text="16.0 GB",
             disk=81.7, disk_text="pior pool", uptime=2_400_000, cores=4, badges=["NAS"], note="2 pools, 1 alerta")
    return _r(hosts=[h], events=[event("warn", "Pool tank em 81.7%", "ZFS perde desempenho acima de 80%", c.page)],
              details=dict(pools=pools, version="25.10", api="WebSocket",
                           alerts=[dict(level="WARNING", text='Space usage for pool "tank" is 81%.')],
                           apps=[dict(name="syncthing", state="RUNNING"), dict(name="immich", state="RUNNING")]))


def zabbix(c):
    hosts = []
    for i, item in enumerate(c.opt_list("fleet_hosts")):
        tech, _, disp = item.partition("=")
        hosts.append(host(f"zbx-{tech.strip().lower()}", disp.strip() or tech.strip(), c.opt("fleet_kind"),
                          os="Zabbix agent", cpu=w(6 + i, 17, 9), mem=w(7 + i, 54, 4), disk=w(8, 47, 0.1),
                          uptime=1_120_000, cores=8, load=w(6, 0.9, 0.4, lo=0, hi=8),
                          temp=w(9, 54, 6, lo=30, hi=90) if c.opt("temp_key") or i == 0 else None,
                          badges=["Zabbix"], note=tech.strip()))
    now = int(time.time())
    problems = [dict(severity=3, severity_text="Média", title="Alta latência ICMP para 8.8.8.8", host="Gateway Ultra", since=now - 2400),
                dict(severity=2, severity_text="Atenção", title="/: espaço em disco abaixo de 20%", host="emby", since=now - 86000)]
    host_list = [dict(id=str(10080 + k), name=n, tech=t, ip=ip, available=av, maintenance=False, worst=wv, problems=pc)
                 for k, (n, t, ip, av, wv, pc) in enumerate([("Gateway Ultra", "gateway", "192.168.1.1", "up", 3, 1), ("emby", "emby", "192.168.1.30", "up", 2, 1),
                                                             ("Orange Pi 4 Pro", "orangepi", "192.168.1.13", "up", None, 0), ("pve", "pve", "192.168.1.10", "up", None, 0),
                                                             ("truenas", "truenas", "192.168.1.12", "up", None, 0), ("Zabbix server", "Zabbix server", "127.0.0.1", "up", None, 0),
                                                             ("pbs", "pbs", "192.168.1.11", "up", None, 0), ("docker-apps", "docker-apps", "192.168.1.31", "up", None, 0),
                                                             ("impressora", "impressora", "192.168.1.60", "down", None, 0)])]
    for p, hid in zip(problems, ["10080", "10081"]):
        p.update(hostids=[hid], ack=p["severity"] == 2, suppressed=False)
    for h in hosts:
        h["zbx_hostid"] = "10082"
    return _r(hosts=hosts, metrics={f"{c.id}.problems": 2, f"{c.id}.problems.high": 0, f"{c.id}.unavailable": 1,
                                    f"{c.id}.queue": w(2, 4, 3, lo=0, hi=100), f"{c.id}.nvps": w(3, 18.4, 1, lo=0, hi=100)},
              events=[event("warn", p["title"], f"Zabbix: {p['host']}", c.page) for p in problems],
              services=[c.svc(version="7.4.2", summary="2 problemas, 9 hosts")],
              details=dict(version="7.4.2", problems=problems, hosts=9, unavailable=["impressora"], host_list=host_list,
                           sev_count={0: 0, 1: 0, 2: 1, 3: 1, 4: 0, 5: 0}, perf=dict(queue=4, nvps=18.4, unsupported=12)))


HOUSE = [  # cômodo, [(nome, tipo, watts base, ligado)]
    ("Cozinha", [("Luz da cozinha", "luz", 0, True), ("Luz da bancada", "luz", 0, False),
                 ("Geladeira", "tomada", 95, True), ("Micro-ondas", "tomada", 2, True), ("Cafeteira", "tomada", 0, False)]),
    ("Sala", [("Luz da sala", "luz", 0, True), ("Luz de leitura", "luz", 0, False),
              ("TV e soundbar", "tomada", 118, True), ("Abajur", "tomada", 7, True)]),
    ("Suíte", [("Luz da suíte", "luz", 0, False), ("Luz do banheiro", "luz", 0, False),
               ("Ar-condicionado", "tomada", 0, False), ("Carregadores", "tomada", 6, True)]),
    ("Escritório", [("Luz do escritório", "luz", 0, True), ("Rack homelab", "tomada", 118, True),
                    ("Mesa (PC e monitores)", "tomada", 165, True)]),
    ("Segundo quarto", [("Luz do quarto", "luz", 0, False), ("Ventilador", "tomada", 0, False)]),
]


def homeassistant(c):
    """Estados e áreas simulados passando pelo mesmo montador do modo real."""
    from .homeassistant import build_house, house_events, _key
    now = time.time()
    iso = lambda t: dt.datetime.fromtimestamp(t, dt.timezone.utc).isoformat()  # noqa: E731
    states, registry, stats = {}, [], {}
    for ri, (room, devs) in enumerate(HOUSE):
        ents = []
        for di, (name, kind, base, on) in enumerate(devs):
            slug = _key("x." + unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()).replace("-", "_")
            dev = f"dev{ri}{di}"
            lqi = 22 if name == "Luz do quarto" else 60 + (ri * 31 + di * 17) % 140
            if kind == "luz":
                eid = f"light.{slug}"
                states[eid] = dict(entity_id=eid, state="on" if on else "off", last_changed=iso(now - (7.5 if name == "Luz da sala" else 0.6 + di) * 3600),
                                   attributes=dict(friendly_name=name, brightness=200 if on else None))
                ents.append([eid, dev, name])
            else:
                sw, pw, en = f"switch.{slug}", f"sensor.{slug}_power", f"sensor.{slug}_energy"
                watts = (w(ri + di, base, base * 0.25, 600, 0, 4000) if base > 20 else base) if on else 0
                if name == "Geladeira":
                    watts = 110 if int(now / 900) % 3 else 3   # compressor liga e desliga
                if name == "Rack homelab":
                    watts = w(0, 128, 22, 900, 60, 400)
                states[sw] = dict(entity_id=sw, state="on" if on else "off", last_changed=iso(now - 86400), attributes=dict(friendly_name=name))
                states[pw] = dict(entity_id=pw, state=str(round(watts, 1)), last_changed=iso(now), attributes=dict(device_class="power", unit_of_measurement="W"))
                states[en] = dict(entity_id=en, state="123.4", last_changed=iso(now), attributes=dict(device_class="energy", unit_of_measurement="kWh"))
                avg = {"Geladeira": 70, "Ar-condicionado": 260, "Ventilador": 20, "Cafeteira": 30, "Micro-ondas": 25}.get(name, base or 4)
                stats[en] = dict(today=avg * 14 / 1000, d7=avg * 24 * 7 / 1000, d30=avg * 24 * 30 / 1000)
                ents += [[sw, dev, name], [pw, dev, name], [en, dev, name]]
            lq = f"sensor.{slug}_linkquality"
            states[lq] = dict(entity_id=lq, state=str(lqi), attributes=dict(unit_of_measurement="lqi"))
            ents.append([lq, dev, name])
        if room == "Segundo quarto":  # sensor de porta com bateria fraca
            states["sensor.porta_quarto_battery"] = dict(entity_id="sensor.porta_quarto_battery", state="14",
                                                         attributes=dict(device_class="battery", unit_of_measurement="%"))
            ents.append(["sensor.porta_quarto_battery", "devporta", "Sensor da porta"])
        registry.append(dict(id=_key("x." + room), name=room, entities=ents))
    opts = dict(areas=c.opt_list("areas"), ignore=c.opt_list("ignore"), power_entity=c.opt("power_entity") or "sensor.rack_homelab_power",
                light_on_alert_h=c.opt("light_on_alert_h"), plug_high_w=c.opt("plug_high_w"),
                battery_warn=c.opt("battery_warn"), lqi_warn=c.opt("lqi_warn"))
    # câmeras do Frigate simuladas (a do quintal fora do ar)
    for k, (cam, fps, motion, people) in enumerate([("garagem", 5, False, 0), ("entrada", 5, True, 1),
                                                    ("quintal", 0, False, 0), ("sala", 5, False, 0)]):
        states[f"camera.{cam}"] = dict(entity_id=f"camera.{cam}", state="recording" if fps else "idle",
                                       last_changed=iso(now - 3600 * (k + 1)), attributes=dict(friendly_name=cam.title()))
        states[f"sensor.{cam}_camera_fps"] = dict(entity_id=f"sensor.{cam}_camera_fps", state=str(fps), attributes={})
        states[f"binary_sensor.{cam}_motion"] = dict(entity_id=f"binary_sensor.{cam}_motion", state="on" if motion else "off", attributes={})
        states[f"sensor.{cam}_person_count"] = dict(entity_id=f"sensor.{cam}_person_count", state=str(people), attributes={})
        states[f"switch.{cam}_detect"] = dict(entity_id=f"switch.{cam}_detect", state="on", attributes={})
        states[f"switch.{cam}_recordings"] = dict(entity_id=f"switch.{cam}_recordings", state="on", attributes={})
    c._frigate = ["camera.garagem", "camera.entrada", "camera.quintal", "camera.sala"]
    house = build_house(states, registry, stats, opts, float(c.settings["energy"]["tariff"]))
    c.add_cameras(house, states)
    opts["camera_offline_alert"] = c.opt("camera_offline_alert")
    rack = float(states["sensor.rack_homelab_power"]["state"])
    metrics = {"power.w": rack, f"{c.id}.house.w": house["power"], f"{c.id}.lights_on": house["lights_on"]}
    for r in house["rooms"]:
        for p in r["plugs"]:
            metrics[f"{c.id}.p.{p['key']}"] = p["power"] or 0
    return _r(metrics=metrics,
              events=[event("info", f"2 atualizações no {c.name}", "Home Assistant Core, ESPHome", c.page)] + house_events(house, opts, c.page),
              services=[c.svc(version="2026.11.2", summary=f"{house['lights_on']} luzes acesas, casa em {house['power']:.0f} W"
                                                       + (f", {len(house['cameras'])} câmeras ({len([x for x in house['cameras'] if not x['online']])} offline)" if house.get("cameras") else ""))],
              details=dict(version="2026.11.2", entities=438, power_w=rack, house=house,
                           watch=[dict(id=e, name=e, state="–", unit="") for e in c.opt_list("entities")],
                           unavailable=["sensor.varanda_umidade", "sensor.ups_load"], updates=["Home Assistant Core", "ESPHome"]))


def media(c):
    """Emby e Jellyfin simulados."""
    now = int(time.time())
    jf = c.type == "jellyfin"
    prog = int((now / 30) % 100)
    playing = [dict(user="ana", client="Emby Android TV" if not jf else "Jellyfin Android TV", device="TV da sala", ip="192.168.1.113",
                    title="Severance · T2E4 · Lado B", type="Episode", year=2025, paused=False, method="DirectPlay", progress=prog,
                    position=prog * 30, runtime=3000, bitrate=18.2, source="HEVC 2160p", audio="EAC3 6ch", target=None, hw=None,
                    transcode_progress=None, transcode_reason="", image="d-sev"),
               dict(user="pedro", client="Navegador", device="Firefox", ip="177.12.40.9", title="Duna: Parte Dois", type="Movie", year=2024,
                    paused=False, method="Transcode", progress=37, position=3700, runtime=9960, bitrate=8.0, source="HEVC 2160p",
                    audio="TRUEHD 8ch", target="H264 / AAC", hw="vaapi", transcode_progress=41,
                    transcode_reason="Codec de vídeo não suportado, codec de áudio não suportado", image="d-duna")]
    if jf:
        playing = playing[:1]
    titles = [("O Dia do Chacal", "Movie", 2024), ("Shogun", "Episode", 2024), ("Robô Selvagem", "Movie", 2024), ("The Bear", "Episode", 2025),
              ("Ainda Estou Aqui", "Movie", 2024), ("Andor", "Episode", 2025), ("Anora", "Movie", 2024), ("Ruptura", "Episode", 2025),
              ("Flow", "Movie", 2024), ("Slow Horses", "Episode", 2024), ("Conclave", "Movie", 2024), ("Silo", "Episode", 2025)]
    recent = [dict(id=f"d-{k}", title=t if typ == "Movie" else f"Episódio {k + 1}", series=None if typ == "Movie" else t, year=y,
                   season=1 if typ == "Episode" else None, episode=k + 1 if typ == "Episode" else None, type=typ,
                   added=now - k * 7 * 3600, image=f"d-{k}") for k, (t, typ, y) in enumerate(titles)]
    libs = [dict(name="Filmes", kind="Filmes", paths=["/mnt/media/filmes"], count=612), dict(name="Séries", kind="Séries", paths=["/mnt/media/series"], count=3996),
            dict(name="Infantil", kind="Filmes", paths=["/mnt/media/infantil"], count=148), dict(name="Música", kind="Música", paths=["/mnt/media/musica"], count=8420)]
    users = [dict(name="ana", admin=True, disabled=False, last=now - 300), dict(name="pedro", admin=False, disabled=False, last=now - 600),
             dict(name="vó", admin=False, disabled=False, last=now - 3 * 86400), dict(name="convidado", admin=False, disabled=True, last=None)]
    activity = [dict(when=now - 300, name="ana está reproduzindo Severance em TV da sala", type="playback.start", severity="Information", overview=None),
                dict(when=now - 600, name="pedro está reproduzindo Duna: Parte Dois em Firefox", type="playback.start", severity="Information", overview=None),
                dict(when=now - 2 * 3600, name="Falha de login de 45.83.21.7", type="AuthenticationFailed", severity="Error", overview="Usuário: admin"),
                dict(when=now - 2 * 3600 + 30, name="Falha de login de 45.83.21.7", type="AuthenticationFailed", severity="Error", overview="Usuário: root"),
                dict(when=now - 5 * 3600, name="pedro iniciou sessão em Firefox", type="SessionStarted", severity="Information", overview=None),
                dict(when=now - 9 * 3600, name="Biblioteca Séries atualizada: 4 itens novos", type="LibraryScan", severity="Information", overview=None)]
    tasks = [dict(name="Escanear biblioteca de mídia", category="Biblioteca", state="Idle", progress=None, result="Completed", error=None, start=now - 9 * 3600, end=now - 9 * 3600 + 410),
             dict(name="Extrair capítulos", category="Biblioteca", state="Running", progress=63, result="Completed", error=None, start=now - 86400, end=now - 86400 + 1900),
             dict(name="Baixar legendas ausentes", category="Biblioteca", state="Idle", progress=None, result="Failed", error="Limite de downloads do OpenSubtitles atingido", start=now - 6 * 3600, end=now - 6 * 3600 + 40),
             dict(name="Limpar logs", category="Manutenção", state="Idle", progress=None, result="Completed", error=None, start=now - 20 * 3600, end=now - 20 * 3600 + 2),
             dict(name="Otimizar banco de dados", category="Manutenção", state="Idle", progress=None, result="Completed", error=None, start=now - 30 * 3600, end=now - 30 * 3600 + 95)]
    bw = round(sum(p["bitrate"] for p in playing), 1)
    trans = len([p for p in playing if p["method"] == "Transcode"])
    ver = "10.11.3" if jf else "4.9.1.80"
    return _r(metrics={f"{c.id}.streams": len(playing), f"{c.id}.transcodes": trans, f"{c.id}.bandwidth": bw, f"{c.id}.users_active": 2},
              events=[event("warn", f"Tarefa 'Baixar legendas ausentes' falhou", f"{c.name}: Limite de downloads do OpenSubtitles atingido", c.page)],
              services=[c.svc(version=ver, summary=f"{len(playing)} reproduzindo")],
              details=dict(product=c.label, server="midia", version=ver, os="Linux", update=not jf, restart=False, sessions=playing,
                           transcoding=trans, bandwidth=bw, counts=dict(MovieCount=760, SeriesCount=84, EpisodeCount=3912, SongCount=8420),
                           recent=recent, activity=activity, libraries=libs, users=users, users_active=2, tasks=tasks,
                           posters=c.opt("show_posters") is not False, logins_failed_24h=2))


emby = jellyfin = media


def nextcloud(c):
    G = 1024 ** 3
    a5, a1, a24 = int(w(1, 3, 2, lo=0, hi=20)), 6, 9
    return _r(metrics={f"{c.id}.active5m": a5, f"{c.id}.active1h": a1, f"{c.id}.active24h": a24, f"{c.id}.files": 184_320,
                       f"{c.id}.load": w(2, 0.6, 0.4, lo=0, hi=8), f"{c.id}.mem": w(3, 58, 4), f"{c.id}.free_gb": 612.4, f"{c.id}.db_mb": 842.0},
              events=[event("info", "3 app(s) do Nextcloud para atualizar", "calendar, contacts, photos", c.page),
                      event("info", "2 link(s) público(s) sem senha", f"{c.name}: confira os compartilhamentos", c.page)],
              services=[c.svc(version="31.0.4.1", summary=f"{a5} ativos agora, 11 usuários")],
              details=dict(version="31.0.4.1", maintenance=False, users=11, files=184_320, storages=14, storages_local=1, storages_other=2,
                           free=612.4 * G, active=dict(m5=a5, h1=a1, h24=a24), load=[0.62, 0.48, 0.41], cpus=4,
                           mem_total=8 * G, mem_free=3.4 * G, swap_total=2 * G, swap_free=1.9 * G,
                           shares=dict(total=57, user=31, groups=8, link=14, link_nopass=2, mail=1, room=3, fed_sent=0, fed_recv=0),
                           webserver="nginx/1.26.2", php=dict(version="8.3.14", memory_limit=1073741824, max_exec=3600, upload=17179869184, opcache_hit=99.2, apcu=True),
                           db=dict(type="pgsql", version="16.6", size=842e6), cache=dict(local="\\OC\\Memcache\\APCu", distributed="\\OC\\Memcache\\Redis", locking="\\OC\\Memcache\\Redis", filelocking=True),
                           apps=dict(installed=48, updates={"calendar": "5.2.1", "contacts": "7.1.0", "photos": "4.0.2"}),
                           update=dict(available=False, version=None, checked=int(time.time()) - 6 * 3600), debug=False))


def poster_svg(item_id):
    """Capa simulada (SVG) para o modo demonstração."""
    import hashlib
    import html
    names = {"d-sev": "Severance", "d-duna": "Duna: Parte Dois"}
    k = int(hashlib.md5(item_id.encode()).hexdigest()[:6], 16)
    hue, title = k % 360, names.get(item_id, ["O Dia do Chacal", "Shogun", "Robô Selvagem", "The Bear", "Ainda Estou Aqui", "Andor",
                                              "Anora", "Ruptura", "Flow", "Slow Horses", "Conclave", "Silo"][int(item_id[2:]) % 12] if item_id[2:].isdigit() else "Filme")
    words, lines, cur = title.split(), [], ""
    for wd in words:
        if len(cur) + len(wd) > 11:
            lines.append(cur.strip()); cur = ""
        cur += wd + " "
    lines.append(cur.strip())
    txt = "".join(f'<text x="100" y="{210 + i * 26}" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="#fff">{html.escape(l)}</text>' for i, l in enumerate(lines))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="hsl({hue},45%,38%)"/><stop offset="1" stop-color="hsl({(hue + 40) % 360},55%,14%)"/></linearGradient></defs>'
            f'<rect width="200" height="300" fill="url(#g)"/><circle cx="100" cy="110" r="46" fill="hsl({(hue + 180) % 360},60%,70%)" opacity=".35"/>{txt}</svg>').encode()
def _check(c):
    ms = int(w(hash(c.id) % 7, 40, 25, lo=5, hi=400))
    return _r(services=[c.svc(summary=f"respondendo em {ms} ms")], metrics={f"{c.id}.latency": ms, f"{c.id}.up": 1},
              details=dict(latency_ms=ms))


DEMOS = dict(unifi=unifi, proxmox=proxmox, pbs=pbs, truenas=truenas, zabbix=zabbix,
             homeassistant=homeassistant, emby=emby, jellyfin=jellyfin, nextcloud=nextcloud, http=_check, tcp=_check)


def camera_svg(name, online):
    """Imagem simulada de câmera (SVG) para o modo demonstração."""
    import html
    t = time.strftime("%d/%m/%Y %H:%M:%S")
    shift = int(time.time()) % 40
    if not online:
        body = '<rect width="640" height="360" fill="#151a18"/><text x="320" y="185" fill="#8a948f" font-size="22" text-anchor="middle" font-family="sans-serif">Sem sinal</text>'
    else:
        body = (f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4a55"/><stop offset="1" stop-color="#1d2429"/></linearGradient></defs>'
                f'<rect width="640" height="360" fill="url(#g)"/><rect y="230" width="640" height="130" fill="#2a2f2c"/>'
                f'<rect x="60" y="120" width="180" height="110" fill="#4a5459"/><rect x="85" y="150" width="40" height="40" fill="#e3c77a" opacity=".55"/>'
                f'<rect x="380" y="150" width="200" height="80" fill="#3d4549"/><circle cx="{280 + shift * 3}" cy="250" r="14" fill="#c9cfcb" opacity=".8"/>'
                f'<rect x="{270 + shift * 3}" y="264" width="20" height="40" rx="6" fill="#c9cfcb" opacity=".8"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">{body}'
            f'<rect x="10" y="10" width="250" height="26" rx="4" fill="#000" opacity=".45"/>'
            f'<text x="20" y="28" fill="#fff" font-size="14" font-family="monospace">{html.escape(name)} {t}</text></svg>').encode()


def pve_rrd(tf, vmid=None):
    """Histórico simulado no formato do rrd_series."""
    span = {"hour": 3600, "day": 86400, "week": 604800, "month": 2592000, "year": 31536000}[tf]
    step = {"hour": 60, "day": 1800 // 3, "week": 3600, "month": 14400, "year": 86400 * 2}[tf]
    now = int(time.time())
    seed = (vmid or 0) % 13
    ser = {k: [] for k in ("cpu", "load", "iowait", "mem_total", "mem_used", "arc", "mem_avail", "netin", "netout", "diskread", "diskwrite")}
    for t in range(now - span, now, step):
        day = math.sin(((t / 3600) % 24) / 24 * 2 * math.pi - 1.3)
        n = random.uniform(-1, 1)
        cpu = max(0.3, (6 if vmid else 7) + 3 * day + 2.5 * n + (6 if random.random() < 0.04 else 0) + seed * 0.4)
        ser["cpu"].append([t, round(cpu, 2)])
        if not vmid:
            ser["load"].append([t, round(cpu / 100 * 12 * 1.6 + 0.2 * n, 2)])
            ser["iowait"].append([t, round(max(0, 1 + 0.8 * day + 0.6 * n), 2)])
            ser["mem_total"].append([t, 62.3])
            ser["mem_used"].append([t, round(47.8 + 0.6 * day + 0.2 * n, 2)])
            ser["arc"].append([t, round(8.2 + 0.4 * day, 2)])
            ser["mem_avail"].append([t, round(62.3 - 47.8 - 0.6 * day, 2)])
        else:
            ser["mem_total"].append([t, 8.0])
            ser["mem_used"].append([t, round(3.3 + 0.5 * day + 0.1 * n, 2)])
        ser["netin"].append([t, round(max(0, 22 + 18 * day + 10 * n), 2)])
        ser["netout"].append([t, round(max(0, 9 + 6 * day + 4 * n), 2)])
        ser["diskread"].append([t, round(max(0, 3 + 2 * day + 2 * n), 2)])
        ser["diskwrite"].append([t, round(max(0, 2 + day + n), 2)])
    return dict(since=now - span, bucket=step, series={k: v for k, v in ser.items() if v})


DEMO_SYSLOG = [
    "pvedaemon[1243]: <root@pam> successful auth for user 'ana@pve'",
    "pve-firewall[1102]: firewall update time (0.012 seconds)",
    "pvestatd[1187]: storage 'nas-iso' is not online",
    "pvestatd[1187]: status update time (0.731 seconds)",
    "kernel: vmbr0: port 3(tap102i0) entered forwarding state",
    "vzdump[38211]: INFO: Finished Backup of VM 100 (00:06:50)",
    "vzdump[38211]: INFO: Backup job finished successfully",
    "smartd[912]: Device: /dev/sda [SAT], SMART Usage Attribute: 194 Temperature_Celsius changed from 64 to 63",
    "pveproxy[2210]: worker 2211 finished",
    "pvescheduler[4410]: starting task UPID:pve:0000AC4B:vzdump::root@pam:",
    "qmeventd[1033]: Starting cleanup for 110",
    "pvedaemon[1243]: VM 110 qmp command failed - VM 110 not running",
    "chronyd[880]: Selected source 200.160.7.186 (a.st1.ntp.br)",
]


def series(ctype, kind, tf):
    """Séries simuladas para /api/series (PBS e Zabbix)."""
    span = {"hour": 3600, "day": 86400, "week": 604800, "month": 2592000, "year": 31536000}[tf]
    step = max(60, span // 240)
    now = int(time.time())
    ser = {}
    prof = {"cpu": (6, 4), "load": (0.4, 0.3), "iowait": (0.6, 0.5), "mem_used": (1.8, 0.2), "mem_total": (4.0, 0), "netin": (40, 60), "netout": (12, 25),
            "used": (1126, 3), "total": (1843, 0), "available": (717, 3), "read": (8, 12), "write": (14, 20),
            "mem": (54, 4), "disk": (47, 0.3), "temp": (54, 6)}
    if ctype == "pbs" and kind == "node":
        keys = ["cpu", "load", "iowait", "mem_used", "mem_total", "netin", "netout"]
    elif ctype == "pbs":
        keys = ["used", "total", "available", "read", "write"]
    else:
        keys = ["cpu", "mem", "disk", "load", "temp", "netin", "netout"]
    for k in keys:
        b, a = prof[k]
        pts = []
        for t in range(now - span, now, step):
            day = math.sin(((t / 3600) % 24) / 24 * 2 * math.pi - 1.2)
            burst = 4 if (k in ("netin", "netout", "write", "read") and 2 <= (t / 3600) % 24 < 3) else 1   # janela de backup
            v = (b + a * (0.7 * day + 0.3 * random.uniform(-1, 1))) * burst
            if k == "used":
                v = b - (now - t) / 86400 * 0.6
            pts.append([t, round(max(0, v), 2)])
        ser[k] = pts
    return dict(since=now - span, bucket=step, series=ser)
