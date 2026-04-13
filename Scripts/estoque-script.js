import { apiRequest, getUser, logout, showToast } from "./auth.js";

// ── Auth ───────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";

const elUser = document.getElementById("userInfo");
if (elUser) elUser.textContent = user.nome || user.usuario || "";
document.getElementById("btnLogout")?.addEventListener("click", logout);

// ── Estado ────────────────────────────────────────────
let page       = 1;
const limit    = 50;
let totalPages = 1;
let debTimer   = null;

let extratoPage = 1;
const extratoLimit = 30;
let extratoTotalPages = 1;
let materialAberto = null;

// ── Helpers ──────────────────────────────────────────
const fmt      = (v) => (v != null && v !== "") ? v : "—";
const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtNum   = (v) => { const n = Number(v || 0); return n % 1 === 0 ? String(n) : n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
const fmtData  = (v) => v ? new Date(v).toLocaleDateString("pt-BR") : "—";
const fmtDataHora = (v) => v ? new Date(v).toLocaleString("pt-BR") : "—";

const TIPO_LABEL = {
  revenda: "Revenda", produzido: "Produzido", insumo: "Insumo",
  material: "Material", em_processo: "Em Processo", apenas_temporario: "Temporário",
};
const TIPO_COLOR = {
  revenda: "#93c5fd", produzido: "#4ade80", insumo: "#fbbf24",
  material: "#c084fc", em_processo: "#fb923c", apenas_temporario: "#94a3b8",
};

// ── Elementos ─────────────────────────────────────────
const tabela       = document.getElementById("tabelaEstoque");
const busca        = document.getElementById("buscaMaterial");
const filtroTipo   = document.getElementById("filtroTipo");
const filtroGrupo  = document.getElementById("filtroGrupo");
const modal        = document.getElementById("modalOverlay");
const btnFechar    = document.getElementById("btnFechar");
const btnAnterior  = document.getElementById("btnAnterior");
const btnProximo   = document.getElementById("btnProximo");
const pageInfo     = document.getElementById("pageInfo");

// ── Tabs do modal ─────────────────────────────────────
document.querySelectorAll(".modal-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".modal-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const tabName = btn.dataset.tab;
    const paneId = "pane" + tabName.charAt(0).toUpperCase() + tabName.slice(1);
    document.getElementById(paneId)?.classList.add("active");

    // Carregar extrato ao clicar na aba
    if (tabName === "extrato" && materialAberto) {
      extratoPage = 1;
      carregarExtrato(materialAberto);
    }
  });
});

// ── Modal: abrir/fechar ───────────────────────────────
function abrirModal() {
  document.querySelectorAll(".modal-tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  document.querySelector("[data-tab='dados']").classList.add("active");
  document.getElementById("paneDados").classList.add("active");
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("show"));
}
function fecharModal() {
  modal.classList.remove("show");
  setTimeout(() => modal.classList.add("hidden"), 300);
  materialAberto = null;
}

btnFechar.addEventListener("click", fecharModal);

// ── Tabela de materiais ───────────────────────────────
async function renderTabela() {
  tabela.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:28px">Carregando...</td></tr>`;
  try {
    const search = busca.value.trim();
    const tipo   = filtroTipo.value;
    const grupo  = filtroGrupo.value;
    const params = `page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&tipo=${encodeURIComponent(tipo)}&grupo=${encodeURIComponent(grupo)}`;
    const res = await apiRequest(`/estoque/lista?${params}`);
    totalPages = res.totalPages || 1;
    const lista = res.data || [];

    if (!lista.length) {
      tabela.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:28px">Nenhum material encontrado.</td></tr>`;
    } else {
      tabela.innerHTML = "";
      lista.forEach(m => {
        const estoque = Number(m.estoque || 0);
        let estClass = "estoque-positivo";
        if (estoque <= 0) estClass = "estoque-zero";
        if (estoque < 0) estClass = "estoque-negativo";

        const tipoLabel = TIPO_LABEL[m.tipo] || m.tipo || "—";
        const tipoColor = TIPO_COLOR[m.tipo] || "#94a3b8";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-weight:600">${fmt(m.codigo_produto)}</td>
          <td>${fmt(m.descricao)}</td>
          <td><span class="badge-un">${fmt(m.unidade_medida)}</span></td>
          <td><span class="badge-tipo" style="background:${tipoColor}22;color:${tipoColor}">${tipoLabel}</span></td>
          <td>${fmt(m.grupo)}</td>
          <td class="${estClass}">${fmtNum(estoque)}</td>
          <td>R$ ${fmtMoeda(m.custo_fornecedor)}</td>
        `;
        tr.addEventListener("click", () => abrirDetalhe(m.id));
        tabela.appendChild(tr);
      });
    }

    pageInfo.textContent = `Página ${page} de ${totalPages} (${res.total || 0} itens)`;
    btnAnterior.disabled = page <= 1;
    btnProximo.disabled  = page >= totalPages;
  } catch (err) {
    console.error("Erro ao carregar estoque:", err);
    tabela.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#f87171;padding:28px">Erro ao carregar dados.</td></tr>`;
  }
}

// ── Detalhe do material ────────────────────────────────
async function abrirDetalhe(id) {
  try {
    const res = await apiRequest(`/estoque/detalhe/${id}`);
    const m = res.data;
    materialAberto = id;

    document.getElementById("modalTitle").textContent = `${m.codigo_produto || "—"} — ${m.descricao || "Material"}`;
    document.getElementById("detCodigo").textContent    = fmt(m.codigo_produto);
    document.getElementById("detDescricao").textContent = fmt(m.descricao);
    document.getElementById("detUnidade").textContent   = fmt(m.unidade_medida);
    document.getElementById("detTipo").textContent      = TIPO_LABEL[m.tipo] || fmt(m.tipo);
    document.getElementById("detGrupo").textContent     = fmt(m.grupo);
    document.getElementById("detSubgrupo").textContent  = fmt(m.subgrupo);
    document.getElementById("detMarca").textContent     = fmt(m.marca);
    document.getElementById("detEmbalagem").textContent = m.qtde_embalagem ? String(m.qtde_embalagem) : "—";
    document.getElementById("detSituacao").textContent  = m.situacao === "ativo" ? "Ativo" : m.situacao === "inativo" ? "Inativo" : fmt(m.situacao);

    const estoque = Number(m.estoque || 0);
    const detEst  = document.getElementById("detEstoque");
    detEst.textContent = fmtNum(estoque);
    detEst.className = estoque > 0 ? "estoque-positivo" : estoque < 0 ? "estoque-negativo" : "estoque-zero";

    document.getElementById("detCusto").textContent = `R$ ${fmtMoeda(m.custo_fornecedor)}`;

    // Ficha técnica (documento profissional)
    renderFichaTecnica(m.ficha_tecnica || [], m);

    // Limpar extrato
    document.getElementById("extratoVazio").style.display = "";
    document.getElementById("extratoTabela").style.display = "none";
    document.getElementById("extratoPaginacao").style.display = "none";

    abrirModal();
  } catch (err) {
    console.error("Erro ao carregar detalhe:", err);
    showToast("Erro ao carregar detalhes do material.", "error");
  }
}

// ── Ficha Técnica (Documento profissional) ────────────
let ftMaterialAtual = null;

function renderFichaTecnica(lista, material) {
  const emptyEl = document.getElementById("ftEmpty");
  const container = document.getElementById("ftDocContainer");
  ftMaterialAtual = material;

  if (!lista || lista.length === 0) {
    emptyEl.style.display = "";
    container.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  container.style.display = "";

  const now = new Date().toLocaleDateString("pt-BR");
  document.getElementById("ftDocData").textContent = now;
  document.getElementById("ftDocFooterData").textContent = now;

  // Dados do material
  const m = material || {};
  document.getElementById("ftDocCodigo").textContent = fmt(m.codigo_produto);
  document.getElementById("ftDocDescricao").textContent = fmt(m.descricao);
  document.getElementById("ftDocUnidade").textContent = fmt(m.unidade_medida);
  document.getElementById("ftDocTipo").textContent = TIPO_LABEL[m.tipo] || fmt(m.tipo);
  document.getElementById("ftDocGrupo").textContent = fmt(m.grupo);
  document.getElementById("ftDocSubgrupo").textContent = fmt(m.subgrupo);
  document.getElementById("ftDocMarca").textContent = fmt(m.marca);
  document.getElementById("ftDocCusto").textContent = `R$ ${fmtMoeda(m.custo_fornecedor)}`;

  // Descrição detalhada
  const descBox = document.getElementById("ftDocDescDetalhadaBox");
  if (m.descricao_detalhada) {
    descBox.style.display = "";
    document.getElementById("ftDocDescDetalhada").textContent = m.descricao_detalhada;
  } else {
    descBox.style.display = "none";
  }

  // Tabela de insumos
  const tbody = document.getElementById("ftDocInsumos");
  let totalCusto = 0;
  tbody.innerHTML = lista.map((item, i) => {
    const qtde = Number(item.quantidade_por_unidade || 0);
    const custo = Number(item.custo_unit || 0);
    const sub = qtde * custo;
    totalCusto += sub;
    return `<tr>
      <td>${i + 1}</td>
      <td style="font-weight:600">${fmt(item.insumo_codigo || "—")}</td>
      <td style="text-align:left">${fmt(item.insumo_descricao || item.descricao)}</td>
      <td>${fmtNum(qtde)}</td>
      <td>${fmt(item.unidade_medida || "un")}</td>
      <td>R$ ${fmtMoeda(custo)}</td>
      <td>R$ ${fmtMoeda(sub)}</td>
    </tr>`;
  }).join("");

  document.getElementById("ftDocTotalQtde").textContent = lista.length + " itens";
  document.getElementById("ftDocTotalCusto").textContent = `R$ ${fmtMoeda(totalCusto)}`;
}

// ── Gerar PDF da ficha técnica ────────────────────────
window.ftGerarPDF = function () {
  const doc = document.getElementById("ftDoc");
  if (!doc) return;
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Ficha Técnica — ${ftMaterialAtual?.codigo_produto || ""}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; color: #1f2933; font-size: 11px; }
      .ft-doc { padding: 0; }
      .ft-doc-topo { display: flex; justify-content: space-between; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 12px; }
      .ft-doc-empresa h3 { margin: 0; font-size: 16px; color: #16a34a; }
      .ft-doc-empresa p { margin: 1px 0; font-size: 9px; color: #475569; }
      .ft-doc-titulo { text-align: right; }
      .ft-doc-titulo h4 { margin: 0; font-size: 13px; color: #dc2626; }
      .ft-doc-titulo p { margin: 1px 0; font-size: 9px; color: #475569; }
      .ft-doc-blocos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
      .ft-doc-bloco { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
      .ft-doc-bloco h5 { margin: 0 0 6px; font-size: 10px; color: #16a34a; text-transform: uppercase; letter-spacing: .4px; }
      .ft-doc-bloco p { margin: 2px 0; font-size: 10px; }
      .ft-doc-bloco-full { grid-column: span 2; }
      .ft-doc-desc { background: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
      .ft-doc-desc h5 { margin: 0 0 4px; font-size: 10px; color: #15803d; text-transform: uppercase; }
      .ft-doc-desc p { margin: 0; font-size: 10px; line-height: 1.5; white-space: pre-wrap; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th { background: linear-gradient(135deg, #22c55e, #dc2626); color: #fff; padding: 5px 8px; font-size: 9px; font-weight: 700; text-transform: uppercase; text-align: center; border: 1px solid #15803d; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      td { padding: 4px 8px; font-size: 10px; border: 1px solid #e5e7eb; text-align: center; }
      tbody tr:nth-child(even) { background: #f0fdf4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tfoot td { background: #dcfce7; font-weight: 700; border-top: 2px solid #bbf7d0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .ft-doc-footer { margin-top: 14px; padding-top: 6px; border-top: 2px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 8px; color: #64748b; }
    </style></head><body>`);
  win.document.write(doc.outerHTML);
  win.document.write("</body></html>");
  win.document.close();
  setTimeout(() => { win.print(); }, 400);
};

// ── Extrato de movimentações ────────────────────────────
async function carregarExtrato(materialId) {
  const vazioEl = document.getElementById("extratoVazio");
  const tabelaEl = document.getElementById("extratoTabela");
  const tbody    = document.getElementById("extratoBody");
  const pagEl    = document.getElementById("extratoPaginacao");

  try {
    const res = await apiRequest(`/estoque/extrato/${materialId}?page=${extratoPage}&limit=${extratoLimit}`);
    const lista = res.data || [];
    extratoTotalPages = res.totalPages || 1;

    if (!lista.length) {
      vazioEl.style.display = "";
      tabelaEl.style.display = "none";
      pagEl.style.display = "none";
      return;
    }

    vazioEl.style.display = "none";
    tabelaEl.style.display = "";
    tbody.innerHTML = "";

    lista.forEach(mov => {
      const tr = document.createElement("tr");
      const badgeClass = {
        ENTRADA: "badge-entrada", SAIDA: "badge-saida",
        PRODUCAO: "badge-producao", AJUSTE: "badge-ajuste",
      }[mov.tipo] || "badge-ajuste";
      const tipoLabel = {
        ENTRADA: "Entrada", SAIDA: "Saída",
        PRODUCAO: "Produção", AJUSTE: "Ajuste",
      }[mov.tipo] || mov.tipo;
      const refLabel = mov.referencia_label || "—";
      const refTipo  = mov.referencia_tipo || "";

      tr.innerHTML = `
        <td>${fmtDataHora(mov.criado_em)}</td>
        <td><span class="${badgeClass}">${tipoLabel}</span></td>
        <td style="font-weight:600">${fmtNum(mov.quantidade)}</td>
        <td>${mov.estoque_anterior != null ? fmtNum(mov.estoque_anterior) : "—"}</td>
        <td>${mov.estoque_novo != null ? fmtNum(mov.estoque_novo) : "—"}</td>
        <td>${fmt(refLabel)}</td>
        <td>${fmt(mov.usuario_nome)}</td>
      `;
      tbody.appendChild(tr);
    });

    if (extratoTotalPages > 1) {
      pagEl.style.display = "";
      document.getElementById("extratoPageInfo").textContent = `Página ${extratoPage} de ${extratoTotalPages}`;
      document.getElementById("btnExtratoAnt").disabled  = extratoPage <= 1;
      document.getElementById("btnExtratoProx").disabled = extratoPage >= extratoTotalPages;
    } else {
      pagEl.style.display = "none";
    }
  } catch (err) {
    console.warn("Erro ao carregar extrato:", err.message);
    vazioEl.style.display = "";
    tabelaEl.style.display = "none";
    pagEl.style.display = "none";
  }
}

// ── Extrato paginação ─────────────────────────────────
document.getElementById("btnExtratoAnt")?.addEventListener("click", () => {
  if (extratoPage > 1 && materialAberto) { extratoPage--; carregarExtrato(materialAberto); }
});
document.getElementById("btnExtratoProx")?.addEventListener("click", () => {
  if (extratoPage < extratoTotalPages && materialAberto) { extratoPage++; carregarExtrato(materialAberto); }
});

// ── Carregar grupos para filtro ───────────────────────
async function carregarGrupos() {
  try {
    const res = await apiRequest("/materiais/grupos");
    const grupos = res.data || res.grupos || [];
    grupos.forEach(g => {
      if (!g) return;
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      filtroGrupo.appendChild(opt);
    });
  } catch {
    // silencioso — grupos é filtro opcional
  }
}

// ── Paginação ────────────────────────────────────────
btnAnterior.addEventListener("click", () => { if (page > 1) { page--; renderTabela(); } });
btnProximo.addEventListener("click",  () => { if (page < totalPages) { page++; renderTabela(); } });

// ── Filtros com debounce ────────────────────────────
busca.addEventListener("input", () => {
  clearTimeout(debTimer);
  debTimer = setTimeout(() => { page = 1; renderTabela(); }, 350);
});
filtroTipo.addEventListener("change", () => { page = 1; renderTabela(); });
filtroGrupo.addEventListener("change", () => { page = 1; renderTabela(); });

// ── Init ────────────────────────────────────────────
carregarGrupos();
renderTabela();
