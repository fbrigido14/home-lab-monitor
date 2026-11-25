/* Homelab Monitor — página Proxmox (cluster, nós, consumidores, guests, storages, discos e tarefas) */
const PV = { q: "", type: "all", status: "all", sort: "cpu", dir: -1, sparks: {}, open: null, rrd: {}, logQ: "",
  tab: localStorage.getItem("hm.pvTab") || "overview", tf: localStorage.getItem("hm.pvTf") || "day", node: localStorage.getItem("hm.pvNode") || null };
const PV_TABS = [["overview", "Visão geral"], ["storage", "Armazenamento"], ["network", "Rede"], ["guests", "VMs e LXC"], ["hardware", "Hardware"], ["logs", "Tarefas e logs"]];
const PV_TF = [["hour", "1 hora"], ["day", "24 horas"], ["week", "7 dias"], ["month", "30 dias"], ["year", "1 ano"]];
const TASK_NAMES = {
  vzdump: "Backup", qmstart: "Iniciar VM", qmstop: "Parar VM", qmshutdown: "Desligar VM", qmreboot: "Reiniciar VM",
  vzstart: "Iniciar CT", vzstop: "Parar CT", vzshutdown: "Desligar CT", qmigrate: "Migrar VM", vzmigrate: "Migrar CT",
  qmsnapshot: "Snapshot", vzsnapshot: "Snapshot", qmrollback: "Restaurar snapshot", qmclone: "Clonar VM", vzcreate: "Criar CT",
  qmcreate: "Criar VM", qmdestroy: "Remover VM", vzdestroy: "Remover CT", vncproxy: "Console", vncshell: "Shell",
  termproxy: "Terminal", spiceproxy: "Console SPICE", aptupdate: "Atualizar pacotes", imgcopy: "Copiar disco",
  qmmove: "Mover disco", srvreload: "Recarregar serviço", startall: "Iniciar todos", stopall: "Parar todos",
};

const bytes = (b) => { if (b == null) return "–"; const u = ["B", "KB", "MB", "GB", "TB", "PB"]; let i = 0, n = Number(b);
  while (Math.abs(n) >= 1024 && i < u.length - 1) { n /= 1024; i++; } return `${num(n, n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`; };
const rate = (bps) => (bps == null ? "–" : `${bytes(bps)}/s`);
const ratio = (u, t) => (t ? (u / t) * 100 : null);

/* ---------- minigráficos ---------- */
function sparkSVG(pts, opts = {}) {
  const w = opts.w || 96, h = opts.h || 26;
  if (!pts || pts.length < 2) return `<svg class="spark-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"></svg>`;
  const vals = pts.map((p) => p[1]), max = opts.max ?? Math.max(1, ...vals) * 1.1;
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * w, h - 2 - (Math.min(p[1], max) / max) * (h - 4)]);
  const line = xy.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
  return `<svg class="spark-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">
    <polygon points="0,${h} ${line} ${w},${h}" style="fill:${opts.color || "var(--accent)"};opacity:.14"/>
    <polyline points="${line}" fill="none" style="stroke:${opts.color || "var(--accent)"}" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
const sparkSlot = (key, opts = {}) => `<span class="spark" data-spark="${esc(key)}" data-max="${opts.max ?? ""}" data-color="${esc(opts.color || "")}" data-w="${opts.w || 96}" data-h="${opts.h || 26}"></span>`;
function fillSparks(root = document) {
  root.querySelectorAll("[data-spark]").forEach((el) => {
    const pts = PV.sparks[el.dataset.spark];
    if (pts) el.innerHTML = sparkSVG(pts, { max: el.dataset.max ? Number(el.dataset.max) : undefined, color: el.dataset.color || undefined, w: Number(el.dataset.w), h: Number(el.dataset.h) });
  });
}
async function loadSparks() {
  const keys = [...new Set([...document.querySelectorAll("[data-spark]")].map((el) => el.dataset.spark))];
  if (!keys.length) return;
  const rng = ["1h", "6h", "24h"].includes(S.range) ? S.range : "24h";
  for (let i = 0; i < keys.length; i += 80) {
    try { Object.assign(PV.sparks, (await api("GET", `/api/spark?range=${rng}&keys=${keys.slice(i, i + 80).map(encodeURIComponent).join(",")}`)).series); }
    catch { return; }
  }
  fillSparks();
}

/* ---------- blocos ---------- */
function meter(label, value, detail, sparkKey) {
  return `<div class="pv-meter"><div class="pv-meter-top"><span>${label}</span><b>${value == null ? "–" : `${num(value, 0)}%`}</b></div>
    ${bar(value, "thick")}<div class="pv-meter-foot"><span class="small muted">${detail}</span>${sparkKey ? sparkSlot(sparkKey, { max: 100, w: 110, h: 22 }) : ""}</div></div>`;
}

function nodeCard(i, n) {
  const hid = `${i.id}-${n.name}`;
  const mem = ratio(n.mem_used, n.mem_total), swap = ratio(n.swap_used, n.swap_total), root = ratio(n.root_used, n.root_total);
  const chart = (label, value, key, opts = {}) => `<div class="pv-mini"><div class="pv-mini-top"><span>${label}</span><b>${value}</b></div>${sparkSlot(key, { w: 180, h: 38, ...opts })}</div>`;
  return `<section class="panel pv-node ${n.online ? "" : "is-off"}">
    <header class="pv-node-head"><span class="dot ${n.online ? "online" : "offline"}"></span><h2>${esc(n.name)}</h2>
      ${n.version ? `<span class="tag">PVE ${esc(n.version)}</span>` : ""}${n.kernel ? `<span class="tag">${esc(n.kernel)}</span>` : ""}
      <span class="muted small" style="margin-left:auto">${n.online ? `ligado há ${uptime(n.uptime)}` : "offline"}</span></header>
    ${n.online ? `<p class="small muted pv-cpu-model">${esc(n.model || "")}${n.sockets ? ` · ${n.sockets} soquete${n.sockets > 1 ? "s" : ""}` : ""}${n.threads ? ` · ${n.threads} threads` : ""}</p>
    <div class="pv-minis">
      ${chart("CPU", `${num(n.cpu, 0)}%`, `${hid}.cpu`, { max: 100 })}
      ${chart("RAM", `${num(mem, 0)}% <small>${bytes(n.mem_used)} / ${bytes(n.mem_total)}</small>`, `${hid}.mem`, { max: 100, color: "var(--s3)" })}
      ${chart("I/O wait", `${num(n.iowait, 1)}%`, `${hid}.iowait`, { color: "var(--s2)" })}
      ${chart("Rede", `<small>↓</small> ${rate(n.netin)} <small>↑</small> ${rate(n.netout)}`, `${hid}.netin`, { color: "var(--s4)" })}
    </div>
    <div class="pv-node-foot">
      <div><span class="small muted">Carga 1 · 5 · 15 min</span><b>${(n.load || []).map((x) => num(x, 2)).join(" · ") || "–"}</b></div>
      <div><span class="small muted">Swap</span><b>${num(swap, 0)}%</b>${bar(swap)}</div>
      <div><span class="small muted">Disco do sistema</span><b>${num(root, 0)}%</b>${bar(root)}</div>
      <div><span class="small muted">Guests</span><b>${n.guests_running ?? "–"} de ${n.guests_total ?? "–"}</b></div>
    </div>` : '<div class="empty">Nó sem resposta.</div>'}
  </section>`;
}

function topList(title, list, value, fmt, key) {
  const max = Math.max(1e-9, ...list.map(value));
  return `<div class="panel"><div class="panel-head"><h2>${title}</h2></div>
    ${list.length ? list.map((g) => `<div class="cost-row"><div class="cost-top"><b>${esc(g.name)} <span class="muted small">${g.type} ${g.vmid}</span></b><span>${fmt(g)}</span></div>
      <div class="bar"><i style="width:${(value(g) / max) * 100}%;background:var(--${key})"></i></div></div>`).join("") : '<div class="empty">Nada rodando.</div>'}</div>`;
}

function guestRows(i, guests) {
  const q = plain(PV.q.trim());
  let list = guests.filter((g) => (PV.type === "all" || g.type === PV.type) && (PV.status === "all" || (PV.status === "running") === (g.status === "running"))
    && (!q || plain(`${g.name} ${g.vmid} ${(g.tags || []).join(" ")} ${g.node}`).includes(q)));
  const key = { name: (g) => g.name || "", vmid: (g) => g.vmid, cpu: (g) => g.cpu || 0, mem: (g) => g.mem_used || 0,
    net: (g) => (g.netin || 0) + (g.netout || 0), io: (g) => (g.diskread || 0) + (g.diskwrite || 0), uptime: (g) => g.uptime || 0 }[PV.sort];
  list = list.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * PV.dir; });
  if (!list.length) return '<tr><td colspan="9" class="muted">Nenhum guest com esses filtros.</td></tr>';
  return list.map((g) => {
    const on = g.status === "running";
    const open = PV.open === g.vmid;
    const detail = open ? `<tr class="pv-detail"><td colspan="9"><div class="grid-3">
        <div><span class="small muted">CPU</span>${pvChart(i, g.node, [{ key: "cpu", label: "CPU %", unit: "%", color: cssv("--s1"), fill: true }], { vmid: g.vmid, gtype: g.type === "VM" ? "qemu" : "lxc", small: true })}</div>
        <div><span class="small muted">Memória</span>${pvChart(i, g.node, [{ key: "mem_used", label: "Usada", unit: " GB", color: cssv("--s3"), fill: true }, { key: "mem_total", label: "Total", unit: " GB", color: cssv("--s4") }], { vmid: g.vmid, gtype: g.type === "VM" ? "qemu" : "lxc", small: true })}</div>
        <div><span class="small muted">Rede</span>${pvChart(i, g.node, [{ key: "netin", label: "Entrada", unit: " Mbit/s", color: cssv("--s4"), fill: true }, { key: "netout", label: "Saída", unit: " Mbit/s", color: cssv("--s2") }], { vmid: g.vmid, gtype: g.type === "VM" ? "qemu" : "lxc", small: true })}</div>
      </div></td></tr>` : "";
    return `<tr class="${on ? "" : "is-stopped"} pv-row ${open ? "is-open" : ""}" data-pv-open="${g.vmid}" tabindex="0" title="Clique para ver os gráficos">
      <td><span class="dot ${on ? "online" : ""}"></span> <b>${esc(g.name)}</b> <span class="muted small">${g.vmid}</span>
        <div class="pv-tags">${(g.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${g.ha ? `<span class="tag ok" title="Alta disponibilidade">HA ${esc(g.ha)}</span>` : ""}${g.lock ? `<span class="tag warn">bloqueio: ${esc(g.lock)}</span>` : ""}</div></td>
      <td><span class="tag">${g.type}</span></td><td>${esc(g.node)}</td>
      <td class="cellbar">${on ? `<div class="pv-cell"><span><small>${num(g.cpu, 1)}% de ${g.cores}</small>${bar(g.cpu)}</span>${sparkSlot(`${i.id}.g${g.vmid}.cpu`, { w: 70, h: 22 })}</div>` : "<small>parado</small>"}</td>
      <td class="cellbar">${g.mem != null ? `<small>${esc(g.mem_text)}</small>${bar(g.mem)}` : "–"}</td>
      <td>${on ? `<div class="pv-cell"><small>↓ ${rate(g.netin)}<br>↑ ${rate(g.netout)}</small>${sparkSlot(`${i.id}.g${g.vmid}.net`, { w: 70, h: 22, color: "var(--s4)" })}</div>` : "–"}</td>
      <td><small>${on ? `L ${rate(g.diskread)}<br>E ${rate(g.diskwrite)}` : "–"}</small></td>
      <td class="cellbar">${g.disk != null ? `<small>${num(g.disk, 0)}%</small>${bar(g.disk)}` : "–"}</td>
      <td class="num">${uptime(g.uptime)}</td></tr>${detail}`;
  }).join("");
}

/* ---------- histórico do próprio Proxmox (RRD) ---------- */
function pvRrd(i, node, vmid, gtype) {
  const k = `${i.id}|${node}|${PV.tf}|${vmid || ""}|${gtype || ""}`, hit = PV.rrd[k];
  if (hit && Date.now() - hit.t < 55000) return hit.p;
  const p = api("GET", `/api/pve/rrd?iid=${encodeURIComponent(i.id)}&node=${encodeURIComponent(node)}&tf=${PV.tf}${vmid ? `&vmid=${vmid}&gtype=${gtype}` : ""}`);
  PV.rrd[k] = { t: Date.now(), p };
  p.catch(() => delete PV.rrd[k]);
  return p;
}
function pvChart(i, node, specs, opts = {}) {
  return `<div class="${opts.small ? "pv-chart-sm" : ""}">${chartBox(specs, { ...opts, data: pvRrd(i, node, opts.vmid, opts.gtype) })}</div>`;
}
const tfSelect = () => `<select class="pv-tf" aria-label="Período dos gráficos">${PV_TF.map(([v, t]) => `<option value="${v}" ${PV.tf === v ? "selected" : ""}>${t}</option>`).join("")}</select>`;

function statCard(label, icon, value, extra, foot) {
  return `<div class="panel pmx-card"><div class="pmx-card-top"><span>${label}</span><span class="pmx-ic">${dgIcon(icon)}</span></div>
    <div class="pmx-value">${value}</div>${extra || ""}<div class="small muted pmx-foot">${foot || ""}</div></div>`;
}

function pveView(i) {
  const d = i.details, nodes = d.nodes || [], guests = d.guests || [];
  if (!nodes.length) return empty("Nenhum nó encontrado.");
  if (!nodes.some((n) => n.name === PV.node)) PV.node = nodes[0].name;
  const n = nodes.find((x) => x.name === PV.node);
  const myGuests = guests.filter((g) => g.node === n.name), running = myGuests.filter((g) => g.status === "running");
  const evs = S.data.events.filter((e) => e.source === "proxmox");
  const health = evs.some((e) => e.level === "crit") ? ["crit", "Crítico"] : evs.some((e) => e.level === "warn") ? ["warn", "Atenção"] : ["ok", "Saudável"];
  setTimeout(loadSparks, 0);

  const head = `<div class="pmx-head">
      <div class="pmx-node">${dgIcon("server")}
        ${nodes.length > 1 ? `<select class="pv-node" aria-label="Nó">${nodes.map((x) => `<option value="${esc(x.name)}" ${x.name === n.name ? "selected" : ""}>Nó: ${esc(x.name)}${x.online ? "" : " (offline)"}</option>`).join("")}</select>` : `<b>Nó: ${esc(n.name)}</b>`}</div>
      <span class="tag ${health[0]} pmx-health" title="${esc(evs.map((e) => e.title).join(" · "))}">${health[0] === "ok" ? "✓" : "⚠"} ${health[1]}</span>
      <span class="muted">${n.online ? `Uptime: ${uptime(n.uptime)}` : "offline"}</span>
      ${d.cluster?.name ? `<span class="tag ${d.cluster.quorate ? "ok" : "crit"}">cluster ${esc(d.cluster.name)} · ${d.cluster.quorate ? "quórum ok" : "sem quórum"}</span>` : ""}
      <button class="btn pmx-refresh" data-pv-refresh>↻ Atualizar</button>
    </div>
    <nav class="pmx-tabs" role="tablist">${PV_TABS.map(([k, t]) => `<button role="tab" aria-selected="${PV.tab === k}" class="${PV.tab === k ? "on" : ""}" data-pv-tab="${k}">${t}</button>`).join("")}</nav>`;

  const memPct = ratio(n.mem_used, n.mem_total);
  const thr = 75;
  const tempTag = n.temp == null ? '<span class="tag">sem sensor</span>' : n.temp >= 85 ? '<span class="tag crit">Crítica</span>' : n.temp >= thr ? '<span class="tag warn">Alta</span>' : '<span class="tag ok">Normal</span>';
  const cards = `<div class="pmx-cards">
    ${statCard("Uso de CPU", "cpu", n.cpu == null ? "–" : `${num(n.cpu, 1)}%`, bar(n.cpu), `Tempo real · ${n.threads || n.cores || "–"} threads`)}
    ${statCard("Memória", "storage", `${num((n.mem_used || 0) / 1024 ** 3, 1)} GB`, bar(memPct), `<b class="${lvl(memPct) || "ok-text"}">${num(memPct, 1)}%</b> de ${bytes(n.mem_total)}`)}
    ${statCard("Temperatura", "thermo", n.temp == null ? "–" : `${num(n.temp, 0)}°C`, tempTag, n.temp == null ? 'Escolha a origem em <a href="#config">Configurações › Proxmox</a>' : `Leitura de ${esc(n.temp_src || "sensor")}`)}
    ${statCard("VMs e LXC ativos", "box", `${running.length}`, `<span class="tag ok">${running.length} rodando</span>`, `Total: ${myGuests.filter((g) => g.type === "VM").length} VMs, ${myGuests.filter((g) => g.type === "LXC").length} LXC`)}
  </div>`;

  const cpuChart = `<div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("activity")} Uso de CPU e carga</h2></div>
    ${pvChart(i, n.name, [{ key: "cpu", label: "CPU %", unit: "%", color: cssv("--s4"), fill: true }, { key: "load", label: "Carga média", color: cssv("--ok"), axis: "right" }], { tall: true })}</div>`;
  const memChart = `<div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("storage")} Memória</h2></div>
    ${pvChart(i, n.name, [{ key: "mem_total", label: "Total", unit: " GB", color: cssv("--s4") }, { key: "mem_used", label: "Usada", unit: " GB", color: cssv("--ok"), fill: true },
      { key: "arc", label: "ZFS ARC", unit: " GB", color: cssv("--s2") }, { key: "mem_avail", label: "Disponível", unit: " GB", color: cssv("--s1") }], { tall: true })}</div>`;
  const netChart = (tall) => `<div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("network")} Rede</h2><span class="muted">↓ ${rate(n.netin)} · ↑ ${rate(n.netout)}</span></div>
    ${pvChart(i, n.name, [{ key: "netin", label: "Entrada", unit: " Mbit/s", color: cssv("--s4"), fill: true }, { key: "netout", label: "Saída", unit: " Mbit/s", color: cssv("--s2"), fill: true }], { tall })}</div>`;
  const storages = (d.storages || []).filter((s) => s.node === n.name || s.shared);
  const stList = `<div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("storage")} Armazenamento</h2><span class="muted">${storages.length} storages</span></div>
    ${storages.map((s) => `<div class="store-row"><div class="cost-top"><b>${esc(s.name)} <span class="tag">${esc(s.type)}</span>${s.shared ? ' <span class="tag">compartilhado</span>' : ""}${s.status !== "available" ? ' <span class="tag crit">indisponível</span>' : ""}</b><span class="muted">${esc(s.text)}</span></div>
      ${bar(s.used, "thick")}<div class="small muted" style="margin-top:3px">${num(s.used, 1)}%${s.content ? ` · ${esc(String(s.content).replace(/,/g, ", "))}` : ""}</div></div>`).join("") || empty("Nenhum storage.")}</div>`;
  const disks = (d.disks || []).filter((k) => k.node === n.name);
  const diskTable = `<div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("storage")} Discos físicos</h2><span class="muted">SMART</span></div>
    ${disks.length ? `<div class="table-wrap"><table><thead><tr><th>Disco</th><th>Tipo</th><th class="num">Tamanho</th><th>Saúde</th><th>Desgaste</th></tr></thead><tbody>
      ${disks.map((k) => { const ok = ["PASSED", "OK"].includes(String(k.health).toUpperCase());
        return `<tr><td><b>${esc(k.dev)}</b><div class="small muted">${esc(k.model || "")}</div></td><td><span class="tag">${esc(String(k.type || "").toUpperCase())}</span></td>
          <td class="num">${k.size ? `${num(k.size / 1e9 >= 1000 ? k.size / 1e12 : k.size / 1e9, 1)} ${k.size / 1e9 >= 1000 ? "TB" : "GB"}` : "–"}</td>
          <td><span class="tag ${ok ? "ok" : k.health ? "crit" : ""}">${esc(k.health || "–")}</span></td>
          <td class="cellbar">${typeof k.wearout === "number" ? `<small>${k.wearout}%</small>${wearBar(k.wearout)}` : '<small class="muted">n/a</small>'}</td></tr>`; }).join("")}
      </tbody></table></div>` : empty("Sem dados de discos (permissão Sys.Audit ou SMART desligado).")}</div>`;
  const seg = (name, val, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-pv-${name}="${v}" class="${val === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const th = (k, label, cls = "") => `<th class="${cls} sortable" data-pv-sort="${k}" aria-sort="${PV.sort === k ? (PV.dir > 0 ? "ascending" : "descending") : "none"}">${label}${PV.sort === k ? (PV.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
  const guestTable = `<div class="panel">
      <div class="panel-head pv-guests-head"><h2 class="pmx-h">${dgIcon("box")} VMs e containers</h2><span class="muted">${running.length} de ${myGuests.length} rodando · clique numa linha para ver os gráficos</span>
        <input type="search" class="dg-search pv-q" placeholder="Buscar nome, ID ou tag" value="${esc(PV.q)}" aria-label="Buscar guests">
        ${seg("type", PV.type, [["all", "Todos"], ["VM", "VMs"], ["LXC", "LXC"]])}
        ${seg("status", PV.status, [["all", "Qualquer status"], ["running", "Rodando"], ["stopped", "Parados"]])}</div>
      <div class="table-wrap"><table class="pv-table"><thead><tr>
        ${th("name", "Nome")}<th>Tipo</th><th>Nó</th>${th("cpu", "CPU")}${th("mem", "Memória")}${th("net", "Rede")}${th("io", "Disco L/E")}<th>Uso do disco</th>${th("uptime", "Uptime", "num")}
      </tr></thead><tbody class="pv-rows" data-iid="${esc(i.id)}">${guestRows(i, guests.filter((g) => nodes.length === 1 || g.node === n.name))}</tbody></table></div></div>`;
  const ranks = `<div class="grid-3">
      ${topList("Mais CPU", [...running].sort((a, b) => b.cpu - a.cpu).slice(0, 5), (g) => g.cpu || 0, (g) => `${num(g.cpu, 1)}%`, "s1")}
      ${topList("Mais memória", [...running].sort((a, b) => (b.mem_used || 0) - (a.mem_used || 0)).slice(0, 5), (g) => g.mem_used || 0, (g) => bytes(g.mem_used), "s3")}
      ${topList("Mais rede", [...running].sort((a, b) => ((b.netin || 0) + (b.netout || 0)) - ((a.netin || 0) + (a.netout || 0))).slice(0, 5), (g) => (g.netin || 0) + (g.netout || 0), (g) => rate((g.netin || 0) + (g.netout || 0)), "s4")}
    </div>`;
  const tfRow = `<div class="pmx-tf"><span class="small muted">Histórico do Proxmox</span>${tfSelect()}</div>`;

  let body = "";
  if (PV.tab === "overview") body = `${cards}${tfRow}<div class="grid-2">${cpuChart}${memChart}</div><div class="grid-2">${stList}${netChart(false)}</div>`;
  if (PV.tab === "storage") body = `<div class="grid-2">${stList}${diskTable}</div>
      <div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("activity")} Disco do sistema e I/O wait</h2>${tfSelect()}</div>
        ${pvChart(i, n.name, [{ key: "iowait", label: "I/O wait %", unit: "%", color: cssv("--s2"), fill: true }, { key: "root_used", label: "Disco do sistema (GB)", unit: " GB", color: cssv("--s4"), axis: "right" }], { tall: true })}</div>`;
  if (PV.tab === "network") {
    const ifs = (d.ifaces || {})[n.name] || [];
    body = `${tfRow}${netChart(true)}
      <div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("network")} Interfaces</h2><span class="muted">${ifs.length}</span></div>
        ${ifs.length ? `<div class="table-wrap"><table><thead><tr><th>Interface</th><th>Tipo</th><th>Endereço</th><th>Gateway</th><th>Portas</th><th>Estado</th><th>Comentário</th></tr></thead><tbody>
          ${ifs.sort((a, b) => (a.type === "bridge" ? 0 : 1) - (b.type === "bridge" ? 0 : 1) || a.iface.localeCompare(b.iface)).map((x) => `<tr><td><b>${esc(x.iface)}</b>${x.vlan_aware ? ' <span class="tag">VLAN</span>' : ""}</td>
            <td><span class="tag">${esc(x.type || "")}</span></td><td>${esc(x.cidr || x.address || "–")}</td><td>${esc(x.gateway || "–")}</td><td>${esc(x.ports || "–")}</td>
            <td><span class="tag ${x.active ? "ok" : ""}">${x.active ? "ativa" : "inativa"}</span></td><td class="small muted">${esc(x.comments || "")}</td></tr>`).join("")}
          </tbody></table></div>` : empty("Sem dados de interfaces.")}</div>
      ${topList("Guests com mais rede", [...running].sort((a, b) => ((b.netin || 0) + (b.netout || 0)) - ((a.netin || 0) + (a.netout || 0))).slice(0, 8), (g) => (g.netin || 0) + (g.netout || 0), (g) => `↓ ${rate(g.netin)} · ↑ ${rate(g.netout)}`, "s4")}`;
  }
  if (PV.tab === "guests") body = `${ranks}${guestTable}`;
  if (PV.tab === "hardware") {
    const kv = (rows) => `<table class="kv"><tbody>${rows.filter((r) => r[1] != null && r[1] !== "").map(([k, v]) => `<tr><td class="muted">${k}</td><td><b>${v}</b></td></tr>`).join("")}</tbody></table>`;
    body = `<div class="grid-3">
        <div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("cpu")} Processador</h2></div>${kv([["Modelo", esc(n.model || "–")], ["Soquetes", n.sockets], ["Núcleos por soquete", n.cpu_cores], ["Threads", n.threads || n.cores], ["Frequência", n.mhz ? `${num(n.mhz / 1000, 2)} GHz` : null], ["Carga 1 · 5 · 15 min", (n.load || []).map((x) => num(x, 2)).join(" · ")], ["I/O wait", n.iowait != null ? `${num(n.iowait, 1)}%` : null]])}</div>
        <div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("storage")} Memória</h2></div>${kv([["Total", bytes(n.mem_total)], ["Usada", `${bytes(n.mem_used)} (${num(memPct, 1)}%)`], ["Disponível", n.mem_avail != null ? bytes(n.mem_avail) : null], ["ZFS ARC", n.arc != null ? bytes(n.arc) : null], ["Swap", n.swap_total ? `${bytes(n.swap_used)} de ${bytes(n.swap_total)}` : "sem swap"]])}</div>
        <div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("server")} Sistema</h2></div>${kv([["Proxmox VE", n.version], ["Kernel", esc(n.kernel || "")], ["Inicialização", n.boot ? `${String(n.boot).toUpperCase()}${n.secureboot ? " · Secure Boot" : ""}` : null], ["Disco do sistema", n.root_total ? `${bytes(n.root_used)} de ${bytes(n.root_total)}` : null], ["Uptime", uptime(n.uptime)], ["Temperatura", n.temp != null ? `${num(n.temp, 0)} °C (${esc(n.temp_src || "")})` : "sem sensor configurado"]])}</div>
      </div>${diskTable}`;
  }
  if (PV.tab === "logs") {
    const failed = (d.tasks || []).filter((x) => x.status && !["OK", "rodando"].includes(x.status) && !String(x.status).startsWith("WARNINGS"));
    body = `<div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("activity")} Tarefas recentes</h2><span class="muted">${(d.tasks || []).length} · ${failed.length} com erro</span></div>
      <div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Alvo</th><th>Nó</th><th>Usuário</th><th>Início</th><th class="num">Duração</th><th>Resultado</th></tr></thead><tbody>
      ${(d.tasks || []).slice(0, 30).map((x) => { const st = x.status === "OK" ? "ok" : x.status === "rodando" ? "" : String(x.status).startsWith("WARNINGS") ? "warn" : "crit";
        return `<tr><td>${esc(TASK_NAMES[x.type] || x.type)}</td><td>${esc(x.id || "–")}</td><td>${esc(x.node)}</td><td class="small">${esc(x.user || "")}</td>
          <td class="small">${dtime(x.start)}</td><td class="num">${x.end ? uptime(Math.max(60, x.end - x.start)) : "–"}</td>
          <td><span class="tag ${st}" title="${esc(x.status)}">${esc(String(x.status).length > 40 ? String(x.status).slice(0, 40) + "…" : x.status)}</span></td></tr>`; }).join("") || '<tr><td colspan="7" class="muted">Nenhuma tarefa recente.</td></tr>'}
      </tbody></table></div></div>
      ${S.me?.role === "admin" ? `<div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("code")} Log do sistema</h2><span class="muted">últimas 300 linhas de ${esc(n.name)}</span>
        <input type="search" class="dg-search" id="pv-logq" placeholder="Filtrar (ex.: error, vzdump)" value="${esc(PV.logQ)}" style="margin-left:auto"><button class="btn" data-pv-logs>Carregar</button></div>
        <pre class="pmx-log" id="pv-log" data-iid="${esc(i.id)}" data-node="${esc(n.name)}">Clique em Carregar para ler o log.</pre></div>` : ""}`;
  }
  return `<div class="stack pv">${head}${body}</div>`;
}

async function pvLoadLogs() {
  const pre = document.getElementById("pv-log");
  if (!pre) return;
  pre.textContent = "Carregando…";
  try {
    const r = await api("GET", `/api/pve/syslog?iid=${encodeURIComponent(pre.dataset.iid)}&node=${encodeURIComponent(pre.dataset.node)}`);
    PV.log = r.lines;
    pvFilterLogs();
  } catch (e) { pre.textContent = e.message; }
}
function pvFilterLogs() {
  const pre = document.getElementById("pv-log");
  if (!pre || !PV.log) return;
  const q = PV.logQ.trim().toLowerCase();
  const lines = PV.log.filter((l) => !q || l.toLowerCase().includes(q));
  pre.innerHTML = lines.map((l) => { const e = esc(l); return /error|fail|crit|panic/i.test(l) ? `<span class="log-err">${e}</span>` : /warn/i.test(l) ? `<span class="log-warn">${e}</span>` : e; }).join("\n") || "Nenhuma linha com esse filtro.";
  pre.scrollTop = pre.scrollHeight;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-pv-tab]");
  if (t) { PV.tab = t.dataset.pvTab; localStorage.setItem("hm.pvTab", PV.tab); render(); return; }
  if (e.target.closest("[data-pv-refresh]")) { PV.rrd = {}; load(); return; }
  if (e.target.closest("[data-pv-logs]")) { pvLoadLogs(); return; }
  const row = e.target.closest("[data-pv-open]");
  if (row && !e.target.closest("a,button,input")) { const v = Number(row.dataset.pvOpen); PV.open = PV.open === v ? null : v; pvRefreshRows(); }
});
document.addEventListener("change", (e) => {
  if (e.target.classList?.contains("pv-tf")) { PV.tf = e.target.value; localStorage.setItem("hm.pvTf", PV.tf); render(); }
  if (e.target.classList?.contains("pv-node")) { PV.node = e.target.value; localStorage.setItem("hm.pvNode", PV.node); PV.open = null; render(); }
});
document.addEventListener("input", (e) => { if (e.target.id === "pv-logq") { PV.logQ = e.target.value; pvFilterLogs(); } });
document.addEventListener("keydown", (e) => {
  const row = e.target.closest?.("[data-pv-open]");
  if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); row.click(); }
});

/* barra com limites próprios (desgaste do SSD: atenção 60%, crítico 80%) */
const wearBar = (v) => `<div class="bar"><i class="${lvl(v, 60, 80)}" style="width:${Math.max(0, Math.min(100, v || 0))}%"></i></div>`;

/* ---------- filtros e ordenação sem recarregar a página ---------- */
function pvRefreshRows() {
  document.querySelectorAll(".pv-rows").forEach((body) => {
    const i = S.data.instances.find((x) => x.id === body.dataset.iid);
    if (!i) return;
    const many = (i.details.nodes || []).length > 1;
    body.innerHTML = guestRows(i, (i.details.guests || []).filter((g) => !many || g.node === PV.node));
    fillSparks(body);
  });
}
document.addEventListener("input", (e) => { if (e.target.classList?.contains("pv-q")) { PV.q = e.target.value; document.querySelectorAll(".pv-q").forEach((x) => x !== e.target && (x.value = PV.q)); pvRefreshRows(); } });
document.addEventListener("click", (e) => {
  const s = e.target.closest("[data-pv-sort]");
  if (s) { const k = s.dataset.pvSort; PV.dir = PV.sort === k ? -PV.dir : (k === "name" || k === "vmid" ? 1 : -1); PV.sort = k; render(); return; }
  const ty = e.target.closest("[data-pv-type]");
  if (ty) { PV.type = ty.dataset.pvType; render(); return; }
  const st = e.target.closest("[data-pv-status]");
  if (st) { PV.status = st.dataset.pvStatus; render(); }
});
VIEWS.proxmox = pveView;
