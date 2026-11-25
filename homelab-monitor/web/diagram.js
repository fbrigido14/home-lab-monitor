/* Homelab Monitor — página Diagrama (visualizar e editar) */
const DG = { data: null, draft: null, edit: false, dirty: false, drag: null };
const PALETTE = [["blue", "Azul"], ["green", "Verde"], ["purple", "Roxo"], ["orange", "Laranja"], ["teal", "Verde-água"],
  ["pink", "Rosa"], ["yellow", "Amarelo"], ["red", "Vermelho"], ["ink", "Neutro"]];
const GRID = 8;

/* Ícones de traço simples (24×24) */
const DGI = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M8 10a6 6 0 0 1 8 0M5.5 7.5a10 10 0 0 1 13 0"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a14 14 0 0 1 20 0"/><circle cx="12" cy="19.5" r="1"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  backup: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 8v4l3 2"/>',
  storage: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M10 10h4v4h-4zM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  play: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="m10 9 5 2.5-5 2.5z"/><path d="M8 21h8"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  box: '<path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  thermo: '<path d="M14 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0z"/><path d="M12 17.5v-6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4.3 4.3 0 0 1-.5 8.5z"/>',
  network: '<rect x="9.5" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/><path d="M12 8v4M5.5 16v-4h13v4"/>',
  dns: '<circle cx="12" cy="12" r="9"/><path d="M8.5 9h3a2.5 2.5 0 0 1 0 5h-3zM8.5 9v6"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 16-5-5-9 9"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  key: '<circle cx="8" cy="14" r="4.5"/><path d="m11.5 11 9-9M17 5l2.5 2.5M14.5 7.5 17 10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
};
const dgIcon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DGI[k] || DGI.box}</svg>`;

const clone = (o) => JSON.parse(JSON.stringify(o));
const cur = () => (DG.edit ? DG.draft : DG.data);
const isAdmin = () => S.me?.role === "admin";
const colorVar = (c) => (String(c).startsWith("#") ? c : `var(--dg-${c || "blue"})`);
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const allNodes = (d) => d.groups.flatMap((g) => [{ id: g.id, label: `Grupo: ${g.title}` }, ...(g.items || []).map((i) => ({ id: i.id, label: `${g.title} › ${i.name}` }))]);
const markDirty = () => { DG.dirty = true; const b = $("#dg-save"); if (b) b.disabled = false; };

function linkStatus(link) {
  if (!link || !S.data) return null;
  const h = S.data.hosts.find((x) => x.id === link);
  if (h) return { state: h.demo ? "demo" : h.status, name: h.name, page: "visao", host: h.id };
  const i = S.data.instances.find((x) => x.id === link);
  if (i) return { state: i.mode === "demo" ? "demo" : i.ok ? "online" : "offline", name: i.name, page: i.page };
  return null;
}

/* ---------- Estado da visualização ---------- */
Object.assign(DG, {
  view: { mode: "fit", s: 1, tx: 0, ty: 0 },
  sel: null, query: "", onlyIssues: false,
  flow: localStorage.getItem("hm.flow") !== "off" && !matchMedia("(prefers-reduced-motion: reduce)").matches,
  pan: null, pointers: new Map(),
});
const plain = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/* ---------- Saúde de cada item (a partir dos dados ao vivo) ---------- */
function relatedEvents(link) {
  if (!link || !S.data) return [];
  const h = S.data.hosts.find((x) => x.id === link);
  // host: alertas que citam o nome dele + alertas da integração que o monitora
  // (só quando a integração cuida de um único equipamento; o Zabbix fala de vários hosts)
  let i = S.data.instances.find((x) => x.id === (h ? h.source : link));
  if (h && i && (i.host_ids.length !== 1 || i.type === "zabbix")) i = null;
  return S.data.events.filter((e) => (h && `${e.title} ${e.detail}`.includes(h.name)) || (i && e.source === i.page));
}
function itemHealth(it) {
  const st = linkStatus(it.link);
  if (!st) return null;
  const evs = relatedEvents(it.link);
  const level = st.state === "offline" || evs.some((e) => e.level === "crit") ? "crit"
    : evs.some((e) => e.level === "warn") ? "warn" : null;
  return { ...st, level, events: evs };
}
function findNode(id) {
  for (const g of cur().groups) {
    if (g.id === id) return { kind: "group", g };
    const it = (g.items || []).find((x) => x.id === id);
    if (it) return { kind: "item", it, g };
  }
  return null;
}
/* Ligações de um nó: as dele e, para um item, também as do grupo onde ele está */
function neighbors(id) {
  const n = findNode(id);
  if (!n) return [];
  const ends = new Set([id, ...(n.kind === "item" ? [n.g.id] : (n.g.items || []).map((i) => i.id))]);
  return (cur().links || []).filter((l) => ends.has(l.from) || ends.has(l.to)).map((l) => {
    const out = ends.has(l.from);
    return { link: l, other: out ? l.to : l.from, out, type: cur().types.find((t) => t.id === l.type) };
  });
}
const nodeName = (id) => { const n = findNode(id); return n ? (n.kind === "item" ? n.it.name : n.g.title) : id; };

/* ---------- Render ---------- */
function pageDiagram() {
  if (!DG.data) {
    api("GET", "/api/diagram").then((d) => { DG.data = d; render(); }).catch((e) => toast(e.message, true));
    return empty("Carregando diagrama…");
  }
  const d = cur();
  const width = Math.max(1536, ...d.groups.map((g) => g.x + g.w + 28));
  setTimeout(layoutDiagram, 0);
  const zoomCtl = `<div class="seg dg-zoom" role="group" aria-label="Zoom">
      <button data-dg="zoom-out" aria-label="Diminuir zoom">−</button>
      <button data-dg="zoom-100" id="dg-pct" aria-label="Zoom 100%">${Math.round(DG.view.s * 100)}%</button>
      <button data-dg="zoom-in" aria-label="Aumentar zoom">+</button>
      <button data-dg="zoom-fit" class="${DG.view.mode === "fit" ? "on" : ""}">Ajustar</button></div>`;
  const bar = DG.edit
    ? `<div class="dg-bar edit">
        <div class="dg-bar-l"><b>Editando</b><span class="small muted">Arraste os grupos pelo título, a alça no canto muda a largura, e clique num item para editar.</span></div>
        <div class="dg-bar-r">
          <button class="btn" data-dg="add-group">Adicionar grupo</button>
          <button class="btn" data-dg="links">Ligações</button>
          <button class="btn" data-dg="types">Tipos de ligação</button>
          <button class="btn" data-dg="meta">Título</button>
          <button class="btn" data-dg="more">Mais…</button>
          ${zoomCtl}
          <button class="btn" data-dg="discard">Descartar</button>
          <button class="btn primary" data-dg="save" id="dg-save" ${DG.dirty ? "" : "disabled"}>Salvar diagrama</button>
        </div></div>`
    : `<div class="dg-bar">
        <input type="search" id="dg-search" class="dg-search" placeholder="Buscar no diagrama" value="${esc(DG.query)}" aria-label="Buscar no diagrama">
        <label class="toggle"><input type="checkbox" data-dg="issues" ${DG.onlyIssues ? "checked" : ""}> Só com problema</label>
        <label class="toggle"><input type="checkbox" data-dg="flow" ${DG.flow ? "checked" : ""}> Fluxo animado</label>
        <span style="flex:1"></span>
        ${zoomCtl}
        <button class="btn" data-dg="export">Baixar JSON</button>
        ${isAdmin() ? '<button class="btn primary" data-dg="edit">Editar diagrama</button>' : ""}
      </div>`;
  return `${bar}
    <div class="dg-viewport" id="dg-viewport" tabindex="0" aria-label="Diagrama da rede. Arraste o fundo para mover, Ctrl + roda do mouse ou pinça para zoom.">
      <div class="dg-canvas ${DG.edit ? "is-edit" : ""} ${DG.flow && !DG.edit ? "flow" : ""}" id="dg-canvas" style="width:${width}px">
        <div class="dg-title"><h2>${esc(d.title || "")}</h2><p>${esc(d.subtitle || "")}</p></div>
        <svg class="dg-links" id="dg-links" aria-hidden="true"></svg>
        ${d.groups.map(groupHTML).join("")}
      </div>
      <span class="dg-hint small">Arraste o fundo para mover · Ctrl + roda ou pinça para zoom</span>
    </div>
    ${!DG.edit && DG.sel && findNode(DG.sel) ? drawerHTML(DG.sel) : ""}`;
}

function groupHTML(g) {
  const kind = g.kind || "items";
  let body = "", issues = { crit: 0, warn: 0 };
  if (kind === "items") {
    body = `<div class="dg-items" style="grid-template-columns:repeat(${Math.max(1, g.cols || 1)}, minmax(0, 1fr))">
      ${(g.items || []).map((it) => {
        const hl = itemHealth(it);
        if (hl?.level) issues[hl.level]++;
        const tip = hl ? `${hl.name}: ${hl.state === "demo" ? "demonstração" : hl.state}${hl.level ? ` · ${hl.events.filter((e) => e.level !== "info").length} alerta(s)` : ""}` : "";
        return `<div class="dg-item ${hl?.level ? `st-${hl.level}` : ""} ${DG.sel === it.id ? "is-sel" : ""}" data-i="${esc(it.id)}" tabindex="0" role="button" title="${esc(tip)}">
          <span class="dg-ic">${dgIcon(it.icon)}</span>
          <span class="dg-tx"><b>${esc(it.name)}</b>${it.subtitle ? `<small>${esc(it.subtitle)}</small>` : ""}</span>
          ${hl ? `<span class="dot ${hl.state === "demo" ? "" : hl.state}"></span>` : ""}
        </div>`; }).join("")}
    </div>`;
  } else if (kind === "notes") {
    body = `<ul class="dg-notes">${(g.notes || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
  } else {
    body = `<div class="dg-legend">${cur().types.map((t) => `<div><svg viewBox="0 0 40 8"><line x1="1" y1="4" x2="39" y2="4" style="stroke:${colorVar(t.color)}" stroke-width="2" ${t.dashed ? 'stroke-dasharray="5 4"' : ""}/></svg>${esc(t.label)}</div>`).join("")}</div>`;
  }
  const badge = issues.crit || issues.warn
    ? `<span class="dg-badge ${issues.crit ? "crit" : "warn"}" title="Itens com alerta">${issues.crit + issues.warn}</span>` : "";
  return `<section class="dg-group k-${kind} ${DG.sel === g.id ? "is-sel" : ""}" data-g="${esc(g.id)}" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;--gc:${colorVar(g.color)}">
    <header class="dg-gh" ${!DG.edit && kind === "items" ? 'tabindex="0" role="button"' : ""}>${esc(g.title)}${badge}${DG.edit ? `<button class="dg-gbtn" data-dg="edit-group" data-g="${esc(g.id)}" aria-label="Editar grupo ${esc(g.title)}">Editar</button>${kind === "items" ? `<button class="dg-gbtn" data-dg="add-item" data-g="${esc(g.id)}" aria-label="Adicionar item em ${esc(g.title)}">+ Item</button>` : ""}` : ""}</header>
    ${body}
    ${DG.edit ? '<span class="dg-resize" aria-hidden="true"></span>' : ""}
  </section>`;
}

/* ---------- Painel de detalhes ---------- */
function drawerHTML(id) {
  const n = findNode(id);
  const nb = neighbors(id);
  const conn = nb.length ? `<h3 class="sub-h">Conexões</h3><ul class="dg-conn">${nb.map((x) => `<li><svg viewBox="0 0 28 8" aria-hidden="true"><line x1="1" y1="4" x2="27" y2="4" style="stroke:${colorVar(x.type?.color)}" stroke-width="2" ${x.type?.dashed ? 'stroke-dasharray="4 3"' : ""}/></svg>
      <button class="linkish" data-dg="goto" data-id="${esc(x.other)}">${esc(nodeName(x.other))}</button><span class="small muted">${x.link.both ? "↔" : x.out ? "→" : "←"} ${esc(x.type?.label || "")}${x.link.label ? ` · ${esc(x.link.label)}` : ""}</span></li>`).join("")}</ul>` : "";
  let body = "";
  if (n.kind === "group") {
    body = `<ul class="dg-conn">${(n.g.items || []).map((it) => { const h = itemHealth(it); return `<li><span class="dot ${h ? (h.state === "demo" ? "" : h.state) : ""}"></span><button class="linkish" data-dg="goto" data-id="${esc(it.id)}">${esc(it.name)}</button>${h?.level ? `<span class="tag ${h.level}">${h.level === "crit" ? "crítico" : "atenção"}</span>` : ""}</li>`; }).join("") || '<li class="muted">Grupo sem itens.</li>'}</ul>`;
    return drawerShell(n.g.title, `${(n.g.items || []).length} itens`, dgIcon("box"), colorVar(n.g.color), body + conn, null);
  }
  const it = n.it, h = itemHealth(it), host = it.link && S.data.hosts.find((x) => x.id === it.link);
  const inst = it.link && S.data.instances.find((x) => x.id === it.link);
  if (host) {
    const mb = (lbl, v, unit = "%") => `<div class="dg-metric"><span>${lbl}</span><b>${v == null ? "–" : num(v, unit === "%" ? 0 : 1) + unit}</b>${unit === "%" ? bar(v) : ""}</div>`;
    body += `<div class="dg-metrics">${mb("CPU", host.cpu)}${mb("RAM", host.mem)}${host.disk != null ? mb("Disco", host.disk) : ""}${host.temp != null ? mb("Temperatura", host.temp, " °C") : ""}</div>
      <p class="small muted">${esc(host.os || "")}${host.ip ? ` · ${esc(host.ip)}` : ""}${host.uptime ? ` · ligado há ${uptime(host.uptime)}` : ""}</p>
      ${chartBox([{ key: `${host.id}.cpu`, label: "CPU %", unit: "%", color: cssv("--s1"), fill: true }, { key: `${host.id}.mem`, label: "RAM %", unit: "%", color: cssv("--s3") }], { leftMax: 100 })}`;
  } else if (inst) {
    const hs = S.data.hosts.filter((x) => inst.host_ids.includes(x.id));
    const app = S.data.apps.find((a) => a.id === inst.id);
    body += `<p class="small">${inst.mode === "demo" ? "Em demonstração" : inst.ok ? `Respondendo em ${inst.latency_ms} ms` : `<span style="color:var(--crit)">${esc(inst.error)}</span>`}${app?.summary ? ` · ${esc(app.summary)}` : ""}</p>
      ${hs.length ? `<h3 class="sub-h">Equipamentos</h3><ul class="dg-conn">${hs.map((x) => `<li><span class="dot ${x.status}"></span>${esc(x.name)}<span class="small muted">${x.cpu != null ? `CPU ${num(x.cpu, 0)}%` : ""}${x.mem != null ? ` · RAM ${num(x.mem, 0)}%` : ""}</span></li>`).join("")}</ul>` : ""}`;
  } else {
    body += '<p class="small muted">Este item não está ligado a nenhum serviço monitorado. Um administrador pode escolher um em Editar diagrama › clique no item › Status ao vivo.</p>';
  }
  if (h?.events.length) body += `<h3 class="sub-h">Alertas</h3>${evList(h.events, 8)}`;
  const state = h ? (h.state === "demo" ? "demonstração" : h.state === "online" ? "online" : "fora do ar") : "sem monitoramento";
  return drawerShell(it.name, `${esc(it.subtitle || "")}${it.subtitle ? " · " : ""}${state}`, dgIcon(it.icon), colorVar(n.g.color), body + conn, h);
}
function drawerShell(title, sub, ic, color, body, h) {
  return `<aside class="dg-drawer" id="dg-drawer" style="--gc:${color}" aria-label="Detalhes de ${esc(title)}">
    <header><span class="dg-ic">${ic}</span><div><b>${esc(title)}</b><span class="small muted">${sub}</span></div>
      <button class="icon-btn" data-dg="close-drawer" aria-label="Fechar detalhes">×</button></header>
    <div class="dg-drawer-body">${body}</div>
    ${h ? `<footer><button class="btn primary" data-dg="open-page">Abrir página</button></footer>` : ""}
  </aside>`;
}

/* ---------- Posição, zoom e ligações ---------- */
function layoutDiagram() {
  const canvas = $("#dg-canvas"), vp = $("#dg-viewport");
  if (!canvas || !vp) return;
  const groups = [...canvas.querySelectorAll(".dg-group")];
  const h = Math.max(600, ...groups.map((g) => g.offsetTop + g.offsetHeight + 28));
  canvas.style.height = `${h}px`;
  const natural = h * Math.min(1, vp.clientWidth / canvas.offsetWidth);
  vp.style.height = `${Math.round(Math.max(420, Math.min(window.innerHeight - 170, natural)))}px`;
  if (DG.view.mode === "fit") fitView(); else applyView();
  drawLinks();
  applyFilters();
  if (DG.sel) focusOn(DG.sel);
}
function fitView() {
  const canvas = $("#dg-canvas"), vp = $("#dg-viewport");
  if (!canvas || !vp) return;
  const s = Math.min(1, vp.clientWidth / canvas.offsetWidth, vp.clientHeight / canvas.offsetHeight);
  Object.assign(DG.view, { mode: "fit", s, tx: (vp.clientWidth - canvas.offsetWidth * s) / 2, ty: Math.max(0, (vp.clientHeight - canvas.offsetHeight * s) / 2) });
  applyView();
}
function applyView() {
  const canvas = $("#dg-canvas");
  if (!canvas) return;
  const v = DG.view;
  canvas.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
  DG.scale = v.s;
  const pct = $("#dg-pct");
  if (pct) pct.textContent = `${Math.round(v.s * 100)}%`;
  document.querySelector('[data-dg="zoom-fit"]')?.classList.toggle("on", v.mode === "fit");
}
function zoomAt(f, px, py) {
  const vp = $("#dg-viewport");
  if (!vp) return;
  const v = DG.view;
  if (px == null) { px = vp.clientWidth / 2; py = vp.clientHeight / 2; }
  const s = Math.max(0.2, Math.min(2.5, v.s * f));
  Object.assign(v, { mode: "free", tx: px - (px - v.tx) * (s / v.s), ty: py - (py - v.ty) * (s / v.s), s });
  applyView();
}
function centerOn(id) {
  const r = rectOf(id), vp = $("#dg-viewport");
  if (!r || !vp) return;
  const v = DG.view, s = Math.max(v.s, 0.75);
  Object.assign(v, { mode: "free", s, tx: vp.clientWidth / 2 - (r.x + r.w / 2) * s, ty: vp.clientHeight / 2 - (r.y + r.h / 2) * s });
  const canvas = $("#dg-canvas");
  canvas.classList.add("glide"); applyView(); setTimeout(() => canvas.classList.remove("glide"), 320);
}

function rectOf(id) {
  const canvas = $("#dg-canvas");
  const el = canvas?.querySelector(`[data-g="${CSS.escape(id)}"].dg-group, [data-i="${CSS.escape(id)}"]`);
  if (!el) return null;
  let x = 0, y = 0, n = el;
  while (n && n !== canvas) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function routeLink(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const right = b.x >= a.x + a.w, left = a.x >= b.x + b.w, below = b.y >= a.y + a.h, above = a.y >= b.y + b.h;
  if (oy > 24 && (right || left)) {
    const y = Math.max(a.y, b.y) + oy / 2, x1 = right ? a.x + a.w : a.x, x2 = right ? b.x : b.x + b.w;
    return [[x1, y], [x2, y]];
  }
  if (ox > 24 && (below || above)) {
    const x = Math.max(a.x, b.x) + ox / 2, y1 = below ? a.y + a.h : a.y, y2 = below ? b.y : b.y + b.h;
    return [[x, y1], [x, y2]];
  }
  const gx = right ? b.x - (a.x + a.w) : left ? a.x - (b.x + b.w) : 0;
  const gy = below ? b.y - (a.y + a.h) : above ? a.y - (b.y + b.h) : 0;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (gx >= gy) {
    const y1 = clamp(b.y + b.h / 2, a.y + 16, a.y + a.h - 16), y2 = clamp(a.y + a.h / 2, b.y + 16, b.y + b.h - 16);
    const x1 = right ? a.x + a.w : a.x, x2 = right ? b.x : b.x + b.w, mx = (x1 + x2) / 2;
    return [[x1, y1], [mx, y1], [mx, y2], [x2, y2]];
  }
  const x1 = clamp(b.x + b.w / 2, a.x + 24, a.x + a.w - 24), x2 = clamp(a.x + a.w / 2, b.x + 24, b.x + b.w - 24);
  const y1 = below ? a.y + a.h : a.y, y2 = below ? b.y : b.y + b.h, my = (y1 + y2) / 2;
  return [[x1, y1], [x1, my], [x2, my], [x2, y2]];
}

function endDown(id) {
  const n = findNode(id);
  if (!n) return false;
  const items = n.kind === "item" ? [n.it] : (n.g.items || []);
  const hs = items.map(itemHealth).filter(Boolean);
  return hs.length > 0 && hs.every((h) => h.state === "offline");   // grupo: só se tudo estiver fora
}

function drawLinks() {
  const svg = $("#dg-links"), canvas = $("#dg-canvas");
  if (!svg || !canvas) return;
  const d = cur();
  svg.setAttribute("width", canvas.offsetWidth); svg.setAttribute("height", canvas.offsetHeight);
  const resolve = (c) => (String(c).startsWith("#") ? c : cssv(`--dg-${c}`));
  const crit = cssv("--crit");
  const defs = d.types.map((t) => `<marker id="dg-arr-${t.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="${resolve(t.color)}"/></marker>`).join("")
    + `<marker id="dg-arr-down" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="${crit}"/></marker>`;
  const paths = (d.links || []).map((l, k) => {
    const a = rectOf(l.from), b = rectOf(l.to), t = d.types.find((x) => x.id === l.type);
    if (!a || !b || !t) return "";
    const pts = routeLink(a, b);
    const dpath = "M" + pts.map((p) => p.map(Math.round).join(" ")).join(" L");
    const down = !DG.edit && (endDown(l.from) || endDown(l.to));
    const color = down ? crit : resolve(t.color), mk = down ? "down" : t.id;
    const mid = pts[Math.floor((pts.length - 1) / 2)], mid2 = pts[Math.ceil((pts.length - 1) / 2)];
    const label = l.label ? `<text x="${(mid[0] + mid2[0]) / 2}" y="${(mid[1] + mid2[1]) / 2 - 6}" text-anchor="middle" class="dg-ltext">${esc(l.label)}</text>` : "";
    return `<g class="dg-link ${down ? "down" : ""}" data-a="${esc(l.from)}" data-b="${esc(l.to)}" data-k="${k}">
      <path d="${dpath}" fill="none" stroke="${color}" stroke-width="1.6" ${t.dashed || down ? 'stroke-dasharray="6 5"' : ""} marker-end="url(#dg-arr-${mk})" ${l.both ? `marker-start="url(#dg-arr-${mk})"` : ""}/>
      ${!down ? `<path class="dg-flow" d="${dpath}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 15"/>` : ""}
      ${label}</g>`;
  }).join("");
  svg.innerHTML = `<defs>${defs}</defs>${paths}`;
}

/* ---------- Destaque, busca e filtros ---------- */
function focusOn(id) {
  const canvas = $("#dg-canvas");
  if (!canvas || DG.edit || !findNode(id)) return;
  const n = findNode(id);
  const keep = new Set([id, ...neighbors(id).map((x) => x.other)]);
  const ends = new Set([id, ...(n.kind === "item" ? [n.g.id] : (n.g.items || []).map((i) => i.id))]);
  canvas.classList.add("focus");
  canvas.querySelectorAll(".dg-item").forEach((el) => {
    const gid = el.closest(".dg-group").dataset.g;
    el.classList.toggle("hl", keep.has(el.dataset.i) || keep.has(gid));
  });
  canvas.querySelectorAll(".dg-group").forEach((el) => {
    el.classList.toggle("hl", keep.has(el.dataset.g) || !!el.querySelector(".dg-item.hl") || (n.kind === "item" && n.g.id === el.dataset.g));
  });
  canvas.querySelectorAll(".dg-link").forEach((g) => g.classList.toggle("hl", ends.has(g.dataset.a) || ends.has(g.dataset.b)));
}
function clearFocus() {
  const canvas = $("#dg-canvas");
  if (!canvas) return;
  if (DG.sel) return focusOn(DG.sel);
  canvas.classList.remove("focus");
  canvas.querySelectorAll(".hl").forEach((el) => el.classList.remove("hl"));
}
function applyFilters() {
  const canvas = $("#dg-canvas");
  if (!canvas) return;
  const q = plain(DG.query.trim());
  canvas.classList.toggle("searching", !!q || DG.onlyIssues);
  canvas.querySelectorAll(".dg-item").forEach((el) => {
    const it = findNode(el.dataset.i)?.it;
    const text = plain(`${it?.name} ${it?.subtitle}`);
    const okQ = !q || text.includes(q);
    const okI = !DG.onlyIssues || el.classList.contains("st-crit") || el.classList.contains("st-warn");
    el.classList.toggle("match", (!!q || DG.onlyIssues) && okQ && okI);
  });
}
function selectNode(id, center) {
  DG.sel = id;
  render();
  if (center) setTimeout(() => centerOn(id), 30);
}
/* ---------- Diálogos ---------- */
function dlgOpen(html, onReady) {
  const dlg = $("#dlg");
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  dlg.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => dlg.close()));
  onReady && onReady(dlg);
}

function colorPicker(name, value) {
  const custom = String(value).startsWith("#");
  return `<div class="fld wide"><span>Cor</span><div class="swatches">
    ${PALETTE.map(([c, t]) => `<label class="sw" title="${t}"><input type="radio" name="${name}" value="${c}" ${value === c ? "checked" : ""}><i style="background:var(--dg-${c})"></i><span class="sr">${t}</span></label>`).join("")}
    <label class="sw" title="Outra cor"><input type="radio" name="${name}" value="custom" ${custom ? "checked" : ""}><input type="color" name="${name}-hex" value="${custom ? value : "#3b82f6"}" aria-label="Outra cor"></label>
  </div></div>`;
}
const readColor = (f, name) => (f.elements[name].value === "custom" ? f.elements[`${name}-hex`].value : f.elements[name].value);

function groupDialog(gid, newKind) {
  const d = DG.draft, g = gid ? d.groups.find((x) => x.id === gid) : null;
  const kind = g ? g.kind || "items" : newKind;
  dlgOpen(`<form class="dlg-body" id="f-dg">
    <h2>${g ? "Editar grupo" : "Novo grupo"}</h2>
    <div class="form-grid">
      <label class="fld wide"><span>Título</span><input name="title" required value="${esc(g?.title || (kind === "notes" ? "Notas" : kind === "legend" ? "Legenda" : "Novo grupo"))}"></label>
      ${colorPicker("color", g?.color || (kind === "items" ? "blue" : "ink"))}
      ${kind === "items" ? `<label class="fld"><span>Colunas de itens</span><input name="cols" type="number" min="1" max="8" value="${g?.cols || 2}"></label>` : ""}
      ${kind === "notes" ? `<label class="fld wide"><span>Notas (uma por linha)</span><textarea name="notes" rows="7">${esc((g?.notes || []).join("\n"))}</textarea></label>` : ""}
      ${kind === "legend" ? '<p class="small muted wide">A legenda mostra os tipos de ligação automaticamente.</p>' : ""}
    </div>
    <div class="row-actions">
      ${g ? '<button type="button" class="btn danger" data-act="del">Remover grupo</button>' : ""}
      <span style="flex:1"></span><button type="button" class="btn" data-close>Cancelar</button>
      <button class="btn primary" type="submit">${g ? "Aplicar" : "Adicionar"}</button>
    </div></form>`, (dlg) => {
    const f = $("#f-dg");
    f.onsubmit = (e) => {
      e.preventDefault();
      const target = g || { id: uid("g"), kind, x: 40, y: 40, w: kind === "items" ? 480 : 260, items: [] };
      target.title = f.elements.title.value.trim() || "Grupo";
      target.color = readColor(f, "color");
      if (kind === "items") target.cols = Math.min(8, Math.max(1, Number(f.elements.cols.value) || 1));
      if (kind === "notes") target.notes = f.elements.notes.value.split("\n").map((x) => x.trim()).filter(Boolean);
      if (!g) {  // coloca abaixo de tudo, para não cobrir outro grupo
        const canvas = $("#dg-canvas");
        target.y = canvas ? Math.ceil((canvas.offsetHeight - 20) / GRID) * GRID : 40;
        d.groups.push(target);
      }
      markDirty(); dlg.close(); render();
    };
    const del = f.querySelector('[data-act="del"]');
    if (del) del.onclick = () => {
      const ids = new Set([g.id, ...(g.items || []).map((i) => i.id)]);
      if (!confirm(`Remover o grupo ${g.title} e ${g.items?.length || 0} itens?`)) return;
      d.groups = d.groups.filter((x) => x !== g);
      d.links = d.links.filter((l) => !ids.has(l.from) && !ids.has(l.to));
      markDirty(); dlg.close(); render();
    };
  });
}

function itemDialog(gid, iid) {
  const d = DG.draft, g = d.groups.find((x) => x.id === gid);
  const it = iid ? g.items.find((x) => x.id === iid) : null;
  const idx = it ? g.items.indexOf(it) : -1;
  const opts = [["", "Sem status"],
    ...S.data.instances.map((i) => [i.id, `Serviço: ${i.name}`]),
    ...S.data.hosts.map((h) => [h.id, `Host: ${h.name}`])];
  if (it?.link && !opts.some(([v]) => v === it.link)) opts.push([it.link, `${it.link} (não encontrado agora)`]);
  dlgOpen(`<form class="dlg-body" id="f-dg">
    <h2>${it ? "Editar item" : `Novo item em ${esc(g.title)}`}</h2>
    <div class="form-grid">
      <label class="fld"><span>Nome</span><input name="name" required value="${esc(it?.name || "")}"></label>
      <label class="fld"><span>Descrição</span><input name="subtitle" value="${esc(it?.subtitle || "")}"></label>
      <label class="fld wide"><span>Status ao vivo</span><select name="link">${opts.map(([v, t]) => `<option value="${esc(v)}" ${(it?.link || "") === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
        <small>Mostra o ponto verde ou vermelho e abre a página certa ao clicar.</small></label>
      <div class="fld wide"><span>Ícone</span><div class="icon-pick">
        ${Object.keys(DGI).map((k) => `<label title="${k}"><input type="radio" name="icon" value="${k}" ${(it?.icon || "box") === k ? "checked" : ""}><span>${dgIcon(k)}</span></label>`).join("")}
      </div></div>
      ${it ? `<label class="fld"><span>Grupo</span><select name="group">${d.groups.filter((x) => (x.kind || "items") === "items").map((x) => `<option value="${esc(x.id)}" ${x.id === gid ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select></label>
      <div class="fld"><span>Posição no grupo</span><div class="row-actions" style="margin:0">
        <button type="button" class="btn" data-act="up" ${idx <= 0 ? "disabled" : ""}>Mover para antes</button>
        <button type="button" class="btn" data-act="down" ${idx >= g.items.length - 1 ? "disabled" : ""}>Mover para depois</button></div></div>` : ""}
    </div>
    <div class="row-actions">
      ${it ? '<button type="button" class="btn danger" data-act="del">Remover item</button>' : ""}
      <span style="flex:1"></span><button type="button" class="btn" data-close>Cancelar</button>
      <button class="btn primary" type="submit">${it ? "Aplicar" : "Adicionar"}</button>
    </div></form>`, (dlg) => {
    const f = $("#f-dg");
    const read = (target) => {
      target.name = f.elements.name.value.trim() || "Item";
      target.subtitle = f.elements.subtitle.value.trim();
      target.icon = f.elements.icon.value;
      if (f.elements.link.value) target.link = f.elements.link.value; else delete target.link;
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      if (it) {
        read(it);
        const to = f.elements.group.value;
        if (to !== gid) { g.items.splice(g.items.indexOf(it), 1); d.groups.find((x) => x.id === to).items.push(it); }
      } else {
        const n = { id: uid("i") }; read(n); g.items.push(n);
      }
      markDirty(); dlg.close(); render();
    };
    const move = (dir) => { const i = g.items.indexOf(it); const j = i + dir; [g.items[i], g.items[j]] = [g.items[j], g.items[i]]; markDirty(); render(); itemDialog(gid, iid); };
    f.querySelector('[data-act="up"]')?.addEventListener("click", () => move(-1));
    f.querySelector('[data-act="down"]')?.addEventListener("click", () => move(1));
    const del = f.querySelector('[data-act="del"]');
    if (del) del.onclick = () => {
      g.items = g.items.filter((x) => x !== it);
      d.links = d.links.filter((l) => l.from !== it.id && l.to !== it.id);
      markDirty(); dlg.close(); render();
    };
  });
}

function linksDialog() {
  const d = DG.draft, nodes = allNodes(d);
  const sel = (name, v, list) => `<select name="${name}">${list.map(([id, t]) => `<option value="${esc(id)}" ${v === id ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const nodeOpts = nodes.map((n) => [n.id, n.label]), typeOpts = d.types.map((t) => [t.id, t.label]);
  const row = (l, k) => `<tr data-k="${k}"><td>${sel("from", l.from, nodeOpts)}</td><td>${sel("to", l.to, nodeOpts)}</td><td>${sel("type", l.type, typeOpts)}</td>
    <td class="num"><input type="checkbox" name="both" ${l.both ? "checked" : ""} aria-label="Mão dupla"></td><td><input name="label" value="${esc(l.label || "")}" placeholder="opcional"></td>
    <td><button type="button" class="icon-btn" data-act="rm" aria-label="Remover ligação">×</button></td></tr>`;
  dlgOpen(`<form class="dlg-body wide-dlg" id="f-dg">
    <h2>Ligações</h2><p class="small muted">Ligue grupos inteiros ou itens específicos. As setas são desenhadas automaticamente.</p>
    <div class="table-wrap"><table class="tbl-form links-tbl"><thead><tr><th>De</th><th>Para</th><th>Tipo</th><th class="num">Mão dupla</th><th>Rótulo</th><th></th></tr></thead>
      <tbody id="links-body">${d.links.map(row).join("")}</tbody></table></div>
    <div class="row-actions"><button type="button" class="btn" data-act="add">Adicionar ligação</button><span style="flex:1"></span>
      <button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Aplicar</button></div></form>`, (dlg) => {
    const f = $("#f-dg"), body = $("#links-body");
    let n = d.links.length;
    f.querySelector('[data-act="add"]').onclick = () => {
      body.insertAdjacentHTML("beforeend", row({ from: nodes[0]?.id, to: nodes[1]?.id, type: d.types[0]?.id }, n++));
    };
    body.onclick = (e) => { if (e.target.closest('[data-act="rm"]')) e.target.closest("tr").remove(); };
    f.onsubmit = (e) => {
      e.preventDefault();
      const out = [];
      for (const tr of body.querySelectorAll("tr")) {
        const q = (nm) => tr.querySelector(`[name="${nm}"]`);
        if (q("from").value === q("to").value) { toast("Uma ligação não pode ir de um item para ele mesmo", true); return; }
        const l = { from: q("from").value, to: q("to").value, type: q("type").value };
        if (q("both").checked) l.both = true;
        if (q("label").value.trim()) l.label = q("label").value.trim();
        out.push(l);
      }
      d.links = out; markDirty(); dlg.close(); render();
    };
  });
}

function typesDialog() {
  const d = DG.draft;
  const used = new Set(d.links.map((l) => l.type));
  const row = (t) => `<tr data-id="${esc(t.id)}"><td><input name="label" value="${esc(t.label)}" required></td>
    <td><select name="color">${PALETTE.map(([c, n]) => `<option value="${c}" ${t.color === c ? "selected" : ""}>${n}</option>`).join("")}${String(t.color).startsWith("#") ? `<option value="${esc(t.color)}" selected>${esc(t.color)}</option>` : ""}</select></td>
    <td class="num"><input type="checkbox" name="dashed" ${t.dashed ? "checked" : ""} aria-label="Tracejada"></td>
    <td><button type="button" class="icon-btn" data-act="rm" ${used.has(t.id) ? 'disabled title="Em uso por alguma ligação"' : ""} aria-label="Remover tipo">×</button></td></tr>`;
  dlgOpen(`<form class="dlg-body" id="f-dg"><h2>Tipos de ligação</h2><p class="small muted">Aparecem na legenda. Tipos em uso não podem ser removidos.</p>
    <div class="table-wrap"><table class="tbl-form"><thead><tr><th>Nome</th><th>Cor</th><th class="num">Tracejada</th><th></th></tr></thead><tbody id="types-body">${d.types.map(row).join("")}</tbody></table></div>
    <div class="row-actions"><button type="button" class="btn" data-act="add">Adicionar tipo</button><span style="flex:1"></span>
      <button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Aplicar</button></div></form>`, (dlg) => {
    const f = $("#f-dg"), body = $("#types-body");
    f.querySelector('[data-act="add"]').onclick = () => body.insertAdjacentHTML("beforeend", row({ id: uid("t"), label: "Novo tipo", color: "teal", dashed: false }));
    body.onclick = (e) => { const b = e.target.closest('[data-act="rm"]'); if (b && !b.disabled) b.closest("tr").remove(); };
    f.onsubmit = (e) => {
      e.preventDefault();
      d.types = [...body.querySelectorAll("tr")].map((tr) => ({ id: tr.dataset.id, label: tr.querySelector('[name="label"]').value.trim() || "Tipo",
        color: tr.querySelector('[name="color"]').value, dashed: tr.querySelector('[name="dashed"]').checked }));
      markDirty(); dlg.close(); render();
    };
  });
}

function metaDialog() {
  const d = DG.draft;
  dlgOpen(`<form class="dlg-body" id="f-dg"><h2>Título do diagrama</h2><div class="form-grid">
    <label class="fld wide"><span>Título</span><input name="title" value="${esc(d.title || "")}"></label>
    <label class="fld wide"><span>Subtítulo</span><input name="subtitle" value="${esc(d.subtitle || "")}"></label></div>
    <div class="row-actions"><span style="flex:1"></span><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Aplicar</button></div></form>`, (dlg) => {
    $("#f-dg").onsubmit = (e) => { e.preventDefault(); d.title = e.target.elements.title.value.trim(); d.subtitle = e.target.elements.subtitle.value.trim(); markDirty(); dlg.close(); render(); };
  });
}

function addGroupDialog() {
  dlgOpen(`<div class="dlg-body"><h2>Adicionar grupo</h2><div class="type-grid">
    <button class="type-card" data-k="items"><span class="type-ic">${dgIcon("box")}</span><b>Grupo de itens</b><span class="small muted">Serviços, equipamentos ou apps com ícone e status.</span></button>
    <button class="type-card" data-k="notes"><span class="type-ic">${dgIcon("message")}</span><b>Notas</b><span class="small muted">Lista de observações em texto.</span></button>
    <button class="type-card" data-k="legend"><span class="type-ic">${dgIcon("activity")}</span><b>Legenda</b><span class="small muted">Mostra os tipos de ligação.</span></button>
  </div><div class="row-actions"><button class="btn" data-close>Cancelar</button></div></div>`, (dlg) => {
    dlg.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => groupDialog(null, b.dataset.k)));
  });
}

function moreDialog() {
  dlgOpen(`<div class="dlg-body"><h2>Mais opções</h2>
    <div class="row-actions" style="flex-direction:column;align-items:stretch">
      <label class="btn" style="text-align:center">Importar JSON<input type="file" accept="application/json,.json" id="dg-import" hidden></label>
      <button class="btn" data-act="export">Baixar JSON do rascunho</button>
      <button class="btn danger" data-act="reset">Voltar ao diagrama de exemplo</button>
    </div><div class="row-actions"><span style="flex:1"></span><button class="btn" data-close>Fechar</button></div></div>`, (dlg) => {
    $("#dg-import").onchange = async (e) => {
      try {
        const d = JSON.parse(await e.target.files[0].text());
        if (!Array.isArray(d.groups) || !Array.isArray(d.types) || !Array.isArray(d.links)) throw new Error("Arquivo não parece um diagrama");
        DG.draft = d; markDirty(); dlg.close(); render(); toast("Diagrama importado. Confira e salve.");
      } catch (err) { toast(err.message, true); }
    };
    dlg.querySelector('[data-act="export"]').onclick = () => exportJSON(DG.draft);
    dlg.querySelector('[data-act="reset"]').onclick = async () => {
      if (!confirm("Trocar o rascunho pelo diagrama de exemplo? Nada é salvo até você clicar em Salvar.")) return;
      DG.draft = await api("GET", "/api/diagram/default"); markDirty(); dlg.close(); render();
    };
  });
}

function exportJSON(d) {
  hmSave("diagrama-homelab.json", new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
}

/* ---------- Mouse, toque e roda: mover grupos, arrastar o fundo, pinça ---------- */
const vpPoint = (e) => { const r = $("#dg-viewport").getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
document.addEventListener("pointerdown", (e) => {
  if (S.page !== "diagrama" || !e.target.closest?.("#dg-viewport")) return;
  if (e.button > 0) return;
  // editar: arrastar grupo pelo título ou mudar a largura
  if (DG.edit) {
    const handle = e.target.closest(".dg-resize"), head = e.target.closest(".dg-gh");
    if (handle || (head && !e.target.closest("button"))) {
      const el = e.target.closest(".dg-group"), g = DG.draft.groups.find((x) => x.id === el.dataset.g);
      DG.drag = { el, g, mode: handle ? "resize" : "move", sx: e.clientX, sy: e.clientY, x: g.x, y: g.y, w: g.w };
      el.classList.add("is-dragging");
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
  }
  if (e.target.closest(".dg-item, .dg-gh, button")) return;
  // fundo: mover a visão (dois dedos = pinça)
  DG.pointers.set(e.pointerId, vpPoint(e));
  DG.pan = { sx: e.clientX, sy: e.clientY, tx: DG.view.tx, ty: DG.view.ty, moved: false };
  $("#dg-viewport").setPointerCapture(e.pointerId);
  $("#dg-viewport").classList.add("panning");
  e.preventDefault();  // não selecionar texto ao arrastar
});
document.addEventListener("pointermove", (e) => {
  if (DG.drag) {
    const d = DG.drag, dx = (e.clientX - d.sx) / DG.view.s, dy = (e.clientY - d.sy) / DG.view.s;
    const snap = (v) => Math.round(v / GRID) * GRID;
    if (d.mode === "move") {
      d.g.x = Math.max(0, snap(d.x + dx)); d.g.y = Math.max(0, snap(d.y + dy));
      d.el.style.left = `${d.g.x}px`; d.el.style.top = `${d.g.y}px`;
    } else { d.g.w = Math.max(160, snap(d.w + dx)); d.el.style.width = `${d.g.w}px`; }
    drawLinks();
    return;
  }
  if (DG.pointers.has(e.pointerId)) {
    const prev = DG.pointers.get(e.pointerId), now = vpPoint(e);
    if (DG.pointers.size === 2) {                         // pinça
      const other = [...DG.pointers.entries()].find(([k]) => k !== e.pointerId)[1];
      const d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]), d1 = Math.hypot(now[0] - other[0], now[1] - other[1]);
      if (d0 > 0) zoomAt(d1 / d0, (now[0] + other[0]) / 2, (now[1] + other[1]) / 2);
      DG.pan.moved = true;
    } else if (DG.pan) {
      const dx = e.clientX - DG.pan.sx, dy = e.clientY - DG.pan.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) DG.pan.moved = true;
      if (DG.pan.moved) Object.assign(DG.view, { mode: "free", tx: DG.pan.tx + dx, ty: DG.pan.ty + dy }), applyView();
    }
    DG.pointers.set(e.pointerId, now);
  }
});
function endPointer(e) {
  if (DG.drag) {
    const { el, g, x, y, w } = DG.drag;
    el.classList.remove("is-dragging");
    DG.drag = null;
    if (g.x !== x || g.y !== y || g.w !== w) { markDirty(); layoutDiagram(); }
    return;
  }
  if (!DG.pointers.has(e.pointerId)) return;
  DG.pointers.delete(e.pointerId);
  if (DG.pointers.size === 1) {                           // saiu de pinça para arraste com um dedo
    const [, p] = [...DG.pointers.entries()][0];
    const r = $("#dg-viewport").getBoundingClientRect();
    DG.pan = { sx: p[0] + r.left, sy: p[1] + r.top, tx: DG.view.tx, ty: DG.view.ty, moved: true };
    return;
  }
  $("#dg-viewport")?.classList.remove("panning");
  if (DG.pan && !DG.pan.moved && DG.sel && e.type === "pointerup") { DG.sel = null; render(); }  // clique no fundo fecha o painel
  DG.pan = null;
}
document.addEventListener("pointerup", endPointer);
document.addEventListener("pointercancel", endPointer);
document.addEventListener("wheel", (e) => {
  if (S.page !== "diagrama" || !(e.ctrlKey || e.metaKey) || !e.target.closest?.("#dg-viewport")) return;
  e.preventDefault();
  const [px, py] = vpPoint(e);
  zoomAt(Math.exp(-e.deltaY * 0.0025), px, py);
}, { passive: false });

/* destaque ao passar o mouse */
document.addEventListener("pointerover", (e) => {
  if (S.page !== "diagrama" || DG.edit || DG.pan || e.pointerType === "touch") return;
  const node = e.target.closest?.(".dg-item, .dg-gh");
  if (!node) return;
  focusOn(node.dataset.i || node.closest(".dg-group").dataset.g);
});
document.addEventListener("pointerout", (e) => {
  if (S.page !== "diagrama" || DG.edit) return;
  const node = e.target.closest?.(".dg-item, .dg-gh");
  if (node && !node.contains(e.relatedTarget)) clearFocus();
});

/* ---------- Ações ---------- */
document.addEventListener("click", async (e) => {
  if (S.page !== "diagrama") return;
  const b = e.target.closest("[data-dg]");
  const item = e.target.closest(".dg-item"), head = e.target.closest(".dg-gh");
  if (!b && item) {
    const gid = item.closest(".dg-group").dataset.g;
    if (DG.edit) return itemDialog(gid, item.dataset.i);
    return selectNode(DG.sel === item.dataset.i ? null : item.dataset.i);
  }
  if (!b && head && !DG.edit) {
    const gid = head.closest(".dg-group").dataset.g;
    if (findNode(gid)?.g.kind === "items" || !findNode(gid)?.g.kind) return selectNode(DG.sel === gid ? null : gid);
    return;
  }
  if (!b) return;
  const act = b.dataset.dg;
  if (act === "zoom-fit") fitView();
  if (act === "zoom-100") zoomAt(1 / DG.view.s);
  if (act === "zoom-in") zoomAt(1.25);
  if (act === "zoom-out") zoomAt(0.8);
  if (act === "close-drawer") { DG.sel = null; render(); }
  if (act === "goto") selectNode(b.dataset.id, true);
  if (act === "open-page") {
    const n = findNode(DG.sel), st = n?.it && linkStatus(n.it.link);
    if (st) { if (st.host) { S.sel = st.host; localStorage.setItem("hm.sel", st.host); } location.hash = st.page; }
  }
  if (act === "export") exportJSON(DG.data);
  if (act === "edit") { DG.draft = clone(DG.data); DG.edit = true; DG.dirty = false; DG.sel = null; render(); }
  if (act === "discard") {
    if (DG.dirty && !confirm("Descartar as alterações que ainda não foram salvas?")) return;
    DG.edit = false; DG.dirty = false; DG.draft = null; render();
  }
  if (act === "save") {
    try {
      await api("PUT", "/api/diagram", DG.draft);
      DG.data = clone(DG.draft); DG.edit = false; DG.dirty = false; DG.draft = null;
      toast("Diagrama salvo"); render();
    } catch (err) { toast(err.message, true); }
  }
  if (act === "add-group") addGroupDialog();
  if (act === "edit-group") groupDialog(b.dataset.g);
  if (act === "add-item") itemDialog(b.dataset.g);
  if (act === "links") linksDialog();
  if (act === "types") typesDialog();
  if (act === "meta") metaDialog();
  if (act === "more") moreDialog();
});
document.addEventListener("change", (e) => {
  const t = e.target.closest?.("[data-dg]");
  if (!t || S.page !== "diagrama") return;
  if (t.dataset.dg === "issues") { DG.onlyIssues = t.checked; applyFilters(); }
  if (t.dataset.dg === "flow") {
    DG.flow = t.checked; localStorage.setItem("hm.flow", t.checked ? "on" : "off");
    $("#dg-canvas")?.classList.toggle("flow", t.checked);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id !== "dg-search") return;
  DG.query = e.target.value; applyFilters();
});
document.addEventListener("keydown", (e) => {
  if (S.page !== "diagrama") return;
  if (e.target.id === "dg-search" && e.key === "Enter") {
    const first = $("#dg-canvas .dg-item.match");
    if (first) selectNode(first.dataset.i, true);
    return;
  }
  const item = e.target.closest?.(".dg-item, .dg-gh[role=button]");
  if (item && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); item.click(); return; }
  if (e.key === "Escape" && !$("dialog[open]")) {
    if (DG.sel) { DG.sel = null; render(); } else if (DG.query) { DG.query = ""; render(); }
  }
  if (e.target.closest?.("#dg-viewport")) {
    if (e.key === "+" || e.key === "=") zoomAt(1.25);
    if (e.key === "-") zoomAt(0.8);
    if (e.key === "0") fitView();
  }
});
window.addEventListener("beforeunload", (e) => { if (DG.dirty) { e.preventDefault(); e.returnValue = ""; } });
window.addEventListener("resize", () => { if (S.page === "diagrama") layoutDiagram(); });
