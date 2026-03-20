import { apiRequest, getUser, showToast } from "./auth.js";

// ── Auth ──────────────────────────────────────────────
const user = getUser();
if (!user) window.location.href = "login.html";

// ── User info no header ───────────────────────────────
const userInfoEl = document.getElementById("userInfo");
if (userInfoEl && user) userInfoEl.textContent = user.nome || "";

// ── Elementos ─────────────────────────────────────────
const dropZone        = document.getElementById("dropZone");
const inputXML        = document.getElementById("inputXML");
const nfCard          = document.getElementById("nfCard");
const nfTitulo        = document.getElementById("nfTitulo");
const nfSubtitulo     = document.getElementById("nfSubtitulo");
const nfGrid          = document.getElementById("nfGrid");
const tabelaCard      = document.getElementById("tabelaCard");
const corpoTabela     = document.getElementById("corpoTabela");
const btnConfirmar    = document.getElementById("btnConfirmar");
const btnLimpar       = document.getElementById("btnLimpar");
const resultadoCard   = document.getElementById("resultadoCard");
const resultadoResumo = document.getElementById("resultadoResumo");

let dadosNF = null;

// ── Drop zone ─────────────────────────────────────────
dropZone.addEventListener("click", () => inputXML.click());
inputXML.addEventListener("change", (e) => {
  if (e.target.files.length) processarArquivo(e.target.files[0]);
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) processarArquivo(e.dataTransfer.files[0]);
});

// ── Ler arquivo XML ou PDF ────────────────────────────
function processarArquivo(file) {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".xml")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try { parsearXML(e.target.result); }
      catch (err) { showToast("Erro ao ler XML: " + err.message, "error"); }
    };
    reader.readAsText(file);
  } else if (nome.endsWith(".pdf")) {
    processarPDF(file);
  } else {
    showToast("Selecione um arquivo XML ou PDF.", "error");
  }
}

// ── Processar PDF (DANFE) ────────────────────────────
async function processarPDF(file) {
  if (!window.pdfjsLib) {
    showToast("Biblioteca PDF não carregou. Verifique sua conexão.", "error");
    return;
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let textoCompleto = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const linhas = [];
      let lastY = null;
      for (const item of content.items) {
        const y = Math.round(item.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 3) linhas.push("\n");
        linhas.push(item.str);
        lastY = y;
      }
      textoCompleto += linhas.join(" ") + "\n";
    }
    parsearPDFTexto(textoCompleto);
  } catch (err) {
    console.error("Erro ao ler PDF:", err);
    showToast("Erro ao ler PDF: " + err.message, "error");
  }
}

// ── Parser do texto extraído do PDF (DANFE) ──────────
function parsearPDFTexto(texto) {
  // Normaliza espaços
  const t = texto.replace(/\r/g, "");

  // ── NF number e serie ──
  const mNF = t.match(/N[°º.]?\s*\.?\s*([\d.]+)/i);
  let numero_nf = "";
  if (mNF) numero_nf = mNF[1].replace(/\./g, "").replace(/^0+/, "") || mNF[1].replace(/\./g, "");
  // Fallback: procura "Nº. 000.000.144" pattern
  const mNF2 = t.match(/N[°º]\.\s*([\d.]+)/);
  if (mNF2 && !numero_nf) numero_nf = mNF2[1].replace(/\./g, "");

  const mSerie = t.match(/S[ée]rie\s+(\d+)/i);
  const serie = mSerie ? mSerie[1] : "";

  // ── Chave de acesso ──
  const mChave = t.match(/(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/);
  const chave_nfe = mChave ? mChave[1].replace(/\s/g, "") : "";

  // ── Natureza da operação ──
  const mNat = t.match(/NATUREZA DA OPERA[ÇC][ÃA]O\s*\n?\s*(.+?)(?:\n|PROTOCOLO)/i);
  const natureza_op = mNat ? mNat[1].trim() : "";

  // ── Emitente ──
  // O bloco do emitente fica ANTES de "DESTINATÁRIO"
  // Estratégia: extrair tudo entre "IDENTIFICAÇÃO DO EMITENTE" e "DESTINATÁRIO"
  let emit_nome = "";
  let emit_cnpj = "";
  const blocoEmitMatch = t.match(/IDENTIFICA[ÇC][ÃA]O DO EMITENTE([\s\S]*?)DESTINAT/i);
  const blocoEmitTexto = blocoEmitMatch ? blocoEmitMatch[1] : t.substring(0, t.search(/DESTINAT/i) || 500);

  // Nome do emitente: primeira linha que parece nome (texto com mais de 5 chars, sem ser label)
  const linhasEmit = blocoEmitTexto.split("\n").map(l => l.trim()).filter(l => l.length > 5);
  for (const linha of linhasEmit) {
    // Ignora labels, números puros, e palavras-chave do DANFE
    if (/^(DANFE|DOCUMENTO|N[°º]|S[ée]rie|Folha|Consulta|CHAVE|PROTOCOLO|INSCRI|NATUREZA|0\s*-|1\s*-|ENTRADA|SA[IÍ]DA|\d+$)/i.test(linha)) continue;
    if (/^[\d.\-\/\s]+$/.test(linha)) continue;
    if (/www\.|\.gov\.|\.com\./i.test(linha)) continue;
    // Candidato a nome: tem letras e mais de 5 chars
    if (/[A-Za-zÀ-ú]{3,}/.test(linha) && linha.length > 5) {
      emit_nome = linha;
      break;
    }
  }

  // CNPJ do emitente: o CNPJ que aparece no bloco do emitente (antes do destinatário)
  const cnpjsEmit = [...blocoEmitTexto.matchAll(/(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[\-\s]?\d{2})/g)]
    .map(m => m[1].replace(/[\.\-\/\s]/g, ""))
    .filter(c => c.length === 14);
  if (cnpjsEmit.length) emit_cnpj = cnpjsEmit[cnpjsEmit.length - 1];

  // ── Destinatário ──
  // O bloco do destinatário fica APÓS "DESTINATÁRIO/REMETENTE"
  let dest_nome = "";
  let dest_cnpj = "";
  const blocoDestMatch = t.match(/DESTINAT[ÁA]RIO\s*\/?\s*REMETENTE([\s\S]*?)(?:PAGAMENTO|C[ÁA]LCULO DO IMPOSTO|TRANSPORTADOR)/i);
  const blocoDestTexto = blocoDestMatch ? blocoDestMatch[1] : "";

  if (blocoDestTexto) {
    // Nome: primeira linha significativa no bloco
    const linhasDest = blocoDestTexto.split("\n").map(l => l.trim()).filter(l => l.length > 5);
    for (const linha of linhasDest) {
      if (/^(NOME|CNPJ|CPF|ENDERE|BAIRRO|MUNIC|CEP|UF|FONE|INSCRI|DATA|HORA)/i.test(linha)) continue;
      if (/^[\d.\-\/\s]+$/.test(linha)) continue;
      if (/[A-Za-zÀ-ú]{3,}/.test(linha) && linha.length > 5) {
        dest_nome = linha;
        break;
      }
    }
    // CNPJ do destinatário
    const cnpjsDest = [...blocoDestTexto.matchAll(/(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[\-\s]?\d{2})/g)]
      .map(m => m[1].replace(/[\.\-\/\s]/g, ""))
      .filter(c => c.length === 14);
    if (cnpjsDest.length) dest_cnpj = cnpjsDest[0];
  }

  // ── Valor total ──
  const mValTotal = t.match(/V\.\s*TOTAL\s*DA\s*NOTA\s*\n?\s*([\d.,]+)/i);
  let valor_total = 0;
  if (mValTotal) valor_total = parseFloat(mValTotal[1].replace(/\./g, "").replace(",", "."));
  // Fallback
  if (!valor_total) {
    const mVT2 = t.match(/TOTAL\s*(?:DA\s*NOTA|PRODUTOS)\s*\n?\s*([\d.,]+)/i);
    if (mVT2) valor_total = parseFloat(mVT2[1].replace(/\./g, "").replace(",", "."));
  }

  const mValProd = t.match(/V\.\s*TOTAL\s*PRODUTOS\s*\n?\s*([\d.,]+)/i);
  let valor_produtos = 0;
  if (mValProd) valor_produtos = parseFloat(mValProd[1].replace(/\./g, "").replace(",", "."));

  // ── Itens (DADOS DOS PRODUTOS) ──
  const itens = extrairItensPDF(t);

  if (!itens.length) {
    showToast("Nenhum item encontrado no PDF.", "error");
    return;
  }

  console.log("[PDF Parser]", { emit_nome, emit_cnpj, dest_nome, dest_cnpj, numero_nf, serie });

  const nf = {
    chave_nfe,
    numero_nf,
    serie,
    natureza_op,
    data_emissao: "",
    emit_cnpj,
    emit_nome,
    emit_fantasia: "",
    emit_uf: "",
    emit_cidade: "",
    dest_cnpj,
    dest_nome,
    valor_produtos: valor_produtos || valor_total,
    valor_total,
    itens,
    origem: "PDF",
  };

  dadosNF = nf;
  exibirNF(nf);
  exibirItens(itens);
}

// ── Extrair itens da tabela de produtos do DANFE ─────
function extrairItensPDF(texto) {
  const itens = [];

  // Procura o bloco após "DADOS DOS PRODUTOS" ou "CÓDIGO PRODUTO"
  const blocoMatch = texto.match(/(?:DADOS DOS PRODUTOS|C[OÓ]DIGO\s*PRODUTO)[\s\S]*/i);
  if (!blocoMatch) return itens;
  let bloco = blocoMatch[0];

  // Remove tudo após "DADOS ADICIONAIS" ou "INFORMAÇÕES COMPLEMENTARES"
  bloco = bloco.replace(/(?:DADOS ADICIONAIS|INFORMA[ÇC][ÕO]ES COMPLEMENTARES)[\s\S]*/i, "");

  // Pattern: código numérico seguido de descrição, depois NCM, CFOP, UN, QUANT, VALOR
  // A linha de produto tipicamente tem: CÓDIGO | DESCRIÇÃO | NCM | O/CSOSN | CFOP | UN | QUANT | V.UNIT | V.TOTAL ...
  // No texto extraído do PDF, os campos ficam separados por espaços
  const linhas = bloco.split("\n");

  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i].trim();

    // Tenta encontrar uma linha que começa com um código de produto (número)
    // Pattern: código | descrição | ncm(8dig) | csosn | cfop(4dig) | un | qtde | vUnit | vTotal
    const match = linha.match(
      /^\s*(\d{1,10})\s+(.+?)\s+(\d{8})\s+(\d{2,4})\s+(\d{4})\s+(\w{1,5})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/
    );

    if (match) {
      itens.push({
        nItem:  String(itens.length + 1),
        cProd:  match[1],
        xProd:  match[2].trim(),
        NCM:    match[3],
        CFOP:   match[5],
        uCom:   match[6],
        qCom:   match[7].replace(/\./g, "").replace(",", "."),
        vUnCom: match[8].replace(/\./g, "").replace(",", "."),
        vProd:  match[9].replace(/\./g, "").replace(",", "."),
      });
      i++;
      continue;
    }

    // Pattern alternativo: código e descrição numa linha, valores na próxima
    const matchCod = linha.match(/^\s*(\d{1,10})\s+(.+)/);
    if (matchCod && i + 1 < linhas.length) {
      const proxLinha = linhas[i + 1].trim();
      const matchVals = proxLinha.match(
        /(\d{8})\s+(\d{2,4})\s+(\d{4})\s+(\w{1,5})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/
      );
      if (matchVals) {
        itens.push({
          nItem:  String(itens.length + 1),
          cProd:  matchCod[1],
          xProd:  matchCod[2].trim(),
          NCM:    matchVals[1],
          CFOP:   matchVals[3],
          uCom:   matchVals[4],
          qCom:   matchVals[5].replace(/\./g, "").replace(",", "."),
          vUnCom: matchVals[6].replace(/\./g, "").replace(",", "."),
          vProd:  matchVals[7].replace(/\./g, "").replace(",", "."),
        });
        i += 2;
        continue;
      }
    }

    i++;
  }

  return itens;
}

// ── Parser do XML NF-e ────────────────────────────────
function parsearXML(xmlStr) {
  const parser = new DOMParser();

  // Remover namespace para facilitar queries
  const xmlClean = xmlStr.replace(/ xmlns="[^"]*"/g, "");
  const docClean = parser.parseFromString(xmlClean, "text/xml");

  const parseError = docClean.querySelector("parsererror");
  if (parseError) {
    showToast("XML inválido.", "error");
    return;
  }

  // Dados da NF
  const ide   = docClean.querySelector("ide");
  const emit  = docClean.querySelector("emit");
  const dest  = docClean.querySelector("dest");
  const total = docClean.querySelector("ICMSTot");
  const prot  = docClean.querySelector("protNFe infProt");

  const chaveNFe = prot?.querySelector("chNFe")?.textContent
    || docClean.querySelector("infNFe")?.getAttribute("Id")?.replace("NFe", "") || "";

  const nf = {
    chave_nfe:      chaveNFe,
    numero_nf:      ide?.querySelector("nNF")?.textContent || "",
    serie:          ide?.querySelector("serie")?.textContent || "",
    natureza_op:    ide?.querySelector("natOp")?.textContent || "",
    data_emissao:   ide?.querySelector("dhEmi")?.textContent || "",
    emit_cnpj:      emit?.querySelector("CNPJ")?.textContent || "",
    emit_nome:      emit?.querySelector("xNome")?.textContent || "",
    emit_fantasia:  emit?.querySelector("xFant")?.textContent || "",
    emit_uf:        emit?.querySelector("enderEmit UF")?.textContent || "",
    emit_cidade:    emit?.querySelector("enderEmit xMun")?.textContent || "",
    dest_cnpj:      dest?.querySelector("CNPJ")?.textContent || "",
    dest_nome:      dest?.querySelector("xNome")?.textContent || "",
    valor_produtos: parseFloat(total?.querySelector("vProd")?.textContent || "0"),
    valor_total:    parseFloat(total?.querySelector("vNF")?.textContent || "0"),
  };

  // Itens
  const dets  = docClean.querySelectorAll("det");
  const itens = [];
  dets.forEach((det) => {
    const prod = det.querySelector("prod");
    if (!prod) return;
    itens.push({
      nItem:  det.getAttribute("nItem"),
      cProd:  prod.querySelector("cProd")?.textContent || "",
      xProd:  prod.querySelector("xProd")?.textContent || "",
      qCom:   prod.querySelector("qCom")?.textContent || "0",
      vUnCom: prod.querySelector("vUnCom")?.textContent || "0",
      vProd:  prod.querySelector("vProd")?.textContent || "0",
      CFOP:   prod.querySelector("CFOP")?.textContent || "",
      uCom:   prod.querySelector("uCom")?.textContent || "",
      NCM:    prod.querySelector("NCM")?.textContent || "",
    });
  });

  if (!itens.length) {
    showToast("Nenhum item encontrado no XML.", "error");
    return;
  }

  nf.itens = itens;
  dadosNF = nf;

  exibirNF(nf);
  exibirItens(itens);
}

// ── Helpers de formatação ─────────────────────────────
function fmtCNPJ(v) {
  if (!v || v.length !== 14) return v || "";
  return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function fmtBRL(v) {
  return "R$ " + parseFloat(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function fmtData(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ── Exibir dados da NF ────────────────────────────────
function exibirNF(nf) {
  nfTitulo.textContent = `NF-e ${nf.numero_nf} (Serie ${nf.serie})`;
  nfSubtitulo.textContent = `Chave: ${nf.chave_nfe}`;

  nfGrid.innerHTML = `
    <div class="nf-campo">
      <div class="nf-campo-label">Emitente</div>
      <div class="nf-campo-valor">${nf.emit_nome}</div>
    </div>
    <div class="nf-campo">
      <div class="nf-campo-label">CNPJ Emitente</div>
      <div class="nf-campo-valor">${fmtCNPJ(nf.emit_cnpj)}</div>
    </div>
    <div class="nf-campo">
      <div class="nf-campo-label">Cidade / UF</div>
      <div class="nf-campo-valor">${nf.emit_cidade || "—"} / ${nf.emit_uf || "—"}</div>
    </div>
    <div class="nf-campo">
      <div class="nf-campo-label">Destinatario</div>
      <div class="nf-campo-valor">${nf.dest_nome}</div>
    </div>
    <div class="nf-campo">
      <div class="nf-campo-label">Natureza da Operacao</div>
      <div class="nf-campo-valor">${nf.natureza_op}</div>
    </div>
    <div class="nf-campo">
      <div class="nf-campo-label">Data Emissao</div>
      <div class="nf-campo-valor">${fmtData(nf.data_emissao)}</div>
    </div>
    <div class="nf-campo">
      <div class="nf-campo-label">Valor Produtos</div>
      <div class="nf-campo-valor">${fmtBRL(nf.valor_produtos)}</div>
    </div>
    <div class="nf-campo">
      <div class="nf-campo-label">Valor Total NF</div>
      <div class="nf-campo-valor" style="color:#22c55e;font-size:16px;">${fmtBRL(nf.valor_total)}</div>
    </div>
  `;

  nfCard.classList.add("show");
}

// ── Exibir itens na tabela ────────────────────────────
async function exibirItens(itens) {
  corpoTabela.innerHTML = "";

  for (const item of itens) {
    let status = "NAO_ENCONTRADO";
    let conversaoInfo = "";
    try {
      const res = await apiRequest(`/materiais/busca-codigo/${encodeURIComponent(item.cProd)}`);
      if (res.success && res.data) {
        status = "ENCONTRADO";
        const mat = res.data;
        const fator = Number(mat.fator_conversao) || 1;
        const unCompra = (mat.unidade_compra || "").toLowerCase();
        const unEstoque = (mat.unidade_medida || "").toLowerCase();
        const unNF = (item.uCom || "").toLowerCase();
        if (fator > 1 && unCompra && (unNF !== unEstoque || unNF === unCompra)) {
          const qtdeNF = parseFloat(item.qCom) || 0;
          const qtdeConv = qtdeNF * fator;
          conversaoInfo = `<div style="font-size:10px;color:#60a5fa;font-weight:600;margin-top:2px">` +
            `${qtdeNF} ${item.uCom} × ${fator} = ${qtdeConv.toLocaleString("pt-BR")} ${unEstoque}</div>`;
        }
      }
    } catch { /* nao encontrado */ }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.nItem}</td>
      <td><strong>${item.cProd}</strong></td>
      <td>${item.xProd}</td>
      <td>${item.NCM || "—"}</td>
      <td>${item.CFOP}</td>
      <td>${item.uCom}</td>
      <td style="font-weight:700;">${parseFloat(item.qCom).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })}${conversaoInfo}</td>
      <td>${fmtBRL(item.vUnCom)}</td>
      <td style="font-weight:600;">${fmtBRL(item.vProd)}</td>
      <td>
        ${status === "ENCONTRADO"
          ? '<span class="badge badge-ok">Encontrado</span>'
          : '<span class="badge badge-warn">Nao cadastrado</span>'
        }
      </td>
    `;
    corpoTabela.appendChild(tr);
  }

  tabelaCard.classList.add("show");
  btnConfirmar.classList.add("show");
  btnLimpar.classList.add("show");
  resultadoCard.classList.remove("show");
}

// ── Confirmar entrada ─────────────────────────────────
btnConfirmar.addEventListener("click", async () => {
  if (!dadosNF) return;
  if (!confirm(`Confirmar entrada da NF ${dadosNF.numero_nf}?\nIsso vai atualizar o estoque dos materiais encontrados.`)) return;

  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Processando...";

  try {
    const res = await apiRequest("/entrada-notas", {
      method: "POST",
      body: JSON.stringify(dadosNF),
    });

    if (!res.success) {
      showToast(res.message || "Erro ao processar.", "error");
      return;
    }

    // Exibe resultado
    const proc = res.processados || [];
    const atualizados    = proc.filter(p => p.status === "ATUALIZADO");
    const naoEncontrados = proc.filter(p => p.status === "NAO_ENCONTRADO");

    let html = `<strong>${atualizados.length}</strong> de <strong>${proc.length}</strong> itens atualizados no estoque.<br>`;
    if (atualizados.length) {
      html += `<br><strong>Atualizados:</strong><br>`;
      atualizados.forEach(p => {
        const fator = p.fator_aplicado || 1;
        const qtdeConv = p.qtde_convertida || p.qCom;
        if (fator > 1) {
          html += `&nbsp;&nbsp;- <strong>${p.cProd}</strong> — ${p.xProd} — `;
          html += `<span style="color:#60a5fa;font-weight:700">${p.qCom} ${p.uCom || "un"} × ${fator} = +${qtdeConv}</span> `;
          html += `<span style="color:var(--muted);font-size:11px;">(estoque: ${p.estoque_anterior} → ${p.estoque_novo})</span>`;
          html += `<br>`;
        } else {
          html += `&nbsp;&nbsp;- <strong>${p.cProd}</strong> — ${p.xProd} — +${p.qCom} ${p.uCom || "un"} `;
          html += `<span style="color:var(--muted);font-size:11px;">(estoque: ${p.estoque_anterior} → ${p.estoque_novo})</span><br>`;
        }
      });
    }
    if (naoEncontrados.length) {
      html += `<br><span style="color:#f59e0b;"><strong>Nao encontrados no cadastro (sem alteracao no estoque):</strong></span><br>`;
      naoEncontrados.forEach(p => {
        html += `&nbsp;&nbsp;- <strong>${p.cProd}</strong> — ${p.xProd}<br>`;
      });
    }

    resultadoResumo.innerHTML = html;
    resultadoCard.classList.add("show");
    showToast("Entrada processada com sucesso!", "success");

    // Esconde botao e limpa
    btnConfirmar.classList.remove("show");
    dadosNF = null;

    carregarHistorico();

  } catch (e) {
    showToast(e.message || "Erro ao processar entrada.", "error");
  } finally {
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = "Confirmar Entrada no Estoque";
  }
});

// ── Limpar ────────────────────────────────────────────
btnLimpar.addEventListener("click", () => {
  dadosNF = null;
  nfCard.classList.remove("show");
  tabelaCard.classList.remove("show");
  btnConfirmar.classList.remove("show");
  btnLimpar.classList.remove("show");
  resultadoCard.classList.remove("show");
  corpoTabela.innerHTML = "";
  nfGrid.innerHTML = "";
  inputXML.value = "";
});

// ── Historico de entradas ─────────────────────────────
async function carregarHistorico() {
  try {
    const res = await apiRequest("/entrada-notas");
    const tbody = document.getElementById("corpoHistorico");
    tbody.innerHTML = "";

    if (!res.data?.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px;">Nenhuma entrada registrada.</td></tr>`;
      return;
    }

    res.data.forEach(e => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${e.id}</td>
        <td><strong>${e.numero_nf || "—"}</strong></td>
        <td>${e.emit_nome || "—"}</td>
        <td>${fmtCNPJ(e.emit_cnpj) || "—"}</td>
        <td>${e.valor_total ? fmtBRL(e.valor_total) : "—"}</td>
        <td>${e.qtde_atualizado ?? "—"} / ${e.qtde_itens ?? "—"}</td>
        <td>${fmtData(e.data_entrada || e.criado_em)}</td>
        <td>${e.criado_por_nome || "—"}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch {
    // silencia erro se tabela nao existe ainda
  }
}

// ── Init ──────────────────────────────────────────────
carregarHistorico();
