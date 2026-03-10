import { apiRequest, getUser, logout, showToast } from "./auth.js";

// ── Auth ───────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";

const elUser = document.getElementById("userInfo");
if (elUser) elUser.textContent = user.nome || user.usuario || "";
document.getElementById("btnLogout")?.addEventListener("click", logout);

// ── Estado ────────────────────────────────────────────
let page       = 1;
const limit    = 100;
let totalPages = 1;
let debTimer   = null;
let ftItens    = [];          // itens da ficha técnica em memória
let ftDebTimer = null;
let materialEditandoId = null;

// ── Elementos ─────────────────────────────────────────
const tabela       = document.getElementById("tabelaMateriais");
const busca        = document.getElementById("buscaProduto");
const modal        = document.getElementById("modalOverlay");
const btnAdicionar = document.getElementById("btnAdicionar");
const btnFechar    = document.getElementById("btnFechar");
const btnCancelar  = document.getElementById("btnCancelar");
const btnSalvar    = document.getElementById("btnSalvar");
const btnAnterior  = document.getElementById("btnAnterior");
const btnProximo   = document.getElementById("btnProximo");
const pageInfo     = document.getElementById("pageInfo");

// ── Tabs do modal ─────────────────────────────────────
document.querySelectorAll(".modal-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".modal-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("pane" + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1))
      ?.classList.add("active");
  });
});

// ── Modal: abrir/fechar ───────────────────────────────
function abrirModal(titulo = "Novo Material") {
  document.getElementById("modalTitle").textContent = titulo;
  // volta para a aba Dados
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
  resetForm();
}

btnFechar.addEventListener("click", fecharModal);
btnCancelar.addEventListener("click", fecharModal);
modal.addEventListener("click", e => { if (e.target === modal) fecharModal(); });

function resetForm() {
  document.getElementById("materialId").value = "";
  document.getElementById("codigo_produto").value = "";
  document.getElementById("descricao").value = "";
  document.getElementById("unidade_medida").value = "un";
  document.getElementById("estoque").value = "0";
  document.getElementById("custo_fornecedor").value = "0";
  materialEditandoId = null;
  ftItens = [];
  renderFtList();
  document.getElementById("ftBusca").value = "";
  document.getElementById("ftAddForm").classList.add("hidden");
  document.getElementById("ftSuggestions").classList.add("hidden");
}

// ── Tabela de materiais ───────────────────────────────
async function renderTabela(filtro = "") {
  tabela.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:28px">Carregando...</td></tr>`;
  try {
    const res = await apiRequest(`/materiais?page=${page}&limit=${limit}&search=${encodeURIComponent(filtro)}`);
    totalPages = res.pagination.totalPages;
    const lista = res.data || [];

    if (!lista.length) {
      tabela.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:28px">Nenhum material encontrado.</td></tr>`;
    } else {
      const podeEditar = ["admin","pcp","logistica"].includes(user.perfil);
      tabela.innerHTML = lista.map(m => `
        <tr>
          <td><strong style="color:var(--text)">${m.codigo_produto}</strong></td>
          <td>${m.descricao}</td>
          <td><span class="badge-un">${m.unidade_medida || "un"}</span></td>
          <td>${Number(m.estoque || 0).toLocaleString("pt-BR", {maximumFractionDigits:2})}</td>
          <td>R$ ${Number(m.custo_fornecedor || 0).toFixed(2)}</td>
          <td>
            <span class="badge-bom" onclick="abrirFichaTecnica(${m.id})" title="Ver/editar ficha técnica">
              🔧 Ficha
            </span>
          </td>
          <td>
            <div class="td-actions">
              ${podeEditar
                ? `<button class="btn btn-editar" onclick="editarMaterial(${m.id})">Editar</button>
                   <button class="btn btn-danger" onclick="excluirMaterial(${m.id})">Excluir</button>`
                : "—"}
            </div>
          </td>
        </tr>`).join("");
    }

    pageInfo.textContent  = `Página ${page} / ${totalPages}`;
    btnAnterior.disabled  = page <= 1;
    btnProximo.disabled   = page >= totalPages;
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar materiais.", "error");
    tabela.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:28px">Erro ao carregar dados.</td></tr>`;
  }
}

busca.addEventListener("input", () => {
  clearTimeout(debTimer);
  debTimer = setTimeout(() => { page = 1; renderTabela(busca.value); }, 350);
});
btnAnterior.addEventListener("click", () => { if (page > 1) { page--; renderTabela(busca.value); } });
btnProximo.addEventListener("click",  () => { if (page < totalPages) { page++; renderTabela(busca.value); } });

// ── Abrir para novo ───────────────────────────────────
btnAdicionar.addEventListener("click", () => {
  resetForm();
  abrirModal("Novo Material");
});

// ── Editar material ───────────────────────────────────
window.editarMaterial = async (id) => {
  try {
    const res = await apiRequest(`/materiais/${id}`);
    const m   = res.data;
    materialEditandoId = id;
    document.getElementById("materialId").value         = id;
    document.getElementById("codigo_produto").value     = m.codigo_produto;
    document.getElementById("descricao").value          = m.descricao;
    document.getElementById("unidade_medida").value     = m.unidade_medida || "un";
    document.getElementById("estoque").value            = m.estoque;
    document.getElementById("custo_fornecedor").value   = m.custo_fornecedor;

    // Carrega ficha técnica existente
    await carregarFt(id);
    abrirModal("Editar Material");
  } catch (err) {
    showToast("Erro ao carregar material.", "error");
  }
};

// ── Abrir ficha técnica de material existente direto ─
window.abrirFichaTecnica = async (id) => {
  try {
    const res = await apiRequest(`/materiais/${id}`);
    const m   = res.data;
    materialEditandoId = id;
    document.getElementById("materialId").value         = id;
    document.getElementById("codigo_produto").value     = m.codigo_produto;
    document.getElementById("descricao").value          = m.descricao;
    document.getElementById("unidade_medida").value     = m.unidade_medida || "un";
    document.getElementById("estoque").value            = m.estoque;
    document.getElementById("custo_fornecedor").value   = m.custo_fornecedor;
    await carregarFt(id);
    abrirModal("Ficha Técnica — " + m.codigo_produto);
    // Vai direto para a aba FT
    document.querySelectorAll(".modal-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    document.querySelector("[data-tab='ft']").classList.add("active");
    document.getElementById("paneFt").classList.add("active");
  } catch (err) {
    showToast("Erro ao abrir ficha técnica.", "error");
  }
};

// ── Salvar material + ficha técnica ──────────────────
btnSalvar.addEventListener("click", async () => {
  const id     = document.getElementById("materialId").value;
  const codigo = document.getElementById("codigo_produto").value.trim();
  const descr  = document.getElementById("descricao").value.trim();

  if (!codigo || !descr) {
    showToast("Preencha o código e a descrição.", "warning");
    // volta para aba dados
    document.querySelectorAll(".modal-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    document.querySelector("[data-tab='dados']").classList.add("active");
    document.getElementById("paneDados").classList.add("active");
    return;
  }

  const payload = {
    codigo_produto:   codigo,
    descricao:        descr,
    unidade_medida:   document.getElementById("unidade_medida").value,
    estoque:          Number(document.getElementById("estoque").value),
    custo_fornecedor: Number(document.getElementById("custo_fornecedor").value),
  };

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    let matId = id;
    if (id) {
      await apiRequest(`/materiais/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      const res = await apiRequest("/materiais", { method: "POST", body: JSON.stringify(payload) });
      matId = res.id;
    }

    // Salva ficha técnica
    if (ftItens.length > 0 || materialEditandoId) {
      await apiRequest(`/ficha-tecnica/${matId}`, {
        method: "POST",
        body: JSON.stringify({ itens: ftItens }),
      });
    }

    showToast(id ? "Material atualizado!" : "Material cadastrado!", "success");
    fecharModal();
    renderTabela(busca.value);
  } catch (err) {
    console.error(err);
    showToast(err.message || "Erro ao salvar.", "error");
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar Material";
  }
});

// ── Excluir material ──────────────────────────────────
window.excluirMaterial = async (id) => {
  if (!confirm("Excluir este material?")) return;
  try {
    await apiRequest(`/materiais/${id}`, { method: "DELETE" });
    showToast("Material excluído.", "success");
    renderTabela(busca.value);
  } catch (err) {
    showToast(err.message || "Erro ao excluir.", "error");
  }
};

// ══════════════════════════════════════════════════════
//  FICHA TÉCNICA
// ══════════════════════════════════════════════════════

async function carregarFt(materialId) {
  try {
    const res = await apiRequest(`/ficha-tecnica/${materialId}`);
    ftItens = (res.data || []).map(r => ({
      insumo_material_id:    r.insumo_material_id || null,
      insumo_codigo:         r.insumo_codigo || "",
      insumo_descricao:      r.insumo_descricao,
      quantidade_por_unidade:Number(r.quantidade_por_unidade),
      unidade_medida:        r.unidade_medida,
    }));
    renderFtList();
  } catch (_) {
    ftItens = [];
    renderFtList();
  }
}

function renderFtList() {
  const container = document.getElementById("ftList");

  if (!ftItens.length) {
    container.innerHTML = `<div class="ft-empty" id="ftEmpty">Nenhum insumo na ficha técnica. Busque ou adicione manualmente.</div>`;
    return;
  }

  container.innerHTML = ftItens.map((it, idx) => `
    <div class="ft-item" data-idx="${idx}">
      <div class="ft-item-name">
        ${it.insumo_codigo ? `<strong>${it.insumo_codigo}</strong> — ` : ""}${it.insumo_descricao}
        ${it.insumo_material_id ? `<span>Material cadastrado</span>` : `<span>Insumo manual</span>`}
      </div>
      <div class="ft-item-qty">
        <input type="number" value="${it.quantidade_por_unidade}" min="0.0001" step="any"
          onchange="ftAlterarQtde(${idx}, this.value)">
      </div>
      <div class="ft-item-un">
        <select onchange="ftAlterarUn(${idx}, this.value)">
          ${["un","pc","kg","g","m","m2","l","ml","cx","rolo"].map(u =>
            `<option value="${u}" ${it.unidade_medida===u?"selected":""}>${u}</option>`
          ).join("")}
        </select>
      </div>
      <button class="ft-item-del" onclick="ftRemover(${idx})">✕</button>
    </div>`).join("");
}

window.ftAlterarQtde = (idx, val) => { ftItens[idx].quantidade_por_unidade = Number(val) || 1; };
window.ftAlterarUn   = (idx, val) => { ftItens[idx].unidade_medida = val; };
window.ftRemover     = (idx) => { ftItens.splice(idx, 1); renderFtList(); };

// Busca de insumos na ficha técnica
const ftBusca       = document.getElementById("ftBusca");
const ftSuggestions = document.getElementById("ftSuggestions");

ftBusca.addEventListener("input", () => {
  clearTimeout(ftDebTimer);
  const q = ftBusca.value.trim();
  if (q.length < 2) { ftSuggestions.classList.add("hidden"); return; }
  ftDebTimer = setTimeout(() => buscarInsumos(q), 300);
});

async function buscarInsumos(q) {
  try {
    const res  = await apiRequest(`/materiais?search=${encodeURIComponent(q)}&limit=20`);
    const lista = res.data || [];
    ftSuggestions.innerHTML = "";
    if (!lista.length) {
      ftSuggestions.innerHTML = `<div class="ft-sugg-item" style="color:var(--muted)">Nenhum material encontrado</div>`;
    } else {
      lista.forEach(m => {
        const div = document.createElement("div");
        div.className = "ft-sugg-item";
        div.textContent = `${m.codigo_produto} — ${m.descricao}`;
        div.addEventListener("click", () => {
          ftAdicionarDeMaterial(m);
          ftBusca.value = "";
          ftSuggestions.classList.add("hidden");
        });
        ftSuggestions.appendChild(div);
      });
    }
    ftSuggestions.classList.remove("hidden");
  } catch (_) {}
}

function ftAdicionarDeMaterial(m) {
  // Evita duplicata
  if (ftItens.find(it => it.insumo_material_id === m.id)) {
    showToast("Este insumo já está na ficha técnica.", "warning");
    return;
  }
  ftItens.push({
    insumo_material_id:    m.id,
    insumo_codigo:         m.codigo_produto,
    insumo_descricao:      m.descricao,
    quantidade_por_unidade:1,
    unidade_medida:        m.unidade_medida || "un",
  });
  renderFtList();
}

document.addEventListener("click", e => {
  if (!ftBusca.contains(e.target) && !ftSuggestions.contains(e.target))
    ftSuggestions.classList.add("hidden");
});

// Modo manual
const btnFtManual    = document.getElementById("btnFtManual");
const ftAddForm      = document.getElementById("ftAddForm");
const btnFtAddManual = document.getElementById("btnFtAddManual");

btnFtManual.addEventListener("click", () => {
  ftAddForm.classList.toggle("hidden");
  if (!ftAddForm.classList.contains("hidden"))
    document.getElementById("ftNovoDesc").focus();
});

btnFtAddManual.addEventListener("click", () => {
  const desc = document.getElementById("ftNovoDesc").value.trim();
  const qtde = Number(document.getElementById("ftNovoQtde").value) || 1;
  const un   = document.getElementById("ftNovoUn").value;
  if (!desc) { showToast("Informe a descrição do insumo.", "warning"); return; }
  ftItens.push({
    insumo_material_id:    null,
    insumo_codigo:         "",
    insumo_descricao:      desc,
    quantidade_por_unidade:qtde,
    unidade_medida:        un,
  });
  renderFtList();
  document.getElementById("ftNovoDesc").value = "";
  document.getElementById("ftNovoQtde").value = "1";
  ftAddForm.classList.add("hidden");
});

// ── Init ─────────────────────────────────────────────
renderTabela();