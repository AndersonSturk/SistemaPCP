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

  Object.values(steps).forEach(s => s?.classList.remove("active", "done"));

  if (status === "ABERTA") {
    steps.ABERTA?.classList.add("active");
  } else if (status === "EM_PRODUCAO") {
    steps.ABERTA?.classList.add("done");
    steps.EM_PRODUCAO?.classList.add("active");
  } else if (status === "CONCLUIDA" || status === "CANCELADA") {
    steps.ABERTA?.classList.add("done");
    steps.EM_PRODUCAO?.classList.add("done");
    steps.CONCLUIDA?.classList.add("active");
  }
}

// ─── Estado dos botões de produção ───────────────────────────────────────────
// Regra:
//   Aberta      → Iniciar habilitado  | Finalizar desabilitado
//   EmProducao  → Iniciar desabilitado | Finalizar habilitado
//   Concluida   → Ambos desabilitados
// IDs dos campos que são SEMPRE somente leitura (dados da OP)
const CAMPOS_READONLY = ["numero_op", "material_id", "unidade_medida", "status", "data_criacao", "custo_unitario", "custo_total"];
// IDs dos campos editáveis
const CAMPOS_EDITAVEIS = ["observacoes", "quantidade"];

function atualizarBotoesProducao(status) {
  if (!btnIniciar || !btnFinalizar) return;

  // Garante que campos readonly ficam SEMPRE disabled
  CAMPOS_READONLY.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; el.readOnly = true; }
  });

  const form = document.getElementById("formGerenciarOP");

  if (status !== "CONCLUIDA" && status !== "CANCELADA") {
    // Habilita APENAS os campos editáveis
    CAMPOS_EDITAVEIS.forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.disabled = false; el.readOnly = false; }
    });
    // Habilita controles de insumos/prestadores/perdas
    form?.querySelectorAll("#secaoPrestadores input, #secaoPrestadores select, #secaoPerdas input, #secaoPerdas textarea").forEach(el => el.disabled = false);
    const btnSalvar = form?.querySelector("button[type=submit]");
    if (btnSalvar) btnSalvar.style.display = "";
    const btnAddPrest = document.getElementById("btnAddPrestador");
    const btnNovoPrest = document.getElementById("btnNovoPrestador");
    const btnSalvarPerdas = document.getElementById("btnSalvarPerdas");
    if (btnAddPrest) btnAddPrest.style.display = "";
    if (btnNovoPrest) btnNovoPrest.style.display = "";
    if (btnSalvarPerdas) btnSalvarPerdas.style.display = "";
  }

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
    // Bloqueia TODOS os campos (incluindo editáveis)
    if (form) {
      form.querySelectorAll("input, select, textarea").forEach(el => { el.disabled = true; el.readOnly = true; });
      const btnSalvar = form.querySelector("button[type=submit]");
      if (btnSalvar) btnSalvar.style.display = "none";
    }
    const btnAddPrest = document.getElementById("btnAddPrestador");
    const btnNovoPrest = document.getElementById("btnNovoPrestador");
    const btnSalvarPerdas = document.getElementById("btnSalvarPerdas");
    if (btnAddPrest) btnAddPrest.style.display = "none";
    if (btnNovoPrest) btnNovoPrest.style.display = "none";
    if (btnSalvarPerdas) btnSalvarPerdas.style.display = "none";
  }

  if (tipFinalizar) {
    tipFinalizar.style.display =
      status === "EM_PRODUCAO" ? "none" : "";
  }
}

// ─── Carregar OPs ─────────────────────────────────────────────────────────────
async function carregarOPs(search = "") {
  tabelaOPs.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#888">Carregando...</td></tr>`;
  try {
    const res = await apiRequest(`/ordens_producao?search=${encodeURIComponent(search)}`);
    const ops = res.data || [];
    tabelaOPs.innerHTML = "";

    if (ops.length === 0) {
      tabelaOPs.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#888">Nenhuma OP encontrada.</td></tr>`;
      return;
    }

    ops.forEach((op) => {
      const tr = document.createElement("tr");
      const materialLabel = op.codigo_produto
        ? `${op.codigo_produto} — ${op.descricao_material || op.descricao || ""}`
        : op.material_id;

      const podeExcluir = ["admin", "pcp"].includes(user.perfil);
      tr.innerHTML = `
        <td style="font-weight:600">${op.numero_op}</td>
        <td>${materialLabel}</td>
        <td>${op.quantidade}</td>
        <td><span class="badge badge-${badgeStatus(op.status)}">${op.status}</span></td>
        <td>
          <button class="btn btn-editar">Gerenciar</button>
          <button class="btn btn-default">Visualizar</button>
          ${podeExcluir ? `<button class="btn-excluir-op">🗑️</button>` : ""}
        </td>
      `;
      tr.querySelector(".btn-editar").addEventListener("click", () => abrirModalOP(op.id));
      tr.querySelector(".btn-default").addEventListener("click", () => visualizarOP(op.id));
      if (podeExcluir) tr.querySelector(".btn-excluir-op").addEventListener("click", () => abrirConfirmExcluir(op));
      tabelaOPs.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar OPs:", err);
    showToast("Erro ao carregar ordens de produção.", "error");
    tabelaOPs.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#e74c3c">Erro ao carregar dados.</td></tr>`;
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

    // Campos somente leitura
    setVal("numero_op",       op.numero_op         || "");
    setVal("material_id",     op.codigo_produto ? `${op.codigo_produto} — ${op.descricao_material || ""}` : (op.material_id || ""));
    setVal("quantidade",      op.quantidade || op.qtde_total || 0);
    setVal("unidade_medida",  op.unidade_medida    || "");
    setVal("status",          op.status            || "");
    setVal("custo_unitario",  `R$ ${Number(op.custo_unitario || 0).toFixed(2)}`);
    setVal("custo_total",     `R$ ${Number(op.custo_total    || 0).toFixed(2)}`);
    setVal("data_criacao",    op.data_criacao
      ? new Date(op.data_criacao).toLocaleString("pt-BR") : "");

    // Campos editáveis
    setVal("observacoes",     op.observacoes       || "");

    // Subtítulo do cabeçalho
    const labelNumeroOP = document.getElementById("label_numero_op");
    if (labelNumeroOP) labelNumeroOP.textContent = op.numero_op || op.id;

    // Atualiza stepper e botões conforme status real da OP
    atualizarStepper(op.status);
    atualizarBotoesProducao(op.status);

    // Carrega insumos salvos para esta OP
    await carregarInsumosOP(id);
    await carregarPrestadoresOP(id);
    await carregarPerdasOP(id);

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
        observacoes:     document.getElementById("observacoes")?.value?.trim() || null,
        quantidade:      Number(document.getElementById("quantidade")?.value) || undefined,
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
  if (!confirm("Iniciar produção desta OP? Os insumos serão movidos para estoque em produção.")) return;

  showLoading("Iniciando produção...");

  try {
    await apiRequest(`/ordens_producao/${opAtualId}/iniciar`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    opAtualStatus = "EM_PRODUCAO";
    document.getElementById("status").value = "EM_PRODUCAO";
    atualizarStepper("EM_PRODUCAO");
    atualizarBotoesProducao("EM_PRODUCAO");

    hideLoading();
    showToast("Produção iniciada! Destino: Estoque. ▶", "success");
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


// ─── Header ───────────────────────────────────────────────────────────────────
if (btnVoltar) btnVoltar.addEventListener("click", () => (window.location.href = "index.html"));
if (btnLogout) btnLogout.addEventListener("click", logout);

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
    const res = await apiRequest(`/ordens_producao/${opAtualId}/insumos`, {
      method: "POST",
      body: JSON.stringify({ insumos }),
    });
    // Atualiza custos exibidos (insumos + prestadores)
    if (res.custo_total != null) atualizarCustosExibidos(res);
  } catch (err) {
    showToast("Erro ao salvar insumos.", "error");
    console.error(err);
  }
}

function atualizarCustosExibidos(dados) {
  if (dados == null) return;
  // Aceita tanto objeto {custo_total, custo_unitario} quanto número direto
  const total    = typeof dados === "object" ? dados.custo_total    : dados;
  const unitario = typeof dados === "object" ? dados.custo_unitario : null;
  const elTotal = document.getElementById("custo_total");
  if (elTotal && total != null) elTotal.value = Number(total).toFixed(2);
  const elUnit = document.getElementById("custo_unitario");
  if (elUnit && unitario != null) elUnit.value = Number(unitario).toFixed(2);
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

  perdasLinhas = [];
  renderPerdas();

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

  const fmtData = (v) => v ? new Date(v).toLocaleDateString("pt-BR") : "—";
  const fmtBRL  = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  opPrestadores.forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.prestador_nome || "—"}</td>
      <td>${v.prestador_cnpj || "—"}</td>
      <td>R$ ${fmtBRL(v.valor_servico)}</td>
      <td>${fmtData(v.data_envio)}</td>
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
      const prestadorId    = document.getElementById("prestadorSelect")?.value;
      const valorServico   = document.getElementById("prestadorValorServico")?.value;
      const dataEnvio      = document.getElementById("prestadorDataEnvio")?.value;
      const obs            = document.getElementById("prestadorObs")?.value.trim();

      if (!prestadorId) { showToast("Selecione um prestador.", "error"); return; }
      if (!opAtualId)   { showToast("Abra uma OP primeiro.", "error"); return; }

      try {
        const res = await apiRequest(`/prestadores/op/${opAtualId}`, {
          method: "POST",
          body: JSON.stringify({
            prestador_id:     prestadorId,
            valor_servico:    valorServico || 0,
            data_envio:       dataEnvio || null,
            observacoes:      obs || null,
          }),
        });
        // Limpa campos
        document.getElementById("prestadorValorServico").value = "";
        document.getElementById("prestadorDataEnvio").value = "";
        document.getElementById("prestadorObs").value = "";
        document.getElementById("prestadorSelect").value = "";

        // Atualiza custo total (insumos + prestadores)
        if (res.custo_total != null) atualizarCustosExibidos(res);

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
    const res = await apiRequest(`/prestadores/op/vinculo/${vinculoId}`, { method: "DELETE" });
    opPrestadores = opPrestadores.filter(v => v.id !== vinculoId);
    renderPrestadores();
    // Atualiza custo total (insumos + prestadores)
    if (res.custo_total != null) atualizarCustosExibidos(res);
    showToast("Vínculo removido.", "success");
  } catch (e) {
    showToast(e.message || "Erro ao remover.", "error");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PERDAS DE MATERIAL
// ═══════════════════════════════════════════════════════════════════

let perdasLinhas = []; // espelha os insumos da OP com qtde de perda editável

// ─── Carregar perdas: espelha insumos e pré-preenche com perdas salvas ───────
async function carregarPerdasOP(opId) {
  const semItens  = document.getElementById("perdasSemItens");
  const btnSalvar = document.getElementById("btnSalvarPerdas");
  if (semItens) { semItens.textContent = "Carregando insumos..."; semItens.style.display = ""; }
  if (btnSalvar) btnSalvar.style.display = "none";

  try {
    const resIns = await apiRequest(`/ordens_producao/${opId}/insumos`);
    const insumosList = resIns.data || [];

    let perdasSalvas = [];
    try {
      const resPerdas = await apiRequest(`/ordens_producao/${opId}/perdas`);
      perdasSalvas = Array.isArray(resPerdas.data) ? resPerdas.data : [];
    } catch (_) {}

    perdasLinhas = insumosList.map(ins => {
      const salva = perdasSalvas.find(p =>
        (ins.material_id && p.material_id === ins.material_id) ||
        (ins.codigo_produto && p.codigo_produto === ins.codigo_produto)
      );
      return {
        material_id:    ins.material_id,
        codigo_produto: ins.codigo_produto,
        descricao:      ins.descricao,
        unidade_medida: ins.unidade_medida || "un",
        quantidade:     salva ? Number(salva.quantidade) : 0,
        motivo:         salva?.motivo || "",
      };
    });

    renderPerdas();
  } catch (e) {
    console.warn("Erro ao carregar perdas:", e.message);
    perdasLinhas = [];
    renderPerdas();
  }
}

// ─── Render tabela de perdas editável ────────────────────────────
function renderPerdas() {
  const semItens  = document.getElementById("perdasSemItens");
  const wrap      = document.getElementById("perdasTabelaWrap");
  const tbody     = document.getElementById("perdasTbody");
  const btnSalvar = document.getElementById("btnSalvarPerdas");
  if (!semItens || !wrap || !tbody) return;

  if (perdasLinhas.length === 0) {
    semItens.textContent = "Esta OP não possui insumos cadastrados.";
    semItens.style.display = "";
    wrap.style.display = "none";
    if (btnSalvar) btnSalvar.style.display = "none";
    return;
  }

  semItens.style.display = "none";
  wrap.style.display = "";
  if (btnSalvar) btnSalvar.style.display = "";
  tbody.innerHTML = "";

  perdasLinhas.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-size:12px">${p.codigo_produto || "—"}</td>
      <td style="text-align:left;font-size:12px">${p.descricao}</td>
      <td style="font-size:12px">${p.unidade_medida}</td>
      <td><input type="number" min="0" step="any" value="${p.quantidade || 0}"
          data-idx="${idx}" class="perda-qtde-input"
          style="width:80px;padding:4px 8px;border-radius:6px;border:1.5px solid #334155;background:#1e293b;color:#f1f5f9;font-size:12px;text-align:center;"></td>
      <td><input type="text" value="${p.motivo || ""}"
          data-idx="${idx}" class="perda-motivo-input"
          placeholder="Motivo (opcional)"
          style="width:100%;min-width:100px;padding:4px 8px;border-radius:6px;border:1.5px solid #334155;background:#1e293b;color:#f1f5f9;font-size:12px;"></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".perda-qtde-input").forEach(input => {
    input.addEventListener("input", () => {
      perdasLinhas[Number(input.dataset.idx)].quantidade = Number(input.value) || 0;
    });
  });
  tbody.querySelectorAll(".perda-motivo-input").forEach(input => {
    input.addEventListener("input", () => {
      perdasLinhas[Number(input.dataset.idx)].motivo = input.value;
    });
  });
}

// ─── Salvar perdas ────────────────────────────────────────────────
document.getElementById("btnSalvarPerdas")?.addEventListener("click", async () => {
  if (!opAtualId) return;
  try {
    await apiRequest(`/ordens_producao/${opAtualId}/perdas`, {
      method: "PUT",
      body: JSON.stringify({ perdas: perdasLinhas }),
    });
    showToast("Perdas salvas!", "success");
  } catch (e) {
    showToast(e.message || "Erro ao salvar perdas.", "error");
  }
});

// eslint-disable-next-line no-unused-vars
function removerPerda() {} // substituída pela edição direta na tabela