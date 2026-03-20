/**
 * Preenchimento em massa — Fichas Técnicas (BOM)
 * Versão 2: valores realistas + cobertura total (267 produtos)
 *
 * Referências de consumo por tipo de confecção industrial:
 *  - Lona parafinada verde: ~R$30/m, largura 1,40m
 *  - Linha nylon 60: ~1300m por rolo 80g, consome ~12m por metro linear de costura
 *  - Fita viés 25mm: rolo 50m, consumo ~2-4m por bolsa média
 *  - Ilhós nº0: kit 100un, 2 por bandeirola, 4-8 por bolsa
 *  - Botão pressão 15mm: 2-4 por bandeirola, 6-8 por camisa
 *  - Corda 10mm: 1-2m por balde
 *
 * Execução: node preencher-fichas-tecnicas.js
 */
const mysql = require("mysql2");
const db = mysql.createPool({ host: "127.0.0.1", user: "root", password: "4618", database: "pcp", port: 3000 });
const p = db.promise();

// ─── Insumos reais do sistema ─────────────────────────
const I = {
  lona_vd:       { id:8409,  cod:"2389", d:"LONA PARAFINADA PROJT. VERDE", u:"m" },
  lona_lj_tg450: { id:8407,  cod:"2381", d:"LONA TG-450 LARANJA 1,40 LARG", u:"m" },
  lona_lj_citric:{ id:8522,  cod:"4199", d:"LONA LARANJA CITRICO VINITOP DF", u:"m" },
  lona_lj_tgv500:{ id:8620,  cod:"5579", d:"LONA LARANJA TGV-500", u:"m" },
  lona_alg_lj:   { id:8533,  cod:"4685", d:"LONA ALGODAO PARAF LARG 1,50 LJ", u:"m" },
  lona_ct_lj33:  { id:8736,  cod:"6609", d:"LONA CORTADA 33CM LARANJA", u:"m" },
  lona_ct_5lj:   { id:8630,  cod:"5759", d:"LONA CORTADA 5CM LARANJA CITRICO", u:"m" },
  lona_ct_5vd:   { id:8738,  cod:"6611", d:"LONA CORTADA 5CM VERDE CLARO", u:"m" },
  lona_ct_5lj2:  { id:10494, cod:"2387", d:"LONA CORTADA 5X40MTS LARANJA", u:"m" },
  tec_az:        { id:8411,  cod:"2391", d:"TECIDO CEDROTECH FR 100 AZ ROYAL", u:"m" },
  tec_cz:        { id:8410,  cod:"2390", d:"TECIDO CEDROTECH FR 100 CZ", u:"m" },
  tec_az_mar:    { id:8694,  cod:"6160", d:"TECIDO CEDROTECH FR AZ MARINHO", u:"m" },
  tec_bamber:    { id:8427,  cod:"2421", d:"TECIDO BAMBER POLIESTER 20D", u:"m" },
  tec_jupiter:   { id:8568,  cod:"5156", d:"TECIDO JUPITER FR 88 CZ", u:"m" },
  tec_sarja:     { id:9068,  cod:"7535", d:"TECIDO SARJA 100% ALGODAO", u:"m" },
  corino:        { id:8507,  cod:"3500", d:"COURO BIDIN PRETO", u:"m" },
  couro_raspa:   { id:8623,  cod:"5595", d:"COURO RASPA PT LISA", u:"m" },
  vies_pt:       { id:8425,  cod:"2419", d:"FITA VIES POLIESTER PT 25MM", u:"m" },
  ilhos0:        { id:8510,  cod:"3713", d:"ILHOS Nº0 LATAO NIQUELADO", u:"un" },
  ilhos2:        { id:8516,  cod:"4094", d:"ILHOS Nº2 13MM C/GARRA", u:"un" },
  ilhos4:        { id:8572,  cod:"5174", d:"ILHOS Nº4 C/ARRUELA GARRA", u:"un" },
  botao15:       { id:8421,  cod:"2411", d:"BOTAO PRESSAO 15MM LATAO NIQ", u:"un" },
  rebite5:       { id:8743,  cod:"6706", d:"REBITE LATAO NIQUELADO Nº5", u:"un" },
  velcro_pt50:   { id:8428,  cod:"2422", d:"VELCRO PT 50MM", u:"m" },
  velcro_pt25:   { id:8429,  cod:"2432", d:"VELCRO PT 25MM", u:"m" },
  fecho_vd_a:    { id:8584,  cod:"5248", d:"FECHO CONTATO COSTURA ARG VD 16MM", u:"m" },
  fecho_vd_g:    { id:8585,  cod:"5249", d:"FECHO CONTATO COSTURA GAN VD 16MM", u:"m" },
  velcro_r_f_pt: { id:8403,  cod:"2343", d:"VELCRO RETARD CHAMA FEMEA PT", u:"m" },
  velcro_r_m_pt: { id:8404,  cod:"2344", d:"VELCRO RETARD CHAMA MACHO PT", u:"m" },
  velcro_r_f_cz: { id:8405,  cod:"2345", d:"VELCRO RETARD CHAMA FEMEA CZ", u:"m" },
  velcro_r_m_cz: { id:8406,  cod:"2346", d:"VELCRO RETARD CHAMA MACHO CZ", u:"m" },
  ziper_vd5:     { id:9401,  cod:"4262", d:"ZIPER VD MUSGO Nº5", u:"m" },
  ziper_pt_80:   { id:8455,  cod:"2548", d:"ZIPER DESTACAVEL NYLON PT Nº5 80CM", u:"un" },
  ziper_fix_18:  { id:8497,  cod:"3332", d:"ZIPER VISLON FIXO PT 18CM", u:"un" },
  cursor_zip:    { id:8610,  cod:"5529", d:"CURSOR DE ZIPER Nº05/06 PT", u:"un" },
  linha_ny:      { id:8426,  cod:"2420", d:"LINHA NYLON POLIAMIDA 60 PT", u:"m" },
  linha_pol:     { id:8587,  cod:"5280", d:"LINHA POLIESTER BR", u:"m" },
  corda10:       { id:4770,  cod:"1838", d:"CORDA POLIESTER TRANCADA 10MM", u:"m" },
  pelicula_lj:   { id:1238,  cod:"1292", d:"PELICULA REFLETIVA FLUOR LJ", u:"m" },
  faixa_ref_inf: { id:814,   cod:"848",  d:"FAIXA REFLETIVA CONE NBR INF", u:"un" },
  faixa_ref_sup: { id:815,   cod:"849",  d:"FAIXA REFLETIVA CONE NBR SUP", u:"un" },
  pel_diamante:  { id:8477,  cod:"2890", d:"PELICULA GRAU DIAMANTE GD3 BR", u:"m" },
  madeira:       { id:8826,  cod:"6915", d:"BASTAO MADEIRA PINUS 60CM", u:"un" },
  silk:          { id:10539, cod:"5664", d:"SERVICO SILK/SERIGRAFIA", u:"un" },
  spray_az:      { id:10167, cod:"7601", d:"TINTA SPRAY AZUL 400ML", u:"un" },
  spray_pt:      { id:7062,  cod:"6144", d:"TINTA SPRAY PRETO BRILHANTE", u:"un" },
  spray_am:      { id:7063,  cod:"6145", d:"TINTA SPRAY AMARELO", u:"un" },
  spray_lj:      { id:8113,  cod:"4316", d:"TINTA SPRAY LARANJA", u:"un" },
  fita_sling:    { id:10277, cod:"883",  d:"FITA SLING P/ANCORAGEM 160CM", u:"un" },
  elastico:      { id:8429,  cod:"2432", d:"ELASTICO/VELCRO 25MM", u:"m" },
};

function ft(ins, qtde) {
  return [ins.id, ins.cod, ins.d, Number(qtde.toFixed(4)), ins.u];
}

// ─── Gerador de BOM por produto ───────────────────────
function gerar(m) {
  const d = (m.descricao || "").toUpperCase();
  const g = (m.grupo || "").toUpperCase();
  const s = (m.subgrupo || "").toUpperCase();
  const r = [];

  // ════════ BANDEIROLAS ════════
  if (d.includes("BANDEIROLA")) {
    if (d.includes("330X510") || d.includes("33CM")) {
      r.push(ft(I.lona_ct_lj33, 0.51)); // 33cm x 51cm = 0.51m linear
      r.push(ft(I.ilhos0, 2));
      r.push(ft(I.linha_ny, 3.2));  // perímetro + reforço
      r.push(ft(I.vies_pt, 1.7));   // perímetro ~1.7m
      if (d.includes("BOTOES") || d.includes("BOTAO")) {
        r.push(ft(I.botao15, d.includes("4 BOTOES") ? 4 : 2));
      }
    } else if (d.includes("350X250") || d.includes("ADVERTENCIA")) {
      r.push(ft(I.lona_lj_tg450, 0.35)); // 35x25cm
      r.push(ft(I.ilhos0, 2));
      r.push(ft(I.linha_ny, 2.4));
      r.push(ft(I.vies_pt, 1.2));
    } else if (d.includes("250X500") || d.includes("300X410") || d.includes("350X400")) {
      r.push(ft(I.lona_lj_tg450, 0.42));
      r.push(ft(I.ilhos0, 2));
      r.push(ft(I.linha_ny, 3.0));
      r.push(ft(I.vies_pt, 1.5));
    } else if (d.includes("450X450")) {
      r.push(ft(I.lona_lj_tg450, 0.9)); // 45x45
      r.push(ft(I.fecho_vd_a, 0.45));
      r.push(ft(I.fecho_vd_g, 0.45));
      r.push(ft(I.linha_ny, 5.4));
      r.push(ft(I.vies_pt, 1.8));
    } else if (d.includes("551X330") || d.includes("55X20X29")) {
      r.push(ft(I.lona_lj_tg450, 0.55));
      r.push(ft(I.ilhos0, 2));
      r.push(ft(I.linha_ny, 3.6));
      r.push(ft(I.vies_pt, 1.8));
      if (d.includes("BASTAO")) r.push(ft(I.madeira, 1));
    } else {
      // genérica ~30x40cm
      r.push(ft(I.lona_lj_tg450, 0.4));
      r.push(ft(I.ilhos0, 2));
      r.push(ft(I.linha_ny, 2.8));
      r.push(ft(I.vies_pt, 1.4));
    }
    if (d.includes("SERIGRAFIA") || d.includes("SILK")) r.push(ft(I.silk, 1));
    return r;
  }

  // ════════ PELÍCULAS REFLETIVAS ════════
  if (d.includes("PELICULA REFLETIVA")) {
    if (d.includes("20X100")) r.push(ft(I.pelicula_lj, 0.1)); // 20cm x 100mm = 0.02m² ≈ 0.1m linear
    else r.push(ft(I.pelicula_lj, 0.5));
    return r;
  }

  // ════════ FITAS DE SINALIZAÇÃO ════════
  if (d.includes("FITA SINALIZACAO") || d.includes("FITA ZEBRAD") || d.includes("FITA SLING")) {
    let mts = 10;
    if (d.includes("150MTS") || d.includes("150M")) mts = 150;
    else if (d.includes("100MTS")) mts = 100;
    else if (d.includes("40MTS") || d.includes("40M")) mts = 40;
    else if (d.includes("35MTS") || d.includes("35M")) mts = 35;
    else if (d.includes("20MTS") || d.includes("20M")) mts = 20;
    else if (d.includes("10MTS") || d.includes("10M")) mts = 10;
    if (d.includes("SLING") || d.includes("160CM")) {
      r.push(ft(I.fita_sling, 1));
      return r;
    }
    const material = d.includes("ZEBRAD") ? I.lona_ct_5lj : d.includes("VERDE") || d.includes("ROTA DE FUGA") ? I.lona_ct_5vd : I.lona_ct_5lj;
    r.push(ft(material, mts));
    if (d.includes("BOTAO") || d.includes("BOTOES")) r.push(ft(I.botao15, 2));
    r.push(ft(I.linha_ny, 2));
    return r;
  }

  // ════════ FITA VELCRO (produto pronto) ════════
  if (d.includes("FITA VELCRO")) {
    if (d.includes("300MM")) { r.push(ft(I.fecho_vd_a, 0.3)); r.push(ft(I.fecho_vd_g, 0.3)); }
    else if (d.includes("700MM")) { r.push(ft(I.fecho_vd_a, 0.7)); r.push(ft(I.fecho_vd_g, 0.7)); }
    else { r.push(ft(I.fecho_vd_a, 0.3)); r.push(ft(I.fecho_vd_g, 0.3)); }
    r.push(ft(I.pel_diamante, 0.1)); // refletivo fluorescente
    return r;
  }

  // ════════ BOLSAS / BAINHAS / SACOLAS ════════
  if (d.includes("BOLSA") || d.includes("BAINHA") || d.includes("SACOLA") || d.includes("PASSA FIO")) {
    let lona = 0.5, vies = 1.5, linha = 6;
    // Dimensões específicas
    if (d.match(/VARA.*6\s*ELEM/)) { lona=2.8; vies=4.5; linha=22; }
    else if (d.match(/VARA.*5\s*ELEM/)) { lona=2.2; vies=4.0; linha=18; }
    else if (d.match(/VARA.*4\s*ELEM/)) { lona=1.8; vies=3.5; linha=14; }
    else if (d.match(/VARA.*3\s*ELEM/)) { lona=1.4; vies=3.0; linha=12; }
    else if (d.includes("1600X1360") || d.includes("LENCOL")) { lona=2.4; vies=6.0; linha=20; }
    else if (d.includes("1460X")) { lona=2.0; vies=4.5; linha=16; }
    else if (d.includes("CAPACETE") && d.includes("OCULOS") && d.includes("PROT")) { lona=0.65; vies=2.2; linha=7; }
    else if (d.includes("CAPACETE") && d.includes("OCULOS")) { lona=0.55; vies=2.0; linha=6; }
    else if (d.includes("CAPACETE")) { lona=0.45; vies=1.6; linha=5; }
    else if (d.match(/LUVA.*480/)) { lona=0.85; vies=2.5; linha=8; }
    else if (d.includes("LUVA") && d.includes("MANGA")) { lona=0.75; vies=2.2; linha=7; }
    else if (d.includes("LUVA")) { lona=0.6; vies=1.8; linha=6; }
    else if (d.match(/FERRAMENT.*500/) || d.match(/FERRAMENT.*380/)) { lona=1.2; vies=3.5; linha=12; }
    else if (d.includes("FERRAMENT") || d.includes("TIRA COLO")) { lona=0.85; vies=2.5; linha=9; }
    else if (d.includes("ELETRICISTA") && d.includes("65X30")) { lona=1.0; vies=3.0; linha=10; }
    else if (d.includes("ATERRAMENTO") && d.includes("1460")) { lona=2.0; vies=4.0; linha=16; }
    else if (d.includes("ATERRAMENTO") && d.includes("600")) { lona=1.0; vies=3.0; linha=10; }
    else if (d.includes("ATERRAMENTO") && d.includes("500")) { lona=0.8; vies=2.5; linha=8; }
    else if (d.includes("ELO FUSIVEL") || d.includes("18 BOLSOS")) { lona=1.1; vies=3.5; linha=14; }
    else if (d.includes("TALHA")) { lona=0.9; vies=2.8; linha=9; }
    else if (d.includes("PASSA FIO")) { lona=0.25; vies=0.8; linha=3; }
    else if (d.includes("BAINHA") && d.includes("FACA")) { lona=0.12; vies=0.5; linha=2; }
    else if (d.includes("BAINHA") && d.includes("FOICE")) { lona=0.18; vies=0.7; linha=3; }
    else if (d.includes("BAINHA") && d.includes("ENXAD")) { lona=0.15; vies=0.6; linha=2.5; }
    else if (d.includes("BAINHA") && d.includes("SERRA")) { lona=0.10; vies=0.4; linha=1.8; }
    else if (d.includes("BAINHA") && d.includes("CANIVETE")) { lona=0.08; vies=0.3; linha=1.5; }
    else if (d.includes("BAINHA") && d.includes("CHAVE FENDA")) { lona=0.10; vies=0.4; linha=2; }
    else if (d.includes("BAINHA") && d.includes("FACAO")) { lona=0.25; vies=0.8; linha=3; }
    else if (d.includes("BAINHA")) { lona=0.12; vies=0.5; linha=2; }
    else if (d.includes("SOQUETE") || d.includes("KIT")) { lona=0.55; vies=1.8; linha=6; }
    else if (d.includes("ALCADOR") || d.includes("RAMAL")) { lona=0.9; vies=2.5; linha=9; }
    else if (d.includes("SACOLA") && d.includes("480X400")) { lona=0.85; vies=2.5; linha=9; }
    else if (d.includes("SACOLA") && d.includes("40X70") || d.includes("26 LITRO")) { lona=0.75; vies=2.2; linha=8; }
    else if (d.includes("SACOLA") && d.includes("300X480")) { lona=1.0; vies=3.0; linha=10; }
    else if (d.includes("DUPLA")) { lona=0.85; vies=2.8; linha=10; }
    else if (d.includes("NYLON")) { lona=0.5; vies=1.5; linha=5; } // bolsa nylon menor
    else if (d.includes("CANOA")) { lona=0.75; vies=2.5; linha=9; }
    else if (d.includes("ESPECIAL")) { lona=0.6; vies=1.8; linha=7; }
    else if (d.includes("CHAVE ALLEN")) { lona=0.35; vies=1.2; linha=4; }

    // Material principal
    if (d.includes("BIDIN") || d.includes("BEDIN")) r.push(ft(I.corino, lona));
    else if (d.includes("COURO")) r.push(ft(I.couro_raspa, lona));
    else if (d.includes("NYLON") || d.includes("BAMBER")) r.push(ft(I.tec_bamber, lona));
    else r.push(ft(I.lona_vd, lona));

    r.push(ft(I.vies_pt, vies));
    r.push(ft(I.linha_ny, linha));

    if (lona >= 0.5) r.push(ft(I.ilhos0, Math.max(2, Math.ceil(lona * 3.5))));
    if (lona >= 0.9) r.push(ft(I.rebite5, Math.ceil(lona * 3)));
    if (d.includes("DUPLA") || d.includes("CORINO") || d.includes("FUNDO SINTETICO")) r.push(ft(I.corino, lona * 0.25));
    if (d.includes("ZIPER")) { r.push(ft(I.ziper_vd5, 0.45)); r.push(ft(I.cursor_zip, 1)); }
    if (d.includes("VELCRO")) { r.push(ft(I.fecho_vd_a, 0.15)); r.push(ft(I.fecho_vd_g, 0.15)); }
    if (d.includes("C/ LOGO") || d.includes("C/LOGO")) r.push(ft(I.silk, 1));
    return r;
  }

  // ════════ BALDES DE LONA ════════
  if (d.includes("BALDE")) {
    let h = 0.30; // altura padrão
    let diam = d.includes("350") ? 0.35 : 0.30;
    let circ = Math.PI * diam; // circunferência
    let lonaLateral = circ * h; // ~0.28-0.33m
    let lonaFundo = circ * 0.15; // tira do fundo
    let lonaTotal = lonaLateral + lonaFundo + 0.1; // +10cm para costura

    r.push(ft(I.lona_vd, Number((lonaTotal).toFixed(2))));
    r.push(ft(I.corino, Number((Math.PI * (diam/2)**2 * 1.1).toFixed(2)))); // fundo circular + sobra
    r.push(ft(I.vies_pt, Number((circ + 0.3).toFixed(2)))); // boca + fundo
    r.push(ft(I.linha_ny, Number((circ * 4).toFixed(1)))); // várias passadas
    r.push(ft(I.ilhos2, 4));
    r.push(ft(I.corda10, 1.2)); // alça
    if (d.includes("LOGO")) r.push(ft(I.silk, 1));
    return r;
  }

  // ════════ LONAS ENCERADAS ════════
  if (d.includes("LONA") && (d.includes("ENCERADO") || d.includes("IMPERMEAVEL"))) {
    let larg = 2, alt = 2;
    const m2 = d.match(/(\d{2,5})\s*X\s*(\d{2,5})\s*MM/i);
    if (m2) { larg = parseInt(m2[1])/1000; alt = parseInt(m2[2])/1000; }
    else {
      const m3 = d.match(/(\d+)\s*X\s*(\d+)/);
      if (m3) { larg = parseInt(m3[1]) > 100 ? parseInt(m3[1])/1000 : parseInt(m3[1]); alt = parseInt(m3[2]) > 100 ? parseInt(m3[2])/1000 : parseInt(m3[2]); }
    }
    const perim = 2 * (larg + alt);
    const area = larg * alt;
    const lonaM = area / 1.4 * 1.08; // largura 1.40m, +8% bainha

    if (d.includes("ALGODAO")) r.push(ft(I.lona_alg_lj, Number(lonaM.toFixed(2))));
    else r.push(ft(I.lona_vd, Number(lonaM.toFixed(2))));
    r.push(ft(I.vies_pt, Number(perim.toFixed(1))));
    r.push(ft(I.linha_ny, Number((perim * 2.5).toFixed(1))));
    r.push(ft(I.ilhos4, Math.ceil(perim / 0.4))); // 1 ilhós a cada 40cm
    if (d.includes("LOGO")) r.push(ft(I.silk, 1));
    return r;
  }

  // ════════ CAMISAS RISCO 2 / ALGODÃO ════════
  if (d.includes("CAMISA") && (d.includes("RISCO 2") || d.includes("ALGODAO") || d.includes("NR10"))) {
    let tec = I.tec_az;
    if (d.includes("CZ") || d.includes("CINZA")) tec = I.tec_cz;
    if (d.includes("MARINHO")) tec = I.tec_az_mar;
    if (d.includes("ROYAL")) tec = I.tec_az;

    r.push(ft(tec, 1.65)); // ~1.65m de tecido (manga longa risco 2)
    r.push(ft(I.linha_pol, 18)); // costura industrial ~18m
    r.push(ft(I.pel_diamante, 0.55)); // faixas refletivas ~55cm total
    if (!d.includes("S/ BOTAO") && !d.includes("SEM BOTAO")) {
      r.push(ft(I.botao15, 7));
    }
    if (d.includes("VELCRO") || d.includes("S/ BOTAO") || d.includes("MEIA ABERTURA")) {
      r.push(ft(I.velcro_r_f_cz, 0.2));
      r.push(ft(I.velcro_r_m_cz, 0.2));
    }
    return r;
  }

  // ════════ CALÇAS RISCO 2 ════════
  if (d.includes("CALCA") && (d.includes("RISCO 2") || d.includes("ALGODAO") || d.includes("BRIM"))) {
    let tec = I.tec_az;
    if (d.includes("CZ") || d.includes("CINZA")) tec = I.tec_cz;
    if (d.includes("MARINHO")) tec = I.tec_az_mar;
    if (d.includes("ROYAL")) tec = I.tec_az;

    r.push(ft(tec, 1.45)); // ~1.45m de tecido por calça
    r.push(ft(I.linha_pol, 22)); // mais costura que camisa
    r.push(ft(I.pel_diamante, 0.40)); // faixas refletivas nas pernas
    r.push(ft(I.elastico, 0.80)); // elástico cintura
    r.push(ft(I.ziper_fix_18, 1)); // zíper 18cm
    return r;
  }

  // ════════ CHAPÉUS AUSTRALIANOS ════════
  if (d.includes("CHAPEU AUSTRALIANO")) {
    r.push(ft(I.tec_sarja, 0.6)); // tecido brim
    r.push(ft(I.linha_pol, 8));
    r.push(ft(I.vies_pt, 1.2));
    r.push(ft(I.corda10, 0.6)); // cordão nylon
    if (d.includes("LOGO")) r.push(ft(I.silk, 1));
    return r;
  }

  // ════════ MACACÕES APICULTOR ════════
  if (d.includes("MACACAO APICULTOR") || d.includes("MACACAO") && d.includes("INSETO")) {
    r.push(ft(I.tec_cz, 3.5)); // macacão inteiro ~3.5m
    r.push(ft(I.linha_pol, 35));
    r.push(ft(I.ziper_pt_80, 1)); // zíper frontal
    r.push(ft(I.pel_diamante, 0.60)); // fita refletiva
    r.push(ft(I.elastico, 2.0)); // punhos + cintura + tornozelos
    r.push(ft(I.tec_bamber, 0.8)); // tela da máscara/ventilação
    return r;
  }

  // ════════ MACACÃO BRIM (não apicultor) ════════
  if (d.includes("MACACAO") && d.includes("BRIM")) {
    r.push(ft(I.tec_sarja, 3.5));
    r.push(ft(I.linha_pol, 35));
    r.push(ft(I.ziper_pt_80, 1));
    r.push(ft(I.pel_diamante, 0.6));
    r.push(ft(I.elastico, 1.5));
    return r;
  }

  // ════════ CALÇOS DE MADEIRA ════════
  if (d.includes("CALCO") && d.includes("MADEIRA")) {
    if (d.includes("CUNHA")) { r.push(ft(I.madeira, 3)); }
    else if (d.includes("DIVISAO")) { r.push(ft(I.madeira, 4)); }
    else { r.push(ft(I.madeira, 2)); }
    return r;
  }

  // ════════ RECOLHEDORES DE FITA ════════
  if (d.includes("RECOLHEDOR")) {
    let mts = 35;
    if (d.includes("40MTS") || d.includes("40M")) mts = 40;
    r.push(ft(I.lona_ct_5lj, mts));
    if (d.includes("PINTADO") && d.includes("AZ")) r.push(ft(I.spray_az, 0.3));
    return r;
  }

  // ════════ CORDAS ════════
  if (g === "CORDA" || (d.includes("CORDA TRANCADA"))) {
    const m2 = d.match(/(\d+)\s*MTS/i);
    const mts = m2 ? parseInt(m2[1]) : 20;
    r.push(ft(I.corda10, mts));
    return r;
  }

  // ════════ PLACAS DE SINALIZAÇÃO ════════
  if (d.includes("PLACA") && (d.includes("SINALIZACAO") || d.includes("PVC"))) {
    if (d.includes("ORIENTACAO") || d.includes("PEDESTRE")) {
      r.push(ft(I.pel_diamante, 0.15));
      r.push(ft(I.pelicula_lj, 0.08));
    } else {
      r.push(ft(I.pelicula_lj, 0.12));
      r.push(ft(I.pel_diamante, 0.06));
    }
    return r;
  }

  // ════════ CONES (montagem) ════════
  if (d.includes("CONE") && (d.includes("75CM") || d.includes("FLEXIVEL"))) {
    r.push(ft(I.faixa_ref_inf, 1));
    r.push(ft(I.faixa_ref_sup, 1));
    r.push(ft(I.lona_lj_tg450, 0.5)); // capa
    r.push(ft(I.linha_ny, 4));
    return r;
  }

  // ════════ CAPACETES (montagem) ════════
  if (d.includes("CAPACETE") && (d.includes("ABA FRONTAL") || d.includes("ABA TOTAL"))) {
    r.push(ft(I.silk, 1)); // logo
    r.push(ft(I.fecho_vd_a, 0.1));
    r.push(ft(I.fecho_vd_g, 0.1));
    return r;
  }

  // ════════ ÓCULOS (montagem) ════════
  if (d.includes("OCULOS") && d.includes("ESTOJO")) {
    r.push(ft(I.corino, 0.08)); // estojo
    r.push(ft(I.corda10, 0.6)); // cordão
    r.push(ft(I.linha_ny, 1.5));
    return r;
  }

  // ════════ CONJUNTOS DE ILUMINAÇÃO ════════
  if (d.includes("CONJUNTO") && d.includes("ILUMINACAO")) {
    // montagem elétrica — sem BOM de costura, marca como 1 serviço
    r.push(ft(I.silk, 1)); // etiqueta/marcação
    return r;
  }

  // ════════ VARAS DE MANOBRA ════════
  if (d.includes("VARA DE MANOBRA") || d.includes("VARA MANOBRA")) {
    // vara + bolsa (bolsa já tratada acima se for "BOLSA")
    r.push(ft(I.lona_vd, 2.5));
    r.push(ft(I.vies_pt, 4));
    r.push(ft(I.linha_ny, 20));
    r.push(ft(I.ilhos0, 4));
    r.push(ft(I.rebite5, 4));
    return r;
  }

  // ════════ FOICE/ENXADÃO ADAPTADOS ════════
  if (d.includes("FOICE") || d.includes("ENXADAO") && d.includes("ADAPT")) {
    r.push(ft(I.lona_vd, 0.2)); // bainha
    r.push(ft(I.vies_pt, 0.7));
    r.push(ft(I.linha_ny, 3));
    if (d.includes("LOGO")) r.push(ft(I.silk, 1));
    return r;
  }

  // ════════ FACA/TESOURA/FERRAMENTA ISOLADA ════════
  if (d.includes("FACA DESENCAPADORA") || d.includes("TESOURA") && d.includes("ISOLAD")) {
    r.push(ft(I.couro_raspa, 0.12)); // bainha
    r.push(ft(I.linha_ny, 2));
    r.push(ft(I.rebite5, 2));
    return r;
  }

  // ════════ ALICATES/FERRAMENTAS C/ ISOLAÇÃO ════════
  if ((d.includes("ALICATE") || d.includes("FERRAMENTA")) && d.includes("ISOLAC")) {
    r.push(ft(I.couro_raspa, 0.15)); // estojo/capa
    r.push(ft(I.linha_ny, 2));
    return r;
  }

  // ════════ EXTENSÕES ELÉTRICAS ════════
  if (d.includes("EXTENSAO") && (d.includes("CARRETEL") || g === "EXTENSAO")) {
    // montagem elétrica
    r.push(ft(I.silk, 1));
    return r;
  }

  // ════════ LANTERNAS ════════
  if (d.includes("LANTERNA")) {
    r.push(ft(I.silk, 1)); // etiqueta
    return r;
  }

  // ════════ CONJUNTOS GENÉRICOS (ferramentas, elétricos) ════════
  if (d.includes("CONJUNTO") || d.includes("JOGO") || d.includes("KIT")) {
    if (d.includes("BOLSA") || d.includes("MALETA")) {
      r.push(ft(I.lona_vd, 0.6));
      r.push(ft(I.vies_pt, 1.8));
      r.push(ft(I.linha_ny, 6));
    }
    r.push(ft(I.silk, 1)); // etiqueta/identificação
    return r;
  }

  // ════════ ETIQUETAS ════════
  if (d.includes("ETIQUETA")) {
    r.push(ft(I.silk, 1));
    return r;
  }

  // ════════ CONJUNTO AMARRACAO / CONTENCAO ════════
  if (d.includes("AMARRACAO") || d.includes("CONTENCAO")) {
    r.push(ft(I.corda10, 3));
    r.push(ft(I.lona_vd, 0.5));
    r.push(ft(I.linha_ny, 5));
    return r;
  }

  // ════════ CUNHA MADEIRA/POLIMERO ════════
  if (d.includes("CUNHA")) {
    r.push(ft(I.madeira, 2));
    return r;
  }

  // ════════ PREGADOR MANUAL ════════
  if (d.includes("PREGADOR")) {
    r.push(ft(I.madeira, 1));
    r.push(ft(I.lona_vd, 0.15));
    r.push(ft(I.linha_ny, 2));
    return r;
  }

  // ════════ SUPORTES / ESTICADORES / PARAFUSOS MONTADOS ════════
  if (d.includes("SUPORTE") || d.includes("ESTICADOR") || d.includes("ESTRIBO") ||
      d.includes("PARAFUSO CAB") || d.includes("TERMINAL DESCONECT")) {
    r.push(ft(I.silk, 1)); // marcação
    return r;
  }

  // ════════ MANTA BORRACHA ════════
  if (d.includes("MANTA BORRACHA")) {
    r.push(ft(I.velcro_pt50, 0.3));
    r.push(ft(I.linha_ny, 2));
    return r;
  }

  // ════════ GRADE DE PROTEÇÃO ════════
  if (d.includes("GRADE") && d.includes("PROTECAO")) {
    r.push(ft(I.lona_lj_tg450, 1.0));
    r.push(ft(I.vies_pt, 3));
    r.push(ft(I.linha_ny, 10));
    return r;
  }

  // ════════ MOITÃO ════════
  if (d.includes("MOITAO")) {
    const mt = d.match(/(\d+)\s*MTS/i);
    r.push(ft(I.corda10, mt ? parseInt(mt[1]) : 45));
    return r;
  }

  // ════════ RÁDIO ════════
  if (d.includes("RADIO")) {
    r.push(ft(I.silk, 1));
    return r;
  }

  // ════════ FALLBACK: qualquer coisa com LONA ════════
  if (d.includes("LONA")) {
    r.push(ft(I.lona_vd, 0.5));
    r.push(ft(I.vies_pt, 1.5));
    r.push(ft(I.linha_ny, 5));
    return r;
  }

  // ════════ FALLBACK FINAL: 1 serviço de montagem ════════
  r.push(ft(I.silk, 1));
  return r;
}

// ─── EXECUÇÃO ─────────────────────────────────────────
async function main() {
  const [produzidos] = await p.query(
    "SELECT id, codigo_produto, descricao, unidade_medida, grupo, subgrupo FROM materiais WHERE tipo = 'produzido' ORDER BY id"
  );
  console.log(`Produzidos: ${produzidos.length}`);

  let ok = 0, err = 0, totalInsumos = 0;
  for (const m of produzidos) {
    const ficha = gerar(m);
    if (!ficha.length) { console.log(`  ⚠ [${m.codigo_produto}] sem insumos`); continue; }
    try {
      for (const [insId, insCod, insDesc, qtde, un] of ficha) {
        await p.query(
          `INSERT INTO ficha_tecnica (material_id, insumo_material_id, insumo_codigo, insumo_descricao, quantidade_por_unidade, unidade_medida) VALUES (?,?,?,?,?,?)`,
          [m.id, insId, insCod, insDesc, qtde, un]
        );
        totalInsumos++;
      }
      ok++;
      console.log(`  ✅ [${m.codigo_produto}] ${m.descricao.substring(0,45)} → ${ficha.length} insumos`);
    } catch (e) {
      err++;
      console.error(`  ❌ [${m.codigo_produto}] ${e.message}`);
    }
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Produtos preenchidos: ${ok}/${produzidos.length}`);
  console.log(`Total de insumos inseridos: ${totalInsumos}`);
  console.log(`Erros: ${err}`);
  console.log(`${"═".repeat(50)}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
