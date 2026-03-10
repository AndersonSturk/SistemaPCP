
import { apiRequest, getUser, showToast } from "./auth.js";


const user = getUser();
if (!user) window.location.href = "login.html";

if (!["admin", "pcp", "logistica"].includes(user.perfil)) {
  showToast("Você não tem permissão para acessar esta página.", "error");
  setTimeout(() => (window.location.href = "index.html"), 1500);
}

// ─── Parâmetros da URL ─────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const opId = urlParams.get("id");

if (!opId) {
  showToast("OP não identificada.", "error");
  setTimeout(() => (window.location.href = "processos.html"), 1500);
}

// ─── Carregar dados da OP ──────────────────────────────────────
async function carregarOP() {
  try {
    const res = await apiRequest(`/op/${opId}`);
    const op = res.data;

    if (!op) {
      showToast("OP não encontrada.", "error");
      return;
    }

    // Informações principais
    document.getElementById("opId").innerText = op.numero_op || op.id;

    document.getElementById("dataCriacao").innerText = op.data_criacao
      ? new Date(op.data_criacao).toLocaleString("pt-BR")
      : "—";

    document.getElementById("statusTxt").innerText = op.status;

    document.getElementById("dataFinalTxt").innerText = op.data_finalizacao
      ? new Date(op.data_finalizacao).toLocaleString("pt-BR")
      : "Em andamento";

    document.getElementById("responsavelTxt").innerText =
      op.responsavel || "—";

    document.getElementById("codigoItem").innerText =
      op.codigo_produto || "—";

    document.getElementById("descricao").innerText =
      op.descricao_material || "—";

    // Quantidade principal (usa qtde_total ou quantidade)
    const quantidade = op.qtde_total || op.quantidade || 0;

    document.getElementById("quantidade").innerText =
      `${quantidade} ${op.unidade_medida || ""}`;

    document.getElementById("custoUnitario").innerText =
      Number(op.custo_unitario || 0).toFixed(2);

    document.getElementById("custoTotal").innerText =
      Number(op.custo_total || 0).toFixed(2);

    // ─── Campos editáveis ──────────────────────────────────────
    document.getElementById("status").value = op.status || "ABERTA";
    document.getElementById("responsavel").value = op.responsavel || "";
    document.getElementById("unidadeMedida").value =
      op.unidade_medida || "";

    if (op.data_finalizacao) {
      document.getElementById("dataFinalizacao").value =
        op.data_finalizacao.split("T")[0];
    }

    // ─── Tabela de itens ───────────────────────────────────────
    document.getElementById("itensTabela").innerHTML = `
      <tr>
        <td>${op.codigo_produto || "—"}</td>
        <td>${op.descricao_material || "—"}</td>
        <td>${quantidade} ${op.unidade_medida || ""}</td>
        <td>R$ ${Number(op.custo_unitario || 0).toFixed(2)}</td>
        <td>R$ ${Number(op.custo_total || 0).toFixed(2)}</td>
      </tr>
    `;

    // Se o backend retornar pedidos vinculados
    if (op.pedidos && op.pedidos.length > 0) {
      console.log("Pedidos vinculados:", op.pedidos);
    }

    carregarLogs();
  } catch (err) {
    console.error("Erro ao carregar OP:", err);
    showToast("Erro ao carregar dados da OP.", "error");
  }
}

// ─── Logs ─────────────────────────────────────────────────────
async function carregarLogs() {
  try {
    const res = await apiRequest(`/ordens_producao/${opId}/logs`);
    const logs = res.data || [];
    const container = document.getElementById("listaLogs");
    container.innerHTML = "";

    if (logs.length === 0) {
      container.innerHTML =
        `<p style="color:#888;font-size:13px;">Nenhum log registrado.</p>`;
      return;
    }

    logs.forEach((l) => {
      container.innerHTML += `
        <div class="log-item">
          <b>${new Date(l.data).toLocaleString("pt-BR")}</b>
          <pre>${
            typeof l.depois === "string"
              ? l.depois
              : JSON.stringify(l.depois, null, 2)
          }</pre>
        </div>
      `;
    });
  } catch (err) {
    console.warn("Logs indisponíveis:", err.message);
    document.getElementById("listaLogs").innerHTML =
      `<p style="color:#888;font-size:13px;">Logs indisponíveis.</p>`;
  }
}

// ─── Salvar edição ────────────────────────────────────────────
async function salvarEdicao() {
  const status = document.getElementById("status").value;
  const responsavel = document.getElementById("responsavel").value.trim();
  const dataFinalizacao = document.getElementById("dataFinalizacao").value;
  const unidadeMedida = document
    .getElementById("unidadeMedida")
    .value.trim();

  const btnSalvar = document.querySelector(".actions button");
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    await apiRequest(`/ordens_producao/${opId}`, {
      method: "PUT",
      body: JSON.stringify({
        status,
        responsavel,
        data_finalizacao: dataFinalizacao || null,
        unidade_medida: unidadeMedida,
      }),
    });

    showToast("OP atualizada com sucesso!", "success");
    setTimeout(() => (window.location.href = "processos.html"), 1200);
  } catch (err) {
    console.error("Erro ao salvar OP:", err);
    showToast(err.message || "Erro ao salvar alterações.", "error");
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar alterações";
  }
}

window.salvarEdicao = salvarEdicao;

carregarOP();

