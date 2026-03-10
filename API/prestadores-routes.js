// ═══════════════════════════════════════════════════════════════
//  prestadores-routes.js
//  ATENÇÃO: rotas específicas (/op/..., /estoque-producao/...)
//  devem vir ANTES das rotas genéricas (/:id)
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const db = (req) => req.app.get('db');
const getLog = (req) => req.app.get('registrarLog') || (async () => {});

// ════════════════════════════════════════════════════════
//  ROTAS ESPECÍFICAS — devem vir antes de /:id
// ════════════════════════════════════════════════════════

// GET /prestadores/op/:op_id — vínculos de uma OP
router.get('/op/:op_id', async (req, res) => {
  try {
    const [rows] = await db(req).promise().query(`
      SELECT opp.*, p.nome AS prestador_nome, p.servico AS prestador_servico, p.cnpj AS prestador_cnpj
      FROM op_prestadores opp
      JOIN prestadores p ON p.id = opp.prestador_id
      WHERE opp.op_id = ?
      ORDER BY opp.enviado_em DESC
    `, [req.params.op_id]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /prestadores/op/:op_id — vincula prestador à OP
router.post('/op/:op_id', async (req, res) => {
  const { prestador_id, material_id, codigo_produto, descricao, quantidade, observacoes } = req.body;
  if (!prestador_id)
    return res.status(400).json({ success: false, message: 'prestador_id é obrigatório' });
  try {
    const qtde = Number(quantidade || 0);
    const [[p]] = await db(req).promise().query(
      `SELECT nome, servico FROM prestadores WHERE id = ?`, [prestador_id]
    );
    const [[op]] = await db(req).promise().query(
      `SELECT numero_op FROM ordens_producao WHERE id = ?`, [req.params.op_id]
    );
    const [result] = await db(req).promise().query(`
      INSERT INTO op_prestadores
        (op_id, prestador_id, material_id, codigo_produto, descricao, quantidade, valor_unit, valor_total, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)
    `, [req.params.op_id, prestador_id,
        material_id || null, codigo_produto || null, descricao || null,
        qtde, observacoes || null]);
    res.json({ success: true, id: result.insertId, message: 'Vínculo registrado!' });
    getLog(req)({
      usuario_id: req.user?.id, usuario_nome: req.user?.nome,
      modulo: 'PRESTADOR', acao: 'Vincular Prestador',
      descricao: `Prestador "${p?.nome}" (${p?.servico}) vinculado à OP ${op?.numero_op || req.params.op_id}. Material: ${descricao || codigo_produto || '—'}, Qtde: ${qtde}.`,
      referencia_id: Number(req.params.op_id), referencia_label: op?.numero_op,
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DELETE /prestadores/op/vinculo/:id — remove vínculo específico
router.delete('/op/vinculo/:id', async (req, res) => {
  try {
    const [[v]] = await db(req).promise().query(
      `SELECT opp.*, p.nome AS prestador_nome, op.numero_op
       FROM op_prestadores opp
       JOIN prestadores p ON p.id = opp.prestador_id
       JOIN ordens_producao op ON op.id = opp.op_id
       WHERE opp.id = ?`, [req.params.id]
    );
    await db(req).promise().query(`DELETE FROM op_prestadores WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Vínculo removido.' });
    getLog(req)({
      usuario_id: req.user?.id, usuario_nome: req.user?.nome,
      modulo: 'PRESTADOR', acao: 'Remover Vínculo',
      descricao: `Vínculo do prestador "${v?.prestador_nome}" removido da OP ${v?.numero_op || v?.op_id}.`,
      referencia_id: v?.op_id, referencia_label: v?.numero_op,
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /prestadores/estoque-producao/:op_id
router.get('/estoque-producao/:op_id', async (req, res) => {
  try {
    const [rows] = await db(req).promise().query(
      `SELECT * FROM estoque_producao WHERE op_id = ? ORDER BY id ASC`,
      [req.params.op_id]
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ════════════════════════════════════════════════════════
//  CRUD GENÉRICO — depois das rotas específicas
// ════════════════════════════════════════════════════════

// GET /prestadores
router.get('/', async (req, res) => {
  try {
    const [rows] = await db(req).promise().query(
      `SELECT * FROM prestadores WHERE ativo = 1 ORDER BY nome ASC`
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /prestadores/:id
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await db(req).promise().query(
      `SELECT * FROM prestadores WHERE id = ?`, [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: 'Prestador não encontrado' });
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /prestadores
router.post('/', async (req, res) => {
  const { nome, servico, cnpj } = req.body;
  if (!nome || !servico)
    return res.status(400).json({ success: false, message: 'nome e servico são obrigatórios' });
  try {
    const [result] = await db(req).promise().query(
      `INSERT INTO prestadores (nome, servico, cnpj) VALUES (?, ?, ?)`,
      [nome.trim(), servico.trim(), cnpj?.trim() || null]
    );
    res.json({ success: true, id: result.insertId, message: 'Prestador cadastrado!' });
    getLog(req)({
      usuario_id: req.user?.id, usuario_nome: req.user?.nome,
      modulo: 'PRESTADOR', acao: 'Criar Prestador',
      descricao: `Prestador "${nome}" (${servico}) cadastrado.`,
      referencia_id: result.insertId, referencia_label: nome,
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PUT /prestadores/:id
router.put('/:id', async (req, res) => {
  const { nome, servico, cnpj, ativo } = req.body;
  if (!nome || !servico)
    return res.status(400).json({ success: false, message: 'nome e servico são obrigatórios' });
  try {
    await db(req).promise().query(
      `UPDATE prestadores SET nome = ?, servico = ?, cnpj = ?, ativo = ? WHERE id = ?`,
      [nome.trim(), servico.trim(), cnpj?.trim() || null, ativo ?? 1, req.params.id]
    );
    res.json({ success: true, message: 'Prestador atualizado!' });
    getLog(req)({
      usuario_id: req.user?.id, usuario_nome: req.user?.nome,
      modulo: 'PRESTADOR', acao: 'Editar Prestador',
      descricao: `Prestador ID ${req.params.id} atualizado: "${nome}" (${servico}).`,
      referencia_id: Number(req.params.id), referencia_label: nome,
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DELETE /prestadores/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const [[p]] = await db(req).promise().query(
      `SELECT nome FROM prestadores WHERE id = ?`, [req.params.id]
    );
    await db(req).promise().query(
      `UPDATE prestadores SET ativo = 0 WHERE id = ?`, [req.params.id]
    );
    res.json({ success: true, message: 'Prestador removido.' });
    getLog(req)({
      usuario_id: req.user?.id, usuario_nome: req.user?.nome,
      modulo: 'PRESTADOR', acao: 'Excluir Prestador',
      descricao: `Prestador "${p?.nome || req.params.id}" desativado.`,
      referencia_id: Number(req.params.id), referencia_label: p?.nome,
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;