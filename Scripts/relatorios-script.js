// ═══════════════════════════════════════════════════════
//  RELATÓRIOS — Script Frontend
//  Sistema PCP
// ═══════════════════════════════════════════════════════
import { getUser, logout, apiRequest, showToast as toastAuth } from "../Scripts/auth.js";

// ── Estado global ──────────────────────────────────────
let tipoAtivo   = 'estoque';
let subAtivo    = 'materiais';
let dadosAtivos = [];

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  if (user) {
    const el = document.getElementById('userInfo');
    if (el) el.textContent = user.nome || user.usuario || '';
  }
  document.getElementById('btnLogout')?.addEventListener('click', logout);

  // Datas padrão: primeiro dia do mês atual até hoje
  const hoje = new Date();
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  document.getElementById('filtroFim').value   = fmt(hoje);
  document.getElementById('filtroInicio').value = fmt(primeiro);
});

function fmt(d) {
  return d.toISOString().split('T')[0];
}

// ── Seleção de relatório ───────────────────────────────
window.selecionarRelatorio = function(tipo) {
  tipoAtivo = tipo;
  document.querySelectorAll('.report-card').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-type="${tipo}"]`)?.classList.add('active');

  // Mostra/oculta filtros específicos
  document.getElementById('filtroStatusOPWrap').style.display    = tipo === 'ops'    ? '' : 'none';
  document.getElementById('filtroStatusPedidoWrap').style.display= tipo === 'pedidos'? '' : 'none';
  document.getElementById('subTabsWrap').style.display           = tipo === 'estoque'? '' : 'none';

  limparResultados();
};

window.selecionarSub = function(sub) {
  subAtivo = sub;
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-sub="${sub}"]`)?.classList.add('active');
  limparResultados();
};

// ── Gerar relatório ────────────────────────────────────
window.gerarRelatorio = async function() {
  const inicio = document.getElementById('filtroInicio').value;
  const fim    = document.getElementById('filtroFim').value;

  if (!inicio || !fim) { toast('Selecione o período', 'warning'); return; }
  if (inicio > fim)    { toast('Data início maior que data fim', 'warning'); return; }

  const btnGerar = document.querySelector('.btn-gerar');
  btnGerar.textContent = 'Carregando...';
  btnGerar.disabled = true;

  try {
    let url = '';
    const p = new URLSearchParams({ data_inicio: inicio, data_fim: fim });

    if (tipoAtivo === 'estoque') {
      p.append('sub', subAtivo);
      url = `/relatorios/estoque?${p}`;
    } else if (tipoAtivo === 'pedidos') {
      const status = document.getElementById('filtroStatusPedido').value;
      if (status) p.append('status', status);
      url = `/relatorios/pedidos?${p}`;
    } else if (tipoAtivo === 'ops') {
      const status = document.getElementById('filtroStatusOP').value;
      if (status) p.append('status', status);
      url = `/relatorios/ops?${p}`;
    } else if (tipoAtivo === 'desempenho') {
      url = `/relatorios/desempenho?${p}`;
    }

    const json = await apiRequest(url);

    dadosAtivos = json.data || [];
    renderizarRelatorio(tipoAtivo, dadosAtivos, json.stats || {}, inicio, fim);

  } catch (e) {
    console.error(e);
    toast('Erro ao carregar relatório', 'error');
  } finally {
    btnGerar.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Gerar Relatório`;
    btnGerar.disabled = false;
  }
};

// ── Renderização principal ─────────────────────────────
function renderizarRelatorio(tipo, dados, stats, inicio, fim) {
  const tableCard  = document.getElementById('tableCard');
  const emptyState = document.getElementById('emptyState');
  const statsRow   = document.getElementById('statsRow');
  const btnExport  = document.getElementById('btnExport');

  if (!dados.length) {
    tableCard.style.display  = 'none';
    emptyState.style.display = '';
    emptyState.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🔍</div>
      <div class="empty-title">Nenhum registro encontrado</div>
      <div class="empty-desc">Tente ajustar o período ou os filtros</div>
    </div>`;
    statsRow.style.display = 'none';
    btnExport.disabled = true;
    return;
  }

  // Stats
  statsRow.style.display = '';
  statsRow.innerHTML = buildStats(tipo, dados, stats);

  // Tabela
  tableCard.style.display = '';
  emptyState.style.display = 'none';
  btnExport.disabled = false;

  const { colunas, linhas, rodape, titulo } = buildTabela(tipo, dados);

  document.getElementById('tableTitle').textContent = titulo;
  document.getElementById('tableCount').textContent = `${dados.length} registro${dados.length !== 1 ? 's' : ''}`;

  // Thead
  document.getElementById('reportThead').innerHTML =
    '<tr>' + colunas.map(c => `<th>${c.label}</th>`).join('') + '</tr>';

  // Tbody
  document.getElementById('reportTbody').innerHTML = linhas.map(row =>
    '<tr>' + colunas.map(c => `<td>${row[c.key] ?? '—'}</td>`).join('') + '</tr>'
  ).join('');

  // Tfoot
  document.getElementById('reportTfoot').innerHTML = rodape
    ? '<tr>' + rodape.map(v => `<td>${v}</td>`).join('') + '</tr>'
    : '';
}

// ── Stats por tipo ─────────────────────────────────────
function buildStats(tipo, dados, stats) {
  if (tipo === 'estoque' && subAtivo === 'materiais') {
    const total   = dados.reduce((s, r) => s + +r.subtotal, 0);
    const qtde    = dados.reduce((s, r) => s + +r.qtde, 0);
    const saidas  = new Set(dados.map(r => r.numero_saida)).size;
    const mats    = new Set(dados.map(r => r.codigo)).size;
    return statCards([
      { label: 'Saídas',         value: saidas,            color: 'blue'   },
      { label: 'Materiais',      value: mats,              color: 'green'  },
      { label: 'Qtde Total',     value: fmtNum(qtde),      color: 'amber'  },
      { label: 'Custo Total',    value: fmtBrl(total),     color: 'purple' },
    ]);
  }
  if (tipo === 'estoque' && subAtivo === 'insumos') {
    const total = dados.reduce((s, r) => s + +r.subtotal, 0);
    const qtde  = dados.reduce((s, r) => s + +r.qtde, 0);
    const ops   = new Set(dados.map(r => r.numero_op)).size;
    const mats  = new Set(dados.map(r => r.codigo)).size;
    return statCards([
      { label: 'OPs',            value: ops,               color: 'blue'   },
      { label: 'Insumos Dist.',  value: mats,              color: 'green'  },
      { label: 'Qtde Consumida', value: fmtNum(qtde),      color: 'amber'  },
      { label: 'Custo Insumos',  value: fmtBrl(total),     color: 'purple' },
    ]);
  }
  if (tipo === 'pedidos') {
    const total    = dados.reduce((s, r) => s + +(r.custo_producao || 0), 0);
    const clientes = new Set(dados.map(r => r.cliente)).size;
    const qtde     = dados.reduce((s, r) => s + +(r.qtde_produzida || 0), 0);
    return statCards([
      { label: 'Pedidos',        value: dados.length,      color: 'blue'   },
      { label: 'Clientes',       value: clientes,          color: 'green'  },
      { label: 'Qtde Produzida', value: fmtNum(qtde),      color: 'amber'  },
      { label: 'Custo Total',    value: fmtBrl(total),     color: 'purple' },
    ]);
  }
  if (tipo === 'ops') {
    const concluidas  = dados.filter(r => r.status === 'CONCLUIDA'  || r.status === 'Concluida').length;
    const emProducao  = dados.filter(r => r.status === 'EM_PRODUCAO'|| r.status === 'EmProducao').length;
    const abertas     = dados.filter(r => r.status === 'ABERTA'     || r.status === 'Aberta').length;
    const custoTotal  = dados.reduce((s, r) => s + +(r.custo_total || 0), 0);
    return statCards([
      { label: 'Total OPs',      value: dados.length,      color: 'blue'   },
      { label: 'Concluídas',     value: concluidas,        color: 'green'  },
      { label: 'Em Produção',    value: emProducao,        color: 'amber'  },
      { label: 'Custo Total',    value: fmtBrl(custoTotal),color: 'purple' },
    ]);
  }
  if (tipo === 'desempenho') {
    const totalProd = dados.reduce((s, r) => s + +(r.qtde_produzida || 0), 0);
    const totalSol  = dados.reduce((s, r) => s + +(r.qtde_solicitada || 0), 0);
    const efic      = totalSol > 0 ? Math.round((totalProd/totalSol)*100) : 0;
    const custo     = dados.reduce((s, r) => s + +(r.custo_total_insumos || 0), 0);
    return statCards([
      { label: 'Materiais',      value: dados.length,              color: 'blue'   },
      { label: 'Qtde Produzida', value: fmtNum(totalProd),         color: 'green'  },
      { label: 'Eficiência',     value: `${efic}%`, sub: 'atendimento',color: 'amber'},
      { label: 'Custo Insumos',  value: fmtBrl(custo),             color: 'purple' },
    ]);
  }
  return '';
}

function statCards(arr) {
  return arr.map(s => `
    <div class="stat-card">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value ${s.color}">${s.value}</div>
      ${s.sub ? `<div class="stat-sub">${s.sub}</div>` : ''}
    </div>`).join('');
}

// ── Colunas + linhas por relatório ─────────────────────
function buildTabela(tipo, dados) {

  // ── ESTOQUE / MATERIAIS ──
  if (tipo === 'estoque' && subAtivo === 'materiais') {
    const colunas = [
      { key: 'data_fmt',    label: 'Data' },
      { key: 'numero_saida',label: 'Nº Saída' },
      { key: 'codigo',      label: 'Código' },
      { key: 'descricao',   label: 'Descrição' },
      { key: 'qtde_fmt',    label: 'Qtde' },
      { key: 'unidade',     label: 'Un.' },
      { key: 'custo_unit_fmt', label: 'Custo Unit.' },
      { key: 'subtotal_fmt',   label: 'Subtotal' },
      { key: 'cliente',     label: 'Cliente' },
      { key: 'responsavel', label: 'Responsável' },
      { key: 'obs',         label: 'Observações' },
    ];
    const linhas = dados.map(r => ({
      ...r,
      data_fmt:        fmtData(r.data),
      qtde_fmt:        fmtNum(r.qtde),
      custo_unit_fmt:  fmtBrl(r.custo_unit),
      subtotal_fmt:    fmtBrl(r.subtotal),
      cliente:         r.cliente || '—',
      obs:             r.obs || '—',
    }));
    const totQtde  = dados.reduce((s,r)=>s+ +r.qtde, 0);
    const totCusto = dados.reduce((s,r)=>s+ +r.subtotal, 0);
    const rodape = [
      'TOTAL', '', '', '',
      fmtNum(totQtde), '', '',
      fmtBrl(totCusto), '', '', ''
    ];
    return { colunas, linhas, rodape, titulo: 'Saídas de Materiais' };
  }

  // ── ESTOQUE / INSUMOS ──
  if (tipo === 'estoque' && subAtivo === 'insumos') {
    const colunas = [
      { key: 'data_fmt',    label: 'Data OP' },
      { key: 'numero_op',   label: 'Nº OP' },
      { key: 'status_op_badge', label: 'Status OP' },
      { key: 'codigo',      label: 'Código' },
      { key: 'descricao',   label: 'Descrição Insumo' },
      { key: 'qtde_fmt',    label: 'Qtde' },
      { key: 'unidade',     label: 'Un.' },
      { key: 'custo_unit_fmt', label: 'Custo Unit.' },
      { key: 'subtotal_fmt',   label: 'Subtotal' },
      { key: 'material_op', label: 'Material Produzido' },
    ];
    const linhas = dados.map(r => ({
      ...r,
      data_fmt:         fmtData(r.data),
      qtde_fmt:         fmtNum(r.qtde),
      custo_unit_fmt:   fmtBrl(r.custo_unit),
      subtotal_fmt:     fmtBrl(r.subtotal),
      status_op_badge:  badgeStatus(r.status_op),
    }));
    const totQtde  = dados.reduce((s,r)=>s+ +r.qtde, 0);
    const totCusto = dados.reduce((s,r)=>s+ +r.subtotal, 0);
    const rodape   = ['TOTAL','','','','',fmtNum(totQtde),'',fmtBrl(totCusto),'',''];
    return { colunas, linhas, rodape, titulo: 'Insumos Consumidos em OPs' };
  }

  // ── PEDIDOS ──
  if (tipo === 'pedidos') {
    const colunas = [
      { key: 'data_final_fmt',  label: 'Data Finalização' },
      { key: 'cliente',         label: 'Cliente' },
      { key: 'estado',          label: 'UF' },
      { key: 'pedido_venda',    label: 'Pedido Venda' },
      { key: 'ordem_compra',    label: 'Ordem Compra' },
      { key: 'material',        label: 'Material' },
      { key: 'qtde_solicitada', label: 'Qtde Solic.' },
      { key: 'qtde_produzida',  label: 'Qtde Prod.' },
      { key: 'data_contratual_fmt', label: 'Data Contratual' },
      { key: 'status_badge',    label: 'Status' },
      { key: 'numero_op',       label: 'OP Vinculada' },
      { key: 'custo_producao_fmt', label: 'Custo Produção' },
    ];
    const linhas = dados.map(r => ({
      ...r,
      data_final_fmt:       fmtData(r.data_finalizada),
      data_contratual_fmt:  fmtData(r.data_contratual),
      status_badge:         badgeStatusPedido(r.status_producao),
      custo_producao_fmt:   fmtBrl(r.custo_producao),
      numero_op:            r.numero_op || '—',
    }));
    const totCusto = dados.reduce((s,r)=>s+ +(r.custo_producao||0), 0);
    const totProd  = dados.reduce((s,r)=>s+ +(r.qtde_produzida||0), 0);
    const rodape   = ['TOTAL','','','','','',
      fmtNum(dados.reduce((s,r)=>s+ +(r.qtde_solicitada||0),0)),
      fmtNum(totProd),'','','',fmtBrl(totCusto)];
    return { colunas, linhas, rodape, titulo: 'Relatório de Pedidos' };
  }

  // ── OPs ──
  if (tipo === 'ops') {
    const colunas = [
      { key: 'numero_op',        label: 'Nº OP' },
      { key: 'status_badge',     label: 'Status' },
      { key: 'material_codigo',  label: 'Código' },
      { key: 'material_descricao', label: 'Material' },
      { key: 'qtde_fmt',         label: 'Quantidade' },
      { key: 'unidade_medida',   label: 'Un.' },
      { key: 'custo_unit_fmt',   label: 'Custo Unit.' },
      { key: 'custo_total_fmt',  label: 'Custo Total' },
      { key: 'custo_insumos_fmt',label: 'Custo Insumos' },
      { key: 'total_pedidos',    label: 'Pedidos' },
      { key: 'total_atendido_fmt', label: 'Qtde Atendida' },
      { key: 'data_criacao_fmt', label: 'Criação' },
      { key: 'data_final_fmt',   label: 'Conclusão' },
      { key: 'usuario_nome',     label: 'Responsável' },
    ];
    const linhas = dados.map(r => ({
      ...r,
      status_badge:        badgeStatus(r.status),
      qtde_fmt:            fmtNum(r.quantidade),
      custo_unit_fmt:      fmtBrl(r.custo_unitario),
      custo_total_fmt:     fmtBrl(r.custo_total),
      custo_insumos_fmt:   fmtBrl(r.custo_insumos || 0),
      total_atendido_fmt:  fmtNum(r.total_atendido || 0),
      data_criacao_fmt:    fmtData(r.data_criacao),
      data_final_fmt:      fmtData(r.data_finalizacao),
      usuario_nome:        r.usuario_nome || '—',
    }));
    const totCusto   = dados.reduce((s,r)=>s+ +(r.custo_total||0), 0);
    const totInsumos = dados.reduce((s,r)=>s+ +(r.custo_insumos||0), 0);
    const rodape     = ['TOTAL','','','',
      fmtNum(dados.reduce((s,r)=>s+ +(r.quantidade||0),0)),
      '','',fmtBrl(totCusto),fmtBrl(totInsumos),
      dados.reduce((s,r)=>s+ +(r.total_pedidos||0),0),
      fmtNum(dados.reduce((s,r)=>s+ +(r.total_atendido||0),0)),
      '','',''];
    return { colunas, linhas, rodape, titulo: 'Ordens de Produção' };
  }

  // ── DESEMPENHO (extra) ──
  if (tipo === 'desempenho') {
    const colunas = [
      { key: 'material_codigo',    label: 'Código' },
      { key: 'material_descricao', label: 'Material' },
      { key: 'total_ops',          label: 'Total OPs' },
      { key: 'ops_concluidas',     label: 'Concluídas' },
      { key: 'qtde_produzida_fmt', label: 'Qtde Produzida' },
      { key: 'qtde_solicitada_fmt',label: 'Qtde Solicitada' },
      { key: 'eficiencia',         label: 'Eficiência' },
      { key: 'pedidos_atendidos',  label: 'Pedidos Atendidos' },
      { key: 'custo_medio_fmt',    label: 'Custo Médio Unit.' },
      { key: 'custo_total_insumos_fmt', label: 'Custo Total Insumos' },
      { key: 'estoque_atual_fmt',  label: 'Estoque Atual' },
    ];
    const linhas = dados.map(r => {
      const efic = r.qtde_solicitada > 0
        ? Math.round((r.qtde_produzida / r.qtde_solicitada) * 100)
        : 0;
      return {
        ...r,
        qtde_produzida_fmt:        fmtNum(r.qtde_produzida),
        qtde_solicitada_fmt:       fmtNum(r.qtde_solicitada),
        eficiencia:                `<span class="badge ${efic>=100?'badge-green':efic>=70?'badge-amber':'badge-red'}">${efic}%</span>`,
        custo_medio_fmt:           fmtBrl(r.custo_medio),
        custo_total_insumos_fmt:   fmtBrl(r.custo_total_insumos),
        estoque_atual_fmt:         fmtNum(r.estoque_atual),
      };
    });
    return { colunas, linhas, rodape: null, titulo: 'Relatório de Desempenho por Material' };
  }

  return { colunas: [], linhas: [], rodape: null, titulo: '' };
}

// ── Export XLSX ────────────────────────────────────────
window.exportarExcel = function() {
  if (!dadosAtivos.length) return;

  const { colunas, linhas, titulo } = buildTabela(tipoAtivo, dadosAtivos);

  // Remove badges HTML para exportação limpa
  const linhsLimpas = linhas.map(row => {
    const clean = {};
    colunas.forEach(c => {
      let val = row[c.key] ?? '';
      // Strip HTML tags
      if (typeof val === 'string') val = val.replace(/<[^>]+>/g, '');
      clean[c.label] = val;
    });
    return clean;
  });

  const ws = XLSX.utils.json_to_sheet(linhsLimpas);

  // Largura automática das colunas
  const wscols = colunas.map(c => ({ wch: Math.max(c.label.length + 4, 14) }));
  ws['!cols'] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, titulo.substring(0, 31));

  const inicio = document.getElementById('filtroInicio').value;
  const fim    = document.getElementById('filtroFim').value;
  const nome   = `PCP_${titulo.replace(/\s+/g,'_')}_${inicio}_${fim}.xlsx`;

  XLSX.writeFile(wb, nome);
  toast('Planilha exportada!', 'success');
};

// ── Helpers de formatação ──────────────────────────────
function fmtData(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('pt-BR');
  } catch { return d; }
}

function fmtBrl(v) {
  if (v == null || v === '') return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function badgeStatus(status) {
  const map = {
    'CONCLUIDA':   ['badge-green',  'Concluída'],
    'EM_PRODUCAO': ['badge-amber',  'Em Produção'],
    'ABERTA':      ['badge-blue',   'Aberta'],
    'CANCELADA':   ['badge-gray',   'Cancelada'],
    // legado
    'Concluida':   ['badge-green',  'Concluída'],
    'EmProducao':  ['badge-amber',  'Em Produção'],
    'Aberta':      ['badge-blue',   'Aberta'],
  };
  const [cls, label] = map[status] || ['badge-gray', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function badgeStatusPedido(status) {
  const map = {
    'Entregue':           'badge-green',
    'Item em Produção':   'badge-amber',
    'Curso normal':       'badge-blue',
    'Pedido atrasado':    'badge-red',
    'Entrega com Atraso': 'badge-red',
  };
  const cls = map[status] || 'badge-gray';
  return `<span class="badge ${cls}">${status || '—'}</span>`;
}


function limparResultados() {
  dadosAtivos = [];
  document.getElementById('tableCard').style.display   = 'none';
  document.getElementById('statsRow').style.display    = 'none';
  document.getElementById('emptyState').style.display  = '';
  document.getElementById('emptyState').innerHTML = `<div class="empty-state">
    <div class="empty-icon">📊</div>
    <div class="empty-title">Selecione o tipo de relatório e o período</div>
    <div class="empty-desc">Configure os filtros acima e clique em "Gerar Relatório"</div>
  </div>`;
  document.getElementById('btnExport').disabled = true;
}

function toast(msg, tipo = 'success') {
  toastAuth(msg, tipo);
}