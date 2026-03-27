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

// ── Vinculações manuais: { cProd: { material_id, descricao } }
const vinculacoes = {};
let itemResolvendoIdx = null; // índice do item sendo resolvido no modal

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
        if (lastY !== null && Math.abs(y - lastY) > 5) linhas.push("\n");
        linhas.push(item.str);
        lastY = y;
      }
      textoCompleto += linhas.join(" ") + "\n";
    }
    console.log("[PDF] Texto extraído:\n", textoCompleto.substring(0, 3000));
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
  let numero_nf = "";
  // Padrões para capturar "Nº 000.000.144", "Nº. 000.001.465", etc.
  const nfPatterns = [
    /N[°º]\.?\s*([\d.]{7,})/,                         // Nº 000.000.144 ou Nº. 000.001.465
    /N[°º]\.?\s*(\d[\d.]+\d)/,                        // Nº 000001465
    /NF-?e?\s*\n?\s*N[°º]\.?\s*([\d.]+)/i,            // NF-e\nNº 000.000.144
  ];
  for (const p of nfPatterns) {
    const m = t.match(p);
    if (m) {
      numero_nf = m[1].replace(/\./g, "").replace(/^0+/, "") || m[1].replace(/\./g, "");
      if (numero_nf) break;
    }
  }

  // Serie: "SÉRIE: 1", "Série 001", "Serie: 1"
  let serie = "";
  const seriePatterns = [
    /S[EÉée]RIE:?\s*(\d+)/i,                          // SÉRIE: 1 ou SERIE: 001
    /S[ée]rie\s+(\d+)/i,                               // Série 001
  ];
  for (const p of seriePatterns) {
    const m = t.match(p);
    if (m) { serie = m[1]; break; }
  }

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
    // Ignora textos do DANFE que podem aparecer misturados
    if (/fiscal\s*eletr[oô]nica|documento\s*auxiliar|nota\s*fiscal|autenticidade|portal\s*nacional|sefaz|autorizadora/i.test(linha)) continue;
    if (/^(RUA|AV\b|AVENIDA|RODOVIA|ESTRADA|TRAVESSA|ALAMEDA|PARQUE)\s/i.test(linha)) continue;
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
  // O valor pode estar na mesma linha ou na próxima, separado por espaço ou \n
  let valor_total = 0;
  const valTotalPatterns = [
    /V\.\s*TOTAL\s*DA\s*NOTA\s*[\n\s]+([\d.,]+)/i,
    /TOTAL\s*DA\s*NOTA\s*[\n\s]+([\d.,]+)/i,
    /V\.\s*TOTAL\s*DA\s*NOTA\s*([\d.,]+)/i,
  ];
  for (const p of valTotalPatterns) {
    const m = t.match(p);
    if (m) {
      valor_total = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (valor_total > 0) break;
    }
  }

  let valor_produtos = 0;
  const valProdPatterns = [
    /V\.\s*TOTAL\s*PRODUTOS\s*[\n\s]+([\d.,]+)/i,
    /TOTAL\s*PRODUTOS\s*[\n\s]+([\d.,]+)/i,
    /V\.\s*TOTAL\s*PRODUTOS\s*([\d.,]+)/i,
  ];
  for (const p of valProdPatterns) {
    const m = t.match(p);
    if (m) {
      valor_produtos = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (valor_produtos > 0) break;
    }
  }

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

// ── Regex de valores da linha de produto (NCM 8dig + CSOSN + CFOP + UN + qtde + vUnit + vTotal) ──
const RE_VALORES = /(\d{8})\s+(\d{2,4})\s+(\d{4})\s+(\w{1,5})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/;

function limparDescricao(desc) {
  // Remove "Numero Pedido de compra: ..." e similares que ficam colados na descrição
  return desc
    .replace(/Numero\s+Pedido.*$/i, "")
    .replace(/Pedido\s+\d+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumBR(v) {
  return v.replace(/\./g, "").replace(",", ".");
}

// ── Extrair itens da tabela de produtos do DANFE ─────
function extrairItensPDF(texto) {
  let itens = [];

  // Procura o bloco após "DADOS DOS PRODUTOS" ou "CÓDIGO PRODUTO"
  const blocoMatch = texto.match(/(?:DADOS DOS PRODUTOS|C[OÓ]DIGO\s*PRODUTO)[\s\S]*/i);
  if (!blocoMatch) {
    console.warn("[PDF Parser] Bloco de produtos não encontrado no texto extraído.");
    console.log("[PDF Parser] Texto completo:", texto.substring(0, 2000));
    return itens;
  }
  let bloco = blocoMatch[0];

  // Remove tudo após "DADOS ADICIONAIS" ou "INFORMAÇÕES COMPLEMENTARES"
  bloco = bloco.replace(/(?:DADOS ADICIONAIS|INFORMA[ÇC][ÕO]ES COMPLEMENTARES)[\s\S]*/i, "");

  // Normaliza espaços em números: "0, 00" → "0,00", "1. 425" → "1.425"
  bloco = bloco.replace(/(\d),\s+(\d)/g, "$1,$2");
  bloco = bloco.replace(/(\d)\.\s+(\d)/g, "$1.$2");

  console.log("[PDF Parser] Bloco de produtos:\n", bloco);

  const linhas = bloco.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // Regex para código de produto: aceita alfanumérico (ex: M00000733, 1480, 94, ABC123)
  const RE_CODIGO = /^\s*([A-Za-z0-9]{1,15})\s+(.+?)\s+(\d{8})\s+(\d{2,4})\s+(\d{4})\s+(\w{1,5})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/;
  const RE_CODIGO_INICIO = /^\s*([A-Za-z0-9]{1,15})\s+(.+)/;

  // ── Estratégia 1: linha única (código + desc + NCM + valores tudo junto) ──
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const match = linha.match(RE_CODIGO);
    if (match) {
      // Ignora se o "código" parece ser um header (CODIGO, DESCRICAO, etc.)
      if (/^(CODIGO|DESCRI|NCM|CST|CFOP|UNID|QUANT|VALOR|DADOS)/i.test(match[1])) continue;
      itens.push({
        nItem:  String(itens.length + 1),
        cProd:  match[1],
        xProd:  limparDescricao(match[2]),
        NCM:    match[3],
        CFOP:   match[5],
        uCom:   match[6],
        qCom:   parseNumBR(match[7]),
        vUnCom: parseNumBR(match[8]),
        vProd:  parseNumBR(match[9]),
      });
    }
  }

  if (itens.length) {
    console.log("[PDF Parser] Itens encontrados (estratégia 1 - linha única):", itens.length);
    return itens;
  }

  // ── Estratégia 2: multi-linha (código numa linha, valores até 6 linhas adiante) ──
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i];

    // Linha começa com código de produto (alfanumérico) seguido de texto
    const matchCod = linha.match(RE_CODIGO_INICIO);
    // Ignora headers
    if (matchCod && /^(CODIGO|DESCRI|NCM|CST|CFOP|UNID|QUANT|VALOR|DADOS)/i.test(matchCod[1])) { i++; continue; }
    if (matchCod) {
      const codigo = matchCod[1];
      let descParts = [matchCod[2].trim()];
      let found = false;

      // Procura a linha com NCM+valores nas próximas 6 linhas
      for (let j = i + 1; j < Math.min(i + 7, linhas.length); j++) {
        const proxLinha = linhas[j];
        const matchVals = proxLinha.match(RE_VALORES);

        if (matchVals) {
          // Encontrou os valores! Monta o item
          itens.push({
            nItem:  String(itens.length + 1),
            cProd:  codigo,
            xProd:  limparDescricao(descParts.join(" ")),
            NCM:    matchVals[1],
            CFOP:   matchVals[3],
            uCom:   matchVals[4],
            qCom:   parseNumBR(matchVals[5]),
            vUnCom: parseNumBR(matchVals[6]),
            vProd:  parseNumBR(matchVals[7]),
          });
          i = j + 1;
          found = true;
          break;
        }

        // Se a linha parece continuação de descrição (não é um novo código, não é header)
        if (!/^\d{1,10}\s/.test(proxLinha) && !/^(DADOS|INFORMA|C[OÓ]DIGO|VALOR|ALIQ)/i.test(proxLinha)) {
          descParts.push(proxLinha);
        }
      }

      if (found) continue;
    }

    i++;
  }

  if (itens.length) {
    console.log("[PDF Parser] Itens encontrados (estratégia 2 - multi-linha):", itens.length);
    return itens;
  }

  // ── Estratégia 3 (fallback): achata todo o texto e busca padrões ──
  const textoFlat = bloco
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ");

  console.log("[PDF Parser] Tentando estratégia 3 (texto achatado)...");

  const reFull = /\b([A-Za-z0-9]{1,15})\s+(.+?)\s+(\d{8})\s+(\d{2,4})\s+(\d{4})\s+(\w{1,5})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/g;
  let m;
  while ((m = reFull.exec(textoFlat)) !== null) {
    // Ignora se o "código" parece ser um NCM (8 dígitos) ou header
    if (m[1].length === 8 && /^\d+$/.test(m[1])) continue;
    if (/^(CODIGO|DESCRI|NCM|CST|CFOP|UNID|QUANT|VALOR|DADOS)/i.test(m[1])) continue;
    itens.push({
      nItem:  String(itens.length + 1),
      cProd:  m[1],
      xProd:  limparDescricao(m[2]),
      NCM:    m[3],
      CFOP:   m[5],
      uCom:   m[6],
      qCom:   parseNumBR(m[7]),
      vUnCom: parseNumBR(m[8]),
      vProd:  parseNumBR(m[9]),
    });
  }

  console.log("[PDF Parser] Itens encontrados (estratégia 3 - fallback):", itens.length);
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

  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    let status = "NAO_ENCONTRADO";
    let conversaoInfo = "";
    let vinculadoInfo = "";
    let codigoDestino = "";  // código do material que receberá o estoque
    let descDestino = "";

    // Checa se já tem vinculação manual
    if (vinculacoes[item.cProd]) {
      status = "VINCULADO";
      const v = vinculacoes[item.cProd];
      vinculadoInfo = v.descricao;
      codigoDestino = v.codigo_produto || "";
      descDestino = v.descricao;
    } else {
      let mat = null;

      // 1) Tenta busca exata por código do produto da NF
      try {
        const res = await apiRequest(`/materiais/busca-codigo/${encodeURIComponent(item.cProd)}`);
        if (res.success && res.data) mat = res.data;
      } catch { /* não encontrado por código */ }

      // 2) Fallback: busca por descrição similar
      if (!mat) {
        try {
          const res2 = await apiRequest(`/materiais/busca-similares?termo=${encodeURIComponent(item.xProd)}`);
          if (res2.success && res2.data?.length) mat = res2.data[0];
        } catch { /* sem similar */ }
      }

      if (mat) {
        status = "SIMILAR";
        codigoDestino = mat.codigo_produto;
        descDestino = mat.descricao;
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
    }

    // Coluna "Cod. Material" — mostra o código do material destino no sistema
    let codDestinoHTML = "";
    if (codigoDestino) {
      codDestinoHTML = `<strong style="color:#22c55e;">${codigoDestino}</strong>`;
      if (descDestino && descDestino !== item.xProd) {
        codDestinoHTML += `<div style="font-size:10px;color:var(--muted);margin-top:2px;line-height:1.3;">${descDestino}</div>`;
      }
    } else {
      codDestinoHTML = `<span style="color:var(--muted);">—</span>`;
    }

    let statusHTML = "";
    if (status === "VINCULADO") {
      statusHTML = '<span class="badge badge-ok">Vinculado</span>';
    } else if (status === "SIMILAR") {
      statusHTML = `<span class="badge badge-info">Sugestao</span><br>` +
        `<button class="btn-acao-nf btn-resolver-item" data-idx="${idx}">Confirmar / Alterar</button>`;
    } else {
      statusHTML = `<span class="badge badge-warn">Nao cadastrado</span><br>` +
        `<button class="btn-acao-nf btn-resolver-item" data-idx="${idx}">Resolver</button>`;
    }

    const tr = document.createElement("tr");
    tr.setAttribute("data-cprod", item.cProd);
    tr.innerHTML = `
      <td>${item.nItem}</td>
      <td><strong>${item.cProd}</strong></td>
      <td>${item.xProd}</td>
      <td>${codDestinoHTML}</td>
      <td>${item.NCM || "—"}</td>
      <td>${item.CFOP}</td>
      <td>${item.uCom}</td>
      <td style="font-weight:700;">${parseFloat(item.qCom).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })}${conversaoInfo}</td>
      <td>${fmtBRL(item.vUnCom)}</td>
      <td style="font-weight:600;">${fmtBRL(item.vProd)}</td>
      <td>${statusHTML}</td>
    `;
    corpoTabela.appendChild(tr);
  }

  // Bind dos botões "Resolver"
  corpoTabela.querySelectorAll(".btn-resolver-item").forEach(btn => {
    btn.addEventListener("click", () => abrirModalResolver(parseInt(btn.dataset.idx)));
  });

  tabelaCard.classList.add("show");
  btnConfirmar.classList.add("show");
  btnLimpar.classList.add("show");
  resultadoCard.classList.remove("show");
}

// ── Modal Resolver ──────────────────────────────────────
const modalResolver      = document.getElementById("modalResolver");
const modalResolverTitulo = document.getElementById("modalResolverTitulo");
const resolverItemInfo   = document.getElementById("resolverItemInfo");
const listaSimilares     = document.getElementById("listaSimilares");
const btnFecharResolver  = document.getElementById("btnFecharResolver");

// Tabs do modal resolver
document.querySelectorAll(".resolver-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".resolver-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".resolver-pane").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(
      tab.dataset.resolverTab === "similares" ? "paneSimilares" : "paneCadastro"
    ).classList.add("active");
  });
});

btnFecharResolver.addEventListener("click", fecharModalResolver);
modalResolver.addEventListener("click", (e) => {
  if (e.target === modalResolver) fecharModalResolver();
});

function fecharModalResolver() {
  modalResolver.classList.remove("show");
  itemResolvendoIdx = null;
}

async function abrirModalResolver(idx) {
  const item = dadosNF.itens[idx];
  if (!item) return;
  itemResolvendoIdx = idx;

  modalResolverTitulo.textContent = `Resolver: ${item.cProd}`;
  resolverItemInfo.innerHTML = `
    <strong>Codigo NF:</strong> ${item.cProd} &nbsp;|&nbsp;
    <strong>Descricao:</strong> ${item.xProd} &nbsp;|&nbsp;
    <strong>NCM:</strong> ${item.NCM || "—"} &nbsp;|&nbsp;
    <strong>Qtde:</strong> ${parseFloat(item.qCom).toLocaleString("pt-BR")} ${item.uCom} &nbsp;|&nbsp;
    <strong>Valor:</strong> ${fmtBRL(item.vProd)}
  `;

  // Preenche form de cadastro rápido com dados da NF
  document.getElementById("rCodigo").value = item.cProd;
  document.getElementById("rDescricao").value = item.xProd;
  document.getElementById("rUnidade").value = item.uCom || "un";
  document.getElementById("rCusto").value = parseFloat(item.vUnCom) || "";
  document.getElementById("rTipo").value = "";
  document.getElementById("rUnidadeCompra").value = "";
  document.getElementById("rFator").value = "1";

  // Volta para aba similares
  document.querySelectorAll(".resolver-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".resolver-pane").forEach(p => p.classList.remove("active"));
  document.querySelector("[data-resolver-tab='similares']").classList.add("active");
  document.getElementById("paneSimilares").classList.add("active");

  // Busca similares
  listaSimilares.innerHTML = '<div class="similares-loading">Buscando materiais similares...</div>';
  modalResolver.classList.add("show");

  try {
    const res = await apiRequest(`/materiais/busca-similares?termo=${encodeURIComponent(item.xProd)}`);
    if (res.success && res.data.length) {
      listaSimilares.innerHTML = "";
      for (const mat of res.data) {
        const div = document.createElement("div");
        div.className = "similar-item";
        div.innerHTML = `
          <div class="similar-info">
            <div class="similar-codigo">${mat.codigo_produto}</div>
            <div class="similar-desc">${mat.descricao}</div>
            <div class="similar-meta">
              Unidade: ${mat.unidade_medida || "un"} | Estoque: ${Number(mat.estoque || 0).toLocaleString("pt-BR")} |
              Tipo: ${mat.tipo || "—"}
              ${mat.unidade_compra ? ` | Unid. Compra: ${mat.unidade_compra} (fator: ${mat.fator_conversao || 1})` : ""}
            </div>
          </div>
          <button class="btn-vincular" data-mat-id="${mat.id}" data-mat-desc="${mat.descricao}" data-mat-cod="${mat.codigo_produto}">
            Vincular
          </button>
        `;
        listaSimilares.appendChild(div);
      }
      // Bind vincular
      listaSimilares.querySelectorAll(".btn-vincular").forEach(btn => {
        btn.addEventListener("click", () => {
          vincularItem(
            dadosNF.itens[itemResolvendoIdx].cProd,
            parseInt(btn.dataset.matId),
            btn.dataset.matDesc,
            btn.dataset.matCod
          );
        });
      });
    } else {
      listaSimilares.innerHTML = `<div class="similares-vazio">
        Nenhum material similar encontrado.<br>
        <span style="font-size:11px;color:var(--muted)">Use a aba "Cadastrar Novo" para criar o material.</span>
      </div>`;
    }
  } catch (err) {
    listaSimilares.innerHTML = `<div class="similares-vazio">Erro ao buscar: ${err.message}</div>`;
  }
}

function vincularItem(cProd, materialId, descricao, codigoProduto) {
  vinculacoes[cProd] = { material_id: materialId, descricao, codigo_produto: codigoProduto };
  fecharModalResolver();
  showToast(`Item ${cProd} vinculado ao material ${codigoProduto} — "${descricao}"`, "success");
  // Re-renderiza tabela para atualizar status
  exibirItens(dadosNF.itens);
}

// ── Cadastro rápido ─────────────────────────────────────
document.getElementById("btnCadastrarRapido").addEventListener("click", async () => {
  const codigo = document.getElementById("rCodigo").value.trim();
  const descricao = document.getElementById("rDescricao").value.trim();
  const unidade = document.getElementById("rUnidade").value.trim() || "un";
  const tipo = document.getElementById("rTipo").value;
  const custo = document.getElementById("rCusto").value;
  const unidadeCompra = document.getElementById("rUnidadeCompra").value.trim();
  const fator = document.getElementById("rFator").value;

  if (!codigo || !descricao) {
    showToast("Codigo e descricao sao obrigatorios.", "error");
    return;
  }

  const btn = document.getElementById("btnCadastrarRapido");
  btn.disabled = true;
  btn.textContent = "Cadastrando...";

  try {
    const res = await apiRequest("/materiais", {
      method: "POST",
      body: JSON.stringify({
        codigo_produto: codigo,
        descricao,
        unidade_medida: unidade,
        tipo: tipo || null,
        custo_fornecedor: custo ? Number(custo) : 0,
        unidade_compra: unidadeCompra || null,
        fator_conversao: fator ? Number(fator) : 1,
        estoque: 0,
        situacao: "ativo",
      }),
    });

    if (!res.success) {
      showToast(res.message || "Erro ao cadastrar.", "error");
      return;
    }

    // Vincula automaticamente o item da NF ao material recém-criado
    const cProd = dadosNF.itens[itemResolvendoIdx].cProd;
    vinculacoes[cProd] = { material_id: res.id, descricao, codigo_produto: codigo };
    fecharModalResolver();
    showToast(`Material "${codigo}" cadastrado e vinculado!`, "success");
    exibirItens(dadosNF.itens);
  } catch (err) {
    showToast(err.message || "Erro ao cadastrar.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Cadastrar e Vincular";
  }
});

// ── Confirmar entrada ─────────────────────────────────
btnConfirmar.addEventListener("click", async () => {
  if (!dadosNF) return;
  if (!confirm(`Confirmar entrada da NF ${dadosNF.numero_nf}?\nIsso vai atualizar o estoque dos materiais encontrados.`)) return;

  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Processando...";

  try {
    // Monta mapa de vinculações: { cProd: material_id }
    const vinculacoesMap = {};
    for (const [cProd, v] of Object.entries(vinculacoes)) {
      vinculacoesMap[cProd] = v.material_id;
    }

    const res = await apiRequest("/entrada-notas", {
      method: "POST",
      body: JSON.stringify({ ...dadosNF, vinculacoes: vinculacoesMap }),
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
    for (const k of Object.keys(vinculacoes)) delete vinculacoes[k];

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
  // Limpa vinculações
  for (const k of Object.keys(vinculacoes)) delete vinculacoes[k];
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
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:24px;">Nenhuma entrada registrada.</td></tr>`;
      return;
    }

    res.data.forEach(e => {
      const temPendentes = (e.qtde_atualizado ?? 0) < (e.qtde_itens ?? 0);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${e.id}</td>
        <td><strong>${e.numero_nf || "—"}</strong></td>
        <td>${e.emit_nome || "—"}</td>
        <td>${fmtCNPJ(e.emit_cnpj) || "—"}</td>
        <td>${e.valor_total ? fmtBRL(e.valor_total) : "—"}</td>
        <td>
          ${e.qtde_atualizado ?? "—"} / ${e.qtde_itens ?? "—"}
          ${temPendentes ? `<span style="color:#f59e0b;font-size:10px;font-weight:700;margin-left:4px;">PENDENTE</span>` : ""}
        </td>
        <td>${fmtData(e.data_entrada || e.criado_em)}</td>
        <td>${e.criado_por_nome || "—"}</td>
        <td>
          ${temPendentes
            ? `<button class="btn-acao-nf btn-reprocessar" data-id="${e.id}" data-nf="${e.numero_nf || ''}">Reprocessar</button>`
            : `<span style="color:var(--success);font-size:11px;font-weight:700;">OK</span>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Bind dos botões "Reprocessar"
    tbody.querySelectorAll(".btn-reprocessar").forEach(btn => {
      btn.addEventListener("click", () => reprocessarEntrada(parseInt(btn.dataset.id), btn.dataset.nf));
    });
  } catch {
    // silencia erro se tabela nao existe ainda
  }
}

async function reprocessarEntrada(id, nf) {
  if (!confirm(`Reprocessar itens pendentes da NF ${nf || id}?\nIsto vai tentar vincular novamente os itens não encontrados e atualizar o estoque.`)) return;

  try {
    const res = await apiRequest(`/entrada-notas/${id}/reprocessar`, { method: "PUT" });

    if (!res.success) {
      showToast(res.message || "Erro ao reprocessar.", "error");
      return;
    }

    showToast(res.message, res.atualizados > 0 ? "success" : "warning");
    carregarHistorico();
  } catch (err) {
    showToast(err.message || "Erro ao reprocessar.", "error");
  }
}

// ── Init ──────────────────────────────────────────────
carregarHistorico();
