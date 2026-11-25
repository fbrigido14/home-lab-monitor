/* Tela de login e criação do primeiro administrador */
(() => {
  const t = localStorage.getItem("hm.theme");
  if (t && t !== "system") document.documentElement.dataset.theme = t;
  const $ = (s) => document.querySelector(s);
  const form = $("#form"), err = $("#err"), btn = $("#submit");
  const next = new URLSearchParams(location.search).get("next");
  // volta para onde a pessoa estava (o #página vem no próprio endereço quando o servidor redireciona)
  // só volta para páginas da própria dashboard (bloqueia "//site", "/\\site" e endereços externos)
  const safeNext = (n) => {
    try { const u = new URL(n, location.origin); return u.origin === location.origin && /^\/(?![\/\\])/.test(n) ? u.pathname + u.search + u.hash : null; }
    catch { return null; }
  };
  const target = (next && safeNext(next)) || "/" + location.hash;
  let setup = false, ticket = null, recovery = false;

  async function status() {
    try {
      const s = await (await fetch("/api/auth/status", { cache: "no-store" })).json();
      if (s.user) return location.replace(target);
      if (s.mode !== "local") { err.textContent = "O login é feito pelo seu provedor de acesso (proxy)."; btn.disabled = true; return; }
      setup = s.setup;
      if (setup) {
        $("#title").dataset.locked = "1";
        $("#title").textContent = "Criar administrador";
        $("#intro").hidden = false;
        $("#confirm-wrap").hidden = false;
        $("#setup-wrap").hidden = false;
        $("#remember-wrap").hidden = true;
        form.password.autocomplete = "new-password";
        btn.textContent = "Criar conta e entrar";
      }
    } catch { err.textContent = "Não foi possível falar com o servidor."; }
    form.username.focus();
  }

  $("#use-recovery").onclick = () => {
    recovery = !recovery;
    $("#code-label").textContent = recovery ? "Código de recuperação" : "Código";
    $("#twofa-help").textContent = recovery ? "Digite um dos códigos de recuperação que você guardou (cada um funciona uma vez)." : "Digite o código de 6 dígitos do seu aplicativo autenticador.";
    $("#use-recovery").textContent = recovery ? "Usar o código do aplicativo" : "Usar um código de recuperação";
    form.code.inputMode = recovery ? "text" : "numeric";
    form.code.value = ""; form.code.focus();
  };

  async function sendCode() {
    const code = form.code.value.trim();
    if (!code) { err.textContent = "Digite o código."; return; }
    btn.disabled = true; btn.textContent = "Conferindo…";
    try {
      const r = await fetch("/api/auth/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, code }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        if (d.recovery_used) sessionStorage.setItem("hm.recoveryUsed", "1");
        return location.replace(target);
      }
      err.textContent = d.detail || "Código incorreto.";
      if (r.status === 401 && /tempo/.test(d.detail || "")) { ticket = null; $("#step-2fa").hidden = true; $("#step-pass").hidden = false; }
      form.code.select();
    } catch { err.textContent = "Não foi possível falar com o servidor."; }
    btn.disabled = false; btn.textContent = ticket ? "Confirmar" : "Entrar";
  }
  form.code.addEventListener("input", () => { if (!recovery && /^\d{6}$/.test(form.code.value.trim())) sendCode(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    if (ticket) return sendCode();
    const body = { username: form.username.value.trim(), password: form.password.value, remember: form.remember.checked,
      setup_code: form.setup_code.value.trim() };
    if (!body.username || !body.password) { err.textContent = "Preencha usuário e senha."; return; }
    if (setup) {
      if (body.password.length < 10) { err.textContent = "A senha precisa ter pelo menos 10 caracteres."; return; }
      if (body.password !== form.confirm.value) { err.textContent = "As senhas não são iguais."; return; }
      if (!body.setup_code) { err.textContent = "Digite o código de configuração que aparece no log do container."; return; }
    }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = setup ? "Criando…" : "Entrando…";
    try {
      const r = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.need_2fa) {
        ticket = d.ticket;
        $("#step-pass").hidden = true; $("#step-2fa").hidden = false;
        $("#title").dataset.locked = "1"; $("#title").textContent = "Verificação em duas etapas";
        btn.disabled = false; btn.textContent = "Confirmar"; form.code.focus();
        return;
      }
      if (r.ok) return location.replace(target);
      err.textContent = d.detail || "Não foi possível entrar.";
      form.password.select();
    } catch { err.textContent = "Não foi possível falar com o servidor."; }
    btn.disabled = false;
    btn.textContent = label;
  });
  // No app Android, a sessão longa mantém os alertas em segundo plano funcionando
  if (/HomelabMonitorApp/.test(navigator.userAgent)) {
    form.remember.checked = true;
    const tip = document.createElement("p");
    tip.className = "small muted";
    tip.textContent = "No app, a sessão fica ativa por 30 dias para os alertas chegarem mesmo com o app fechado.";
    $("#remember-wrap").after(tip);
  }
  status();
})();
