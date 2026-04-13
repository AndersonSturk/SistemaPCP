import { apiRequest, getUser, showToast } from "./auth.js";

// ─── Autenticação ─────────────────────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";

const userInfoEl = document.getElementById("userInfo");
if (userInfoEl) userInfoEl.innerText = user.nome;

// ── Dados dinâmicos do setor ────────────────────────────
const VIZ_PERFIL = {
  admin:    { centro: "ADM",        projeto: "Gestão de Produção" },
  pcp:      { centro: "PCP",        projeto: "Planejamento e Controle da Produção" },
  producao: { centro: "Produção",   projeto: "Montagem e Produção" },
  ped:      { centro: "P&D",        projeto: "Desenvolvimento de Produtos" },
  logistica:{ centro: "Logística",  projeto: "Controle de Estoque e Expedição" },
};
const vizCfg = VIZ_PERFIL[user.perfil] || VIZ_PERFIL.pcp;
const vizCentro = document.getElementById("vizCentroCusto");
const vizProjeto = document.getElementById("vizProjeto");
if (vizCentro) vizCentro.textContent = vizCfg.centro;
if (vizProjeto) vizProjeto.textContent = vizCfg.projeto;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt         = (v) => (v != null && v !== "") ? v : "—";
const fmtData     = (v) => v ? new Date(v).toLocaleDateString("pt-BR")  : "—";
const fmtMoeda    = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

// ─── Badge de status ──────────────────────────────────────────────────────────
const STATUS_LABEL = { ABERTA: "Aberta", EM_PRODUCAO: "Em Produção", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
const STATUS_COLOR = { ABERTA: "#1d4ed8", EM_PRODUCAO: "#92400e", CONCLUIDA: "#166534", CANCELADA: "#6b7280" };
const STATUS_BG    = { ABERTA: "#dbeafe", EM_PRODUCAO: "#fef3c7", CONCLUIDA: "#dcfce7", CANCELADA: "#f1f5f9" };

function badgeStatus(s) {
  return `<span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;
    font-weight:700;background:${STATUS_BG[s]||"#f1f5f9"};color:${STATUS_COLOR[s]||"#374151"};
    -webkit-print-color-adjust:exact;print-color-adjust:exact;">
    ${STATUS_LABEL[s] || s}</span>`;
}

// ─── Gerar PDF (responsivo — auto-escala para caber no A4) ───────────────────
function gerarPDF() {
  // Atualiza data no rodapé do documento
  const footerData = document.getElementById("footerData");
  if (footerData) {
    footerData.textContent = "Gerado em: " + new Date().toLocaleString("pt-BR");
  }

  // Muda o título da página para o nome do arquivo PDF
  const opNumero = document.getElementById("opNumero")?.textContent || "OP";
  const tituloOriginal = document.title;
  document.title = `OP_${opNumero.replace(/\//g, "-")}`;

  const doc = document.getElementById("documentoOP");

  if (doc) {
    doc.style.width = "100%";
    doc.style.transform = "";
    doc.style.transformOrigin = "";
  }

  setTimeout(() => {
    window.print();

    setTimeout(() => {
      if (doc) {
        doc.style.width = "";
      }
      document.title = tituloOriginal;
    }, 500);
  }, 100);
}

// Expõe para o onclick do HTML
window.gerarPDF = gerarPDF;

// ─── Carregar OP ──────────────────────────────────────────────────────────────
async function carregarOP() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) { showToast("ID da OP não informado.", "error"); return; }

  try {
    let op;

    try {
      const res = await apiRequest(`/ordens_producao/${id}`);
      op = res.data;
    } catch {
      const res = await apiRequest(`/op/${id}`);
      op = res.data;
    }

    // ── Dados da OP ──
    document.getElementById("opNumero").innerText     = fmt(op.numero_op);
    document.getElementById("dataCriacao").innerText  = fmtData(op.data_criacao);
    document.getElementById("statusTxt").innerHTML    = badgeStatus(op.status);
    document.getElementById("dataFinalTxt").innerText = fmtData(op.data_finalizacao);
    document.getElementById("observacoes").innerText  = fmt(op.observacoes);

    // ── Produto ──
    document.getElementById("codigoItem").innerText    = fmt(op.codigo_produto);
    document.getElementById("descricao").innerText     = fmt(op.descricao_material || op.descricao);
    document.getElementById("quantidade").innerText    = fmt(op.qtde_total || op.quantidade);
    document.getElementById("unidadeMedida").innerText = fmt(op.unidade_medida);
    document.getElementById("custoUnitario").innerText = fmtMoeda(op.custo_unitario);
    document.getElementById("custoTotal").innerText    = fmtMoeda(op.custo_total);

    // ── Tabela de insumos ──
    try {
      const ri = await apiRequest(`/ordens_producao/${id}/insumos`);
      renderInsumos(ri.data || []);
    } catch (errIns) {
      console.error("Erro ao carregar insumos da OP:", errIns);
      renderInsumos([]);
    }

    // ── Prestadores e perdas ──
    await carregarPrestadores(id);
    await carregarPerdas(id);

  } catch (err) {
    console.error("Erro ao carregar OP:", err);
    showToast("Erro ao carregar dados da OP.", "error");
  }
}

// ─── Renderizar tabela de insumos ─────────────────────────────────────────────
function renderInsumos(insumos) {
  const tabela    = document.getElementById("tabelaInsumos");
  const semItens  = document.getElementById("semInsumos");
  const tbody     = document.getElementById("insumosTabela");

  if (!insumos || insumos.length === 0) {
    tabela.style.display    = "none";
    semItens.style.display  = "block";
    return;
  }

  semItens.style.display = "none";
  tabela.style.display   = "table";
  tbody.innerHTML = "";

  let total = 0;
  insumos.forEach((ins, i) => {
    const subtotal = Number(ins.subtotal || (ins.quantidade * ins.custo_unitario) || 0);
    total += subtotal;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td style="font-weight:600">${fmt(ins.codigo_produto)}</td>
      <td style="text-align:left">${fmt(ins.descricao)}</td>
      <td>${fmt(ins.quantidade)}</td>
      <td>${fmt(ins.unidade_medida || "un")}</td>
      <td>${fmtMoeda(ins.custo_unitario)}</td>
      <td style="font-weight:700">${fmtMoeda(subtotal)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("insumosTotalViz").textContent =
    total.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
carregarOP();
// ═══════════════════════════════════════════════════════════════
//  PRESTADORES DE SERVIÇO — visualizar_op.js
// ═══════════════════════════════════════════════════════════════

async function carregarPrestadores(opId) {
  try {
    const res = await apiRequest(`/prestadores/op/${opId}`);
    const lista = Array.isArray(res.data) ? res.data : [];

    const semEl  = document.getElementById("semPrestadores");
    const tabEl  = document.getElementById("tabelaPrestadores");
    const tbody  = document.getElementById("prestadoresTabela");
      if (!semEl || !tabEl || !tbody) return;

    if (lista.length === 0) {
      semEl.style.display = "";
      tabEl.style.display = "none";
      return;
    }

    semEl.style.display = "none";
    tabEl.style.display = "";
    tbody.innerHTML = "";
    lista.forEach((v, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${v.prestador_nome || "—"}</td>
        <td>${v.prestador_cnpj || "—"}</td>
        <td>R$ ${Number(v.valor_servico || 0).toLocaleString("pt-BR", {minimumFractionDigits: 2})}</td>
        <td>${v.data_envio ? new Date(v.data_envio).toLocaleDateString("pt-BR") : "—"}</td>
      `;
      tbody.appendChild(tr);
    });


  } catch (e) {
    console.warn("Erro ao carregar prestadores:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════

async function carregarEstoqueProducao(opId) {
  try {
    const res = await apiRequest(`/prestadores/estoque-producao/${opId}`);
    const lista = Array.isArray(res.data) ? res.data : [];

    const semEl = document.getElementById("semEstoqueProducao");
    const tabEl = document.getElementById("tabelaEstoqueProducao");
    const tbody = document.getElementById("estoqueProducaoTabela");
    const totEl = document.getElementById("estoqueProducaoTotal");
    if (!semEl || !tabEl || !tbody) return;

    if (lista.length === 0) {
      semEl.style.display = "";
      tabEl.style.display = "none";
      return;
    }

    semEl.style.display = "none";
    tabEl.style.display = "";
    tbody.innerHTML = "";
    let total = 0;

    lista.forEach((ins, i) => {
      const subtotal = Number(ins.quantidade || 0) * Number(ins.custo_unitario || 0);
      total += subtotal;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${ins.codigo_produto || "—"}</td>
        <td>${ins.descricao || "—"}</td>
        <td>${Number(ins.quantidade || 0).toLocaleString("pt-BR", {minimumFractionDigits: 4})}</td>
        <td>${ins.unidade_medida || "—"}</td>
        <td>${Number(ins.custo_unitario || 0).toLocaleString("pt-BR", {minimumFractionDigits: 2})}</td>
        <td>${subtotal.toLocaleString("pt-BR", {minimumFractionDigits: 2})}</td>
      `;
      tbody.appendChild(tr);
    });


  } catch (e) {
    console.warn("Erro ao carregar estoque em produção:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//  PERDAS DE MATERIAL — visualizar_op.js
// ═══════════════════════════════════════════════════════════════

async function carregarPerdas(opId) {
  try {
    const res   = await apiRequest(`/ordens_producao/${opId}/perdas`);
    const lista = Array.isArray(res.data) ? res.data : [];

    const semEl = document.getElementById("semPerdas");
    const tabEl = document.getElementById("tabelaPerdas");
    const tbody = document.getElementById("perdasTabela");
    if (!semEl || !tabEl || !tbody) return;

    if (lista.length === 0) {
      semEl.style.display = "";
      tabEl.style.display = "none";
      return;
    }

    semEl.style.display = "none";
    tabEl.style.display = "table";
    tbody.innerHTML = "";

    lista.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${p.codigo_produto || "—"}</td>
        <td style="text-align:left">${p.descricao}</td>
        <td>${Number(p.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 3 })}</td>
        <td>${p.unidade_medida}</td>
        <td>${p.motivo || "—"}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.warn("Erro ao carregar perdas:", e.message);
  }
}