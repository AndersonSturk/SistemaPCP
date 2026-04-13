import { apiRequest, getUser, showToast } from "./auth.js";

const user = getUser();
if (!user) window.location.href = "login.html";

if (!["admin", "pcp", "logistica", "producao", "ped"].includes(user.perfil)) {
  showToast("Você não tem permissão para acessar esta página.", "error");
  setTimeout(() => (window.location.href = "index.html"), 1500);
}

// ── Configuração do setor por perfil ────────────────────
const PERFIL_CONFIG = {
  admin:    { setor: "Administração",  tipo: "Produção Interna",               centro: "ADM",        projeto: "Gestão de Produção" },
  pcp:      { setor: "PCP",            tipo: "Produção Interna",               centro: "PCP",        projeto: "Planejamento e Controle da Produção" },
  producao: { setor: "Produção",       tipo: "Produção Interna",               centro: "Produção",   projeto: "Montagem e Produção" },
  ped:      { setor: "P&D",            tipo: "Pesquisa e Desenvolvimento",     centro: "P&D",        projeto: "Desenvolvimento de Produtos" },
  logistica:{ setor: "Logística",      tipo: "Produção Interna",               centro: "Logística",  projeto: "Controle de Estoque e Expedição" },
};

function aplicarDadosSetor() {
  const cfg = PERFIL_CONFIG[user.perfil] || PERFIL_CONFIG.pcp;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText("setorLabel", cfg.setor);
  setText("tipoLabel", cfg.tipo);
  setText("centroCustoLabel", cfg.centro);
  setText("centroCustoTxt", cfg.centro);
  setText("projetoTxt", cfg.projeto);
}

// ── Helpers ──────────────────────────────────────────────
function setText(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = text;
}

function formatDateTime(value, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("pt-BR");
}

function createTableRow(columns = []) {
  const tr = document.createElement("tr");
  columns.forEach(col => {
    const td = document.createElement("td");
    td.textContent = col;
    tr.appendChild(td);
  });
  return tr;
}

function renderLogs(logs) {
  const container = document.getElementById("listaLogs");
  if (!container) return;
  container.innerHTML = "";

  if (!logs.length) {
    const p = document.createElement("p");
    p.style.color = "#888";
    p.style.fontSize = "13px";
    p.textContent = "Nenhum log registrado.";
    container.appendChild(p);
    return;
  }

  logs.forEach(l => {
    const item = document.createElement("div");
    item.className = "log-item";
    const date = document.createElement("b");
    date.textContent = formatDateTime(l.data, "—");
    item.appendChild(date);
    const pre = document.createElement("pre");
    pre.textContent = typeof l.depois === "string" ? l.depois : JSON.stringify(l.depois, null, 2);
    item.appendChild(pre);
    container.appendChild(item);
  });
}

// ── Parâmetros da URL ────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const opId = urlParams.get("id");

if (!opId) {
  showToast("OP não identificada.", "error");
  setTimeout(() => (window.location.href = "processos.html"), 1500);
}

// ── Carregar dados da OP ─────────────────────────────────
async function carregarOP() {
  try {
    const res = await apiRequest(`/op/${opId}`);
    const op = res.data;

    if (!op) {
      showToast("OP não encontrada.", "error");
      return;
    }

    // Aplica dados do setor
    aplicarDadosSetor();

    // Dados da OP (somente leitura)
    setText("opId", op.numero_op || op.id);
    setText("dataCriacao", formatDateTime(op.data_criacao));
    setText("statusTxt", op.status || "—");
    setText("dataFinalTxt", op.data_finalizacao ? formatDateTime(op.data_finalizacao, "Em andamento") : "Em andamento");
    setText("responsavelTxt", op.responsavel || "—");
    setText("codigoItem", op.codigo_produto || "—");
    setText("descricao", op.descricao_material || "—");

    const quantidade = op.qtde_total || op.quantidade || 0;
    setText("quantidade", quantidade.toLocaleString("pt-BR"));
    setText("unidadeTxt", op.unidade_medida || "un");
    setText("custoUnitario", Number(op.custo_unitario || 0).toFixed(2));
    setText("custoTotal", Number(op.custo_total || 0).toFixed(2));

    // Campos editáveis
    document.getElementById("status").value = op.status || "ABERTA";
    document.getElementById("responsavel").value = op.responsavel || "";
    const obsEl = document.getElementById("observacoes");
    if (obsEl) obsEl.value = op.observacoes || "";

    if (op.data_finalizacao) {
      document.getElementById("dataFinalizacao").value = op.data_finalizacao.split("T")[0];
    }

    // ── Bloqueia edição se OP concluída ou cancelada ──
    const bloqueada = ["CONCLUIDA", "CANCELADA"].includes((op.status || "").toUpperCase());
    if (bloqueada) {
      document.getElementById("status").disabled = true;
      document.getElementById("responsavel").disabled = true;
      document.getElementById("dataFinalizacao").disabled = true;
      if (obsEl) obsEl.disabled = true;
      const acoesEl = document.getElementById("acoesEditar");
      if (acoesEl) {
        acoesEl.innerHTML = `<button disabled style="opacity:0.5;cursor:not-allowed">OP ${op.status === "CONCLUIDA" ? "Concluída" : "Cancelada"} (somente leitura)</button>`;
      }
    }

    // Tabela de itens
    const itensTabela = document.getElementById("itensTabela");
    itensTabela.innerHTML = "";
    const row = createTableRow([
      op.codigo_produto || "—",
      op.descricao_material || "—",
      `${quantidade} ${op.unidade_medida || ""}`,
      `R$ ${Number(op.custo_unitario || 0).toFixed(2)}`,
      `R$ ${Number(op.custo_total || 0).toFixed(2)}`,
    ]);
    itensTabela.appendChild(row);

    carregarLogs();
  } catch (err) {
    console.error("Erro ao carregar OP:", err);
    showToast("Erro ao carregar dados da OP.", "error");
  }
}

// ── Logs ─────────────────────────────────────────────────
async function carregarLogs() {
  try {
    const res = await apiRequest(`/ordens_producao/${opId}/logs`);
    renderLogs(res.data || []);
  } catch (err) {
    console.warn("Logs indisponíveis:", err.message);
    const container = document.getElementById("listaLogs");
    if (!container) return;
    container.innerHTML = `<p style="color:#888;font-size:13px">Logs indisponíveis.</p>`;
  }
}

// ── Salvar edição ────────────────────────────────────────
window.salvarEdicao = async function() {
  const status = document.getElementById("status").value;
  const responsavel = document.getElementById("responsavel").value.trim();
  const dataFinalizacao = document.getElementById("dataFinalizacao").value;
  const observacoes = document.getElementById("observacoes")?.value?.trim() || "";

  const btnSalvar = document.querySelector("#acoesEditar button");
  if (!btnSalvar) return;
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    await apiRequest(`/ordens_producao/${opId}`, {
      method: "PUT",
      body: JSON.stringify({
        status,
        responsavel,
        data_finalizacao: dataFinalizacao || null,
        observacoes,
      }),
    });

    showToast("OP atualizada com sucesso!", "success");
    setTimeout(() => (window.location.href = "processos.html"), 1200);
  } catch (err) {
    console.error("Erro ao salvar OP:", err);
    showToast(err.message || "Erro ao salvar alterações.", "error");
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar alterações";
  }
};

// ── Init ──────────────────────────────────────────────────
carregarOP();
