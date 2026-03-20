import { apiRequest, getUser, logout, showToast } from "./auth.js";

// ─── Autenticação ─────────────────────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";

// Só admin pode acessar
if (user.perfil !== "admin") {
  showToast("Acesso restrito a administradores.", "error");
  setTimeout(() => (window.location.href = "index.html"), 1200);
}

const userInfo = document.getElementById("userInfo");
if (userInfo) userInfo.innerText = `Olá, ${user.nome}`;

// ─── Elementos ────────────────────────────────────────────────────────────────
const tabelaUsuarios = document.getElementById("tabelaUsuarios");
const modalUsuario   = document.getElementById("modalUsuario");
const buscaUsuario   = document.getElementById("buscaUsuario");
let editandoId       = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  carregarUsuarios();

  document.getElementById("btnNovoUsuario").addEventListener("click", () => {
    limparModal();
    editandoId = null;
    document.getElementById("modalTitle").textContent = "Novo Usuário";
    document.getElementById("senhaHint").textContent = "(obrigatória)";
    abrirModal();
  });

  document.getElementById("btnSalvarUsuario").addEventListener("click", salvarUsuario);

  let debounce = null;
  buscaUsuario.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => carregarUsuarios(), 300);
  });
});

// ─── Carregar usuários ────────────────────────────────────────────────────────
async function carregarUsuarios() {
  tabelaUsuarios.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#888;padding:24px">Carregando...</td></tr>`;

  try {
    const res = await apiRequest("/usuarios");
    let usuarios = res.data || [];

    const busca = (buscaUsuario.value || "").toLowerCase().trim();
    if (busca) {
      usuarios = usuarios.filter(u =>
        u.nome.toLowerCase().includes(busca) || u.email.toLowerCase().includes(busca)
      );
    }

    tabelaUsuarios.innerHTML = "";

    if (usuarios.length === 0) {
      tabelaUsuarios.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#888;padding:24px">Nenhum usuário encontrado.</td></tr>`;
      return;
    }

    usuarios.forEach((u) => {
      const tr = document.createElement("tr");
      const perfilBadge = {
        admin: "badge-danger",
        pcp: "badge-info",
        producao: "badge-warning",
        logistica: "badge-success",
        vendas: "badge-default",
      };
      const perfilLabel = {
        admin: "Admin", pcp: "PCP", producao: "Produção",
        logistica: "Logística", vendas: "Vendas",
      };

      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${u.nome}</td>
        <td>${u.email}</td>
        <td><span class="badge ${perfilBadge[u.perfil] || "badge-default"}">${perfilLabel[u.perfil] || u.perfil}</span></td>
        <td><span class="badge ${u.ativo ? "badge-success" : "badge-default"}">${u.ativo ? "Ativo" : "Inativo"}</span></td>
        <td>
          <button class="btn btn-primary btn-sm btn-editar">Editar</button>
          <button class="btn btn-danger btn-sm btn-excluir">Excluir</button>
        </td>
      `;

      tr.querySelector(".btn-editar").addEventListener("click", () => editarUsuario(u));
      tr.querySelector(".btn-excluir").addEventListener("click", () => excluirUsuario(u));
      tabelaUsuarios.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar usuários:", err);
    tabelaUsuarios.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#e74c3c;padding:24px">Erro ao carregar dados.</td></tr>`;
  }
}

// ─── Editar ───────────────────────────────────────────────────────────────────
function editarUsuario(u) {
  editandoId = u.id;
  document.getElementById("userId").value    = u.id;
  document.getElementById("userNome").value  = u.nome;
  document.getElementById("userEmail").value = u.email;
  document.getElementById("userPerfil").value = u.perfil;
  document.getElementById("userAtivo").value  = u.ativo ? "1" : "0";
  document.getElementById("userSenha").value  = "";

  document.getElementById("modalTitle").textContent = "Editar Usuário";
  document.getElementById("senhaHint").textContent = "(deixe vazio para manter a atual)";
  abrirModal();
}

// ─── Salvar ───────────────────────────────────────────────────────────────────
async function salvarUsuario() {
  const nome   = document.getElementById("userNome").value.trim();
  const email  = document.getElementById("userEmail").value.trim();
  const perfil = document.getElementById("userPerfil").value;
  const ativo  = Number(document.getElementById("userAtivo").value);
  const senha  = document.getElementById("userSenha").value;

  if (!nome || !email) {
    showToast("Nome e email são obrigatórios.", "warning");
    return;
  }

  if (!editandoId && (!senha || senha.length < 4)) {
    showToast("Senha obrigatória (mínimo 4 caracteres).", "warning");
    return;
  }

  const payload = { nome, email, perfil, ativo };
  if (senha) payload.senha = senha;

  const btn = document.getElementById("btnSalvarUsuario");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  try {
    if (editandoId) {
      await apiRequest(`/usuarios/${editandoId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast("Usuário atualizado!", "success");
    } else {
      await apiRequest("/usuarios", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Usuário criado!", "success");
    }
    fecharModal();
    carregarUsuarios();
  } catch (err) {
    showToast(err.message || "Erro ao salvar.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Salvar Usuário";
  }
}

// ─── Excluir ──────────────────────────────────────────────────────────────────
async function excluirUsuario(u) {
  if (u.id === user.id) {
    showToast("Você não pode excluir seu próprio usuário.", "warning");
    return;
  }
  if (!confirm(`Excluir o usuário "${u.nome}" (${u.email})? Esta ação não pode ser desfeita.`)) return;

  try {
    await apiRequest(`/usuarios/${u.id}`, { method: "DELETE" });
    showToast("Usuário excluído!", "success");
    carregarUsuarios();
  } catch (err) {
    showToast(err.message || "Erro ao excluir.", "error");
  }
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function abrirModal() {
  modalUsuario.classList.remove("hidden");
  requestAnimationFrame(() => modalUsuario.classList.add("show"));
}

function fecharModal() {
  modalUsuario.classList.remove("show");
  setTimeout(() => modalUsuario.classList.add("hidden"), 300);
}

function limparModal() {
  document.getElementById("userId").value    = "";
  document.getElementById("userNome").value  = "";
  document.getElementById("userEmail").value = "";
  document.getElementById("userPerfil").value = "pcp";
  document.getElementById("userAtivo").value  = "1";
  document.getElementById("userSenha").value  = "";
}

// ─── Expor ────────────────────────────────────────────────────────────────────
window.fecharModal = fecharModal;