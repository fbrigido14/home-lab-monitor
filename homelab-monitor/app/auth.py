"""Autenticação da dashboard.

Modos (variável AUTH_MODE):
- local  (padrão): usuários e senhas guardados em /data/users.json, login pela tela.
- proxy: confia no cabeçalho de um proxy com SSO (Authentik, Authelia, Cloudflare Access).
         Só use se o container NÃO estiver acessível sem passar pelo proxy.
- off:   sem login. Todo mundo é administrador. Só para testes.

Papéis: admin (vê e altera tudo) e viewer (só visualiza).
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time

DATA = os.path.dirname(os.getenv("CONFIG_PATH", "/data/config.yml")) or "."
USERS_PATH = os.getenv("USERS_PATH", os.path.join(DATA, "users.json"))
SECRET_PATH = os.path.join(DATA, "secret.key")
MODE = os.getenv("AUTH_MODE", "local").lower()
PROXY_HEADER = os.getenv("AUTH_PROXY_HEADER", "Remote-User")
PROXY_ADMINS = {x.strip() for x in os.getenv("AUTH_PROXY_ADMINS", "").split(",") if x.strip()}
COOKIE = "hm_session"
SESSION_H = 12            # sessão comum
REMEMBER_D = 30           # "manter conectado"
ITERATIONS = 390_000
ROLES = ("admin", "viewer")

_lock = threading.Lock()
_fails = {}               # (ip, usuário) -> (falhas, bloqueado_até, última)
_ipfails = {}             # ip -> lista de horários de falha (qualquer usuário)
IP_MAX, IP_WINDOW = 30, 900   # 30 falhas em 15 min bloqueiam o IP inteiro por 15 min
_setup = {"code": None}


# ---------- arquivos ----------
def _secret():
    env = os.getenv("SESSION_SECRET")
    if env:
        return env.encode()
    if not os.path.exists(SECRET_PATH):
        os.makedirs(DATA, exist_ok=True)
        with open(SECRET_PATH, "wb") as f:
            f.write(secrets.token_bytes(32))
        os.chmod(SECRET_PATH, 0o600)
    with open(SECRET_PATH, "rb") as f:
        return f.read()


def load_users():
    try:
        with open(USERS_PATH, encoding="utf-8") as f:
            return json.load(f).get("users", [])
    except FileNotFoundError:
        return []


def save_users(users):
    os.makedirs(os.path.dirname(USERS_PATH) or ".", exist_ok=True)
    tmp = USERS_PATH + ".tmp"
    with _lock:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"users": users}, f, indent=2, ensure_ascii=False)
        os.chmod(tmp, 0o600)
        os.replace(tmp, USERS_PATH)


def find(username):
    u = (username or "").strip().lower()
    return next((x for x in load_users() if x["username"] == u), None)


def public(u):
    return {"username": u["username"], "role": u["role"], "created": u.get("created")}


# ---------- senhas ----------
def hash_password(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt}${dk.hex()}"


def verify_password(pw, stored):
    try:
        _, it, salt, h = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(dk.hex(), h)
    except (ValueError, AttributeError):
        return False


def check_password_rules(pw):
    if len(pw or "") < 10:
        return "A senha precisa ter pelo menos 10 caracteres"
    return None


def valid_username(u):
    u = (u or "").strip().lower()
    ok = 2 <= len(u) <= 32 and all(c.isalnum() or c in "._-" for c in u)
    return u if ok else None


# ---------- sessões (token assinado, sem estado no servidor) ----------
def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_session(u, remember=False):
    exp = int(time.time() + (REMEMBER_D * 86400 if remember else SESSION_H * 3600))
    body = _b64(json.dumps({"u": u["username"], "v": u.get("pw_v", 1), "exp": exp}).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}", exp


def read_session(token):
    """Devolve o usuário se o token for válido e a senha não tiver mudado desde o login."""
    try:
        body, sig = token.split(".")
        good = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        data = json.loads(_unb64(body))
        if data["exp"] < time.time():
            return None
        u = find(data["u"])
        if not u or u.get("pw_v", 1) != data["v"]:
            return None
        return u
    except (ValueError, KeyError, AttributeError, json.JSONDecodeError):
        return None


# ---------- limite de tentativas ----------
def locked(ip, username):
    now = time.time()
    hits = [t for t in _ipfails.get(ip, []) if now - t < IP_WINDOW]
    if len(hits) >= IP_MAX:
        return True
    f = _fails.get((ip, (username or "").lower()))
    return bool(f and f[1] > now)


def register_fail(ip, username):
    now = time.time()
    k = (ip, (username or "").lower())
    n = _fails.get(k, (0, 0, 0))[0] + 1
    _fails[k] = (n, now + 300 if n >= 5 else 0, now)
    _ipfails[ip] = [t for t in _ipfails.get(ip, []) if now - t < IP_WINDOW] + [now]
    if len(_fails) > 5000:   # limpeza: não deixa a memória crescer sem limite
        for key in [key for key, v in _fails.items() if now - v[2] > 3600]:
            _fails.pop(key, None)
        for key in [key for key, v in _ipfails.items() if not v or now - v[-1] > IP_WINDOW]:
            _ipfails.pop(key, None)
    return n


def clear_fails(ip, username):
    _fails.pop((ip, (username or "").lower()), None)


def setup_code():
    """Código exigido para criar o primeiro administrador. Sai no log do container,
    então só quem tem acesso ao servidor consegue fazer a configuração inicial."""
    if MODE != "local" or load_users():
        return None
    if not _setup["code"]:
        _setup["code"] = os.getenv("SETUP_CODE") or f"{secrets.token_hex(3)}-{secrets.token_hex(3)}".upper()
    return _setup["code"]


# ---------- identidade da requisição ----------
def user_from_request(request):
    if MODE == "off":
        return {"username": "admin", "role": "admin"}
    if MODE == "proxy":
        name = request.headers.get(PROXY_HEADER)
        if not name:
            return None
        role = "admin" if (not PROXY_ADMINS or name in PROXY_ADMINS) else "viewer"
        return {"username": name, "role": role}
    tok = request.cookies.get(COOKIE)
    return read_session(tok) if tok else None


# ---------- duplo fator (TOTP, RFC 6238) ----------
import base64 as _b64mod  # noqa: E402
import struct  # noqa: E402

ISSUER = "Homelab Monitor"


def totp_new_secret():
    return _b64mod.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(secret, counter, digits=6):
    key = _b64mod.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    h = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    o = h[-1] & 15
    return str((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 10 ** digits).zfill(digits)


def totp_check(secret, code, last=0, window=1):
    """Devolve o contador usado se o código confere (±30 s) e não foi usado antes; senão None."""
    code = "".join(c for c in str(code or "") if c.isdigit())
    if len(code) != 6 or not secret:
        return None
    now = int(time.time() // 30)
    for c in range(now - window, now + window + 1):
        if c > (last or 0) and hmac.compare_digest(_hotp(secret, c), code):
            return c
    return None


def totp_uri(username, secret):
    from urllib.parse import quote
    return f"otpauth://totp/{quote(ISSUER)}:{quote(username)}?secret={secret}&issuer={quote(ISSUER)}&digits=6&period=30"


def qr_svg(text):
    import segno
    return segno.make(text, error="m").svg_inline(scale=5, border=2, dark="#111", light="#fff")


def new_recovery_codes(n=8):
    codes = [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}-{secrets.token_hex(2)}" for _ in range(n)]
    return codes, [hashlib.sha256(c.encode()).hexdigest() for c in codes]


def use_recovery(u, code):
    h = hashlib.sha256(str(code or "").strip().lower().encode()).hexdigest()
    rec = u.get("recovery") or []
    for i, x in enumerate(rec):
        if hmac.compare_digest(x, h):
            rec.pop(i)
            return True
    return False


def make_ticket(u, remember):
    """Passe de 5 minutos entre a senha certa e o código do 2FA."""
    body = _b64(json.dumps({"u": u["username"], "v": u.get("pw_v", 1), "exp": int(time.time()) + 300,
                            "t": "2fa", "r": bool(remember)}).encode())
    sig = _b64(hmac.new(_secret(), ("2fa." + body).encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_ticket(tok):
    try:
        body, sig = tok.split(".")
        if not hmac.compare_digest(sig, _b64(hmac.new(_secret(), ("2fa." + body).encode(), hashlib.sha256).digest())):
            return None, False
        d = json.loads(_unb64(body))
        u = find(d["u"])
        if d.get("t") != "2fa" or d["exp"] < time.time() or not u or u.get("pw_v", 1) != d["v"]:
            return None, False
        return u, d.get("r", False)
    except (ValueError, KeyError, AttributeError, json.JSONDecodeError):
        return None, False


def needs_enroll(u, policy):
    if MODE != "local" or not u or "hash" not in u or u.get("totp_on"):
        return False
    return policy == "all" or (policy == "admin" and u.get("role") == "admin")


def update_user(username, fn):
    users = load_users()
    u = next((x for x in users if x["username"] == username), None)
    if not u:
        return None
    fn(u)
    save_users(users)
    return u


def public(u):  # noqa: F811 - inclui o estado do 2FA
    return {"username": u["username"], "role": u["role"], "created": u.get("created"), "totp": bool(u.get("totp_on"))}
