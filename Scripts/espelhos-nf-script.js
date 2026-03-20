import { apiRequest, getUser, showToast } from "./auth.js";

const user = getUser();
if (!user) window.location.href = "login.html";

let todos = [];
let debounce = null;

// ── Carregar lista ─────────────────────────────────────
async function carregar(search = "") {
  const area = document.getElementById("listaArea");
  try {
    const url = search ? `/espelhos_nf?search=${encodeURIComponent(search)}` : "/espelhos_nf";
    const res  = await apiRequest(url);
    todos = res.data || [];
    renderTabela(todos);
  } catch (e) {
    area.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">${e.message}</div></div>`;
  }
}

// ── Renderizar tabela ──────────────────────────────────
function renderTabela(lista) {
  const area  = document.getElementById("listaArea");
  const badge = document.getElementById("countBadge");
  badge.textContent = `${lista.length} espelho(s)`;

  if (!lista.length) {
    area.innerHTML = `<div class="empty">
      <div class="empty-ico">📋</div>
      <div class="empty-txt">Nenhum espelho encontrado.<br>Clique em <strong>＋ Novo Espelho</strong> para criar.</div>
    </div>`;
    return;
  }

  const fmtData  = (v) => v ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  const fmtHora  = (v) => v ? new Date(v).toLocaleDateString("pt-BR") : "—";

  const linhas = lista.map(e => `
    <tr>
      <td class="td-mono">#${e.id}</td>
      <td><strong>${e.razao_social || "—"}</strong></td>
      <td class="td-muted">${e.cnpj_forn || "—"}</td>
      <td class="td-muted">${e.cfop_nf || "—"}</td>
      <td class="td-muted">${e.ref_nf || "—"}</td>
      <td class="td-muted">${fmtData(e.data_doc)}</td>
      <td class="td-valor">${e.total_nota || "—"}</td>
      <td class="td-muted">${e.criado_por_nome || "—"}<br><span style="font-size:10px">${fmtHora(e.criado_em)}</span></td>
      <td>
        <div class="acoes">
          <button class="btn-act btn-emit" data-id="${e.id}" title="Emitir / Imprimir">📄 Emitir</button>
          <button class="btn-act btn-edit" data-id="${e.id}" title="Editar">✏️ Editar</button>
          <button class="btn-act btn-del"  data-id="${e.id}" title="Excluir">🗑️</button>
        </div>
      </td>
    </tr>`).join("");

  area.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Fornecedor</th>
          <th>CNPJ</th>
          <th>CFOP</th>
          <th>Ref. NF</th>
          <th>Data Doc.</th>
          <th>Total Nota</th>
          <th>Criado por</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;

  // Eventos
  area.querySelectorAll(".btn-emit").forEach(btn =>
    btn.addEventListener("click", () => emitir(btn.dataset.id))
  );
  area.querySelectorAll(".btn-edit").forEach(btn =>
    btn.addEventListener("click", () => window.location.href = `espelho-nf.html?id=${btn.dataset.id}`)
  );
  area.querySelectorAll(".btn-del").forEach(btn =>
    btn.addEventListener("click", () => excluir(btn.dataset.id))
  );
}

// ── Emitir (abre em nova aba e imprime) ───────────────
function emitir(id) {
  const aba = window.open(`espelho-nf.html?id=${id}&print=1`, "_blank");
  if (!aba) showToast("Permita pop-ups para imprimir.", "warning");
}

// ── Excluir ───────────────────────────────────────────
async function excluir(id) {
  if (!confirm("Excluir este espelho de NF? Esta ação não pode ser desfeita.")) return;
  try {
    await apiRequest(`/espelhos_nf/${id}`, { method: "DELETE" });
    showToast("Espelho excluído.", "success");
    carregar(document.getElementById("buscaInput").value.trim());
  } catch (e) {
    showToast(e.message || "Erro ao excluir.", "error");
  }
}

// ── Busca com debounce ────────────────────────────────
document.getElementById("buscaInput").addEventListener("input", (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => carregar(e.target.value.trim()), 350);
});

// ── Init ──────────────────────────────────────────────
carregar();
