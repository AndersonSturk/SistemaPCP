
import { apiRequest, getUser, showToast } from "./auth.js";


const user = getUser();
if (!user) window.location.href = "login.html";

if (!["admin", "pcp", "logistica"].includes(user.perfil)) {
  showToast("Você não tem permissão para acessar esta página.", "error");
  setTimeout(() => (window.location.href = "index.html"), 1500);
}

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

// ─── Parâmetros da URL ─────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const opId = urlParams.get("id");

if (!opId) {
  showToast("OP não identificada.", "error");
  setTimeout(() => (window.location.href = "processos.html"), 1500);
}

// ─── Carregar dados da OP ──────────────────────────────────────
async function carregarOP() {
  try {
    const res = await apiRequest(`/op/${opId}`);
    const op = res.data;

    if (!op) {
      showToast("OP não encontrada.", "error");
      return;
    }

    // Informações principais
    setText("opId", op.numero_op || op.id);
    setText("dataCriacao", formatDateTime(op.data_criacao));
    setText("statusTxt", op.status || "—");
    setText("dataFinalTxt", op.data_finalizacao ? formatDateTime(op.data_finalizacao, "Em andamento") : "Em andamento");
    setText("responsavelTxt", op.responsavel || "—");
    setText("codigoItem", op.codigo_produto || "—");
    setText("descricao", op.descricao_material || "—");

    // Quantidade principal (usa qtde_total ou quantidade)
    const quantidade = op.qtde_total || op.quantidade || 0;

    document.getElementById("quantidade").innerText =
      `${quantidade} ${op.unidade_medida || ""}`;

    document.getElementById("custoUnitario").innerText =
      Number(op.custo_unitario || 0).toFixed(2);

    document.getElementById("custoTotal").innerText =
      Number(op.custo_total || 0).toFixed(2);

    // ─── Campos editáveis ──────────────────────────────────────
    document.getElementById("status").value = op.status || "ABERTA";
    document.getElementById("responsavel").value = op.responsavel || "";
    document.getElementById("unidadeMedida").value =
      op.unidade_medida || "";

    if (op.data_finalizacao) {
      document.getElementById("dataFinalizacao").value =
        op.data_finalizacao.split("T")[0];
    }

    // ─── Tabela de itens ───────────────────────────────────────
    const itensTabela = document.getElementById("itensTabela");
    itensTabela.innerHTML = "";
    const row = document.createElement("tr");

    const cols = [
      op.codigo_produto || "—",
      op.descricao_material || "—",
      `${quantidade} ${op.unidade_medida || ""}`,
      `R$ ${Number(op.custo_unitario || 0).toFixed(2)}`,
      `R$ ${Number(op.custo_total || 0).toFixed(2)}`,
    ];

    cols.forEach(text => {
      const td = document.createElement("td");
      td.textContent = text;
      row.appendChild(td);
    });

    itensTabela.appendChild(row);

    // Se o backend retornar pedidos vinculados
    if (op.pedidos && op.pedidos.length > 0) {
      console.log("Pedidos vinculados:", op.pedidos);
    }

    carregarLogs();
  } catch (err) {
    console.error("Erro ao carregar OP:", err);
    showToast("Erro ao carregar dados da OP.", "error");
  }
}

// ─── Logs ─────────────────────────────────────────────────────
async function carregarLogs() {
  try {
    const res = await apiRequest(`/ordens_producao/${opId}/logs`);
    const logs = res.data || [];
    renderLogs(logs);
  } catch (err) {
    console.warn("Logs indisponíveis:", err.message);
    const container = document.getElementById("listaLogs");
    if (!container) return;
    container.innerHTML = "";
    const msg = document.createElement("p");
    msg.style.color = "#888";
    msg.style.fontSize = "13px";
    msg.textContent = "Logs indisponíveis.";
    container.appendChild(msg);
  }
}

// ─── Salvar edição ────────────────────────────────────────────
async function salvarEdicao() {
  const status = document.getElementById("status").value;
  const responsavel = document.getElementById("responsavel").value.trim();
  const dataFinalizacao = document.getElementById("dataFinalizacao").value;
  const unidadeMedida = document
    .getElementById("unidadeMedida")
    .value.trim();

  const btnSalvar = document.querySelector(".actions button");
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    await apiRequest(`/ordens_producao/${opId}`, {
      method: "PUT",
      body: JSON.stringify({
        status,
        responsavel,
        data_finalizacao: dataFinalizacao || null,
        unidade_medida: unidadeMedida,
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
}

window.salvarEdicao = salvarEdicao;

carregarOP();

