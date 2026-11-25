/* Homelab Monitor — Atalhos (estilo Heimdall) */
const LC = { data: null, draft: null, edit: false, dirty: false, status: {}, q: "", dragId: null };
const LC_COLORS = ["#1b74e4", "#0095d5", "#18bcf2", "#13857e", "#52b54b", "#2f8f4e", "#a88a0c", "#e57000",
  "#c95c1a", "#d40000", "#c2457f", "#8350c4", "#2f4f6f", "#5f6b66", "#1f2a26"];
const ENGINES = { google: ["Google", "https://www.google.com/search?q="], duckduckgo: ["DuckDuckGo", "https://duckduckgo.com/?q="],
  bing: ["Bing", "https://www.bing.com/search?q="], startpage: ["Startpage", "https://www.startpage.com/do/search?q="] };
const lcCur = () => (LC.edit ? LC.draft : LC.data);
const lcDirty = () => { LC.dirty = true; const b = $("#lc-save"); if (b) b.disabled = false; };
const lcId = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

function textOn(hex) {   // texto claro ou escuro conforme o fundo do bloco
  const n = parseInt(String(hex || "#5f6b66").slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#17201c" : "#ffffff";
}
function lcIcon(it) {
  const ic = String(it.icon || "");
  if (ic.startsWith("data:image/")) return `<img src="${esc(ic)}" alt="">`;
  if (DGI[ic]) return dgIcon(ic);
  return `<span class="lt-letter">${esc((it.name || "?").trim().charAt(0).toUpperCase())}</span>`;
}
function lcLive(it) {
  if (!it.link || !S.data) return null;
  const app = S.data.apps.find((a) => a.id === it.link);
  const inst = S.data.instances.find((x) => x.id === it.link);
  const h = S.data.hosts.find((x) => x.id === it.link);
  if (h) return { up: h.status === "online", text: h.status === "online" ? `CPU ${num(h.cpu, 0)}% · RAM ${num(h.mem, 0)}%` : "fora do ar" };
  if (!inst) return null;
  const hs = S.data.hosts.filter((x) => inst.host_ids.includes(x.id));
  const text = app?.summary || (hs.length ? hs.map((x) => `${x.name} ${x.status === "online" ? `${num(x.cpu, 0)}%` : "offline"}`).join(" · ") : "");
  return { up: inst.ok, text: inst.mode === "demo" ? `${text} (demonstração)` : inst.ok ? text : inst.error };
}

/* ---------- Página ---------- */
function pageLauncher() {
  if (!LC.data) {
    api("GET", "/api/launcher").then((d) => { LC.data = d; localStorage.setItem("hm.launcherHome", d.settings.home ? "1" : "0"); render(); lcRefreshStatus(); })
      .catch((e) => toast(e.message, true));
    return empty("Carregando atalhos…");
  }
  const d = lcCur(), st = d.settings;
  setTimeout(lcAfterRender, 0);
  const bar = LC.edit
    ? `<div class="dg-bar edit"><div class="dg-bar-l"><b>Editando atalhos</b><span class="small muted">Arraste os blocos para reordenar ou trocar de grupo. Clique num bloco para editar.</span></div>
        <div class="dg-bar-r"><button class="btn" data-lc="add-group">Adicionar grupo</button><button class="btn" data-lc="prefs">Preferências</button>
        <button class="btn" data-lc="more">Mais…</button><button class="btn" data-lc="discard">Descartar</button>
        <button class="btn primary" data-lc="save" id="lc-save" ${LC.dirty ? "" : "disabled"}>Salvar atalhos</button></div></div>`
    : `<div class="lc-top">
        <input type="search" id="lc-search" class="lc-search" value="${esc(LC.q)}" placeholder="${st.search ? `Buscar atalho ou pesquisar no ${ENGINES[st.engine]?.[0] || "Google"}` : "Buscar atalho"}" aria-label="Buscar atalho" autocomplete="off">
        <span class="small muted lc-hint">Tecla <kbd>/</kbd> para buscar · Enter abre ${st.search ? "o atalho ou pesquisa na web" : "o atalho"}</span>
        ${isAdmin() ? '<div class="lc-actions"><button class="btn" data-lc="prefs">Preferências</button><button class="btn primary" data-lc="edit">Editar atalhos</button></div>' : ""}
      </div>`;
  const tw = { s: 194, m: 244, l: 304 }[st.size || "m"];
  const flat = st.layout === "flat" && !LC.edit;
  const list = flat ? [{ id: "all", title: "", items: d.groups.flatMap((g) => g.items || []) }]
    : LC.edit ? d.groups : d.groups.filter((g) => (g.items || []).length);   // grupos vazios só aparecem editando
  const groups = list.map((g) => `<section class="lc-group" data-g="${esc(g.id)}" style="flex:${flat ? "1 1 100%" : `1 1 ${Math.max(1, Math.min(4, (g.items || []).length)) * tw}px`}">
      <header class="lc-gh"><h2>${esc(g.title)}</h2>${LC.edit ? `<button class="dg-gbtn" data-lc="edit-group" data-g="${esc(g.id)}">Editar</button><button class="dg-gbtn" data-lc="add-item" data-g="${esc(g.id)}">+ Atalho</button>` : ""}</header>
      <div class="lc-grid size-${st.size || "m"}" data-drop="${esc(g.id)}">
        ${(g.items || []).map((it) => tileHTML(it, st)).join("") || `<div class="lc-empty">${LC.edit ? "Arraste atalhos para cá ou use + Atalho" : "Sem atalhos"}</div>`}
      </div></section>`).join("");
  return `${bar}<div class="lc-groups ${flat ? "flat" : ""}">${groups || empty("Nenhum grupo. Edite os atalhos para começar.")}</div>`;
}

function tileHTML(it, st) {
  const color = it.color || "#5f6b66", fg = textOn(color);
  const live = st.show_live ? lcLive(it) : null;
  const s = LC.status[it.id];
  const up = s ? s.up : live ? live.up : null;
  const dot = up == null ? "" : `<span class="lt-dot ${up ? "up" : "down"}" title="${up ? `No ar${s?.ms != null ? ` · ${s.ms} ms` : ""}` : "Sem resposta"}"></span>`;
  const inner = `<span class="lt-ic">${lcIcon(it)}</span>
    <span class="lt-tx"><b>${esc(it.name)}</b>${st.show_desc && it.desc ? `<small>${esc(it.desc)}</small>` : ""}${live?.text ? `<small class="lt-live" data-live="${esc(it.id)}">${esc(live.text)}</small>` : ""}</span>${dot}`;
  const style = `--tc:${color};--tf:${fg}`;
  const search = esc(plain(`${it.name} ${it.desc || ""} ${it.url}`));
  if (LC.edit) return `<button class="lt" draggable="true" data-i="${esc(it.id)}" style="${style}" data-s="${search}">${inner}</button>`;
  const newTab = (it.open || st.open_in) === "new";
  return `<a class="lt" href="${esc(it.url)}" data-i="${esc(it.id)}" style="${style}" data-s="${search}" ${newTab ? 'target="_blank" rel="noopener noreferrer"' : 'rel="noreferrer"'} title="${esc(it.url)}">${inner}</a>`;
}

function lcAfterRender() { lcFilter(); }
function lcFilter() {
  const q = plain(LC.q.trim());
  document.querySelectorAll(".lc-group").forEach((g) => {
    let any = false;
    g.querySelectorAll(".lt").forEach((t) => { const ok = !q || t.dataset.s.includes(q); t.hidden = !ok; any ||= ok; });
    g.hidden = !!q && !any;
  });
}
async function lcRefreshStatus() {
  if (S.page !== "atalhos" || document.hidden) return;
  try { LC.status = await api("GET", "/api/launcher/status"); } catch { return; }
  document.querySelectorAll(".lt[data-i]").forEach((el) => {
    const s = LC.status[el.dataset.i];
    if (!s) return;
    let dot = el.querySelector(".lt-dot");
    if (!dot) { dot = document.createElement("span"); el.append(dot); }
    dot.className = `lt-dot ${s.up ? "up" : "down"}`;
    dot.title = s.up ? `No ar · ${s.ms} ms` : "Sem resposta";
  });
}
setInterval(lcRefreshStatus, 30000);

/* ---------- Diálogos ---------- */
function lcItemDialog(gid, iid) {
  const d = LC.draft, g = d.groups.find((x) => x.id === gid);
  const it = iid ? g.items.find((x) => x.id === iid) : null;
  const draft = it ? { ...it } : { name: "", url: "https://", desc: "", icon: "globe", color: "#1b74e4", check: true };
  const links = [["", "Nenhuma"], ...S.data.instances.map((i) => [i.id, `Serviço: ${i.name}`]), ...S.data.hosts.map((h) => [h.id, `Host: ${h.name}`])];
  const preview = () => { const p = $("#lc-preview"); if (p) p.innerHTML = tileHTML({ ...draft, id: "preview" }, { ...d.settings, show_desc: true, show_live: true }); };
  dlgOpen(`<form class="dlg-body" id="f-lc">
    <h2>${it ? "Editar atalho" : `Novo atalho em ${esc(g.title)}`}</h2>
    <div class="lc-edit">
      <div class="form-grid">
        <label class="fld"><span>Nome</span><input name="name" required value="${esc(draft.name)}"></label>
        <label class="fld"><span>Descrição</span><input name="desc" value="${esc(draft.desc || "")}" placeholder="opcional"></label>
        <label class="fld wide"><span>Endereço</span><input name="url" required value="${esc(draft.url)}" placeholder="https://192.168.1.10:8006"></label>
        <div class="fld wide"><span>Cor</span><div class="swatches">
          ${LC_COLORS.map((c) => `<label class="sw"><input type="radio" name="color" value="${c}" ${draft.color === c ? "checked" : ""}><i style="background:${c}"></i></label>`).join("")}
          <label class="sw" title="Outra cor"><input type="radio" name="color" value="custom" ${LC_COLORS.includes(draft.color) ? "" : "checked"}><input type="color" name="color-hex" value="${esc(draft.color || "#1b74e4")}" aria-label="Outra cor"></label></div></div>
        <div class="fld wide"><span>Ícone</span>
          <div class="row-actions" style="margin:0 0 8px">
            <button type="button" class="btn" data-act="favicon">Buscar ícone do site</button>
            <label class="btn">Enviar imagem<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif,image/x-icon" id="lc-upload" hidden></label>
            <button type="button" class="btn" data-act="letter">Usar a inicial</button>
            <span class="small muted" id="lc-icon-msg"></span></div>
          <div class="icon-pick">${Object.keys(DGI).map((k) => `<label title="${k}"><input type="radio" name="icon" value="${k}" ${draft.icon === k ? "checked" : ""}><span>${dgIcon(k)}</span></label>`).join("")}</div></div>
        <label class="fld"><span>Abrir em</span><select name="open">
          <option value="" ${!draft.open ? "selected" : ""}>Padrão das preferências</option><option value="new" ${draft.open === "new" ? "selected" : ""}>Nova aba</option><option value="same" ${draft.open === "same" ? "selected" : ""}>Mesma aba</option></select></label>
        <label class="fld"><span>Informação ao vivo de</span><select name="link">${links.map(([v, t]) => `<option value="${esc(v)}" ${(draft.link || "") === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
        <label class="fld check"><input type="checkbox" name="check" ${draft.check ? "checked" : ""}><span>Verificar se o endereço está no ar (a cada 30 s)</span></label>
        ${it ? `<label class="fld"><span>Grupo</span><select name="group">${d.groups.map((x) => `<option value="${esc(x.id)}" ${x.id === gid ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select></label>` : ""}
      </div>
      <div class="lc-prev"><span class="small muted">Prévia</span><div class="lc-grid size-m" id="lc-preview"></div></div>
    </div>
    <div class="row-actions">${it ? '<button type="button" class="btn danger" data-act="del">Remover atalho</button>' : ""}<span style="flex:1"></span>
      <button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${it ? "Aplicar" : "Adicionar"}</button></div></form>`, (dlg) => {
    const f = $("#f-lc"), msg = $("#lc-icon-msg");
    dlg.classList.add("dlg-wide");
    dlg.addEventListener("close", () => dlg.classList.remove("dlg-wide"), { once: true });
    const sync = () => {
      draft.name = f.elements.name.value; draft.desc = f.elements.desc.value; draft.url = f.elements.url.value.trim();
      draft.color = f.elements.color.value === "custom" ? f.elements["color-hex"].value : f.elements.color.value;
      if (f.elements.icon.value) draft.icon = f.elements.icon.value;
      preview();
    };
    f.addEventListener("input", sync); f.addEventListener("change", sync); preview();
    f.querySelector('[data-act="letter"]').onclick = () => { draft.icon = ""; f.querySelectorAll('[name="icon"]').forEach((r) => (r.checked = false)); preview(); };
    f.querySelector('[data-act="favicon"]').onclick = async () => {
      msg.textContent = "Buscando…";
      try { draft.icon = (await api("POST", "/api/launcher/icon", { url: f.elements.url.value.trim() })).icon; f.querySelectorAll('[name="icon"]').forEach((r) => (r.checked = false)); msg.textContent = "Ícone encontrado"; preview(); }
      catch (e) { msg.textContent = e.message; }
    };
    $("#lc-upload").onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 256000) { msg.textContent = "Imagem maior que 256 KB"; return; }
      const rd = new FileReader();
      rd.onload = () => { draft.icon = rd.result; f.querySelectorAll('[name="icon"]').forEach((r) => (r.checked = false)); msg.textContent = file.name; preview(); };
      rd.readAsDataURL(file);
    };
    f.onsubmit = (e) => {
      e.preventDefault(); sync();
      if (!/^https?:\/\/[^/\s]+/i.test(draft.url)) return toast("O endereço precisa começar com http:// ou https://", true);
      const out = { id: it?.id || lcId("a"), name: draft.name.trim() || "Atalho", url: draft.url, desc: draft.desc.trim(), icon: draft.icon,
        color: draft.color, check: f.elements.check.checked };
      if (f.elements.open.value) out.open = f.elements.open.value;
      if (f.elements.link.value) out.link = f.elements.link.value;
      if (it) {
        const to = f.elements.group.value, i = g.items.indexOf(it);
        if (to === gid) g.items[i] = out; else { g.items.splice(i, 1); d.groups.find((x) => x.id === to).items.push(out); }
      } else g.items.push(out);
      lcDirty(); dlg.close(); render();
    };
    f.querySelector('[data-act="del"]')?.addEventListener("click", () => { g.items = g.items.filter((x) => x !== it); lcDirty(); dlg.close(); render(); });
  });
}

function lcGroupDialog(gid) {
  const d = LC.draft, g = gid ? d.groups.find((x) => x.id === gid) : null, idx = g ? d.groups.indexOf(g) : -1;
  dlgOpen(`<form class="dlg-body" id="f-lcg"><h2>${g ? "Editar grupo" : "Novo grupo"}</h2>
    <div class="form-grid"><label class="fld wide"><span>Título</span><input name="title" required value="${esc(g?.title || "Novo grupo")}"></label>
    ${g ? `<div class="fld"><span>Posição</span><div class="row-actions" style="margin:0"><button type="button" class="btn" data-act="up" ${idx === 0 ? "disabled" : ""}>Mover para cima</button><button type="button" class="btn" data-act="down" ${idx === d.groups.length - 1 ? "disabled" : ""}>Mover para baixo</button></div></div>` : ""}</div>
    <div class="row-actions">${g ? '<button type="button" class="btn danger" data-act="del">Remover grupo</button>' : ""}<span style="flex:1"></span>
    <button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${g ? "Aplicar" : "Adicionar"}</button></div></form>`, (dlg) => {
    const f = $("#f-lcg");
    f.onsubmit = (e) => { e.preventDefault(); const t = f.elements.title.value.trim() || "Grupo"; if (g) g.title = t; else d.groups.push({ id: lcId("g"), title: t, items: [] }); lcDirty(); dlg.close(); render(); };
    const mv = (k) => { const j = idx + k; [d.groups[idx], d.groups[j]] = [d.groups[j], d.groups[idx]]; lcDirty(); dlg.close(); render(); };
    f.querySelector('[data-act="up"]')?.addEventListener("click", () => mv(-1));
    f.querySelector('[data-act="down"]')?.addEventListener("click", () => mv(1));
    f.querySelector('[data-act="del"]')?.addEventListener("click", () => {
      if (g.items.length && !confirm(`Remover o grupo ${g.title} e ${g.items.length} atalho(s)?`)) return;
      d.groups.splice(idx, 1); lcDirty(); dlg.close(); render();
    });
  });
}

function lcPrefsDialog() {
  const editing = LC.edit, st = (editing ? LC.draft : LC.data).settings;
  dlgOpen(`<form class="dlg-body" id="f-lcp"><h2>Preferências dos atalhos</h2><div class="form-grid">
    <label class="fld"><span>Abrir atalhos em</span><select name="open_in"><option value="new" ${st.open_in === "new" ? "selected" : ""}>Nova aba</option><option value="same" ${st.open_in === "same" ? "selected" : ""}>Mesma aba</option></select></label>
    <label class="fld"><span>Tamanho dos blocos</span><select name="size"><option value="s" ${st.size === "s" ? "selected" : ""}>Pequeno</option><option value="m" ${st.size === "m" ? "selected" : ""}>Médio</option><option value="l" ${st.size === "l" ? "selected" : ""}>Grande</option></select></label>
    <label class="fld"><span>Organização</span><select name="layout"><option value="groups" ${st.layout !== "flat" ? "selected" : ""}>Por grupos</option><option value="flat" ${st.layout === "flat" ? "selected" : ""}>Tudo junto, sem títulos</option></select></label>
    <label class="fld"><span>Pesquisar na web com</span><select name="engine">${Object.entries(ENGINES).map(([k, [n]]) => `<option value="${k}" ${st.engine === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <label class="fld check"><input type="checkbox" name="search" ${st.search ? "checked" : ""}><span>Enter na busca pesquisa na web quando nenhum atalho combina</span></label>
    <label class="fld check"><input type="checkbox" name="show_desc" ${st.show_desc ? "checked" : ""}><span>Mostrar descrições</span></label>
    <label class="fld check"><input type="checkbox" name="show_live" ${st.show_live ? "checked" : ""}><span>Mostrar informação ao vivo dos serviços monitorados</span></label>
    <label class="fld check"><input type="checkbox" name="home" ${st.home ? "checked" : ""}><span>Abrir a dashboard direto nos Atalhos</span></label>
  </div><div class="row-actions"><span style="flex:1"></span><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${editing ? "Aplicar" : "Salvar"}</button></div></form>`, (dlg) => {
    $("#f-lcp").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, ns = { open_in: f.elements.open_in.value, size: f.elements.size.value, engine: f.elements.engine.value, layout: f.elements.layout.value,
        search: f.elements.search.checked, show_desc: f.elements.show_desc.checked, show_live: f.elements.show_live.checked, home: f.elements.home.checked };
      if (editing) { LC.draft.settings = ns; lcDirty(); dlg.close(); render(); return; }
      const next = { ...clone(LC.data), settings: ns };
      try { await api("PUT", "/api/launcher", next); LC.data = next; localStorage.setItem("hm.launcherHome", ns.home ? "1" : "0"); toast("Preferências salvas"); dlg.close(); render(); }
      catch (err) { toast(err.message, true); }
    };
  });
}

function lcMoreDialog() {
  dlgOpen(`<div class="dlg-body"><h2>Mais opções</h2><div class="row-actions" style="flex-direction:column;align-items:stretch">
      <label class="btn" style="text-align:center">Importar JSON<input type="file" accept="application/json,.json" id="lc-import" hidden></label>
      <button class="btn" data-act="export">Baixar JSON do rascunho</button>
      <button class="btn danger" data-act="reset">Recriar a partir dos serviços configurados</button></div>
    <div class="row-actions"><span style="flex:1"></span><button class="btn" data-close>Fechar</button></div></div>`, (dlg) => {
    $("#lc-import").onchange = async (e) => {
      try { const d = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(d.groups)) throw new Error("Arquivo não parece de atalhos");
        LC.draft = { settings: { ...LC.draft.settings, ...(d.settings || {}) }, groups: d.groups }; lcDirty(); dlg.close(); render(); toast("Atalhos importados. Confira e salve."); }
      catch (err) { toast(err.message, true); }
    };
    dlg.querySelector('[data-act="export"]').onclick = () => {
      hmSave("atalhos-homelab.json", new Blob([JSON.stringify(LC.draft, null, 2)], { type: "application/json" }));
    };
    dlg.querySelector('[data-act="reset"]').onclick = async () => {
      if (!confirm("Trocar o rascunho pelos atalhos gerados a partir dos serviços configurados? Nada é salvo até você clicar em Salvar.")) return;
      LC.draft = await api("GET", "/api/launcher/default"); lcDirty(); dlg.close(); render();
    };
  });
}

/* ---------- Arrastar e soltar (modo edição) ---------- */
function lcFind(id) { for (const g of LC.draft.groups) { const i = g.items.findIndex((x) => x.id === id); if (i >= 0) return [g, i]; } return [null, -1]; }
document.addEventListener("dragstart", (e) => {
  const t = e.target.closest?.(".lt[draggable]");
  if (!t || !LC.edit) return;
  LC.dragId = t.dataset.i; t.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.dataset.i);
});
document.addEventListener("dragend", (e) => { e.target.closest?.(".lt")?.classList.remove("dragging"); document.querySelectorAll(".drop-before,.drop-after,.drop-into").forEach((x) => x.classList.remove("drop-before", "drop-after", "drop-into")); LC.dragId = null; });
document.addEventListener("dragover", (e) => {
  if (!LC.dragId) return;
  const grid = e.target.closest?.("[data-drop]");
  if (!grid) return;
  e.preventDefault();
  document.querySelectorAll(".drop-before,.drop-after,.drop-into").forEach((x) => x.classList.remove("drop-before", "drop-after", "drop-into"));
  const tile = e.target.closest(".lt");
  if (tile && tile.dataset.i !== LC.dragId) {
    const r = tile.getBoundingClientRect();
    tile.classList.add(e.clientX < r.left + r.width / 2 ? "drop-before" : "drop-after");
  } else if (!tile) grid.classList.add("drop-into");
});
document.addEventListener("drop", (e) => {
  if (!LC.dragId) return;
  const grid = e.target.closest?.("[data-drop]");
  if (!grid) return;
  e.preventDefault();
  const [from, fi] = lcFind(LC.dragId);
  const item = from.items.splice(fi, 1)[0];
  const to = LC.draft.groups.find((g) => g.id === grid.dataset.drop);
  const tile = e.target.closest(".lt");
  let idx = to.items.length;
  if (tile && tile.dataset.i !== item.id) {
    const r = tile.getBoundingClientRect();
    idx = to.items.findIndex((x) => x.id === tile.dataset.i) + (e.clientX < r.left + r.width / 2 ? 0 : 1);
  }
  to.items.splice(idx, 0, item);
  LC.dragId = null; lcDirty(); render();
});

/* ---------- Ações ---------- */
document.addEventListener("click", async (e) => {
  if (S.page !== "atalhos") return;
  const b = e.target.closest("[data-lc]"), tile = e.target.closest(".lt");
  if (!b && tile && LC.edit) { const [g] = lcFind(tile.dataset.i); return lcItemDialog(g.id, tile.dataset.i); }
  if (!b) return;
  const act = b.dataset.lc;
  if (act === "edit") { LC.draft = clone(LC.data); LC.edit = true; LC.dirty = false; LC.q = ""; render(); }
  if (act === "discard") { if (LC.dirty && !confirm("Descartar as alterações que ainda não foram salvas?")) return; LC.edit = false; LC.dirty = false; LC.draft = null; render(); }
  if (act === "save") {
    try { await api("PUT", "/api/launcher", LC.draft); LC.data = clone(LC.draft); LC.edit = false; LC.dirty = false; LC.draft = null;
      localStorage.setItem("hm.launcherHome", LC.data.settings.home ? "1" : "0"); toast("Atalhos salvos"); render(); lcRefreshStatus(); }
    catch (err) { toast(err.message, true); }
  }
  if (act === "prefs") lcPrefsDialog();
  if (act === "more") lcMoreDialog();
  if (act === "add-group") lcGroupDialog();
  if (act === "edit-group") lcGroupDialog(b.dataset.g);
  if (act === "add-item") lcItemDialog(b.dataset.g);
});
document.addEventListener("input", (e) => { if (e.target.id === "lc-search") { LC.q = e.target.value; lcFilter(); } });
document.addEventListener("keydown", (e) => {
  if (S.page !== "atalhos" || LC.edit) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
  if (e.key === "/" && !typing && !$("dialog[open]")) { e.preventDefault(); $("#lc-search")?.focus(); return; }
  if (e.target.id !== "lc-search") return;
  if (e.key === "Escape") { LC.q = ""; e.target.value = ""; lcFilter(); return; }
  if (e.key !== "Enter") return;
  const visible = [...document.querySelectorAll(".lt:not([hidden])")];
  const q = LC.q.trim();
  if (visible.length && q && (visible.length === 1 || LC.data.settings.search === false)) { visible[0].click(); return; }
  if (q && LC.data.settings.search) {
    const [, url] = ENGINES[LC.data.settings.engine] || ENGINES.google;
    window.open(url + encodeURIComponent(q), "_blank", "noopener,noreferrer");
  }
});
window.addEventListener("beforeunload", (e) => { if (LC.dirty) { e.preventDefault(); e.returnValue = ""; } });
