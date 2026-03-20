import { apiRequest, getUser, showToast } from "./auth.js";

const user = getUser();
if (!user) window.location.href = "login.html";

// ── Estado ────────────────────────────────────────────────────────────────────
let materialSelecionado = null;
let pedidoVinculado     = null;
let itens               = [];
let materialTimer       = null;
let pedidoTimer         = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt      = v => (v != null && v !== "") ? v : "—";
const fmtData  = v => v ? new Date(v).toLocaleDateString("pt-BR") : "—";
const fmtMoeda = v => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

// ── Elementos ─────────────────────────────────────────────────────────────────
const materialSearch   = document.getElementById("materialSearch");
const materialDropdown = document.getElementById("materialDropdown");
const pedidoSearch     = document.getElementById("pedidoSearch");
const pedidoDropdown   = document.getElementById("pedidoDropdown");
const matInfo          = document.getElementById("matInfo");

// ── Fechar dropdowns ao clicar fora ──────────────────────────────────────────
document.addEventListener("click", e => {
  if (!materialSearch.contains(e.target) && !materialDropdown.contains(e.target))
    materialDropdown.style.display = "none";
  if (!pedidoSearch.contains(e.target) && !pedidoDropdown.contains(e.target))
    pedidoDropdown.style.display = "none";
});

// ══════════════════════════════════════════════════════════════════════════════
//  BUSCA DE MATERIAL
// ══════════════════════════════════════════════════════════════════════════════
materialSearch.addEventListener("input", () => {
  clearTimeout(materialTimer);
  const q = materialSearch.value.trim();
  if (q.length < 2) { materialDropdown.style.display = "none"; return; }
  materialTimer = setTimeout(() => buscarMateriais(q), 300);
});

async function buscarMateriais(q) {
  try {
    const res   = await apiRequest(`/materiais?search=${encodeURIComponent(q)}`);
    const lista = res.data || [];
    materialDropdown.innerHTML = "";

    if (lista.length === 0) {
      materialDropdown.innerHTML = `<div class="dropdown-item" style="color:#94a3b8">Nenhum material encontrado</div>`;
      materialDropdown.style.display = "block";
      return;
    }

    lista.forEach(m => {
      const div = document.createElement("div");
      div.className = "dropdown-item";
      const estoqueLabel = Number(m.estoque) > 0
        ? `<span style="color:#16a34a;font-weight:700">Estoque: ${m.estoque}</span>`
        : `<span style="color:#dc2626;font-weight:700">Sem estoque</span>`;
      div.innerHTML = `
        <div class="cliente">${m.codigo_produto} — ${m.descricao}</div>
        <div class="detalhe">R$ ${fmtMoeda(m.custo_fornecedor)} | ${estoqueLabel}</div>
      `;
      div.addEventListener("click", () => selecionarMaterial(m));
      materialDropdown.appendChild(div);
    });

    materialDropdown.style.display = "block";
  } catch (err) {
    console.error("Erro ao buscar materiais:", err);
  }
}

function selecionarMaterial(m) {
  materialSelecionado = m;
  materialSearch.value = `${m.codigo_produto} — ${m.descricao}`;
  materialDropdown.style.display = "none";

  const custoEmb  = Number(m.custo_fornecedor || 0);
  const qtdeEmb   = Number(m.qtde_embalagem   || 0);
  const estoque   = Number(m.estoque           || 0);
  const custoUnit = qtdeEmb > 0 ? custoEmb / qtdeEmb : custoEmb;
  materialSelecionado._custoUnit = custoUnit;

  const estoqueEl = document.getElementById("matEstoque");
  estoqueEl.textContent = `${estoque} un`;
  estoqueEl.className   = estoque > 10 ? "estoque-ok" : estoque > 0 ? "estoque-warn" : "estoque-zero";

  document.getElementById("matDesc").textContent  = m.descricao;
  document.getElementById("matCod").textContent   = m.codigo_produto;
  document.getElementById("matCusto").textContent = custoUnit.toFixed(4);
  matInfo.classList.add("show");
}

// ══════════════════════════════════════════════════════════════════════════════
//  BUSCA DE PEDIDO (vínculo opcional por item)
// ══════════════════════════════════════════════════════════════════════════════
pedidoSearch.addEventListener("input", () => {
  clearTimeout(pedidoTimer);
  const q = pedidoSearch.value.trim();
  if (q.length < 2) { pedidoDropdown.style.display = "none"; return; }
  pedidoTimer = setTimeout(() => buscarPedidos(q), 300);
});

async function buscarPedidos(q) {
  try {
    const res   = await apiRequest(`/controle_pedidos?search=${encodeURIComponent(q)}&limit=10`);
    const lista = res.data || [];
    pedidoDropdown.innerHTML = "";

    if (lista.length === 0) {
      pedidoDropdown.innerHTML = `<div class="dropdown-item" style="color:#94a3b8">Nenhum pedido encontrado</div>`;
      pedidoDropdown.style.display = "block";
      return;
    }

    lista.forEach(p => {
      const div = document.createElement("div");
      div.className = "dropdown-item";
      div.innerHTML = `
        <div class="cliente">${p.cliente || "—"} — ${p.zerb || "—"}</div>
        <div class="detalhe">PV: ${p.pedido_venda || "—"} | OC: ${p.ordem_compra || "—"} | Qtde: ${p.qtde_solicitada || 0}</div>
      `;
      div.addEventListener("click", () => vincularPedido(p));
      pedidoDropdown.appendChild(div);
    });

    pedidoDropdown.style.display = "block";
  } catch (err) {
    console.error("Erro ao buscar pedidos:", err);
  }
}

function vincularPedido(p) {
  pedidoVinculado = p;
  pedidoSearch.value = `${p.cliente || ""} — OC: ${p.ordem_compra || "—"}`;
  pedidoDropdown.style.display = "none";

  document.getElementById("pvPedido").textContent  = p.pedido_venda || p.id;
  document.getElementById("pvCliente").textContent = p.cliente || "—";
  document.getElementById("pvOC").textContent      = p.ordem_compra || "—";
  document.getElementById("pvQtde").textContent    = p.qtde_solicitada || "—";
  document.getElementById("pedidoVinculoCard").classList.add("show");
  document.getElementById("btnLimparPedido").style.display = "flex";
}

document.getElementById("btnLimparPedido").addEventListener("click", () => {
  limparPedidoVinculado();
});

function limparPedidoVinculado() {
  pedidoVinculado = null;
  pedidoSearch.value = "";
  document.getElementById("pedidoVinculoCard").classList.remove("show");
  document.getElementById("btnLimparPedido").style.display = "none";
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADICIONAR ITEM À ORDEM
// ══════════════════════════════════════════════════════════════════════════════
document.getElementById("btnAddItem").addEventListener("click", () => {
  if (!materialSelecionado) { showToast("Selecione um material.", "warning"); return; }
  const qtde    = Number(document.getElementById("itemQtde").value);
  const unidade = document.getElementById("itemUnidade").value || "un";
  if (!qtde || qtde <= 0) { showToast("Informe uma quantidade válida.", "warning"); return; }

  const estoque = Number(materialSelecionado.estoque || 0);

  // Soma já adicionada deste material
  const jaAdicionado = itens
    .filter(i => i.material_id === materialSelecionado.id)
    .reduce((s, i) => s + i.quantidade, 0);

  if (qtde + jaAdicionado > estoque) {
    showToast(`Estoque insuficiente! Disponível: ${estoque}, já alocado: ${jaAdicionado}.`, "warning");
    return;
  }

  const custoUnit = materialSelecionado._custoUnit || Number(materialSelecionado.custo_fornecedor || 0);

  itens.push({
    material_id:    materialSelecionado.id,
    codigo_produto: materialSelecionado.codigo_produto,
    descricao:      materialSelecionado.descricao,
    unidade_medida: unidade,
    quantidade:     qtde,
    custo_unitario: Number(custoUnit.toFixed(4)),
    subtotal:       Number((qtde * custoUnit).toFixed(2)),
    // Vínculo com pedido (pode ser null)
    pedido_id:      pedidoVinculado?.id || null,
    pedido_venda:   pedidoVinculado?.pedido_venda || null,
    ordem_compra:   pedidoVinculado?.ordem_compra || null,
    cliente:        pedidoVinculado?.cliente || null,
    estado:         pedidoVinculado?.estado || null,
    codigo_cliente: pedidoVinculado?.codigo_cliente || null,
    zerb:           pedidoVinculado?.zerb || null,
  });

  // Limpa campos
  materialSearch.value = "";
  document.getElementById("itemQtde").value = "";
  materialSelecionado = null;
  matInfo.classList.remove("show");
  limparPedidoVinculado();

  renderItens();
});

// ══════════════════════════════════════════════════════════════════════════════
//  RENDERIZAR TABELA DE ITENS
// ══════════════════════════════════════════════════════════════════════════════
function renderItens() {
  const tbody    = document.getElementById("itensTbody");
  const wrap     = document.getElementById("tabelaWrap");
  const semItens = document.getElementById("semItens");

  if (itens.length === 0) {
    wrap.style.display     = "none";
    semItens.style.display = "block";
    document.getElementById("totalGeral").textContent = "R$ 0,00";
    atualizarResumo();
    return;
  }

  wrap.style.display     = "block";
  semItens.style.display = "none";
  tbody.innerHTML = "";
  let total = 0;

  itens.forEach((it, i) => {
    total += it.subtotal;
    const pedidoLabel = it.pedido_id
      ? `<span class="item-pedido-tag">${it.cliente || "—"}<br><small>OC: ${it.ordem_compra || "—"}</small></span>`
      : `<span style="color:var(--muted);font-size:11px">Sem vínculo</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:600">${it.codigo_produto}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${it.descricao}">${it.descricao}</td>
      <td>${it.quantidade}</td>
      <td>${it.unidade_medida}</td>
      <td>R$ ${it.custo_unitario.toFixed(2)}</td>
      <td style="font-weight:700;color:#1d4ed8">R$ ${it.subtotal.toFixed(2)}</td>
      <td>${pedidoLabel}</td>
      <td>
        <button data-idx="${i}" style="background:none;border:none;cursor:pointer;
          color:#ef4444;font-size:15px" title="Remover">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("totalGeral").textContent = `R$ ${fmtMoeda(total)}`;
  tbody.querySelectorAll("button[data-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      itens.splice(Number(btn.dataset.idx), 1);
      renderItens();
    });
  });

  atualizarResumo(total);
}

function atualizarResumo(total) {
  const t = total ?? itens.reduce((s, i) => s + i.subtotal, 0);

  // Contagens
  const materiaisDistintos = new Set(itens.map(i => i.material_id)).size;
  const pedidosVinculados  = new Set(itens.filter(i => i.pedido_id).map(i => i.pedido_id));

  document.getElementById("rsItens").textContent     = itens.length;
  document.getElementById("rsMateriais").textContent  = materiaisDistintos;
  document.getElementById("rsPedidos").textContent    = pedidosVinculados.size;
  document.getElementById("rsCusto").textContent      = `R$ ${fmtMoeda(t)}`;

  // Lista de pedidos vinculados no resumo
  const pedidosEl = document.getElementById("pedidosVinculados");
  if (pedidosVinculados.size > 0) {
    const pedidosMap = new Map();
    itens.filter(i => i.pedido_id).forEach(i => {
      if (!pedidosMap.has(i.pedido_id)) {
        pedidosMap.set(i.pedido_id, {
          cliente: i.cliente,
          ordem_compra: i.ordem_compra,
          pedido_venda: i.pedido_venda,
          itensCount: 0,
        });
      }
      pedidosMap.get(i.pedido_id).itensCount++;
    });

    pedidosEl.innerHTML = Array.from(pedidosMap.values()).map(p => `
      <div class="pv-item">
        <span class="pv-item-cliente">${p.cliente || "—"}</span>
        <span class="pv-item-detalhe">OC: ${p.ordem_compra || "—"} · ${p.itensCount} item(s)</span>
      </div>
    `).join("");
    pedidosEl.style.display = "block";
  } else {
    pedidosEl.innerHTML = "";
    pedidosEl.style.display = "none";
  }

  atualizarBtnGerar();
}

function atualizarBtnGerar() {
  document.getElementById("btnGerar").disabled = itens.length === 0;
}

// ══════════════════════════════════════════════════════════════════════════════
//  GERAR SAÍDA
// ══════════════════════════════════════════════════════════════════════════════
document.getElementById("btnGerar").addEventListener("click", gerarSaida);

async function gerarSaida() {
  if (itens.length === 0) return;

  try {
    const btn = document.getElementById("btnGerar");
    btn.disabled = true;
    btn.textContent = "Processando...";

    const obs = document.getElementById("obsTexto").value;
    const res = await apiRequest("/saidas_estoque", {
      method: "POST",
      body: JSON.stringify({
        usuario: user.nome,
        observacoes: obs,
        itens,
      }),
    });

    showToast(`Saída registrada! Nº ${res.numero}`, "success");
    console.log("Resposta saída:", JSON.stringify(res, null, 2));
    abrirComprovante(res.saida || res.data || res);
    carregarHistorico();

    // Limpa formulário
    itens = [];
    renderItens();
    document.getElementById("obsTexto").value = "";
  } catch (err) {
    showToast(err.message || "Erro ao registrar saída.", "error");
  } finally {
    const btn = document.getElementById("btnGerar");
    btn.disabled = false;
    btn.textContent = "✔ Confirmar Saída de Estoque";
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMPROVANTE
// ══════════════════════════════════════════════════════════════════════════════
function abrirComprovante(saida) {
  const el = document.getElementById("comprovanteConteudo");

  if (!saida) {
    el.innerHTML = `<p style="color:var(--danger);padding:24px;text-align:center">Erro: dados da saída não encontrados.</p>`;
    const modal = document.getElementById("modalComprovante");
    modal.classList.remove("hidden");
    requestAnimationFrame(() => modal.classList.add("show"));
    return;
  }

  const itensArr = saida.itens || [];
  const totalGeral = itensArr.reduce((s, i) => s + Number(i.subtotal || 0), 0);

  // Agrupa itens por pedido para o comprovante
  const porPedido = new Map();
  itensArr.forEach(it => {
    const key = it.pedido_id || "sem_vinculo";
    if (!porPedido.has(key)) {
      porPedido.set(key, {
        cliente: it.cliente || null,
        ordem_compra: it.ordem_compra || null,
        pedido_venda: it.pedido_venda || null,
        itens: [],
      });
    }
    porPedido.get(key).itens.push(it);
  });

  // Gera seções por pedido
  let secoesHTML = "";
  porPedido.forEach((grupo, key) => {
    const subtotal = grupo.itens.reduce((s, i) => s + Number(i.subtotal || 0), 0);
    const titulo = key === "sem_vinculo"
      ? "Itens sem vínculo a pedido"
      : `Pedido: ${grupo.cliente || "—"} — OC: ${grupo.ordem_compra || "—"}`;

    secoesHTML += `
      <div class="comp-section">
        <h4>${titulo}</h4>
        <table class="comp-table">
          <thead><tr>
            <th>#</th><th>Código</th><th>Descrição</th><th>Qtde</th><th>Un.</th>
            <th>Custo Unit.</th><th>Subtotal</th>
          </tr></thead>
          <tbody>
            ${grupo.itens.map((it, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="font-weight:600">${fmt(it.codigo_produto)}</td>
                <td>${fmt(it.descricao)}</td>
                <td>${it.quantidade}</td>
                <td>${it.unidade_medida || "un"}</td>
                <td>R$ ${fmtMoeda(it.custo_unitario)}</td>
                <td style="font-weight:700;color:var(--primary)">R$ ${fmtMoeda(it.subtotal)}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot><tr>
            <td colspan="6" style="text-align:right">Subtotal:</td>
            <td style="font-weight:700">R$ ${fmtMoeda(subtotal)}</td>
          </tr></tfoot>
        </table>
      </div>
    `;
  });

  el.innerHTML = `
    <div class="comprovante">
      <div class="comp-header">
        <div class="comp-empresa">
          <h3>Lucabe Energy</h3>
          <p>CNPJ: 01.272.361/0001-50<br>
          Avenida Comandante Sampaio, N° 781 - KM 18<br>
          Osasco - SP | CEP: 06192-010<br>
          Telefone: (11) 4506-4700</p>
        </div>
        <div class="comp-doc">
          <div class="titulo">COMPROVANTE DE SAÍDA</div>
          <p><b>Nº:</b> ${saida.numero || "—"}</p>
          <p><b>Data:</b> ${fmtData(saida.data_saida)}</p>
          <p><b>Usuário:</b> ${saida.usuario || "—"}</p>
        </div>
      </div>

      ${secoesHTML}

      <div class="comp-total-section">
        <span class="comp-total-label">Total Geral</span>
        <span class="comp-total-valor">R$ ${fmtMoeda(totalGeral)}</span>
      </div>

      ${saida.observacoes ? `
        <div class="comp-section">
          <h4>Observações</h4>
          <p class="comp-obs">${saida.observacoes}</p>
        </div>` : ""}

      <div class="comp-footer">
        <span>PCP - Lucabe Energy</span>
        <span>Gerado em ${new Date().toLocaleString("pt-BR")} por ${saida.usuario || "Sistema"}</span>
      </div>
    </div>
  `;

  const modal = document.getElementById("modalComprovante");
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("show"));
}

window.fecharComprovante = function() {
  const modal = document.getElementById("modalComprovante");
  modal.classList.remove("show");
  setTimeout(() => modal.classList.add("hidden"), 260);
};

// ══════════════════════════════════════════════════════════════════════════════
//  HISTÓRICO
// ══════════════════════════════════════════════════════════════════════════════
async function carregarHistorico() {
  const el = document.getElementById("historicoLista");
  try {
    const res   = await apiRequest("/saidas_estoque?limit=10");
    const lista = res.data || [];

    if (lista.length === 0) {
      el.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:13px;padding:16px">Nenhuma saída registrada.</div>`;
      return;
    }

    el.innerHTML = lista.map(s => `
      <div class="historico-item" onclick="verSaida(${s.id})">
        <div class="hist-header">
          <span class="hist-num">Nº ${s.numero}</span>
          <span class="badge badge-success">Concluída</span>
        </div>
        <div class="hist-detalhe">${fmtData(s.data_saida)} · ${s.total_itens || 0} item(s)</div>
        <div class="hist-detalhe">R$ ${fmtMoeda(s.custo_total)}</div>
      </div>
    `).join("");
  } catch {
    el.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:13px;padding:16px">Erro ao carregar histórico.</div>`;
  }
}

window.verSaida = async function(id) {
  try {
    const res = await apiRequest(`/saidas_estoque/${id}`);
    console.log("Resposta verSaida:", JSON.stringify(res, null, 2));
    abrirComprovante(res.data || res.saida || res);
  } catch (err) {
    console.error("Erro verSaida:", err);
    showToast("Erro ao carregar saída.", "error");
  }
};

// ── Init ──────────────────────────────────────────────────────────────────────
carregarHistorico();