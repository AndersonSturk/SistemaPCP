import { apiRequest, getUser, showToast } from "./auth.js";

const user = getUser();
if (!user) window.location.href = "login.html";

// ── Estado ────────────────────────────────────────────
let materialSelecionado = null;
let pedidosDisponiveis  = [];  // pedidos carregados para o material
let pedidosSelecionados = {};  // { pedidoId: { pedido, parcial, qtdeParcial } }
let itens               = [];
let materialTimer       = null;

// ── Helpers ───────────────────────────────────────────
const fmt      = v => (v != null && v !== "") ? v : "—";
const fmtData  = v => v ? new Date(v).toLocaleDateString("pt-BR") : "—";
const fmtMoeda = v => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

// ── Elementos ─────────────────────────────────────────
const materialSearch   = document.getElementById("materialSearch");
const materialDropdown = document.getElementById("materialDropdown");
const matInfo          = document.getElementById("matInfo");

document.addEventListener("click", e => {
  if (!materialSearch.contains(e.target) && !materialDropdown.contains(e.target))
    materialDropdown.style.display = "none";
});

// ══════════════════════════════════════════════════════
//  BUSCA DE MATERIAL
// ══════════════════════════════════════════════════════
materialSearch.addEventListener("input", () => {
  clearTimeout(materialTimer);
  const q = materialSearch.value.trim();
  if (q.length < 2) { materialDropdown.style.display = "none"; return; }
  materialTimer = setTimeout(() => buscarMateriais(q), 300);
});

async function buscarMateriais(q) {
  try {
    const res = await apiRequest(`/materiais?search=${encodeURIComponent(q)}`);
    const lista = res.data || [];
    materialDropdown.innerHTML = "";

    if (!lista.length) {
      materialDropdown.innerHTML = `<div class="dropdown-item" style="color:#94a3b8">Nenhum material encontrado</div>`;
      materialDropdown.style.display = "block";
      return;
    }

    lista.forEach(m => {
      const div = document.createElement("div");
      div.className = "dropdown-item";
      div.innerHTML = `
        <div class="cliente">${m.codigo_produto} — ${m.descricao}</div>
        <div class="detalhe">R$ ${fmtMoeda(m.custo_fornecedor)}</div>
      `;
      div.addEventListener("click", () => selecionarMaterial(m));
      materialDropdown.appendChild(div);
    });
    materialDropdown.style.display = "block";
  } catch (err) { console.error("Erro ao buscar materiais:", err); }
}

async function selecionarMaterial(m) {
  materialSelecionado = m;
  materialSearch.value = `${m.codigo_produto} — ${m.descricao}`;
  materialDropdown.style.display = "none";

  const custoEmb  = Number(m.custo_fornecedor || 0);
  const qtdeEmb   = Number(m.qtde_embalagem || 0);
  const estoque   = Number(m.estoque || 0);
  const custoUnit = qtdeEmb > 0 ? custoEmb / qtdeEmb : custoEmb;
  materialSelecionado._custoUnit = custoUnit;

  const estoqueEl = document.getElementById("matEstoque");
  estoqueEl.textContent = `${estoque} ${m.unidade_medida || "un"}`;
  estoqueEl.className = estoque > 10 ? "estoque-ok" : estoque > 0 ? "estoque-warn" : "estoque-zero";

  document.getElementById("matDesc").textContent  = m.descricao;
  document.getElementById("matCod").textContent   = m.codigo_produto;
  document.getElementById("matCusto").textContent = custoUnit.toFixed(4);
  matInfo.classList.add("show");

  // Carrega pedidos disponíveis para este material
  await carregarPedidosMaterial(m.id);
}

// ══════════════════════════════════════════════════════
//  PEDIDOS POR MATERIAL
// ══════════════════════════════════════════════════════
async function carregarPedidosMaterial(materialId) {
  const section = document.getElementById("pedidosSection");
  const lista   = document.getElementById("pedidosLista");
  const semPed  = document.getElementById("semPedidos");
  pedidosSelecionados = {};
  pedidosDisponiveis = [];

  try {
    const res = await apiRequest(`/op/buscar-pedidos?material_id=${materialId}`);
    pedidosDisponiveis = res.data || [];
  } catch { pedidosDisponiveis = []; }

  section.style.display = "block";
  lista.innerHTML = "";

  if (!pedidosDisponiveis.length) {
    semPed.style.display = "block";
    lista.style.display = "none";
    return;
  }

  semPed.style.display = "none";
  lista.style.display = "flex";

  pedidosDisponiveis.forEach(p => {
    const card = document.createElement("div");
    card.className = "pedido-card";
    card.dataset.pedidoId = p.id;
    card.innerHTML = `
      <div class="pc-check">✓</div>
      <div class="pc-info">
        <div class="pc-cliente">${p.cliente || "—"}</div>
        <div class="pc-detalhe">
          PV: ${p.pedido_venda || "—"} | OC: ${p.ordem_compra || "—"}
          ${p.descricao_item ? ` | ${p.descricao_item}` : ""}
        </div>
      </div>
      <div class="pc-qtde">${p.qtde_solicitada || 0} ${materialSelecionado?.unidade_medida || "un"}</div>
      <div class="parcial-row">
        <label class="parcial-check">
          <input type="checkbox" class="chk-parcial"> Parcial
        </label>
        <input type="number" class="inp-parcial" min="0.01" step="0.01" placeholder="Qtde"
          style="display:none">
      </div>
    `;

    // Click no card = selecionar/deselecionar
    card.addEventListener("click", (e) => {
      // Ignora clicks nos inputs/checkbox
      if (e.target.closest(".parcial-row")) return;
      togglePedido(card, p);
    });

    // Checkbox parcial
    const chk = card.querySelector(".chk-parcial");
    const inp = card.querySelector(".inp-parcial");
    chk.addEventListener("change", () => {
      if (chk.checked) {
        card.classList.add("parcial");
        inp.style.display = "block";
        inp.focus();
      } else {
        card.classList.remove("parcial");
        inp.style.display = "none";
        inp.value = "";
      }
      // Atualiza estado
      if (pedidosSelecionados[p.id]) {
        pedidosSelecionados[p.id].parcial = chk.checked;
        pedidosSelecionados[p.id].qtdeParcial = chk.checked ? Number(inp.value) || 0 : 0;
      }
    });

    inp.addEventListener("input", () => {
      if (pedidosSelecionados[p.id]) {
        pedidosSelecionados[p.id].qtdeParcial = Number(inp.value) || 0;
      }
    });

    // Previne propagação do click no checkbox/input
    card.querySelector(".parcial-row").addEventListener("click", e => e.stopPropagation());

    lista.appendChild(card);
  });
}

function togglePedido(card, p) {
  if (card.classList.contains("selecionado")) {
    card.classList.remove("selecionado", "parcial");
    card.querySelector(".chk-parcial").checked = false;
    card.querySelector(".inp-parcial").style.display = "none";
    card.querySelector(".inp-parcial").value = "";
    delete pedidosSelecionados[p.id];
  } else {
    card.classList.add("selecionado");
    pedidosSelecionados[p.id] = {
      pedido: p,
      parcial: false,
      qtdeParcial: 0,
    };
  }
}

// ══════════════════════════════════════════════════════
//  ADICIONAR ITENS
// ══════════════════════════════════════════════════════
document.getElementById("btnAddItem").addEventListener("click", () => {
  if (!materialSelecionado) { showToast("Selecione um material.", "warning"); return; }

  const selecionados = Object.values(pedidosSelecionados);
  const estoque = Number(materialSelecionado.estoque || 0);
  const custoUnit = materialSelecionado._custoUnit || Number(materialSelecionado.custo_fornecedor || 0);

  // Se tem pedidos selecionados, adiciona um item por pedido
  if (selecionados.length > 0) {
    let totalQtde = 0;
    const novosItens = [];

    for (const sel of selecionados) {
      const p = sel.pedido;
      const qtde = sel.parcial && sel.qtdeParcial > 0
        ? sel.qtdeParcial
        : Number(p.qtde_solicitada || 0);

      if (qtde <= 0) {
        showToast(`Pedido ${p.cliente} — informe a quantidade parcial.`, "warning");
        return;
      }
      totalQtde += qtde;
      novosItens.push({
        material_id:    materialSelecionado.id,
        codigo_produto: materialSelecionado.codigo_produto,
        descricao:      materialSelecionado.descricao,
        unidade_medida: materialSelecionado.unidade_medida || "un",
        quantidade:     qtde,
        custo_unitario: Number(custoUnit.toFixed(4)),
        subtotal:       Number((qtde * custoUnit).toFixed(2)),
        pedido_id:      p.id,
        pedido_venda:   p.pedido_venda,
        ordem_compra:   p.ordem_compra,
        cliente:        p.cliente,
        estado:         p.estado,
        codigo_cliente: p.codigo_cliente,
        zerb:           p.zerb,
        parcial:        sel.parcial,
      });
    }

    // Verifica estoque
    const jaAdicionado = itens
      .filter(i => i.material_id === materialSelecionado.id)
      .reduce((s, i) => s + i.quantidade, 0);

    if (totalQtde + jaAdicionado > estoque) {
      showToast(`Estoque insuficiente! Disponível: ${estoque}, necessário: ${totalQtde + jaAdicionado}.`, "warning");
      return;
    }

    itens.push(...novosItens);
  } else {
    // Sem pedidos — não permite adicionar sem seleção
    showToast("Selecione pelo menos um pedido para vincular à saída.", "warning");
    return;
  }

  // Limpa
  materialSearch.value = "";
  materialSelecionado = null;
  pedidosSelecionados = {};
  pedidosDisponiveis = [];
  matInfo.classList.remove("show");
  document.getElementById("pedidosSection").style.display = "none";
  document.getElementById("pedidosLista").innerHTML = "";

  renderItens();
});

// ══════════════════════════════════════════════════════
//  RENDERIZAR TABELA
// ══════════════════════════════════════════════════════
function renderItens() {
  const tbody = document.getElementById("itensTbody");
  const wrap  = document.getElementById("tabelaWrap");
  const sem   = document.getElementById("semItens");

  if (!itens.length) {
    wrap.style.display = "none";
    sem.style.display = "block";
    document.getElementById("totalGeral").textContent = "R$ 0,00";
    atualizarResumo();
    return;
  }

  wrap.style.display = "block";
  sem.style.display = "none";
  tbody.innerHTML = "";
  let total = 0;

  itens.forEach((it, i) => {
    total += it.subtotal;
    const pedidoLabel = it.pedido_id
      ? `<span class="item-pedido-tag">${it.cliente || "—"}<br><small>OC: ${it.ordem_compra || "—"}${it.parcial ? " (parcial)" : ""}</small></span>`
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
  const materiaisDistintos = new Set(itens.map(i => i.material_id)).size;
  const pedidosVinculados  = new Set(itens.filter(i => i.pedido_id).map(i => i.pedido_id));

  document.getElementById("rsItens").textContent    = itens.length;
  document.getElementById("rsMateriais").textContent = materiaisDistintos;
  document.getElementById("rsPedidos").textContent   = pedidosVinculados.size;
  document.getElementById("rsCusto").textContent     = `R$ ${fmtMoeda(t)}`;

  const pedidosEl = document.getElementById("pedidosVinculados");
  if (pedidosVinculados.size > 0) {
    const pedidosMap = new Map();
    itens.filter(i => i.pedido_id).forEach(i => {
      if (!pedidosMap.has(i.pedido_id)) {
        pedidosMap.set(i.pedido_id, { cliente: i.cliente, ordem_compra: i.ordem_compra, itensCount: 0 });
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

  document.getElementById("btnGerar").disabled = itens.length === 0;
}

// ══════════════════════════════════════════════════════
//  GERAR SAÍDA
// ══════════════════════════════════════════════════════
document.getElementById("btnGerar").addEventListener("click", gerarSaida);

async function gerarSaida() {
  if (!itens.length) return;
  try {
    const btn = document.getElementById("btnGerar");
    btn.disabled = true;
    btn.textContent = "Processando...";

    const obs = document.getElementById("obsTexto").value;
    const res = await apiRequest("/saidas_estoque", {
      method: "POST",
      body: JSON.stringify({ usuario: user.nome, observacoes: obs, itens }),
    });

    showToast(`Saída registrada! Nº ${res.numero}`, "success");
    abrirComprovante(res.saida || res.data || res);
    carregarHistorico();

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

// ══════════════════════════════════════════════════════
//  COMPROVANTE
// ══════════════════════════════════════════════════════
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

  // Agrupa por pedido
  const porPedido = new Map();
  itensArr.forEach(it => {
    const key = it.pedido_id || "sem_vinculo";
    if (!porPedido.has(key)) {
      porPedido.set(key, { cliente: it.cliente, ordem_compra: it.ordem_compra, pedido_venda: it.pedido_venda, itens: [] });
    }
    porPedido.get(key).itens.push(it);
  });

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
                <td style="font-weight:700">R$ ${fmtMoeda(it.subtotal)}</td>
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
    <div class="comprovante" id="comprovantePrint">
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
          <p><b>Data:</b> ${fmtData(saida.data_saida || saida.criado_em)}</p>
          <p><b>Usuário:</b> ${saida.usuario || saida.criado_por_nome || "—"}</p>
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
        <span>Gerado em ${new Date().toLocaleString("pt-BR")} por ${saida.usuario || saida.criado_por_nome || "Sistema"}</span>
      </div>
    </div>
  `;

  const modal = document.getElementById("modalComprovante");
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("show"));
}

// Imprimir comprovante corretamente
document.getElementById("btnImprimirComp")?.addEventListener("click", () => {
  const conteudo = document.getElementById("comprovantePrint");
  if (!conteudo) { window.print(); return; }

  const janela = window.open("", "_blank", "width=800,height=600");
  janela.document.write(`
    <html><head><title>Comprovante de Saída</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', sans-serif; padding: 20px; color: #1e293b; }
      .comprovante { max-width: 750px; margin: 0 auto; }
      .comp-header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #1e40af; }
      .comp-empresa h3 { font-size: 18px; color: #1e40af; }
      .comp-empresa p { font-size: 11px; color: #64748b; line-height: 1.5; }
      .comp-doc { text-align: right; }
      .comp-doc .titulo { font-size: 16px; font-weight: 800; color: #1e40af; margin-bottom: 6px; }
      .comp-doc p { font-size: 12px; color: #475569; }
      .comp-section { margin-bottom: 16px; }
      .comp-section h4 { font-size: 12px; font-weight: 700; color: #1e40af; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #1e40af; color: white; padding: 6px 8px; font-size: 10px; text-align: left; text-transform: uppercase; }
      td { padding: 5px 8px; font-size: 11px; border-bottom: 1px solid #e2e8f0; }
      tfoot td { font-weight: 700; border-top: 2px solid #cbd5e1; }
      .comp-total-section { display: flex; justify-content: flex-end; gap: 12px; padding: 12px 0; margin-top: 8px; border-top: 2px solid #1e40af; }
      .comp-total-label { font-size: 14px; font-weight: 700; color: #475569; }
      .comp-total-valor { font-size: 16px; font-weight: 800; color: #1e40af; }
      .comp-obs { font-size: 11px; color: #64748b; padding: 8px; background: #f8fafc; border-radius: 6px; }
      .comp-footer { display: flex; justify-content: space-between; margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
    </style></head><body>
    ${conteudo.outerHTML}
    <script>window.onload = function() { window.print(); window.close(); }<\/script>
    </body></html>
  `);
  janela.document.close();
});

window.fecharComprovante = function() {
  const modal = document.getElementById("modalComprovante");
  modal.classList.remove("show");
  setTimeout(() => modal.classList.add("hidden"), 260);
};

// ══════════════════════════════════════════════════════
//  HISTÓRICO
// ══════════════════════════════════════════════════════
async function carregarHistorico() {
  const el = document.getElementById("historicoLista");
  try {
    const res = await apiRequest("/saidas_estoque?limit=10");
    const lista = res.data || [];
    if (!lista.length) {
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
    abrirComprovante(res.data || res.saida || res);
  } catch (err) {
    showToast("Erro ao carregar saída.", "error");
  }
};

// ── Init ──────────────────────────────────────────────
carregarHistorico();
