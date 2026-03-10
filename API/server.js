require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { exec } = require("child_process");
const fs = require("fs");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../paginas")));

const JWT_SECRET = process.env.JWT_SECRET || "MUDE_ESSE_SEGREDO_EM_PRODUCAO";


const db = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pcp",
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ ERRO AO CONECTAR NO MYSQL:", err.message);
  } else {
    console.log("✅ Conectado ao MySQL (pcp)");
    connection.release();
  }
});

/* =======================
   HELPERS
======================= */
function serverError(res, err) {
  console.error(err);
  return res.status(500).json({ success: false, message: "Erro interno do servidor" });
}

/* =======================
   SISTEMA DE LOGS
======================= */
const MODULOS = {
  OP:       "Ordem de Produção",
  PEDIDO:   "Pedido",
  MATERIAL: "Material",
  ESTOQUE:  "Saída de Estoque",
  USUARIO:  "Usuário",
  SISTEMA:  "Sistema",
};

async function registrarLog({ usuario_id, usuario_nome, modulo, acao, descricao, referencia_id = null, referencia_label = null }) {
  try {
    await db.promise().query(
      `INSERT INTO logs_sistema
         (usuario_id, usuario_nome, modulo, acao, descricao, referencia_id, referencia_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuario_id || null, usuario_nome || "Sistema", modulo, acao, descricao,
       referencia_id || null, referencia_label || null]
    );
  } catch (err) {
    // Tenta criar a tabela se não existir e tenta de novo
    try {
      await db.promise().query(`
        CREATE TABLE IF NOT EXISTS logs_sistema (
          id               INT NOT NULL AUTO_INCREMENT,
          usuario_id       INT NULL,
          usuario_nome     VARCHAR(100) NULL,
          modulo           VARCHAR(50)  NOT NULL,
          acao             VARCHAR(100) NOT NULL,
          descricao        TEXT         NULL,
          referencia_id    INT NULL,
          referencia_label VARCHAR(100) NULL,
          criado_em        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_log_modulo   (modulo),
          KEY idx_log_usuario  (usuario_id),
          KEY idx_log_criado   (criado_em)
        )
      `);
      await db.promise().query(
        `INSERT INTO logs_sistema
           (usuario_id, usuario_nome, modulo, acao, descricao, referencia_id, referencia_label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [usuario_id || null, usuario_nome || "Sistema", modulo, acao, descricao,
         referencia_id || null, referencia_label || null]
      );
    } catch (err2) {
      console.warn("Log não registrado:", err2.message);
    }
  }
}

/* =======================
   LOGS — GET (listar)
======================= */
app.get(
  "/logs",
  authMiddleware,
  roleMiddleware(["admin", "pcp"]),
  async (req, res) => {
    try {
      const { modulo, usuario_id, search, data_inicio, data_fim, limit = 100, offset = 0 } = req.query;
      let where = "WHERE 1=1";
      const params = [];

      if (modulo)      { where += " AND modulo = ?";           params.push(modulo); }
      if (usuario_id)  { where += " AND usuario_id = ?";       params.push(usuario_id); }
      if (data_inicio) { where += " AND DATE(criado_em) >= ?"; params.push(data_inicio); }
      if (data_fim)    { where += " AND DATE(criado_em) <= ?"; params.push(data_fim); }
      if (search)      {
        where += " AND (descricao LIKE ? OR acao LIKE ? OR usuario_nome LIKE ? OR referencia_label LIKE ?)";
        const q = `%${search}%`; params.push(q, q, q, q);
      }

      const [rows] = await db.promise().query(
        `SELECT * FROM logs_sistema ${where} ORDER BY criado_em DESC LIMIT ? OFFSET ?`,
        [...params, Number(limit), Number(offset)]
      );
      const [[{ total }]] = await db.promise().query(
        `SELECT COUNT(*) AS total FROM logs_sistema ${where}`, params
      );

      res.json({ success: true, data: rows, total });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ success: false, message: "Token não enviado" });

  const token = authHeader.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Token inválido" });
  }
}

function roleMiddleware(perfis = []) {
  return (req, res, next) => {
    if (!perfis.includes(req.user.perfil))
      return res.status(403).json({ success: false, message: "Acesso negado" });
    next();
  };
}

/* =======================
   LOGIN
======================= */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: { success: false, message: "Muitas tentativas de login. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post("/login", loginLimiter, (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha)
    return res.status(400).json({ success: false, message: "Email e senha são obrigatórios" });

  db.query(
    "SELECT * FROM usuarios WHERE email = ? AND ativo = 1",
    [email],
    async (err, results) => {
      if (err) return serverError(res, err);

      if (results.length === 0)
        return res.status(401).json({ success: false, message: "Credenciais inválidas" });

      const user = results[0];
      const senhaValida = await bcrypt.compare(senha, user.senha_hash);

      if (!senhaValida)
        return res.status(401).json({ success: false, message: "Credenciais inválidas" });

      const token = jwt.sign(
        { id: user.id, nome: user.nome, perfil: user.perfil },
        JWT_SECRET,
        { expiresIn: "8h" }
      );

      res.json({
        success: true,
        token,
        user: { id: user.id, nome: user.nome, perfil: user.perfil },
      });

      registrarLog({
        usuario_id: user.id, usuario_nome: user.nome,
        modulo: "SISTEMA", acao: "Login",
        descricao: `Usuário ${user.nome} (${user.email}) fez login`,
        referencia_id: user.id, referencia_label: user.nome,
      });
    }
  );
});

/* =======================
   MATERIAIS — GET (listar)
======================= */
app.get(
  "/materiais",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    const search = req.query.search || "";
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;

    const where  = search ? "WHERE codigo_produto LIKE ? OR descricao LIKE ?" : "";
    const params = search ? [`%${search}%`, `%${search}%`] : [];

    db.query(`SELECT COUNT(*) AS total FROM materiais ${where}`, params, (err, countRows) => {
      if (err) return serverError(res, err);

      const totalItems = countRows[0].total;
      const totalPages = Math.ceil(totalItems / limit) || 1;

      db.query(
        `SELECT * FROM materiais ${where} ORDER BY CAST(codigo_produto AS UNSIGNED) ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
        (err, rows) => {
          if (err) return serverError(res, err);
          res.json({ success: true, data: rows, pagination: { page, limit, totalPages, totalItems } });
        }
      );
    });
  }
);

/* =======================
   MATERIAIS — GET (por id)
======================= */
app.get(
  "/materiais/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    db.query("SELECT * FROM materiais WHERE id = ?", [req.params.id], (err, rows) => {
      if (err) return serverError(res, err);
      if (!rows.length)
        return res.status(404).json({ success: false, message: "Material não encontrado" });
      res.json({ success: true, data: rows[0] });
    });
  }
);

/* =======================
   MATERIAIS — POST (criar)   ← estava faltando
======================= */
app.post(
  "/materiais",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  (req, res) => {
    const { codigo_produto, descricao, estoque, custo_fornecedor, qtde_embalagem } = req.body;

    if (!codigo_produto || !descricao)
      return res.status(400).json({ success: false, message: "Código e descrição são obrigatórios" });

    db.query(
      `INSERT INTO materiais (codigo_produto, descricao, estoque, custo_fornecedor, qtde_embalagem)
       VALUES (?, ?, ?, ?, ?)`,
      [codigo_produto, descricao, Number(estoque) || 0, Number(custo_fornecedor) || 0,
       qtde_embalagem ? Number(qtde_embalagem) : null],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY")
            return res.status(409).json({ success: false, message: "Código de material já existe" });
          return serverError(res, err);
        }
        res.status(201).json({ success: true, id: result.insertId, message: "Material criado" });
        registrarLog({
          usuario_id: req.user.id, usuario_nome: req.user.nome,
          modulo: "MATERIAL", acao: "Criar Material",
          descricao: `Material criado — Código: ${codigo_produto}, Descrição: ${descricao}, Estoque inicial: ${estoque || 0}`,
          referencia_id: result.insertId, referencia_label: codigo_produto,
        });
      }
    );
  }
);

/* =======================
   MATERIAIS — PUT (atualizar)
======================= */
app.put(
  "/materiais/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  (req, res) => {
    const { codigo_produto, descricao, estoque, custo_fornecedor, qtde_embalagem } = req.body;

    db.query(
      `UPDATE materiais SET codigo_produto = ?, descricao = ?, estoque = ?,
       custo_fornecedor = ?, qtde_embalagem = ? WHERE id = ?`,
      [codigo_produto, descricao, Number(estoque), Number(custo_fornecedor),
       qtde_embalagem ? Number(qtde_embalagem) : null, req.params.id],
      (err, result) => {
        if (err) return serverError(res, err);
        if (result.affectedRows === 0)
          return res.status(404).json({ success: false, message: "Material não encontrado" });
        res.json({ success: true, message: "Material atualizado" });
        registrarLog({
          usuario_id: req.user.id, usuario_nome: req.user.nome,
          modulo: "MATERIAL", acao: "Editar Material",
          descricao: `Material ID ${req.params.id} atualizado — Código: ${codigo_produto}, Estoque: ${estoque}, Custo: R$ ${custo_fornecedor}`,
          referencia_id: Number(req.params.id), referencia_label: codigo_produto,
        });
      }
    );
  }
);

/* =======================
   MATERIAIS — DELETE
======================= */
app.delete(
  "/materiais/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp"]),
  (req, res) => {
    db.query("DELETE FROM materiais WHERE id = ?", [req.params.id], (err, result) => {
      if (err) return serverError(res, err);
      if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "Material não encontrado" });
      res.json({ success: true, message: "Material excluído" });
      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "MATERIAL", acao: "Excluir Material",
        descricao: `Material ID ${req.params.id} excluído`,
        referencia_id: Number(req.params.id),
      });
    });
  }
);

/* =======================
   ORDENS DE PRODUÇÃO — helpers
======================= */
function getNextNumeroOP(callback) {
  db.query("SELECT MAX(numero_op) AS max_op FROM ordens_producao", (err, rows) => {
    if (err) return callback(err);
    callback(null, (rows[0].max_op || 0) + 1);
  });
}

/* =======================
   OPs — GET (listar)
======================= */
app.get(
  "/ordens_producao",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    const search = req.query.search || "";
    const where  = search ? "WHERE is_deleted = 0 AND numero_op LIKE ?" : "WHERE is_deleted = 0";
    const params = search ? [`%${search}%`] : [];

    db.query(
      `SELECT op.*,
              COALESCE(op.codigo_produto,    m.codigo_produto) AS codigo_produto,
              COALESCE(op.descricao_material, m.descricao)     AS descricao_material
       FROM ordens_producao op
       LEFT JOIN materiais m ON m.id = op.material_id
       ${where}
       ORDER BY op.id DESC`,
      params,
      (err, rows) => {
        if (err) return serverError(res, err);
        res.json({ success: true, data: rows });
      }
    );
  }
);

/* =====================================================
   INSUMOS DA OP — devem vir ANTES de /:id para o
   Express não interpretar "insumos" como parâmetro
===================================================== */
app.get(
  "/ordens_producao/:id/insumos",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  async (req, res) => {
    try {
      await db.promise().query(`
        CREATE TABLE IF NOT EXISTS op_insumos (
          id             INT NOT NULL AUTO_INCREMENT,
          op_id          INT NOT NULL,
          material_id    INT NULL,
          codigo_produto VARCHAR(50)  NULL,
          descricao      VARCHAR(255) NULL,
          unidade_medida VARCHAR(20)  NULL DEFAULT 'un',
          quantidade     DECIMAL(10,3) NOT NULL DEFAULT 0,
          custo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
          subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          KEY idx_op_insumos_op (op_id)
        )
      `);
      // Busca da ficha técnica cruzando com materiais (insumos automáticos)
      const [[op]] = await db.promise().query(
        `SELECT material_id, qtde_total FROM ordens_producao WHERE id = ?`, [req.params.id]
      );
      if (!op) return res.json({ success: true, data: [] });

      const [rows] = await db.promise().query(`
        SELECT
          ft.insumo_descricao               AS descricao,
          ft.quantidade_por_unidade         AS qtde_por_unidade,
          ft.unidade_medida,
          ROUND(ft.quantidade_por_unidade * ?, 4) AS quantidade,
          m.codigo_produto,
          COALESCE(m.custo_fornecedor, 0)   AS custo_unitario,
          ROUND(ft.quantidade_por_unidade * ? * COALESCE(m.custo_fornecedor, 0), 2) AS subtotal
        FROM ficha_tecnica ft
        LEFT JOIN materiais m ON m.id = ft.insumo_material_id
        WHERE ft.material_id = ?
        ORDER BY ft.id ASC
      `, [op.qtde_total, op.qtde_total, op.material_id]);

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("Erro ao buscar insumos:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.post(
  "/ordens_producao/:id/insumos",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  async (req, res) => {
    try {
      const op_id   = req.params.id;
      const insumos = req.body.insumos;
      if (!Array.isArray(insumos))
        return res.status(400).json({ success: false, message: "insumos deve ser um array." });

      await db.promise().query(`
        CREATE TABLE IF NOT EXISTS op_insumos (
          id             INT NOT NULL AUTO_INCREMENT,
          op_id          INT NOT NULL,
          material_id    INT NULL,
          codigo_produto VARCHAR(50)  NULL,
          descricao      VARCHAR(255) NULL,
          unidade_medida VARCHAR(20)  NULL DEFAULT 'un',
          quantidade     DECIMAL(10,3) NOT NULL DEFAULT 0,
          custo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
          subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          KEY idx_op_insumos_op (op_id)
        )
      `);

      await db.promise().query(`DELETE FROM op_insumos WHERE op_id = ?`, [op_id]);
      for (const ins of insumos) {
        const qtde    = Number(ins.quantidade     || 0);
        const custo   = Number(ins.custo_unitario || 0);
        await db.promise().query(
          `INSERT INTO op_insumos (op_id, material_id, codigo_produto, descricao, unidade_medida, quantidade, custo_unitario, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [op_id, ins.material_id || null, ins.codigo_produto || null, ins.descricao || null,
           ins.unidade_medida || "un", qtde, custo, qtde * custo]
        );
      }
      res.json({ success: true, message: `${insumos.length} insumo(s) salvos.` });

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "OP", acao: "Salvar Insumos",
        descricao: `${insumos.length} insumo(s) salvos na OP ID ${op_id}`,
        referencia_id: Number(op_id),
      });
    } catch (err) {
      console.error("Erro ao salvar insumos:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* =======================
   OPs — GET (por id)
======================= */
app.get(
  "/ordens_producao/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    db.query(
      `SELECT op.*,
              COALESCE(op.codigo_produto,    m.codigo_produto) AS codigo_produto,
              COALESCE(op.descricao_material, m.descricao)     AS descricao_material
       FROM ordens_producao op
       LEFT JOIN materiais m ON m.id = op.material_id
       WHERE op.id = ? AND op.is_deleted = 0`,
      [req.params.id],
      (err, rows) => {
        if (err) return serverError(res, err);
        if (!rows.length)
          return res.status(404).json({ success: false, message: "OP não encontrada" });
        res.json({ success: true, data: rows[0] });
      }
    );
  }
);

/* =======================
   OPs — POST (criar)
======================= */
app.post("/ordens_producao", async (req, res) => {
  try {
    const {
      processo_id,
      material_id,
      codigo_produto,
      descricao_material,
      quantidade,
      unidade_medida,
      custo_unitario,
      responsavel,
      observacoes,
      criado_por
    } = req.body;

    if (!material_id)
      return res.status(400).json({ success: false, message: "material_id é obrigatório" });

    const qtdeTotal = Number(quantidade) || 0;
    const custoUnit = Number(custo_unitario) || 0;
    const custoTotal = qtdeTotal * custoUnit;

    // 🔹 Gera número automático da OP
    getNextNumeroOP_Real(async (err, { seq, ano, numero_op }) => {
      if (err) return serverError(res, err);

      const sql = `
        INSERT INTO ordens_producao (
          numero_op,
          seq_ano,
          ano,
          processo_id,
          material_id,
          codigo_produto,
          descricao_material,
          qtde_total,
          quantidade,
          unidade_medida,
          custo_unitario,
          custo_total,
          status,
          responsavel,
          observacoes,
          criado_por,
          is_deleted
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA', ?, ?, ?, 0)
      `;

      const valores = [
        numero_op,
        seq,
        ano,
        processo_id || null,
        material_id,
        codigo_produto || null,
        descricao_material || null,
        qtdeTotal,
        qtdeTotal,
        unidade_medida || 'UN',
        custoUnit,
        custoTotal,
        responsavel || null,
        observacoes || null,
        criado_por || null
      ];

      const [result] = await db.promise().query(sql, valores);

      res.json({
        success: true,
        id: result.insertId,
        numero_op
      });

      registrarLog({
        usuario_id: criado_por || null, usuario_nome: "Sistema",
        modulo: "OP", acao: "Criar OP",
        descricao: `OP ${numero_op} criada — Material: ${codigo_produto || ""}, Qtde: ${quantidade || 0}`,
        referencia_id: result.insertId, referencia_label: numero_op,
      });
    });

  } catch (error) {
    console.error("Erro ao gerar OP:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/* =======================
   OPs — PUT (atualizar parcial)
   Só atualiza os campos que vierem no body — nunca sobrescreve
   campos não enviados com NULL.
======================= */
app.put(
  "/ordens_producao/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  (req, res) => {
    const { material_id, quantidade, unidade_medida, cliente_id,
            pedido_de_venda, ordem_de_compra, status,
            responsavel, data_finalizacao, observacoes } = req.body;

    const setClauses = [];
    const values     = [];

    if (material_id      !== undefined) { setClauses.push("material_id = ?");      values.push(material_id); }
    if (quantidade       !== undefined) { setClauses.push("quantidade = ?");        values.push(quantidade); }
    if (unidade_medida   !== undefined) { setClauses.push("unidade_medida = ?");    values.push(unidade_medida); }
    if (cliente_id       !== undefined) { setClauses.push("cliente_id = ?");        values.push(cliente_id || null); }
    if (pedido_de_venda  !== undefined) { setClauses.push("pedido_de_venda = ?");   values.push(pedido_de_venda || null); }
    if (ordem_de_compra  !== undefined) { setClauses.push("ordem_de_compra = ?");   values.push(ordem_de_compra || null); }
    if (status           !== undefined) { setClauses.push("status = ?");            values.push(status); }
    if (responsavel      !== undefined) { setClauses.push("responsavel = ?");       values.push(responsavel || null); }
    if (data_finalizacao !== undefined) { setClauses.push("data_finalizacao = ?");  values.push(data_finalizacao || null); }
    if (observacoes      !== undefined) { setClauses.push("observacoes = ?");       values.push(observacoes || null); }

    if (setClauses.length === 0)
      return res.status(400).json({ success: false, message: "Nenhum campo para atualizar" });

    const executarUpdate = (extraClauses = [], extraValues = []) => {
      const allClauses = [...setClauses, ...extraClauses];
      const allValues  = [...values, ...extraValues, req.params.id];

      db.query(
        `UPDATE ordens_producao SET ${allClauses.join(", ")} WHERE id = ?`,
        allValues,
        (err, result) => {
          if (err) return serverError(res, err);
          if (result.affectedRows === 0)
            return res.status(404).json({ success: false, message: "OP não encontrada" });
          res.json({ success: true, message: "OP atualizada" });

          registrarLog({
            usuario_id: req.user.id, usuario_nome: req.user.nome,
            modulo: "OP", acao: "Editar OP",
            descricao: `OP ID ${req.params.id} atualizada — Campos: ${setClauses.map(c => c.split(" =")[0]).join(", ")}`,
            referencia_id: Number(req.params.id),
          });
        }
      );
    };

    // Se material ou quantidade mudaram, recalcula o custo total
    if (material_id !== undefined && quantidade !== undefined) {
      db.query("SELECT custo_fornecedor FROM materiais WHERE id = ?", [material_id], (err, rows) => {
        if (err) return serverError(res, err);
        if (!rows.length)
          return res.status(404).json({ success: false, message: "Material não encontrado" });
        const cu = Number(rows[0].custo_fornecedor);
        executarUpdate(
          ["custo_unitario = ?", "custo_total = ?"],
          [cu, cu * Number(quantidade)]
        );
      });
    } else {
      executarUpdate();
    }
  }
);

/* ══════════════════════════════════════════════════════════════
   ROTAS — NOVA ORDENS DE PRODUÇÃO (OP REAL)
   Adicionar no server.js após as rotas de /processos

   Fluxo:
     1. GET /op/buscar-pedidos?material_id=X  → lista pedidos disponíveis
     2. POST /op                               → cria OP com número 001/2026
     3. GET  /op                               → lista OPs
     4. GET  /op/:id                           → busca OP com seus pedidos
     5. PUT  /op/:id                           → atualiza status / dados
     6. DELETE /op/:id                         → soft delete
══════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────
   HELPER — Gera próximo número de OP no formato 001/YYYY
   Garante sequência por ano mesmo com concorrência usando
   a coluna UNIQUE (seq_ano, ano) como trava.
────────────────────────────────────────────────────────────── */
function getNextNumeroOP_Real(callback) {
  const ano = new Date().getFullYear();

  db.query(
    "SELECT MAX(seq_ano) AS max_seq FROM ordens_producao WHERE ano = ?",
    [ano],
    (err, rows) => {
      if (err) return callback(err);
      const seq      = (rows[0].max_seq || 0) + 1;
      const numero_op = String(seq).padStart(3, "0") + "/" + ano;  // "001/2026"
      callback(null, { seq, ano, numero_op });
    }
  );
}

/* ──────────────────────────────────────────────────────────────
   GET /op/buscar-pedidos?material_id=X
   Busca todos os pedidos de controle_pedidos cujo campo "zerb"
   bate com o codigo_produto do material selecionado.
   Retorna pedidos com dados do cliente via codigos_clientes.
────────────────────────────────────────────────────────────── */
app.get(
  "/op/buscar-pedidos",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  (req, res) => {
    const { material_id } = req.query;

    if (!material_id)
      return res.status(400).json({ success: false, message: "material_id é obrigatório" });

    // Pega o codigo_produto do material para cruzar com controle_pedidos.zerb
    db.query(
      "SELECT codigo_produto, descricao FROM materiais WHERE id = ?",
      [material_id],
      (err, matRows) => {
        if (err) return serverError(res, err);
        if (!matRows.length)
          return res.status(404).json({ success: false, message: "Material não encontrado" });

        const { codigo_produto, descricao } = matRows[0];

        // Busca pedidos onde zerb = codigo_produto e que ainda não estão concluídos
        // LEFT JOIN com codigos_clientes para trazer a descrição do cliente
        db.query(
          `SELECT
             cp.id,
             cp.controle,
             cp.pedido_venda,
             cp.ordem_compra,
             cp.cliente,
             cp.estado,
             cp.codigo_cliente,
             cp.zerb,
             cp.descricao_item,
             cp.qtde_solicitada,
             cp.qtde_produzida,
             cp.data_contratual,
             cp.status_producao,
             cp.status_demanda,
             cc.descricao AS descricao_cliente
           FROM controle_pedidos cp
           LEFT JOIN codigos_clientes cc
             ON cc.codigo_cliente = cp.codigo_cliente
           WHERE cp.zerb = ?
             AND (cp.status_producao IS NULL
                  OR cp.status_producao NOT IN ('Entregue', 'Cancelado'))
           ORDER BY cp.data_contratual ASC`,
          [codigo_produto],
          (err, pedidos) => {
            if (err) return serverError(res, err);

            res.json({
              success: true,
              material: { id: material_id, codigo_produto, descricao },
              data: pedidos,
            });
          }
        );
      }
    );
  }
);

/* ──────────────────────────────────────────────────────────────
   POST /op
   Cria uma nova OP real com número 001/2026.
   Body: {
     material_id,
     unidade_medida,
     pedidos: [{ id, qtde_atendida }],   ← pedidos selecionados
     observacoes?,
     responsavel?
   }
────────────────────────────────────────────────────────────── */
app.post(
  "/op",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  (req, res) => {
    const { material_id, unidade_medida, pedidos = [], observacoes, responsavel } = req.body;

    if (!material_id)
      return res.status(400).json({ success: false, message: "material_id é obrigatório" });
    if (!pedidos.length)
      return res.status(400).json({ success: false, message: "Selecione ao menos um pedido" });

    // Busca dados do material
    db.query(
      "SELECT codigo_produto, descricao, custo_fornecedor FROM materiais WHERE id = ?",
      [material_id],
      (err, matRows) => {
        if (err) return serverError(res, err);
        if (!matRows.length)
          return res.status(404).json({ success: false, message: "Material não encontrado" });

        const mat = matRows[0];
        const custo_unitario = Number(mat.custo_fornecedor);

        // Calcula quantidade total somando qtde_atendida dos pedidos selecionados
        const qtde_total = pedidos.reduce((sum, p) => sum + Number(p.qtde_atendida || 0), 0);
        const custo_total = custo_unitario * qtde_total;

        // Gera o próximo número de OP
        getNextNumeroOP_Real((err, { seq, ano, numero_op }) => {
          if (err) return serverError(res, err);

          // Insere a OP
          db.query(
            `INSERT INTO ordens_producao
               (numero_op, seq_ano, ano, material_id, codigo_produto,
                descricao_material, qtde_total, unidade_medida,
                custo_unitario, custo_total, status,
                observacoes, responsavel, criado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA', ?, ?, ?)`,
            [
              numero_op, seq, ano, material_id,
              mat.codigo_produto, mat.descricao,
              qtde_total, unidade_medida || null,
              custo_unitario, custo_total,
              observacoes || null,
              responsavel || null,
              req.user.id,
            ],
            (err, result) => {
              if (err) return serverError(res, err);

              const op_id = result.insertId;

              // Busca dados completos dos pedidos selecionados para desnormalizar
              const pedidoIds = pedidos.map(p => p.id);

              db.query(
                `SELECT id, codigo_cliente, cliente, estado, pedido_venda,
                        ordem_compra, zerb, qtde_solicitada, data_contratual
                 FROM controle_pedidos WHERE id IN (?)`,
                [pedidoIds],
                (err, pedidoRows) => {
                  if (err) return serverError(res, err);


                  // Monta os inserts de op_pedidos
                  const opPedidosValues = pedidoRows.map(p => {
                    const selecionado = pedidos.find(ps => ps.id === p.id);
                    return [
                      op_id,
                      p.id,
                      p.codigo_cliente,
                      p.cliente,
                      p.estado,
                      p.pedido_venda,
                      p.ordem_compra,
                      p.zerb,
                      p.qtde_solicitada,
                      selecionado?.qtde_atendida || p.qtde_solicitada,
                      p.data_contratual ? p.data_contratual.split('T')[0] : null
                    ]; 
                  });

                  

                  db.query(
                    `INSERT INTO op_pedidos
                       (op_id, pedido_id, codigo_cliente, cliente, estado,
                        pedido_venda, ordem_compra, zerb, qtde_solicitada,
                        qtde_atendida, data_contratual)
                     VALUES ?`,
                    [opPedidosValues],
                    (err) => {
                      if (err) return serverError(res, err);

                      res.status(201).json({
                        success: true,
                        id: op_id,
                        numero_op,
                        message: `OP ${numero_op} criada com sucesso`,
                      });

                      // Log
                      registrarLog({
                        usuario_id:      req.user.id,
                        usuario_nome:    req.user.nome,
                        modulo:          "OP",
                        acao:            "Criar OP",
                        descricao:       `OP ${numero_op} criada — Material: ${mat.codigo_produto} (${mat.descricao}), Qtde: ${qtde_total} ${unidade_medida || ""}`,
                        referencia_id:   op_id,
                        referencia_label: numero_op,
                      });
                    }
                  );
                }
              );
            }
          );
        });
      }
    );
  }
);

/* ──────────────────────────────────────────────────────────────
   GET /op — Lista OPs reais
────────────────────────────────────────────────────────────── */
app.get(
  "/op",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    const search = req.query.search || "";
    const status = req.query.status || "";

    let where  = "WHERE op.is_deleted = 0";
    const params = [];

    if (search) {
      where += " AND (op.numero_op LIKE ? OR op.codigo_produto LIKE ? OR op.descricao_material LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += " AND op.status = ?";
      params.push(status);
    }

    db.query(
      `SELECT op.*,
              COUNT(opp.id) AS total_pedidos,
              SUM(opp.qtde_atendida) AS qtde_confirmada
       FROM ordens_producao op
       LEFT JOIN op_pedidos opp ON opp.op_id = op.id
       ${where}
       GROUP BY op.id
       ORDER BY op.id DESC`,
      params,
      (err, rows) => {
        if (err) return serverError(res, err);
        res.json({ success: true, data: rows });
      }
    );
  }
);

/* ──────────────────────────────────────────────────────────────
   GET /op/:id — Busca OP com seus pedidos vinculados
────────────────────────────────────────────────────────────── */
app.get(
  "/op/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    db.query(
      "SELECT * FROM ordens_producao WHERE id = ? AND is_deleted = 0",
      [req.params.id],
      (err, opRows) => {
        if (err) return serverError(res, err);
        if (!opRows.length)
          return res.status(404).json({ success: false, message: "OP não encontrada" });

        const op = opRows[0];

        // Busca os pedidos vinculados
        db.query(
          "SELECT * FROM op_pedidos WHERE op_id = ? ORDER BY id ASC",
          [op.id],
          (err, pedidos) => {
            if (err) return serverError(res, err);
            res.json({ success: true, data: { ...op, pedidos } });
          }
        );
      }
    );
  }
);

/* ──────────────────────────────────────────────────────────────
   PUT /op/:id — Atualização parcial (status, datas, responsavel)
────────────────────────────────────────────────────────────── */
app.put(
  "/opsalvar/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  (req, res) => {
    const fields = req.body;

    if (!fields || Object.keys(fields).length === 0) {
      return res.status(400).json({ success: false, message: "Nenhum campo para atualizar" });
    }

    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }

    values.push(req.params.id);

    db.query(
      `UPDATE ordens_producao SET ${setClauses.join(", ")} WHERE id = ? AND is_deleted = 0`,
      values,
      (err, result) => {
        if (err) return serverError(res, err);
        if (result.affectedRows === 0)
          return res.status(404).json({ success: false, message: "OP não encontrada" });
        res.json({ success: true, message: "OP atualizada" });

        registrarLog({
          usuario_id: req.user.id, usuario_nome: req.user.nome,
          modulo: "OP", acao: "Salvar OP",
          descricao: `OP ID ${req.params.id} salva — Campos: ${Object.keys(fields).join(", ")}`,
          referencia_id: Number(req.params.id),
        });
      }
    );
  }
);


/* ──────────────────────────────────────────────────────────────
   DELETE /op/:id — Soft delete + libera pedidos vinculados
────────────────────────────────────────────────────────────── */
app.delete(
  "/op/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp"]),
  async (req, res) => {
    try {
      const op_id = req.params.id;

      // 1. Busca pedidos vinculados para reverter qtde_produzida
      const [vinculados] = await db.promise().query(
        `SELECT opp.pedido_id, opp.qtde_atendida FROM op_pedidos opp WHERE opp.op_id = ?`,
        [op_id]
      );

      // 2. Reverte qtde_produzida e libera pedido
      for (const p of vinculados) {
        await db.promise().query(
          `UPDATE controle_pedidos
           SET qtde_produzida = GREATEST(0, COALESCE(qtde_produzida, 0) - ?),
               data_finalizada = NULL, status_producao = 'Curso normal'
           WHERE id = ?`,
          [Number(p.qtde_atendida || 0), p.pedido_id]
        );
      }

      // 3. Remove vínculos
      await db.promise().query("DELETE FROM op_pedidos WHERE op_id = ?", [op_id]);

      // 4. Soft delete da OP
      const [result] = await db.promise().query(
        "UPDATE ordens_producao SET is_deleted = 1 WHERE id = ?", [op_id]
      );
      if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "OP não encontrada" });

      res.json({ success: true, message: `OP removida. ${vinculados.length} pedido(s) liberado(s).` });

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "OP", acao: "Excluir OP",
        descricao: `OP ID ${op_id} excluída. ${vinculados.length} pedido(s) liberado(s).`,
        referencia_id: Number(op_id),
      });
    } catch (err) {
      console.error("Erro ao excluir OP:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* =======================
   OPs — DELETE (soft delete + libera pedidos)
======================= */
app.delete(
  "/ordens_producao/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp"]),
  async (req, res) => {
    try {
      const op_id = req.params.id;

      const [vinculados] = await db.promise().query(
        `SELECT opp.pedido_id, opp.qtde_atendida FROM op_pedidos opp WHERE opp.op_id = ?`,
        [op_id]
      );

      for (const p of vinculados) {
        await db.promise().query(
          `UPDATE controle_pedidos
           SET qtde_produzida = GREATEST(0, COALESCE(qtde_produzida, 0) - ?),
               data_finalizada = NULL, status_producao = 'Curso normal'
           WHERE id = ?`,
          [Number(p.qtde_atendida || 0), p.pedido_id]
        );
      }

      await db.promise().query("DELETE FROM op_pedidos WHERE op_id = ?", [op_id]);

      const [result] = await db.promise().query(
        "UPDATE ordens_producao SET is_deleted = 1 WHERE id = ?", [op_id]
      );
      if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "OP não encontrada" });

      res.json({ success: true, message: `OP removida. ${vinculados.length} pedido(s) liberado(s).` });

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "OP", acao: "Excluir OP",
        descricao: `OP ID ${op_id} excluída. ${vinculados.length} pedido(s) liberado(s).`,
        referencia_id: Number(op_id),
      });
    } catch (err) {
      console.error("Erro ao excluir OP:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);
/* =======================
   PEDIDOS — GET (listar)    ← adicionado auth
======================= */
app.get(
  "/pedidos",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    const { cliente, status } = req.query;
    let where = "WHERE 1=1";
    const params = [];

    if (cliente) { where += " AND (cp.cliente LIKE ? OR cc.codigo_cliente LIKE ?)"; params.push(`%${cliente}%`, `%${cliente}%`); }
    if (status)  { where += " AND cp.status_producao = ?"; params.push(status); }

    db.query(
      `SELECT cp.*, cc.codigo_cliente, cc.codigo_zerb
       FROM controle_pedidos cp
       LEFT JOIN codigos_clientes cc ON cp.codigo_cliente = cc.codigo_cliente
       ${where}
       ORDER BY cp.id DESC`,
      params,
      (err, rows) => {
        if (err) return serverError(res, err);
        res.json({ success: true, data: rows });
      }
    );
  }
);

/* =======================
   PEDIDOS — GET (por id)    ← estava faltando
======================= */
app.get(
  "/pedidos/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    db.query(
      `SELECT cp.*, cc.codigo_zerb
       FROM controle_pedidos cp
       LEFT JOIN codigos_clientes cc ON cp.codigo_cliente = cc.codigo_cliente
       WHERE cp.id = ?`,
      [req.params.id],
      (err, rows) => {
        if (err) return serverError(res, err);
        if (!rows.length)
          return res.status(404).json({ success: false, message: "Pedido não encontrado" });
        res.json({ success: true, data: rows[0] });
      }
    );
  }
);

/* =======================
   PEDIDOS — POST (criar)    ← adicionado auth
======================= */
app.post(
  "/pedidos",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    const { ordem_compra, codigo_cliente, zerb, controle, cliente, estado, pedido_venda,
            qtde_solicitada, qtde_produzida, status_producao,
            data_contratual, data_finalizada } = req.body;


    // Auto-preenche zerb se não veio mas tem codigo_cliente
    const resolverZerb = (cb) => {
      if (zerb) return cb(zerb);
      if (!codigo_cliente) return cb(null);
      db.query(
        "SELECT codigo_zerb FROM codigos_clientes WHERE codigo_cliente = ? LIMIT 1",
        [codigo_cliente],
        (err, rows) => cb((!err && rows.length) ? rows[0].codigo_zerb : null)
      );
    };

    // Auto-preenche controle: compara estoque vs qtde_solicitada
    const resolverControle = (zerbFinal, cb) => {
      if (controle) return cb(controle);
      if (!zerbFinal || !qtde_solicitada) return cb(null);
      db.query(
        "SELECT estoque FROM materiais WHERE codigo_produto = ? LIMIT 1",
        [zerbFinal],
        (err, rows) => {
          if (err || !rows.length) return cb("Produção Necessária");
          const estoque = Number(rows[0].estoque || 0);
          cb(estoque >= Number(qtde_solicitada) ? "Item de Estoque" : "Produção Necessária");
        }
      );
    };

    resolverZerb((zerbFinal) => {
      resolverControle(zerbFinal, (controleFinal) => {
        db.query(
          `INSERT INTO controle_pedidos
            (ordem_compra, codigo_cliente, zerb, controle, cliente, estado, pedido_venda,
             qtde_solicitada, qtde_produzida, status_producao, data_contratual, data_finalizada)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ordem_compra || null, codigo_cliente || null, zerbFinal || null, controleFinal || null,
           cliente || null, estado || null, pedido_venda || null,
           qtde_solicitada || null, qtde_produzida || null,
           status_producao || "Curso normal",
           data_contratual || null, data_finalizada || null],
          (err, result) => {
            if (err) return serverError(res, err);
            res.status(201).json({ success: true, id: result.insertId, message: "Pedido criado" });

            registrarLog({
              usuario_id: req.user.id, usuario_nome: req.user.nome,
              modulo: "PEDIDO", acao: "Criar Pedido",
              descricao: `Pedido criado — PV: ${pedido_venda}, Cliente: ${cliente}, Qtde: ${qtde_solicitada || 0}, Controle: ${controleFinal || "—"}`,
              referencia_id: result.insertId, referencia_label: pedido_venda,
            });
          }
        );
      });
    });
  }
);

/* =======================
   PEDIDOS — PUT (atualizar) ← estava faltando
======================= */
app.put(
  "/pedidos/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  (req, res) => {
    const { ordem_compra, codigo_cliente, zerb, controle, cliente, estado, pedido_venda,
            qtde_solicitada, qtde_produzida, status_producao,
            data_contratual, data_finalizada } = req.body;

    // Auto-preenche zerb se não veio mas tem codigo_cliente
    const resolverZerb = (cb) => {
      if (zerb) return cb(zerb);
      if (!codigo_cliente) return cb(null);
      db.query(
        "SELECT codigo_zerb FROM codigos_clientes WHERE codigo_cliente = ? LIMIT 1",
        [codigo_cliente],
        (err, rows) => cb((!err && rows.length) ? rows[0].codigo_zerb : null)
      );
    };

    // Auto-preenche controle: compara estoque vs qtde_solicitada
    const resolverControle = (zerbFinal, cb) => {
      if (controle) return cb(controle);
      if (!zerbFinal || !qtde_solicitada) return cb(null);
      db.query(
        "SELECT estoque FROM materiais WHERE codigo_produto = ? LIMIT 1",
        [zerbFinal],
        (err, rows) => {
          if (err || !rows.length) return cb("Produção Necessária");
          const estoque = Number(rows[0].estoque || 0);
          cb(estoque >= Number(qtde_solicitada) ? "Item de Estoque" : "Produção Necessária");
        }
      );
    };

    resolverZerb((zerbFinal) => {
      resolverControle(zerbFinal, (controleFinal) => {
        db.query(
          `UPDATE controle_pedidos
           SET ordem_compra = ?, codigo_cliente = ?, zerb = ?, controle = ?, cliente = ?, estado = ?,
               pedido_venda = ?, qtde_solicitada = ?, qtde_produzida = ?,
               status_producao = ?, data_contratual = ?, data_finalizada = ?
           WHERE id = ?`,
          [ordem_compra || null, codigo_cliente || null, zerbFinal || null, controleFinal || null,
           cliente || null, estado || null, pedido_venda || null,
           qtde_solicitada || null, qtde_produzida || null,
           status_producao || "Curso normal",
           data_contratual || null, data_finalizada || null,
           req.params.id],
          (err, result) => {
            if (err) return serverError(res, err);
            if (result.affectedRows === 0)
              return res.status(404).json({ success: false, message: "Pedido não encontrado" });
            res.json({ success: true, message: "Pedido atualizado" });

            registrarLog({
              usuario_id: req.user.id, usuario_nome: req.user.nome,
              modulo: "PEDIDO", acao: "Editar Pedido",
              descricao: `Pedido ID ${req.params.id} atualizado — PV: ${pedido_venda}, Cliente: ${cliente}, Qtde: ${qtde_solicitada || 0}, Status: ${status_producao || "—"}`,
              referencia_id: Number(req.params.id), referencia_label: pedido_venda,
            });
          }
        );
      });
    });
  }
);

/* =======================
   PEDIDOS — DELETE (excluir)
======================= */
app.delete(
  "/pedidos/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  (req, res) => {
    db.query(
      "DELETE FROM controle_pedidos WHERE id = ?",
      [req.params.id],
      (err, result) => {
        if (err) return serverError(res, err);
        if (result.affectedRows === 0)
          return res.status(404).json({ success: false, message: "Pedido não encontrado" });
        res.json({ success: true, message: "Pedido excluído" });
        registrarLog({
          usuario_id: req.user.id, usuario_nome: req.user.nome,
          modulo: "PEDIDO", acao: "Excluir Pedido",
          descricao: `Pedido ID ${req.params.id} excluído`,
          referencia_id: Number(req.params.id),
        });
      }
    );
  }
);

/* =======================
   CLIENTES
======================= */
app.get("/clientes", authMiddleware, (req, res) => {
  db.query(
    "SELECT id, codigo_cliente, codigo_zerb, descricao FROM codigos_clientes ORDER BY codigo_cliente ASC",
    (err, rows) => {
      if (err) return serverError(res, err);
      res.json(rows);
    }
  );
});

/* =======================
   CLIENTE ↔ MATERIAL
======================= */
app.get("/cliente-material/:codigo_cliente", authMiddleware, (req, res) => {
  db.query(
    `SELECT 
       cc.codigo_cliente,
       cc.codigo_zerb,
       cc.descricao   AS cliente_descricao,
       m.id           AS material_id,
       m.codigo_produto,
       m.descricao    AS material_descricao,
       m.custo_fornecedor,
       m.estoque
     FROM codigos_clientes cc
     LEFT JOIN materiais m ON m.codigo_produto = cc.codigo_zerb
     WHERE cc.codigo_cliente = ?`,
    [req.params.codigo_cliente],
    (err, rows) => {
      if (err) return serverError(res, err);
      if (!rows.length)
        return res.json({ success: true, data: null });
      res.json({ success: true, data: rows[0] });
    }
  );
});


app.get(
  "/controle_pedidos/material/:codigoProduto",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  async (req, res) => {
    try {
      const { codigoProduto } = req.params;

      const [rows] = await db.promise().query(
        `SELECT 
            id,
            codigo_cliente,
            cliente,
            estado,
            pedido_venda,
            ordem_compra,
            zerb,
            qtde_solicitada,
            COALESCE(qtde_produzida, 0) AS qtde_produzida,
            (COALESCE(qtde_solicitada, 0) - COALESCE(qtde_produzida, 0)) AS qtde_pendente,
            data_contratual,
            status_producao
         FROM controle_pedidos
         WHERE zerb = ?
         AND data_finalizada IS NULL
         AND (
              qtde_produzida IS NULL 
              OR qtde_produzida < qtde_solicitada
         )
         ORDER BY data_contratual ASC`,
        [codigoProduto]
      );

      res.json({
        success: true,
        total: rows.length,
        data: rows
      });
    } catch (err) {
      console.error("Erro ao buscar pedidos:", err);
      res.status(500).json({
        success: false,
        message: "Erro ao buscar pedidos."
      });
    }
  }
);

/* =====================================================
   VINCULAR PEDIDOS A UMA OP
===================================================== */
app.post(
  "/op_pedidos/vincular",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  async (req, res) => {
    try {
      const { op_id, pedidos } = req.body;

      if (!op_id || !Array.isArray(pedidos) || pedidos.length === 0) {
        return res.status(400).json({ success: false, message: "Dados inválidos." });
      }

      // Verificar se a tabela op_pedidos existe, criar se não existir
      await db.promise().query(`
        CREATE TABLE IF NOT EXISTS op_pedidos (
          id              INT NOT NULL AUTO_INCREMENT,
          op_id           INT NOT NULL,
          pedido_id       INT NOT NULL,
          codigo_cliente  VARCHAR(50) NULL,
          cliente         VARCHAR(100) NULL,
          estado          VARCHAR(50) NULL,
          pedido_venda    VARCHAR(50) NULL,
          ordem_compra    VARCHAR(50) NULL,
          zerb            VARCHAR(50) NULL,
          qtde_solicitada INT NULL,
          qtde_atendida   INT NULL DEFAULT 0,
          data_contratual DATE NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_op_pedido (op_id, pedido_id)
        )
      `);

      let inseridos = 0;
      let ignorados = 0;

      for (const p of pedidos) {
        try {
          // Busca qtde real pendente para não exceder
          const [[pedidoReal]] = await db.promise().query(
            `SELECT COALESCE(qtde_solicitada, 0) AS sol, COALESCE(qtde_produzida, 0) AS prod
             FROM controle_pedidos WHERE id = ?`,
            [p.id]
          );
          const pendente = Math.max(0, Number(pedidoReal?.sol || 0) - Number(pedidoReal?.prod || 0));
          const qtdeAtendida = Math.min(Number(p.qtde_atendida || 0), pendente || Number(p.qtde_atendida || 0));

          await db.promise().query(
            `INSERT INTO op_pedidos (
              op_id, pedido_id, codigo_cliente, cliente, estado,
              pedido_venda, ordem_compra, zerb, qtde_solicitada,
              qtde_atendida, data_contratual
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE qtde_atendida = VALUES(qtde_atendida)`,
            [
              op_id,
              p.id,
              p.codigo_cliente  || null,
              p.cliente         || null,
              p.estado          || null,
              p.pedido_venda    || null,
              p.ordem_compra    || null,
              p.zerb            || null,
              p.qtde_solicitada || 0,
              qtdeAtendida,
              p.data_contratual ? String(p.data_contratual).split("T")[0] : null,
            ]
          );
          inseridos++;
        } catch (innerErr) {
          console.warn(`Pedido ${p.id} não inserido:`, innerErr.message);
          ignorados++;
        }
      }

      res.json({
        success: true,
        message: `${inseridos} pedido(s) vinculado(s).${ignorados ? ` ${ignorados} ignorado(s).` : ""}`,
      });

      // Log
      registrarLog({
        usuario_id:   req.user.id,
        usuario_nome: req.user.nome,
        modulo:       "OP",
        acao:         "Iniciar Produção",
        descricao:    `Produção iniciada — OP ID ${op_id}, ${inseridos} pedido(s) vinculado(s)`,
        referencia_id: op_id,
      });

    } catch (err) {
      console.error("Erro ao vincular pedidos:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);


/* =====================================================
   CONCLUIR OP — Soma qtde_atendida no qtde_produzida dos pedidos
   Só marca "Entregue" se qtde_produzida >= qtde_solicitada
===================================================== */
app.post(
  "/ordens_producao/:id/concluir",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  async (req, res) => {
    try {
      const op_id      = req.params.id;
      const data_final = req.body.data_finalizacao || new Date().toISOString().split("T")[0];

      // 1. Atualiza status e data_finalizacao da OP
      await db.promise().query(
        `UPDATE ordens_producao SET status = 'CONCLUIDA', data_finalizacao = ? WHERE id = ?`,
        [data_final, op_id]
      );

      // 2. Busca pedidos vinculados com suas qtde_atendida
      const [pedidosVinculados] = await db.promise().query(
        `SELECT opp.pedido_id, opp.qtde_atendida, cp.qtde_solicitada, cp.qtde_produzida
         FROM op_pedidos opp
         JOIN controle_pedidos cp ON cp.id = opp.pedido_id
         WHERE opp.op_id = ?`,
        [op_id]
      );

      let pedidosEntregues = 0;
      let pedidosParciais  = 0;

      for (const p of pedidosVinculados) {
        const prodAnterior      = Number(p.qtde_produzida || 0);
        const atendidaNestaOP   = Number(p.qtde_atendida || 0);
        const solicitada        = Number(p.qtde_solicitada || 0);
        // Nunca excede o solicitado
        const novaQtdeProduzida = Math.min(prodAnterior + atendidaNestaOP, solicitada || Infinity);
        const completo          = solicitada > 0 && novaQtdeProduzida >= solicitada;

        console.log(`[Concluir OP ${op_id}] Pedido ${p.pedido_id}: produzida_anterior=${prodAnterior} + atendida=${atendidaNestaOP} = ${novaQtdeProduzida} / solicitada=${solicitada} → ${completo ? "ENTREGUE" : "PARCIAL"}`);

        if (completo) {
          await db.promise().query(
            `UPDATE controle_pedidos
             SET qtde_produzida = ?, data_finalizada = ?, status_producao = 'Entregue'
             WHERE id = ?`,
            [novaQtdeProduzida, data_final, p.pedido_id]
          );
          pedidosEntregues++;
        } else {
          await db.promise().query(
            `UPDATE controle_pedidos
             SET qtde_produzida = ?, status_producao = 'Item em Produção'
             WHERE id = ?`,
            [novaQtdeProduzida, p.pedido_id]
          );
          pedidosParciais++;
        }
      }

      // 3. Calcula saldo e adiciona ao estoque
      const [[opData]] = await db.promise().query(
        `SELECT op.material_id, op.qtde_total, op.codigo_produto
         FROM ordens_producao op WHERE op.id = ?`,
        [op_id]
      );

      const [[{ total_atendida }]] = await db.promise().query(
        `SELECT COALESCE(SUM(qtde_atendida), 0) AS total_atendida FROM op_pedidos WHERE op_id = ?`,
        [op_id]
      );

      const saldo = Number(opData?.qtde_total || 0) - Number(total_atendida || 0);
      let qtdeAdicionada = 0;

      if (opData && opData.material_id && saldo > 0) {
        await db.promise().query(
          `UPDATE materiais SET estoque = estoque + ? WHERE id = ?`,
          [saldo, opData.material_id]
        );
        qtdeAdicionada = saldo;
      }

      // 4. Busca insumos da OP e subtrai do estoque
      const [insumos] = await db.promise().query(
        `SELECT material_id, quantidade FROM op_insumos WHERE op_id = ? AND material_id IS NOT NULL`,
        [op_id]
      );

      let estoqueInsuficiente = [];
      for (const ins of insumos) {
        const [[mat]] = await db.promise().query(
          `SELECT estoque, codigo_produto FROM materiais WHERE id = ?`,
          [ins.material_id]
        );
        if (!mat) continue;
        if (Number(mat.estoque) - Number(ins.quantidade) < 0) {
          estoqueInsuficiente.push({ codigo: mat.codigo_produto, estoque_atual: mat.estoque, necessario: ins.quantidade });
        }
        await db.promise().query(
          `UPDATE materiais SET estoque = estoque - ? WHERE id = ?`,
          [Number(ins.quantidade), ins.material_id]
        );
      }

      const avisoEstoque = estoqueInsuficiente.length > 0
        ? ` ⚠️ Estoque negativo: ${estoqueInsuficiente.map(e => `${e.codigo} (tinha ${e.estoque_atual}, usou ${e.necessario})`).join(", ")}`
        : "";

      res.json({
        success: true,
        message: `OP concluída. Saldo: +${qtdeAdicionada} ao estoque. ${pedidosEntregues} entregue(s), ${pedidosParciais} parcial(is). ${insumos.length} insumo(s) baixados.${avisoEstoque}`,
        pedidos_finalizados: pedidosEntregues,
        pedidos_parciais:    pedidosParciais,
        insumos_baixados:    insumos.length,
        estoque_insuficiente: estoqueInsuficiente,
      });

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "OP", acao: "Concluir OP",
        descricao: `OP ID ${op_id} concluída em ${data_final}. ${pedidosEntregues} entregue(s), ${pedidosParciais} parcial(is), saldo +${qtdeAdicionada}, ${insumos.length} insumo(s) baixados${avisoEstoque}`,
        referencia_id: Number(op_id),
      });

    } catch (err) {
      console.error("Erro ao concluir OP:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* =======================
   CONTROLE_PEDIDOS — GET (busca por texto para saída de estoque)
======================= */
app.get(
  "/controle_pedidos",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  async (req, res) => {
    try {
      const { search, limit = 20 } = req.query;
      let where = "WHERE data_finalizada IS NULL";
      const params = [];

      if (search) {
        where += ` AND (cliente LIKE ? OR pedido_venda LIKE ?
                    OR ordem_compra LIKE ? OR zerb LIKE ?
                    OR codigo_cliente LIKE ?)`;
        const q = `%${search}%`;
        params.push(q, q, q, q, q);
      }

      const [rows] = await db.promise().query(
        `SELECT * FROM controle_pedidos ${where}
         ORDER BY data_contratual ASC LIMIT ?`,
        [...params, Number(limit)]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* =====================================================
   SAÍDAS DE ESTOQUE
===================================================== */
app.get(
  "/saidas_estoque",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  async (req, res) => {
    try {
      await criarTabelasSaida();
      const limit = Number(req.query.limit) || 50;
      const [rows] = await db.promise().query(
        `SELECT s.*,
                COUNT(si.id)      AS total_itens,
                SUM(si.subtotal)  AS custo_total
         FROM saidas_estoque s
         LEFT JOIN saidas_estoque_itens si ON si.saida_id = s.id
         GROUP BY s.id
         ORDER BY s.id DESC
         LIMIT ?`,
        [limit]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.get(
  "/saidas_estoque/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas"]),
  async (req, res) => {
    try {
      await criarTabelasSaida();
      const [[saida]] = await db.promise().query(
        `SELECT * FROM saidas_estoque WHERE id = ?`, [req.params.id]
      );
      if (!saida) return res.status(404).json({ success: false, message: "Saída não encontrada" });

      const [itens] = await db.promise().query(
        `SELECT * FROM saidas_estoque_itens WHERE saida_id = ? ORDER BY id`, [req.params.id]
      );
      res.json({ success: true, data: { ...saida, itens } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.post(
  "/saidas_estoque",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica"]),
  async (req, res) => {
    try {
      await criarTabelasSaida();
      const { pedido_id, usuario, observacoes, itens } = req.body;

      if (!pedido_id || !Array.isArray(itens) || itens.length === 0)
        return res.status(400).json({ success: false, message: "Dados inválidos." });

      // Busca dados do pedido para gravar no comprovante
      const [[pedido]] = await db.promise().query(
        `SELECT * FROM controle_pedidos WHERE id = ?`, [pedido_id]
      );
      if (!pedido) return res.status(404).json({ success: false, message: "Pedido não encontrado." });

      // Próximo número sequencial
      const [[{ ultimo }]] = await db.promise().query(
        `SELECT COALESCE(MAX(numero), 0) AS ultimo FROM saidas_estoque`
      );
      const numero = ultimo + 1;
      const hoje   = new Date().toISOString().split("T")[0];

      // Insere cabeçalho da saída
      const [ins] = await db.promise().query(
        `INSERT INTO saidas_estoque
           (numero, pedido_id, codigo_cliente, cliente, estado,
            pedido_venda, ordem_compra, zerb, data_saida, usuario, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [numero, pedido_id, pedido.codigo_cliente || null, pedido.cliente || null,
         pedido.estado || null, pedido.pedido_venda || null, pedido.ordem_compra || null,
         pedido.zerb || null, hoje, usuario || "Sistema", observacoes || null]
      );
      const saida_id = ins.insertId;

      // Insere itens e baixa estoque
      for (const it of itens) {
        const qtde    = Number(it.quantidade     || 0);
        const custo   = Number(it.custo_unitario || 0);
        await db.promise().query(
          `INSERT INTO saidas_estoque_itens
             (saida_id, material_id, codigo_produto, descricao, unidade_medida, quantidade, custo_unitario, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [saida_id, it.material_id || null, it.codigo_produto, it.descricao,
           it.unidade_medida || "un", qtde, custo, Number((qtde * custo).toFixed(2))]
        );

        // Baixa estoque
        if (it.material_id) {
          await db.promise().query(
            `UPDATE materiais SET estoque = GREATEST(0, estoque - ?) WHERE id = ?`,
            [qtde, it.material_id]
          );
        }
      }

      // Marca pedido como atendido via estoque
      await db.promise().query(
        `UPDATE controle_pedidos SET data_finalizada = ?, status_producao = 'Entregue' WHERE id = ?`,
        [hoje, pedido_id]
      );

      // Retorna saída completa para exibir o comprovante
      const [[saidaFull]] = await db.promise().query(
        `SELECT * FROM saidas_estoque WHERE id = ?`, [saida_id]
      );
      const [itensFull] = await db.promise().query(
        `SELECT * FROM saidas_estoque_itens WHERE saida_id = ? ORDER BY id`, [saida_id]
      );

      res.json({
        success: true,
        numero,
        message: `Saída Nº ${numero} registrada com sucesso.`,
        saida: { ...saidaFull, itens: itensFull },
      });

      // Log
      registrarLog({
        usuario_id:      req.user.id,
        usuario_nome:    req.user.nome,
        modulo:          "ESTOQUE",
        acao:            "Saída de Estoque",
        descricao:       `Saída Nº ${numero} — Cliente: ${pedido.cliente || "—"}, ${itens.length} item(s) retirado(s) do estoque para atender pedido ID ${pedido_id}`,
        referencia_id:   saida_id,
        referencia_label: `Saída #${numero}`,
      });

    } catch (err) {
      console.error("Erro ao registrar saída:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Cria tabelas de saída se não existirem
async function criarTabelasSaida() {
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS saidas_estoque (
      id             INT NOT NULL AUTO_INCREMENT,
      numero         INT NOT NULL,
      pedido_id      INT NULL,
      codigo_cliente VARCHAR(50)  NULL,
      cliente        VARCHAR(100) NULL,
      estado         VARCHAR(50)  NULL,
      pedido_venda   VARCHAR(50)  NULL,
      ordem_compra   VARCHAR(50)  NULL,
      zerb           VARCHAR(50)  NULL,
      data_saida     DATE         NOT NULL,
      usuario        VARCHAR(100) NULL,
      observacoes    TEXT         NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_saida_numero (numero)
    )
  `);
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS saidas_estoque_itens (
      id             INT NOT NULL AUTO_INCREMENT,
      saida_id       INT NOT NULL,
      material_id    INT NULL,
      codigo_produto VARCHAR(50)  NULL,
      descricao      VARCHAR(255) NULL,
      unidade_medida VARCHAR(20)  NULL,
      quantidade     DECIMAL(10,3) NOT NULL DEFAULT 0,
      custo_unitario DECIMAL(10,4) NOT NULL DEFAULT 0,
      subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_sei_saida (saida_id)
    )
  `);
}

/* =======================
   USUÁRIOS — CRUD (apenas admin)
======================= */
app.get(
  "/usuarios",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const [rows] = await db.promise().query(
        "SELECT id, nome, email, perfil, ativo, criado_em FROM usuarios ORDER BY id ASC"
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.get(
  "/usuarios/:id",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const [[user]] = await db.promise().query(
        "SELECT id, nome, email, perfil, ativo, criado_em FROM usuarios WHERE id = ?",
        [req.params.id]
      );
      if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado" });
      res.json({ success: true, data: user });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.post(
  "/usuarios",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const { nome, email, senha, perfil, ativo } = req.body;
      if (!nome || !email || !senha)
        return res.status(400).json({ success: false, message: "Nome, email e senha são obrigatórios" });

      const senha_hash = await bcrypt.hash(senha, 10);
      const [result] = await db.promise().query(
        "INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, ?)",
        [nome, email, senha_hash, perfil || "pcp", ativo !== undefined ? ativo : 1]
      );
      res.status(201).json({ success: true, id: result.insertId, message: "Usuário criado" });

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "USUARIO", acao: "Criar Usuário",
        descricao: `Usuário criado — ${nome} (${email}), perfil: ${perfil || "pcp"}`,
        referencia_id: result.insertId, referencia_label: nome,
      });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY")
        return res.status(409).json({ success: false, message: "Email já cadastrado" });
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.put(
  "/usuarios/:id",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const { nome, email, senha, perfil, ativo } = req.body;
      const sets = [];
      const vals = [];

      if (nome  !== undefined) { sets.push("nome = ?");  vals.push(nome); }
      if (email !== undefined) { sets.push("email = ?"); vals.push(email); }
      if (perfil !== undefined) { sets.push("perfil = ?"); vals.push(perfil); }
      if (ativo !== undefined) { sets.push("ativo = ?"); vals.push(ativo); }
      if (senha) {
        const hash = await bcrypt.hash(senha, 10);
        sets.push("senha_hash = ?"); vals.push(hash);
      }

      if (sets.length === 0)
        return res.status(400).json({ success: false, message: "Nenhum campo para atualizar" });

      vals.push(req.params.id);
      const [result] = await db.promise().query(
        `UPDATE usuarios SET ${sets.join(", ")} WHERE id = ?`, vals
      );
      if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "Usuário não encontrado" });

      res.json({ success: true, message: "Usuário atualizado" });

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "USUARIO", acao: "Editar Usuário",
        descricao: `Usuário ID ${req.params.id} atualizado — ${nome || "(sem alteração de nome)"}`,
        referencia_id: Number(req.params.id), referencia_label: nome || null,
      });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY")
        return res.status(409).json({ success: false, message: "Email já cadastrado" });
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.delete(
  "/usuarios/:id",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      // Não deixa excluir a si mesmo
      if (Number(req.params.id) === req.user.id)
        return res.status(400).json({ success: false, message: "Você não pode excluir seu próprio usuário" });

      const [result] = await db.promise().query(
        "DELETE FROM usuarios WHERE id = ?", [req.params.id]
      );
      if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "Usuário não encontrado" });

      res.json({ success: true, message: "Usuário excluído" });

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "USUARIO", acao: "Excluir Usuário",
        descricao: `Usuário ID ${req.params.id} excluído`,
        referencia_id: Number(req.params.id),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* =======================
   SISTEMA — BACKUP (cria banco backup_pcp_DATA com cópia de todas as tabelas)
======================= */

app.get(
  "/sistema/backup",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const hoje     = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
      const hora     = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
      const backupDb = `backup_pcp_${hoje}_${hora}`;

      // 1. Cria banco de backup
      await db.promise().query(`CREATE DATABASE IF NOT EXISTS \`${backupDb}\``);

      // 2. Lista todas as tabelas do banco pcp
      const [tables] = await db.promise().query("SHOW TABLES");
      const tableKey = Object.keys(tables[0])[0];
      const tableNames = tables.map(t => t[tableKey]);

      // 3. Copia cada tabela (estrutura + dados)
      for (const table of tableNames) {
        await db.promise().query(`CREATE TABLE \`${backupDb}\`.\`${table}\` LIKE \`pcp\`.\`${table}\``);
        await db.promise().query(`INSERT INTO \`${backupDb}\`.\`${table}\` SELECT * FROM \`pcp\`.\`${table}\``);
      }

      // 4. Também gera o .sql para download
      let sql = `-- Backup PCP - ${new Date().toLocaleString("pt-BR")}\n`;
      sql += `-- Banco de backup: ${backupDb}\n`;
      sql += `-- Todas as ${tableNames.length} tabelas copiadas\n`;
      sql += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

      for (const table of tableNames) {
        const [[createResult]] = await db.promise().query(`SHOW CREATE TABLE \`pcp\`.\`${table}\``);
        const createSQL = createResult["Create Table"];
        sql += `-- Tabela: ${table}\n`;
        sql += `${createSQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")};\n\n`;

        const [rows] = await db.promise().query(`SELECT * FROM \`pcp\`.\`${table}\``);
        if (rows.length > 0) {
          const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(", ");
          for (let i = 0; i < rows.length; i += 100) {
            const chunk = rows.slice(i, i + 100);
            const values = chunk.map(row => {
              const vals = Object.values(row).map(v => {
                if (v === null) return "NULL";
                if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
                if (typeof v === "number") return v;
                return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
              });
              return `(${vals.join(", ")})`;
            }).join(",\n  ");
            sql += `INSERT INTO \`${table}\` (${cols}) VALUES\n  ${values};\n`;
          }
          sql += `\n`;
        }
      }
      sql += `SET FOREIGN_KEY_CHECKS = 1;\n`;

      const filename = `${backupDb}.sql`;
      res.setHeader("Content-Type", "application/sql");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(sql);

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "SISTEMA", acao: "Backup",
        descricao: `Backup criado: banco ${backupDb} + arquivo ${filename} (${tableNames.length} tabelas)`,
      });

    } catch (err) {
      console.error("Erro no backup:", err);
      res.status(500).json({ success: false, message: "Erro ao gerar backup: " + err.message });
    }
  }
);

/* =======================
   SISTEMA — LISTAR BACKUPS (bancos backup_pcp_*)
======================= */
app.get(
  "/sistema/backups",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const [dbs] = await db.promise().query("SHOW DATABASES LIKE 'backup_pcp_%'");
      const key = Object.keys(dbs[0] || {})[0];
      const backups = dbs.map(d => d[key]).sort().reverse();
      res.json({ success: true, data: backups });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* =======================
   SISTEMA — RESTAURAR BACKUP (de um banco backup_pcp_*)
======================= */
app.post(
  "/sistema/restaurar",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const { banco } = req.body;
      if (!banco || !banco.startsWith("backup_pcp_")) {
        return res.status(400).json({ success: false, message: "Nome de banco inválido." });
      }

      // Verifica se o banco existe
      const [check] = await db.promise().query(`SHOW DATABASES LIKE ?`, [banco]);
      if (check.length === 0) {
        return res.status(404).json({ success: false, message: `Banco ${banco} não encontrado.` });
      }

      // Lista tabelas do backup
      const [tables] = await db.promise().query(`SHOW TABLES FROM \`${banco}\``);
      const tableKey = Object.keys(tables[0])[0];
      const tableNames = tables.map(t => t[tableKey]);

      await db.promise().query("SET FOREIGN_KEY_CHECKS = 0");

      let restauradas = 0;
      for (const table of tableNames) {
        // Limpa tabela atual e copia dados do backup
        await db.promise().query(`TRUNCATE TABLE \`pcp\`.\`${table}\``);
        await db.promise().query(`INSERT INTO \`pcp\`.\`${table}\` SELECT * FROM \`${banco}\`.\`${table}\``);
        restauradas++;
      }

      await db.promise().query("SET FOREIGN_KEY_CHECKS = 1");

      res.json({
        success: true,
        message: `Restauração concluída! ${restauradas} tabela(s) restauradas do banco ${banco}.`,
      });

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "SISTEMA", acao: "Restaurar Backup",
        descricao: `Banco restaurado de ${banco} — ${restauradas} tabelas`,
      });

    } catch (err) {
      console.error("Erro ao restaurar:", err);
      res.status(500).json({ success: false, message: "Erro ao restaurar: " + err.message });
    }
  }
);

/* =======================
   SISTEMA — EXCLUIR BACKUP
======================= */
app.delete(
  "/sistema/backup/:banco",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const { banco } = req.params;
      if (!banco.startsWith("backup_pcp_")) {
        return res.status(400).json({ success: false, message: "Nome inválido." });
      }
      await db.promise().query(`DROP DATABASE IF EXISTS \`${banco}\``);
      res.json({ success: true, message: `Backup ${banco} excluído.` });

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "SISTEMA", acao: "Excluir Backup",
        descricao: `Banco de backup ${banco} excluído`,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* =======================
   SISTEMA — EXPORTAR DADOS PARA EXCEL (Power BI)
======================= */
app.get(
  "/sistema/exportar",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const ExcelJS = require("exceljs");
      const wb = new ExcelJS.Workbook();
      wb.creator = "PCP Sistema";
      wb.created = new Date();

      // Helper: cria aba — colunas auto-detectadas dos dados ou manual
      const criarAba = (nome, rows, colunasManual) => {
        const ws = wb.addWorksheet(nome);
        if (rows.length === 0) {
          ws.addRow(["Sem dados"]);
          return ws;
        }
        const keys = Object.keys(rows[0]);
        if (colunasManual) {
          ws.columns = colunasManual.map(c => ({ header: c.header, key: c.key, width: c.width || 18 }));
        } else {
          ws.columns = keys.map(k => ({ header: k, key: k, width: 18 }));
        }
        ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1f2a6f" } };
        ws.getRow(1).alignment = { horizontal: "center" };
        rows.forEach(r => ws.addRow(r));
        const lastCol = ws.columns.length;
        const colLetter = lastCol <= 26 ? String.fromCharCode(64 + lastCol) : "A" + String.fromCharCode(64 + lastCol - 26);
        ws.autoFilter = { from: "A1", to: `${colLetter}1` };
        return ws;
      };

      // 1. Ordens de Produção
      const [ops] = await db.promise().query(
        `SELECT * FROM ordens_producao WHERE is_deleted = 0 ORDER BY id DESC`
      );
      criarAba("Ordens de Produção", ops);

      // 2. Pedidos Vinculados (op_pedidos)
      const [opPedidos] = await db.promise().query(
        `SELECT opp.*, op.numero_op
         FROM op_pedidos opp
         LEFT JOIN ordens_producao op ON op.id = opp.op_id
         ORDER BY opp.op_id DESC, opp.id ASC`
      );
      criarAba("Pedidos por OP", opPedidos);

      // 3. Controle de Pedidos
      const [pedidos] = await db.promise().query(
        `SELECT * FROM controle_pedidos ORDER BY id DESC`
      );
      criarAba("Controle de Pedidos", pedidos);

      // 4. Materiais
      const [materiais] = await db.promise().query(
        `SELECT * FROM materiais ORDER BY CAST(codigo_produto AS UNSIGNED) ASC`
      );
      criarAba("Materiais", materiais);

      // 5. Insumos
      const [insumos] = await db.promise().query(
        `SELECT ins.*, op.numero_op
         FROM op_insumos ins
         LEFT JOIN ordens_producao op ON op.id = ins.op_id
         ORDER BY ins.op_id DESC, ins.id ASC`
      );
      criarAba("Insumos por OP", insumos);

      // 6. Saídas de Estoque
      const [saidas] = await db.promise().query(
        `SELECT * FROM saidas_estoque ORDER BY id DESC`
      );
      criarAba("Saídas de Estoque", saidas);

      // 7. Itens de Saída
      const [saidaItens] = await db.promise().query(
        `SELECT si.*, s.numero AS saida_numero
         FROM saidas_estoque_itens si
         LEFT JOIN saidas_estoque s ON s.id = si.saida_id
         ORDER BY si.saida_id DESC, si.id ASC`
      );
      criarAba("Itens de Saída", saidaItens);

      // 8. Logs
      const [logs] = await db.promise().query(
        `SELECT * FROM logs_sistema ORDER BY id DESC LIMIT 5000`
      );
      criarAba("Logs", logs);

      // 9. Usuários (sem senha)
      const [usuarios] = await db.promise().query(
        `SELECT * FROM usuarios ORDER BY id`
      );
      // Remove senha_hash dos dados
      const usuariosSafe = usuarios.map(u => { const { senha_hash, ...rest } = u; return rest; });
      criarAba("Usuários", usuariosSafe);

      // Gera e envia
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename  = `PCP_Export_${timestamp}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      await wb.xlsx.write(res);
      res.end();

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "SISTEMA", acao: "Exportar Dados",
        descricao: `Exportação completa gerada: ${filename} (${ops.length} OPs, ${pedidos.length} pedidos, ${materiais.length} materiais, ${logs.length} logs)`,
      });

    } catch (err) {
      console.error("Erro ao exportar:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* =======================
   SISTEMA — INFO DO BANCO (contadores)
======================= */
app.get(
  "/sistema/info",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const [[{ ops }]]       = await db.promise().query("SELECT COUNT(*) AS ops FROM ordens_producao WHERE is_deleted = 0");
      const [[{ pedidos }]]   = await db.promise().query("SELECT COUNT(*) AS pedidos FROM controle_pedidos");
      const [[{ materiais }]] = await db.promise().query("SELECT COUNT(*) AS materiais FROM materiais");
      const [[{ logs }]]      = await db.promise().query("SELECT COUNT(*) AS logs FROM logs_sistema");
      const [[{ usuarios }]]  = await db.promise().query("SELECT COUNT(*) AS usuarios FROM usuarios");
      const [[{ saidas }]]    = await db.promise().query("SELECT COUNT(*) AS saidas FROM saidas_estoque");

      res.json({ success: true, data: { ops, pedidos, materiais, logs, usuarios, saidas } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

  app.set('db', db);
  app.set('registrarLog', registrarLog);
  const relatoriosRoutes   = require('./relatorios-routes');
  const fichaTecnicaRoutes = require('./ficha-tecnica-routes');
  app.use('/relatorios',    authMiddleware, relatoriosRoutes);
  app.use('/ficha-tecnica', authMiddleware, fichaTecnicaRoutes);
  const prestadoresRoutes = require('./prestadores-routes');
  app.use('/prestadores',   authMiddleware, prestadoresRoutes);
const PORTA_SERVER = Number(process.env.SERVER_PORT) || 8080;

app.listen(PORTA_SERVER, "0.0.0.0", () => {
  console.log(`🚀 Servidor Backend rodando!`);
  console.log(`🏠 Local: http://localhost:${PORTA_SERVER}`);
});