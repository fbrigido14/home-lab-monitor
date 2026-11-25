/* Homelab Monitor — páginas PBS (Backups), UniFi (Rede) e Zabbix no padrão do ProxMenux */
const XP = {
  tab: JSON.parse(localStorage.getItem("hm.xtab") || "{}"), tf: JSON.parse(localStorage.getItem("hm.xtf") || "{}"),
  cache: {}, q: {}, f: {}, sel: {},
};
const TF_SRC = [["hour", "1 hora"], ["day", "24 horas"], ["week", "7 dias"], ["month", "30 dias"], ["year", "1 ano"]];
const TF_STORE = [["1h", "1 hora"], ["6h", "6 horas"], ["24h", "24 horas"], ["7d", "7 dias"], ["30d", "30 dias"]];
const SEV = { 0: ["", "Não classificado"], 1: ["", "Informação"], 2: ["warn", "Atenção"], 3: ["warn", "Média"], 4: ["crit", "Alta"], 5: ["crit", "Desastre"] };

/* ---------- peças comuns ---------- */
const xTab = (page, def) => XP.tab[page] || def;
const xTfVal = (page, def) => XP.tf[page] || def;
function xTabs(page, tabs, def) {
  const cur = xTab(page, def);
  return `<nav class="pmx-tabs" role="tablist" style="grid-template-columns:repeat(${tabs.length}, minmax(0, 1fr))">${tabs.map(([k, t]) =>
    `<button role="tab" aria-selected="${cur === k}" class="${cur === k ? "on" : ""}" data-x-tab="${page}|${k}">${t}</button>`).join("")}</nav>`;
}
const xTfSelect = (page, opts, def) => `<select class="pv-tf" data-x-tf="${page}" aria-label="Período dos gráficos">${opts.map(([v, t]) =>
  `<option value="${v}" ${xTfVal(page, def) === v ? "selected" : ""}>${t}</option>`).join("")}</select>`;
function xSeries(iid, kind, tf) {
  const k = `${iid}|${kind}|${tf}`, hit = XP.cache[k];
  if (hit && Date.now() - hit.t < 55000) return hit.p;
  const p = api("GET", `/api/series?iid=${encodeURIComponent(iid)}&kind=${encodeURIComponent(kind)}&tf=${tf}`);
  XP.cache[k] = { t: Date.now(), p };
  p.catch(() => delete XP.cache[k]);
  return p;
}
const xChart = (iid, kind, tf, specs, opts = {}) => `<div class="${opts.small ? "pv-chart-sm" : ""}">${chartBox(specs, { ...opts, data: xSeries(iid, kind, tf) })}</div>`;
const storeChart = (specs, range, opts = {}) => `<div class="${opts.small ? "pv-chart-sm" : ""}">${chartBox(specs, { ...opts,
  data: api("GET", `/api/history?range=${range}&keys=${specs.map((s) => encodeURIComponent(s.key)).join(",")}`) })}</div>`;
function xHealth(source) {
  const evs = S.data.events.filter((e) => e.source === source);
  const h = evs.some((e) => e.level === "crit") ? ["crit", "Crítico"] : evs.some((e) => e.level === "warn") ? ["warn", "Atenção"] : ["ok", "Saudável"];
  return `<span class="tag ${h[0]} pmx-health" title="${esc(evs.map((e) => e.title).join(" · "))}">${h[0] === "ok" ? "✓" : "⚠"} ${h[1]}</span>`;
}
const xHead = (icon, title, source, meta) => `<div class="pmx-head"><div class="pmx-node">${dgIcon(icon)}<b>${title}</b></div>${xHealth(source)}${meta || ""}
  <button class="btn pmx-refresh" data-x-refresh>↻ Atualizar</button></div>`;
const panel = (icon, title, body, right = "") => `<div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon(icon)} ${title}</h2>${right}</div>${body}</div>`;
const mbps = (v) => (v == null ? "–" : `${num(v, v < 10 ? 1 : 0)} Mbps`);

/* ======================= PBS ======================= */
function pbsView(i) {
  const d = i.details, page = "backups", tab = xTab(page, "overview"), tf = xTfVal(page, "day");
  const n = d.node || {}, stores = d.datastores || [], gc = d.gc || {}, groups = d.groups || [], jobs = d.jobs || [];
  const main = stores[0] || {}, g0 = gc[main.name] || {};
  const head = xHead("backup", `PBS: ${esc(i.name)}`, "backups",
    `<span class="muted">${n.version ? `versão ${esc(n.version)} · ` : ""}${n.uptime ? `Uptime: ${uptime(n.uptime)}` : ""}</span>`);
  const tabs = xTabs(page, [["overview", "Visão geral"], ["stores", "Datastores"], ["groups", "Grupos de backup"], ["jobs", "Jobs"], ["tasks", "Tarefas"]], "overview");
  const tfRow = `<div class="pmx-tf"><span class="small muted">Histórico do PBS</span>${xTfSelect(page, TF_SRC, "day")}</div>`;

  const cards = `<div class="pmx-cards">
    ${statCard("Último backup", "backup", ago(d.last_ok).replace("há ", ""), `<span class="tag ${d.ok_24h ? "ok" : "warn"}">${d.ok_24h} OK em 24 h</span>`, d.last_ok ? dtime(d.last_ok) : "nenhum backup encontrado")}
    ${statCard("Falhas em 24 h", "shield", `${d.failed_24h}`, `<span class="tag ${d.failed_24h ? "crit" : "ok"}">${d.failed_24h ? "verificar" : "tudo certo"}</span>`, `${d.stale || 0} grupo(s) sem backup recente`)}
    ${statCard(`Datastore ${esc(main.name || "")}`, "storage", main.used != null ? `${num(main.used, 1)}%` : "–", bar(main.used), `${esc(main.text || "")}${main.full_date ? ` · cheio em ${new Date(main.full_date * 1000).toLocaleDateString("pt-BR")}` : ""}`)}
    ${statCard("Deduplicação", "box", g0.dedup ? `${num(g0.dedup, 1)}×` : "–", g0.last_state ? `<span class="tag ${g0.last_state === "OK" ? "ok" : "crit"}">GC ${esc(g0.last_state)}</span>` : "", g0.last_end ? `GC ${ago(g0.last_end)}${g0.removed ? ` · ${bytes(g0.removed)} liberados` : ""}` : "sem dados de GC")}
  </div>`;

  const maxDay = Math.max(1, ...(d.days || []).map((x) => x.ok + x.fail));
  const perDay = panel("chart", "Backups por dia", `<div class="xbars">${(d.days || []).map((x) => `<div class="xbar" title="${x.ok} OK, ${x.fail} com falha">
      <div class="xbar-col"><i class="fail" style="height:${(x.fail / maxDay) * 100}%"></i><i class="ok" style="height:${(x.ok / maxDay) * 100}%"></i></div>
      <b>${x.ok + x.fail}</b><span>${new Date(x.day * 1000).toLocaleDateString("pt-BR", { weekday: "short" })}</span></div>`).join("")}</div>
    <div class="legend"><span><i style="background:var(--ok)"></i>OK</span><span><i style="background:var(--crit)"></i>Falha</span></div>`, '<span class="muted">últimos 7 dias</span>');
  const usage = panel("storage", "Ocupação do datastore", main.history?.length
    ? chartBox([{ key: "u", label: `${main.name} %`, unit: "%", color: cssv("--s4"), fill: true }], { leftMax: 100, data: { since: main.history[0][0], bucket: 86400, series: { u: main.history } } })
    : empty("Sem histórico de ocupação."), '<span class="muted">histórico do PBS</span>');

  let body = "";
  if (tab === "overview") body = `${cards}<div class="grid-2">${perDay}${usage}</div>${tfRow}<div class="grid-2">
    ${panel("activity", "Uso de CPU e carga", xChart(i.id, "node", tf, [{ key: "cpu", label: "CPU %", unit: "%", color: cssv("--s4"), fill: true }, { key: "load", label: "Carga média", color: cssv("--ok"), axis: "right" }]))}
    ${panel("network", "Rede", xChart(i.id, "node", tf, [{ key: "netin", label: "Entrada", unit: " Mbit/s", color: cssv("--s4"), fill: true }, { key: "netout", label: "Saída", unit: " Mbit/s", color: cssv("--s2"), fill: true }]))}</div>`;
  if (tab === "stores") body = `${tfRow}${stores.map((s) => { const g = gc[s.name] || {};
    return `<div class="panel"><div class="panel-head"><h2 class="pmx-h">${dgIcon("storage")} ${esc(s.name)}</h2><span class="muted">${esc(s.text)}</span></div>
      <div class="pv-meters" style="margin-bottom:14px">
        <div class="pv-meter"><div class="pv-meter-top"><span>Ocupação</span><b>${num(s.used, 1)}%</b></div>${bar(s.used, "thick")}<div class="small muted" style="margin-top:6px">${bytes(s.avail_b)} livres${s.full_date ? ` · cheio por volta de ${new Date(s.full_date * 1000).toLocaleDateString("pt-BR")}` : ""}</div></div>
        <div class="pv-meter"><div class="pv-meter-top"><span>Deduplicação</span><b>${g.dedup ? `${num(g.dedup, 1)}×` : "–"}</b></div><div class="small muted">Quanto os dados ocupariam sem deduplicação ÷ espaço real</div></div>
        <div class="pv-meter"><div class="pv-meter-top"><span>Coleta de lixo (GC)</span><b>${g.last_state ? esc(g.last_state) : "–"}</b></div><div class="small muted">${g.last_end ? `última ${ago(g.last_end)}` : ""}${g.next ? ` · próxima ${dtime(g.next)}` : ""}${g.pending ? ` · ${bytes(g.pending)} pendentes` : ""}</div></div>
      </div>
      <div class="grid-2"><div><span class="small muted">Espaço (GB)</span>${xChart(i.id, `ds:${s.name}`, tf, [{ key: "used", label: "Usado", unit: " GB", color: cssv("--s3"), fill: true }, { key: "total", label: "Total", unit: " GB", color: cssv("--s4") }], { small: true })}</div>
        <div><span class="small muted">Leitura e escrita (MB/s)</span>${xChart(i.id, `ds:${s.name}`, tf, [{ key: "read", label: "Leitura", unit: " MB/s", color: cssv("--s4"), fill: true }, { key: "write", label: "Escrita", unit: " MB/s", color: cssv("--s2"), fill: true }], { small: true })}</div></div>
    </div>`; }).join("") || empty("Nenhum datastore.")}`;
  if (tab === "groups") {
    const q = plain(XP.q[page] || ""), maxAge = 26 * 3600;
    const list = groups.filter((g) => !q || plain(`${g.type} ${g.id} ${g.comment || ""} ${g.store}`).includes(q));
    body = panel("box", "Grupos de backup", `<div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Datastore</th><th>Último backup</th><th class="num">Snapshots</th><th class="num">Tamanho</th><th>Verificação</th></tr></thead><tbody>
      ${list.map((g) => { const old = Date.now() / 1000 - g.last > maxAge;
        return `<tr><td><span class="tag">${esc(g.type)}</span> <b>${esc(g.id)}</b>${g.comment ? ` <span class="muted small">${esc(g.comment)}</span>` : ""}${g.ns ? ` <span class="tag">ns ${esc(g.ns)}</span>` : ""}</td>
          <td>${esc(g.store)}</td><td><span class="${old ? "tag warn" : ""}">${ago(g.last)}</span></td><td class="num">${g.count}${g.protected ? ` <span class="tag" title="protegidos">🔒 ${g.protected}</span>` : ""}</td>
          <td class="num">${bytes(g.size)}</td><td><span class="tag ${g.verify === "ok" ? "ok" : g.verify === "failed" ? "crit" : ""}">${g.verify === "ok" ? "verificado" : g.verify === "failed" ? "falhou" : "não verificado"}</span></td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">Nenhum grupo.</td></tr>'}
      </tbody></table></div>`, `<span class="muted">${groups.length} grupos</span><input type="search" class="dg-search" data-x-q="${page}" placeholder="Buscar VM, CT ou comentário" value="${esc(XP.q[page] || "")}" style="margin-left:auto">`);
  }
  if (tab === "jobs") body = panel("settings", "Jobs agendados", `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Job</th><th>Datastore</th><th>Agenda</th><th>Último resultado</th><th>Última execução</th><th>Próxima</th></tr></thead><tbody>
      ${jobs.map((j) => `<tr><td>${esc(j.kind)}</td><td><b>${esc(j.id)}</b>${j.comment ? `<div class="small muted">${esc(j.comment)}</div>` : ""}${j.remote ? `<div class="small muted">remoto: ${esc(j.remote)}</div>` : ""}</td>
        <td>${esc(j.store || "–")}</td><td><code>${esc(j.schedule || "–")}</code></td>
        <td><span class="tag ${j.last_state === "OK" ? "ok" : !j.last_state ? "" : String(j.last_state).startsWith("WARN") ? "warn" : "crit"}" title="${esc(j.last_state || "")}">${esc(String(j.last_state || "nunca rodou").slice(0, 40))}</span></td>
        <td class="small">${j.last_end ? ago(j.last_end) : "–"}</td><td class="small">${j.next ? dtime(j.next) : "–"}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">Nenhum job de verificação, sincronização ou limpeza.</td></tr>'}
    </tbody></table></div>`);
  if (tab === "tasks") {
    const ty = XP.f[`${page}.type`] || "all", only = XP.f[`${page}.fail`] || "all";
    const list = (d.tasks || []).filter((t) => (ty === "all" || t.type === ty) && (only === "all" || !["OK", "rodando"].includes(t.status)));
    const seg = (key, val, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-x-f="${page}.${key}|${v}" class="${val === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
    body = panel("activity", "Tarefas dos últimos 7 dias", `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Alvo</th><th>Início</th><th class="num">Duração</th><th>Usuário</th><th>Resultado</th></tr></thead><tbody>
      ${list.slice(0, 80).map((t) => { const st = t.status === "OK" ? "ok" : t.status === "rodando" ? "" : String(t.status).startsWith("WARN") ? "warn" : "crit";
        return `<tr><td>${esc(t.type)}</td><td>${esc(t.target)}</td><td class="small">${dtime(t.start)}</td><td class="num">${t.end ? uptime(Math.max(60, t.end - t.start)) : "–"}</td>
          <td class="small">${esc(t.user || "")}</td><td><span class="tag ${st}" title="${esc(t.status)}">${esc(String(t.status).slice(0, 44))}</span></td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">Nenhuma tarefa com esses filtros.</td></tr>'}
      </tbody></table></div>`, `${seg("type", ty, [["all", "Todas"], ["Backup", "Backup"], ["Verificação", "Verificação"], ["GC", "GC"], ["Prune", "Prune"], ["Sync", "Sync"]])}
      ${seg("fail", only, [["all", "Qualquer resultado"], ["fail", "Só falhas"]])}`);
  }
  return `<div class="stack pv">${head}${tabs}${body}</div>`;
}

/* ======================= UniFi ======================= */
function unifiView(i) {
  const u = i.details, w = u.wan || {}, page = "rede", tab = xTab(page, "overview"), rng = xTfVal(page, "24h");
  const devs = u.devices || [], radios = u.radios || [], clients = u.client_list || [], st = u.speedtest;
  const head = xHead("router", `Rede: ${esc(u.gateway || i.name)}`, "rede",
    `<span class="muted">${w.isp ? `${esc(w.isp)} · ` : ""}${w.uptime ? `Internet há ${uptime(w.uptime)}` : ""}</span>`);
  const tabs = xTabs(page, [["overview", "Visão geral"], ["devices", "Dispositivos"], ["wifi", "Wi-Fi"], ["clients", "Clientes"]], "overview");
  const tfRow = `<div class="pmx-tf"><span class="small muted">Histórico gravado pela dashboard</span>${xTfSelect(page, TF_STORE, "24h")}</div>`;
  const legacyNote = u.legacy ? "" : '<div class="banner">A API clássica da UniFi não respondeu com esta chave; rádios, canais e detalhes dos clientes ficam limitados.</div>';

  const cards = `<div class="pmx-cards">
    ${statCard("Download agora", "globe", mbps(w.rx_mbps), "", st ? `Teste: ${mbps(st.down)} · ${ago(st.at)}` : "via Gateway")}
    ${statCard("Upload agora", "globe", mbps(w.tx_mbps), "", st ? `Teste: ${mbps(st.up)}${st.ping != null ? ` · ping ${st.ping} ms` : ""}` : "via Gateway")}
    ${statCard("Latência", "activity", w.latency != null ? `${num(w.latency, 0)} ms` : "–", `<span class="tag ${(w.latency || 0) > 60 ? "warn" : "ok"}">${(w.latency || 0) > 60 ? "alta" : "normal"}</span>`, w.drops != null ? `${w.drops} queda(s) da internet` : "")}
    ${statCard("Clientes", "users", `${num(u.clients, 0)}`, `<span class="tag ok">${num(u.wifi_clients, 0)} Wi-Fi</span> <span class="tag">${num(u.wired_clients, 0)} cabo</span>`, `${devs.filter((d) => d.kind === "ap").length} access point(s)`)}
  </div>`;
  const wanChart = panel("network", "Tráfego da internet", storeChart([{ key: `${i.id}.wan.rx`, label: "Download", unit: " Mbps", color: cssv("--s4"), fill: true },
    { key: `${i.id}.wan.tx`, label: "Upload", unit: " Mbps", color: cssv("--s2"), fill: true }], rng, { tall: true }));
  const cliChart = panel("users", "Clientes conectados", storeChart([{ key: `${i.id}.wifi`, label: "Wi-Fi", color: cssv("--s4"), fill: true }, { key: `${i.id}.wired`, label: "Cabo", color: cssv("--s3") }], rng));
  const latChart = panel("activity", "Latência da internet", storeChart([{ key: `${i.id}.wan.latency`, label: "Latência", unit: " ms", color: cssv("--s2"), fill: true }], rng));
  const cuKeys = radios.filter((r) => r.util != null).map((r, k) => ({ key: `${r.ap_id}.cu.${r.band.toLowerCase().replace(/[^0-9a-z]/g, "")}`, label: `${r.ap} ${r.band}`, unit: "%", color: cssv(["--s4", "--s2", "--s3", "--s1"][k % 4]) }));
  const cuChart = panel("wifi", "Utilização dos canais", cuKeys.length ? storeChart(cuKeys, rng, { leftMax: 100 }) : empty("Sem dados de utilização de canal (precisa da API clássica)."));

  let body = "";
  if (tab === "overview") body = `${legacyNote}${cards}${tfRow}${wanChart}<div class="grid-3">${cliChart}${latChart}${cuChart}</div>`;
  if (tab === "devices") body = `${tfRow}<div class="pv-nodes">${devs.map((d) => `<section class="panel pv-node ${d.online ? "" : "is-off"}">
      <header class="pv-node-head"><span class="dot ${d.online ? "online" : "offline"}"></span><h2>${esc(d.name)}</h2><span class="tag">${esc(d.model_name || d.model)}</span>
        ${d.version ? `<span class="tag">v${esc(d.version)}</span>` : ""}${d.upgradable ? '<span class="tag warn">atualização disponível</span>' : ""}
        <span class="muted small" style="margin-left:auto">${d.online ? `ligado há ${uptime(d.uptime)}` : "offline"}</span></header>
      <p class="small muted pv-cpu-model">${esc(d.ip || "")}${d.uplink ? ` · uplink ${esc(d.uplink)}${d.uplink_name ? ` (${esc(d.uplink_name)})` : ""}` : ""}${d.ports_total ? ` · ${d.ports_up}/${d.ports_total} portas ativas` : ""}</p>
      <div class="pv-node-foot" style="border:0;padding:0;margin:0 0 10px">
        <div><span class="small muted">CPU</span><b>${num(d.cpu, 0)}%</b>${bar(d.cpu)}</div><div><span class="small muted">Memória</span><b>${num(d.mem, 0)}%</b>${bar(d.mem)}</div>
        <div><span class="small muted">Temperatura</span><b>${d.temp != null ? `${num(d.temp, 0)} °C` : "–"}</b></div>
        <div><span class="small muted">Clientes${d.satisfaction != null ? " · satisfação" : ""}</span><b>${d.clients ?? "–"}${d.satisfaction != null ? ` · ${d.satisfaction}%` : ""}</b></div></div>
      ${storeChart([{ key: `${d.id}.cpu`, label: "CPU %", unit: "%", color: cssv("--s4"), fill: true }, { key: `${d.id}.mem`, label: "Memória %", unit: "%", color: cssv("--s3") },
        ...(d.temp != null ? [{ key: `${d.id}.temp`, label: "Temp °C", unit: " °C", color: cssv("--s2"), axis: "right" }] : [])], rng, { small: true, leftMax: 100 })}
    </section>`).join("") || empty("Nenhum dispositivo.")}</div>`;
  if (tab === "wifi") {
    const bands = {};
    clients.filter((c) => !c.wired).forEach((c) => { const b = c.band || "?"; bands[b] = (bands[b] || 0) + 1; });
    body = `${legacyNote}${panel("wifi", "Rádios", `<div class="table-wrap"><table><thead><tr><th>Access point</th><th>Banda</th><th class="num">Canal</th><th class="num">Largura</th><th>Utilização do canal</th><th class="num">Clientes</th><th class="num">Satisfação</th><th class="num">Potência</th><th class="num">Retransmissões</th></tr></thead><tbody>
      ${radios.map((r) => `<tr><td><b>${esc(r.ap)}</b></td><td><span class="tag">${esc(r.band)}</span></td><td class="num">${r.channel ?? "–"}</td><td class="num">${r.width ? `${r.width} MHz` : "–"}</td>
        <td class="cellbar">${r.util != null ? `<small>${num(r.util, 0)}%${r.self_util != null ? ` (seu tráfego ${num(r.self_util, 0)}%)` : ""}</small>${bar(r.util, "", 50, 70)}` : "–"}</td>
        <td class="num">${r.clients ?? "–"}</td><td class="num">${r.satisfaction != null ? `<span class="tag ${r.satisfaction >= 80 ? "ok" : r.satisfaction >= 60 ? "warn" : "crit"}">${r.satisfaction}%</span>` : "–"}</td>
        <td class="num">${r.tx_power != null ? `${r.tx_power} dBm` : "–"}</td><td class="num">${r.retries != null ? `<span class="tag ${lvl(r.retries, 10, 20)}">${num(r.retries, 1)}%</span>` : "–"}</td></tr>`).join("") || '<tr><td colspan="9" class="muted">Nenhum rádio.</td></tr>'}
      </tbody></table></div>`)}
      <div class="grid-2">${cuChart}${panel("users", "Clientes por banda", Object.keys(bands).length ? Object.entries(bands).map(([b, n]) => `<div class="cost-row"><div class="cost-top"><b>${esc(b)}</b><span>${n}</span></div><div class="bar"><i style="width:${(n / Math.max(...Object.values(bands))) * 100}%"></i></div></div>`).join("") : empty("Sem clientes Wi-Fi."))}</div>
      <div class="pmx-tf">${xTfSelect(page, TF_STORE, "24h")}</div>`;
  }
  if (tab === "clients") {
    const q = plain(XP.q[page] || ""), kind = XP.f[`${page}.kind`] || "all", sort = XP.f[`${page}.sort`] || "traffic";
    let list = clients.filter((c) => (kind === "all" || (kind === "wifi") === !c.wired) && (!q || plain(`${c.name} ${c.ip} ${c.mac} ${c.vendor || ""} ${c.via || ""}`).includes(q)));
    const key = { traffic: (c) => -((c.rx || 0) + (c.tx || 0)), name: (c) => String(c.name || "").toLowerCase(), signal: (c) => -(c.signal ?? -999) }[sort];
    list = list.sort((a, b) => { const x = key(a), y = key(b); return typeof x === "string" ? x.localeCompare(y) : x - y; });
    const seg = (k, val, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-x-f="${page}.${k}|${v}" class="${val === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
    const sig = (s) => s == null ? "–" : `<span class="tag ${s >= -60 ? "ok" : s >= -70 ? "" : s >= -78 ? "warn" : "crit"}">${s} dBm</span>`;
    body = panel("users", "Clientes", `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>IP</th><th>Conexão</th><th>Sinal</th><th class="num">Satisfação</th><th class="num">↓ / ↑</th><th class="num">Conectado há</th></tr></thead><tbody>
      ${list.slice(0, 300).map((c) => `<tr><td><span class="dot online"></span> <b>${esc(c.name)}</b><div class="small muted">${esc(c.vendor || "")}${c.mac ? ` · ${esc(c.mac)}` : ""}</div></td>
        <td>${esc(c.ip || "–")}</td>
        <td>${c.wired ? `<span class="tag">cabo</span> ${esc(c.via || "")}${c.port ? ` porta ${c.port}` : ""}` : `<span class="tag ok">Wi-Fi</span> ${esc(c.via || "")}<div class="small muted">${[c.essid, c.band, c.channel ? `canal ${c.channel}` : null, c.proto ? `802.11${c.proto}` : null].filter(Boolean).map(esc).join(" · ")}</div>`}</td>
        <td>${c.wired ? "–" : sig(c.signal)}</td><td class="num">${c.satisfaction != null ? `${c.satisfaction}%` : "–"}</td>
        <td class="num small">${c.rx != null ? `${rate(c.rx)}<br>${rate(c.tx)}` : "–"}</td><td class="num">${c.uptime ? uptime(c.uptime) : c.since ? ago(Date.parse(c.since) / 1000) : "–"}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">Nenhum cliente com esses filtros.</td></tr>'}
      </tbody></table></div>`, `<span class="muted">${list.length} de ${clients.length}</span>
      <input type="search" class="dg-search" data-x-q="${page}" placeholder="Buscar nome, IP, MAC ou fabricante" value="${esc(XP.q[page] || "")}" style="margin-left:auto">
      ${seg("kind", kind, [["all", "Todos"], ["wifi", "Wi-Fi"], ["wired", "Cabo"]])}${seg("sort", sort, [["traffic", "Mais tráfego"], ["signal", "Melhor sinal"], ["name", "Nome"]])}`);
  }
  return `<div class="stack pv">${head}${tabs}${body}</div>`;
}

/* ======================= Zabbix ======================= */
function zabbixView(i) {
  const z = i.details, page = "zabbix", tab = xTab(page, "overview"), tf = xTfVal(page, "day"), rng = xTfVal(`${page}.store`, "24h");
  const hostsL = z.host_list || [], probs = z.problems || [], sc = z.sev_count || {}, perf = z.perf || {};
  const up = hostsL.filter((h) => h.available === "up").length, down = hostsL.filter((h) => h.available === "down");
  const fleet = S.data.hosts.filter((h) => i.host_ids.includes(h.id));
  const head = xHead("activity", `Zabbix ${esc(z.version || "")}`, "zabbix", `<span class="muted">${num(z.hosts, 0)} hosts monitorados</span>`);
  const tabs = xTabs(page, [["overview", "Visão geral"], ["problems", "Problemas"], ["hosts", "Hosts"]], "overview");
  const sevTags = [5, 4, 3, 2, 1].filter((k) => sc[k]).map((k) => `<span class="tag ${SEV[k][0]}">${sc[k]} ${SEV[k][1].toLowerCase()}</span>`).join(" ");
  const cards = `<div class="pmx-cards">
    ${statCard("Problemas ativos", "bell", `${probs.length}`, sevTags || '<span class="tag ok">nenhum</span>', `${probs.filter((p) => p.ack).length} reconhecido(s)`)}
    ${statCard("Hosts disponíveis", "server", `${up} de ${hostsL.length}`, down.length ? `<span class="tag crit">${down.length} sem agente</span>` : '<span class="tag ok">todos respondendo</span>', down.map((h) => esc(h.name)).slice(0, 3).join(", "))}
    ${statCard("Fila do servidor", "box", perf.queue != null ? `${num(perf.queue, 0)}` : "–", `<span class="tag ${(perf.queue || 0) > 100 ? "warn" : "ok"}">${(perf.queue || 0) > 100 ? "atrasada" : "em dia"}</span>`, "itens aguardando coleta há mais de 6 s")}
    ${statCard("Valores por segundo", "chart", perf.nvps != null ? num(perf.nvps, 1) : "–", "", perf.unsupported != null ? `${num(perf.unsupported, 0)} itens não suportados` : "desempenho necessário")}
  </div>`;
  const hostCharts = (hid, name) => `<div class="grid-2">
    ${panel("activity", `CPU e memória · ${esc(name)}`, xChart(i.id, `host:${hid}`, tf, [{ key: "cpu", label: "CPU %", unit: "%", color: cssv("--s4"), fill: true }, { key: "mem", label: "Memória %", unit: "%", color: cssv("--s3") }, { key: "disk", label: "Disco %", unit: "%", color: cssv("--s1") }], { leftMax: 100 }))}
    ${panel("network", `Rede e temperatura · ${esc(name)}`, xChart(i.id, `host:${hid}`, tf, [{ key: "netin", label: "Entrada", unit: " Mbit/s", color: cssv("--s4"), fill: true }, { key: "netout", label: "Saída", unit: " Mbit/s", color: cssv("--s2") }, { key: "temp", label: "Temp °C", unit: " °C", color: cssv("--crit"), axis: "right" }]))}</div>`;
  const tfRow = `<div class="pmx-tf"><span class="small muted">Histórico do Zabbix</span>${xTfSelect(page, TF_SRC.slice(0, 4), "day")}</div>`;

  let body = "";
  if (tab === "overview") body = `${cards}<div class="grid-2">
      ${panel("bell", "Problemas ao longo do tempo", storeChart([{ key: `${i.id}.problems`, label: "Todos", color: cssv("--warn"), fill: true }, { key: `${i.id}.problems.high`, label: "Alta ou desastre", color: cssv("--crit") }], rng), xTfSelect(`${page}.store`, TF_STORE, "24h"))}
      ${panel("chart", "Desempenho do servidor", storeChart([{ key: `${i.id}.nvps`, label: "Valores/s", color: cssv("--s4"), fill: true }, { key: `${i.id}.queue`, label: "Fila", color: cssv("--s2"), axis: "right" }], rng))}</div>
    ${fleet.length ? `${tfRow}${fleet.map((h) => hostCharts(h.zbx_hostid, h.name)).join("")}` : ""}`;
  if (tab === "problems") {
    const min = Number(XP.f[`${page}.min`] ?? 0), ack = XP.f[`${page}.ack`] || "all";
    const list = probs.filter((p) => p.severity >= min && (ack === "all" || (ack === "yes") === !!p.ack)).sort((a, b) => b.severity - a.severity || b.since - a.since);
    const seg = (k, val, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-x-f="${page}.${k}|${v}" class="${String(val) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
    body = panel("bell", "Problemas", `<div class="table-wrap"><table><thead><tr><th>Severidade</th><th>Problema</th><th>Host</th><th>Desde</th><th class="num">Duração</th><th>Status</th></tr></thead><tbody>
      ${list.map((p) => `<tr><td><span class="tag ${SEV[p.severity][0]}">${esc(SEV[p.severity][1])}</span></td><td><b>${esc(p.title)}</b></td><td>${esc(p.host)}</td>
        <td class="small">${dtime(p.since)}</td><td class="num">${uptime(Math.max(60, Date.now() / 1000 - p.since))}</td>
        <td>${p.ack ? '<span class="tag ok">reconhecido</span>' : '<span class="tag">não reconhecido</span>'}${p.suppressed ? ' <span class="tag">suprimido</span>' : ""}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">Nenhum problema com esses filtros.</td></tr>'}
      </tbody></table></div>`, `${seg("min", min, [[0, "Todos"], [2, "Atenção ou mais"], [3, "Média ou mais"], [4, "Alta ou mais"]])}${seg("ack", ack, [["all", "Todos"], ["no", "Não reconhecidos"], ["yes", "Reconhecidos"]])}`);
  }
  if (tab === "hosts") {
    const q = plain(XP.q[page] || ""), sel = XP.sel[page];
    const list = hostsL.filter((h) => !q || plain(`${h.name} ${h.tech} ${h.ip || ""}`).includes(q));
    const selH = hostsL.find((h) => h.id === sel);
    body = `${panel("server", "Hosts", `<div class="table-wrap"><table class="pv-table"><thead><tr><th>Host</th><th>IP</th><th>Agente</th><th class="num">Problemas</th><th>Pior severidade</th></tr></thead><tbody>
        ${list.map((h) => `<tr class="pv-row ${sel === h.id ? "is-open" : ""}" data-x-sel="${page}|${esc(h.id)}" tabindex="0" title="Ver gráficos">
          <td><span class="dot ${h.available === "up" ? "online" : h.available === "down" ? "offline" : ""}"></span> <b>${esc(h.name)}</b>${h.maintenance ? ' <span class="tag warn">manutenção</span>' : ""}${h.tech !== h.name ? `<div class="small muted">${esc(h.tech)}</div>` : ""}</td>
          <td>${esc(h.ip || "–")}</td><td><span class="tag ${h.available === "up" ? "ok" : h.available === "down" ? "crit" : ""}">${h.available === "up" ? "disponível" : h.available === "down" ? "indisponível" : "desconhecido"}</span></td>
          <td class="num">${h.problems}</td><td>${h.worst != null ? `<span class="tag ${SEV[h.worst][0]}">${esc(SEV[h.worst][1])}</span>` : "–"}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Nenhum host.</td></tr>'}
      </tbody></table></div>`, `<span class="muted">clique num host para ver os gráficos</span><input type="search" class="dg-search" data-x-q="${page}" placeholder="Buscar host ou IP" value="${esc(XP.q[page] || "")}" style="margin-left:auto">`)}
      ${selH ? `${tfRow}${hostCharts(selH.id, selH.name)}` : ""}`;
  }
  return `<div class="stack pv">${head}${tabs}${body}</div>`;
}

/* ---------- eventos ---------- */
const saveX = () => { localStorage.setItem("hm.xtab", JSON.stringify(XP.tab)); localStorage.setItem("hm.xtf", JSON.stringify(XP.tf)); };
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-x-tab]");
  if (t) { const [p, k] = t.dataset.xTab.split("|"); XP.tab[p] = k; saveX(); render(); return; }
  const f = e.target.closest("[data-x-f]");
  if (f) { const [k, v] = f.dataset.xF.split("|"); XP.f[k] = v; render(); return; }
  const s = e.target.closest("[data-x-sel]");
  if (s) { const [p, v] = s.dataset.xSel.split("|"); XP.sel[p] = XP.sel[p] === v ? null : v; render(); return; }
  if (e.target.closest("[data-x-refresh]")) { XP.cache = {}; load(); }
});
document.addEventListener("change", (e) => { const t = e.target.closest?.("[data-x-tf]"); if (t) { XP.tf[t.dataset.xTf] = t.value; saveX(); render(); } });
document.addEventListener("input", (e) => {
  const q = e.target.closest?.("[data-x-q]");
  if (!q) return;
  XP.q[q.dataset.xQ] = q.value;
  clearTimeout(XP.qt);
  XP.qt = setTimeout(() => { const pos = q.selectionStart; render(); const n = document.querySelector(`[data-x-q="${q.dataset.xQ}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250);
});
document.addEventListener("keydown", (e) => { const r = e.target.closest?.("[data-x-sel]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.click(); } });
Object.assign(VIEWS, { backups: pbsView, rede: unifiView, zabbix: zabbixView });

/* ======================= Mídia (Emby e Jellyfin) ======================= */
const mmss = (s) => { if (s == null) return "–"; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
const poster = (i, id, cls = "") => (i.details.posters && id ? `<img class="poster ${cls}" loading="lazy" alt="" src="/api/media/${encodeURIComponent(i.id)}/image/${encodeURIComponent(id)}?w=300">`
  : `<span class="poster ph ${cls}">${dgIcon("play")}</span>`);

function mediaView(i) {
  const d = i.details, page = `midia.${i.id}`, tab = xTab(page, "overview"), rng = xTfVal(page, "24h");
  const c = d.counts || {}, ses = d.sessions || [], users = d.users || [];
  const head = xHead("play", `${esc(d.product || i.name)}: ${esc(d.server || i.name)}`, "midia",
    `<span class="muted">versão ${esc(d.version || "")}${d.os ? ` · ${esc(d.os)}` : ""}</span>${d.update ? '<span class="tag warn">atualização disponível</span>' : ""}${d.restart ? '<span class="tag warn">reinício pendente</span>' : ""}`);
  const tabs = xTabs(page, [["overview", "Visão geral"], ["library", "Biblioteca"], ["activity", "Usuários e atividade"], ["tasks", "Tarefas agendadas"]], "overview");
  const cards = `<div class="pmx-cards">
    ${statCard("Reproduzindo agora", "play", `${ses.length}`, d.transcoding ? `<span class="tag warn">${d.transcoding} transcodificando</span>` : `<span class="tag ok">${ses.length ? "tudo direto" : "ninguém assistindo"}</span>`, ses.filter((s) => s.paused).length ? `${ses.filter((s) => s.paused).length} pausado(s)` : "")}
    ${statCard("Banda em uso", "network", `${num(d.bandwidth || 0, 1)} Mbps`, "", ses.length ? ses.map((s) => `${esc(s.user)} ${num(s.bitrate, 0)}`).join(" · ") : "sem streams")}
    ${statCard("Biblioteca", "folder", `${num(c.MovieCount, 0)} filmes`, "", `${num(c.SeriesCount, 0)} séries · ${num(c.EpisodeCount, 0)} episódios${c.SongCount ? ` · ${num(c.SongCount, 0)} músicas` : ""}`)}
    ${statCard("Usuários", "users", `${d.users_active ?? "–"} de ${users.length}`, d.logins_failed_24h ? `<span class="tag ${d.logins_failed_24h >= 3 ? "crit" : "warn"}">${d.logins_failed_24h} falha(s) de login</span>` : '<span class="tag ok">sem falhas de login</span>', "ativos nas últimas 24 h")}
  </div>`;
  const nowPlaying = panel("play", "Reproduzindo agora", ses.length ? `<div class="np-list">${ses.map((s) => `<div class="np">
      ${poster(i, s.image)}
      <div class="np-body"><b>${esc(s.title)}</b>${s.year ? ` <span class="muted small">${s.year}</span>` : ""}
        <div class="small muted">${esc(s.user)} · ${esc(s.client)} em ${esc(s.device)}${s.ip ? ` · ${esc(s.ip)}` : ""}</div>
        <div class="np-tags"><span class="tag ${s.method === "Transcode" ? "warn" : "ok"}">${s.method === "Transcode" ? "Transcodificando" : s.method === "DirectStream" ? "Stream direto" : "Reprodução direta"}</span>
          ${s.paused ? '<span class="tag">pausado</span>' : ""}${s.bitrate ? `<span class="tag">${num(s.bitrate, 1)} Mbps</span>` : ""}
          ${s.source ? `<span class="tag">${esc(s.source)}${s.target ? ` → ${esc(s.target)}` : ""}</span>` : ""}${s.audio ? `<span class="tag">${esc(s.audio)}</span>` : ""}${s.hw ? `<span class="tag">GPU ${esc(s.hw)}</span>` : ""}</div>
        ${s.transcode_reason ? `<div class="small" style="color:var(--warn)">${esc(s.transcode_reason)}</div>` : ""}
        <div class="np-prog">${bar(s.progress)}<span class="small muted">${mmss(s.position)} de ${mmss(s.runtime)}</span></div>
      </div></div>`).join("")}</div>` : empty("Ninguém assistindo agora."));
  const tfRow = `<div class="pmx-tf"><span class="small muted">Histórico gravado pela dashboard</span>${xTfSelect(page, TF_STORE, "24h")}</div>`;

  let body = "";
  if (tab === "overview") body = `${cards}${nowPlaying}${tfRow}<div class="grid-2">
    ${panel("play", "Streams", storeChart([{ key: `${i.id}.streams`, label: "Streams", color: cssv("--s4"), fill: true }, { key: `${i.id}.transcodes`, label: "Transcodificando", color: cssv("--warn") }], rng))}
    ${panel("network", "Banda", storeChart([{ key: `${i.id}.bandwidth`, label: "Banda", unit: " Mbps", color: cssv("--s2"), fill: true }], rng))}</div>`;
  if (tab === "library") body = `<div class="lib-grid">${(d.libraries || []).map((l) => `<div class="panel lib"><div class="pmx-card-top"><span>${esc(l.kind || "")}</span><span class="pmx-ic">${dgIcon("folder")}</span></div>
      <div class="pmx-value">${esc(l.name)}</div><div class="small muted">${l.count != null ? `${num(l.count, 0)} itens` : ""}${(l.paths || []).length ? ` · ${l.paths.map(esc).join(", ")}` : ""}</div></div>`).join("") || empty("Nenhuma biblioteca.")}</div>
    ${panel("image", "Adicionados recentemente", `<div class="poster-grid">${(d.recent || []).map((r) => `<div class="pg-item">${poster(i, r.image)}
      <b>${esc(r.series || r.title)}</b><span class="small muted">${r.series ? `T${r.season ?? "?"}E${r.episode ?? "?"} · ${esc(r.title)}` : r.year || ""}</span><span class="small muted">${ago(r.added)}</span></div>`).join("") || empty("Nada adicionado recentemente.")}</div>`)}`;
  if (tab === "activity") body = `<div class="grid-2">
    ${panel("users", "Usuários", `<div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Última atividade</th></tr></thead><tbody>
      ${users.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${u.admin ? '<span class="tag warn">administrador</span>' : '<span class="tag">usuário</span>'}${u.disabled ? ' <span class="tag">desativado</span>' : ""}</td><td>${u.last ? ago(u.last) : "nunca"}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Nenhum usuário.</td></tr>'}
      </tbody></table></div>`)}
    ${panel("activity", "Log de atividade", `<div class="feed" style="max-height:520px">${(d.activity || []).map((a) => { const bad = /fail|error/i.test(`${a.type} ${a.severity}`);
      return `<div class="ev ${bad ? "crit" : "info"}"><div class="ev-ic">${bad ? "!" : "i"}</div><div><b>${esc(a.name)}</b><span>${a.when ? dtime(a.when) : ""}${a.overview ? ` · ${esc(a.overview)}` : ""}</span></div></div>`; }).join("") || empty("Sem atividade.")}</div>`)}</div>`;
  if (tab === "tasks") body = panel("settings", "Tarefas agendadas", `<div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Categoria</th><th>Estado</th><th>Último resultado</th><th>Última execução</th><th class="num">Duração</th></tr></thead><tbody>
    ${(d.tasks || []).map((t) => `<tr><td><b>${esc(t.name)}</b>${t.error ? `<div class="small" style="color:var(--crit)">${esc(t.error)}</div>` : ""}</td><td>${esc(t.category || "")}</td>
      <td>${t.state === "Running" ? `<span class="tag ok">rodando ${t.progress != null ? `${num(t.progress, 0)}%` : ""}</span>` : '<span class="tag">parada</span>'}</td>
      <td><span class="tag ${t.result === "Completed" ? "ok" : t.result === "Failed" ? "crit" : t.result ? "warn" : ""}">${{ Completed: "concluída", Failed: "falhou", Cancelled: "cancelada", Aborted: "interrompida" }[t.result] || esc(t.result || "nunca rodou")}</span></td>
      <td class="small">${t.end ? ago(t.end) : "–"}</td><td class="num">${t.start && t.end ? uptime(Math.max(60, t.end - t.start)) : "–"}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">Nenhuma tarefa.</td></tr>'}
    </tbody></table></div>`);
  return `<div class="stack pv">${head}${tabs}${body}</div>`;
}

/* ======================= Nextcloud ======================= */
function nextcloudView(i) {
  const d = i.details, page = `nuvem.${i.id}`, tab = xTab(page, "overview"), rng = xTfVal(page, "24h");
  const a = d.active || {}, sh = d.shares || {}, php = d.php || {}, db = d.db || {}, ca = d.cache || {}, ap = d.apps || {};
  const memPct = d.mem_total ? ((d.mem_total - d.mem_free) / d.mem_total) * 100 : null;
  const head = xHead("cloud", `Nextcloud ${esc(d.version || "")}`, "nuvem",
    `${d.maintenance ? '<span class="tag crit">modo de manutenção</span>' : ""}${d.update?.available ? `<span class="tag warn">atualização ${esc(d.update.version || "")} disponível</span>` : ""}${d.debug ? '<span class="tag warn">modo debug ligado</span>' : ""}`);
  const tabs = xTabs(page, [["overview", "Visão geral"], ["system", "Sistema"], ["shares", "Compartilhamentos"], ["apps", "Apps e atualizações"]], "overview");
  const cards = `<div class="pmx-cards">
    ${statCard("Ativos agora", "users", `${a.m5 ?? "–"}`, `<span class="tag">${a.h1 ?? "–"} na última hora</span> <span class="tag">${a.h24 ?? "–"} em 24 h</span>`, `${num(d.users, 0)} usuários no total`)}
    ${statCard("Arquivos", "folder", num(d.files, 0), "", `${num(d.storages, 0)} armazenamentos${d.storages_other ? ` · ${d.storages_other} externos` : ""}`)}
    ${statCard("Espaço livre", "storage", bytes(d.free), "", "no disco de dados")}
    ${statCard("Servidor", "server", d.load?.length ? `carga ${num(d.load[0], 2)}` : "–", bar(memPct), `${d.cpus ? `${d.cpus} CPUs · ` : ""}memória ${num(memPct, 0)}% de ${bytes(d.mem_total)}`)}
  </div>`;
  const kv = (rows) => `<table class="kv"><tbody>${rows.filter((r) => r[1] != null && r[1] !== "").map(([k, v]) => `<tr><td class="muted">${k}</td><td><b>${v}</b></td></tr>`).join("")}</tbody></table>`;
  const tfRow = `<div class="pmx-tf"><span class="small muted">Histórico gravado pela dashboard</span>${xTfSelect(page, TF_STORE, "24h")}</div>`;
  const cacheName = (x) => (x ? esc(String(x).split("\\").pop()) : "nenhum");

  let body = "";
  if (tab === "overview") body = `${cards}${tfRow}<div class="grid-2">
    ${panel("users", "Usuários ativos", storeChart([{ key: `${i.id}.active5m`, label: "Últimos 5 min", color: cssv("--s4"), fill: true }, { key: `${i.id}.active1h`, label: "Última hora", color: cssv("--s3") }], rng))}
    ${panel("activity", "Carga e memória", storeChart([{ key: `${i.id}.mem`, label: "Memória %", unit: "%", color: cssv("--s3"), fill: true }, { key: `${i.id}.load`, label: "Carga", color: cssv("--s4"), axis: "right" }], rng, { leftMax: 100 }))}</div>
    <div class="grid-2">${panel("storage", "Espaço livre", storeChart([{ key: `${i.id}.free_gb`, label: "Livre", unit: " GB", color: cssv("--ok"), fill: true }], rng))}
    ${panel("folder", "Arquivos e banco de dados", storeChart([{ key: `${i.id}.files`, label: "Arquivos", color: cssv("--s4") }, { key: `${i.id}.db_mb`, label: "Banco (MB)", unit: " MB", color: cssv("--s2"), axis: "right" }], rng))}</div>`;
  if (tab === "system") body = `<div class="grid-3">
    ${panel("code", "PHP e servidor web", kv([["Servidor web", esc(d.webserver || "")], ["PHP", esc(php.version || "")], ["Limite de memória", php.memory_limit ? bytes(php.memory_limit) : null],
      ["Upload máximo", php.upload ? bytes(php.upload) : null], ["Tempo máximo", php.max_exec ? `${php.max_exec} s` : null],
      ["OPcache", php.opcache_hit != null ? `${num(php.opcache_hit, 1)}% de acertos` : "desligado"], ["APCu", php.apcu ? "ligado" : "desligado"]]))}
    ${panel("storage", "Banco de dados e cache", kv([["Banco", `${esc(db.type || "")} ${esc(db.version || "")}`], ["Tamanho do banco", db.size ? bytes(db.size) : null],
      ["Cache local", cacheName(ca.local)], ["Cache distribuído", cacheName(ca.distributed)], ["Bloqueio de arquivos", ca.filelocking ? `ligado (${cacheName(ca.locking)})` : "desligado"]]))}
    ${panel("server", "Memória do servidor", kv([["Total", bytes(d.mem_total)], ["Em uso", `${bytes(d.mem_total - d.mem_free)} (${num(memPct, 0)}%)`],
      ["Swap", d.swap_total ? `${bytes(d.swap_total - d.swap_free)} de ${bytes(d.swap_total)}` : "sem swap"], ["Carga 1 · 5 · 15 min", (d.load || []).map((x) => num(x, 2)).join(" · ")], ["CPUs", d.cpus]]))}</div>
    ${!ca.local || !ca.locking ? '<div class="banner">Dica: configure APCu como cache local e Redis para bloqueio de arquivos; melhora bastante o desempenho do Nextcloud.</div>' : ""}`;
  if (tab === "shares") {
    const rows = [["Com usuários", sh.user], ["Com grupos", sh.groups], ["Links públicos", sh.link], ["Por e-mail", sh.mail], ["Em conversas (Talk)", sh.room], ["Federados enviados", sh.fed_sent], ["Federados recebidos", sh.fed_recv]];
    const max = Math.max(1, ...rows.map((r) => r[1] || 0));
    body = `<div class="grid-2">${panel("network", "Compartilhamentos", rows.map(([k, v]) => `<div class="cost-row"><div class="cost-top"><b>${k}</b><span>${num(v || 0, 0)}</span></div><div class="bar"><i style="width:${((v || 0) / max) * 100}%"></i></div></div>`).join(""), `<span class="muted">${num(sh.total, 0)} no total</span>`)}
      ${panel("lock", "Segurança dos links", `<div class="pmx-value" style="color:${sh.link_nopass ? "var(--warn)" : "var(--ok)"}">${num(sh.link_nopass || 0, 0)}</div>
        <p class="small muted">link(s) público(s) sem senha. ${sh.link_nopass ? "Qualquer pessoa com o endereço consegue abrir. Considere exigir senha ou data de validade em Administração › Compartilhamento." : "Todos os links públicos estão protegidos."}</p>`)}</div>`;
  }
  if (tab === "apps") {
    const ups = Object.entries(ap.updates || {});
    body = `<div class="grid-2">${panel("box", "Nextcloud", kv([["Versão instalada", esc(d.version || "")], ["Atualização", d.update?.available ? `<span class="tag warn">${esc(d.update.version || "disponível")}</span>` : '<span class="tag ok">em dia</span>'],
        ["Última verificação", d.update?.checked ? ago(d.update.checked) : null], ["Apps instalados", ap.installed], ["Modo de manutenção", d.maintenance ? "ligado" : "desligado"], ["Modo debug", d.debug ? '<span class="tag warn">ligado</span>' : "desligado"]]))}
      ${panel("settings", "Apps para atualizar", ups.length ? `<table><thead><tr><th>App</th><th>Nova versão</th></tr></thead><tbody>${ups.map(([n, v]) => `<tr><td><b>${esc(n)}</b></td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>` : empty("Todos os apps estão atualizados."), `<span class="muted">${ups.length}</span>`)}</div>`;
  }
  return `<div class="stack pv">${head}${tabs}${body}</div>`;
}
Object.assign(VIEWS, { midia: mediaView, nuvem: nextcloudView });
