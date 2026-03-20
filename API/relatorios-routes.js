// ═══════════════════════════════════════════════════════
//  ROTAS DE RELATÓRIOS — relatorios-routes.js
//  Adicione no server.js (já ao final, antes do app.listen):
//    app.set('db', db);                                   ← OBRIGATÓRIO
//    const relatoriosRoutes = require('./relatorios-routes');
//    app.use('/relatorios', authMiddleware, relatoriosRoutes);
// ═══════════════════════════════════════════════════════
const express = require('express');
const router  = express.Router();

function getDb(req) { return req.app.get('db'); }

function intervalo(inicio, fim) {
  return [
    (inicio || '2000-01-01') + ' 00:00:00',
    (fim    || '2099-12-31') + ' 23:59:59',
  ];
}

// ══════════════════════════════════════════════════════
//  GET /relatorios/estoque
//  ?data_inicio=&data_fim=&sub=materiais|insumos
// ══════════════════════════════════════════════════════
router.get('/estoque', async (req, res) => {
  const { data_inicio, data_fim, sub } = req.query;
  const [i, f] = intervalo(data_inicio, data_fim);
  const db = getDb(req);

  try {
    if (sub === 'insumos') {
      // Insumos via ficha técnica do material vinculado à OP
      // Cruza: ordens_producao -> ficha_tecnica -> materiais (para pegar custo_fornecedor)
      const [rows] = await db.promise().query(`
        SELECT
          ft.id,
          op.numero_op,
          op.status                                              AS status_op,
          op.data_criacao                                        AS data,
          COALESCE(mi.codigo_produto, '')                        AS codigo,
          ft.insumo_descricao                                    AS descricao,
          ROUND(ft.quantidade_por_unidade * op.qtde_total, 4)    AS qtde,
          ft.unidade_medida                                      AS unidade,
          COALESCE(mi.custo_fornecedor, 0)                       AS custo_unit,
          ROUND(ft.quantidade_por_unidade * op.qtde_total
                * COALESCE(mi.custo_fornecedor, 0), 2)           AS subtotal,
          CONCAT(op.codigo_produto, ' — ', op.descricao_material) AS material_op,
          op.responsavel                                         AS usuario_nome
        FROM ordens_producao op
        -- ⚠️ Confirme o nome da tabela da ficha técnica no seu banco
        JOIN ficha_tecnica ft  ON ft.material_id = op.material_id
        LEFT JOIN materiais mi ON mi.id = ft.insumo_material_id
        WHERE op.data_criacao BETWEEN ? AND ?
          AND op.is_deleted = 0
        ORDER BY op.data_criacao DESC, ft.id
      `, [i, f]);
      return res.json({ success: true, data: rows });
    }

    // Saídas avulsas — tabelas reais: saidas_estoque + saidas_estoque_itens
    const [rows] = await db.promise().query(`
      SELECT
        si.id,
        se.numero                          AS numero_saida,
        se.data_saida                      AS data,
        si.codigo_produto                  AS codigo,
        si.descricao,
        si.quantidade                      AS qtde,
        si.unidade_medida                  AS unidade,
        si.custo_unitario                  AS custo_unit,
        si.subtotal,
        se.cliente,
        se.usuario                         AS responsavel,
        se.observacoes                     AS obs
      FROM saidas_estoque_itens si
      JOIN saidas_estoque se ON si.saida_id = se.id
      WHERE se.data_saida BETWEEN DATE(?) AND DATE(?)
      ORDER BY se.data_saida DESC, se.numero DESC
    `, [i, f]);
    return res.json({ success: true, data: rows });

  } catch (e) {
    console.error('[relatorios/estoque]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════
//  GET /relatorios/pedidos
//  ?data_inicio=&data_fim=&status=
//  Tabela real: controle_pedidos
// ══════════════════════════════════════════════════════
router.get('/pedidos', async (req, res) => {
  const { data_inicio, data_fim, status } = req.query;
  const [i, f] = intervalo(data_inicio, data_fim);
  const db = getDb(req);

  try {
    let where = 'WHERE cp.data_finalizada BETWEEN DATE(?) AND DATE(?)';
    const params = [i, f];

    if (status) {
      where += ' AND cp.status_producao = ?';
      params.push(status);
    }

    const [rows] = await db.promise().query(`
      SELECT
        cp.id,
        cp.pedido_venda,
        cp.ordem_compra,
        cp.cliente,
        cp.estado,
        cp.codigo_cliente,
        cp.zerb                            AS material_codigo,
        cp.qtde_solicitada,
        cp.qtde_produzida,
        cp.data_contratual,
        cp.data_finalizada,
        cp.status_producao,
        CONCAT(cp.zerb, ' — ', COALESCE(m.descricao, '')) AS material,
        op.numero_op,
        ROUND(
          COALESCE(cp.qtde_produzida, 0) * COALESCE(m.custo_fornecedor, op.custo_unitario, 0),
          2
        )                                  AS custo_producao
      FROM controle_pedidos cp
      LEFT JOIN materiais m    ON m.codigo_produto = cp.zerb
      LEFT JOIN ordens_producao op ON op.codigo_produto = cp.zerb AND op.is_deleted = 0
      ${where}
      ORDER BY cp.data_finalizada DESC
    `, params);

    res.json({ success: true, data: rows });

  } catch (e) {
    console.error('[relatorios/pedidos]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════
//  GET /relatorios/ops
//  ?data_inicio=&data_fim=&status=
// ══════════════════════════════════════════════════════
router.get('/ops', async (req, res) => {
  const { data_inicio, data_fim, status } = req.query;
  const [i, f] = intervalo(data_inicio, data_fim);
  const db = getDb(req);

  try {
    let where = 'WHERE op.data_criacao BETWEEN ? AND ? AND op.is_deleted = 0';
    const params = [i, f];

    if (status) {
      where += ' AND op.status = ?';
      params.push(status);
    }

    const [rows] = await db.promise().query(`
      SELECT
        op.id,
        op.numero_op,
        op.status,
        op.qtde_total                      AS quantidade,
        op.unidade_medida,
        op.custo_unitario,
        op.custo_total,
        op.data_criacao,
        op.data_finalizacao,
        op.responsavel                     AS usuario_nome,
        op.observacoes,
        op.codigo_produto                  AS material_codigo,
        op.descricao_material              AS material_descricao,
        m.estoque                          AS estoque_atual,
        COALESCE(SUM(oi.subtotal), 0)      AS custo_insumos
      FROM ordens_producao op
      LEFT JOIN materiais m   ON m.codigo_produto = op.codigo_produto
      LEFT JOIN op_insumos oi  ON op.id = oi.op_id
      ${where}
      GROUP BY op.id
      ORDER BY op.data_criacao DESC
    `, params);

    res.json({ success: true, data: rows });

  } catch (e) {
    console.error('[relatorios/ops]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════
//  GET /relatorios/desempenho
//  Desempenho por material no período
// ══════════════════════════════════════════════════════
router.get('/desempenho', async (req, res) => {
  const { data_inicio, data_fim } = req.query;
  const [i, f] = intervalo(data_inicio, data_fim);
  const db = getDb(req);

  try {
    const [rows] = await db.promise().query(`
      SELECT
        op.codigo_produto                  AS material_codigo,
        op.descricao_material              AS material_descricao,
        m.estoque                          AS estoque_atual,
        m.custo_fornecedor                 AS custo_medio,
        COUNT(DISTINCT op.id)              AS total_ops,
        SUM(CASE WHEN op.status = 'CONCLUIDA' THEN 1 ELSE 0 END) AS ops_concluidas,
        COALESCE(SUM(op.qtde_total), 0)    AS qtde_produzida,
        COALESCE(SUM(ins_agg.custo_ins),0) AS custo_total_insumos
      FROM ordens_producao op
      LEFT JOIN materiais m ON m.codigo_produto = op.codigo_produto
      LEFT JOIN (
        SELECT op_id, SUM(subtotal) AS custo_ins
        FROM op_insumos
        GROUP BY op_id
      ) ins_agg ON ins_agg.op_id = op.id
      WHERE op.data_criacao BETWEEN ? AND ?
        AND op.is_deleted = 0
      GROUP BY op.codigo_produto, op.descricao_material
      ORDER BY qtde_produzida DESC
    `, [i, f]);

    res.json({ success: true, data: rows });

  } catch (e) {
    console.error('[relatorios/desempenho]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;