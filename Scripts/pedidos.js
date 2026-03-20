import { apiRequest, getUser, showToast } from "./auth.js";

// ─── Autenticação ─────────────────────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";

// ─── Elementos (com guarda — evita crash se elemento não existir no HTML) ─────
const tabelaPedidos = document.getElementById("tabelaPedidos");
const modalPedido   = document.getElementById("modalPedido");
const filtroCliente = document.getElementById("filtroCliente");
const filtroStatus  = document.getElementById("filtroStatus");

// ─── Init — módulos ES6 são sempre defer, DOMContentLoaded já passou ──────────
// Chama direto, sem wrapper DOMContentLoaded
carregarPedidos();
setupEventos();

// ─── Eventos ──────────────────────────────────────────────────────────────────
function setupEventos() {
  const btnFiltrar    = document.getElementById("btnFiltrar");
  const btnNovoPedido = document.getElementById("btnNovoPedido");

  if (btnFiltrar) {
    btnFiltrar.addEventListener("click", () => {
      carregarPedidos(filtroCliente?.value.trim(), filtroStatus?.value);
    });
  }

  if (btnNovoPedido) {
    btnNovoPedido.addEventListener("click", () => {
      limparModal();
      const t = document.getElementById("modalTitle");
      if (t) t.textContent = "Novo Pedido";
      abrirModal();
    });
  }


  // ── Auto-busca: codigo_cliente → material ──
  const inputCodigoCliente = document.getElementById("codigo_cliente");
  const inputCliente       = document.getElementById("cliente");
  if (inputCodigoCliente) {
    let debounceCC = null;
    inputCodigoCliente.addEventListener("input", () => {
      clearTimeout(debounceCC);
      const val = inputCodigoCliente.value.trim();
      if (!val) { limparInfoMaterial(); return; }
      debounceCC = setTimeout(() => buscarMaterialPorCodigoCliente(val), 400);
    });
    inputCodigoCliente.addEventListener("blur", () => {
      const val = inputCodigoCliente.value.trim();
      if (val) buscarMaterialPorCodigoCliente(val);
    });
  }
  // Re-busca material quando o nome do cliente muda (afeta regra de produto por cliente)
  if (inputCliente && inputCodigoCliente) {
    inputCliente.addEventListener("blur", () => {
      const cod = inputCodigoCliente.value.trim();
      if (cod) buscarMaterialPorCodigoCliente(cod);
    });
  }

  // Auto-atualiza controle quando muda qtde_solicitada
  const inputQtdeSol = document.getElementById("qtde_solicitada");
  if (inputQtdeSol) {
    inputQtdeSol.addEventListener("input", () => {
      setTimeout(atualizarControleAuto, 100);
    });
  }
}

// ─── Carregar pedidos ─────────────────────────────────────────────────────────
async function carregarPedidos(cliente = "", status = "") {
  if (!tabelaPedidos) return;
  tabelaPedidos.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#888;padding:24px">Carregando...</td></tr>`;
  try {
    const params = new URLSearchParams();
    if (cliente) params.append("cliente", cliente);
    if (status)  params.append("status", status);
    const res = await apiRequest(`/pedidos?${params.toString()}`);
    const pedidos = Array.isArray(res) ? res : res.data || [];
    tabelaPedidos.innerHTML = "";
    if (pedidos.length === 0) {
      tabelaPedidos.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#888;padding:24px">Nenhum pedido encontrado.</td></tr>`;
      return;
    }
    pedidos.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:600">${p.ordem_compra || "—"}</td>
        <td>${p.cliente || p.codigo_cliente || "—"}</td>
        <td>${p.codigo_produto || p.zerb ? `<strong>${p.codigo_produto || p.zerb}</strong> — ` : ""}${p.descricao_material || "—"}</td>
        <td>${p.qtde_solicitada || "—"}</td>
        <td><span class="badge badge-${badgeClass(p.status_producao)}">${p.status_producao || "—"}</span></td>
        <td>
          <button class="btn btn-primary btn-sm btn-editar">Editar</button>
          <button class="btn btn-danger btn-sm btn-excluir">Excluir</button>
        </td>
      `;
      tr.querySelector(".btn-editar").addEventListener("click", () => editarPedido(p.id));
      tr.querySelector(".btn-excluir").addEventListener("click", () => excluirPedido(p.id, p.pedido_venda || p.id));
      tabelaPedidos.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar pedidos:", err);
    showToast("Erro ao carregar pedidos.", "error");
    tabelaPedidos.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#e74c3c;padding:24px">Erro ao carregar dados.</td></tr>`;
  }
}

// ─── Buscar material pelo código do cliente ───────────────────────────────────
async function buscarMaterialPorCodigoCliente(codigoCliente) {
  const matDesc   = document.getElementById("matDesc");
  const matCusto  = document.getElementById("matCusto");
  const matZerb   = document.getElementById("matZerb");
  const zerbField = document.getElementById("zerb_display");

  if (matDesc)  matDesc.textContent  = "Buscando...";
  if (matCusto) matCusto.textContent = "...";
  if (matZerb)  matZerb.textContent  = "...";
  if (zerbField) zerbField.value = "";

  try {
    const clienteNome = document.getElementById("cliente")?.value?.trim() || "";
    const res  = await apiRequest(`/cliente-material/${encodeURIComponent(codigoCliente)}?cliente=${encodeURIComponent(clienteNome)}`);
    const data = res.data || res;

    if (data && (data.material_id || data.codigo_zerb)) {
      const zerb     = data.codigo_zerb || data.codigo_produto || "—";
      const descricao = data.material_descricao || data.descricao || "";
      const custo    = Number(data.custo_fornecedor);

      if (matDesc)  matDesc.textContent  = descricao || "Sem descrição";
      if (matCusto) matCusto.textContent = `R$ ${custo}`;
      if (matZerb)  matZerb.textContent  = zerb;
      if (zerbField) zerbField.value = zerb;

      const inputCC = document.getElementById("codigo_cliente");
      if (inputCC) {
        inputCC.dataset.zerb       = zerb;
        inputCC.dataset.materialId = data.material_id || "";
      }
      atualizarControleAuto();
    } else {
      if (matDesc)  matDesc.textContent  = "Código não encontrado";
      if (matCusto) matCusto.textContent = "—";
      if (matZerb)  matZerb.textContent  = "—";
      if (zerbField) zerbField.value = "";
      const inputCC = document.getElementById("codigo_cliente");
      if (inputCC) { inputCC.dataset.zerb = ""; inputCC.dataset.materialId = ""; }
    }
  } catch (err) {
    console.error("Erro ao buscar material pelo código cliente:", err);
    if (matDesc)  matDesc.textContent  = err.message || "Erro na busca";
    if (matCusto) matCusto.textContent = "—";
    if (matZerb)  matZerb.textContent  = "—";
    if (zerbField) zerbField.value = "";
  }
}

function limparInfoMaterial() {
  const matDesc   = document.getElementById("matDesc");
  const matCusto  = document.getElementById("matCusto");
  const matZerb   = document.getElementById("matZerb");
  const zerbField = document.getElementById("zerb_display");
  if (matDesc)  matDesc.textContent  = "—";
  if (matCusto) matCusto.textContent = "—";
  if (matZerb)  matZerb.textContent  = "—";
  if (zerbField) zerbField.value = "";
}

function badgeClass(status) {
  const map = {
    "Curso normal":       "success",
    "Item em Produção":   "info",
    "Pedido atrasado":    "warning",
    "Entrega com Atraso": "warning",
    "Entregue":           "success",
  };
  return map[status] || "default";
}

// ─── Excluir pedido ───────────────────────────────────────────────────────────
async function excluirPedido(id, label) {
  if (!confirm(`Deseja excluir o pedido "${label}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await apiRequest(`/pedidos/${id}`, { method: "DELETE" });
    showToast("Pedido excluído com sucesso!", "success");
    carregarPedidos(filtroCliente?.value.trim(), filtroStatus?.value);
  } catch (err) {
    console.error("Erro ao excluir pedido:", err);
    showToast(err.message || "Erro ao excluir pedido.", "error");
  }
}

// ─── Auto-resolver controle ───────────────────────────────────────────────────
function atualizarControleAuto() {
  const controleEl    = document.getElementById("controle");
  const codigoCliente = document.getElementById("codigo_cliente");
  const qtdeSol       = document.getElementById("qtde_solicitada");
  if (!controleEl || !codigoCliente) return;

  const zerb = codigoCliente.dataset.zerb;
  const qtde = Number(qtdeSol?.value || 0);
  if (!zerb || !qtde) { controleEl.value = ""; return; }

  const materialId = codigoCliente.dataset.materialId;
  if (!materialId) { controleEl.value = "Produção Necessária"; return; }

  apiRequest(`/materiais/${materialId}`)
    .then(res => {
      const mat     = res.data || res;
      const estoque = Number(mat.estoque || 0);
      controleEl.value = estoque >= qtde ? "Item de Estoque" : "Produção Necessária";
    })
    .catch(() => { controleEl.value = "Produção Necessária"; });
}

// ─── Editar pedido ────────────────────────────────────────────────────────────
async function editarPedido(id) {
  try {
    const res = await apiRequest(`/pedidos/${id}`);
    const p   = Array.isArray(res) ? res[0] : res.data || res;

    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ""; };
    set("pedidoId",        p.id);
    set("pedido_venda",    p.pedido_venda);
    set("cliente",         p.cliente);
    set("estado",          p.estado);
    set("codigo_cliente",  p.codigo_cliente);
    set("qtde_produzida",  p.qtde_produzida);
    set("qtde_solicitada", p.qtde_solicitada);
    set("data_contratual", p.data_contratual ? p.data_contratual.split("T")[0] : "");
    set("data_finalizada", p.data_finalizada ? p.data_finalizada.split("T")[0] : "");
    set("status_producao", p.status_producao || "Curso normal");
    set("ordem_compra",    p.ordem_compra);
    set("controle",        p.controle);

    const t = document.getElementById("modalTitle");
    if (t) t.textContent = "Editar Pedido";

    if (p.codigo_cliente) buscarMaterialPorCodigoCliente(p.codigo_cliente);
    abrirModal();
  } catch (err) {
    console.error("Erro ao carregar pedido:", err);
    showToast("Erro ao carregar pedido.", "error");
  }
}

// ─── Salvar pedido ────────────────────────────────────────────────────────────
async function salvarPedido() {
  const get = (id) => document.getElementById(id)?.value ?? "";

  const id      = get("pedidoId");
  const payload = {
    pedido_venda:    get("pedido_venda").trim() || null,
    cliente:         get("cliente").trim() || null,
    estado:          get("estado").trim() || null,
    codigo_cliente:  get("codigo_cliente"),
    zerb:            document.getElementById("codigo_cliente")?.dataset.zerb || null,
    controle:        get("controle") || null,
    qtde_produzida:  get("qtde_produzida"),
    qtde_solicitada: get("qtde_solicitada"),
    data_contratual: get("data_contratual") || null,
    data_finalizada: get("data_finalizada") || null,
    status_producao: get("status_producao"),
    ordem_compra:    get("ordem_compra").trim(),
  };

  const btnSalvar = modalPedido?.querySelector(".modal-pedido-footer .btn-primary");
  if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = "Salvando..."; }

  try {
    if (id) {
      await apiRequest(`/pedidos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Pedido atualizado com sucesso!", "success");
    } else {
      await apiRequest("/pedidos", { method: "POST", body: JSON.stringify(payload) });
      showToast("Pedido criado com sucesso!", "success");
    }
    fecharModal();
    carregarPedidos();
  } catch (err) {
    console.error("Erro ao salvar pedido:", err);
    showToast(err.message || "Erro ao salvar pedido.", "error");
  } finally {
    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = "Salvar Pedido"; }
  }
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function abrirModal() {
  if (!modalPedido) return;
  modalPedido.classList.remove("hidden");
  requestAnimationFrame(() => requestAnimationFrame(() => modalPedido.classList.add("show")));
}

function fecharModal() {
  if (!modalPedido) return;
  modalPedido.classList.remove("show");
  setTimeout(() => modalPedido.classList.add("hidden"), 300);
}

function limparModal() {
  const ids = ["pedidoId","pedido_venda","cliente","estado","codigo_cliente",
    "qtde_produzida","qtde_solicitada","data_contratual","data_finalizada",
    "ordem_compra","controle"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });

  const inputCC = document.getElementById("codigo_cliente");
  if (inputCC) { inputCC.dataset.zerb = ""; inputCC.dataset.materialId = ""; }

  const sp = document.getElementById("status_producao");
  if (sp) sp.value = "Curso normal";

  const zerbField = document.getElementById("zerb_display");
  if (zerbField) zerbField.value = "";

  limparInfoMaterial();
}

// ─── Expor para o HTML (onclick inline) ──────────────────────────────────────
window.salvarPedido = salvarPedido;
window.fecharModal  = fecharModal;
window.voltarHub    = () => { window.location.href = "index.html"; };