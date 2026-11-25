/* Homelab Monitor — duplo fator, notificações do Telegram e aparência */

/* ---------- Ativar 2FA (usado na conta e na tela obrigatória) ---------- */
async function enrollFlow(box, onDone) {
  box.innerHTML = '<p class="small muted">Gerando a chave…</p>';
  let d;
  try { d = await api("POST", "/api/account/2fa/start"); } catch (e) { box.innerHTML = `<p class="test-out err">${esc(e.message)}</p>`; return; }
  box.innerHTML = `<ol class="steps">
      <li>Abra o aplicativo autenticador (Google Authenticator, Authy, 1Password, Bitwarden…) e leia o QR code.</li>
      <li>Ou digite a chave manualmente: <span class="secret">${esc(d.secret)}</span></li>
      <li>Digite o código de 6 dígitos que aparecer no aplicativo.</li></ol>
    <div class="qr-box">${d.qr}<form id="f-2fa-confirm" class="stack" style="gap:10px">
      <label class="fld"><span>Código do aplicativo</span><input name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
      <button class="btn primary" type="submit">Ativar duplo fator</button><p class="test-out" id="twofa-out"></p></form></div>`;
  const f = box.querySelector("#f-2fa-confirm");
  f.elements.code.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api("POST", "/api/account/2fa/confirm", { code: f.elements.code.value });
      showCodes(box, r.codes, onDone);
    } catch (err) { box.querySelector("#twofa-out").className = "test-out err"; box.querySelector("#twofa-out").textContent = err.message; }
  };
}

function showCodes(box, codes, onDone) {
  box.innerHTML = `<p><b>Duplo fator ativado.</b> Guarde estes códigos de recuperação num lugar seguro, como o gerenciador de senhas.
      Cada um serve uma vez, se você perder o celular. Eles não serão mostrados de novo.</p>
    <div class="codes">${codes.map((c) => `<span>${esc(c)}</span>`).join("")}</div>
    <div class="row-actions"><button class="btn" data-copy-codes>Copiar códigos</button><button class="btn" data-dl-codes>Baixar .txt</button>
      <span style="flex:1"></span><button class="btn primary" data-done>Já guardei</button></div>`;
  const txt = `Códigos de recuperação — ${window.BRAND?.app_name || "Homelab Monitor"} (${S.me?.username})\n\n${codes.join("\n")}\n`;
  box.querySelector("[data-copy-codes]").onclick = () => navigator.clipboard?.writeText(txt).then(() => toast("Códigos copiados"));
  box.querySelector("[data-dl-codes]").onclick = () => {
    hmSave("codigos-recuperacao.txt", new Blob([txt], { type: "text/plain" }));
  };
  box.querySelector("[data-done]").onclick = onDone;
}

/* Tela que bloqueia tudo enquanto o 2FA obrigatório não for configurado */
function showEnrollScreen() {
  if ($("#enroll-screen")) return;
  const el = document.createElement("div");
  el.className = "enroll-screen"; el.id = "enroll-screen";
  el.innerHTML = `<div class="enroll-card dlg-body"><h2>Configure o duplo fator</h2>
    <p class="small muted">O administrador exige verificação em duas etapas para a sua conta. Leva um minuto.</p>
    <div id="enroll-box"></div>
    <div class="row-actions"><span style="flex:1"></span><button class="btn" data-me="logout">Sair</button></div></div>`;
  document.body.append(el);
  enrollFlow($("#enroll-box"), () => location.reload());
}

/* ---------- Minha conta: senha + 2FA ---------- */
async function accountDialog() {
  const dlg = $("#dlg");
  let info = { enabled: false, local: S.authMode === "local" };
  try { info = await api("GET", "/api/account/2fa"); } catch { /* segue sem 2FA */ }
  dlg.innerHTML = `<div class="dlg-body"><h2>Minha conta</h2>
    <h3 class="sub-h">Senha</h3>
    <form id="f-pw" class="form-grid">
      <label class="fld wide"><span>Senha atual</span><input name="current" type="password" autocomplete="current-password" required></label>
      <label class="fld"><span>Nova senha</span><input name="new" type="password" autocomplete="new-password" minlength="10" required><small>Pelo menos 10 caracteres</small></label>
      <label class="fld"><span>Repita a nova senha</span><input name="confirm" type="password" autocomplete="new-password" required></label>
      <div class="fld wide"><button class="btn" type="submit">Trocar senha</button></div>
    </form>
    ${info.local ? '<div class="row-actions" style="margin-top:4px"><button class="btn" type="button" data-logout-all>Sair de todos os dispositivos</button><span class="small muted">Encerra as sessões abertas em outros aparelhos.</span></div>' : ""}
    <h3 class="sub-h">Duplo fator (2FA)</h3>
    <div id="twofa-box">${info.enabled
      ? `<p><span class="tag ok">ativo</span> ${info.recovery_left} código(s) de recuperação restante(s).</p>
         <form id="f-2fa-manage" class="form-grid">
           <label class="fld"><span>Código atual do aplicativo</span><input name="code" class="code-input" inputmode="numeric" maxlength="6"></label>
           <div class="fld"><span>&nbsp;</span><button class="btn" type="button" data-regen>Gerar novos códigos de recuperação</button></div>
           ${info.policy !== "none" && (info.policy === "all" || S.me.role === "admin") ? '<p class="small muted wide">O 2FA é obrigatório para a sua conta e não pode ser desativado.</p>'
             : `<label class="fld"><span>Senha (para desativar)</span><input name="password" type="password" autocomplete="current-password"></label>
                <div class="fld"><span>&nbsp;</span><button class="btn danger" type="button" data-disable>Desativar 2FA</button></div>`}
         </form>`
      : info.local ? '<p class="small muted">Proteja a conta pedindo um código do celular além da senha.</p><button class="btn primary" data-enable>Ativar duplo fator</button>'
        : '<p class="small muted">O login é feito pelo seu provedor de acesso; configure o 2FA nele.</p>'}</div>
    <div class="row-actions"><span style="flex:1"></span><button class="btn" data-close>Fechar</button></div></div>`;
  dlg.querySelector("[data-close]").onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
  $("#f-pw").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.elements.new.value !== f.elements.confirm.value) return toast("As senhas não são iguais", true);
    try { await api("POST", "/api/account/password", { current: f.elements.current.value, new: f.elements.new.value }); f.reset(); toast("Senha trocada"); }
    catch (err) { toast(err.message, true); }
  };
  dlg.querySelector("[data-logout-all]")?.addEventListener("click", async () => {
    if (!confirm("Encerrar a sessão em todos os aparelhos? Este aqui continua conectado.")) return;
    try { await api("POST", "/api/account/logout-all"); toast("Sessões encerradas nos outros aparelhos"); } catch (err) { toast(err.message, true); }
  });
  dlg.querySelector("[data-enable]")?.addEventListener("click", () => enrollFlow($("#twofa-box"), () => accountDialog()));
  dlg.querySelector("[data-regen]")?.addEventListener("click", async () => {
    try { const r = await api("POST", "/api/account/2fa/recovery", { code: $("#f-2fa-manage").elements.code.value }); showCodes($("#twofa-box"), r.codes, () => accountDialog()); }
    catch (err) { toast(err.message, true); }
  });
  dlg.querySelector("[data-disable]")?.addEventListener("click", async () => {
    if (!confirm("Desativar o duplo fator? A conta ficará protegida só pela senha.")) return;
    try { await api("POST", "/api/account/2fa/disable", { password: $("#f-2fa-manage").elements.password.value }); toast("2FA desativado"); accountDialog(); }
    catch (err) { toast(err.message, true); }
  });
}

/* ---------- Configurações: segurança e Telegram ---------- */
function securityPanel() {
  const st = S.cfg.config.settings, sec = st.security || {}, n = st.notify || {}, tg = n.telegram || {};
  const saved = tg.bot_token === S.cfg.mask, isVar = String(tg.bot_token || "").startsWith("${");
  return `<form class="panel" id="f-sec">
    <div class="panel-head"><h2>Segurança e notificações</h2><span class="muted">Duplo fator e alertas no Telegram</span></div>
    <div class="form-grid">
      <label class="fld"><span>Exigir duplo fator (2FA)</span><select name="require_2fa" ${S.authMode !== "local" ? "disabled" : ""}>
        <option value="none" ${sec.require_2fa === "none" ? "selected" : ""}>Opcional para todos</option>
        <option value="admin" ${sec.require_2fa === "admin" ? "selected" : ""}>Obrigatório para administradores</option>
        <option value="all" ${sec.require_2fa === "all" ? "selected" : ""}>Obrigatório para todos</option></select>
        <small>Quem ainda não tiver 2FA será levado a configurar no próximo acesso.</small></label>
    </div>
    <h3 class="sub-h">Telegram</h3>
    <label class="fld check"><input type="checkbox" name="enabled" ${n.enabled ? "checked" : ""}><span>Enviar notificações pelo Telegram</span></label>
    <div class="form-grid" style="margin-top:10px">
      <label class="fld wide"><span>Token do bot</span><input name="bot_token" type="${isVar ? "text" : "password"}" autocomplete="new-password" value="${saved ? "" : esc(tg.bot_token || "")}" data-saved="${saved ? 1 : 0}"
        placeholder="${saved ? "Salvo. Deixe em branco para manter" : "123456789:ABC… (crie com o @BotFather)"}"><small>Fale com o @BotFather no Telegram, use /newbot e cole o token aqui.</small></label>
      <label class="fld"><span>Chat ID</span><input name="chat_id" value="${esc(tg.chat_id || "")}" placeholder="ex.: 123456789 ou -100…"><small>Mande qualquer mensagem ao bot e clique em Descobrir.</small></label>
      <div class="fld"><span>&nbsp;</span><button type="button" class="btn" data-tg="chats">Descobrir chat ID</button></div>
      <div class="fld wide chat-list" id="tg-chats"></div>
      <label class="fld check"><input type="checkbox" name="include_warn" ${n.include_warn ? "checked" : ""}><span>Avisar também alertas de atenção (âmbar), não só os críticos</span></label>
      <label class="fld check"><input type="checkbox" name="notify_resolved" ${n.notify_resolved !== false ? "checked" : ""}><span>Avisar quando o problema for resolvido</span></label>
      <label class="fld check"><input type="checkbox" name="security" ${n.security !== false ? "checked" : ""}><span>Eventos de segurança: login bloqueado, 2FA ativado ou desativado, usuários criados</span></label>
      <label class="fld check"><input type="checkbox" name="login_ok" ${n.login_ok ? "checked" : ""}><span>Avisar a cada login bem-sucedido</span></label>
      <label class="fld"><span>Confirmar antes de avisar</span><select name="confirm_cycles">${[1, 2, 3, 5].map((c) => `<option value="${c}" ${Number(n.confirm_cycles || 2) === c ? "selected" : ""}>${c === 1 ? "Avisar na hora" : `${c} coletas seguidas`}</option>`).join("")}</select><small>Evita aviso por instabilidade rápida.</small></label>
      <label class="fld"><span>Horário silencioso</span><div class="color-row"><input type="time" name="quiet_from" value="${esc(n.quiet_from || "")}"> até <input type="time" name="quiet_to" value="${esc(n.quiet_to || "")}"></div><small>As mensagens chegam sem som.</small></label>
    </div>
    <div class="test-out" id="tg-out"></div>
    <div class="row-actions"><button type="button" class="btn" data-tg="test">Enviar mensagem de teste</button><button class="btn primary" type="submit">Salvar segurança e notificações</button></div>
  </form>`;
}

function readNotify(f) {
  const tok = f.elements.bot_token;
  return {
    enabled: f.elements.enabled.checked,
    telegram: { bot_token: tok.value === "" && tok.dataset.saved === "1" ? S.cfg.mask : tok.value.trim(), chat_id: f.elements.chat_id.value.trim() },
    include_warn: f.elements.include_warn.checked, notify_resolved: f.elements.notify_resolved.checked,
    security: f.elements.security.checked, login_ok: f.elements.login_ok.checked,
    confirm_cycles: Number(f.elements.confirm_cycles.value), quiet_from: f.elements.quiet_from.value, quiet_to: f.elements.quiet_to.value,
    startup_summary: true,
  };
}

/* ---------- Configurações: aparência ---------- */
function brandPanel() {
  const b = S.brand || window.BRAND || {};
  return `<form class="panel" id="f-brand">
    <div class="panel-head"><h2>Aparência</h2><span class="muted">Nome, logo, cores e tela de login</span></div>
    <div class="grid-2">
      <div class="form-grid">
        <label class="fld"><span>Nome da dashboard</span><input name="app_name" maxlength="40" value="${esc(b.app_name || "")}"></label>
        <label class="fld"><span>Título do login</span><input name="login_title" maxlength="40" value="${esc(b.login_title || "")}"></label>
        <label class="fld wide"><span>Mensagem do login</span><input name="login_message" maxlength="160" value="${esc(b.login_message || "")}"></label>
        <div class="fld wide"><span>Logo</span><div class="row-actions" style="margin:0">
          <label class="btn">Enviar logo<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" data-img="logo" hidden></label>
          <button type="button" class="btn" data-rm="logo">Usar o padrão</button>
          <label class="toggle"><input type="checkbox" name="logo_round" ${b.logo_round ? "checked" : ""}> Recortar em círculo</label></div>
          <small>PNG, SVG, JPG ou WEBP até 300 KB. Também vira o ícone da aba do navegador.</small></div>
        <div class="fld"><span>Cor principal</span><div class="color-row"><input type="color" name="accent" value="${esc(b.accent || "#116a67")}">
          ${["#116a67", "#1b74e4", "#8350c4", "#c2457f", "#e57000", "#2f8f4e", "#d40000", "#2f4f6f"].map((c) => `<button type="button" class="sw-btn" data-color="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join("")}</div></div>
        <div class="fld"><span>Cor no tema escuro</span><div class="color-row"><input type="color" name="accent_dark" value="${esc(b.accent_dark || "#4fc2b9")}" ${b.accent_dark ? "" : "disabled"}>
          <label class="toggle"><input type="checkbox" name="auto_dark" ${b.accent_dark ? "" : "checked"}> Automática</label></div></div>
        <label class="fld"><span>Tema padrão</span><select name="default_theme">${[["system", "Seguir o sistema"], ["light", "Claro"], ["dark", "Escuro"]].map(([v, t]) => `<option value="${v}" ${b.default_theme === v ? "selected" : ""}>${t}</option>`).join("")}</select>
          <small>Vale para quem ainda não escolheu um tema.</small></label>
        <label class="fld"><span>Fundo do login</span><select name="login_bg">${[["plain", "Padrão"], ["color", "Cor sólida"], ["gradient", "Degradê"], ["image", "Imagem"]].map(([v, t]) => `<option value="${v}" ${b.login_bg === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <div class="fld" data-bg="color gradient image"><span>Cores do fundo</span><div class="color-row"><input type="color" name="bg_color" value="${esc(b.bg_color || "#e6ebe8")}"><input type="color" name="bg_color2" value="${esc(b.bg_color2 || "#116a67")}" data-bg="gradient"></div></div>
        <div class="fld" data-bg="image"><span>Imagem de fundo</span><div class="row-actions" style="margin:0"><label class="btn">Enviar imagem<input type="file" accept="image/png,image/jpeg,image/webp" data-img="bg" hidden></label>
          <button type="button" class="btn" data-rm="bg">Remover</button></div><small>JPG, PNG ou WEBP até 1,5 MB.</small></div>
        <label class="fld check"><input type="checkbox" name="show_rack" ${b.show_rack !== false ? "checked" : ""}><span>Mostrar a faixa de rack ao lado do login</span></label>
      </div>
      <div><span class="small muted">Prévia da tela de login</span><div class="brand-prev" id="brand-prev"></div></div>
    </div>
    <div class="row-actions"><button type="button" class="btn" data-brand-reset>Voltar ao padrão</button><span style="flex:1"></span><button class="btn primary" type="submit">Salvar aparência</button></div>
  </form>`;
}

const BRAND_DRAFT = { imgs: {} };
function brandRead(f) {
  const v = (k) => f.elements[k].value;
  const out = { app_name: v("app_name"), login_title: v("login_title"), login_message: v("login_message"), accent: v("accent"),
    accent_dark: f.elements.auto_dark.checked ? "" : v("accent_dark"), default_theme: v("default_theme"), login_bg: v("login_bg"),
    bg_color: v("bg_color"), bg_color2: v("bg_color2"), show_rack: f.elements.show_rack.checked, logo_round: f.elements.logo_round.checked };
  Object.assign(out, BRAND_DRAFT.imgs);
  return out;
}
function brandPreview() {
  const f = $("#f-brand"), box = $("#brand-prev");
  if (!f || !box) return;
  const b = brandRead(f), cur = S.brand || {};
  const logo = "logo" in BRAND_DRAFT.imgs ? BRAND_DRAFT.imgs.logo : cur.logo;
  const bgimg = "bg" in BRAND_DRAFT.imgs ? BRAND_DRAFT.imgs.bg : cur.bg_image;
  box.style.background = b.login_bg === "color" ? b.bg_color : b.login_bg === "gradient" ? `linear-gradient(135deg, ${b.bg_color}, ${b.bg_color2})`
    : b.login_bg === "image" && bgimg ? `center / cover no-repeat url("${bgimg}"), ${b.bg_color}` : "var(--bg)";
  f.querySelectorAll("[data-bg]").forEach((el) => (el.hidden = !el.dataset.bg.split(" ").includes(b.login_bg)));
  f.elements.accent_dark.disabled = f.elements.auto_dark.checked;
  box.innerHTML = `<div class="login" style="--pv-accent:${b.accent}">
    ${b.show_rack ? '<div class="login-rack"><span class="ru"><i></i><i></i></span><span class="ru"><i></i><i></i></span><span class="ru"><i></i><i></i></span></div>' : ""}
    <div class="login-card ${b.show_rack ? "" : "no-rack"}"><div class="brand">${logo ? `<img src="${logo}" class="brand-img ${b.logo_round ? "round" : ""}" alt="">` : `<svg class="brand-mark" viewBox="0 0 32 32"><rect x="3" y="5" width="26" height="6" rx="2" fill="${b.accent}"/><rect x="3" y="13" width="26" height="6" rx="2" fill="${b.accent}" opacity=".7"/><rect x="3" y="21" width="26" height="6" rx="2" fill="${b.accent}" opacity=".45"/></svg>`}
      <div><b>${esc(b.app_name)}</b><span>${esc(b.login_message)}</span></div></div>
      <h1>${esc(b.login_title)}</h1><div class="mini-in"></div><div class="mini-in"></div><div class="mini-btn"></div></div></div>`;
}

/* ---------- Eventos ---------- */
document.addEventListener("click", async (e) => {
  if (e.target.closest('[data-me="account"]')) return accountDialog();
  const tg = e.target.closest("[data-tg]");
  if (tg) {
    const f = $("#f-sec"), out = $("#tg-out");
    out.className = "test-out"; out.textContent = tg.dataset.tg === "test" ? "Enviando…" : "Procurando conversas…";
    try {
      if (tg.dataset.tg === "test") {
        const r = await api("POST", "/api/notify/test", { notify: readNotify(f) });
        out.className = `test-out ${r.ok ? "ok" : "err"}`; out.textContent = r.ok ? "Mensagem enviada. Confira o Telegram." : `Falhou: ${r.error}`;
      } else {
        const r = await api("POST", "/api/notify/chats", { notify: readNotify(f) });
        out.textContent = r.chats.length ? "Escolha a conversa:" : "Nenhuma conversa encontrada. Mande uma mensagem ao bot (ou adicione-o ao grupo) e tente de novo.";
        $("#tg-chats").innerHTML = r.chats.map((c) => `<button type="button" class="btn" data-chat="${esc(c.id)}">${esc(c.name)} <span class="muted">${esc(c.id)}</span></button>`).join("");
      }
    } catch (err) { out.className = "test-out err"; out.textContent = err.message; }
    return;
  }
  const ch = e.target.closest("[data-chat]");
  if (ch) { $("#f-sec").elements.chat_id.value = ch.dataset.chat; $("#tg-chats").innerHTML = ""; $("#tg-out").textContent = "Chat escolhido. Envie um teste e salve."; return; }
  const sw = e.target.closest("#f-brand [data-color]");
  if (sw) { $("#f-brand").elements.accent.value = sw.dataset.color; brandPreview(); return; }
  const rm = e.target.closest("#f-brand [data-rm]");
  if (rm) { BRAND_DRAFT.imgs[rm.dataset.rm] = ""; brandPreview(); return; }
  if (e.target.closest("[data-brand-reset]")) {
    if (!confirm("Voltar nome, cores, logo e fundo ao padrão?")) return;
    try { const b = await api("PUT", "/api/branding", { app_name: "", login_title: "", login_message: "", accent: "#116a67", accent_dark: "", default_theme: "system",
      login_bg: "plain", bg_color: "#e6ebe8", bg_color2: "#116a67", show_rack: true, logo_round: false, logo: "", bg: "" });
      S.brand = b; BRAND_DRAFT.imgs = {}; window.applyBrand(b); toast("Aparência restaurada"); render(); }
    catch (err) { toast(err.message, true); }
  }
});
document.addEventListener("change", (e) => {
  const inp = e.target.closest("#f-brand [data-img]");
  if (inp) {
    const file = inp.files[0], kind = inp.dataset.img, lim = kind === "logo" ? 300000 : 1500000;
    if (!file) return;
    if (file.size > lim) return toast(`Imagem maior que ${lim / 1000} KB`, true);
    const rd = new FileReader();
    rd.onload = () => { BRAND_DRAFT.imgs[kind] = rd.result; brandPreview(); };
    rd.readAsDataURL(file);
    return;
  }
  if (e.target.closest("#f-brand")) brandPreview();
});
document.addEventListener("input", (e) => { if (e.target.closest("#f-brand")) brandPreview(); });
document.addEventListener("submit", async (e) => {
  if (e.target.id === "f-sec") {
    e.preventDefault();
    const f = e.target, st = S.cfg.config.settings;
    st.security = { ...(st.security || {}), require_2fa: f.elements.require_2fa.value };
    st.notify = readNotify(f);
    await saveConfig("Segurança e notificações salvas");
    return;
  }
  if (e.target.id === "f-brand") {
    e.preventDefault();
    try { const b = await api("PUT", "/api/branding", brandRead(e.target)); S.brand = b; BRAND_DRAFT.imgs = {}; window.applyBrand(b); toast("Aparência salva"); render(); }
    catch (err) { toast(err.message, true); }
  }
});
