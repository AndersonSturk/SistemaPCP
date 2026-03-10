// ═══════════════════════════════════════════════════════
//  ROTAS — FICHA TÉCNICA (BOM)
//  Adicione no server.js:
//    app.set('db', db);  // se ainda não tiver
//    const fichaTecnicaRoutes = require('./ficha-tecnica-routes');
//    app.use('/ficha-tecnica', authMiddleware, fichaTecnicaRoutes);
// ═══════════════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const db = () => null; // placeholder — usa req.app.get('db')

// GET /ficha-tecnica/:material_id
// Retorna todos os insumos da ficha técnica de um material
router.get('/:material_id', async (req, res) => {
  const db = req.app.get('db');
  try {
    const [rows] = await db.promise().query(
      `SELECT ft.*,
              m.descricao AS insumo_descricao_atual,
              m.estoque   AS insumo_estoque_atual
       FROM ficha_tecnica ft
       LEFT JOIN materiais m ON m.id = ft.insumo_material_id
       WHERE ft.material_id = ?
       ORDER BY ft.id ASC`,
      [req.params.material_id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[ficha-tecnica GET]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /ficha-tecnica/:material_id
// Salva (substitui) a ficha técnica completa de um material
// Body: { itens: [{ insumo_material_id, insumo_codigo, insumo_descricao, quantidade_por_unidade, unidade_medida }] }
router.post('/:material_id', async (req, res) => {
  const db = req.app.get('db');
  const material_id = req.params.material_id;
  const { itens = [] } = req.body;

  try {
    // Garante que a tabela existe
    await db.promise().query(`
      CREATE TABLE IF NOT EXISTS ficha_tecnica (
        id                     INT NOT NULL AUTO_INCREMENT,
        material_id            INT NOT NULL,
        insumo_material_id     INT NULL,
        insumo_codigo          VARCHAR(50)  NULL,
        insumo_descricao       VARCHAR(255) NOT NULL,
        quantidade_por_unidade DECIMAL(12,4) NOT NULL DEFAULT 1,
        unidade_medida         VARCHAR(20)  NOT NULL DEFAULT 'un',
        PRIMARY KEY (id),
        KEY idx_ft_material (material_id),
        KEY idx_ft_insumo   (insumo_material_id)
      )
    `);

    await db.promise().query('DELETE FROM ficha_tecnica WHERE material_id = ?', [material_id]);

    for (const it of itens) {
      await db.promise().query(
        `INSERT INTO ficha_tecnica
           (material_id, insumo_material_id, insumo_codigo, insumo_descricao, quantidade_por_unidade, unidade_medida)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          material_id,
          it.insumo_material_id || null,
          it.insumo_codigo || null,
          it.insumo_descricao,
          Number(it.quantidade_por_unidade) || 1,
          it.unidade_medida || 'un',
        ]
      );
    }

    // Log
    if (req.user) {
      try {
        await db.promise().query(
          `INSERT INTO logs_sistema (usuario_id, usuario_nome, modulo, acao, descricao, referencia_id)
           VALUES (?, ?, 'MATERIAL', 'Ficha Técnica', ?, ?)`,
          [req.user.id, req.user.nome,
           `Ficha técnica do material ID ${material_id} atualizada — ${itens.length} insumo(s)`,
           material_id]
        );
      } catch (_) {}
    }

    res.json({ success: true, message: `${itens.length} insumo(s) salvos na ficha técnica.` });
  } catch (e) {
    console.error('[ficha-tecnica POST]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /ficha-tecnica/:material_id/calcular?quantidade=X
// Retorna os insumos com quantidade total calculada para X unidades
router.get('/:material_id/calcular', async (req, res) => {
  const db = req.app.get('db');
  const quantidade = Number(req.query.quantidade) || 1;

  try {
    const [rows] = await db.promise().query(
      `SELECT ft.*,
              ROUND(ft.quantidade_por_unidade * ?, 4)  AS quantidade_total,
              m.estoque                                 AS estoque_disponivel,
              m.custo_fornecedor                        AS custo_unit,
              ROUND(ft.quantidade_por_unidade * ? * COALESCE(m.custo_fornecedor, 0), 2) AS custo_total
       FROM ficha_tecnica ft
       LEFT JOIN materiais m ON m.id = ft.insumo_material_id
       WHERE ft.material_id = ?
       ORDER BY ft.id ASC`,
      [quantidade, quantidade, req.params.material_id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[ficha-tecnica calcular]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;