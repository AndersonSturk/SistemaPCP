import { apiRequest, getUser, showToast } from "./auth.js";

// ── Auth ──────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";

// ── Modo: novo ou edição ──────────────────────────────
const params    = new URLSearchParams(window.location.search);
const espelhoId = params.get("id");
const autoPrint = params.get("print") === "1";

if (espelhoId) {
  document.getElementById("modoLabel").textContent = `Editando #${espelhoId}`;
  const ht = document.querySelector(".header-text") || document.querySelector(".header-title");
  if (ht) ht.textContent = "Editar Espelho de NF";
} else {
  document.getElementById("data_doc").value = new Date().toISOString().split("T")[0];
}

// ── Mapeamento Natureza → CFOP ───────────────────────
const NATUREZA_CFOP = {
  "REMESSA PARA INDUSTRIALIZAÇÃO":                     "901",
  "REMESSA SIMBOLICA DE INDUSTRIALIZACAO":              "949",
  "DEVOLUCAO FORNECEDOR":                               "202",
  "COMPRA NAO CONTRIBUINTE":                            "102",
  "RETORNO CONSERTO S ORIGEM":                          "916",
  "DEVOLUCAO CLIENTE (EMITIR)":                         "202",
  "REMESSA CONSERTO":                                   "915",
  "PERDA, ROUBO OU DETERIORACAO":                       "927",
  "REMESSA MERCADORIA FALTANTE":                        "949",
  "OUTRAS SAIDAS CLIENTE":                              "949",
  "OUTRAS ENTRADAS FORN":                               "949",
  "OUTRAS ENTRADAS":                                    "949",
  "REMESSA BONIFICACAO":                                "910",
  "REMESSA PARA TROCA":                                 "949",
  "REMESSA PARA DEPOSITO FECHADO OU ARMAZEM GERAL":    "905",
  "COMPLEMENTO DE ICMS (CLIENTE)":                      "102",
  "EXPOSICAO EM FEIRAS":                                "914",
  "RETORNO EXPOSICAO EM FEIRA":                         "914",
};

// ── CFOP automático ao trocar natureza ───────────────
const selNatureza = document.getElementById("natureza");
const inpCfop     = document.getElementById("cfop_nf");

function atualizarCfop() {
  const cfop = NATUREZA_CFOP[selNatureza.value] || "";
  inpCfop.value = cfop;
}
selNatureza.addEventListener("change", atualizarCfop);
atualizarCfop(); // setar valor inicial

// ── Busca de Prestador (autocomplete) ────────────────
let debounceTimer = null;
const inpRazao     = document.getElementById("razao_social");
const divLista     = document.getElementById("listaPrestadores");
const inpCnpj      = document.getElementById("cnpj_forn");
const inpEmail     = document.getElementById("email_nf");

inpRazao.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const termo = inpRazao.value.trim();
  if (termo.length < 2) { divLista.style.display = "none"; return; }
  debounceTimer = setTimeout(async () => {
    try {
      const res = await apiRequest(`/prestadores/busca-nf?search=${encodeURIComponent(termo)}`);
      if (!res.data?.length) { divLista.style.display = "none"; return; }
      divLista.innerHTML = res.data.map(p => `
        <div class="autocomplete-item" data-id="${p.id}" data-nome="${p.nome}" data-cnpj="${p.cnpj || ''}" data-email="${p.email || ''}">
          <strong>${p.nome}</strong>
          <span style="color:#64748b;font-size:10px;margin-left:8px;">${p.cnpj || 'sem CNPJ'}</span>
        </div>
      `).join("");
      divLista.style.display = "block";
      divLista.querySelectorAll(".autocomplete-item").forEach(item => {
        item.addEventListener("click", () => {
          inpRazao.value = item.dataset.nome;
          inpCnpj.value  = item.dataset.cnpj || "";
          inpEmail.value = item.dataset.email || "";
          divLista.style.display = "none";
        });
      });
    } catch { divLista.style.display = "none"; }
  }, 300);
});

document.addEventListener("click", (e) => {
  if (!divLista.contains(e.target) && e.target !== inpRazao) divLista.style.display = "none";
});

// ── Formatar CNPJ automaticamente ────────────────────
document.getElementById("cnpj_forn").addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "").slice(0, 14);
  v = v
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
  e.target.value = v;
});

// ── Linhas da tabela ──────────────────────────────────
let linhaCount = 0;

function adicionarLinha(dados = {}) {
  linhaCount++;
  const tbody = document.getElementById("corpoTabela");
  const tr = document.createElement("tr");
  tr.className = "linha-material";
  tr.dataset.id = linhaCount;

  const campos = [
    { name: "cod",    placeholder: "000000",              tipo: "text"   },
    { name: "desc",   placeholder: "Descrição do produto",tipo: "text",  cls: "td-desc" },
    { name: "cst",    placeholder: "000",                 tipo: "text"   },
    { name: "cfop",   placeholder: "5901",                tipo: "text"   },
    { name: "qtd",    placeholder: "0",                   tipo: "number" },
    { name: "vunit",  placeholder: "0,0000",              tipo: "text",   cls: "td-val" },
    { name: "vtotal", placeholder: "0,00",                tipo: "text",   cls: "td-val", readonly: true },
    { name: "calc",   placeholder: "R$ -",                tipo: "text"   },
    { name: "icms",   placeholder: "R$ -",                tipo: "text"   },
    { name: "ipi",    placeholder: "R$ -",                tipo: "text"   },
    { name: "liq",    placeholder: "R$ -",                tipo: "text"   },
    { name: "alq",    placeholder: "%",                   tipo: "text"   },
    { name: "st",     placeholder: "R$ -",                tipo: "text"   },
    { name: "mva",    placeholder: "%",                   tipo: "text"   },
  ];

  let tds = campos.map(c => {
    const align = (c.name === "desc") ? "left" : "center";
    const inp = `<input type="${c.tipo}" class="inp-${c.name}"
      placeholder="${c.placeholder}" ${c.readonly ? 'readonly tabindex="-1"' : ''}
      value="${dados[c.name] !== undefined ? dados[c.name] : ''}"
      style="width:100%;border:none;background:transparent;font-size:10px;font-family:inherit;
             color:#111827;text-align:${align};padding:2px 1px;outline:none;">`;
    return `<td class="${c.cls || ""}">${inp}</td>`;
  }).join("");

  tds += `<td class="col-acao no-print" style="text-align:center">
    <button class="btn-del-row" title="Remover linha">✕</button>
  </td>`;

  tr.innerHTML = tds;
  tbody.appendChild(tr);

  const inpCod    = tr.querySelector(".inp-cod");
  const inpDesc   = tr.querySelector(".inp-desc");
  const inpQtd    = tr.querySelector(".inp-qtd");
  const inpVunit  = tr.querySelector(".inp-vunit");
  const inpVtotal = tr.querySelector(".inp-vtotal");
  const inpCfopLinha = tr.querySelector(".inp-cfop");

  // Busca material pelo código zerb ao sair do campo
  inpCod.addEventListener("blur", async () => {
    const codigo = inpCod.value.trim();
    if (!codigo) return;
    try {
      const res = await apiRequest(`/materiais/busca-codigo/${encodeURIComponent(codigo)}`);
      if (res.success && res.data) {
        inpDesc.value  = res.data.descricao || "";
        inpVunit.value = res.data.custo_fornecedor != null
          ? parseFloat(res.data.custo_fornecedor).toLocaleString("pt-BR", { minimumFractionDigits: 4 })
          : "";
        // Auto-preenche CFOP da linha com o CFOP geral
        if (!inpCfopLinha.value) inpCfopLinha.value = inpCfop.value || "";
        calcLinha();
        marcarComDados(tr);
      }
    } catch {
      // Material não encontrado — usuário pode preencher manualmente
    }
  });

  const calcLinha = () => {
    const qtd   = parseFloat(inpQtd.value) || 0;
    const vunit = parseFloat(String(inpVunit.value).replace(/\./g, "").replace(",", ".")) || 0;
    const total = qtd * vunit;
    inpVtotal.value = total > 0
      ? "R$ " + total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
      : "R$ -";
    recalcularTotais();
    marcarComDados(tr);
  };

  inpQtd.addEventListener("input", calcLinha);
  inpVunit.addEventListener("input", calcLinha);
  tr.querySelectorAll("input").forEach(i => i.addEventListener("input", () => marcarComDados(tr)));
  tr.querySelector(".btn-del-row").addEventListener("click", () => { tr.remove(); recalcularTotais(); });

  // Se vier dados pré-calculados, marca como com-dados
  if (Object.values(dados).some(v => v !== undefined && v !== "")) marcarComDados(tr);

  return tr;
}

function marcarComDados(tr) {
  const temAlgo = Array.from(tr.querySelectorAll("input"))
    .some(i => i.value.trim() !== "" && i.value !== "R$ -" && i.value !== "0");
  tr.classList.toggle("tem-dados", temAlgo);
}

function recalcularTotais() {
  let totalProdutos = 0;
  document.querySelectorAll(".linha-material").forEach(tr => {
    const vtotal = tr.querySelector(".inp-vtotal")?.value || "";
    const num = parseFloat(vtotal.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
    if (!isNaN(num) && num > 0) totalProdutos += num;
  });
  const fmt = (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  document.getElementById("totalProdutosBox").textContent = fmt(totalProdutos);
  document.getElementById("totalNotaBox").textContent     = fmt(totalProdutos);
}

// ── Coletar dados do formulário ───────────────────────
function coletarDados() {
  const val = (id) => document.getElementById(id)?.value?.trim() || "";

  const itens = Array.from(document.querySelectorAll(".linha-material")).map(tr => ({
    cod:    tr.querySelector(".inp-cod")?.value    || "",
    desc:   tr.querySelector(".inp-desc")?.value   || "",
    cst:    tr.querySelector(".inp-cst")?.value    || "",
    cfop:   tr.querySelector(".inp-cfop")?.value   || "",
    qtd:    tr.querySelector(".inp-qtd")?.value    || "",
    vunit:  tr.querySelector(".inp-vunit")?.value  || "",
    vtotal: tr.querySelector(".inp-vtotal")?.value || "",
    calc:   tr.querySelector(".inp-calc")?.value   || "",
    icms:   tr.querySelector(".inp-icms")?.value   || "",
    ipi:    tr.querySelector(".inp-ipi")?.value    || "",
    liq:    tr.querySelector(".inp-liq")?.value    || "",
    alq:    tr.querySelector(".inp-alq")?.value    || "",
    st:     tr.querySelector(".inp-st")?.value     || "",
    mva:    tr.querySelector(".inp-mva")?.value    || "",
  })).filter(it => it.desc || it.cod);

  return {
    natureza:      val("natureza"),
    cfop_nf:       val("cfop_nf"),
    outros:        val("outros"),
    razao_social:  val("razao_social"),
    cnpj_forn:     val("cnpj_forn"),
    inscricao_est: val("inscricao_est"),
    email_nf:      val("email_nf"),
    transportadora:val("transportadora"),
    cnpj_transp:   val("cnpj_transp"),
    tipo_frete:    val("tipo_frete"),
    volume:        val("volume"),
    peso:          val("peso"),
    solicitado:    val("solicitado"),
    pop:           val("pop"),
    data_doc:      val("data_doc"),
    ref_nf:        val("ref_nf"),
    observacao:    document.getElementById("observacao")?.value?.trim() || "",
    base_icms:     document.getElementById("base_icms")?.value     || "R$ -",
    valor_icms:    document.getElementById("valor_icms")?.value    || "R$ -",
    base_icms_sub: document.getElementById("base_icms_sub")?.value || "R$ -",
    valor_icms_sub:document.getElementById("valor_icms_sub")?.value|| "R$ -",
    outras_desp:   document.getElementById("outras_desp")?.value   || "R$ -",
    total_ipi:     document.getElementById("total_ipi")?.value     || "R$ -",
    total_produtos:document.getElementById("totalProdutosBox")?.textContent || "R$ 0,00",
    total_nota:    document.getElementById("totalNotaBox")?.textContent     || "R$ 0,00",
    itens,
  };
}

// ── Salvar espelho ────────────────────────────────────
async function salvarEspelho() {
  const btn = document.getElementById("btnSalvar");
  btn.disabled = true;
  btn.textContent = "Salvando...";
  try {
    const dados = coletarDados();
    if (espelhoId) {
      await apiRequest(`/espelhos_nf/${espelhoId}`, { method: "PUT", body: JSON.stringify(dados) });
      showToast("Espelho atualizado!", "success");
    } else {
      const res = await apiRequest("/espelhos_nf", { method: "POST", body: JSON.stringify(dados) });
      showToast("Espelho salvo!", "success");
      // Atualiza URL para modo edição sem recarregar
      history.replaceState({}, "", `espelho-nf.html?id=${res.id}`);
      document.getElementById("modoLabel").textContent = `Editando #${res.id}`;
    }
  } catch (e) {
    showToast(e.message || "Erro ao salvar.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Salvar";
  }
}

// ── Carregar espelho existente ────────────────────────
async function carregarEspelho(id) {
  try {
    const res = await apiRequest(`/espelhos_nf/${id}`);
    const d   = res.data;

    const set = (elId, val) => {
      const el = document.getElementById(elId);
      if (el) el.value = val || "";
    };

    // Natureza é um select — setar o valor e atualizar CFOP
    const selNat = document.getElementById("natureza");
    if (d.natureza) selNat.value = d.natureza;
    set("cfop_nf",        d.cfop_nf || NATUREZA_CFOP[d.natureza] || "");
    set("outros",         d.outros);
    set("razao_social",   d.razao_social);
    set("cnpj_forn",      d.cnpj_forn);
    set("inscricao_est",  d.inscricao_est);
    set("email_nf",       d.email_nf);
    set("transportadora", d.transportadora);
    set("cnpj_transp",    d.cnpj_transp);
    set("tipo_frete",     d.tipo_frete);
    set("volume",         d.volume);
    set("peso",           d.peso);
    set("solicitado",     d.solicitado);
    set("pop",            d.pop);
    set("data_doc",       d.data_doc ? d.data_doc.split("T")[0] : "");
    set("ref_nf",         d.ref_nf);
    set("base_icms",      d.base_icms);
    set("valor_icms",     d.valor_icms);
    set("base_icms_sub",  d.base_icms_sub);
    set("valor_icms_sub", d.valor_icms_sub);
    set("outras_desp",    d.outras_desp);
    set("total_ipi",      d.total_ipi);

    const obsEl = document.getElementById("observacao");
    if (obsEl) obsEl.value = d.observacao || "";

    if (d.total_produtos) document.getElementById("totalProdutosBox").textContent = d.total_produtos;
    if (d.total_nota)     document.getElementById("totalNotaBox").textContent     = d.total_nota;

    // Limpa linhas padrão e carrega as salvas
    document.getElementById("corpoTabela").innerHTML = "";
    linhaCount = 0;
    const itens = Array.isArray(d.itens) ? d.itens : JSON.parse(d.itens || "[]");
    if (itens.length) {
      itens.forEach(it => adicionarLinha(it));
    } else {
      for (let i = 0; i < 8; i++) adicionarLinha();
    }

    if (autoPrint) setTimeout(() => gerarPDF(), 600);

  } catch (e) {
    showToast("Erro ao carregar espelho: " + e.message, "error");
  }
}

// ── Gerar PDF ─────────────────────────────────────────
function gerarPDF() {
  const footerData = document.getElementById("footerData");
  if (footerData) footerData.textContent = "Gerado em: " + new Date().toLocaleString("pt-BR");

  const dataInput = document.getElementById("data_doc").value;
  const dataFmt   = dataInput ? new Date(dataInput + "T12:00:00").toLocaleDateString("pt-BR") : "";
  const refNF     = document.getElementById("ref_nf").value.trim();
  const tituloOriginal = document.title;
  document.title = `Espelho_NF${refNF ? "_" + refNF : ""}${dataFmt ? "_" + dataFmt.replace(/\//g, "-") : ""}`;

  const inpData  = document.getElementById("data_doc");
  const spanData = document.createElement("span");
  spanData.textContent = dataFmt;
  spanData.className   = "campo-doc";
  inpData.parentNode.replaceChild(spanData, inpData);

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      spanData.parentNode.replaceChild(inpData, spanData);
      document.title = tituloOriginal;
    }, 600);
  }, 80);
}

// ── Limpar formulário ─────────────────────────────────
function limparFormulario() {
  if (!confirm("Limpar todos os campos?")) return;
  const manter = ["transportadora", "cnpj_transp", "tipo_frete"];
  document.querySelectorAll(".campo-doc, .campo-total").forEach(el => {
    if (manter.includes(el.id)) return;
    if (el.id === "natureza") { el.value = "REMESSA PARA INDUSTRIALIZAÇÃO"; atualizarCfop(); return; }
    if (el.id === "cfop_nf")  return; // controlado pelo natureza
    if (el.id === "data_doc") { el.value = new Date().toISOString().split("T")[0]; return; }
    if (el.tagName === "TEXTAREA") { el.value = ""; return; }
    el.value = ["base_icms","valor_icms","base_icms_sub","valor_icms_sub","outras_desp","total_ipi"].includes(el.id)
      ? "R$ -" : "";
  });
  document.getElementById("corpoTabela").innerHTML = "";
  document.getElementById("totalProdutosBox").textContent = "R$ 0,00";
  document.getElementById("totalNotaBox").textContent     = "R$ 0,00";
  linhaCount = 0;
  for (let i = 0; i < 8; i++) adicionarLinha();
}

// ── Init ──────────────────────────────────────────────
if (espelhoId) {
  carregarEspelho(espelhoId);
} else {
  document.getElementById("data_doc").value = new Date().toISOString().split("T")[0];
  for (let i = 0; i < 8; i++) adicionarLinha();
}

// ── Expõe funções para o HTML ─────────────────────────
window.adicionarLinha   = adicionarLinha;
window.gerarPDF         = gerarPDF;
window.limparFormulario = limparFormulario;
window.salvarEspelho    = salvarEspelho;
