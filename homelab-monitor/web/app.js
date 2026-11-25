/* Homelab Monitor — interface (JS puro, sem dependências) */
const $ = (s, el = document) => el.querySelector(s);
const S = {
  data: null, types: null, cfg: null,
  sel: localStorage.getItem("hm.sel") || null,
  range: localStorage.getItem("hm.range") || "6h",
  scope: "host",
  page: location.hash.slice(1) || (localStorage.getItem("hm.launcherHome") === "1" ? "atalhos" : "visao"),
  timer: null,
};

/* ---------- Ícones ---------- */
const P = {
  visao: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  rede: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/><path d="M2 9a14 14 0 0 1 20 0"/>',
  proxmox: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  backups: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
  armazenamento: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  midia: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="m10 9 5 2.5-5 2.5z"/><path d="M8 21h8"/>',
  casa: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  zabbix: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  atalhos: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><path d="M17.25 13.5v7.5M13.5 17.25H21"/>',
  diagrama: '<rect x="2.5" y="3" width="7" height="6" rx="1.2"/><rect x="14.5" y="3" width="7" height="6" rx="1.2"/><rect x="8.5" y="15" width="7" height="6" rx="1.2"/><path d="M6 9v3h12V9M12 12v3"/>',
  assistente: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  nuvem: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4.3 4.3 0 0 1-.5 8.5z"/>',
  servicos: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k] || P.servicos}</svg>`;

// Página → título e tipos de integração que ela mostra
const PAGES = [
  ["visao", "Visão geral", null], ["atalhos", "Atalhos", null], ["diagrama", "Diagrama", null], ["rede", "Rede UniFi", ["unifi"]], ["proxmox", "Proxmox", ["proxmox"]],
  ["backups", "Backups", ["pbs"]], ["armazenamento", "TrueNAS", ["truenas"]], ["midia", "Mídia", ["emby", "jellyfin"]], ["nuvem", "Nextcloud", ["nextcloud"]],
  ["casa", "Casa", ["homeassistant"]], ["zabbix", "Zabbix", ["zabbix"]],
  ["servicos", "Outros serviços", ["http", "tcp"]], ["assistente", "Assistente IA", null], ["config", "Configurações", null],
];
const KIND = { gateway: "Gateway", ap: "Access point", switch: "Switch", proxmox: "Proxmox VE", pbs: "Backup", truenas: "NAS", sbc: "Placa ARM", linux: "Linux" };

/* ---------- Formatação ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v, d = 1) => (v == null || isNaN(v) ? "–" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const money = (v, d) => { const dd = d ?? (Math.abs(v) < 1 ? 3 : 2); return new Intl.NumberFormat("pt-BR", { style: "currency", currency: S.data?.energy?.currency || "BRL", minimumFractionDigits: dd, maximumFractionDigits: dd }).format(v || 0); };
const uptime = (s) => { if (!s) return "–"; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`; };
const ago = (ts) => { if (!ts) return "–"; const s = Date.now() / 1000 - ts; if (s < 90) return "agora"; if (s < 3600) return `há ${Math.round(s / 60)} min`; if (s < 86400) return `há ${Math.round(s / 3600)} h`; return `há ${Math.round(s / 86400)} d`; };
const dtime = (ts) => ts ? new Date(ts * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";
const thr = () => ({ warn: 80, crit: 90 });
const lvl = (v, w = thr().warn, c = thr().crit) => (v == null ? "" : v >= c ? "crit" : v >= w ? "warn" : "");
const bar = (v, cls = "") => `<div class="bar ${cls}"><i class="${lvl(v)}" style="width:${Math.max(0, Math.min(100, v || 0))}%"></i></div>`;
const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const host = (id) => S.data.hosts.find((h) => h.id === id);
const inst = (types) => S.data.instances.filter((i) => types.includes(i.type));
const instHosts = (i) => S.data.hosts.filter((h) => i.host_ids.includes(h.id));
const empty = (t) => `<div class="empty">${t}</div>`;

/* ---------- App Android ---------- */
const IN_APP = typeof window.HMApp !== "undefined";
async function hmSave(name, blob) {
  if (IN_APP) {
    const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1] || ""); fr.readAsDataURL(blob); });
    window.HMApp.saveFile(name, blob.type || "application/octet-stream", b64);
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
if (IN_APP) document.documentElement.classList.add("in-app");

/* ---------- API ---------- */
async function api(method, url, body) {
  const headers = { "Content-Type": "application/json" };
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store", credentials: "same-origin" });
  if (r.status === 401 && !url.startsWith("/api/account")) {
    location.replace(`/login.html?next=${encodeURIComponent("/" + location.hash)}`);
    throw new Error("Sessão expirada");
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 403 && data.enroll) { showEnrollScreen(); throw new Error(data.detail); }
  if (!r.ok) throw new Error(data.detail || `${r.status} em ${url}`);
  return data;
}
async function load() {
  try {
    if (!S.me) {
      const st = await api("GET", "/api/auth/status");
      if (!st.user) { location.replace(`/login.html?next=${encodeURIComponent("/" + location.hash)}`); return; }
      S.me = st.user; S.authMode = st.mode;
      if (st.must_enroll) { showEnrollScreen(); return; }
      if (sessionStorage.getItem("hm.recoveryUsed")) {
        sessionStorage.removeItem("hm.recoveryUsed");
        setTimeout(() => toast("Você entrou com um código de recuperação. Gere códigos novos em Minha conta.", true), 800);
      }
    }
    [S.data, S.ai] = await Promise.all([api("GET", "/api/state"), api("GET", "/api/ai/status").catch(() => null)]);
    if (!S.sel || !host(S.sel)) S.sel = (S.data.hosts.find((h) => h.kind === "proxmox") || S.data.hosts[0] || {}).id;
    const busyDiagram = (S.page === "diagrama" && (DG.edit || DG.pan || DG.drag || document.activeElement?.id === "dg-search"))
      || (S.page === "atalhos" && (LC.edit || document.activeElement?.id === "lc-search"))
      || (S.page === "proxmox" && (document.activeElement?.classList?.contains("pv-q") || document.activeElement?.id === "pv-logq"))
      || !!document.activeElement?.closest?.("[data-x-q]");
    if (!$("dialog[open]") && !busyDiagram) render();
    $("#stamp").textContent = `atualizado ${new Date(S.data.updated * 1000).toLocaleTimeString("pt-BR")}`;
  } catch (e) {
    $("#stamp").textContent = `sem conexão com a API (${e.message})`;
  }
}
function schedule() {
  clearInterval(S.timer);
  if ($("#auto").checked) S.timer = setInterval(() => { if (!["config", "assistente"].includes(S.page) && !(S.page === "diagrama" && DG.edit)) load(); }, Math.max(10, S.data?.poll || 30) * 1000);
}

/* ---------- Componentes ---------- */
function gauge(v, label, sub, max = 100, unit = "%") {
  const r = 50, c = 2 * Math.PI * r, arc = c * 0.75;
  const has = v != null && !isNaN(v);
  const f = has ? Math.max(0, Math.min(1, v / max)) : 0;
  const col = unit === "°C" ? (v >= 80 ? "var(--crit)" : v >= 70 ? "var(--warn)" : "var(--s2)") : (v >= 90 ? "var(--crit)" : v >= 80 ? "var(--warn)" : "var(--accent)");
  return `<div class="gauge" role="img" aria-label="${esc(label)} ${has ? num(v) + unit : "sem dados"}">
    <svg viewBox="0 0 140 128">
      <circle cx="70" cy="70" r="${r}" fill="none" style="stroke:var(--surface-2)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${arc} ${c}" transform="rotate(135 70 70)"/>
      ${has ? `<circle cx="70" cy="70" r="${r}" fill="none" style="stroke:${col}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${Math.max(0.01, arc * f)} ${c}" transform="rotate(135 70 70)"/>` : ""}
      <text x="70" y="78" text-anchor="middle" font-size="27" font-weight="600" style="fill:var(--ink);font-family:var(--font)">${has ? num(v, 0) : "–"}<tspan font-size="13" style="fill:var(--muted)" dx="2">${has ? unit : ""}</tspan></text>
    </svg><div class="lbl">${esc(label)}</div><div class="sub">${sub || ""}</div></div>`;
}

function unitCard(h) {
  const hot = h.status !== "online" ? "offline" : (h.disk >= 90 || h.mem >= 95 || h.temp >= 80 ? "warn" : "");
  const tags = [];
  if (h.disk >= 90) tags.push(`<span class="tag crit">disco ${num(h.disk, 0)}%</span>`);
  tags.push(h.demo ? `<span class="tag demo">demo</span>` : (h.badges || []).slice(0, 1).map((b) => `<span class="tag">${esc(b)}</span>`).join(""));
  const cell = (lbl, v, unit = "%") => `<div class="mini">${lbl} <b>${v == null ? "–" : num(v, unit ? 0 : 1) + unit}</b>${unit === "%" ? bar(v) : ""}</div>`;
  const third = h.disk != null ? cell("Disco", h.disk) : h.temp != null ? cell("Temp", h.temp, "°C") : cell("Carga", h.load, "");
  return `<button class="unit ${hot} ${h.id === S.sel ? "on" : ""}" data-host="${esc(h.id)}">
    <div class="unit-name"><span class="dot ${h.status}"></span><span>${esc(h.name)}</span></div>
    <div class="unit-tags">${tags.join("")}</div>
    <div class="unit-os">${esc(h.os || KIND[h.kind] || h.kind)}${h.ip ? " · " + esc(h.ip) : ""}</div>
    ${h.status === "online"
      ? `<div class="unit-bars">${cell("CPU", h.cpu)}${cell("RAM", h.mem)}${third}</div>
         <div class="unit-foot"><span>${h.cores ? num(h.cores, 0) + " núcleos" : esc(h.note || "")}${h.temp != null && h.disk != null ? " · " + num(h.temp, 0) + " °C" : ""}</span><span>↑ ${uptime(h.uptime)}</span></div>`
      : `<div class="unit-err">${esc(h.note || "Sem resposta")}</div>`}
  </button>`;
}

function evList(evs, limit = 40) {
  if (!evs.length) return empty("Tudo certo por aqui. Nenhum alerta ativo.");
  const ic = { crit: "!", warn: "▲", info: "i" };
  return `<div class="feed">${evs.slice(0, limit).map((e) =>
    `<div class="ev ${e.level}"><div class="ev-ic">${ic[e.level] || "i"}</div><div><b>${esc(e.title)}</b><span>${esc(e.detail)}</span></div></div>`).join("")}</div>`;
}

let chartSeq = 0;
function chartBox(specs, opts = {}) {
  const id = `ch-${++chartSeq}`;
  setTimeout(() => drawHistory(id, specs, opts), 0);
  return `<div class="legend">${specs.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div>
    <div class="chart-wrap ${opts.tall ? "tall" : ""}"><canvas id="${id}"></canvas></div>`;
}

/* ---------- Gráfico em canvas ---------- */
const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
async function drawHistory(id, specs, opts) {
  const cv = document.getElementById(id);
  if (!cv) return;
  let h;
  try { h = opts.data ? await opts.data : await api("GET", `/api/history?range=${S.range}&keys=${specs.map((s) => encodeURIComponent(s.key)).join(",")}`); }
  catch (e) { const c = document.getElementById(id); if (c) c.closest(".chart-wrap").insertAdjacentHTML("beforeend", `<div class="chart-err">${esc(e.message)}</div>`); return; }
  const series = specs.map((s) => ({ ...s, pts: h.series[s.key] || [] }));
  const now = Date.now() / 1000;
  const draw = (hoverX) => {
    if (!document.body.contains(cv)) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    const right = series.some((s) => s.axis === "right");
    const maxOf = (ax) => { const vs = series.filter((s) => (s.axis || "left") === ax).flatMap((s) => s.pts.map((p) => p[1])); return vs.length ? Math.max(...vs) : 0; };
    const lmax = opts.leftMax ?? niceMax(maxOf("left") * 1.1), rmax = opts.rightMax ?? niceMax(maxOf("right") * 1.1);
    ctx.font = `11px ${cssv("--font")}`;
    const lw = ctx.measureText(num(lmax, lmax < 10 ? 1 : 0)).width, rw = right ? ctx.measureText(num(rmax, rmax < 10 ? 1 : 0)).width : 0;
    const pad = { l: Math.max(40, lw + 14), r: right ? Math.max(44, rw + 14) : 10, t: 8, b: 22 };   // eixo cabe números grandes
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const x = (t) => pad.l + ((t - h.since) / (now - h.since)) * pw;
    const y = (v, ax) => pad.t + ph - (v / (ax === "right" ? rmax : lmax)) * ph;
    ctx.font = `11px ${cssv("--font")}`; ctx.fillStyle = cssv("--muted"); ctx.strokeStyle = cssv("--line"); ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = Math.round(pad.t + (ph * i) / 4) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText(num(lmax * (1 - i / 4), lmax < 10 ? 1 : 0), pad.l - 6, yy + 4);
      if (right) { ctx.textAlign = "left"; ctx.fillText(num(rmax * (1 - i / 4), rmax < 10 ? 1 : 0), W - pad.r + 6, yy + 4); }
    }
    const span = now - h.since, long = span > 2 * 86400;
    ctx.textAlign = "center";
    for (let i = 0; i <= 6; i++) {
      const t = h.since + (span * i) / 6, d = new Date(t * 1000);
      const lbl = long ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      ctx.fillText(lbl, Math.min(W - pad.r - 14, Math.max(pad.l + 14, x(t))), H - 6);
    }
    let isEmpty = true;
    const gapMax = Math.max(h.bucket, S.data.poll) * 3;
    for (const s of series) {
      if (s.pts.length < 2) continue;
      isEmpty = false;
      const ax = s.axis || "left";
      if (s.fill) {
        ctx.beginPath(); ctx.moveTo(x(s.pts[0][0]), pad.t + ph);
        for (const [t, v] of s.pts) ctx.lineTo(x(t), y(v, ax));
        ctx.lineTo(x(s.pts.at(-1)[0]), pad.t + ph); ctx.closePath();
        ctx.globalAlpha = 0.12; ctx.fillStyle = s.color; ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      let prev = null;
      for (const [t, v] of s.pts) {
        if (!prev || t - prev > gapMax) ctx.moveTo(x(t), y(v, ax)); else ctx.lineTo(x(t), y(v, ax));
        prev = t;
      }
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.lineJoin = "round"; ctx.stroke();
    }
    if (isEmpty) { ctx.textAlign = "center"; ctx.fillStyle = cssv("--muted"); ctx.font = `13px ${cssv("--font")}`; ctx.fillText("Coletando histórico… os pontos aparecem a cada ciclo.", pad.l + pw / 2, pad.t + ph / 2); }
    const tip = $("#tip");
    if (hoverX != null && !isEmpty && hoverX >= pad.l && hoverX <= W - pad.r) {
      const t = h.since + ((hoverX - pad.l) / pw) * span;
      ctx.strokeStyle = cssv("--muted"); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(hoverX, pad.t); ctx.lineTo(hoverX, pad.t + ph); ctx.stroke(); ctx.setLineDash([]);
      const rows = series.map((s) => {
        let best = null;
        for (const p of s.pts) if (!best || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
        return best && Math.abs(best[0] - t) < h.bucket * 2 ? `${esc(s.label)}: <b>${num(best[1])}${s.unit || ""}</b>` : null;
      }).filter(Boolean);
      const r = cv.getBoundingClientRect();
      tip.innerHTML = `${dtime(t)}<br>${rows.join("<br>")}`;
      tip.style.left = `${r.left + hoverX + scrollX}px`; tip.style.top = `${r.top + pad.t + scrollY}px`; tip.style.display = rows.length ? "block" : "none";
    } else tip.style.display = "none";
  };
  draw();
  cv.onmousemove = (e) => draw(e.offsetX);
  cv.onmouseleave = () => draw();
  cv._redraw = draw;
}

/* ---------- Visão geral ---------- */
function pageOverview() {
  const d = S.data, e = d.energy, h = host(S.sel) || {};
  const online = d.hosts.filter((x) => x.status === "online");
  const avg = (f) => { const v = online.map((x) => x[f]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const fleet = S.scope === "fleet";
  const g = fleet ? { cpu: avg("cpu"), mem: avg("mem"), disk: avg("disk") } : h;
  const s1 = cssv("--s1"), s2 = cssv("--s2"), s3 = cssv("--s3");
  const net = inst(["unifi"])[0];
  return `<div class="grid-overview">
    <section class="col">
      <div class="panel"><div class="panel-head"><h2>Frota</h2><span class="muted">${online.length} de ${d.hosts.length} online</span></div>
        <div class="fleet">${d.hosts.map(unitCard).join("") || empty('Nenhum host. <a href="#config">Adicione um serviço</a>.')}</div></div>
    </section>
    <section class="col">
      <div class="panel">
        <div class="panel-head"><h2>Energia agora</h2><span class="muted">${e.measured ? "medido no Home Assistant" : "estimado pela carga"} · tarifa ${money(e.tariff, 2)}/kWh</span>${S.ai?.allowed ? '<button class="btn ai-btn" data-ai-task="consumo">Analisar com IA</button>' : ""}</div>
        <div class="burn">
          <div class="burn-now"><div><span class="big">${money(e.per_hour)}</span><span class="unit-l">/h</span></div>
            <div class="small muted">${num(e.watts, 0)} W agora · ${money(e.per_month, 2)} por mês neste ritmo</div></div>
          <div class="burn-box"><span class="small muted">Hoje</span><b>${money(e.today.cost, 2)}</b><span class="small muted">${num(e.today.kwh, 2)} kWh</span></div>
          <div class="burn-box"><span class="small muted">7 dias</span><b>${money(e.d7.cost, 2)}</b><span class="small muted">${num(e.d7.kwh, 1)} kWh</span></div>
          <div class="burn-box"><span class="small muted">30 dias</span><b>${money(e.d30.cost, 2)}</b><span class="small muted">${num(e.d30.kwh, 1)} kWh</span></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>${fleet ? "Média da frota" : esc(h.name || "Host")}</h2>
          ${!fleet && h.kind ? `<span class="tag">${esc(KIND[h.kind] || h.kind)}</span>` : ""}
          <div class="seg" style="margin-left:auto" id="scope"><button data-s="host" class="${!fleet ? "on" : ""}">Este host</button><button data-s="fleet" class="${fleet ? "on" : ""}">Frota toda</button></div></div>
        <div class="gauges">
          ${gauge(g.cpu, "CPU", fleet ? `${online.length} hosts` : (h.load != null ? `carga ${num(h.load, 2)}` : h.cores ? `${num(h.cores, 0)} núcleos` : ""))}
          ${gauge(g.mem, "RAM", fleet ? "" : esc(h.mem_text || ""))}
          ${g.disk != null || fleet ? gauge(g.disk, "Disco", fleet ? "" : esc(h.disk_text || "")) : ""}
          ${!fleet && h.temp != null ? gauge(h.temp, "Temperatura", "", 100, "°C") : ""}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>${fleet ? "Consumo e rede" : "Uso ao longo do tempo"}</h2><span class="muted">últimas ${S.range}</span></div>
        ${fleet
          ? chartBox([{ key: "power.w", label: "Potência", unit: " W", color: s2, fill: true },
              ...(net ? [{ key: `${net.id}.wan.rx`, label: "WAN download", unit: " Mbps", color: s1, axis: "right" }] : [])])
          : h.id ? chartBox([
              { key: `${h.id}.cpu`, label: "CPU %", unit: "%", color: s1, fill: true },
              { key: `${h.id}.mem`, label: "RAM %", unit: "%", color: s3 },
              ...(h.temp != null ? [{ key: `${h.id}.temp`, label: "Temp °C", unit: " °C", color: s2, axis: "right" }] : []),
            ], { leftMax: 100, rightMax: 100 }) : empty("Selecione um host.")}
      </div>
      <div class="panel"><div class="panel-head"><h2>Serviços</h2></div>
        <div class="apps">${d.apps.map((a) => `<div class="app-tile"><div class="head"><span class="dot ${a.status}"></span>${esc(a.name)}${a.version ? `<span class="tag">${esc(a.version)}</span>` : ""}</div>
          <div class="small muted" style="margin-top:4px">${esc(a.summary || "")}</div></div>`).join("") || empty('Nenhum serviço de aplicação. <a href="#config">Adicionar</a>')}</div></div>
    </section>
    <section class="col">
      <div class="panel"><div class="panel-head"><h2>Alertas e avisos</h2><span class="muted">${d.events.length} ativos</span></div>${evList(d.events)}
        ${S.ai?.allowed ? '<div class="row-actions"><button class="btn ai-btn" data-ai-task="melhorias">Pedir sugestões de melhoria à IA</button></div>' : ""}</div>
      <div class="panel"><div class="panel-head"><h2>Quem está gastando</h2><span class="muted">por mês</span></div>
        ${e.breakdown.length ? e.breakdown.map((r) => `<div class="cost-row"><div class="cost-top"><b>${esc(r.name)}</b><span>${money(r.month, 2)}</span></div>
          ${bar(r.share)}<div class="small muted">${num(r.share, 0)}% · ${num(r.watts, 0)} W</div></div>`).join("") : empty('Defina o consumo por tipo em <a href="#config">Configurações › Energia</a>.')}
      </div>
    </section>
  </div>`;
}

/* ---------- Páginas por tipo (uma seção por instância) ---------- */
const sectionTitle = (i, many) => many ? `<h2 class="inst-title"><span class="dot ${i.ok ? "online" : "offline"}"></span>${esc(i.name)}</h2>` : "";
const instError = (i) => !i.ok && i.error ? `<div class="banner err">${esc(i.name)}: ${esc(i.error)}</div>` : "";

function vRede(i) {
  const u = i.details, w = u.wan || {}, hs = instHosts(i);
  return `<div class="stats">
      <div class="stat"><b>${num(w.rx_mbps)} <small>Mbps</small></b><span>Download agora</span></div>
      <div class="stat"><b>${num(w.tx_mbps)} <small>Mbps</small></b><span>Upload agora</span></div>
      <div class="stat"><b>${w.latency != null ? num(w.latency, 0) + " ms" : "–"}</b><span>Latência ${esc(w.isp || "")}</span></div>
      <div class="stat"><b>${num(u.clients, 0)}</b><span>Clientes${u.wifi_clients != null ? ` · ${u.wifi_clients} Wi-Fi, ${u.wired_clients} cabo` : ""}</span></div>
    </div>
    <div class="panel"><div class="panel-head"><h2>Tráfego da WAN</h2><span class="muted">${esc(u.gateway || "")}</span></div>
      ${chartBox([{ key: `${i.id}.wan.rx`, label: "Download", unit: " Mbps", color: cssv("--s1"), fill: true }, { key: `${i.id}.wan.tx`, label: "Upload", unit: " Mbps", color: cssv("--s2") }, { key: `${i.id}.wan.latency`, label: "Latência", unit: " ms", color: cssv("--s3"), axis: "right" }], { tall: true })}</div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><h2>Dispositivos</h2></div><div class="fleet">${hs.map(unitCard).join("") || empty("Nenhum dispositivo.")}</div></div>
      <div class="panel"><div class="panel-head"><h2>Access points</h2></div>
        <div class="table-wrap"><table><thead><tr><th>AP</th><th class="num">Clientes</th><th>Rádios (retransmissão)</th></tr></thead><tbody>
        ${(u.aps || []).map((a) => `<tr><td><span class="dot ${a.online ? "online" : "offline"}"></span> ${esc(a.name)} <span class="muted small">${esc(a.model)}</span></td>
          <td class="num">${num(a.clients, 0)}</td><td>${(a.radios || []).map((r) => `<span class="tag ${lvl(r.retries, 10, 20)}">${r.band} GHz · ${num(r.retries)}%</span>`).join(" ")}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Nenhum AP encontrado.</td></tr>'}
        </tbody></table></div>
        ${(u.aps || []).length ? chartBox((u.aps || []).map((a, k) => ({ key: `${hs.find((h) => h.name === a.name)?.id}.clients`, label: a.name, color: cssv(`--s${(k % 4) + 1}`) }))) : ""}</div>
    </div>`;
}

function vProxmox(i) {
  const p = i.details, nodes = instHosts(i);
  return `<div class="stats">
      <div class="stat"><b>${nodes.filter((n) => n.status === "online").length}/${nodes.length}</b><span>Nós online</span></div>
      <div class="stat"><b>${num(p.running, 0)}/${num(p.total, 0)}</b><span>VMs e LXC rodando</span></div>
      ${nodes.slice(0, 2).map((n) => `<div class="stat"><b>${num(n.cpu, 0)}% · ${num(n.mem, 0)}%</b><span>CPU · RAM em ${esc(n.name)}</span></div>`).join("")}
    </div>
    <div class="panel"><div class="panel-head"><h2>VMs e containers</h2><span class="muted">ordenados por CPU</span></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Nome</th><th>Tipo</th><th>Nó</th><th>CPU</th><th>RAM</th><th>Disco</th><th class="num">Uptime</th></tr></thead><tbody>
      ${(p.guests || []).map((g) => `<tr><td>${g.vmid}</td><td><span class="dot ${g.status === "running" ? "online" : ""}"></span> ${esc(g.name)}</td><td><span class="tag">${g.type}</span></td><td>${esc(g.node)}</td>
        <td class="cellbar">${g.status === "running" ? `<small>${num(g.cpu)}% de ${g.cores}</small>${bar(g.cpu)}` : "<small>parada</small>"}</td>
        <td class="cellbar">${g.mem != null ? `<small>${esc(g.mem_text)}</small>${bar(g.mem)}` : "–"}</td>
        <td class="cellbar">${g.disk != null ? `<small>${num(g.disk, 0)}%</small>${bar(g.disk)}` : "–"}</td>
        <td class="num">${uptime(g.uptime)}</td></tr>`).join("") || '<tr><td colspan="8" class="muted">Nenhuma VM ou container.</td></tr>'}
      </tbody></table></div></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><h2>Storages</h2></div>
        ${(p.storages || []).map((s) => `<div class="store-row"><div class="cost-top"><b>${esc(s.name)} <span class="tag">${esc(s.type)}</span></b><span class="muted">${esc(s.text)}</span></div>${bar(s.used, "thick")}</div>`).join("") || empty("Nenhum storage.")}</div>
      <div class="panel"><div class="panel-head"><h2>Carga dos nós</h2></div>
        ${nodes.length ? chartBox(nodes.flatMap((n, k) => [{ key: `${n.id}.cpu`, label: `${n.name} CPU`, unit: "%", color: cssv(`--s${(k * 2) % 4 + 1}`), fill: k === 0 }, { key: `${n.id}.mem`, label: `${n.name} RAM`, unit: "%", color: cssv(`--s${(k * 2 + 1) % 4 + 1}`) }]), { leftMax: 100 }) : empty("Sem nós.")}</div>
    </div>`;
}

function vBackups(i) {
  const b = i.details;
  const st = (s) => (s === "OK" ? "ok" : s === "rodando" ? "" : String(s).startsWith("WARNINGS") ? "warn" : "crit");
  return `<div class="stats">
      <div class="stat"><b>${num(b.ok_24h, 0)}</b><span>Backups OK em 24 h</span></div>
      <div class="stat"><b style="color:${b.failed_24h ? "var(--crit)" : "inherit"}">${num(b.failed_24h, 0)}</b><span>Falhas em 24 h</span></div>
      <div class="stat"><b>${ago(b.last_ok)}</b><span>Último backup OK</span></div>
    </div>
    <div class="panel"><div class="panel-head"><h2>Datastores</h2></div>
      ${(b.datastores || []).map((s) => `<div class="store-row"><div class="cost-top"><b>${esc(s.name)}</b><span class="muted">${esc(s.text)}</span></div>${bar(s.used, "thick")}
        <div class="small muted" style="margin-top:4px">${num(s.used)}% usado${s.full_date ? ` · cheio por volta de ${new Date(s.full_date * 1000).toLocaleDateString("pt-BR")}` : ""}</div></div>`).join("") || empty("Nenhum datastore.")}</div>
    <div class="panel"><div class="panel-head"><h2>Tarefas dos últimos 7 dias</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Alvo</th><th>Início</th><th class="num">Duração</th><th>Resultado</th></tr></thead><tbody>
      ${(b.tasks || []).map((t) => `<tr><td>${esc(t.type)}</td><td>${esc(t.target)}</td><td>${dtime(t.start)}</td><td class="num">${t.end ? uptime(t.end - t.start) : "–"}</td><td><span class="tag ${st(t.status)}">${esc(t.status)}</span></td></tr>`).join("") || '<tr><td colspan="5" class="muted">Nenhuma tarefa no período.</td></tr>'}
      </tbody></table></div></div>`;
}

function vTrueNAS(i) {
  const t = i.details, h = instHosts(i)[0] || {};
  return `<div class="grid-2">
      <div class="panel"><div class="panel-head"><h2>Pools ZFS</h2><span class="muted">TrueNAS ${esc(t.version || "")} · API ${esc(t.api || "")}</span></div>
        ${(t.pools || []).map((p) => `<div class="store-row"><div class="cost-top"><b><span class="dot ${p.healthy ? "online" : "offline"}"></span> ${esc(p.name)} <span class="tag ${p.status === "ONLINE" ? "ok" : "crit"}">${esc(p.status)}</span></b><span class="muted">${esc(p.text)}</span></div>
          ${bar(p.used, "thick")}<div class="small muted" style="margin-top:4px">${num(p.used)}% usado · último ${esc((p.scan || "scrub").toLowerCase())}: ${esc((p.scan_state || "–").toLowerCase())}${p.scan_errors ? ` · ${p.scan_errors} erros` : ""}</div></div>`).join("") || empty("Nenhum pool.")}</div>
      <div class="panel"><div class="panel-head"><h2>Sistema</h2></div><div class="gauges">${gauge(h.cpu, "CPU", h.cores ? `${h.cores} núcleos` : "")}${gauge(h.mem, "RAM", "inclui cache ZFS (ARC)")}${h.temp != null ? gauge(h.temp, "Temperatura", "", 100, "°C") : ""}</div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><h2>Alertas do TrueNAS</h2></div>
        ${evList((t.alerts || []).map((a) => ({ level: ["CRITICAL", "ERROR", "ALERT", "EMERGENCY"].includes(a.level) ? "crit" : a.level === "WARNING" ? "warn" : "info", title: a.level, detail: a.text })))}</div>
      <div class="panel"><div class="panel-head"><h2>Apps</h2></div>
        ${(t.apps || []).length ? `<div class="apps">${t.apps.map((a) => `<div class="app-tile"><div class="head"><span class="dot ${a.state === "RUNNING" ? "online" : "offline"}"></span>${esc(a.name)}</div><div class="small muted">${esc(a.state)}</div></div>`).join("")}</div>` : empty("Nenhum app instalado.")}</div>
    </div>`;
}

function vEmby(i) {
  const e = i.details, c = e.counts || {};
  return `<div class="stats">
      <div class="stat"><b>${num((e.sessions || []).length, 0)}</b><span>Reproduzindo agora</span></div>
      <div class="stat"><b>${num(e.transcoding, 0)}</b><span>Transcodificando</span></div>
      <div class="stat"><b>${num(c.MovieCount, 0)}</b><span>Filmes</span></div>
      <div class="stat"><b>${num(c.SeriesCount, 0)}</b><span>Séries · ${num(c.EpisodeCount, 0)} episódios</span></div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><h2>Sessões</h2><span class="muted">${esc(e.server || "")} · ${esc(e.version || "")}</span></div>
        ${(e.sessions || []).map((s) => `<div class="session"><div><b>${esc(s.title)}</b><div class="small muted">${esc(s.user)} · ${esc(s.client)} em ${esc(s.device)}${s.transcode_reason ? " · " + esc(s.transcode_reason) : ""}</div></div>
          <div><span class="tag ${s.method === "Transcode" ? "warn" : "ok"}">${s.method === "Transcode" ? "Transcode" : "Direto"}</span>${s.paused ? ' <span class="tag">pausado</span>' : ""}</div>${bar(s.progress)}</div>`).join("") || empty("Ninguém assistindo agora.")}</div>
      <div class="panel"><div class="panel-head"><h2>Streams ao longo do tempo</h2></div>
        ${chartBox([{ key: `${i.id}.streams`, label: "Streams", color: cssv("--s1"), fill: true }, { key: `${i.id}.transcodes`, label: "Transcodes", color: cssv("--s2") }])}</div>
    </div>`;
}

const BULB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';
const PLUG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/></svg>';
const sinceTxt = (x) => x.unavailable ? "indisponível" : x.on ? (x.since ? `acesa ${ago(x.since)}` : "acesa") : "apagada";

function houseStats(i, h) {
  return `<div class="stat"><b>${num(h.power, 0)} <small>W</small></b><span>Tomadas agora</span></div>
    <div class="stat"><b>${h.lights_on} <small>de ${h.lights_total}</small></b><span>Luzes acesas</span></div>
    <div class="stat"><b>${money(h.cost.today, 2)}</b><span>Tomadas hoje · ${num(h.kwh.today, 2)} kWh</span></div>
    <div class="stat"><b>${money(h.cost.d30, 2)}</b><span>Últimos 30 dias · ${num(h.kwh.d30, 0)} kWh</span></div>`;
}

function houseRooms(h) {
  if (!h.rooms.length) return empty("Nenhum cômodo com luzes ou tomadas. Confira as áreas no Home Assistant ou a lista de cômodos em Configurações.");
  return h.rooms.map((r) => `<section class="room">
    <header class="room-head"><h2>${esc(r.name)}</h2><span class="muted small">${r.plugs.length ? `${num(r.power, 0)} W` : ""}${r.plugs.length && r.lights.length ? " · " : ""}${r.lights.length ? `${r.lights_on ? r.lights_on + (r.lights_on > 1 ? " luzes acesas" : " luz acesa") : "luzes apagadas"}` : ""}</span></header>
    ${r.lights.map((x) => `<div class="dev ${x.on ? "is-on" : ""} ${x.unavailable ? "is-down" : ""}">
      <span class="dev-ic light">${BULB}</span><span class="dev-name">${esc(x.name)}</span>
      <span class="dev-val small">${sinceTxt(x)}${x.on && x.brightness != null ? ` · ${x.brightness}%` : ""}</span></div>`).join("")}
    ${r.plugs.map((p) => `<div class="dev plug ${p.on ? "is-on" : ""} ${p.unavailable ? "is-down" : ""}">
      <span class="dev-ic">${PLUG}</span>
      <span class="dev-name">${esc(p.name)}${p.rack ? ' <span class="tag">homelab</span>' : ""}</span>
      <span class="dev-val"><b>${p.unavailable ? "–" : num(p.power, 0)}</b> W</span>
      <span class="dev-sub small muted">${p.unavailable ? "indisponível" : p.on ? "ligada" : "desligada"} · hoje ${money(p.cost.today, 2)} · 30 dias ${money(p.cost.d30, 2)}${p.measured === "estimado" ? " (estimado)" : ""}</span></div>`).join("")}
  </section>`).join("");
}

/* ---------- Câmeras (Frigate pelo Home Assistant) ---------- */
const CAM_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
const camImagesAllowed = (h) => h.camera_cfg?.view === "image" && (h.camera_cfg.images_for !== "admin" || S.me?.role === "admin");
const camShowImages = (h) => camImagesAllowed(h) && localStorage.getItem("hm.camview") !== "status";
const camUrl = (iid, cam, w = 640) => `/api/camera/${encodeURIComponent(iid)}/${encodeURIComponent(cam.id)}?w=${w}&t=${Date.now()}`;

function camMeta(c) {
  const PT = { person: ["pessoa", "pessoas"], car: ["carro", "carros"], dog: ["cachorro", "cachorros"], cat: ["gato", "gatos"],
    bicycle: ["bicicleta", "bicicletas"], motorcycle: ["moto", "motos"], bird: ["pássaro", "pássaros"], package: ["pacote", "pacotes"] };
  const objs = Object.entries(c.objects || {}).map(([k, n]) => `<span class="tag warn">${n} ${esc(PT[k] ? PT[k][n > 1 ? 1 : 0] : k)}</span>`).join(" ");
  return `<span class="dot ${c.online ? "online" : "offline"}"></span><b>${esc(c.name)}</b>
    <span class="cam-tags">${c.online ? "" : '<span class="tag crit">offline</span>'}${c.motion ? '<span class="tag ok">movimento</span>' : ""}${objs}</span>
    <span class="small muted cam-sub">${c.online ? `${c.fps != null ? `${num(c.fps, 0)} fps` : "online"}${c.recordings === "off" ? " · sem gravar" : ""}${c.detect === "off" ? " · detecção desligada" : ""}` : esc(c.state === "não encontrada" ? "entidade não encontrada" : `desde ${ago(c.since)}`)}</span>`;
}

function camerasPanel(i, h) {
  const cams = h.cameras || [];
  if (!cams.length || h.camera_cfg?.view === "off") return "";
  const imgs = camShowImages(h), off = cams.filter((c) => !c.online).length;
  return `<div class="panel cams-panel"><div class="panel-head"><h2>Câmeras</h2>
      <span class="muted">${cams.length - off} de ${cams.length} online · Frigate</span>
      ${camImagesAllowed(h) ? `<div class="seg" style="margin-left:auto" role="group" aria-label="Exibição das câmeras">
        <button data-camview="image" class="${imgs ? "on" : ""}">Imagens</button><button data-camview="status" class="${imgs ? "" : "on"}">Só status</button></div>` : ""}</div>
    <div class="cams ${imgs ? "with-img" : "status-only"}" id="cams-${esc(i.id)}" data-iid="${esc(i.id)}" data-refresh="${h.camera_cfg.refresh}">
      ${cams.map((c) => imgs
        ? `<button class="cam" data-cam="${esc(c.id)}" aria-label="Ampliar ${esc(c.name)}">
             <span class="cam-img ${c.online ? "" : "is-off"}"><img alt="" data-cam-img="${esc(c.id)}"><span class="cam-ph">${c.online ? "Carregando…" : "Sem imagem"}</span></span>
             <span class="cam-meta" data-cam-meta="${esc(c.id)}">${camMeta(c)}</span></button>`
        : `<div class="cam-tile ${c.online ? "" : "is-off"}"><span class="cam-ic">${CAM_IC}</span><span class="cam-meta" data-cam-meta="${esc(c.id)}">${camMeta(c)}</span></div>`).join("")}
    </div></div>`;
}

/* Troca a imagem só depois de baixada (sem piscar) e só com a página visível */
async function camLoad(img, url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error();
    const u = URL.createObjectURL(await r.blob());
    if (img._u) URL.revokeObjectURL(img._u);
    img._u = u; img.src = u; img.closest(".cam-img, .cam-big")?.classList.add("has-img");
  } catch { img.closest(".cam-img, .cam-big")?.classList.remove("has-img"); }
}
function camTick(force) {
  if (S.page !== "casa" || document.hidden) return;
  document.querySelectorAll(".cams.with-img").forEach((box) => {
    const due = Number(box.dataset.refresh || 10) * 1000;
    box.querySelectorAll("img[data-cam-img]").forEach((img) => {
      if (!force && img._t && Date.now() - img._t < due) return;
      if (img.closest(".is-off") && img._t) return;   // câmera offline: tenta uma vez só
      img._t = Date.now();
      camLoad(img, camUrl(box.dataset.iid, { id: img.dataset.camImg }));
    });
  });
}
setInterval(camTick, 1000);

function camDialog(iid, camId) {
  const h = (S.house && S.house[iid]) || S.data.instances.find((x) => x.id === iid)?.details.house;
  const cam = h?.cameras.find((c) => c.id === camId);
  if (!cam) return;
  const dlg = $("#dlg");
  dlg.innerHTML = `<div class="dlg-body cam-dlg"><div class="cam-big ${cam.online ? "" : "is-off"}"><img alt="Imagem da câmera ${esc(cam.name)}" id="cam-big-img"><span class="cam-ph">${cam.online ? "Carregando…" : "Sem imagem"}</span></div>
    <div class="cam-meta">${camMeta(cam)}</div>
    <div class="row-actions"><span class="small muted">Atualiza a cada 2 segundos enquanto aberta.</span><span style="flex:1"></span>
      ${S.ai?.cameras?.some((x) => x.iid === iid && x.id === camId) ? `<button class="btn ai-btn" data-ai-task="imagem" data-iid="${esc(iid)}" data-cam-id="${esc(camId)}">Analisar com IA</button>` : ""}
      <button class="btn" data-close>Fechar</button></div></div>`;
  dlg.classList.add("dlg-wide");
  dlg.querySelector("[data-close]").onclick = () => dlg.close();
  dlg.addEventListener("close", () => { clearInterval(dlg._cam); dlg.classList.remove("dlg-wide"); }, { once: true });
  if (!dlg.open) dlg.showModal();
  const img = $("#cam-big-img");
  const tick = () => document.hidden || camLoad(img, camUrl(iid, cam, 1280));
  tick(); clearInterval(dlg._cam); dlg._cam = setInterval(tick, 2000);
}
document.addEventListener("click", (e) => {
  const v = e.target.closest("[data-camview]");
  if (v) { localStorage.setItem("hm.camview", v.dataset.camview); render(); setTimeout(() => camTick(true), 50); return; }
  const c = e.target.closest(".cam[data-cam]");
  if (c) camDialog(c.closest(".cams").dataset.iid, c.dataset.cam);
});

function vCasa(i) {
  const ha = i.details, h = (S.house && S.house[i.id]) || ha.house;
  if (!h) return empty("Aguardando a primeira leitura do Home Assistant.");
  const plugs = h.rooms.flatMap((r) => r.plugs).sort((a, b) => b.cost.d30 - a.cost.d30);
  const maxCost = Math.max(0.01, ...plugs.map((p) => p.cost.d30));
  const top = [...plugs].sort((a, b) => (b.power || 0) - (a.power || 0)).slice(0, 3);
  const issues = h.zigbee.filter((z) => z.issue);
  setTimeout(() => camTick(true), 0);
  return `<div class="stats" id="hstats-${esc(i.id)}">${houseStats(i, h)}</div>
    ${camerasPanel(i, h)}
    <div class="rooms" id="rooms-${esc(i.id)}">${houseRooms(h)}</div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><h2>Gasto por tomada</h2><span class="muted">últimos 30 dias</span></div>
        ${plugs.map((p) => `<div class="cost-row"><div class="cost-top"><b>${esc(p.name)} <span class="muted small">${esc(p.room)}</span></b><span>${money(p.cost.d30, 2)}</span></div>
          <div class="bar"><i style="width:${(p.cost.d30 / maxCost) * 100}%;background:var(--s2)"></i></div>
          <div class="small muted">${num(p.kwh.d30, 1)} kWh · 7 dias ${money(p.cost.d7, 2)} · agora ${num(p.power, 0)} W</div></div>`).join("") || empty("Nenhuma tomada com medição.")}
      </div>
      <div class="stack">
        <div class="panel"><div class="panel-head"><h2>Consumo ao longo do tempo</h2><span class="muted">últimas ${S.range}</span></div>
          ${chartBox([{ key: `${i.id}.house.w`, label: "Casa (tomadas)", unit: " W", color: cssv("--s2"), fill: true },
            ...top.map((p, k) => ({ key: `${i.id}.p.${p.key}`, label: p.name, unit: " W", color: cssv(["--s1", "--s3", "--s4"][k]) }))])}</div>
        <div class="panel"><div class="panel-head"><h2>Dispositivos Zigbee</h2><span class="muted">${h.zigbee.length} com bateria ou sinal</span></div>
          ${issues.length ? `<div class="feed" style="margin-bottom:10px">${issues.map((z) => `<div class="ev ${z.unavailable ? "crit" : "warn"}"><div class="ev-ic">${z.unavailable ? "!" : "▲"}</div><div><b>${esc(z.name)}</b><span>${esc(z.room)} · ${z.unavailable ? "indisponível" : [z.battery != null ? `bateria ${num(z.battery, 0)}%` : "", z.lqi != null ? `sinal LQI ${num(z.lqi, 0)}` : ""].filter(Boolean).join(" · ")}</span></div></div>`).join("")}</div>` : '<p class="small muted">Nenhum dispositivo com problema.</p>'}
          <details><summary class="small">Ver todos</summary><div class="table-wrap"><table><thead><tr><th>Dispositivo</th><th>Cômodo</th><th class="num">Bateria</th><th class="num">LQI</th></tr></thead><tbody>
            ${h.zigbee.map((z) => `<tr><td><span class="dot ${z.unavailable ? "offline" : "online"}"></span> ${esc(z.name)}</td><td>${esc(z.room)}</td><td class="num">${z.battery != null ? num(z.battery, 0) + "%" : "–"}</td><td class="num">${z.lqi != null ? num(z.lqi, 0) : "–"}</td></tr>`).join("")}
          </tbody></table></div></details></div>
      </div>
    </div>
    <div class="panel"><div class="panel-head"><h2>Home Assistant</h2><span class="muted">versão ${esc(ha.version || "")} · ${num(ha.entities, 0)} entidades · ${num((ha.unavailable || []).length, 0)} indisponíveis</span></div>
      ${(ha.updates || []).length ? `<p class="small">Atualizações disponíveis: ${ha.updates.map(esc).join(", ")}</p>` : ""}
      ${(ha.watch || []).length ? `<div class="table-wrap"><table><tbody>${ha.watch.map((w) => `<tr><td>${esc(w.name)}<div class="small muted">${esc(w.id)}</div></td><td class="num"><b>${esc(w.state)}</b> ${esc(w.unit)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${(ha.unavailable || []).length ? `<p class="small muted">Indisponíveis: ${ha.unavailable.slice(0, 15).map((x) => `<code>${esc(x)}</code>`).join(" ")}</p>` : ""}</div>`;
}

/* Atualização rápida da página Casa (somente leitura) */
async function liveHouse() {
  if (S.page !== "casa" || !$("#auto").checked || document.hidden) return;
  for (const i of inst(["homeassistant"])) {
    try {
      const h = await api("GET", `/api/live/${encodeURIComponent(i.id)}`);
      (S.house ||= {})[i.id] = h;
      const rooms = document.getElementById(`rooms-${i.id}`), st = document.getElementById(`hstats-${i.id}`);
      if (rooms) rooms.innerHTML = houseRooms(h);
      if (st) st.innerHTML = houseStats(i, h);
      for (const cam of h.cameras || []) {
        const m = document.querySelector(`[data-cam-meta="${CSS.escape(cam.id)}"]`);
        if (m) m.innerHTML = camMeta(cam);
        const card = m?.closest(".cam, .cam-tile");
        (card?.classList.contains("cam-tile") ? card : card?.querySelector(".cam-img"))?.classList.toggle("is-off", !cam.online);
      }
    } catch { /* mantém a última leitura */ }
  }
}
setInterval(liveHouse, 5000);

function vZabbix(i) {
  const z = i.details, hs = instHosts(i);
  const sev = (n) => (n >= 4 ? "crit" : n >= 2 ? "warn" : "");
  return `${hs.map((h) => `<div class="panel"><div class="panel-head"><h2>${esc(h.name)}</h2><span class="muted">${esc(h.note || "")}</span></div>
      <div class="grid-2"><div class="gauges">${gauge(h.cpu, "CPU", h.load != null ? `carga ${num(h.load, 2)}` : "")}${gauge(h.mem, "RAM")}${gauge(h.disk, "Disco")}${h.temp != null ? gauge(h.temp, "Temperatura", "", 100, "°C") : ""}</div>
      <div>${chartBox([{ key: `${h.id}.cpu`, label: "CPU %", unit: "%", color: cssv("--s1"), fill: true }, { key: `${h.id}.mem`, label: "RAM %", unit: "%", color: cssv("--s3") }, ...(h.temp != null ? [{ key: `${h.id}.temp`, label: "Temp °C", unit: " °C", color: cssv("--s2") }] : [])], { leftMax: 100 })}</div></div></div>`).join("")}
    <div class="panel"><div class="panel-head"><h2>Problemas ativos</h2><span class="muted">${num(z.hosts, 0)} hosts monitorados${(z.unavailable || []).length ? ` · ${z.unavailable.length} sem agente` : ""}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Severidade</th><th>Problema</th><th>Host</th><th class="num">Desde</th></tr></thead><tbody>
      ${(z.problems || []).map((p) => `<tr><td><span class="tag ${sev(p.severity)}">${esc(p.severity_text)}</span></td><td>${esc(p.title)}</td><td>${esc(p.host)}</td><td class="num">${ago(p.since)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Nenhum problema ativo.</td></tr>'}
      </tbody></table></div></div>`;
}

function pageChecks(list) {
  return `<div class="panel"><div class="panel-head"><h2>Verificações</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Serviço</th><th>Alvo</th><th>Resultado</th><th class="num">Resposta</th></tr></thead><tbody>
    ${list.map((i) => { const a = S.data.apps.find((x) => x.id === i.id) || {}; return `<tr><td><span class="dot ${a.status}"></span> ${esc(i.name)}</td><td class="small">${esc(i.details.url || i.details.target || "")}</td><td>${esc(a.summary || i.error || "")}</td><td class="num">${i.details.latency_ms != null ? i.details.latency_ms + " ms" : "–"}</td></tr>`; }).join("")}
    </tbody></table></div></div>
    <div class="panel"><div class="panel-head"><h2>Tempo de resposta</h2></div>${chartBox(list.slice(0, 8).map((i, k) => ({ key: `${i.id}.latency`, label: i.name, unit: " ms", color: cssv(`--s${(k % 4) + 1}`) })))}</div>`;
}

const VIEWS = { rede: vRede, proxmox: vProxmox, backups: vBackups, armazenamento: vTrueNAS, midia: vEmby, casa: vCasa, zabbix: vZabbix };
function pageTyped(key, types) {
  const list = inst(types);
  if (!list.length) return empty(`Nenhuma integração deste tipo ativa. <a href="#config">Adicionar em Configurações</a>.`);
  if (key === "servicos") return `<div class="stack">${list.map(instError).join("")}${pageChecks(list)}</div>`;
  return list.map((i) => `<div class="stack inst">${sectionTitle(i, list.length > 1)}${instError(i)}${VIEWS[key](i)}</div>`).join("");
}

/* ---------- Configurações ---------- */
const typeOf = (t) => S.types.find((x) => x.type === t) || { label: t, fields: [] };
const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "servico";

async function loadConfig() {
  const [types, cfg, users] = await Promise.all([S.types || api("GET", "/api/types"), api("GET", "/api/config"),
    S.authMode === "local" ? api("GET", "/api/users") : []]);
  S.types = types; S.cfg = cfg; S.users = users;
  S.brand = await api("GET", "/api/branding").catch(() => window.BRAND);
}

function usersPanel() {
  if (S.authMode !== "local") return `<div class="panel"><div class="panel-head"><h2>Usuários</h2></div>
    <p class="small muted">O login está no modo <code>${esc(S.authMode)}</code>. Os usuários são gerenciados ${S.authMode === "proxy" ? "pelo seu provedor de login" : "fora da dashboard"}.</p></div>`;
  return `<div class="panel"><div class="panel-head"><h2>Usuários</h2><span class="muted">Administradores mudam configurações e o diagrama. Visualizadores só veem.</span></div>
    <div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Papel</th><th>2FA</th><th>Criado</th><th></th></tr></thead><tbody>
    ${S.users.map((u) => `<tr><td><b>${esc(u.username)}</b>${u.username === S.me.username ? ' <span class="tag">você</span>' : ""}</td>
      <td><select data-user-role="${esc(u.username)}" ${u.username === S.me.username ? "disabled" : ""} aria-label="Papel de ${esc(u.username)}">
        <option value="admin" ${u.role === "admin" ? "selected" : ""}>Administrador</option><option value="viewer" ${u.role === "viewer" ? "selected" : ""}>Visualizador</option></select></td>
      <td>${u.totp ? '<span class="tag ok">ativo</span>' : '<span class="small muted">não</span>'}</td>
      <td class="small muted">${u.created ? new Date(u.created * 1000).toLocaleDateString("pt-BR") : "–"}</td>
      <td class="num"><div class="svc-btns" style="justify-content:flex-end">
        <button class="btn" data-act="user-reset" data-u="${esc(u.username)}">Trocar senha</button>
        ${u.totp ? `<button class="btn" data-act="user-2fa" data-u="${esc(u.username)}">Zerar 2FA</button>` : ""}
        ${u.username === S.me.username ? "" : `<button class="btn danger" data-act="user-del" data-u="${esc(u.username)}">Remover</button>`}</div></td></tr>`).join("")}
    </tbody></table></div>
    <form class="form-grid user-add" id="f-user">
      <label class="fld"><span>Novo usuário</span><input name="username" autocomplete="off" autocapitalize="none" required></label>
      <label class="fld"><span>Senha inicial</span><input name="password" type="password" autocomplete="new-password" minlength="10" required></label>
      <label class="fld"><span>Papel</span><select name="role"><option value="viewer">Visualizador</option><option value="admin">Administrador</option></select></label>
      <div class="fld"><span>&nbsp;</span><button class="btn primary" type="submit">Adicionar usuário</button></div>
    </form></div>`;
}

function pageConfig() {
  if (!S.cfg) {
    loadConfig().then(render).catch((e) => { $("#page").innerHTML = `<div class="banner err">${esc(e.message)}</div>`; });
    return empty("Carregando configurações…");
  }
  const c = S.cfg.config, st = c.settings, ro = S.cfg.readonly;
  const status = Object.fromEntries(S.data.instances.map((i) => [i.id, i]));
  const modeTag = (s) => {
    if (s.enabled === false) return '<span class="tag">desligado</span>';
    const i = status[s.id];
    if (!i) return '<span class="tag">aguardando</span>';
    if (i.mode === "demo") return '<span class="tag demo">demonstração</span>';
    if (!i.ok) return `<span class="tag crit" title="${esc(i.error)}">erro</span>`;
    return `<span class="tag ok">ao vivo · ${i.latency_ms} ms</span>`;
  };
  const kinds = Object.keys(st.energy.profile || {});
  return `<div class="stack">
    ${ro ? '<div class="banner">Configuração somente leitura (CONFIG_READONLY). Edite <code>config.yml</code> no servidor.</div>' : ""}
    <div class="panel">
      <div class="panel-head"><h2>Serviços monitorados</h2><span class="muted">A ordem aqui é a ordem da frota e do menu</span></div>
      <div class="svc-list">
        ${c.services.map((s, k) => { const i = status[s.id]; return `<div class="svc-row ${s.enabled === false ? "off" : ""}">
          <label class="switch" title="Ligar ou desligar"><input type="checkbox" data-act="toggle" data-k="${k}" ${s.enabled !== false ? "checked" : ""} ${ro ? "disabled" : ""}><span></span></label>
          <div class="svc-main"><b>${esc(s.name || s.id)}</b>${typeOf(s.type).label !== s.name ? ` <span class="muted small">${esc(typeOf(s.type).label)}</span>` : ""}
            <div class="small muted">${esc(s.url || (s.host ? `${s.host}:${s.port}` : ""))}${i && !i.ok && i.error && s.enabled !== false ? ` · <span style="color:var(--crit)">${esc(i.error)}</span>` : ""}</div></div>
          <div class="svc-tag">${modeTag(s)}</div>
          <div class="svc-btns">
            <button class="icon-btn" data-act="up" data-k="${k}" ${k === 0 || ro ? "disabled" : ""} aria-label="Subir">↑</button>
            <button class="icon-btn" data-act="down" data-k="${k}" ${k === c.services.length - 1 || ro ? "disabled" : ""} aria-label="Descer">↓</button>
            <button class="btn" data-act="edit" data-k="${k}" ${ro ? "disabled" : ""}>Editar</button>
          </div></div>`; }).join("") || empty("Nenhum serviço. Adicione o primeiro.")}
      </div>
      ${ro ? "" : '<div class="row-actions"><button class="btn primary" data-act="add">Adicionar serviço</button></div>'}
    </div>

    ${usersPanel()}
    ${aiConfigPanel()}
    ${securityPanel()}
    ${brandPanel()}
    <div class="grid-2">
      <form class="panel" id="f-general">
        <div class="panel-head"><h2>Geral</h2></div>
        <div class="form-grid">
          ${inp("poll_interval", "Coletar a cada (segundos)", st.poll_interval, "number")}
          ${inp("retention_days", "Guardar histórico por (dias)", st.retention_days, "number")}
          ${inp("http_timeout", "Tempo limite das APIs (s)", st.http_timeout, "number")}
          ${inp("tz_offset", "Fuso horário (UTC±h)", st.tz_offset, "number")}
          <label class="fld"><span>Serviços sem credencial</span><select name="demo_mode">
            ${[["auto", "Mostrar dados de demonstração"], ["off", "Mostrar como desligados"], ["on", "Tudo em demonstração"]].map(([v, t]) => `<option value="${v}" ${st.demo_mode === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        </div>
        <h3 class="sub-h">Limites de alerta</h3>
        <div class="form-grid">
          ${inp("t.disk_warn", "Disco: aviso (%)", st.thresholds.disk_warn, "number")}
          ${inp("t.disk_crit", "Disco: crítico (%)", st.thresholds.disk_crit, "number")}
          ${inp("t.mem_warn", "RAM: aviso (%)", st.thresholds.mem_warn, "number")}
          ${inp("t.temp_warn", "Temperatura: aviso (°C)", st.thresholds.temp_warn, "number")}
        </div>
        ${ro ? "" : '<div class="row-actions"><button class="btn primary" type="submit">Salvar geral</button></div>'}
      </form>

      <form class="panel" id="f-energy">
        <div class="panel-head"><h2>Energia</h2></div>
        <div class="form-grid">
          ${inp("tariff", "Tarifa (R$/kWh)", st.energy.tariff, "number", "0.001")}
          ${inp("currency", "Moeda", st.energy.currency)}
        </div>
        <h3 class="sub-h">Consumo estimado por tipo (W)</h3>
        <p class="small muted">Usado sem medidor e para dividir o total medido entre os equipamentos. Coloque 0 em máquinas virtuais para não contar em dobro.</p>
        <div class="table-wrap"><table class="tbl-form"><thead><tr><th>Tipo</th><th>Ocioso</th><th>Máximo</th></tr></thead><tbody>
          ${kinds.map((k) => `<tr><td>${esc(KIND[k] || k)}</td><td><input type="number" step="0.1" name="p.${k}.0" value="${st.energy.profile[k][0]}"></td><td><input type="number" step="0.1" name="p.${k}.1" value="${st.energy.profile[k][1]}"></td></tr>`).join("")}
        </tbody></table></div>
        <h3 class="sub-h">Ajuste por equipamento</h3>
        <div class="table-wrap"><table class="tbl-form"><thead><tr><th>Host</th><th>Ocioso</th><th>Máximo</th></tr></thead><tbody>
          ${S.data.hosts.map((h) => { const v = (st.energy.hosts || {})[h.id] || ["", ""]; return `<tr><td>${esc(h.name)} <span class="small muted">${esc(KIND[h.kind] || h.kind)}</span></td><td><input type="number" step="0.1" name="h.${esc(h.id)}.0" value="${v[0]}" placeholder="padrão"></td><td><input type="number" step="0.1" name="h.${esc(h.id)}.1" value="${v[1]}" placeholder="padrão"></td></tr>`; }).join("")}
        </tbody></table></div>
        ${ro ? "" : '<div class="row-actions"><button class="btn primary" type="submit">Salvar energia</button></div>'}
      </form>
    </div>
    <p class="small muted">Arquivo: <code>${esc(S.cfg.path)}</code>. Edições feitas à mão nele são aplicadas automaticamente no próximo ciclo.</p>
  </div>`;
}
const inp = (name, label, value, type = "text", step) => `<label class="fld"><span>${esc(label)}</span><input name="${name}" type="${type}" ${step ? `step="${step}"` : ""} value="${esc(value ?? "")}"></label>`;

async function saveConfig(msg = "Configurações salvas") {
  try {
    await api("PUT", "/api/config", S.cfg.config);
    toast(msg);
    await loadConfig();
    setTimeout(load, 1500);
    render();
    return true;
  } catch (e) { toast(e.message, true); await loadConfig(); render(); return false; }
}

function fieldHTML(f, val, mask) {
  const v = val ?? f.default ?? "";
  const help = f.help ? `<small>${esc(f.help)}</small>` : "";
  const req = f.required ? " *" : "";
  if (f.kind === "bool") return `<label class="fld check"><input type="checkbox" name="${f.key}" ${v === true || v === "true" ? "checked" : ""}><span>${esc(f.label)}</span>${help}</label>`;
  if (f.kind === "select") return `<label class="fld"><span>${esc(f.label)}${req}</span><select name="${f.key}">${f.options.map(([o, t]) => `<option value="${esc(o)}" ${String(v) === String(o) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>${help}</label>`;
  if (f.kind === "list") return `<label class="fld wide"><span>${esc(f.label)}${req}</span><textarea name="${f.key}" rows="3" placeholder="${esc(f.placeholder)}">${esc(Array.isArray(v) ? v.join("\n") : String(v).split(",").map((x) => x.trim()).filter(Boolean).join("\n"))}</textarea>${help}</label>`;
  if (f.kind === "secret") {
    const saved = v === mask;
    const isVar = String(v).startsWith("${");
    return `<label class="fld wide"><span>${esc(f.label)}${req}</span><input type="${isVar ? "text" : "password"}" name="${f.key}" autocomplete="new-password" value="${saved ? "" : esc(v)}" placeholder="${saved ? "Salvo. Deixe em branco para manter" : "Cole aqui ou use ${VARIAVEL} do .env"}" data-saved="${saved ? 1 : 0}">${help}</label>`;
  }
  return `<label class="fld ${f.key === "url" ? "wide" : ""}"><span>${esc(f.label)}${req}</span><input type="${f.kind === "number" ? "number" : "text"}" name="${f.key}" value="${esc(v)}" placeholder="${esc(f.placeholder)}">${help}</label>`;
}

function readForm(form, type, base) {
  const out = { ...base, type };
  for (const f of typeOf(type).fields) {
    const el = form.elements[f.key];
    if (!el) continue;
    if (f.kind === "bool") out[f.key] = el.checked;
    else if (f.kind === "list") out[f.key] = el.value.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    else if (f.kind === "number") out[f.key] = el.value === "" ? null : Number(el.value);
    else if (f.kind === "secret") out[f.key] = el.value === "" && el.dataset.saved === "1" ? S.cfg.mask : el.value;
    else out[f.key] = el.value.trim();
  }
  if (!base.id) out.id = form.elements.id.value.trim() || slug(out.name);
  if (out.enabled === undefined) out.enabled = true;
  return out;
}

function openService(k, newType) {
  const dlg = $("#dlg");
  const editing = k != null;
  const s = editing ? S.cfg.config.services[k] : null;
  if (!editing && !newType) {
    dlg.innerHTML = `<form method="dialog" class="dlg-body"><h2>Adicionar serviço</h2><p class="muted small">Escolha o tipo. Para algo sem integração própria use a verificação HTTP ou TCP.</p>
      <div class="type-grid">${S.types.map((t) => `<button class="type-card" value="${t.type}" data-type="${t.type}"><span class="type-ic">${icon(t.page)}</span><b>${esc(t.label)}</b><span class="small muted">${esc(t.description)}</span></button>`).join("")}</div>
      <div class="row-actions"><button class="btn" value="cancel">Cancelar</button></div></form>`;
    dlg.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); openService(null, b.dataset.type); }));
    if (!dlg.open) dlg.showModal();
    return;
  }
  const type = editing ? s.type : newType, t = typeOf(type);
  const ids = new Set(S.cfg.config.services.map((x) => x.id));
  let suggested = slug(t.label); for (let n = 2; ids.has(suggested); n++) suggested = `${slug(t.label)}-${n}`;
  dlg.innerHTML = `<form class="dlg-body" id="f-svc"><h2>${editing ? "Editar" : "Novo"}: ${esc(t.label)}</h2>
    <div class="form-grid">
      ${t.fields.map((f) => fieldHTML(f, editing ? s[f.key] : (f.key === "name" ? t.label : undefined), S.cfg.mask)).join("")}
      ${editing ? `<label class="fld"><span>Identificador</span><input value="${esc(s.id)}" disabled><small>Prefixo do histórico; não muda após criar</small></label>`
        : `<label class="fld"><span>Identificador</span><input name="id" value="${esc(suggested)}" pattern="[a-z0-9][a-z0-9-]*"><small>Letras minúsculas, números e hífen</small></label>`}
    </div>
    <div class="test-out" id="test-out"></div>
    <div class="row-actions">
      ${editing ? '<button type="button" class="btn danger" data-act="remove">Remover</button>' : ""}
      <span style="flex:1"></span>
      <button type="button" class="btn" data-act="test">Testar conexão</button>
      <button type="button" class="btn" data-act="cancel">Cancelar</button>
      <button type="submit" class="btn primary">${editing ? "Salvar" : "Adicionar"}</button>
    </div></form>`;
  const form = $("#f-svc");
  if (!editing) {  // id acompanha o nome até a pessoa editar o id
    const idEl = form.elements.id, nameEl = form.elements.name;
    const uniq = (b) => { let v = b; for (let n = 2; ids.has(v); n++) v = `${b}-${n}`; return v; };
    idEl.value = uniq(slug(nameEl.value));
    idEl.addEventListener("input", () => (idEl.dataset.touched = "1"));
    nameEl.addEventListener("input", () => { if (!idEl.dataset.touched) idEl.value = uniq(slug(nameEl.value)); });
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const svc = readForm(form, type, editing ? { id: s.id, enabled: s.enabled } : {});
    const list = S.cfg.config.services;
    if (editing) list[k] = svc; else list.push(svc);
    if (await saveConfig(editing ? `${svc.name} salvo` : `${svc.name} adicionado`)) dlg.close();
  });
  form.querySelector('[data-act="cancel"]').onclick = () => dlg.close();
  form.querySelector('[data-act="test"]').onclick = async () => {
    const out = $("#test-out");
    out.className = "test-out"; out.textContent = "Testando…";
    try {
      const r = await api("POST", "/api/test", { service: readForm(form, type, editing ? { id: s.id } : {}) });
      out.className = `test-out ${r.ok ? "ok" : "err"}`;
      out.textContent = r.ok ? `Conectou em ${r.latency_ms} ms: ${r.summary}` : `Falhou: ${r.error}`;
    } catch (e) { out.className = "test-out err"; out.textContent = e.message; }
  };
  const rm = form.querySelector('[data-act="remove"]');
  if (rm) rm.onclick = async () => {
    if (!confirm(`Remover ${s.name}? O histórico já coletado continua no banco até expirar.`)) return;
    S.cfg.config.services.splice(k, 1);
    if (await saveConfig(`${s.name} removido`)) dlg.close();
  };
  if (!dlg.open) dlg.showModal();
}

function toast(msg, err) {
  const t = $("#toast");
  t.textContent = msg; t.className = `toast show ${err ? "err" : ""}`;
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = "toast"), err ? 6000 : 2500);
}

/* ---------- Render geral ---------- */
function visiblePages() {
  const types = new Set(S.data.instances.map((i) => i.type));
  return PAGES.filter(([k, , t]) => (k !== "config" || S.me?.role === "admin") && (k !== "assistente" || S.ai?.allowed) && (!t || t.some((x) => types.has(x))));
}
function render() {
  const d = S.data;
  const pages = visiblePages();
  if (!pages.find(([k]) => k === S.page)) S.page = "visao";
  const bad = new Set(d.events.filter((e) => e.level !== "info").map((e) => e.source));
  if (d.instances.some((i) => !i.ok && i.mode !== "off")) bad.add("config");
  $("#nav").innerHTML = pages.map(([k, t]) =>
    `<a href="#${k}" class="${S.page === k ? "on" : ""}">${icon(k)}${t}${bad.has(k) ? '<span class="dot crit" aria-label="tem alertas"></span>' : ""}</a>`).join("");
  $("#hostchips").innerHTML = d.hosts.map((h) =>
    `<button class="chip ${h.id === S.sel ? "on" : ""}" data-host="${esc(h.id)}"><span class="dot ${h.status}"></span>${esc(h.name)}</button>`).join("");
  $("#ver").textContent = `v${d.version}`;
  $("#poll").textContent = `Coleta a cada ${d.poll} s`;
  $("#me").innerHTML = S.me ? `<div class="me-name"><b>${esc(S.me.username)}</b><span class="small muted">${S.me.role === "admin" ? "Administrador" : "Visualizador"}</span></div>
    <div class="me-btns">${IN_APP ? '<button class="btn" data-me="app">Ajustes do app</button>' : ""}${S.authMode === "local" ? '<button class="btn" data-me="account">Minha conta</button>' : ""}${S.authMode !== "off" ? '<button class="btn" data-me="logout">Sair</button>' : ""}</div>` : "";
  const demo = d.instances.filter((i) => i.mode === "demo").map((i) => i.name);
  const [, title, types] = pages.find(([k]) => k === S.page);
  const banner = demo.length && !["config", "diagrama", "assistente", "atalhos"].includes(S.page) ? `<div class="banner">Em demonstração: ${demo.map(esc).join(", ")}. <a href="#config">Configure as credenciais</a> para ver seus dados reais.</div>` : "";
  const body = S.page === "visao" ? pageOverview() : S.page === "config" ? pageConfig() : S.page === "diagrama" ? pageDiagram()
    : S.page === "assistente" ? pageAssistant() : S.page === "atalhos" ? pageLauncher() : pageTyped(S.page, types);
  const y = scrollY;
  $("#page").innerHTML = banner + (S.page === "visao" ? "" : `<div class="page-title"><h1>${esc(title)}</h1></div>`) + body;
  scrollTo(0, y);
  if (S.page === "assistente") setTimeout(aiAfterRender, 0);
  if (S.page === "config") setTimeout(brandPreview, 0);
  if (S.page === "atalhos" && !LC.statusLoaded) { LC.statusLoaded = true; setTimeout(lcRefreshStatus, 0); }
}

/* ---------- Conta e usuários ---------- */
function passwordDialog(target) {
  const self = !target || target === S.me.username;
  const dlg = $("#dlg");
  dlg.innerHTML = `<form class="dlg-body" id="f-pw"><h2>${self ? "Minha senha" : `Nova senha para ${esc(target)}`}</h2>
    <div class="form-grid">
      ${self ? '<label class="fld wide"><span>Senha atual</span><input name="current" type="password" autocomplete="current-password" required></label>' : ""}
      <label class="fld"><span>Nova senha</span><input name="new" type="password" autocomplete="new-password" minlength="10" required><small>Pelo menos 10 caracteres</small></label>
      <label class="fld"><span>Repita a nova senha</span><input name="confirm" type="password" autocomplete="new-password" required></label>
    </div>
    ${self ? "" : '<p class="small muted">As sessões abertas desse usuário serão encerradas.</p>'}
    <div class="row-actions"><span style="flex:1"></span><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Trocar senha</button></div></form>`;
  dlg.querySelector("[data-close]").onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
  $("#f-pw").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.elements.new.value !== f.elements.confirm.value) return toast("As senhas não são iguais", true);
    try {
      if (self) await api("POST", "/api/account/password", { current: f.elements.current.value, new: f.elements.new.value });
      else await api("PUT", `/api/users/${encodeURIComponent(target)}`, { password: f.elements.new.value });
      dlg.close(); toast("Senha trocada");
    } catch (err) { toast(err.message, true); }
  };
}

document.addEventListener("click", async (e) => {
  const m = e.target.closest("[data-me]");
  if (m?.dataset.me === "app" && IN_APP) { window.HMApp.openSettings(); return; }
  if (m?.dataset.me === "password") passwordDialog();
  if (m?.dataset.me === "logout") {
    if (typeof DG !== "undefined" && DG.dirty && !confirm("Sair sem salvar as alterações do diagrama?")) return;
    DG.dirty = false;
    await fetch("/api/auth/logout", { method: "POST" });
    location.replace("/login.html");
  }
  const u = e.target.closest('#page [data-act^="user-"]');
  if (!u) return;
  if (u.dataset.act === "user-reset") passwordDialog(u.dataset.u);
  if (u.dataset.act === "user-2fa" && confirm(`Zerar o duplo fator de ${u.dataset.u}? A pessoa vai entrar só com a senha${S.cfg?.config.settings.security?.require_2fa !== "none" ? " e terá que configurar o 2FA de novo" : ""}.`)) {
    try { await api("PUT", `/api/users/${encodeURIComponent(u.dataset.u)}`, { reset_2fa: true }); toast("2FA zerado"); await loadConfig(); render(); }
    catch (err) { toast(err.message, true); }
  }
  if (u.dataset.act === "user-del" && confirm(`Remover o usuário ${u.dataset.u}?`)) {
    try { await api("DELETE", `/api/users/${encodeURIComponent(u.dataset.u)}`); toast("Usuário removido"); await loadConfig(); render(); }
    catch (err) { toast(err.message, true); }
  }
});
document.addEventListener("change", async (e) => {
  const r = e.target.closest("[data-user-role]");
  if (!r) return;
  try { await api("PUT", `/api/users/${encodeURIComponent(r.dataset.userRole)}`, { role: r.value }); toast("Papel atualizado"); }
  catch (err) { toast(err.message, true); }
  await loadConfig(); render();
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "f-user") return;
  e.preventDefault();
  const f = e.target;
  try {
    await api("POST", "/api/users", { username: f.elements.username.value, password: f.elements.password.value, role: f.elements.role.value });
    toast("Usuário adicionado"); await loadConfig(); render();
  } catch (err) { toast(err.message, true); }
});

/* ---------- Eventos ---------- */
document.addEventListener("click", async (e) => {
  const hb = e.target.closest("[data-host]");
  if (hb) { S.sel = hb.dataset.host; S.scope = "host"; localStorage.setItem("hm.sel", S.sel); if (S.page !== "visao") location.hash = "visao"; else render(); return; }
  const sc = e.target.closest("#scope [data-s]");
  if (sc) { S.scope = sc.dataset.s; render(); return; }
  const rg = e.target.closest("#range [data-r]");
  if (rg) { S.range = rg.dataset.r; localStorage.setItem("hm.range", S.range); markSeg("#range", "r", S.range); render(); return; }
  const th = e.target.closest("#theme [data-t]");
  if (th) { setTheme(th.dataset.t); return; }
  if (e.target.closest("#menu")) { $("#side").classList.toggle("open"); return; }
  if (e.target.closest(".nav a")) $("#side").classList.remove("open");
  const act = e.target.closest("#page [data-act]");
  if (act && S.cfg) {
    const k = Number(act.dataset.k), list = S.cfg.config.services;
    if (act.dataset.act === "add") openService(null);
    if (act.dataset.act === "edit") openService(k);
    if (act.dataset.act === "up" || act.dataset.act === "down") {
      const j = act.dataset.act === "up" ? k - 1 : k + 1;
      [list[k], list[j]] = [list[j], list[k]];
      await saveConfig("Ordem atualizada");
    }
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target.closest('[data-act="toggle"]');
  if (t && S.cfg) {
    const s = S.cfg.config.services[Number(t.dataset.k)];
    s.enabled = t.checked;
    await saveConfig(`${s.name} ${t.checked ? "ligado" : "desligado"}`);
  }
});
document.addEventListener("submit", async (e) => {
  if (!S.cfg) return;
  const f = e.target, st = S.cfg.config.settings;
  if (f.id === "f-general") {
    e.preventDefault();
    const n = (k) => Number(f.elements[k].value);
    Object.assign(st, { poll_interval: n("poll_interval"), retention_days: n("retention_days"), http_timeout: n("http_timeout"), tz_offset: n("tz_offset"), demo_mode: f.elements.demo_mode.value });
    st.thresholds = { disk_warn: n("t.disk_warn"), disk_crit: n("t.disk_crit"), mem_warn: n("t.mem_warn"), temp_warn: n("t.temp_warn") };
    await saveConfig("Configurações gerais salvas");
  }
  if (f.id === "f-energy") {
    e.preventDefault();
    st.energy.tariff = Number(f.elements.tariff.value);
    st.energy.currency = f.elements.currency.value.trim().toUpperCase() || "BRL";
    for (const k of Object.keys(st.energy.profile)) st.energy.profile[k] = [Number(f.elements[`p.${k}.0`].value) || 0, Number(f.elements[`p.${k}.1`].value) || 0];
    const hosts = {};
    for (const h of S.data.hosts) {
      const a = f.elements[`h.${h.id}.0`]?.value, b = f.elements[`h.${h.id}.1`]?.value;
      if (a !== "" && b !== "" && a != null && b != null) hosts[h.id] = [Number(a), Number(b)];
    }
    st.energy.hosts = hosts;
    await saveConfig("Energia salva");
  }
});
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1) || (localStorage.getItem("hm.launcherHome") === "1" ? "atalhos" : "visao");
  if (S.page === "atalhos" && next !== "atalhos" && LC.edit) {
    if (LC.dirty && !confirm("Sair sem salvar as alterações dos atalhos?")) { history.replaceState(null, "", "#atalhos"); return; }
    LC.edit = false; LC.dirty = false; LC.draft = null;
  }
  if (S.page === "diagrama" && next !== "diagrama" && DG.edit) {
    if (DG.dirty && !confirm("Sair sem salvar as alterações do diagrama?")) { history.replaceState(null, "", "#diagrama"); return; }
    DG.edit = false; DG.dirty = false; DG.draft = null;
  }
  S.page = next;
  if (S.page === "config") S.cfg = null;
  scrollTo(0, 0);
  if (S.data) render();
});
window.addEventListener("resize", () => document.querySelectorAll("canvas").forEach((c) => c._redraw && c._redraw()));
$("#auto").addEventListener("change", schedule);

function markSeg(sel, attr, val) { document.querySelectorAll(`${sel} button`).forEach((b) => b.classList.toggle("on", b.dataset[attr] === val)); }
function setTheme(t) {
  localStorage.setItem("hm.theme", t);
  if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  markSeg("#theme", "t", t);
  if (S.data) render();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => S.data && render());

setTheme(localStorage.getItem("hm.theme") || "system");
markSeg("#range", "r", S.range);
load().then(schedule);
