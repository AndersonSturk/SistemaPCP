import { apiRequest, getUser, logout, showToast } from "./auth.js";

// ── Auth ─────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";
const elUser = document.getElementById("userInfo");
if (elUser) elUser.textContent = user.nome || user.usuario || "";
document.getElementById("btnLogout")?.addEventListener("click", logout);

// ── Helpers ──────────────────────────────────────────
const fmtNum   = v => Number(v || 0).toLocaleString("pt-BR");
const fmtMoeda = v => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtData  = v => v ? new Date(v).toLocaleDateString("pt-BR") : "—";
const fmtDataHora = v => v ? new Date(v).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—";
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const mesLabel = l => { const [a,m] = l.split("-"); return MESES[parseInt(m)-1]+"/"+a.slice(2); };
function diasEntre(d1, d2) { return Math.ceil((new Date(d2) - new Date(d1)) / 864e5); }

function animateValue(el, end, duration = 800, suffix = "") {
  if (!el) return;
  if (end === 0) { el.textContent = "0" + suffix; return; }
  const startTime = performance.now();
  function step(now) {
    const p = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(end * eased).toLocaleString("pt-BR") + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

const statusClass = s => ({
  "Curso normal":"s-normal","Item em Produção":"s-producao",
  "Pedido atrasado":"s-atrasado","Entrega com Atraso":"s-atraso-entrega","Entregue":"s-entregue",
}[s] || "s-normal");

const opStatusHtml = s => {
  const m = { ABERTA:"op-aberta", EM_PRODUCAO:"op-producao", CONCLUIDA:"op-concluida", CANCELADA:"op-cancelada" };
  const l = { ABERTA:"Aberta", EM_PRODUCAO:"Em Produção", CONCLUIDA:"Concluída", CANCELADA:"Cancelada" };
  return `<span class="op-status ${m[s]||"op-aberta"}">${l[s]||s}</span>`;
};

const movBadge = tipo => {
  const m = { ENTRADA:"badge-entrada", SAIDA:"badge-saida", PRODUCAO:"badge-producao-mov", AJUSTE:"badge-ajuste" };
  const l = { ENTRADA:"Entrada", SAIDA:"Saída", PRODUCAO:"Produção", AJUSTE:"Ajuste" };
  return `<span class="badge-mov ${m[tipo]||"badge-ajuste"}">${l[tipo]||tipo}</span>`;
};

const controleHtml = c => {
  if (!c) return '<span style="color:var(--muted)">—</span>';
  return `<span class="badge-controle ${c==="Item de Estoque"?"badge-estoque":"badge-producao-ctrl"}">${c}</span>`;
};

// Chart tooltip theme
const tooltipTheme = {
  backgroundColor: "#1e293b", borderColor: "rgba(255,255,255,.1)", borderWidth: 1,
  titleColor: "#f1f5f9", bodyColor: "#cbd5e1", padding: 12, cornerRadius: 8,
  titleFont: { size: 12, weight: "700" }, bodyFont: { size: 11 },
};

// ── Chart refs ───────────────────────────────────────
let chartTimeline, chartStatus, chartUF, chartOPsStatus, chartOPs6m;
let chartMovsMes, chartMovsTipo;

// ══════════════════════════════════════════════════════
// MAIN TABS
// ══════════════════════════════════════════════════════
let estoqueLoaded = false;

document.querySelectorAll(".main-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".main-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".main-page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const page = btn.dataset.page;
    document.getElementById("page" + page.charAt(0).toUpperCase() + page.slice(1))?.classList.add("active");
    if (page === "estoque" && !estoqueLoaded) {
      estoqueLoaded = true;
      carregarEstoque();
    }
  });
});

// ══════════════════════════════════════════════════════
// SUB-TAB SYSTEM (scoped by data-group)
// ══════════════════════════════════════════════════════
document.querySelectorAll(".tab-header").forEach(header => {
  const group = header.dataset.group;
  header.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      header.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(`.tab-panel[data-group="${group}"]`).forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      const panelId = "panel" + tab.charAt(0).toUpperCase() + tab.slice(1);
      document.getElementById(panelId)?.classList.add("active");
    });
  });
});

// ── Refresh buttons ──────────────────────────────────
function bindRefresh(btnId, fn) {
  const btn = document.getElementById(btnId);
  btn?.addEventListener("click", () => {
    btn.classList.add("spinning");
    fn().finally(() => setTimeout(() => btn.classList.remove("spinning"), 600));
  });
}
bindRefresh("btnRefresh", carregarPedidos);
bindRefresh("btnRefreshEstoque", carregarEstoque);

// ── KPI click → pedidos page ─────────────────────────
document.querySelectorAll(".kpi-card[data-filter]").forEach(card => {
  card.addEventListener("click", () => {
    const map = { ativos:"", entregues:"Entregue", producao:"Item em Produção", atrasados:"Pedido atrasado" };
    const s = map[card.dataset.filter];
    if (s !== undefined) window.location.href = `pedidos.html${s ? "?status="+encodeURIComponent(s) : ""}`;
  });
});

// ══════════════════════════════════════════════════════
// PEDIDOS + OPs
// ══════════════════════════════════════════════════════
async function carregarPedidos() {
  try {
    const res = await apiRequest("/dashboard-pedidos");
    const d = res.data;
    renderKPIs(d);
    renderProgress(d);
    renderChartTimeline(d);
    renderChartStatus(d);
    renderChartUF(d);
    renderChartOPsStatus(d);
    renderChartOPs6m(d);
    renderOPsResumo(d);
    renderAtrasados(d.pedidos_atrasados || []);
    renderProximasEntregas(d.proximas_entregas || []);
    renderRecentes(d.ultimos_pedidos || []);
    renderTopClientes(d.top_clientes || []);
    renderOpsRecentes(d.ops_recentes || []);
    updateTimestamp();
  } catch (err) {
    console.error("Erro ao carregar dashboard:", err);
    showToast("Erro ao carregar dashboard.", "error");
  }
}

function renderKPIs(d) {
  const k = d.kpis || {};
  animateValue(document.getElementById("kpiAtivos"), Number(k.pedidos_ativos || 0));
  document.getElementById("kpiAtivosSub").innerHTML = `<span style="color:var(--muted)">${fmtNum(k.total_pedidos)} total</span>`;

  animateValue(document.getElementById("kpiEntregues"), Number(k.pedidos_entregues || 0));
  const pct = k.total_pedidos > 0 ? Math.round((k.pedidos_entregues / k.total_pedidos) * 100) : 0;
  document.getElementById("kpiEntreguesSub").innerHTML = `<span style="color:#4ade80">${pct}% do total</span>`;

  animateValue(document.getElementById("kpiProducao"), Number(k.em_producao || 0));
  animateValue(document.getElementById("kpiAtrasados"), Number(k.atrasados || 0));

  const taxa = d.taxa_prazo || {};
  animateValue(document.getElementById("kpiTaxaPrazo"), taxa.percentual || 0, 800, "%");
  document.getElementById("kpiTaxaSub").innerHTML = `<span style="color:var(--muted)">${fmtNum(taxa.no_prazo)} de ${fmtNum(taxa.total)}</span>`;

  animateValue(document.getElementById("kpiPecas"), Number(k.total_pecas_solicitadas || 0));
  document.getElementById("kpiPecasSub").innerHTML = `<span style="color:var(--muted)">${fmtNum(k.total_pecas_produzidas)} produzidas</span>`;

  const cardAt = document.querySelector('.kpi-card[data-filter="atrasados"]');
  if (cardAt && Number(k.atrasados) > 0) {
    cardAt.style.borderColor = "rgba(239,68,68,.3)";
    cardAt.style.background = "rgba(239,68,68,.04)";
  }
}

function renderProgress(d) {
  const k = d.kpis || {};
  const sol = Number(k.total_pecas_solicitadas || 0);
  const prod = Number(k.total_pecas_produzidas || 0);
  const pct = sol > 0 ? Math.min(Math.round((prod / sol) * 100), 100) : 0;
  document.getElementById("progressPercent").textContent = pct + "%";
  document.getElementById("progressBar").style.width = pct + "%";
  document.getElementById("progressProduzidas").textContent = fmtNum(prod);
  document.getElementById("progressSolicitadas").textContent = fmtNum(sol);
}

// ── Charts pedidos ───────────────────────────────────
function renderChartTimeline(d) {
  const ctx = document.getElementById("chartTimeline");
  if (!ctx) return;
  if (chartTimeline) chartTimeline.destroy();
  const pm = d.por_mes || [], em = d.entregas_por_mes || [];
  const all = [...new Set([...pm.map(m=>m.mes), ...em.map(m=>m.mes)])].sort();
  const pMap = {}; pm.forEach(m => pMap[m.mes] = m.total);
  const eMap = {}; em.forEach(m => eMap[m.mes] = m.total);
  chartTimeline = new Chart(ctx, {
    type: "bar",
    data: {
      labels: all.map(mesLabel),
      datasets: [
        { label:"Pedidos Criados", data: all.map(l=>pMap[l]||0), backgroundColor:"rgba(59,130,246,.55)", hoverBackgroundColor:"rgba(59,130,246,.8)", borderRadius:6, barPercentage:.5, categoryPercentage:.7 },
        { label:"Entregas", data: all.map(l=>eMap[l]||0), backgroundColor:"rgba(34,197,94,.5)", hoverBackgroundColor:"rgba(34,197,94,.8)", borderRadius:6, barPercentage:.5, categoryPercentage:.7 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false, interaction:{mode:"index",intersect:false},
      plugins:{ legend:{labels:{color:"#94a3b8",font:{size:11,weight:"600"},usePointStyle:true,pointStyleWidth:10,padding:16}}, tooltip:tooltipTheme },
      scales:{ x:{ticks:{color:"#64748b",font:{size:11}},grid:{color:"rgba(255,255,255,.04)"}}, y:{ticks:{color:"#64748b",font:{size:11}},grid:{color:"rgba(255,255,255,.06)"},beginAtZero:true} }
    }
  });
}

function renderChartStatus(d) {
  const ctx = document.getElementById("chartStatus");
  if (!ctx) return;
  if (chartStatus) chartStatus.destroy();
  const data = d.por_status || [];
  const cMap = {"Curso normal":"#3b82f6","Item em Produção":"#f59e0b","Pedido atrasado":"#ef4444","Entrega com Atraso":"#f97316","Entregue":"#22c55e"};
  const total = data.reduce((s,r)=>s+r.total,0);
  document.getElementById("badgeTotalPedidos").textContent = total+" pedidos";
  chartStatus = new Chart(ctx, {
    type:"doughnut",
    data:{ labels:data.map(s=>s.status||"Outro"), datasets:[{data:data.map(s=>s.total), backgroundColor:data.map(s=>cMap[s.status]||"#6b7280"), borderWidth:0, hoverOffset:8}] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"65%",
      plugins:{ legend:{position:"bottom",labels:{color:"#94a3b8",font:{size:11,weight:"600"},padding:14,usePointStyle:true,pointStyleWidth:10}},
        tooltip:{...tooltipTheme, callbacks:{label:c=>{const p=total>0?Math.round((c.raw/total)*100):0; return ` ${c.label}: ${c.raw} (${p}%)`;}}} } }
  });
}

function renderChartUF(d) {
  const ctx = document.getElementById("chartUF");
  if (!ctx) return;
  if (chartUF) chartUF.destroy();
  const data = d.por_uf || [];
  if (!data.length) return;
  chartUF = new Chart(ctx, {
    type:"bar",
    data:{ labels:data.map(u=>u.uf), datasets:[{label:"Pedidos",data:data.map(u=>u.total),
      backgroundColor:data.map((_,i)=>`hsla(${210+i*15},70%,60%,.6)`), hoverBackgroundColor:data.map((_,i)=>`hsla(${210+i*15},70%,60%,.9)`), borderRadius:4, barPercentage:.7}] },
    options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:tooltipTheme },
      scales:{ x:{ticks:{color:"#64748b",font:{size:11}},grid:{color:"rgba(255,255,255,.06)"},beginAtZero:true}, y:{ticks:{color:"#94a3b8",font:{size:11,weight:"600"}},grid:{display:false}} } }
  });
}

// ── Charts OPs ───────────────────────────────────────
function renderChartOPsStatus(d) {
  const ctx = document.getElementById("chartOPsStatus");
  if (!ctx) return;
  if (chartOPsStatus) chartOPsStatus.destroy();
  const data = d.ops_status || [];
  const cMap = { ABERTA:"#3b82f6", EM_PRODUCAO:"#f59e0b", CONCLUIDA:"#22c55e", CANCELADA:"#6b7280" };
  const lMap = { ABERTA:"Abertas", EM_PRODUCAO:"Em Produção", CONCLUIDA:"Concluídas", CANCELADA:"Canceladas" };
  const total = data.reduce((s,r)=>s+r.total,0);
  document.getElementById("badgeTotalOPs").textContent = total+" OPs";
  chartOPsStatus = new Chart(ctx, {
    type:"doughnut",
    data:{ labels:data.map(s=>lMap[s.status]||s.status), datasets:[{data:data.map(s=>s.total), backgroundColor:data.map(s=>cMap[s.status]||"#6b7280"), borderWidth:0, hoverOffset:8}] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"60%",
      plugins:{ legend:{position:"bottom",labels:{color:"#94a3b8",font:{size:11,weight:"600"},padding:14,usePointStyle:true,pointStyleWidth:10}}, tooltip:tooltipTheme } }
  });
}

function renderChartOPs6m(d) {
  const ctx = document.getElementById("chartOPs6m");
  if (!ctx) return;
  if (chartOPs6m) chartOPs6m.destroy();
  const data = d.ops_6m || [];
  chartOPs6m = new Chart(ctx, {
    type:"bar",
    data:{ labels:data.map(m=>mesLabel(m.mes)),
      datasets:[
        { label:"OPs Concluídas", data:data.map(m=>m.total), backgroundColor:"rgba(34,197,94,.5)", hoverBackgroundColor:"rgba(34,197,94,.8)", borderRadius:6, barPercentage:.5, categoryPercentage:.7 },
        { label:"Peças Produzidas", data:data.map(m=>Number(m.pecas)), backgroundColor:"rgba(59,130,246,.45)", hoverBackgroundColor:"rgba(59,130,246,.8)", borderRadius:6, barPercentage:.5, categoryPercentage:.7 },
      ] },
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:"index",intersect:false},
      plugins:{ legend:{labels:{color:"#94a3b8",font:{size:11,weight:"600"},usePointStyle:true,pointStyleWidth:10,padding:16}}, tooltip:tooltipTheme },
      scales:{ x:{ticks:{color:"#64748b",font:{size:11}},grid:{color:"rgba(255,255,255,.04)"}}, y:{ticks:{color:"#64748b",font:{size:11}},grid:{color:"rgba(255,255,255,.06)"},beginAtZero:true} } }
  });
}

function renderOPsResumo(d) {
  const k = d.ops_kpis || {};
  animateValue(document.getElementById("opAberta"), Number(k.abertas || 0));
  animateValue(document.getElementById("opEmProd"), Number(k.em_producao || 0));
  animateValue(document.getElementById("opConcluida"), Number(k.concluidas || 0));
  animateValue(document.getElementById("opCancelada"), Number(k.canceladas || 0));
}

// ── Tables pedidos ───────────────────────────────────
function renderAtrasados(lista) {
  const tbody = document.getElementById("tbAtrasados");
  document.getElementById("countAtrasados").textContent = lista.length;
  const tabBtn = document.querySelector('[data-tab="atrasados"]');
  if (tabBtn && lista.length > 0) tabBtn.classList.add("tab-danger");
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Nenhum pedido atrasado!</td></tr>'; return; }
  tbody.innerHTML = lista.map(p => {
    const dias = p.data_contratual ? diasEntre(p.data_contratual, new Date()) : 0;
    return `<tr onclick="window.location.href='pedidos.html'">
      <td style="font-weight:700">${p.ordem_compra||"—"}</td><td>${p.cliente||"—"}</td><td>${p.estado||"—"}</td>
      <td style="font-weight:600">${p.zerb||p.codigo_cliente||"—"}</td><td>${fmtNum(p.qtde_solicitada)}</td>
      <td><span class="status-dot ${statusClass(p.status_producao)}">${p.status_producao}</span></td>
      <td>${fmtData(p.data_contratual)}</td>
      <td><span class="countdown urgente">${dias>0?dias+"d atraso":"Hoje"}</span></td></tr>`;
  }).join("");
}

function renderProximasEntregas(lista) {
  const tbody = document.getElementById("tbProximas");
  document.getElementById("countProximas").textContent = lista.length;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Nenhuma entrega programada.</td></tr>'; return; }
  tbody.innerHTML = lista.map(p => {
    const dias = p.data_contratual ? diasEntre(new Date(), p.data_contratual) : 999;
    const cls = dias<=3?"urgente":dias<=7?"proximo":"tranquilo";
    return `<tr onclick="window.location.href='pedidos.html'">
      <td style="font-weight:700">${p.ordem_compra||"—"}</td><td>${p.cliente||"—"}</td><td>${p.estado||"—"}</td>
      <td style="font-weight:600">${p.zerb||p.codigo_cliente||"—"}</td><td>${fmtNum(p.qtde_solicitada)}</td>
      <td><span class="status-dot ${statusClass(p.status_producao)}">${p.status_producao}</span></td>
      <td>${fmtData(p.data_contratual)}</td><td><span class="countdown ${cls}">${dias}d</span></td></tr>`;
  }).join("");
}

function renderRecentes(lista) {
  const tbody = document.getElementById("tbRecentes");
  document.getElementById("countRecentes").textContent = lista.length;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Nenhum pedido recente.</td></tr>'; return; }
  tbody.innerHTML = lista.map(p => `
    <tr onclick="window.location.href='pedidos.html'">
      <td style="font-weight:700">${p.ordem_compra||"—"}</td><td>${p.cliente||"—"}</td><td>${p.estado||"—"}</td>
      <td style="font-weight:600">${p.zerb||p.codigo_cliente||"—"}</td><td>${fmtNum(p.qtde_solicitada)}</td>
      <td><span class="status-dot ${statusClass(p.status_producao)}">${p.status_producao}</span></td>
      <td>${fmtDataHora(p.criado_em)}</td><td>${fmtData(p.data_contratual)}</td></tr>`).join("");
}

function renderTopClientes(lista) {
  const el = document.getElementById("listaClientes");
  document.getElementById("countClientes").textContent = lista.length;
  if (!lista.length) { el.innerHTML = '<div class="empty-msg">Nenhum cliente.</div>'; return; }
  const max = Math.max(...lista.map(c=>c.total_pedidos));
  el.innerHTML = lista.map((c,i) => {
    const pos = i===0?"top-1":i===1?"top-2":i===2?"top-3":"";
    const w = max>0?Math.round((c.total_pedidos/max)*100):0;
    return `<div class="ranking-item">
      <div class="ranking-pos ${pos}">${i+1}</div>
      <div class="ranking-info"><div class="ranking-nome">${c.cliente}</div><div class="ranking-sub">${fmtNum(c.total_pecas)} peças \u2022 ${fmtNum(c.entregues)} entregues</div></div>
      <div class="ranking-bar-wrap"><div class="ranking-bar" style="width:${w}%"></div></div>
      <div class="ranking-total">${c.total_pedidos}</div></div>`;
  }).join("");
}

function renderOpsRecentes(lista) {
  const tbody = document.getElementById("tbOps");
  document.getElementById("countOps").textContent = lista.length;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Nenhuma OP recente.</td></tr>'; return; }
  tbody.innerHTML = lista.map(o => `
    <tr onclick="window.location.href='visualizar_op.html?id=${o.id}'">
      <td style="font-weight:700;color:#60a5fa">${o.numero_op||"—"}</td>
      <td style="font-weight:600">${o.codigo_produto||"—"}</td>
      <td>${o.descricao_material||"—"}</td>
      <td>${fmtNum(o.qtde_total)}</td>
      <td>${o.custo_total ? fmtMoeda(o.custo_total) : "—"}</td>
      <td>${o.responsavel||"—"}</td>
      <td>${opStatusHtml(o.status)}</td></tr>`).join("");
}

// ══════════════════════════════════════════════════════
// ESTOQUE
// ══════════════════════════════════════════════════════
async function carregarEstoque() {
  try {
    const res = await apiRequest("/dashboard-estoque");
    const d = res.data;
    renderEstoqueKPIs(d);
    renderChartMovsMes(d);
    renderChartMovsTipo(d);
    renderAbaixoMinimo(d.abaixo_minimo || []);
    renderEstoqueZerado(d.estoque_zerado || []);
    renderMovimentacoes(d.ultimas_movs || []);
    renderSaidas(d.ultimas_saidas || []);
    renderTopSaidas(d.top_saidas || []);
    renderPerdas(d.perdas || []);
    updateTimestamp();
  } catch (err) {
    console.error("Erro ao carregar estoque:", err);
    showToast("Erro ao carregar dados de estoque.", "error");
  }
}

function renderEstoqueKPIs(d) {
  const k = d.kpis || {};
  animateValue(document.getElementById("ekpiTotal"), Number(k.total_materiais || 0));
  document.getElementById("ekpiValor").textContent = fmtMoeda(k.valor_total);
  animateValue(document.getElementById("ekpiZerado"), Number(k.estoque_zerado || 0));
  animateValue(document.getElementById("ekpiAbaixo"), Number(k.abaixo_minimo || 0));

  const sv = d.saidas_valor || {};
  animateValue(document.getElementById("ekpiSaidas30d"), Number(sv.total_saidas || 0));
  document.getElementById("ekpiSaidasValor").innerHTML = `<span style="color:var(--muted)">${fmtMoeda(sv.valor_total)}</span>`;

  const pt = d.perdas_total || {};
  animateValue(document.getElementById("ekpiPerdas30d"), Number(pt.total || 0));
  document.getElementById("ekpiPerdasQtde").innerHTML = `<span style="color:var(--muted)">${fmtNum(pt.qtde_total)} unid.</span>`;
}

function renderChartMovsMes(d) {
  const ctx = document.getElementById("chartMovsMes");
  if (!ctx) return;
  if (chartMovsMes) chartMovsMes.destroy();
  const raw = d.movs_por_mes || [];
  const meses = [...new Set(raw.map(r=>r.mes))].sort();
  const tipos = ["ENTRADA","SAIDA","PRODUCAO","AJUSTE"];
  const colors = { ENTRADA:"rgba(34,197,94,.6)", SAIDA:"rgba(239,68,68,.6)", PRODUCAO:"rgba(59,130,246,.5)", AJUSTE:"rgba(245,158,11,.5)" };
  const labels = { ENTRADA:"Entradas", SAIDA:"Saídas", PRODUCAO:"Produção", AJUSTE:"Ajustes" };
  const dataMap = {};
  raw.forEach(r => { dataMap[r.mes+"_"+r.tipo] = r.total; });
  chartMovsMes = new Chart(ctx, {
    type:"bar",
    data:{ labels:meses.map(mesLabel),
      datasets:tipos.filter(t=>raw.some(r=>r.tipo===t)).map(t=>({
        label:labels[t], data:meses.map(m=>dataMap[m+"_"+t]||0),
        backgroundColor:colors[t], borderRadius:4, barPercentage:.6, categoryPercentage:.8
      })) },
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:"index",intersect:false},
      plugins:{ legend:{labels:{color:"#94a3b8",font:{size:11,weight:"600"},usePointStyle:true,pointStyleWidth:10,padding:16}}, tooltip:tooltipTheme },
      scales:{ x:{stacked:true,ticks:{color:"#64748b",font:{size:11}},grid:{color:"rgba(255,255,255,.04)"}}, y:{stacked:true,ticks:{color:"#64748b",font:{size:11}},grid:{color:"rgba(255,255,255,.06)"},beginAtZero:true} } }
  });
}

function renderChartMovsTipo(d) {
  const ctx = document.getElementById("chartMovsTipo");
  if (!ctx) return;
  if (chartMovsTipo) chartMovsTipo.destroy();
  const data = d.movs_por_tipo || [];
  const cMap = { ENTRADA:"#22c55e", SAIDA:"#ef4444", PRODUCAO:"#3b82f6", AJUSTE:"#f59e0b" };
  const lMap = { ENTRADA:"Entradas", SAIDA:"Saídas", PRODUCAO:"Produção", AJUSTE:"Ajustes" };
  chartMovsTipo = new Chart(ctx, {
    type:"doughnut",
    data:{ labels:data.map(r=>lMap[r.tipo]||r.tipo), datasets:[{data:data.map(r=>r.total), backgroundColor:data.map(r=>cMap[r.tipo]||"#6b7280"), borderWidth:0, hoverOffset:8}] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"60%",
      plugins:{ legend:{position:"bottom",labels:{color:"#94a3b8",font:{size:11,weight:"600"},padding:14,usePointStyle:true,pointStyleWidth:10}}, tooltip:tooltipTheme } }
  });
}

// ── Tables estoque ───────────────────────────────────
function renderAbaixoMinimo(lista) {
  const el = document.getElementById("listaAbaixoMin");
  document.getElementById("eCountAbaixo").textContent = lista.length;
  if (!lista.length) { el.innerHTML = '<div class="empty-msg">Nenhum material abaixo do mínimo.</div>'; return; }
  el.innerHTML = lista.map(m => `
    <div class="alerta-item">
      <div class="alerta-item-nome">${m.codigo_produto} — ${m.descricao}<span>${m.unidade_medida||"un"}</span></div>
      <div class="alerta-item-vals"><div class="atual">${fmtNum(m.estoque)}</div><div class="minimo">mín: ${fmtNum(m.estoque_minimo)}</div></div>
    </div>`).join("");
}

function renderEstoqueZerado(lista) {
  const tbody = document.getElementById("tbZerado");
  document.getElementById("eCountZerado").textContent = lista.length;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Nenhum material com estoque zerado.</td></tr>'; return; }
  tbody.innerHTML = lista.map(m => `
    <tr><td style="font-weight:700">${m.codigo_produto||"—"}</td><td>${m.descricao||"—"}</td>
    <td>${m.unidade_medida||"—"}</td><td>${fmtNum(m.estoque_minimo)}</td></tr>`).join("");
}

function renderMovimentacoes(lista) {
  const tbody = document.getElementById("tbMovs");
  document.getElementById("eCountMovs").textContent = lista.length;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Nenhuma movimentação.</td></tr>'; return; }
  tbody.innerHTML = lista.map(m => `
    <tr><td>${fmtDataHora(m.criado_em)}</td><td>${movBadge(m.tipo)}</td>
    <td style="font-weight:600">${m.mat_codigo||m.codigo_produto||"—"}</td>
    <td>${m.mat_descricao||m.descricao||"—"}</td>
    <td>${fmtNum(m.quantidade)}</td>
    <td style="font-size:10px;color:var(--muted)">${m.referencia_label||"—"}</td>
    <td>${m.usuario_nome||"—"}</td></tr>`).join("");
}

function renderSaidas(lista) {
  const tbody = document.getElementById("tbSaidas");
  document.getElementById("eCountSaidas").textContent = lista.length;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Nenhuma saída recente.</td></tr>'; return; }
  tbody.innerHTML = lista.map(s => `
    <tr onclick="window.location.href='saida_estoque.html'">
      <td style="font-weight:700">#${s.numero}</td><td>${s.cliente||"—"}</td><td>${s.estado||"—"}</td>
      <td>${s.pedido_venda||"—"}</td><td>${s.ordem_compra||"—"}</td>
      <td>${fmtData(s.data_saida)}</td><td>${s.total_itens||0}</td>
      <td style="font-weight:600">${fmtMoeda(s.valor_total)}</td></tr>`).join("");
}

function renderTopSaidas(lista) {
  const tbody = document.getElementById("tbTopSaidas");
  document.getElementById("eCountTop").textContent = lista.length;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Nenhuma saída nos últimos 30 dias.</td></tr>'; return; }
  tbody.innerHTML = lista.map(m => {
    const alerta = m.estoque_minimo > 0 && m.estoque_atual < m.estoque_minimo;
    return `<tr>
      <td style="font-weight:700">${m.codigo_produto||"—"}</td><td>${m.descricao||"—"}</td>
      <td>${m.unidade_medida||"—"}</td><td>${m.total_saidas}</td>
      <td style="font-weight:600">${fmtNum(m.qtde_saida)}</td>
      <td style="color:${alerta?"#f87171":"#cbd5e1"};font-weight:${alerta?700:400}">${fmtNum(m.estoque_atual)}</td>
      <td>${fmtNum(m.estoque_minimo)}</td></tr>`;
  }).join("");
}

function renderPerdas(lista) {
  const tbody = document.getElementById("tbPerdas");
  document.getElementById("eCountPerdas").textContent = lista.length;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Nenhuma perda registrada.</td></tr>'; return; }
  tbody.innerHTML = lista.map(p => `
    <tr><td style="font-weight:700;color:#60a5fa">${p.numero_op||"OP "+p.op_id}</td>
    <td style="font-weight:600">${p.codigo_produto||"—"}</td><td>${p.descricao||"—"}</td>
    <td>${fmtNum(p.quantidade)}</td><td>${p.unidade_medida||"—"}</td>
    <td>${p.motivo||"—"}</td><td>${fmtDataHora(p.criado_em)}</td></tr>`).join("");
}

// ── Shared ───────────────────────────────────────────
function updateTimestamp() {
  document.getElementById("lastUpdate").textContent =
    new Date().toLocaleString("pt-BR", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

// ── Init ─────────────────────────────────────────────
carregarPedidos();
setInterval(() => {
  carregarPedidos();
  if (estoqueLoaded) carregarEstoque();
}, 5 * 60 * 1000);
