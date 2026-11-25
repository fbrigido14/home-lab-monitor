/* Homelab Monitor — Assistente de IA e configurações da IA */
const AI = JSON.parse(sessionStorage.getItem("hm.chat") || "null") || { conversation: null, items: [], busy: false, camera: null };
AI.busy = false;
const saveChat = () => sessionStorage.setItem("hm.chat", JSON.stringify({ ...AI, busy: false }));
const TASK_INFO = {
  consumo: { title: "Analisar consumo", text: "Quem mais gasta, consumos estranhos e como economizar em R$.", icon: "zap" },
  melhorias: { title: "Sugestões de melhoria", text: "Riscos, backup, armazenamento, rede e segurança, por prioridade.", icon: "shield" },
  imagem: { title: "Analisar câmera", text: "O que aparece na imagem, qualidade e ajustes no Frigate.", icon: "camera" },
};

/* ---------- Markdown seguro (escapa tudo antes de formatar) ---------- */
function md(src) {
  const inline = (t) => t.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  const lines = esc(src || "").split("\n");
  const out = [];
  let list = null, para = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      flushP(); flushL();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${code.join("\n")}</code></pre>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      flushP(); flushL();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      out.push(`<div class="table-wrap"><table><thead><tr>${cells(body[0]).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body.slice(1).map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushP(); flushL(); out.push(`<h${Math.min(4, h[1].length + 2)}>${inline(h[2])}</h${Math.min(4, h[1].length + 2)}>`); continue; }
    const li = l.match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
    if (li) {
      flushP();
      const kind = /\d/.test(li[1]) ? "ol" : "ul";
      if (list !== kind) { flushL(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline(li[2])}</li>`);
      continue;
    }
    if (!l.trim()) { flushP(); flushL(); continue; }
    if (/^-{3,}$/.test(l.trim())) { flushP(); flushL(); out.push("<hr>"); continue; }
    flushL(); para.push(l);
  }
  flushP(); flushL();
  return out.join("");
}

/* ---------- Página ---------- */
function pageAssistant() {
  const st = S.ai;
  if (!st?.allowed) return empty(S.me?.role === "admin" ? 'Ative o assistente em <a href="#config">Configurações › Inteligência artificial</a>.' : "O assistente de IA não está liberado para o seu usuário.");
  const cams = st.cameras || [];
  if (!AI.camera && cams.length) AI.camera = `${cams[0].iid}|${cams[0].id}`;
  const thread = AI.items.map((m) => m.role === "user"
    ? `<div class="msg user"><span>${esc(m.text)}</span></div>`
    : m.role === "error" ? `<div class="msg err">${esc(m.text)}</div>`
      : `<div class="msg ai"><div class="md">${md(m.text)}</div>
          <div class="msg-meta small muted">${esc(m.model || "")}${m.usage?.[0] != null ? ` · ${num(m.usage[0], 0)} + ${num(m.usage[1], 0)} tokens` : ""}${m.sent?.length ? ` · enviado: ${esc(m.sent.join(", "))}` : ""}
          <button class="linkish" data-ai-copy>Copiar</button></div></div>`).join("");
  const sel = AI.camera?.split("|");
  return `<div class="ai-layout">
    <aside class="ai-side">
      <div class="panel">
        <div class="panel-head"><h2>Análises prontas</h2></div>
        ${["consumo", "melhorias"].map((k) => `<button class="ai-card" data-ai-task="${k}" ${AI.busy ? "disabled" : ""}><span class="dg-ic">${dgIcon(TASK_INFO[k].icon)}</span><span><b>${TASK_INFO[k].title}</b><small>${TASK_INFO[k].text}</small></span></button>`).join("")}
        <div class="ai-card is-static"><span class="dg-ic">${dgIcon("camera")}</span><span><b>${TASK_INFO.imagem.title}</b><small>${TASK_INFO.imagem.text}</small>
          ${cams.length ? `<select id="ai-cam" aria-label="Câmera">${cams.map((c) => `<option value="${esc(c.iid)}|${esc(c.id)}" ${AI.camera === `${c.iid}|${c.id}` ? "selected" : ""}>${esc(c.name)}${c.online ? "" : " (offline)"}</option>`).join("")}</select>
            <span class="ai-thumb"><img id="ai-thumb" alt=""></span>
            <button class="btn" data-ai-task="imagem" ${AI.busy ? "disabled" : ""}>Analisar esta câmera</button>`
            : '<small class="muted">Nenhuma câmera liberada: confira em Configurações se as imagens e o envio de câmeras para a IA estão permitidos.</small>'}</span></div>
      </div>
      <p class="small muted">${esc(st.provider_label)} · <code>${esc(st.model || "")}</code><br>${st.usage_today} pedido(s) hoje${st.daily_limit ? ` de ${st.daily_limit}` : ""}. Cada análise envia um resumo dos dados ao provedor; nada é enviado sem você pedir.</p>
    </aside>
    <section class="panel ai-chat">
      <div class="panel-head"><h2>Conversa</h2>${AI.items.length ? '<button class="btn" style="margin-left:auto" data-ai-new>Nova conversa</button>' : ""}</div>
      <div class="ai-thread" id="ai-thread">${thread || '<div class="empty">Escolha uma análise ao lado ou faça uma pergunta. Ex.: “Por que o consumo subiu à noite?” ou “Vale a pena trocar o disco do TrueNAS?”</div>'}
        ${AI.busy ? '<div class="msg ai thinking"><span></span><span></span><span></span> Analisando…</div>' : ""}</div>
      <form class="ai-ask" id="ai-ask">
        <textarea name="q" rows="2" placeholder="${AI.conversation ? "Continue a conversa…" : "Pergunte sobre o seu homelab, a casa ou o consumo"}" ${AI.busy ? "disabled" : ""}></textarea>
        <button class="btn primary" type="submit" ${AI.busy ? "disabled" : ""}>Enviar</button>
      </form>
    </section>
  </div>`;
}

function aiAfterRender() {
  const t = $("#ai-thread");
  if (t) t.scrollTop = t.scrollHeight;
  const img = $("#ai-thumb"), cam = AI.camera?.split("|");
  if (img && cam) camLoad(img, camUrl(cam[0], { id: cam[1] }, 640));
}

async function aiAsk(payload, label) {
  if (AI.busy) return;
  AI.busy = true;
  AI.items.push({ role: "user", text: label });
  saveChat();
  if (S.page !== "assistente") location.hash = "assistente"; else { render(); aiAfterRender(); }
  try {
    const r = await api("POST", "/api/ai/ask", payload);
    AI.conversation = r.conversation;
    AI.items.push({ role: "ai", text: r.answer || "_(resposta vazia)_", model: r.model, usage: r.usage, sent: r.sent });
    if (S.ai) S.ai.usage_today = r.usage_today;
  } catch (e) { AI.items.push({ role: "error", text: e.message }); }
  AI.busy = false;
  saveChat();
  if (S.page === "assistente") { render(); aiAfterRender(); }
}

function startTask(task, cam) {
  AI.conversation = null; AI.items = [];
  if (task === "imagem") {
    const [iid, id] = cam || AI.camera?.split("|") || [];
    const c = (S.ai.cameras || []).find((x) => x.iid === iid && x.id === id);
    if (!c) return toast("Escolha uma câmera", true);
    AI.camera = `${iid}|${id}`;
    return aiAsk({ task, camera: { iid, id } }, `${TASK_INFO.imagem.title}: ${c.name}`);
  }
  aiAsk({ task }, TASK_INFO[task].title);
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-ai-task]");
  if (t && !t.disabled) {
    $("#dlg").open && $("#dlg").close();
    return startTask(t.dataset.aiTask, t.dataset.iid ? [t.dataset.iid, t.dataset.camId] : null);
  }
  if (e.target.closest("[data-ai-new]")) { AI.conversation = null; AI.items = []; saveChat(); render(); return; }
  const cp = e.target.closest("[data-ai-copy]");
  if (cp) {
    const i = [...document.querySelectorAll(".msg.ai:not(.thinking)")].indexOf(cp.closest(".msg"));
    const m = AI.items.filter((x) => x.role === "ai")[i];
    navigator.clipboard?.writeText(m.text).then(() => toast("Resposta copiada"));
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "ai-cam") { AI.camera = e.target.value; saveChat(); aiAfterRender(); }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "ai-ask") return;
  e.preventDefault();
  const q = e.target.elements.q.value.trim();
  if (!q) return;
  if (AI.conversation) aiAsk({ conversation: AI.conversation, question: q }, q);
  else { AI.items = []; aiAsk({ task: "livre", question: q }, q); }
});
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("#ai-ask") && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); }
});
window.addEventListener("hashchange", () => { if (location.hash === "#assistente") setTimeout(aiAfterRender, 0); });

/* ---------- Painel de configuração ---------- */
function aiConfigPanel() {
  const a = S.cfg.config.settings.ai || {}, provs = S.ai?.providers || {};
  const p = provs[a.provider] || {};
  const saved = a.api_key === S.cfg.mask, isVar = String(a.api_key || "").startsWith("${");
  const sh = a.share || {};
  return `<form class="panel" id="f-ai">
    <div class="panel-head"><h2>Inteligência artificial</h2><span class="muted">Análise de consumo, imagens das câmeras e sugestões de melhoria</span></div>
    <label class="fld check"><input type="checkbox" name="enabled" ${a.enabled ? "checked" : ""}><span>Ativar o assistente de IA</span></label>
    <div class="form-grid" style="margin-top:12px">
      <label class="fld"><span>Provedor</span><select name="provider">${Object.entries(provs).map(([k, v]) => `<option value="${k}" ${a.provider === k ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select></label>
      <label class="fld"><span>Modelo</span><input name="model" value="${esc(a.model || "")}" placeholder="${esc(p.model || "")}"><small>Vazio usa o sugerido. Para imagens, o modelo precisa aceitar visão.</small></label>
      <label class="fld wide"><span>Chave de API</span><input name="api_key" type="${isVar ? "text" : "password"}" autocomplete="new-password" value="${saved ? "" : esc(a.api_key || "")}" data-saved="${saved ? 1 : 0}"
        placeholder="${saved ? "Salva. Deixe em branco para manter" : "Cole aqui ou use ${VARIAVEL} do .env"}"><small>Fica só no servidor e nunca é enviada ao navegador.</small></label>
      <label class="fld wide" id="ai-base"><span>Endereço do servidor</span><input name="base_url" value="${esc(a.base_url || "")}" placeholder="${esc(p.url || "")}"><small>Obrigatório para servidores compatíveis com a OpenAI (Ollama, OpenRouter, LM Studio). Para Claude, ChatGPT e Gemini deixe vazio para usar o endereço oficial.</small></label>
      <label class="fld"><span>Idioma das respostas</span><input name="language" value="${esc(a.language || "português do Brasil")}"></label>
      <label class="fld"><span>Tamanho máximo da resposta (tokens)</span><input name="max_tokens" type="number" min="200" max="16000" value="${a.max_tokens || 2000}"></label>
      <label class="fld"><span>Limite de pedidos por dia</span><input name="daily_limit" type="number" min="0" value="${a.daily_limit ?? 50}"><small>0 = sem limite. Ajuda a controlar o custo.</small></label>
      <label class="fld"><span>Quem pode usar</span><select name="allowed"><option value="admin" ${a.allowed !== "all" ? "selected" : ""}>Só administradores</option><option value="all" ${a.allowed === "all" ? "selected" : ""}>Todos os usuários</option></select></label>
    </div>
    <h3 class="sub-h">O que pode ser enviado ao provedor</h3>
    <div class="form-grid">
      <label class="fld check"><input type="checkbox" name="share_energy" ${sh.energy !== false ? "checked" : ""}><span>Consumo e custo de energia</span></label>
      <label class="fld check"><input type="checkbox" name="share_house" ${sh.house !== false ? "checked" : ""}><span>Tomadas e luzes da casa</span></label>
      <label class="fld check"><input type="checkbox" name="share_homelab" ${sh.homelab !== false ? "checked" : ""}><span>Equipamentos, serviços e alertas do homelab</span></label>
      <label class="fld check"><input type="checkbox" name="share_cameras" ${sh.cameras !== false ? "checked" : ""}><span>Imagens das câmeras (só quando você pede a análise)</span></label>
      <label class="fld check"><input type="checkbox" name="anonymize" ${a.anonymize !== false ? "checked" : ""}><span>Remover endereços IP antes de enviar</span></label>
    </div>
    <div class="test-out" id="ai-test-out"></div>
    <div class="row-actions"><button type="button" class="btn" data-ai-test>Testar conexão</button><button class="btn primary" type="submit">Salvar inteligência artificial</button></div>
  </form>`;
}

function readAIForm(f) {
  const n = (k) => Number(f.elements[k].value);
  const key = f.elements.api_key;
  return {
    enabled: f.elements.enabled.checked, provider: f.elements.provider.value, model: f.elements.model.value.trim(),
    api_key: key.value === "" && key.dataset.saved === "1" ? S.cfg.mask : key.value.trim(),
    base_url: f.elements.base_url.value.trim(), language: f.elements.language.value.trim() || "português do Brasil",
    max_tokens: n("max_tokens") || 2000, daily_limit: n("daily_limit") || 0, allowed: f.elements.allowed.value,
    anonymize: f.elements.anonymize.checked,
    share: { energy: f.elements.share_energy.checked, house: f.elements.share_house.checked,
      homelab: f.elements.share_homelab.checked, cameras: f.elements.share_cameras.checked },
  };
}
document.addEventListener("change", (e) => {
  if (e.target.name !== "provider" || !e.target.closest("#f-ai")) return;
  const f = e.target.form, p = S.ai.providers[e.target.value] || {};
  f.elements.model.placeholder = p.model || ""; f.elements.base_url.placeholder = p.url || "";
  f.elements.api_key.dataset.saved = "0"; f.elements.api_key.placeholder = "Cole a chave deste provedor";
});
document.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-ai-test]")) return;
  const out = $("#ai-test-out");
  out.className = "test-out"; out.textContent = "Testando…";
  try {
    const r = await api("POST", "/api/ai/test", { ai: readAIForm($("#f-ai")) });
    out.className = `test-out ${r.ok ? "ok" : "err"}`;
    out.textContent = r.ok ? `Funcionou em ${r.ms} ms com ${r.model}: “${r.answer}”` : `Falhou: ${r.error}`;
  } catch (err) { out.className = "test-out err"; out.textContent = err.message; }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "f-ai") return;
  e.preventDefault();
  S.cfg.config.settings.ai = readAIForm(e.target);
  if (await saveConfig("Inteligência artificial salva")) { S.ai = await api("GET", "/api/ai/status").catch(() => S.ai); render(); }
});
