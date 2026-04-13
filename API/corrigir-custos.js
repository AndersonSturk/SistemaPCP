/**
 * Corrige custo_fornecedor dos materiais produzidos para valores realistas.
 * Os valores atuais parecem estar em centavos (x100) ou por lote.
 *
 * Referências de mercado (preço unitário, venda ao consumidor):
 * - Bolsa de lona simples: R$25-60
 * - Bolsa de lona grande (vara manobra): R$80-200
 * - Balde de lona: R$25-45
 * - Bandeirola sinalização: R$8-25
 * - Fita sinalização 10m: R$12-25
 * - Fita sinalização 35m: R$30-60
 * - Camisa risco 2 algodão FR: R$85-130
 * - Calça risco 2: R$75-110
 * - Macacão apicultor: R$120-200
 * - Lona encerada 2x2m: R$80-120
 * - Lona encerada 10x10m: R$800-1500
 * - Película refletiva cortada: R$2-8
 * - Bainha couro/lona: R$12-30
 * - Calço madeira: R$15-45
 * - Cone com faixa: R$45-80
 * - Capacete montado: R$35-70
 * - Recolhedor de fita: R$45-80
 * - Chapéu australiano: R$35-55
 * - Corda 20m: R$40-65
 *
 * Execução: node corrigir-custos.js
 */
const mysql = require("mysql2");
const db = mysql.createPool({ host: "127.0.0.1", user: "root", password: "4618", database: "pcp", port: 3306 });
const p = db.promise();

// Preços realistas por família (R$ unitário)
function precoPor(m) {
  const d = (m.descricao || "").toUpperCase();
  const g = (m.grupo || "").toUpperCase();

  // ── BANDEIROLAS ──
  if (d.includes("BANDEIROLA")) {
    if (d.includes("450X450")) return 22.00;
    if (d.includes("330X510") || d.includes("33CM")) return 15.00;
    if (d.includes("551X330") || d.includes("55X")) return 18.00;
    if (d.includes("350X250") || d.includes("ADVERTENCIA")) return 12.00;
    if (d.includes("350X400") || d.includes("300X410") || d.includes("250X500")) return 14.00;
    if (d.includes("300X415") || d.includes("ESCADA")) return 16.00;
    return 14.00;
  }

  // ── PELÍCULAS ──
  if (d.includes("PELICULA REFLETIVA")) {
    if (d.includes("20X100")) return 3.50;
    return 8.00;
  }

  // ── FITAS DE SINALIZAÇÃO ──
  if (d.includes("FITA SINALIZACAO") || d.includes("FITA ZEBRAD")) {
    if (d.includes("150MTS")) return 85.00;
    if (d.includes("100MTS")) return 65.00;
    if (d.includes("40MTS") || d.includes("40M")) return 42.00;
    if (d.includes("35MTS") || d.includes("35M")) return 38.00;
    if (d.includes("20MTS") || d.includes("20M")) return 28.00;
    if (d.includes("10MTS") || d.includes("10M")) return 18.00;
    return 20.00;
  }
  if (d.includes("FITA SLING")) return 28.00;
  if (d.includes("FITA VELCRO")) {
    if (d.includes("700MM")) return 12.00;
    return 6.50;
  }

  // ── BOLSAS / BAINHAS / SACOLAS ──
  if (d.includes("BAINHA")) {
    if (d.includes("FACA CURVA")) return 18.00;
    if (d.includes("FOICE")) return 22.00;
    if (d.includes("ENXAD")) return 18.00;
    if (d.includes("SERRA")) return 15.00;
    if (d.includes("CANIVETE") || d.includes("CHAVE FENDA")) return 12.00;
    if (d.includes("FACAO")) return 25.00;
    return 16.00;
  }
  if (d.includes("BOLSA") || d.includes("PASSA FIO") || d.includes("SACOLA")) {
    if (d.match(/VARA.*6\s*ELEM/)) return 185.00;
    if (d.match(/VARA.*5\s*ELEM/)) return 155.00;
    if (d.match(/VARA.*4\s*ELEM/)) return 130.00;
    if (d.match(/VARA.*3\s*ELEM/)) return 110.00;
    if (d.includes("ELETRICISTA") && d.includes("65X30")) return 95.00;
    if (d.includes("1600X1360") || d.includes("LENCOL")) return 120.00;
    if (d.includes("1460X")) return 110.00;
    if (d.includes("CAPACETE") && d.includes("OCULOS") && d.includes("PROT")) return 55.00;
    if (d.includes("CAPACETE") && d.includes("OCULOS")) return 48.00;
    if (d.includes("CAPACETE")) return 38.00;
    if (d.includes("DUPLA") && d.includes("LUVA")) return 65.00;
    if (d.includes("LUVA") && d.includes("MANGA")) return 55.00;
    if (d.includes("LUVA")) return 42.00;
    if (d.includes("FERRAMENT") && d.includes("500")) return 78.00;
    if (d.includes("FERRAMENT")) return 58.00;
    if (d.includes("ATERRAMENTO") && d.includes("1460")) return 95.00;
    if (d.includes("ATERRAMENTO") && d.includes("600")) return 65.00;
    if (d.includes("ATERRAMENTO") && d.includes("500")) return 55.00;
    if (d.includes("ELO FUSIVEL") || d.includes("18 BOLSOS")) return 72.00;
    if (d.includes("TALHA")) return 68.00;
    if (d.includes("PASSA FIO")) return 28.00;
    if (d.includes("CINTO PARAQUEDISTA") || d.includes("GRANDE")) return 75.00;
    if (d.includes("SOQUETE") || d.includes("KIT")) return 45.00;
    if (d.includes("ALCADOR") || d.includes("RAMAL")) return 62.00;
    if (d.includes("SACOLA") && d.includes("480X400")) return 55.00;
    if (d.includes("SACOLA") && d.includes("26 LITRO")) return 48.00;
    if (d.includes("SACOLA")) return 52.00;
    if (d.includes("NYLON")) return 42.00;
    if (d.includes("CANOA")) return 58.00;
    if (d.includes("ESPECIAL")) return 45.00;
    if (d.includes("ALLEN")) return 35.00;
    if (d.includes("TIRA COLO")) return 65.00;
    return 45.00;
  }

  // ── BALDES ──
  if (d.includes("BALDE")) {
    if (d.includes("350")) return 38.00;
    return 32.00;
  }

  // ── LONAS ENCERADAS ──
  if (d.includes("LONA") && (d.includes("ENCERADO") || d.includes("IMPERMEAVEL"))) {
    // Por m²
    let larg = 2, alt = 2;
    const m2 = d.match(/(\d{2,5})\s*X\s*(\d{2,5})/i);
    if (m2) {
      larg = parseInt(m2[1]) > 100 ? parseInt(m2[1])/1000 : parseInt(m2[1]);
      alt = parseInt(m2[2]) > 100 ? parseInt(m2[2])/1000 : parseInt(m2[2]);
    }
    const area = larg * alt;
    return Number((area * 18).toFixed(2)); // ~R$18/m²
  }
  if (d.includes("LONA CORTADA")) {
    if (d.includes("33CM")) return 8.00; // por metro linear
    if (d.includes("5CM") || d.includes("5X")) return 4.50;
    return 5.00;
  }

  // ── CAMISAS ──
  if (d.includes("CAMISA") && (d.includes("RISCO 2") || d.includes("ALGODAO") || d.includes("NR10"))) {
    if (d.includes("MEIA ABERTURA") || d.includes("S/ BOTAO")) return 105.00;
    return 95.00;
  }

  // ── CALÇAS ──
  if (d.includes("CALCA") && (d.includes("RISCO 2") || d.includes("ALGODAO") || d.includes("BRIM"))) {
    return 88.00;
  }

  // ── CHAPÉUS ──
  if (d.includes("CHAPEU AUSTRALIANO")) return 42.00;

  // ── MACACÕES ──
  if (d.includes("MACACAO APICULTOR") || (d.includes("MACACAO") && d.includes("INSETO"))) return 165.00;
  if (d.includes("MACACAO") && d.includes("BRIM")) return 145.00;

  // ── CALÇOS MADEIRA ──
  if (d.includes("CALCO") && d.includes("MADEIRA")) {
    if (d.includes("CUNHA")) return 18.00;
    if (d.includes("DIVISAO")) return 28.00;
    return 22.00;
  }
  if (d.includes("CUNHA") && (d.includes("MADEIRA") || d.includes("POLIMERO"))) return 25.00;

  // ── RECOLHEDORES ──
  if (d.includes("RECOLHEDOR")) {
    if (d.includes("40MTS") || d.includes("40M")) return 72.00;
    return 65.00;
  }

  // ── CORDAS ──
  if (d.includes("CORDA TRANCADA")) {
    const m2 = d.match(/(\d+)\s*MTS/i);
    const mts = m2 ? parseInt(m2[1]) : 20;
    return Number((mts * 2.8).toFixed(2)); // ~R$2.80/m
  }

  // ── PLACAS ──
  if (d.includes("PLACA") && (d.includes("SINALIZACAO") || d.includes("PVC"))) return 18.00;

  // ── CONES ──
  if (d.includes("CONE") && d.includes("75CM")) return 62.00;

  // ── CAPACETES ──
  if (d.includes("CAPACETE") && d.includes("ABA")) return 52.00;

  // ── ÓCULOS ──
  if (d.includes("OCULOS") && d.includes("ESTOJO")) return 45.00;

  // ── CONJUNTOS DE ILUMINAÇÃO ──
  if (d.includes("CONJUNTO") && d.includes("ILUMINACAO")) return 350.00;

  // ── GRADES DE PROTEÇÃO ──
  if (d.includes("GRADE") && d.includes("PROTECAO")) return 280.00;

  // ── VARAS DE MANOBRA ──
  if (d.includes("VARA DE MANOBRA")) return 420.00;

  // ── ETIQUETAS ──
  if (d.includes("ETIQUETA")) return 0.85;

  // ── FOICE/ENXADÃO ADAPTADOS ──
  if (d.includes("FOICE") && d.includes("ADAPT")) return 65.00;
  if (d.includes("ENXADAO") && d.includes("ADAPT")) return 85.00;

  // ── FERRAMENTAS (preço variável) ──
  if (g === "FERRAMENTAS") {
    if (d.includes("CONJUNTO") && d.includes("SERRA COPO")) return 1850.00;
    if (d.includes("PARAFUSADEIRA") && d.includes("PULSATIVA")) return 2200.00;
    if (d.includes("PARAFUSADEIRA") && d.includes("IMPACTO")) return 1450.00;
    if (d.includes("PARAFUSADEIRA")) return 850.00;
    if (d.includes("PERFURATRIZ")) return 3500.00;
    if (d.includes("MARTELETE")) return 2800.00;
    if (d.includes("MARTELO DEMOLIDOR")) return 3200.00;
    if (d.includes("ESMERILHADEIRA")) return 1200.00;
    if (d.includes("LANTERNA") && d.includes("18V")) return 650.00;
    if (d.includes("LANTERNA")) return 180.00;
    if (d.includes("ALICATE BOMBA")) return 85.00;
    if (d.includes("ALICATE") && d.includes("CORTE")) return 120.00;
    if (d.includes("TRADO")) return 350.00;
    if (d.includes("TESOURA") && d.includes("CORTA VERGALHAO")) return 280.00;
    if (d.includes("FACA DESENCAPADORA")) return 45.00;
    if (d.includes("LAMINA PODADOR")) return 95.00;
    if (d.includes("SOLDA MACARICO")) return 185.00;
    if (d.includes("MOITAO")) return 450.00;
    if (d.includes("JOGO") && d.includes("SOQUETE")) return 320.00;
    if (d.includes("JOGO") && d.includes("CHAVE")) return 280.00;
    if (d.includes("CONJUNTO") && d.includes("FERRAMENTAS DIVERSAS")) return 2500.00;
    if (d.includes("CONJUNTO") && d.includes("CABO") && d.includes("FAROL")) return 580.00;
    if (d.includes("CONJUNTO") && d.includes("SUBSTITUICAO")) return 3200.00;
    if (d.includes("CONJUNTO") && d.includes("LIMPEZA")) return 180.00;
    if (d.includes("FERRAMENTA") && d.includes("INSERCAO")) return 250.00;
    if (d.includes("FERRAMENTA") && d.includes("APLICACAO")) return 320.00;
    if (d.includes("FERRAMENTA") && d.includes("ESPACADORES")) return 380.00;
    return 250.00;
  }

  // ── MATERIAIS ELÉTRICOS (montagens) ──
  if (g === "MATERIAIS ELETRICOS") {
    if (d.includes("CONJUNTO") && d.includes("ILUMINACAO")) return 350.00;
    if (d.includes("CONJUNTO") && d.includes("ICAMENTO")) return 1200.00;
    if (d.includes("CONJUNTO") && d.includes("POLIMERO")) return 180.00;
    if (d.includes("CONJUNTO") && d.includes("TESTE")) return 450.00;
    if (d.includes("PARAFUSO")) return 8.50;
    if (d.includes("PREGADOR")) return 35.00;
    if (d.includes("SUPORTE")) return 28.00;
    if (d.includes("ESTRIBO")) return 32.00;
    if (d.includes("ESTICADOR")) return 45.00;
    if (d.includes("MANTA BORRACHA")) return 220.00;
    if (d.includes("TERMINAL")) return 380.00;
    return 65.00;
  }

  // ── EPI/EPC genérico ──
  if (g === "EPI/EPC") {
    if (d.includes("ALCADOR")) return 95.00;
    if (d.includes("PERNEIRA")) return 85.00;
    if (d.includes("COLETE")) return 35.00;
    if (d.includes("CONJUNTO") && d.includes("AMARRACAO")) return 120.00;
    if (d.includes("CONE")) return 62.00;
    if (d.includes("CAPACETE")) return 52.00;
    if (d.includes("OCULOS")) return 45.00;
    if (d.includes("CALCA")) return 88.00;
    if (d.includes("CAMISA")) return 95.00;
    if (d.includes("MACACAO")) return 165.00;
    if (d.includes("CHAPEU")) return 42.00;
    if (d.includes("BOLSA") || d.includes("BAINHA")) return 38.00;
    if (d.includes("FITA")) return 15.00;
    return 45.00;
  }

  // ── CONJUNTOS genéricos ──
  if (g === "CONJUNTO") {
    if (d.includes("ILUMINACAO")) return 350.00;
    return 250.00;
  }

  // ── DISPOSITIVOS ──
  if (g === "DISPOSITIVO") return 280.00;

  // ── EXTENSÃO ──
  if (d.includes("EXTENSAO") && d.includes("CARRETEL")) return 320.00;
  if (d.includes("EXTENSAO")) return 120.00;

  // ── RÁDIO ──
  if (d.includes("RADIO")) return 1850.00;

  // ── BUCHA ──
  if (d.includes("BUCHA")) return 0.45;

  // ── Fallback: dividir por 100 o atual ──
  const atual = Number(m.custo_fornecedor);
  if (atual > 100) return Number((atual / 100).toFixed(2));
  if (atual > 0) return atual;
  return 25.00; // default
}

async function main() {
  const [rows] = await p.query(
    "SELECT id, codigo_produto, descricao, custo_fornecedor, grupo, subgrupo FROM materiais WHERE tipo = 'produzido' ORDER BY id"
  );

  let atualizados = 0;
  for (const m of rows) {
    const novoPreco = precoPor(m);
    const atual = Number(m.custo_fornecedor);

    if (Math.abs(novoPreco - atual) < 0.01) continue; // já está correto

    await p.query("UPDATE materiais SET custo_fornecedor = ? WHERE id = ?", [novoPreco, m.id]);
    atualizados++;
    console.log(`  ✅ [${m.codigo_produto}] R$${atual.toFixed(2)} → R$${novoPreco.toFixed(2)} | ${m.descricao.substring(0,55)}`);
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Atualizados: ${atualizados}/${rows.length}`);
  console.log(`${"═".repeat(50)}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
