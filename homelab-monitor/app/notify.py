"""Notificações no Telegram.

- Alertas: avisa quando um alerta novo continua ativo por N ciclos (evita alarme falso)
  e, se quiser, quando ele é resolvido. Vários alertas no mesmo ciclo viram uma mensagem só.
- Segurança: bloqueio por senha errada, logins, mudanças no 2FA e em usuários.
- Horário silencioso: as mensagens chegam sem som.
"""
import asyncio
import datetime as dt
import html
import logging
import os

import httpx

log = logging.getLogger("homelab.notify")
API = os.getenv("TELEGRAM_API_URL", "https://api.telegram.org").rstrip("/")  # permite servidor Bot API próprio
STATE = {"seen": {}, "sent": set(), "booted": False}
ICON = {"crit": "🔴", "warn": "🟠", "info": "🔵", "ok": "✅", "sec": "🔐"}


class NotifyError(Exception):
    pass


def _quiet(cfg):
    q0, q1 = cfg.get("quiet_from"), cfg.get("quiet_to")
    if not q0 or not q1:
        return False
    now = dt.datetime.now().strftime("%H:%M")
    return q0 <= now < q1 if q0 < q1 else (now >= q0 or now < q1)


async def send(cfg, text, silent=None):
    t = (cfg or {}).get("telegram") or {}
    if not t.get("bot_token") or not t.get("chat_id"):
        raise NotifyError("Informe o token do bot e o chat ID")
    payload = {"chat_id": t["chat_id"], "text": text[:4000], "parse_mode": "HTML", "disable_web_page_preview": True,
               "disable_notification": _quiet(cfg) if silent is None else silent}
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{API}/bot{t['bot_token']}/sendMessage", json=payload)
    except httpx.HTTPError as e:
        raise NotifyError(f"Sem conexão com o Telegram ({type(e).__name__})") from e
    if r.status_code != 200:
        desc = (r.json() if r.headers.get("content-type", "").startswith("application/json") else {}).get("description", r.text[:120])
        hint = {401: "token do bot inválido", 400: "chat ID inválido ou o bot ainda não recebeu mensagem sua",
                403: "o bot foi bloqueado ou removido do grupo"}.get(r.status_code, "erro do Telegram")
        raise NotifyError(f"{hint.capitalize()}: {desc}")


async def discover_chats(token):
    """Lista conversas que mandaram mensagem ao bot (para achar o chat ID)."""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{API}/bot{token}/getUpdates")
    except httpx.HTTPError as e:
        raise NotifyError("Sem conexão com o Telegram") from e
    if r.status_code != 200:
        raise NotifyError("Token do bot inválido" if r.status_code == 401 else f"Erro do Telegram (HTTP {r.status_code})")
    chats = {}
    for u in r.json().get("result", []):
        m = u.get("message") or u.get("channel_post") or u.get("my_chat_member") or {}
        ch = m.get("chat") or {}
        if ch.get("id"):
            chats[ch["id"]] = ch.get("title") or " ".join(x for x in (ch.get("first_name"), ch.get("last_name")) if x) or ch.get("username") or str(ch["id"])
    return [{"id": k, "name": v} for k, v in chats.items()]


def fire(cfg, text, kind="alert"):
    """Envia em segundo plano, sem atrasar quem chamou."""
    if not (cfg or {}).get("enabled"):
        return
    if kind == "security" and not cfg.get("security", True):
        return

    async def go():
        try:
            await send(cfg, text)
        except NotifyError as e:
            log.warning("Telegram: %s", e)
    try:
        asyncio.get_running_loop().create_task(go())
    except RuntimeError:
        pass


def security(cfg, title, detail=""):
    fire(cfg, f"{ICON['sec']} <b>{html.escape(title, quote=False)}</b>\n{html.escape(detail, quote=False)}", "security")


def process(cfg, events, app_name="Homelab Monitor"):
    """Chamado a cada ciclo de coleta com os alertas atuais dos serviços reais."""
    if not (cfg or {}).get("enabled"):
        STATE.update(seen={}, sent=set(), booted=False)
        return
    levels = {"crit"} | ({"warn"} if cfg.get("include_warn") else set())
    need = max(1, int(cfg.get("confirm_cycles") or 2))
    cur = {}
    for e in events:
        if e["level"] in levels:
            cur[(e["source"], e["title"])] = e
    for k in list(STATE["seen"]):
        if k not in cur:
            STATE["seen"].pop(k)
    for k in cur:
        STATE["seen"][k] = STATE["seen"].get(k, 0) + 1

    if not STATE["booted"]:  # depois de reiniciar: um resumo só, sem repetir alerta por alerta
        STATE["booted"] = True
        STATE["sent"] = set(cur)
        if cur and cfg.get("startup_summary", True):
            lines = "\n".join(f"{ICON.get(e['level'], '•')} {html.escape(e['title'], quote=False)}" for e in list(cur.values())[:15])
            fire(cfg, f"ℹ️ <b>{html.escape(app_name, quote=False)} iniciado</b> com {len(cur)} alerta(s) ativo(s):\n{lines}")
        return

    new = [cur[k] for k, n in STATE["seen"].items() if n >= need and k not in STATE["sent"]]
    gone = [k for k in STATE["sent"] if k not in cur]
    for e in new:
        STATE["sent"].add((e["source"], e["title"]))
    for k in gone:
        STATE["sent"].discard(k)
    if new:
        body = "\n\n".join(f"{ICON.get(e['level'], '•')} <b>{html.escape(e['title'], quote=False)}</b>\n{html.escape(e['detail'] or '', quote=False)}" for e in new[:10])
        more = f"\n\n… e mais {len(new) - 10}" if len(new) > 10 else ""
        fire(cfg, f"<b>{html.escape(app_name, quote=False)}</b>\n\n{body}{more}")
    if gone and cfg.get("notify_resolved", True):
        fire(cfg, f"{ICON['ok']} <b>Resolvido</b>\n" + "\n".join(html.escape(t, quote=False) for _, t in gone[:15]))
