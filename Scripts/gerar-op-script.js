import { apiRequest, showToast } from "./auth.js";

const materialSearch  = document.getElementById("materialSearch");
const suggestions     = document.getElementById("materialSuggestions");
const materialInfo    = document.getElementById("materialInfo");
const quantidadeInput = document.getElementById("quantidade");
const totalEl         = document.getElementById("total");
const btnSubmit       = document.querySelector("button[type=submit]");

let selectedMaterial = null;
let debounceTimer    = null;
let fichaTecnica     = [];   // BOM carregada do material

// ─── Loading ─────────────────────────────────────────
function showLoading(msg = "Aguarde...") {
  let ov = document.getElementById("loadingOverlay");
  if (!ov) {
    if (!document.getElementById("pcpSpinStyle")) {
      const s = document.createElement("style");
      s.id = "pcpSpinStyle";
      s.textContent = `@keyframes pcpSpin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(s);
    }
    ov = document.createElement("div");
    ov.id = "loadingOverlay";
    ov.innerHTML = `<div id="loadingBox"><div id="loadingSpinner"></div><span id="loadingMsg"></span></div>`;
    ov.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;
      align-items:center;justify-content:center;z-index:9998;opacity:0;transition:opacity .2s`;
    ov.querySelector("#loadingBox").style.cssText = `background:#1e293b;border-radius:14px;
      padding:32px 44px;display:flex;flex-direction:column;align-items:center;gap:18px;
      box-shadow:0 8px 32px rgba(0,0,0,.4);min-width:210px;border:1px solid rgba(255,255,255,.1)`;
    ov.querySelector("#loadingSpinner").style.cssText = `width:42px;height:42px;
      border:4px solid rgba(255,255,255,.1);border-top-color:#3b82f6;border-radius:50%;
      animation:pcpSpin .7s linear infinite`;
    ov.querySelector("#loadingMsg").style.cssText = `font-size:14px;color:#f1f5f9;font-weight:500`;
    document.body.appendChild(ov);
  }
  ov.querySelector("#loadingMsg").textContent = msg;
  ov.style.display = "flex";
  requestAnimationFrame(() => (ov.style.opacity = "1"));
}
function hideLoading() {
  const ov = document.getElementById("loadingOverlay");
  if (!ov) return;
  ov.style.opacity = "0";
  setTimeout(() => (ov.style.display = "none"), 200);
}

// ─── Busca de materiais ───────────────────────────────
if (materialSearch) {
  materialSearch.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = materialSearch.value.trim();
    if (q.length < 2) { suggestions.classList.add("hidden"); return; }
    debounceTimer = setTimeout(() => buscarMateriais(q), 300);
  });
}

async function buscarMateriais(q) {
  try {
    const res  = await apiRequest(`/materiais?search=${encodeURIComponent(q)}`);
    const lista = res.data || [];
    suggestions.innerHTML = "";
    if (!lista.length) {
      suggestions.innerHTML = `<div class="suggestion-empty">Nenhum material encontrado</div>`;
      suggestions.classList.remove("hidden");
      return;
    }
    lista.forEach(m => {
      const div = document.createElement("div");
      div.className = "suggestion-item";
      div.innerText = `${m.codigo_produto} — ${m.descricao}`;
      div.addEventListener("click", () => selectMaterial(m));
      suggestions.appendChild(div);
    });
    suggestions.classList.remove("hidden");
  } catch (err) {
    showToast("Erro ao buscar materiais.", "error");
  }
}

async function selectMaterial(m) {
  selectedMaterial = m;
  suggestions.classList.add("hidden");
  materialSearch.value = `${m.codigo_produto} — ${m.descricao}`;

  if (materialInfo) {
    materialInfo.classList.remove("hidden");
    document.getElementById("matCodigo").innerText    = m.codigo_produto;
    document.getElementById("matDescricao").innerText = m.descricao;
    document.getElementById("matCusto").innerText     = Number(m.custo_fornecedor || 0).toFixed(2);

    // Unidade de medida do material
    const unSelect = document.getElementById("unidade_medida");
    if (unSelect && m.unidade_medida) unSelect.value = m.unidade_medida;
  }

  // Carrega ficha técnica
  await carregarFichaTecnica(m.id);
  updateTotal();
}

document.addEventListener("click", e => {
  if (materialSearch && suggestions &&
      !materialSearch.contains(e.target) && !suggestions.contains(e.target))
    suggestions.classList.add("hidden");
});

// ─── Ficha técnica — carrega e renderiza preview ─────
async function carregarFichaTecnica(materialId) {
  const secao = document.getElementById("insumosPreview");
  if (!secao) return;

  try {
    const res = await apiRequest(`/ficha-tecnica/${materialId}`);
    fichaTecnica = res.data || [];

    if (!fichaTecnica.length) {
      secao.innerHTML = `<p style="font-size:12px;color:var(--muted);margin:0">
        Este material não possui ficha técnica cadastrada. Os insumos podem ser adicionados manualmente na OP.</p>`;
      secao.style.display = "";
      return;
    }

    renderInsumosPreview();
    secao.style.display = "";
  } catch (_) {
    fichaTecnica = [];
  }
}

function renderInsumosPreview() {
  const secao = document.getElementById("insumosPreview");
  if (!secao) return;

  const qtde = Number(quantidadeInput?.value || 1);

  const linhas = fichaTecnica.map(it => {
    const total     = (it.quantidade_por_unidade * qtde).toFixed(4).replace(/\.?0+$/, "");
    const estoque   = Number(it.estoque_disponivel || 0);
    const totalNum  = Number(it.quantidade_por_unidade * qtde);
    const suficiente = estoque >= totalNum;
    const badge = it.insumo_material_id
      ? `<span style="font-size:10px;padding:2px 6px;border-radius:10px;background:rgba(${suficiente?"34,197,94":"239,68,68"},.15);color:${suficiente?"#4ade80":"#fca5a5"}">
           Estoque: ${estoque} ${it.unidade_medida}
         </span>`
      : `<span style="font-size:10px;color:var(--muted)">sem estoque vinculado</span>`;

    return `<tr>
      <td style="padding:7px 10px;font-size:12px;color:var(--text)">
        ${it.insumo_codigo ? `<strong>${it.insumo_codigo}</strong> — ` : ""}${it.insumo_descricao}
      </td>
      <td style="padding:7px 10px;font-size:12px;color:#93c5fd;text-align:center">${total} ${it.unidade_medida}</td>
      <td style="padding:7px 10px;text-align:center">${badge}</td>
    </tr>`;
  }).join("");

  secao.innerHTML = `
    <div style="margin-bottom:8px;font-size:11px;font-weight:700;color:var(--muted);
      text-transform:uppercase;letter-spacing:.5px">
      🔧 Insumos da ficha técnica (calculado para ${qtde} ${selectedMaterial?.unidade_medida || "un"})
    </div>
    <table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,.02);
      border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:rgba(30,64,175,.4)">
          <th style="padding:7px 10px;text-align:left;font-size:10px;color:rgba(255,255,255,.6);text-transform:uppercase">Insumo</th>
          <th style="padding:7px 10px;text-align:center;font-size:10px;color:rgba(255,255,255,.6);text-transform:uppercase">Qtde Necessária</th>
          <th style="padding:7px 10px;text-align:center;font-size:10px;color:rgba(255,255,255,.6);text-transform:uppercase">Disponível</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

// ─── Recalcula ao mudar quantidade ───────────────────
if (quantidadeInput) {
  quantidadeInput.addEventListener("input", () => {
    updateTotal();
    if (fichaTecnica.length) renderInsumosPreview();
  });
}

function updateTotal() {
  if (!selectedMaterial || !totalEl) return;
  const q     = Number(quantidadeInput.value || 0);
  const custo = Number(selectedMaterial.custo_fornecedor || 0);
  totalEl.innerText = (q * custo).toFixed(2);
}

// ─── Criar OP ─────────────────────────────────────────
const formOp = document.getElementById("formOp");

if (formOp) {
  formOp.addEventListener("submit", async e => {
    e.preventDefault();

    if (!selectedMaterial?.id) {
      showToast("Selecione um material.", "warning"); return;
    }
    const quantidade = Number(quantidadeInput.value);
    if (!quantidade || quantidade <= 0) {
      showToast("Informe uma quantidade válida.", "warning"); return;
    }
    const unidade = document.getElementById("unidade_medida")?.value;
    if (!unidade) {
      showToast("Selecione a unidade de medida.", "warning"); return;
    }

    const payload = {
      material_id:        selectedMaterial.id,
      codigo_produto:     selectedMaterial.codigo_produto,
      descricao_material: selectedMaterial.descricao,
      quantidade,
      unidade_medida:     unidade,
      custo_unitario:     Number(selectedMaterial.custo_fornecedor || 0),
      custo_total:        quantidade * Number(selectedMaterial.custo_fornecedor || 0),
      status:             "ABERTA",
    };

    btnSubmit.disabled = true;
    showLoading("Criando Ordem de Produção...");

    try {
      const data = await apiRequest("/ordens_producao", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const opId = data.id;

      // Salva insumos da ficha técnica automaticamente na op_insumos
      if (fichaTecnica.length && opId) {
        const insumosParaSalvar = fichaTecnica.map(it => ({
          material_id:    it.insumo_material_id || null,
          codigo_produto: it.insumo_codigo || null,
          descricao:      it.insumo_descricao,
          unidade_medida: it.unidade_medida,
          quantidade:     Number((it.quantidade_por_unidade * quantidade).toFixed(4)),
          custo_unitario: Number(it.custo_unit || 0),
          subtotal:       Number(((it.quantidade_por_unidade * quantidade) * Number(it.custo_unit || 0)).toFixed(2)),
        }));

        await apiRequest(`/ordens_producao/${opId}/insumos`, {
          method: "POST",
          body: JSON.stringify({ insumos: insumosParaSalvar }),
        });
      }

      hideLoading();
      showToast(`OP #${data.numero_op} criada com ${fichaTecnica.length} insumo(s) carregados!`, "success");
      setTimeout(() => (window.location.href = "processos.html"), 1400);
    } catch (err) {
      hideLoading();
      showToast(err.message || "Erro ao criar OP.", "error");
      btnSubmit.disabled = false;
    }
  });
}