import { apiRequest, getUser, showToast } from "./auth.js";

const user = getUser();
if (!user) window.location.href = "login.html";

// ── Estado ────────────────────────────────────────────────────────────────────
let pedidoSelecionado  = null;
let materialSelecionado = null;
let itens              = [];
let pedidoTimer        = null;
let materialTimer      = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt      = v => (v != null && v !== "") ? v : "—";
const fmtData  = v => v ? new Date(v).toLocaleDateString("pt-BR") : "—";
const fmtMoeda = v => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

// ── Busca de pedido ───────────────────────────────────────────────────────────
const pedidoSearch   = document.getElementById("pedidoSearch");
const pedidoDropdown = document.getElementById("pedidoDropdown");

pedidoSearch.addEventListener("input", () => {
  clearTimeout(pedidoTimer);
  const q = pedidoSearch.value.trim();
  if (q.length < 2) { pedidoDropdown.style.display = "none"; return; }
  pedidoTimer = setTimeout(() => buscarPedidos(q), 300);
});

document.addEventListener("click", e => {
  if (!pedidoSearch.contains(e.target) && !pedidoDropdown.contains(e.target))
    pedidoDropdown.style.display = "none";
  if (!document.getElementById("materialSearch").contains(e.target) &&
      !document.getElementById("materialDropdown").contains(e.target))
    document.getElementById("materialDropdown").style.display = "none";
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
      div.addEventListener("click", () => selecionarPedido(p));
      pedidoDropdown.appendChild(div);
    });

    pedidoDropdown.style.display = "block";
  } catch (err) {
    console.error("Erro ao buscar pedidos:", err);
  }
}

function selecionarPedido(p) {
  pedidoSelecionado = p;
  pedidoSearch.value = `${p.cliente || ""} — ${p.zerb || ""}`;
  pedidoDropdown.style.display = "none";

  // Preenche card
  document.getElementById("pedidoCardTitulo").textContent = `Pedido: ${p.pedido_venda || p.id}`;
  document.getElementById("pcCliente").textContent        = fmt(p.cliente);
  document.getElementById("pcEstado").textContent         = fmt(p.estado);
  document.getElementById("pcPedidoVenda").textContent    = fmt(p.pedido_venda);
  document.getElementById("pcOrdemCompra").textContent    = fmt(p.ordem_compra);
  document.getElementById("pcQtde").textContent           = fmt(p.qtde_solicitada);
  document.getElementById("pcDataContratual").textContent = fmtData(p.data_contratual);
  document.getElementById("pedidoCard").classList.add("show");

  // Resumo
  document.getElementById("rsPedido").textContent  = p.pedido_venda || p.id;
  document.getElementById("rsCliente").textContent = p.cliente || "—";

  atualizarBtnGerar();
}

window.limparPedido = function() {
  pedidoSelecionado = null;
  pedidoSearch.value = "";
  document.getElementById("pedidoCard").classList.remove("show");
  document.getElementById("rsPedido").textContent  = "—";
  document.getElementById("rsCliente").textContent = "—";
  atualizarBtnGerar();
};

// ── Busca de material ─────────────────────────────────────────────────────────
const materialSearch   = document.getElementById("materialSearch");
const materialDropdown = document.getElementById("materialDropdown");
const matInfo          = document.getElementById("matInfo");

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

  // Calcula custo por unidade real (regra de 3 se tiver qtde_embalagem)
  const custoEmb   = Number(m.custo_fornecedor || 0);
  const qtdeEmb    = Number(m.qtde_embalagem   || 0);
  const estoque    = Number(m.estoque          || 0);
  const custoUnit  = qtdeEmb > 0 ? custoEmb / qtdeEmb : custoEmb;
  materialSelecionado._custoUnit = custoUnit;

  // Badge de estoque
  const estoqueEl = document.getElementById("matEstoque");
  estoqueEl.textContent = `${estoque} un`;
  estoqueEl.className   = estoque > 10 ? "estoque-ok" : estoque > 0 ? "estoque-warn" : "estoque-zero";

  document.getElementById("matDesc").textContent  = m.descricao;
  document.getElementById("matCod").textContent   = m.codigo_produto;
  document.getElementById("matCusto").textContent = custoUnit.toFixed(4);
  matInfo.classList.add("show");
}

// ── Adicionar item ─────────────────────────────────────────────────────────────
document.getElementById("btnAddItem").addEventListener("click", () => {
  if (!materialSelecionado) { showToast("Selecione um material.", "warning"); return; }
  const qtde    = Number(document.getElementById("itemQtde").value);
  const unidade = document.getElementById("itemUnidade").value || "un";
  if (!qtde || qtde <= 0) { showToast("Informe uma quantidade válida.", "warning"); return; }

  const estoque = Number(materialSelecionado.estoque || 0);
  if (qtde > estoque) {
    showToast(`Estoque insuficiente! Disponível: ${estoque} ${unidade}.`, "warning");
    return;
  }

  const custoUnit = materialSelecionado._custoUnit || Number(materialSelecionado.custo_fornecedor || 0);
  const existente = itens.find(i => i.material_id === materialSelecionado.id);

  if (existente) {
    existente.quantidade += qtde;
    existente.subtotal    = Number((existente.quantidade * existente.custo_unitario).toFixed(2));
  } else {
    itens.push({
      material_id:    materialSelecionado.id,
      codigo_produto: materialSelecionado.codigo_produto,
      descricao:      materialSelecionado.descricao,
      unidade_medida: unidade,
      quantidade:     qtde,
      custo_unitario: Number(custoUnit.toFixed(4)),
      subtotal:       Number((qtde * custoUnit).toFixed(2)),
    });
  }

  // Limpa campos
  materialSearch.value = "";
  document.getElementById("itemQtde").value = "";
  materialSelecionado = null;
  matInfo.classList.remove("show");

  renderItens();
});

// ── Renderizar tabela de itens ─────────────────────────────────────────────────
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
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:600">${it.codigo_produto}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${it.descricao}">${it.descricao}</td>
      <td>${it.quantidade}</td>
      <td>${it.unidade_medida}</td>
      <td>R$ ${it.custo_unitario.toFixed(2)}</td>
      <td style="font-weight:700;color:#1d4ed8">R$ ${it.subtotal.toFixed(2)}</td>
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
  document.getElementById("rsItens").textContent = itens.length;
  document.getElementById("rsCusto").textContent = `R$ ${fmtMoeda(t)}`;
  atualizarBtnGerar();
}

function atualizarBtnGerar() {
  document.getElementById("btnGerar").disabled =
    !pedidoSelecionado || itens.length === 0;
}

// ── Gerar saída ───────────────────────────────────────────────────────────────
window.gerarSaida = async function() {
  if (!pedidoSelecionado || itens.length === 0) return;

  try {
    document.getElementById("btnGerar").disabled = true;
    document.getElementById("btnGerar").textContent = "Processando...";

    const obs = document.getElementById("obsTexto").value;
    const res = await apiRequest("/saidas_estoque", {
      method: "POST",
      body: JSON.stringify({
        pedido_id:  pedidoSelecionado.id,
        usuario:    user.nome,
        observacoes: obs,
        itens,
      }),
    });

    showToast(`Saída registrada! Nº ${res.numero}`, "success");
    abrirComprovante(res.saida);
    carregarHistorico();

    // Limpa formulário
    limparPedido();
    itens = [];
    renderItens();
    document.getElementById("obsTexto").value = "";
  } catch (err) {
    showToast(err.message || "Erro ao registrar saída.", "error");
  } finally {
    document.getElementById("btnGerar").disabled = false;
    document.getElementById("btnGerar").textContent = "✔ Confirmar Saída de Estoque";
  }
};

// ── Comprovante ───────────────────────────────────────────────────────────────
function abrirComprovante(saida) {
  const el = document.getElementById("comprovanteConteudo");
  const totalGeral = saida.itens.reduce((s, i) => s + Number(i.subtotal), 0);

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
          <p><b>Nº:</b> ${saida.numero}</p>
          <p><b>Data:</b> ${fmtData(saida.data_saida)}</p>
          <p><b>Usuário:</b> ${saida.usuario}</p>
        </div>
      </div>

      <div class="comp-section">
        <h4>Pedido Atendido</h4>
        <div class="comp-grid">
          <div class="comp-row"><span style="color:#64748b">Cliente:</span> <b>${fmt(saida.cliente)}</b></div>
          <div class="comp-row"><span style="color:#64748b">Estado:</span> <b>${fmt(saida.estado)}</b></div>
          <div class="comp-row"><span style="color:#64748b">Pedido Venda:</span> <b>${fmt(saida.pedido_venda)}</b></div>
          <div class="comp-row"><span style="color:#64748b">Ordem Compra:</span> <b>${fmt(saida.ordem_compra)}</b></div>
          <div class="comp-row"><span style="color:#64748b">Cód. Cliente:</span> <b>${fmt(saida.codigo_cliente)}</b></div>
          <div class="comp-row"><span style="color:#64748b">Produto (ZERB):</span> <b>${fmt(saida.zerb)}</b></div>
        </div>
      </div>

      <div class="comp-section">
        <h4>Materiais Retirados do Estoque</h4>
        <table class="comp-table">
          <thead><tr>
            <th>#</th><th>Código</th><th>Descrição</th><th>Qtde</th><th>Un.</th>
            <th>Custo Unit.</th><th>Subtotal</th>
          </tr></thead>
          <tbody>
            ${saida.itens.map((it, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="font-weight:600">${fmt(it.codigo_produto)}</td>
                <td>${fmt(it.descricao)}</td>
                <td>${it.quantidade}</td>
                <td>${it.unidade_medida || "un"}</td>
                <td>R$ ${fmtMoeda(it.custo_unitario)}</td>
                <td style="font-weight:700">R$ ${fmtMoeda(it.subtotal)}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot><tr>
            <td colspan="6" style="text-align:right">Total:</td>
            <td>R$ ${fmtMoeda(totalGeral)}</td>
          </tr></tfoot>
        </table>
      </div>

      ${saida.observacoes ? `
        <div class="comp-section">
          <h4>Observações</h4>
          <p style="font-size:13px;color:#475569;padding:8px 12px;background:#f8fafc;
            border-radius:8px">${saida.observacoes}</p>
        </div>` : ""}

      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;
        display:flex;justify-content:space-between;font-size:11px;color:#94a3b8">
        <span>PCP - Lucabe Energy</span>
        <span>Gerado em ${new Date().toLocaleString("pt-BR")} por ${saida.usuario}</span>
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

// ── Histórico ─────────────────────────────────────────────────────────────────
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
        <div class="hist-detalhe">${s.cliente || "—"} · ${fmtData(s.data_saida)}</div>
        <div class="hist-detalhe">${s.total_itens || 0} item(s) · R$ ${fmtMoeda(s.custo_total)}</div>
      </div>
    `).join("");
  } catch {
    el.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:13px;padding:16px">Erro ao carregar histórico.</div>`;
  }
}

window.verSaida = async function(id) {
  try {
    const res = await apiRequest(`/saidas_estoque/${id}`);
    abrirComprovante(res.data);
  } catch (err) {
    showToast("Erro ao carregar saída.", "error");
  }
};

// ── Init ──────────────────────────────────────────────────────────────────────
carregarHistorico();