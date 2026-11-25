"""UniFi (Gateway Ultra, APs como o U6 Lite, switches opcionais).

Usa a UniFi Network Integration API (chave em Settings › Control Plane ›
Integrations). /stat/health, da API legada, completa os dados de WAN.
"""
import re

from .base import SSL, URL, Collector, F, host

BAND = {"ng": "2,4 GHz", "na": "5 GHz", "6e": "6 GHz", "6g": "6 GHz"}

GATEWAY_MODELS = ("UCG", "UDM", "UDR", "UXG", "UGW", "UX", "EFG")


class UniFi(Collector):
    type, label, page, makes_hosts = "unifi", "UniFi", "rede", True
    description = "Gateway, access points e switches pela Integration API."
    fields = [
        URL("https://192.168.1.1", "Endereço do Gateway Ultra (UniFi OS)"),
        F("api_key", "Chave de API", "secret", required=True,
          help="UniFi Network › Settings › Control Plane › Integrations"),
        F("site", "Site", default="default"),
        F("include_switches", "Incluir switches na frota", "bool", default=False),
        SSL,
    ]

    def headers(self):
        return {"X-API-KEY": self.opt("api_key"), "Accept": "application/json"}

    async def collect(self):
        base, site_ref = self.base_url, self.opt("site")
        api = f"{base}/proxy/network/integration/v1"
        hosts, events, metrics = [], [], {}
        details = {"aps": [], "gateway": None, "clients": None, "wan": {}, "devices": [], "radios": [], "client_list": [],
                   "speedtest": None, "legacy": False}
        int_clients, legacy_dev, legacy_sta = [], {}, []

        async with self.client() as c:
            sites = (await c.get(f"{api}/sites", params={"limit": 50})).raise_for_status().json()["data"]
            site = next((s for s in sites if s.get("internalReference") == site_ref), sites[0])
            sid = site["id"]
            devs = (await c.get(f"{api}/sites/{sid}/devices", params={"limit": 200})).raise_for_status().json()["data"]

            per_ap, offset, total = {}, 0, None
            while total is None or offset < min(total, 1000):
                page = (await c.get(f"{api}/sites/{sid}/clients", params={"limit": 200, "offset": offset})).json()
                total = page.get("totalCount", 0)
                for x in page.get("data", []):
                    int_clients.append(x)
                    if x.get("uplinkDeviceId"):
                        per_ap[x["uplinkDeviceId"]] = per_ap.get(x["uplinkDeviceId"], 0) + 1
                offset += 200
                if not page.get("data"):
                    break
            details["clients"] = total

            # API clássica (opcional): rádios, temperatura, clientes detalhados
            try:
                r = await c.get(f"{base}/proxy/network/api/s/{site_ref}/stat/device")
                if r.status_code == 200:
                    legacy_dev = {str(x.get("mac", "")).lower(): x for x in r.json().get("data", [])}
                    details["legacy"] = True
                r = await c.get(f"{base}/proxy/network/api/s/{site_ref}/stat/sta")
                if r.status_code == 200:
                    legacy_sta = r.json().get("data", [])
            except Exception:
                pass

            for d in devs:
                online = str(d.get("state", "")).upper() == "ONLINE"
                model = d.get("model", "")
                feats = [str(f).lower() for f in d.get("features", [])]
                is_gw = model.upper().startswith(GATEWAY_MODELS) or "gateway" in feats
                is_ap = "accesspoint" in feats and not is_gw
                is_sw = "switching" in feats and not (is_gw or is_ap)
                if not (is_gw or is_ap or (is_sw and self.opt("include_switches"))):
                    continue
                st = {}
                if online:
                    try:
                        st = (await c.get(f"{api}/sites/{sid}/devices/{d['id']}/statistics/latest")).json()
                    except Exception:
                        st = {}
                kind = "gateway" if is_gw else "ap" if is_ap else "switch"
                h = host(f"{self.id}-{d['id'][:8]}", d.get("name") or model, kind,
                         "online" if online else "offline", os=f"UniFi {model}", ip=d.get("ipAddress"),
                         cpu=st.get("cpuUtilizationPct"), mem=st.get("memoryUtilizationPct"),
                         uptime=st.get("uptimeSec"), load=st.get("loadAverage1Min"),
                         badges=[{"gateway": "Gateway", "ap": "AP", "switch": "Switch"}[kind]])
                lg = legacy_dev.get(str(d.get("macAddress", "")).lower(), {})
                temps = [t.get("value") for t in lg.get("temperatures") or [] if isinstance(t.get("value"), (int, float))]
                if lg.get("general_temperature") is not None:
                    temps.append(lg["general_temperature"])
                if temps:
                    h["temp"] = round(max(temps), 1)
                up = lg.get("uplink") or {}
                ports = lg.get("port_table") or []
                dev = dict(id=h["id"], name=h["name"], kind=kind, model=model, model_name=model,
                           ip=d.get("ipAddress"), online=online, version=lg.get("version") or d.get("firmwareVersion"),
                           cpu=h["cpu"], mem=h["mem"], temp=h.get("temp"), uptime=h["uptime"], load=h["load"],
                           clients=lg.get("num_sta", per_ap.get(d["id"])), satisfaction=lg.get("satisfaction"),
                           uplink=f"{up.get('speed')} Mbps" if up.get("speed") else None, uplink_name=up.get("uplink_device_name") or up.get("name"),
                           ports_up=len([x for x in ports if x.get("up")]) if ports else None, ports_total=len(ports) or None,
                           upgradable=bool(lg.get("upgradable")))
                details["devices"].append(dev)
                for rs in lg.get("radio_table_stats") or []:
                    band = BAND.get(rs.get("radio"), rs.get("radio"))
                    rt = next((x for x in lg.get("radio_table") or [] if x.get("name") == rs.get("name")), {})
                    radio = dict(ap=h["name"], ap_id=h["id"], band=band, channel=rs.get("channel"), width=rt.get("ht"),
                                 util=rs.get("cu_total"), self_util=rs.get("cu_self_tx", 0) + rs.get("cu_self_rx", 0) if rs.get("cu_self_tx") is not None else None,
                                 clients=rs.get("num_sta"), satisfaction=rs.get("satisfaction"), tx_power=rs.get("tx_power"),
                                 retries=None)
                    details["radios"].append(radio)
                    if isinstance(rs.get("cu_total"), (int, float)):
                        metrics[f"{h['id']}.cu.{re.sub('[^0-9a-z]', '', band.lower())}"] = rs["cu_total"]
                if not online:
                    h["note"] = f"Estado: {d.get('state')}"
                    events.append(self.ev("crit", f"{h['name']} offline", f"UniFi informa {d.get('state')}"))
                if is_gw:
                    up = st.get("uplink") or {}
                    rx, tx = (up.get("rxRateBps") or 0) / 1e6, (up.get("txRateBps") or 0) / 1e6
                    metrics[f"{self.id}.wan.rx"], metrics[f"{self.id}.wan.tx"] = round(rx, 2), round(tx, 2)
                    details["wan"].update(rx_mbps=round(rx, 2), tx_mbps=round(tx, 2))
                    details["gateway"] = h["name"]
                if is_ap:
                    radios = (st.get("interfaces") or {}).get("radios", [])
                    if not lg:   # sem API clássica: rádios básicos da Integration API
                        for rd in radios:
                            details["radios"].append(dict(ap=h["name"], ap_id=h["id"], band=f"{rd.get('frequencyGHz')} GHz", channel=None, width=None,
                                                          util=None, self_util=None, clients=None, satisfaction=None, tx_power=None,
                                                          retries=rd.get("txRetriesPct")))
                    else:
                        for rd in radios:
                            for x in details["radios"]:
                                if x["ap_id"] == h["id"] and str(rd.get("frequencyGHz", "")).split(".")[0] in x["band"]:
                                    x["retries"] = rd.get("txRetriesPct")
                    details["aps"].append(dict(
                        name=h["name"], model=model, online=online, clients=per_ap.get(d["id"], 0),
                        radios=[dict(band=r.get("frequencyGHz"), retries=r.get("txRetriesPct")) for r in radios]))
                    if online:
                        h["note"] = f"{per_ap.get(d['id'], 0)} clientes"
                        metrics[f"{h['id']}.clients"] = per_ap.get(d["id"], 0)
                hosts.append(h)

            try:
                r = await c.get(f"{base}/proxy/network/api/s/{site_ref}/stat/health")
                if r.status_code == 200:
                    for sub in r.json().get("data", []):
                        s = sub.get("subsystem")
                        if s == "wan":
                            details["wan"].update(isp=sub.get("isp_name"), wan_ip=sub.get("wan_ip"), gw_name=sub.get("gw_name"))
                        elif s == "www":
                            details["wan"].update(latency=sub.get("latency"), status_www=sub.get("status"), drops=sub.get("drops"),
                                                  uptime=sub.get("uptime"))
                            if sub.get("xput_down") is not None:
                                details["speedtest"] = dict(down=sub.get("xput_down"), up=sub.get("xput_up"),
                                                            ping=sub.get("speedtest_ping"), at=sub.get("speedtest_lastrun"))
                            if sub.get("latency") is not None:
                                metrics[f"{self.id}.wan.latency"] = sub["latency"]
                        elif s == "wlan":
                            details["wifi_clients"] = sub.get("num_user")
                        elif s == "lan":
                            details["wired_clients"] = sub.get("num_user")
            except Exception:
                pass

        names = {str(d.get("macAddress", "")).lower(): d.get("name") or d.get("model") for d in devs}
        if legacy_sta:
            for x in legacy_sta[:400]:
                wired = bool(x.get("is_wired"))
                details["client_list"].append(dict(
                    name=x.get("name") or x.get("hostname") or x.get("oui") or x.get("mac"), ip=x.get("ip"), mac=x.get("mac"),
                    wired=wired, vendor=x.get("oui"), network=x.get("network"), essid=x.get("essid"),
                    band=BAND.get(x.get("radio")) if not wired else None, proto=x.get("radio_proto"), channel=x.get("channel"),
                    signal=x.get("signal") or x.get("rssi"), satisfaction=x.get("satisfaction"),
                    via=names.get(str(x.get("ap_mac") or x.get("sw_mac") or "").lower()), port=x.get("sw_port"),
                    rx=x.get("rx_bytes-r"), tx=x.get("tx_bytes-r"), uptime=x.get("uptime")))
        else:
            ids = {d["id"]: d.get("name") or d.get("model") for d in devs}
            for x in int_clients[:400]:
                wired = str(x.get("type", "")).upper() == "WIRED"
                since = x.get("connectedAt")
                details["client_list"].append(dict(name=x.get("name") or x.get("macAddress"), ip=x.get("ipAddress"), mac=x.get("macAddress"),
                                                   wired=wired, via=ids.get(x.get("uplinkDeviceId")), since=since))
        cl = details["client_list"]
        details["wifi_clients"] = details.get("wifi_clients") if details.get("wifi_clients") is not None else len([x for x in cl if not x["wired"]])
        details["wired_clients"] = details.get("wired_clients") if details.get("wired_clients") is not None else len([x for x in cl if x["wired"]])
        metrics[f"{self.id}.wifi"] = details["wifi_clients"]
        metrics[f"{self.id}.wired"] = details["wired_clients"]
        for x in details["radios"]:
            if x["util"] is not None and x["util"] >= 70:
                events.append(self.ev("warn", f"Canal congestionado em {x['ap']}", f"{x['band']} canal {x['channel']}: {x['util']}% de utilização"))
        if details["wan"].get("status_www") not in (None, "ok"):
            events.append(self.ev("crit", "Internet com problema", f"WWW: {details['wan']['status_www']}"))
        metrics[f"{self.id}.clients"] = details["clients"] or 0
        return self.result(hosts=hosts, details=details, events=events, metrics=metrics)
