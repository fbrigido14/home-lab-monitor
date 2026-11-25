"""Servidores de mídia (Emby e Jellyfin, mesma API) e Nextcloud."""
import re
import time
from datetime import datetime, timezone

from .base import SSL, URL, Collector, F, gib


def _ts(iso):
    """Datas do Emby/Jellyfin ("2026-11-25T10:00:00.1234567Z") em timestamp."""
    if not iso:
        return None
    txt = re.sub(r"(\.\d{6})\d+", r"\1", str(iso)).replace("Z", "+00:00")
    try:
        d = datetime.fromisoformat(txt)
        return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp()
    except ValueError:
        return None


KIND_PT = {"movies": "Filmes", "tvshows": "Séries", "music": "Música", "musicvideos": "Clipes", "homevideos": "Vídeos",
           "boxsets": "Coleções", "books": "Livros", "photos": "Fotos", "livetv": "TV ao vivo", "mixed": "Misto", None: "Misto"}


class MediaServer(Collector):
    """Base comum: Emby e Jellyfin diferem só no prefixo e no cabeçalho de autenticação."""
    page, makes_hosts = "midia", False
    prefix_path = ""
    fields = [
        URL("http://192.168.1.14:8096"),
        F("api_key", "Chave de API", "secret", required=True, help="Painel › Avançado › Chaves de API"),
        F("show_posters", "Mostrar capas", "bool", default=True),
        SSL,
    ]

    def __init__(self, inst, settings):
        super().__init__(inst, settings)
        self._slow, self._slow_ts, self.image_ids = {}, 0, set()

    @property
    def api(self):
        return self.base_url + self.prefix_path

    async def _slow_data(self, c):
        """Bibliotecas, usuários e tarefas: relê a cada 10 minutos."""
        if self._slow and time.time() - self._slow_ts < 600:
            return self._slow
        out = {"libraries": [], "users": [], "tasks": []}
        try:
            for lib in (await c.get(f"{self.api}/Library/VirtualFolders")).json():
                count = None
                try:
                    r = await c.get(f"{self.api}/Items", params={"ParentId": lib.get("ItemId"), "Recursive": "true", "Limit": 0,
                                                                 "IncludeItemTypes": "Movie,Series,Episode,Audio,MusicVideo,Video,Photo,Book"})
                    count = r.json().get("TotalRecordCount")
                except Exception:
                    pass
                out["libraries"].append(dict(name=lib.get("Name"), kind=KIND_PT.get(lib.get("CollectionType"), lib.get("CollectionType")),
                                             paths=lib.get("Locations") or [], count=count))
        except Exception:
            pass
        try:
            for u in (await c.get(f"{self.api}/Users")).json():
                pol = u.get("Policy") or {}
                out["users"].append(dict(name=u.get("Name"), admin=bool(pol.get("IsAdministrator")), disabled=bool(pol.get("IsDisabled")),
                                         last=_ts(u.get("LastActivityDate")) if u.get("LastActivityDate") else None))
        except Exception:
            pass
        try:
            for t in (await c.get(f"{self.api}/ScheduledTasks")).json():
                if t.get("IsHidden"):
                    continue
                lr = t.get("LastExecutionResult") or {}
                st, en = _ts(lr.get("StartTimeUtc")) if lr.get("StartTimeUtc") else None, _ts(lr.get("EndTimeUtc")) if lr.get("EndTimeUtc") else None
                out["tasks"].append(dict(name=t.get("Name"), category=t.get("Category"), state=t.get("State"),
                                         progress=t.get("CurrentProgressPercentage"), result=lr.get("Status"),
                                         error=lr.get("ErrorMessage"), start=st, end=en))
        except Exception:
            pass
        self._slow, self._slow_ts = out, time.time()
        return out

    async def collect(self):
        events = []
        async with self.client() as c:
            info = (await c.get(f"{self.api}/System/Info")).raise_for_status().json()
            sessions = (await c.get(f"{self.api}/Sessions")).json()
            counts, recent, activity = {}, [], []
            try:
                counts = (await c.get(f"{self.api}/Items/Counts")).json()
            except Exception:
                pass
            try:
                r = await c.get(f"{self.api}/Items", params={"SortBy": "DateCreated", "SortOrder": "Descending", "Recursive": "true", "Limit": 12,
                                                             "IncludeItemTypes": "Movie,Episode", "Fields": "DateCreated,ProductionYear"})
                for x in r.json().get("Items", []):
                    recent.append(dict(id=x.get("Id"), title=x.get("Name"), series=x.get("SeriesName"), year=x.get("ProductionYear"),
                                       season=x.get("ParentIndexNumber"), episode=x.get("IndexNumber"), type=x.get("Type"),
                                       added=_ts(x.get("DateCreated")) if x.get("DateCreated") else None,
                                       image=x.get("SeriesId") if x.get("Type") == "Episode" and x.get("SeriesId") else x.get("Id")))
            except Exception:
                pass
            try:
                r = await c.get(f"{self.api}/System/ActivityLog/Entries", params={"Limit": 60})
                for x in r.json().get("Items", []):
                    activity.append(dict(when=_ts(x.get("Date")) if x.get("Date") else None, name=x.get("Name"), type=x.get("Type"),
                                         severity=x.get("Severity"), overview=x.get("ShortOverview") or x.get("Overview")))
            except Exception:
                pass
            slow = await self._slow_data(c)

        playing, bw = [], 0.0
        for s in sessions:
            item = s.get("NowPlayingItem")
            if not item:
                continue
            ps, tr = s.get("PlayState") or {}, s.get("TranscodingInfo")
            runtime, pos = item.get("RunTimeTicks") or 0, ps.get("PositionTicks") or 0
            title = item.get("Name")
            if item.get("SeriesName"):
                title = f"{item['SeriesName']} · T{item.get('ParentIndexNumber', 0)}E{item.get('IndexNumber', 0)} · {item.get('Name')}"
            streams = item.get("MediaStreams") or []
            vid = next((m for m in streams if m.get("Type") == "Video"), {})
            aud = next((m for m in streams if m.get("Type") == "Audio"), {})
            bitrate = (tr or {}).get("Bitrate") or item.get("Bitrate") or vid.get("BitRate")
            if bitrate and not ps.get("IsPaused"):
                bw += bitrate / 1e6
            playing.append(dict(
                user=s.get("UserName"), client=s.get("Client"), device=s.get("DeviceName"), ip=s.get("RemoteEndPoint"),
                title=title, type=item.get("Type"), year=item.get("ProductionYear"), paused=ps.get("IsPaused", False),
                method="Transcode" if tr and not (tr.get("IsVideoDirect") and tr.get("IsAudioDirect")) else ("DirectStream" if tr else (ps.get("PlayMethod") or "DirectPlay")),
                progress=round(pos / runtime * 100) if runtime else None, position=pos / 1e7, runtime=runtime / 1e7,
                bitrate=round(bitrate / 1e6, 1) if bitrate else None,
                source=f"{(vid.get('Codec') or '').upper()} {vid.get('Height') or ''}p".strip() if vid else None,
                audio=f"{(aud.get('Codec') or '').upper()} {aud.get('Channels') or ''}ch".strip() if aud else None,
                target=f"{(tr.get('VideoCodec') or '').upper()} / {(tr.get('AudioCodec') or '').upper()}" if tr else None,
                hw=(tr or {}).get("HardwareAccelerationType"), transcode_progress=(tr or {}).get("CompletionPercentage"),
                transcode_reason=", ".join((tr or {}).get("TranscodeReasons") or []),
                image=item.get("SeriesId") if item.get("Type") == "Episode" and item.get("SeriesId") else item.get("Id")))
        trans = len([p for p in playing if p["method"] == "Transcode"])
        self.image_ids = {x["image"] for x in recent + playing if x.get("image")}

        day = time.time() - 86400
        fails = [a for a in activity if a["when"] and a["when"] > day and ("fail" in str(a["type"]).lower() or "Fail" in str(a["name"]))]
        if len(fails) >= 3:
            events.append(self.ev("warn", f"{len(fails)} falhas de login no {self.name}", "Últimas 24 h: confira o log de atividade"))
        for t in slow["tasks"]:
            if t["result"] == "Failed" and t["end"] and t["end"] > day:
                events.append(self.ev("warn", f"Tarefa '{t['name']}' falhou", f"{self.name}: {t['error'] or 'sem detalhes'}"[:140]))
        if info.get("HasPendingRestart"):
            events.append(self.ev("info", f"{self.name} precisa reiniciar", "Reinício pendente"))
        if info.get("HasUpdateAvailable"):
            events.append(self.ev("info", f"Atualização do {self.name} disponível", info.get("Version", "")))
        users = slow["users"]
        active = len([u for u in users if u["last"] and u["last"] > day])
        return self.result(
            events=events,
            metrics={f"{self.id}.streams": len(playing), f"{self.id}.transcodes": trans, f"{self.id}.bandwidth": round(bw, 1),
                     f"{self.id}.users_active": active},
            services=[self.svc(version=info.get("Version"), summary=f"{len(playing)} reproduzindo" if playing else "Ninguém assistindo")],
            details=dict(product=self.label, server=info.get("ServerName"), version=info.get("Version"), os=info.get("OperatingSystemDisplayName") or info.get("OperatingSystem"),
                         update=bool(info.get("HasUpdateAvailable")), restart=bool(info.get("HasPendingRestart")),
                         sessions=playing, transcoding=trans, bandwidth=round(bw, 1), counts=counts, recent=recent, activity=activity,
                         libraries=slow["libraries"], users=users, users_active=active, tasks=slow["tasks"],
                         posters=bool(self.opt("show_posters")), logins_failed_24h=len(fails)))

    async def image(self, item_id, width=300):
        if item_id not in self.image_ids:
            raise ValueError("Imagem não encontrada")
        async with self.client() as c:
            r = await c.get(f"{self.api}/Items/{item_id}/Images/Primary", params={"maxWidth": width, "quality": 80})
            r.raise_for_status()
            return r.content, r.headers.get("content-type", "image/jpeg")


class Emby(MediaServer):
    type, label = "emby", "Emby"
    description = "Quem está assistindo, transcodificação, bibliotecas, atividade e tarefas."
    prefix_path = "/emby"

    def headers(self):
        return {"X-Emby-Token": self.opt("api_key"), "Accept": "application/json"}


class Jellyfin(MediaServer):
    type, label = "jellyfin", "Jellyfin"
    description = "Quem está assistindo, transcodificação, bibliotecas, atividade e tarefas."
    fields = [
        URL("http://192.168.1.14:8096"),
        F("api_key", "Chave de API", "secret", required=True, help="Painel › Chaves de API"),
        F("show_posters", "Mostrar capas", "bool", default=True),
        SSL,
    ]

    def headers(self):
        return {"Authorization": f'MediaBrowser Token="{self.opt("api_key")}"', "Accept": "application/json"}


class Nextcloud(Collector):
    type, label, page = "nextcloud", "Nextcloud", "nuvem"
    description = "Usuários ativos, armazenamento, compartilhamentos, PHP, banco e atualizações (serverinfo)."
    fields = [
        URL("https://nuvem.minhacasa.com.br"),
        F("token", "Token do serverinfo", "secret",
          help="Recomendado: occ config:app:set serverinfo token --value SEU_TOKEN. Ou deixe vazio e use usuário + senha de app."),
        F("username", "Usuário administrador", placeholder="admin", help="Só se não usar o token"),
        F("app_password", "Senha de app", "secret", help="Configurações pessoais › Segurança › Criar senha de app"),
        F("free_warn_gb", "Avisar com menos de (GB livres)", "number", default=20),
        SSL,
    ]

    @property
    def configured(self):
        return bool(self.opt("url")) and bool(self.opt("token") or (self.opt("username") and self.opt("app_password")))

    def headers(self):
        h = {"OCS-APIRequest": "true", "Accept": "application/json"}
        if self.opt("token"):
            h["NC-Token"] = self.opt("token")
        return h

    def client(self, **kw):
        if not self.opt("token"):
            kw.setdefault("auth", (self.opt("username"), self.opt("app_password")))
        return super().client(**kw)

    async def collect(self):
        events = []
        async with self.client() as c:
            r = await c.get(f"{self.base_url}/ocs/v2.php/apps/serverinfo/api/v1/info", params={"format": "json", "skipUpdate": "false"})
            if r.status_code in (401, 403):
                raise PermissionError("Credencial recusada pelo serverinfo (precisa ser administrador ou usar o token)")
            r.raise_for_status()
            data = r.json()["ocs"]["data"]
            try:
                status = (await c.get(f"{self.base_url}/status.php")).json()
            except Exception:
                status = {}
        nc, srv, au = data.get("nextcloud", {}), data.get("server", {}), data.get("activeUsers", {})
        sysd, sto, sh = nc.get("system", {}), nc.get("storage", {}), nc.get("shares", {})
        apps, upd = sysd.get("apps") or {}, sysd.get("update") or {}
        php, db = srv.get("php") or {}, srv.get("database") or {}
        kb = 1024
        mem_t, mem_f = (sysd.get("mem_total") or 0) * kb, (sysd.get("mem_free") or 0) * kb
        swap_t, swap_f = (sysd.get("swap_total") or 0) * kb, (sysd.get("swap_free") or 0) * kb
        load = [float(x) for x in (sysd.get("cpuload") or [])][:3]
        cpus = sysd.get("cpunum") or None
        free = sysd.get("freespace")
        op = ((php.get("opcache") or {}).get("opcache_statistics") or {})
        app_updates = apps.get("app_updates") or {}
        if isinstance(app_updates, list):
            app_updates = {}
        if status.get("maintenance"):
            events.append(self.ev("warn", f"{self.name} em modo de manutenção", "Os usuários não conseguem acessar"))
        if free is not None and free < float(self.opt("free_warn_gb")) * 1024 ** 3:
            events.append(self.ev("crit", f"Pouco espaço no {self.name}", f"{gib(free)} livres"))
        if upd.get("available"):
            events.append(self.ev("info", f"Atualização do {self.name} disponível", str(upd.get("available_version") or "")))
        if app_updates:
            events.append(self.ev("info", f"{len(app_updates)} app(s) do {self.name} para atualizar", ", ".join(list(app_updates)[:4])))
        if (sh.get("num_shares_link_no_password") or 0) > 0:
            events.append(self.ev("info", f"{sh['num_shares_link_no_password']} link(s) público(s) sem senha", f"{self.name}: confira os compartilhamentos"))
        metrics = {f"{self.id}.active5m": au.get("last5minutes"), f"{self.id}.active1h": au.get("last1hour"),
                   f"{self.id}.active24h": au.get("last24hours"), f"{self.id}.files": sto.get("num_files"),
                   f"{self.id}.load": load[0] if load else None,
                   f"{self.id}.mem": round((mem_t - mem_f) / mem_t * 100, 1) if mem_t else None,
                   f"{self.id}.free_gb": round(free / 1024 ** 3, 1) if free is not None else None,
                   f"{self.id}.db_mb": round(float(db.get("size") or 0) / 1e6, 1) if db.get("size") else None}
        return self.result(
            events=events, metrics={k: v for k, v in metrics.items() if v is not None},
            services=[self.svc(version=sysd.get("version") or status.get("versionstring"),
                               summary=f"{au.get('last5minutes', 0)} ativos agora, {sto.get('num_users', 0)} usuários")],
            details=dict(version=sysd.get("version") or status.get("versionstring"), maintenance=bool(status.get("maintenance")),
                         users=sto.get("num_users"), files=sto.get("num_files"), storages=sto.get("num_storages"),
                         storages_local=sto.get("num_storages_local"), storages_other=sto.get("num_storages_other"),
                         free=free, active=dict(m5=au.get("last5minutes"), h1=au.get("last1hour"), h24=au.get("last24hours")),
                         load=load, cpus=cpus, mem_total=mem_t, mem_free=mem_f, swap_total=swap_t, swap_free=swap_f,
                         shares=dict(total=sh.get("num_shares"), user=sh.get("num_shares_user"), groups=sh.get("num_shares_groups"),
                                     link=sh.get("num_shares_link"), link_nopass=sh.get("num_shares_link_no_password"),
                                     mail=sh.get("num_shares_mail"), room=sh.get("num_shares_room"),
                                     fed_sent=sh.get("num_fed_shares_sent"), fed_recv=sh.get("num_fed_shares_received")),
                         webserver=srv.get("webserver"), php=dict(version=php.get("version"), memory_limit=php.get("memory_limit"),
                                                                 max_exec=php.get("max_execution_time"), upload=php.get("upload_max_filesize"),
                                                                 opcache_hit=op.get("opcache_hit_rate"), apcu=bool(php.get("apcu"))),
                         db=dict(type=db.get("type"), version=db.get("version"), size=float(db.get("size") or 0) or None),
                         cache=dict(local=sysd.get("memcache.local"), distributed=sysd.get("memcache.distributed"), locking=sysd.get("memcache.locking"),
                                    filelocking=sysd.get("filelocking.enabled")),
                         apps=dict(installed=apps.get("num_installed"), updates=app_updates),
                         update=dict(available=bool(upd.get("available")), version=upd.get("available_version"), checked=upd.get("lastupdatedat")),
                         debug=bool(sysd.get("debug"))))
