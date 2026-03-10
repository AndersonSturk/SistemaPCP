import { apiRequest, getUser, logout, showToast } from "./auth.js";

// ─── Autenticação ─────────────────────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";

const userInfo = document.getElementById("userInfo");
if (userInfo) userInfo.innerText = `Olá, ${user.nome}`;

// ─── Elementos ────────────────────────────────────────────────────────────────
const tabelaOPs        = document.getElementById("tabelaOPs");
const buscaOP          = document.getElementById("buscaOP");
const modalGerenciarOP = document.getElementById("modalGerenciarOP");
const formGerenciarOP  = document.getElementById("formGerenciarOP");
const btnVoltar        = document.getElementById("btnVoltar");
const btnLogout        = document.getElementById("btnLogout");
const btnFecharModal   = document.getElementById("btnFecharModal");
const btnIniciar       = document.getElementById("btnIniciarProducao");
const btnFinalizar     = document.getElementById("btnFinalizarProducao");
const tipFinalizar     = document.getElementById("tipFinalizar");

// ⚠️ Botões dentro do <form> precisam de type="button" para não submeter
if (btnFecharModal) btnFecharModal.setAttribute("type", "button");

let opAtualId     = null;
let opAtualStatus = null;   // controla quais botões ficam ativos
let debounceTimer = null;

// ─── Loading overlay ──────────────────────────────────────────────────────────
function showLoading(msg = "Aguarde...") {
  let overlay = document.getElementById("loadingOverlay");
  if (!overlay) {
    if (!document.getElementById("pcpSpinStyle")) {
      const s = document.createElement("style");
      s.id = "pcpSpinStyle";
      s.textContent = `@keyframes pcpSpin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(s);
    }
    overlay = document.createElement("div");
    overlay.id = "loadingOverlay";
    overlay.innerHTML = `<div id="loadingBox"><div id="loadingSpinner"></div><span id="loadingMsg"></span></div>`;
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;
      align-items:center;justify-content:center;z-index:9998;opacity:0;transition:opacity 0.2s ease;`;
    overlay.querySelector("#loadingBox").style.cssText = `background:#fff;border-radius:14px;
      padding:32px 44px;display:flex;flex-direction:column;align-items:center;gap:18px;
      box-shadow:0 8px 32px rgba(0,0,0,0.2);min-width:210px;`;
    overlay.querySelector("#loadingSpinner").style.cssText = `width:42px;height:42px;
      border:4px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;
      animation:pcpSpin 0.7s linear infinite;`;
    overlay.querySelector("#loadingMsg").style.cssText = `font-size:15px;color:#374151;
      font-weight:500;font-family:sans-serif;`;
    document.body.appendChild(overlay);
  }
  overlay.querySelector("#loadingMsg").textContent = msg;
  overlay.style.display = "flex";
  requestAnimationFrame(() => (overlay.style.opacity = "1"));
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;
  overlay.style.opacity = "0";
  setTimeout(() => (overlay.style.display = "none"), 200);
}

// ─── Stepper de status ────────────────────────────────────────────────────────
// Atualiza visualmente as 3 etapas conforme o status da OP
function atualizarStepper(status) {
  const steps = {
    ABERTA:      document.getElementById("step-aberta"),
    EM_PRODUCAO: document.getElementById("step-emproducao"),
    CONCLUIDA:   document.getElementById("step-concluida"),
  };

  Object.values(steps).forEach(s => s && s.classList.remove("active", "done"));

  if (status === "ABERTA") {
    steps.ABERTA.classList.add("active");
  } else if (status === "EM_PRODUCAO") {
    steps.ABERTA.classList.add("done");
    steps.EM_PRODUCAO.classList.add("active");
  } else if (status === "CONCLUIDA" || status === "CANCELADA") {
    steps.ABERTA.classList.add("done");
    steps.EM_PRODUCAO.classList.add("done");
    steps.CONCLUIDA.classList.add("active");
  }
}

// ─── Estado dos botões de produção ───────────────────────────────────────────
// Regra:
//   Aberta      → Iniciar habilitado  | Finalizar desabilitado
//   EmProducao  → Iniciar desabilitado | Finalizar habilitado
//   Concluida   → Ambos desabilitados
function atualizarBotoesProducao(status) {
  if (!btnIniciar || !btnFinalizar) return;

  if (status === "ABERTA") {
    btnIniciar.style.display = "inline-flex";
    btnFinalizar.style.display = "none";
  }

  else if (status === "EM_PRODUCAO") {
    btnIniciar.style.display = "none";
    btnFinalizar.style.display = "inline-flex";
  }

  else if (status === "CONCLUIDA" || status === "CANCELADA") {
    btnIniciar.style.display = "none";
    btnFinalizar.style.display = "none";
  }

  if (tipFinalizar) {
    tipFinalizar.style.display =
      status === "EM_PRODUCAO" ? "none" : "";
  }
}

// ─── Carregar OPs ─────────────────────────────────────────────────────────────
async function carregarOPs(search = "") {
  tabelaOPs.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#888">Carregando...</td></tr>`;
  try {
    const res = await apiRequest(`/ordens_producao?search=${encodeURIComponent(search)}`);
    const ops = res.data || [];
    tabelaOPs.innerHTML = "";

    if (ops.length === 0) {
      tabelaOPs.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#888">Nenhuma OP encontrada.</td></tr>`;
      return;
    }

    ops.forEach((op) => {
      const tr = document.createElement("tr");
      const materialLabel = op.codigo_produto
        ? `${op.codigo_produto} — ${op.descricao_material || op.descricao || ""}`
        : op.material_id;

      tr.innerHTML = `
        <td>${op.id}</td>
        <td>${op.numero_op}</td>
        <td>${materialLabel}</td>
        <td>${op.quantidade}</td>
        <td><span class="badge badge-${badgeStatus(op.status)}">${op.status}</span></td>
        <td>
          <button class="btn btn-editar">Gerenciar</button>
          <button class="btn btn-default">Visualizar</button>
          <button class="btn-excluir-op">🗑️</button>
        </td>
      `;
      tr.querySelector(".btn-editar").addEventListener("click", () => abrirModalOP(op.id));
      tr.querySelector(".btn-default").addEventListener("click", () => visualizarOP(op.id));
      tr.querySelector(".btn-excluir-op").addEventListener("click", () => abrirConfirmExcluir(op));
      tabelaOPs.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar OPs:", err);
    showToast("Erro ao carregar ordens de produção.", "error");
    tabelaOPs.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#e74c3c">Erro ao carregar dados.</td></tr>`;
  }
}

function badgeStatus(status) {
  const map = { ABERTA: "info", EM_PRODUCAO: "warning", CONCLUIDA: "success", CANCELADA: "default" };
  return map[status] || "default";
}

// ─── Abrir modal ──────────────────────────────────────────────────────────────
async function abrirModalOP(id) {
  opAtualId = id;
  showLoading("Carregando OP...");

  try {
    const res = await apiRequest(`/ordens_producao/${id}`);
    const op  = res.data;

    opAtualStatus = op.status;

    // Normaliza status antigos (antes da migração de enum) para o formato atual
    const statusMap = { "Aberta": "ABERTA", "EmProducao": "EM_PRODUCAO", "Concluida": "CONCLUIDA", "Cancelada": "CANCELADA" };
    if (statusMap[op.status]) op.status = statusMap[op.status];
    opAtualStatus = op.status; // atualiza após normalização

    // Helper: só atribui se o elemento existir no DOM
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val ?? "";
    };

    setVal("material_id",     op.codigo_produto    || op.material_id || "");
    setVal("quantidade",      op.quantidade        || op.qtde_total  || "");
    setVal("unidade_medida",  op.unidade_medida    || "");
    setVal("observacoes",     op.observacoes       || "");
    setVal("numero_op",       op.numero_op         || "");
    setVal("status",          op.status            || "");
    setVal("custo_unitario",  Number(op.custo_unitario || 0).toFixed(2));
    setVal("custo_total",     Number(op.custo_total    || 0).toFixed(2));
    setVal("data_criacao",    op.data_criacao
      ? new Date(op.data_criacao).toLocaleString("pt-BR") : "");

    // Subtítulo do cabeçalho
    const labelNumeroOP = document.getElementById("label_numero_op");
    if (labelNumeroOP) labelNumeroOP.textContent = op.numero_op || op.id;

    // Atualiza stepper e botões conforme status real da OP
    atualizarStepper(op.status);
    atualizarBotoesProducao(op.status);

    // Busca pedidos disponíveis para este material
    const codigoProduto = op.codigo_produto || null;
    const qtdeOP        = Number(op.qtde_total || op.quantidade || 0);
    if (codigoProduto) {
      carregarPedidosModal(codigoProduto, op.status, qtdeOP, op.unidade_medida);
    } else {
      const tbody = document.getElementById("tabelaPedidosModalBody");
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px;">Material sem código de produto definido.</td></tr>`;
    }

    // Carrega insumos salvos para esta OP
    await carregarInsumosOP(id);
    await carregarPrestadoresOP(id);

    hideLoading();
    modalGerenciarOP.classList.remove("hidden");
    requestAnimationFrame(() => modalGerenciarOP.classList.add("show"));
  } catch (err) {
    hideLoading();
    console.error("Erro ao abrir OP:", err);
    showToast("Erro ao carregar dados da OP.", "error");
  }
}

// ─── Fechar modal ─────────────────────────────────────────────────────────────
function fecharModalOP() {
  modalGerenciarOP.classList.remove("show");
  setTimeout(() => modalGerenciarOP.classList.add("hidden"), 250);
  opAtualId = null;
  opAtualStatus = null;
}
window.fecharModalOP = fecharModalOP;
window.voltarHub     = () => window.location.href = "index.html";

// ─── Salvar dados editáveis ───────────────────────────────────────────────────
formGerenciarOP.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btnSalvar = formGerenciarOP.querySelector("button[type=submit]");
  btnSalvar.disabled = true;
  showLoading("Salvando alterações...");

  try {
    await apiRequest(`/ordens_producao/${opAtualId}`, {
      method: "PUT",
      body: JSON.stringify({
        material_id:     document.getElementById("material_id").value,
        quantidade:      document.getElementById("quantidade").value,
        unidade_medida:  document.getElementById("unidade_medida").value,
        observacoes:     document.getElementById("observacoes").value,
      }),
    });
    hideLoading();
    showToast("OP atualizada com sucesso!", "success");
    fecharModalOP();
    carregarOPs(buscaOP.value);
  } catch (err) {
    hideLoading();
    showToast(err.message || "Erro ao salvar alterações.", "error");
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "💾 Salvar alterações";
  }
});

// ═══════════════════════════════════════════════════
// MINI-MODAIS DE CONFIRMAÇÃO
// ═══════════════════════════════════════════════════

// Monta o bloco de informações resumidas da OP dentro dos mini-modais
function montarInfoConfirm(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="confirm-info-row">
      <span>Número OP</span>
      <span>${document.getElementById("numero_op").value || "—"}</span>
    </div>
    <div class="confirm-info-row">
      <span>Material</span>
      <span>${document.getElementById("material_id").value || "—"}</span>
    </div>
    <div class="confirm-info-row">
      <span>Quantidade</span>
      <span>${document.getElementById("quantidade").value || "—"} ${document.getElementById("unidade_medida").value || ""}</span>
    </div>
    <div class="confirm-info-row">
      <span>Custo Total</span>
      <span>R$ ${document.getElementById("custo_total").value || "0,00"}</span>
    </div>
  `;
}

function abrirConfirm(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("hidden");
  requestAnimationFrame(() => el.classList.add("show"));
}

function fecharConfirm(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("show");
  setTimeout(() => el.classList.add("hidden"), 200);
}
window.fecharConfirm = fecharConfirm;

// ─── Botão INICIAR PRODUÇÃO ───────────────────────────────────────────────────
btnIniciar.addEventListener("click", async () => {
  const tbody  = document.getElementById("tabelaPedidosModalBody");
  const checks = tbody ? Array.from(tbody.querySelectorAll(".chk-pedido:checked")) : [];

  if (checks.length === 0) {
    showToast("Selecione ao menos um pedido antes de iniciar.", "warning");
    return;
  }

  const pedidosSelecionados = checks.map(chk => {
    // Sobe para o <tr> pai do checkbox
    const tr     = chk.closest("tr");
    const inp    = tr.querySelector(".inp-qtde");
    const pedido = JSON.parse(tr.dataset.pedido || "{}");
    return {
      ...pedido,
      qtde_atendida: Number(inp?.value || pedido.qtde_solicitada || 0),
    };
  });

  showLoading("Iniciando produção...");

  try {
    // 1. Vincula pedidos selecionados
    await apiRequest("/op_pedidos/vincular", {
      method: "POST",
      body: JSON.stringify({ op_id: opAtualId, pedidos: pedidosSelecionados }),
    });

    // 2. Inicia produção (move insumos FT para estoque_producao e muda status)
    await apiRequest(`/ordens_producao/${opAtualId}/iniciar`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    opAtualStatus = "EM_PRODUCAO";
    document.getElementById("status").value = "EM_PRODUCAO";
    atualizarStepper("EM_PRODUCAO");
    atualizarBotoesProducao("EM_PRODUCAO");

    // Recarrega tabela em modo leitura
    const op = (await apiRequest(`/ordens_producao/${opAtualId}`)).data;
    carregarPedidosModal(op.codigo_produto, "EM_PRODUCAO", 0, "");

    hideLoading();
    showToast(`Produção iniciada! ${pedidosSelecionados.length} pedido(s) vinculado(s). ▶`, "success");
    carregarOPs(buscaOP.value);
  } catch (err) {
    hideLoading();
    showToast(err.message || "Erro ao iniciar produção.", "error");
  }
});

// ─── Botão FINALIZAR PRODUÇÃO ─────────────────────────────────────────────────
btnFinalizar.addEventListener("click", () => {
  // Preenche a data de hoje como padrão
  const hoje = new Date().toISOString().split("T")[0];
  document.getElementById("dataFinalizacaoConfirm").value = hoje;

  montarInfoConfirm("confirmFinalizarInfo");
  abrirConfirm("confirmFinalizar");
});

document.getElementById("btnConfirmFinalizar").addEventListener("click", async () => {
  const dataFinaliz = document.getElementById("dataFinalizacaoConfirm").value;

  if (!dataFinaliz) {
    showToast("Informe a data de conclusão.", "warning");
    return;
  }

  fecharConfirm("confirmFinalizar");
  showLoading("Finalizando produção...");

  try {
    // Usa a rota /concluir que atualiza OP + marca data_finalizada nos pedidos vinculados
    const res = await apiRequest(`/ordens_producao/${opAtualId}/concluir`, {
      method: "POST",
      body: JSON.stringify({ data_finalizacao: dataFinaliz }),
    });

    opAtualStatus = "CONCLUIDA";
    document.getElementById("status").value = "CONCLUIDA";
    atualizarStepper("CONCLUIDA");
    atualizarBotoesProducao("CONCLUIDA");

    hideLoading();

    // Aviso se algum material ficou com estoque negativo
    if (res.estoque_insuficiente?.length > 0) {
      const itens = res.estoque_insuficiente.map(e => e.codigo).join(", ");
      showToast(`OP concluída ✔ — ⚠️ Estoque negativo: ${itens}. Confira o cadastro de materiais.`, "warning");
    } else {
      showToast(`OP concluída! ${res.insumos_baixados ?? 0} insumo(s) baixados do estoque. ✔`, "success");
    }
    carregarOPs(buscaOP.value);
  } catch (err) {
    hideLoading();
    showToast(err.message || "Erro ao finalizar produção.", "error");
  }
});

// ─── Fechar mini-modais clicando fora ────────────────────────────────────────
["confirmIniciar", "confirmFinalizar", "confirmExcluir"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("click", (e) => {
    if (e.target.id === id) fecharConfirm(id);
  });
});

// ═══════════════════════════════════════════════════
// EXCLUIR OP
// ═══════════════════════════════════════════════════
let opParaExcluir = null;

function abrirConfirmExcluir(op) {
  opParaExcluir = op;
  const container = document.getElementById("confirmExcluirInfo");
  if (container) {
    container.innerHTML = `
      <div class="confirm-info-row">
        <span>Número OP</span><span>${op.numero_op || op.id}</span>
      </div>
      <div class="confirm-info-row">
        <span>Material</span><span>${op.codigo_produto || op.material_id}</span>
      </div>
      <div class="confirm-info-row">
        <span>Status atual</span><span>${op.status}</span>
      </div>
    `;
  }
  abrirConfirm("confirmExcluir");
}

document.getElementById("btnConfirmExcluir").addEventListener("click", async () => {
  if (!opParaExcluir) return;
  fecharConfirm("confirmExcluir");
  showLoading("Excluindo OP...");

  try {
    await apiRequest(`/ordens_producao/${opParaExcluir.id}`, { method: "DELETE" });
    hideLoading();
    showToast(`OP #${opParaExcluir.numero_op} excluída com sucesso.`, "success");
    opParaExcluir = null;
    carregarOPs(buscaOP.value);
  } catch (err) {
    hideLoading();
    showToast(err.message || "Erro ao excluir OP.", "error");
  }
});

// ─── Visualizar OP ────────────────────────────────────────────────────────────
function visualizarOP(id) {
  window.open(`/PCP/visualizar_op.html?id=${id}`, "_blank");
}

// ─── Busca com debounce ───────────────────────────────────────────────────────
buscaOP.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => carregarOPs(buscaOP.value), 350);
});

// ─── Fechar modal clicando fora ───────────────────────────────────────────────
modalGerenciarOP.addEventListener("click", (e) => {
  if (e.target === modalGerenciarOP) fecharModalOP();
});

// ─── Header ───────────────────────────────────────────────────────────────────
if (btnVoltar) btnVoltar.addEventListener("click", () => (window.location.href = "index.html"));
if (btnLogout) btnLogout.addEventListener("click", logout);

// ─── Pedidos no modal ─────────────────────────────────────────────────────────
async function carregarPedidosModal(codigoProduto, status, qtdeOP, unidade) {
  const tbody    = document.getElementById("tabelaPedidosModalBody");
  const thCheck  = document.getElementById("thCheck");
  const thQtde   = document.getElementById("thQtdeAtend");
  const contador = document.getElementById("pedidosContador");
  if (!tbody) return;

  const modoSelecao = (status === "ABERTA");

  // Mostra/oculta colunas de seleção
  if (thCheck)  thCheck.style.display  = modoSelecao ? "table-cell" : "none";
  if (thQtde) {
    thQtde.style.display = "table-cell";
    thQtde.textContent   = modoSelecao ? "Qtde Atender" : "Qtde Atendida";
  }
  if (contador) contador.style.display = modoSelecao ? "flex"        : "none";

  if (modoSelecao) {
    document.getElementById("ctrQtdeOP").textContent = `${qtdeOP} ${unidade || ""}`;
    document.getElementById("ctrSaldo").textContent  = qtdeOP;
    document.getElementById("ctrQtdeSel").textContent = "0";
  }

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px;">Carregando pedidos...</td></tr>`;

  try {
    let pedidos = [];

    if (modoSelecao) {
      // ABERTA: busca pedidos disponíveis para o material
      const res = await apiRequest(`/controle_pedidos/material/${encodeURIComponent(codigoProduto)}`);
      pedidos = res.data || [];
    } else {
      // EM_PRODUCAO / CONCLUIDA: busca apenas pedidos já vinculados à OP
      const res = await apiRequest(`/op/${opAtualId}`);
      pedidos = res.data?.pedidos || [];
    }

    if (pedidos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px;">Nenhum pedido em aberto para este material.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    pedidos.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.classList.add(i % 2 === 0 ? "row-dark" : "row-darker");
      tr.dataset.pedido   = JSON.stringify(p);

      const tdCheck = modoSelecao ? `
        <td style="padding:8px 10px;text-align:center">
          <input type="checkbox" class="chk-pedido" data-idx="${i}">
        </td>` : "";

      const qtdePendente = p.qtde_pendente ?? p.qtde_solicitada ?? 0;

      const tdQtde = modoSelecao ? `
        <td style="padding:8px 6px;text-align:center">
          <input type="number" class="inp-qtde" data-idx="${i}"
            min="1" max="${qtdePendente || 9999}" value="${qtdePendente || ''}"
            disabled
            style="width:82px;padding:5px 6px;border:1.5px solid #e2e8f0;border-radius:7px;
              font-size:13px;font-weight:600;text-align:center;background:#f8fafc;color:#94a3b8">
        </td>` : `
        <td style="padding:8px 10px;text-align:center;font-weight:700;color:#2563eb">
          ${p.qtde_atendida ?? "—"}
        </td>`;

      tr.innerHTML = `
        ${tdCheck}
        <td style="padding:8px 10px;">${p.pedido_venda || "—"}</td>
        <td style="padding:8px 10px;">${p.ordem_compra || "—"}</td>
        <td style="padding:8px 10px;font-weight:600;">${p.cliente || "—"}</td>
        <td style="padding:8px 10px;">${p.estado || "—"}</td>
        <td style="padding:8px 10px;">${p.codigo_cliente || "—"}</td>
        <td style="padding:8px 10px;text-align:center;" title="Solicitada: ${p.qtde_solicitada ?? 0} / Pendente: ${qtdePendente}">${modoSelecao ? qtdePendente : (p.qtde_solicitada ?? "—")}</td>
        ${tdQtde}
        <td style="padding:8px 10px;text-align:center;">${p.data_contratual ? new Date(p.data_contratual).toLocaleDateString("pt-BR") : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    if (!modoSelecao) return;

    // ── Lógica de seleção inline ──────────────────────────────────────────────
    function recalcular() {
      let total = 0;
      tbody.querySelectorAll(".chk-pedido:checked").forEach(chk => {
        const inp = tbody.querySelector(`.inp-qtde[data-idx="${chk.dataset.idx}"]`);
        total += Number(inp?.value || 0);
      });
      const saldo   = Number(qtdeOP) - total;
      const excede  = saldo < 0;
      const nenhum  = tbody.querySelectorAll(".chk-pedido:checked").length === 0;

      document.getElementById("ctrQtdeSel").textContent    = total;
      document.getElementById("ctrSaldo").textContent      = saldo;
      document.getElementById("ctrSaldo").style.color      = excede ? "#dc2626" : "#16a34a";
      document.getElementById("ctrAviso").style.display    = excede ? "inline" : "none";
      btnIniciar.disabled = excede || nenhum;
    }

    tbody.addEventListener("change", (e) => {
      if (e.target.classList.contains("chk-pedido")) {
        const inp = tbody.querySelector(`.inp-qtde[data-idx="${e.target.dataset.idx}"]`);
        if (inp) {
          inp.disabled = !e.target.checked;
          inp.style.background = e.target.checked ? "#fff" : "#f8fafc";
          inp.style.color      = e.target.checked ? "#0f172a" : "#94a3b8";
        }
      }
      recalcular();
    });

    tbody.addEventListener("input", (e) => {
      if (e.target.classList.contains("inp-qtde")) recalcular();
    });

    // Selecionar todos
    const checkTodos = document.getElementById("checkTodosPedidos");
    if (checkTodos) checkTodos.onchange = (e) => {
      tbody.querySelectorAll(".chk-pedido").forEach(chk => {
        chk.checked = e.target.checked;
        const inp = tbody.querySelector(`.inp-qtde[data-idx="${chk.dataset.idx}"]`);
        if (inp) {
          inp.disabled = !e.target.checked;
          inp.style.background = e.target.checked ? "#fff" : "#f8fafc";
          inp.style.color      = e.target.checked ? "#0f172a" : "#94a3b8";
        }
      });
      recalcular();
    };

    // Habilita btnIniciar novamente (estava sendo desabilitado por atualizarBotoesProducao)
    // mas agora a lógica é: habilitado só quando tem pedido selecionado sem exceder
    btnIniciar.disabled = true; // começa desabilitado até selecionar algo

  } catch (err) {
    console.error("Erro ao carregar pedidos do modal:", err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#e74c3c;padding:16px;">Erro ao carregar pedidos.</td></tr>`;
  }
}

// ═══════════════════════════════════════════════════
// MATÉRIA PRIMA / INSUMOS
// ═══════════════════════════════════════════════════

let insumoSelecionado  = null;
let insumos            = [];
let insumoDebounce     = null;

const insumoSearch      = document.getElementById("insumoSearch");
const insumoSuggestions = document.getElementById("insumoSuggestions");
const insumoInfo        = document.getElementById("insumoInfo");

// ─── Carregar insumos já salvos para a OP ─────────────────────────────────────
async function carregarInsumosOP(opId) {
  try {
    const res = await apiRequest(`/ordens_producao/${opId}/insumos`);
    insumos = (res.data || []).map(i => ({
      material_id:    i.material_id,
      codigo_produto: i.codigo_produto,
      descricao:      i.descricao,
      unidade_medida: i.unidade_medida || "un",
      quantidade:     Number(i.quantidade),
      custo_unitario: Number(i.custo_unitario),
      subtotal:       Number(i.subtotal || i.quantidade * i.custo_unitario),
    }));
    renderInsumos();
  } catch {
    insumos = [];
    renderInsumos();
  }
}

// ─── Salvar lista completa no banco ───────────────────────────────────────────
async function salvarInsumos() {
  if (!opAtualId) return;
  try {
    await apiRequest(`/ordens_producao/${opAtualId}/insumos`, {
      method: "POST",
      body: JSON.stringify({ insumos }),
    });
  } catch (err) {
    showToast("Erro ao salvar insumos.", "error");
    console.error(err);
  }
}

// ─── Busca com debounce ───────────────────────────────────────────────────────
if (insumoSearch) {
  insumoSearch.addEventListener("input", () => {
    clearTimeout(insumoDebounce);
    const q = insumoSearch.value.trim();
    if (q.length < 2) { insumoSuggestions.style.display = "none"; return; }
    insumoDebounce = setTimeout(() => buscarInsumo(q), 300);
  });

  document.addEventListener("click", (e) => {
    if (!insumoSearch.contains(e.target) && !insumoSuggestions.contains(e.target)) {
      insumoSuggestions.style.display = "none";
    }
  });
}

async function buscarInsumo(q) {
  try {
    const res   = await apiRequest(`/materiais?search=${encodeURIComponent(q)}`);
    const lista = res.data || [];
    insumoSuggestions.innerHTML = "";

    if (lista.length === 0) {
      insumoSuggestions.innerHTML = `<div style="padding:12px;color:#94a3b8;font-size:13px">Nenhum material encontrado</div>`;
      insumoSuggestions.style.display = "block";
      return;
    }

    lista.forEach(m => {
      const div = document.createElement("div");
      div.style.cssText = "padding:10px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f1f5f9";
      div.textContent = `${m.codigo_produto} — ${m.descricao}`;
      div.onmouseover = () => div.style.background = "#f1f5f9";
      div.onmouseout  = () => div.style.background = "";
      div.addEventListener("click", () => selecionarInsumo(m));
      insumoSuggestions.appendChild(div);
    });

    insumoSuggestions.style.display = "block";
  } catch (err) {
    console.error("Erro ao buscar insumo:", err);
  }
}

function selecionarInsumo(m) {
  insumoSelecionado = m;
  insumoSearch.value = `${m.codigo_produto} — ${m.descricao}`;
  insumoSuggestions.style.display = "none";

  const custoEmbalagem  = Number(m.custo_fornecedor  || 0);
  const qtdeEmbalagem   = Number(m.qtde_embalagem    || 0);
  const unidade         = document.getElementById("insumoUnidade").value || "un";

  // Se tem qtde_embalagem cadastrada, calcula custo por unidade (regra de 3)
  let custoUnitReal = custoEmbalagem;
  let infoEmbalagem = "";
  if (qtdeEmbalagem > 0) {
    custoUnitReal = custoEmbalagem / qtdeEmbalagem;
    infoEmbalagem = `
      <span style="color:#64748b">Embalagem: <b>${qtdeEmbalagem} ${m.unidade_embalagem || unidade}</b>
       = R$ ${custoEmbalagem.toFixed(2)} → <b style="color:#16a34a">R$ ${custoUnitReal.toFixed(4)}/${unidade}</b></span>`;
  }

  // Guarda o custo real por unidade para o cálculo final
  insumoSelecionado._custoUnitReal = custoUnitReal;

  document.getElementById("insumoDescricao").textContent = m.descricao;
  document.getElementById("infoCodigo").textContent      = m.codigo_produto;
  document.getElementById("infoCusto").textContent       = custoUnitReal.toFixed(4);
  const infoEl = document.getElementById("insumoInfo");
  infoEl.style.display = "flex";
  infoEl.style.flexDirection = "column";
  infoEl.style.gap = "6px";

  // Mostra linha extra de embalagem se aplicável
  let extraEl = document.getElementById("insumoInfoEmbalagem");
  if (!extraEl) {
    extraEl = document.createElement("div");
    extraEl.id = "insumoInfoEmbalagem";
    infoEl.appendChild(extraEl);
  }
  extraEl.innerHTML = infoEmbalagem;
}

// ─── Adicionar insumo ─────────────────────────────────────────────────────────
document.getElementById("btnAddInsumo")?.addEventListener("click", async () => {
  if (!insumoSelecionado) { showToast("Selecione um material primeiro.", "warning"); return; }
  const qtde    = Number(document.getElementById("insumoQtde").value);
  const unidade = document.getElementById("insumoUnidade").value || "un";
  if (!qtde || qtde <= 0) { showToast("Informe uma quantidade válida.", "warning"); return; }

  // Usa custo por unidade real (já calculado pela regra de 3 se tiver qtde_embalagem)
  const custoUnit = insumoSelecionado._custoUnitReal || Number(insumoSelecionado.custo_fornecedor || 0);

  const existente = insumos.find(i => i.material_id === insumoSelecionado.id);
  if (existente) {
    existente.quantidade += qtde;
    existente.subtotal    = Number((existente.quantidade * existente.custo_unitario).toFixed(2));
  } else {
    insumos.push({
      material_id:    insumoSelecionado.id,
      codigo_produto: insumoSelecionado.codigo_produto,
      descricao:      insumoSelecionado.descricao,
      unidade_medida: unidade,
      quantidade:     qtde,
      custo_unitario: Number(custoUnit.toFixed(4)),
      subtotal:       Number((qtde * custoUnit).toFixed(2)),
    });
  }

  insumoSearch.value = "";
  document.getElementById("insumoQtde").value = "";
  insumoSelecionado = null;
  insumoInfo.style.display = "none";

  renderInsumos();
  await salvarInsumos();
});

// ─── Renderizar tabela ────────────────────────────────────────────────────────
function renderInsumos() {
  const tbody    = document.getElementById("insumosTbody");
  const wrap     = document.getElementById("insumosTabelaWrap");
  const semItens = document.getElementById("insumosSemItens");
  if (!tbody) return;

  if (insumos.length === 0) {
    wrap.style.display     = "none";
    semItens.style.display = "block";
    document.getElementById("insumosTotalCusto").textContent = "R$ 0,00";
    return;
  }

  wrap.style.display     = "block";
  semItens.style.display = "none";
  tbody.innerHTML = "";
  let totalGeral = 0;

  insumos.forEach((ins, i) => {
    totalGeral += ins.subtotal;
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td style="padding:6px 8px;font-weight:600">${ins.codigo_produto}</td>
      <td style="padding:6px 8px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${ins.descricao}">${ins.descricao}</td>
      <td style="padding:6px 8px;text-align:center">${ins.quantidade}</td>
      <td style="padding:6px 8px;text-align:center">R$ ${ins.custo_unitario.toFixed(2)}</td>
      <td style="padding:6px 8px;text-align:center">${ins.unidade_medida || "un"}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:700;color:#1d4ed8">
        R$ ${ins.subtotal.toFixed(2)}</td>
      <td style="padding:6px 8px;text-align:center">
        <button data-idx="${i}" style="background:none;border:none;cursor:pointer;
          color:#ef4444;font-size:15px;line-height:1" title="Remover">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("insumosTotalCusto").textContent =
    `R$ ${totalGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  tbody.querySelectorAll("button[data-idx]").forEach(btn => {
    btn.addEventListener("click", async () => {
      insumos.splice(Number(btn.dataset.idx), 1);
      renderInsumos();
      await salvarInsumos();
    });
  });
}

// ─── Limpa ao fechar modal ────────────────────────────────────────────────────
const _fecharOriginal = fecharModalOP;
window.fecharModalOP = function() {
  insumos = [];
  insumoSelecionado = null;
  if (insumoSearch) insumoSearch.value = "";
  if (insumoInfo)   insumoInfo.style.display = "none";
  const extraEl = document.getElementById("insumoInfoEmbalagem");
  if (extraEl) extraEl.innerHTML = "";
  renderInsumos();
  _fecharOriginal();
};

// ─── Init ─────────────────────────────────────────────────────────────────────
carregarOPs();
// ═══════════════════════════════════════════════════════════════════
//  PRESTADORES DE SERVIÇO
// ═══════════════════════════════════════════════════════════════════

let prestadoresList = [];   // cache do GET /prestadores
let opPrestadores   = [];   // vínculos carregados da OP atual

// ─── Carrega lista de prestadores no <select> ────────────────────
async function carregarSelectPrestadores() {
  try {
    const res = await apiRequest("/prestadores");
    prestadoresList = Array.isArray(res.data) ? res.data : [];
    const sel = document.getElementById("prestadorSelect");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Selecionar prestador —</option>';
    prestadoresList.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.nome} (${p.servico})`;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn("Erro ao carregar prestadores:", e.message);
  }
}

// ─── Carrega vínculos da OP ──────────────────────────────────────
async function carregarPrestadoresOP(opId) {
  await carregarSelectPrestadores();
  try {
    const res = await apiRequest(`/prestadores/op/${opId}`);
    opPrestadores = Array.isArray(res.data) ? res.data : [];
    renderPrestadores();
  } catch (e) {
    console.warn("Erro ao carregar prestadores da OP:", e.message);
    opPrestadores = [];
    renderPrestadores();
  }
}

// ─── Render tabela de prestadores ───────────────────────────────
function renderPrestadores() {
  const semItens = document.getElementById("prestadoresSemItens");
  const wrap     = document.getElementById("prestadoresTabelaWrap");
  const tbody    = document.getElementById("prestadoresTbody");
  if (!semItens || !wrap || !tbody) return;

  if (opPrestadores.length === 0) {
    semItens.style.display = "";
    wrap.style.display = "none";
    return;
  }

  semItens.style.display = "none";
  wrap.style.display = "";
  tbody.innerHTML = "";

  opPrestadores.forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.prestador_nome || "—"}</td>
      <td>${v.prestador_servico || "—"}</td>
      <td>${v.descricao || v.codigo_produto || "—"}</td>
      <td>${Number(v.quantidade || 0).toLocaleString("pt-BR", {minimumFractionDigits: 2})}</td>
      <td><button class="btn-sm btn-danger" data-vid="${v.id}">✕</button></td>
    `;
    tr.querySelector("button").addEventListener("click", () => removerVinculoPrestador(v.id));
    tbody.appendChild(tr);
  });
}

// ─── Adicionar vínculo ───────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const btnAdd = document.getElementById("btnAddPrestador");
  if (btnAdd) {
    btnAdd.addEventListener("click", async () => {
      const prestadorId = document.getElementById("prestadorSelect")?.value;
      const material    = document.getElementById("prestadorMaterial")?.value.trim();
      const qtde = document.getElementById("prestadorQtde")?.value;
      const obs  = document.getElementById("prestadorObs")?.value.trim();

      if (!prestadorId) { showToast("Selecione um prestador.", "error"); return; }
      if (!opAtualId)   { showToast("Abra uma OP primeiro.", "error"); return; }

      try {
        await apiRequest(`/prestadores/op/${opAtualId}`, {
          method: "POST",
          body: JSON.stringify({
            prestador_id: prestadorId,
            descricao: material || null,
            quantidade: qtde || 0,
            observacoes: obs || null,
          }),
        });
        // Limpa campos
        document.getElementById("prestadorMaterial").value = "";
        document.getElementById("prestadorQtde").value = "";
        document.getElementById("prestadorObs").value = "";
        document.getElementById("prestadorSelect").value = "";

        await carregarPrestadoresOP(opAtualId);
        showToast("Prestador vinculado!", "success");
      } catch (e) {
        showToast(e.message || "Erro ao vincular prestador.", "error");
      }
    });
  }

  // ─── Modal novo prestador ──────────────────────────────────────
  const btnNovo = document.getElementById("btnNovoPrestador");
  if (btnNovo) {
    btnNovo.addEventListener("click", () => {
      document.getElementById("modalNovoPrestador")?.classList.remove("hidden");
    });
  }

  const btnCancelarNP = document.getElementById("btnCancelarNovoPrestador");
  if (btnCancelarNP) {
    btnCancelarNP.addEventListener("click", () => {
      document.getElementById("modalNovoPrestador")?.classList.add("hidden");
    });
  }

  const btnSalvarNP = document.getElementById("btnSalvarNovoPrestador");
  if (btnSalvarNP) {
    btnSalvarNP.addEventListener("click", async () => {
      const nome    = document.getElementById("npNome")?.value.trim();
      const servico = document.getElementById("npServico")?.value.trim();
      const cnpj    = document.getElementById("npCnpj")?.value.trim();

      if (!nome || !servico) { showToast("Nome e serviço são obrigatórios.", "error"); return; }

      try {
        await apiRequest("/prestadores", {
          method: "POST",
          body: JSON.stringify({ nome, servico, cnpj: cnpj || null }),
        });
        document.getElementById("npNome").value    = "";
        document.getElementById("npServico").value = "";
        document.getElementById("npCnpj").value    = "";
        document.getElementById("modalNovoPrestador")?.classList.add("hidden");
        await carregarSelectPrestadores();
        showToast("Prestador cadastrado!", "success");
      } catch (e) {
        showToast(e.message || "Erro ao cadastrar prestador.", "error");
      }
    });
  }
});

// ─── Remover vínculo ─────────────────────────────────────────────
async function removerVinculoPrestador(vinculoId) {
  if (!confirm("Remover este prestador da OP?")) return;
  try {
    await apiRequest(`/prestadores/op/vinculo/${vinculoId}`, { method: "DELETE" });
    opPrestadores = opPrestadores.filter(v => v.id !== vinculoId);
    renderPrestadores();
    showToast("Vínculo removido.", "success");
  } catch (e) {
    showToast(e.message || "Erro ao remover.", "error");
  }
}