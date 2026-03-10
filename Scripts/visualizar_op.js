import { apiRequest, getUser, showToast } from "./auth.js";

// ─── Autenticação ─────────────────────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";

const userInfoEl = document.getElementById("userInfo");
if (userInfoEl) userInfoEl.innerText = user.nome;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt         = (v) => (v != null && v !== "") ? v : "—";
const fmtData     = (v) => v ? new Date(v).toLocaleDateString("pt-BR")  : "—";
const fmtDataHora = (v) => v ? new Date(v).toLocaleString("pt-BR")      : "—";
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

  // ── Mede a altura real do conteúdo vs altura disponível no A4 ──
  // A4 = 297mm, margem 8mm topo + 8mm baixo = 281mm útil ≈ 1062px @ 96dpi
  const A4_HEIGHT_PX = 1062;
  const contentHeight = doc.scrollHeight;

  let scale = 1;
  if (contentHeight > A4_HEIGHT_PX) {
    // Calcula escala para caber — com margem de segurança de 2%
    scale = Math.floor((A4_HEIGHT_PX / contentHeight) * 98) / 100;
    // Limite mínimo de escala para manter legível
    scale = Math.max(scale, 0.55);
  }

  // Aplica escala via CSS transform se necessário
  if (scale < 1) {
    doc.style.transformOrigin = "top left";
    doc.style.transform = `scale(${scale})`;
    doc.style.width = `${100 / scale}%`;
  }

  // Imprime
  setTimeout(() => {
    window.print();

    // Remove escala após imprimir
    setTimeout(() => {
      doc.style.transform = "";
      doc.style.width = "";
      doc.style.transformOrigin = "";
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
    let op, pedidos = [];

    try {
      const res = await apiRequest(`/op/${id}`);
      op      = res.data;
      pedidos = op.pedidos || [];
    } catch {
      const res = await apiRequest(`/ordens_producao/${id}`);
      op = res.data;
    }

    // ── Dados da OP ──
    document.getElementById("opNumero").innerText     = fmt(op.numero_op);
    document.getElementById("dataCriacao").innerText  = fmtDataHora(op.data_criacao);
    document.getElementById("statusTxt").innerHTML    = badgeStatus(op.status);
    document.getElementById("dataFinalTxt").innerText = fmtDataHora(op.data_finalizacao);
    document.getElementById("observacoes").innerText  = fmt(op.observacoes);

    // ── Produto ──
    document.getElementById("codigoItem").innerText    = fmt(op.codigo_produto);
    document.getElementById("descricao").innerText     = fmt(op.descricao_material || op.descricao);
    document.getElementById("quantidade").innerText    = fmt(op.qtde_total || op.quantidade);
    document.getElementById("unidadeMedida").innerText = fmt(op.unidade_medida);
    document.getElementById("custoUnitario").innerText = fmtMoeda(op.custo_unitario);
    document.getElementById("custoTotal").innerText    = fmtMoeda(op.custo_total);

    // ── Tabela de pedidos vinculados ──
    renderPedidos(pedidos);

    // ── Tabela de insumos ──
    try {
      const ri = await apiRequest(`/ordens_producao/${id}/insumos`);
      renderInsumos(ri.data || []);
    } catch {
      renderInsumos([]);
    }

    // ── Prestadores e estoque em produção ──
    await carregarPrestadores(id);

  } catch (err) {
    console.error("Erro ao carregar OP:", err);
    showToast("Erro ao carregar dados da OP.", "error");
  }
}

// ─── Renderizar tabela de pedidos vinculados ──────────────────────────────────
function renderPedidos(pedidos) {
  const tabela     = document.getElementById("tabelaPedidos");
  const semPedidos = document.getElementById("semPedidos");
  const tbody      = document.getElementById("pedidosTabela");

  if (!pedidos || pedidos.length === 0) {
    tabela.style.display     = "none";
    semPedidos.style.display = "block";

    document.getElementById("totalClientes").innerText  = "0";
    document.getElementById("totalPedidos").innerText   = "0";
    document.getElementById("qtdeSolicitada").innerText = "0";
    return;
  }

  semPedidos.style.display = "none";
  tabela.style.display     = "table";

  const totalSolicitada = pedidos.reduce((s, p) => s + Number(p.qtde_solicitada || 0), 0);
  const clientesUnicos  = [...new Set(pedidos.map(p => p.cliente).filter(Boolean))];

  document.getElementById("totalClientes").innerText  = clientesUnicos.length;
  document.getElementById("totalPedidos").innerText   = pedidos.length;
  document.getElementById("qtdeSolicitada").innerText = totalSolicitada;

  tbody.innerHTML = "";
  pedidos.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td style="text-align:left;font-weight:600">${fmt(p.cliente)}</td>
      <td>${fmt(p.estado)}</td>
      <td>${fmt(p.codigo_cliente)}</td>
      <td>${fmt(p.pedido_venda)}</td>
      <td>${fmt(p.ordem_compra)}</td>
      <td>${fmt(p.qtde_solicitada)}</td>
      <td style="font-weight:700;color:#4ade80">${fmt(p.qtde_atendida || '—')}</td>
      <td>${fmtData(p.data_contratual)}</td>
    `;
    tbody.appendChild(tr);
  });
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
        <td>${v.prestador_servico || "—"}</td>
        <td>${v.prestador_cnpj || "—"}</td>
        <td>${v.descricao || v.codigo_produto || "—"}</td>
        <td>${Number(v.quantidade || 0).toLocaleString("pt-BR", {minimumFractionDigits: 2})}</td>
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