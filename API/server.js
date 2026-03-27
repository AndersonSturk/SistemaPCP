const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { exec } = require("child_process");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

// ── Carrega variáveis de ambiente (.env) ────────────
require("dotenv").config();

const app = express();

// ── CORS configurado ────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "../paginas")));

// ── CSRF Token — proteção contra requisições forjadas ──
// Gera token CSRF por sessão, enviado no header X-CSRF-Token
const csrfTokens = new Map(); // token → timestamp
function gerarCSRFToken() {
  const token = crypto.randomBytes(32).toString("hex");
  csrfTokens.set(token, Date.now());
  // Limpa tokens antigos (> 8h)
  for (const [t, ts] of csrfTokens) {
    if (Date.now() - ts > 8 * 60 * 60 * 1000) csrfTokens.delete(t);
  }
  return token;
}
function csrfMiddleware(req, res, next) {
  // Métodos seguros não precisam de CSRF
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  // Login e rotas públicas são isentas
  if (req.path === "/login" || req.path === "/csrf-token") return next();
  const token = req.headers["x-csrf-token"];
  if (!token || !csrfTokens.has(token)) {
    return res.status(403).json({ success: false, message: "Token CSRF inválido ou ausente." });
  }
  next();
}
// Endpoint para obter token CSRF
app.get("/csrf-token", (req, res) => {
  const token = gerarCSRFToken();
  res.json({ csrfToken: token });
});
// Ativa proteção CSRF globalmente
app.use(csrfMiddleware);

// ── Segredos via .env (nunca mais hardcoded) ────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === "MUDE_ESSE_SEGREDO_EM_PRODUCAO") {
  console.error("⚠️  ATENÇÃO: JWT_SECRET não configurado no .env! Gere uma chave segura.");
}

// ── Banco de dados via .env ─────────────────────────
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

// ── Rate Limiting — protege contra brute force ──────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máx 10 tentativas por IP
  message: { success: false, message: "Muitas tentativas de login. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 200, // máx 200 requisições por minuto por IP
  message: { success: false, message: "Muitas requisições. Aguarde um momento." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ ERRO AO CONECTAR NO MYSQL:", err.message);
  } else {
    console.log("✅ Conectado ao MySQL (pcp)");
    // Auto-migrações seguras
    const migrations = [
      {
        table: "controle_pedidos", column: "criado_em",
        sql: "ALTER TABLE controle_pedidos ADD COLUMN criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
      },
      {
        table: "materiais", column: "unidade_compra",
        sql: "ALTER TABLE materiais ADD COLUMN unidade_compra VARCHAR(20) NULL AFTER unidade_medida"
      },
      {
        table: "materiais", column: "fator_conversao",
        sql: "ALTER TABLE materiais ADD COLUMN fator_conversao DECIMAL(14,4) NOT NULL DEFAULT 1 AFTER unidade_compra"
      },
      {
        table: "materiais", column: "descricao_detalhada",
        sql: "ALTER TABLE materiais ADD COLUMN descricao_detalhada TEXT NULL AFTER descricao"
      },
      {
        table: "materiais", column: "percentual_perda",
        sql: "ALTER TABLE materiais ADD COLUMN percentual_perda DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER fator_conversao"
      },
      {
        table: "ficha_tecnica", column: "percentual_perda",
        sql: "ALTER TABLE ficha_tecnica ADD COLUMN percentual_perda DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER unidade_medida"
      },
    ];
    // Migrações de tipo (ALTER COLUMN para corrigir tipos em tabelas existentes)
    const typeFixes = [
      `ALTER TABLE entradas_nf_itens MODIFY COLUMN estoque_anterior DECIMAL(14,4) NULL`,
      `ALTER TABLE entradas_nf_itens MODIFY COLUMN estoque_novo DECIMAL(14,4) NULL`,
      `ALTER TABLE usuarios MODIFY COLUMN perfil ENUM('admin','pcp','producao','logistica','vendas','ped') NOT NULL DEFAULT 'pcp'`,
    ];

    // Índice UNIQUE para evitar OPs duplicadas por concorrência
    connection.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = 'pcp' AND TABLE_NAME = 'ordens_producao' AND INDEX_NAME = 'uq_op_seq_ano'`,
      (e, rows) => {
        if (!e && rows[0].cnt === 0) {
          connection.query(
            `ALTER TABLE ordens_producao ADD UNIQUE INDEX uq_op_seq_ano (seq_ano, ano)`,
            (e2) => { if (!e2) console.log("✅ UNIQUE INDEX uq_op_seq_ano criado em ordens_producao"); }
          );
        }
      }
    );

    let pending = migrations.length + typeFixes.length;
    const done = () => { if (--pending <= 0) connection.release(); };

    for (const m of migrations) {
      connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = 'pcp' AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [m.table, m.column],
        (e, rows) => {
          if (!e && rows.length === 0) {
            connection.query(m.sql, (e2) => {
              if (!e2) console.log(`✅ Coluna ${m.column} adicionada à ${m.table}`);
              done();
            });
          } else done();
        }
      );
    }

    for (const sql of typeFixes) {
      connection.query(sql, (e) => {
        if (!e) console.log("✅ Tipo de coluna corrigido (INT→DECIMAL)");
        done();
      });
    }
  }
});
/* =======================
   HELPERS
======================= */
function serverError(res, err) {
  console.error(err);
  return res.status(500).json({ success: false, message: "Erro interno do servidor" });
}

function normalizeDateToSql(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todaySqlDate() {
  const now = new Date();
  return normalizeDateToSql(now);
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
      const csrfToken = gerarCSRFToken();
      res.json({
        success: true,
        token,
        csrfToken,
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
// Migração: garante coluna estoque_minimo em materiais
async function garantirColunaEstoqueMinimo() {
  await db.promise().query(
    `ALTER TABLE materiais ADD COLUMN estoque_minimo DECIMAL(14,4) NOT NULL DEFAULT 0`
  ).catch(() => {});
}
garantirColunaEstoqueMinimo();

/* =======================
   MATERIAIS — GET (listar)
======================= */
app.get(
  "/materiais",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  (req, res) => {
    const search = req.query.search || "";
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    const tipo   = req.query.tipo || "";
    const conds  = [];
    const params = [];
    if (search)   { conds.push("(codigo_produto LIKE ? OR descricao LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
    if (tipo)     { conds.push("tipo = ?"); params.push(tipo); }
    const situacao = req.query.situacao || "";
    if (situacao) { conds.push("situacao = ?"); params.push(situacao); }
    const where  = conds.length ? "WHERE " + conds.join(" AND ") : "";
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
   MATERIAIS — BUSCA POR CÓDIGO (para NF)
======================= */
app.get(
  "/materiais/busca-codigo/:codigo",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  async (req, res) => {
    try {
      const codigoOriginal = req.params.codigo;

      // 1) Busca exata
      let [rows] = await db.promise().query(
        `SELECT id, codigo_produto, descricao, custo_fornecedor, unidade_medida,
                unidade_compra, fator_conversao
         FROM materiais WHERE codigo_produto = ? LIMIT 1`,
        [codigoOriginal]
      );

      // 2) Se não achou, tenta sem prefixo de letras e zeros (ex: M00000733 → 733)
      if (!rows.length) {
        const codigoLimpo = codigoOriginal.replace(/^[A-Za-z]+0*/, "").replace(/^0+/, "");
        if (codigoLimpo && codigoLimpo !== codigoOriginal) {
          [rows] = await db.promise().query(
            `SELECT id, codigo_produto, descricao, custo_fornecedor, unidade_medida,
                    unidade_compra, fator_conversao
             FROM materiais WHERE codigo_produto = ? LIMIT 1`,
            [codigoLimpo]
          );
        }
      }

      // 3) Se não achou, tenta LIKE parcial (código contém o número)
      if (!rows.length) {
        const apenasNumeros = codigoOriginal.replace(/\D/g, "").replace(/^0+/, "");
        if (apenasNumeros.length >= 2) {
          [rows] = await db.promise().query(
            `SELECT id, codigo_produto, descricao, custo_fornecedor, unidade_medida,
                    unidade_compra, fator_conversao
             FROM materiais WHERE codigo_produto = ? LIMIT 1`,
            [apenasNumeros]
          );
        }
      }

      if (!rows.length) return res.status(404).json({ success: false, message: "Material não encontrado." });
      res.json({ success: true, data: rows[0] });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  }
);
/* =======================
   MATERIAIS — BUSCA SIMILARES (para vincular NF)
======================= */
app.get(
  "/materiais/busca-similares",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  async (req, res) => {
    try {
      const termo = (req.query.termo || "").trim();
      if (!termo) return res.json({ success: true, data: [] });

      // Quebra descrição em palavras-chave (>= 3 chars), remove stopwords
      const stopwords = new Set(["de","do","da","dos","das","em","com","para","por","sem","que","uma","uns","umas","the","and","for"]);
      const palavras = termo
        .toUpperCase()
        .replace(/[^A-Z0-9À-Ú\s]/g, "")
        .split(/\s+/)
        .filter(p => p.length >= 3 && !stopwords.has(p.toLowerCase()));

      if (!palavras.length) return res.json({ success: true, data: [] });

      // Monta query: cada palavra gera um OR na descrição
      // Pontua por quantidade de palavras que casam (relevância)
      const likeConditions = palavras.map(() => `(UPPER(descricao) LIKE ?)`).join(" + ");
      const params = palavras.map(p => `%${p}%`);

      const sql = `
        SELECT id, codigo_produto, descricao, unidade_medida, unidade_compra,
               fator_conversao, estoque, tipo, situacao,
               (${likeConditions}) AS relevancia
        FROM materiais
        WHERE situacao = 'ativo'
          AND (${palavras.map(() => `UPPER(descricao) LIKE ?`).join(" OR ")})
        ORDER BY relevancia DESC, descricao ASC
        LIMIT 10
      `;

      const [rows] = await db.promise().query(sql, [...params, ...params]);
      res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  }
);

// GET /materiais/grupos — lista de grupos distintos para filtros
app.get(
  "/materiais/grupos",
  authMiddleware,
  async (req, res) => {
    try {
      const [rows] = await db.promise().query(
        `SELECT DISTINCT grupo FROM materiais WHERE grupo IS NOT NULL AND grupo != '' ORDER BY grupo ASC`
      );
      res.json({ success: true, data: rows.map(r => r.grupo) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

/* =======================
   MATERIAIS — GET (por id)
======================= */
app.get(
  "/materiais/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
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
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  (req, res) => {
    const { codigo_produto, descricao, descricao_detalhada, estoque, custo_fornecedor, qtde_embalagem, unidade_medida, unidade_compra, fator_conversao, tipo, grupo, subgrupo, situacao, marca, estoque_minimo } = req.body;
    if (!codigo_produto || !descricao)
      return res.status(400).json({ success: false, message: "Código e descrição são obrigatórios" });
    const situacaoFinal = situacao === "inativo" ? "inativo" : "ativo";
    db.query(
      `INSERT INTO materiais (codigo_produto, descricao, descricao_detalhada, estoque, custo_fornecedor, qtde_embalagem, unidade_medida, unidade_compra, fator_conversao, percentual_perda, tipo, grupo, subgrupo, situacao, marca, estoque_minimo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [codigo_produto, descricao, descricao_detalhada || null, Number(estoque) || 0, Number(custo_fornecedor) || 0,
       qtde_embalagem ? Number(qtde_embalagem) : null, unidade_medida || 'un',
       unidade_compra || null, Number(fator_conversao) || 1, Number(req.body.percentual_perda) || 0,
       tipo || null, grupo || null, subgrupo || null, situacaoFinal, marca || null, Number(estoque_minimo) || 0],
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
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    const { codigo_produto, descricao, descricao_detalhada, estoque, custo_fornecedor, qtde_embalagem, unidade_medida, unidade_compra, fator_conversao, tipo, grupo, subgrupo, situacao, marca, estoque_minimo } = req.body;
    const situacaoFinal = situacao === "inativo" ? "inativo" : "ativo";
    try {
      // Busca estoque anterior para registrar movimentação
      const [[matAntes]] = await db.promise().query(
        `SELECT estoque FROM materiais WHERE id = ?`, [req.params.id]
      );
      const estoqueAnterior = matAntes ? Number(matAntes.estoque || 0) : null;
      const estoqueNovo = Number(estoque);

      const [result] = await db.promise().query(
        `UPDATE materiais SET codigo_produto = ?, descricao = ?, descricao_detalhada = ?, estoque = ?,
         custo_fornecedor = ?, qtde_embalagem = ?, unidade_medida = ?, unidade_compra = ?,
         fator_conversao = ?, percentual_perda = ?, tipo = ?, grupo = ?,
         subgrupo = ?, situacao = ?, marca = ?, estoque_minimo = ? WHERE id = ?`,
        [codigo_produto, descricao, descricao_detalhada || null, estoqueNovo, Number(custo_fornecedor),
         qtde_embalagem ? Number(qtde_embalagem) : null, unidade_medida || 'un',
         unidade_compra || null, Number(fator_conversao) || 1, Number(req.body.percentual_perda) || 0,
         tipo || null, grupo || null,
         subgrupo || null, situacaoFinal, marca || null, Number(estoque_minimo) || 0, req.params.id]
      );
      if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "Material não encontrado" });

      // Registra movimentação se estoque mudou
      if (estoqueAnterior !== null && estoqueAnterior !== estoqueNovo) {
        await criarTabelaMovimentacoes();
        const diff = estoqueNovo - estoqueAnterior;
        const tipoMov = diff > 0 ? 'ENTRADA' : 'SAIDA';
        await db.promise().query(
          `INSERT INTO movimentacoes_estoque
             (material_id, codigo_produto, descricao, tipo, quantidade,
              estoque_anterior, estoque_novo, referencia_tipo, referencia_label,
              usuario_id, usuario_nome)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'AJUSTE_MANUAL', ?, ?, ?)`,
          [req.params.id, codigo_produto, descricao,
           tipoMov, Math.abs(diff),
           estoqueAnterior, estoqueNovo,
           `Ajuste manual`,
           req.user.id, req.user.nome]
        );
      }

      res.json({ success: true, message: "Material atualizado" });
      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "MATERIAL", acao: "Editar Material",
        descricao: `Material ID ${req.params.id} atualizado — Código: ${codigo_produto}, Estoque: ${estoque}, Custo: R$ ${custo_fornecedor}`,
        referencia_id: Number(req.params.id), referencia_label: codigo_produto,
      });
    } catch (err) {
      return serverError(res, err);
    }
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
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
      // 1. Tenta retornar insumos já salvos em op_insumos, com custo atualizado de materiais
      const [savedRows] = await db.promise().query(
        `SELECT
           oi.material_id,
           oi.codigo_produto,
           oi.descricao,
           oi.unidade_medida,
           oi.quantidade,
           COALESCE(m.custo_fornecedor, oi.custo_unitario) AS custo_unitario,
           ROUND(oi.quantidade * COALESCE(m.custo_fornecedor, oi.custo_unitario), 2) AS subtotal
         FROM op_insumos oi
         LEFT JOIN materiais m ON m.id = oi.material_id
         WHERE oi.op_id = ?
         ORDER BY oi.id ASC`,
        [req.params.id]
      );
      if (savedRows.length > 0) {
        return res.json({ success: true, data: savedRows });
      }

      // 2. Fallback: calcula dinamicamente da ficha técnica (OP ainda sem insumos salvos)
      const [[op]] = await db.promise().query(
        `SELECT material_id, codigo_produto, COALESCE(qtde_total, quantidade, 1) AS qtde_total
         FROM ordens_producao WHERE id = ?`, [req.params.id]
      );
      if (!op) return res.json({ success: true, data: [] });

      // Se material_id não estiver direto, tenta resolver pelo codigo_produto
      let matId = op.material_id;
      if (!matId && op.codigo_produto) {
        const [[mat]] = await db.promise().query(
          `SELECT id FROM materiais WHERE codigo_produto = ?`, [op.codigo_produto]
        );
        matId = mat?.id || null;
      }
      if (!matId) return res.json({ success: true, data: [] });

      const [rows] = await db.promise().query(`
        SELECT
          ft.insumo_material_id             AS material_id,
          m.codigo_produto,
          ft.insumo_descricao               AS descricao,
          ft.unidade_medida,
          ROUND(ft.quantidade_por_unidade * ?, 4) AS quantidade,
          COALESCE(m.custo_fornecedor, 0) AS custo_unitario,
          ROUND(ft.quantidade_por_unidade * ? * COALESCE(m.custo_fornecedor, 0), 2) AS subtotal
        FROM ficha_tecnica ft
        LEFT JOIN materiais m ON m.id = ft.insumo_material_id
        WHERE ft.material_id = ?
        ORDER BY ft.id ASC
      `, [op.qtde_total, op.qtde_total, matId]);
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
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
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
      // Transação para garantir atomicidade: DELETE + INSERT + recálculo
      const conn = await db.promise().getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(`DELETE FROM op_insumos WHERE op_id = ?`, [op_id]);
        for (const ins of insumos) {
          const qtde    = Number(ins.quantidade     || 0);
          const custo   = Number(ins.custo_unitario || 0);
          await conn.query(
            `INSERT INTO op_insumos (op_id, material_id, codigo_produto, descricao, unidade_medida, quantidade, custo_unitario, subtotal)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [op_id, ins.material_id || null, ins.codigo_produto || null, ins.descricao || null,
             ins.unidade_medida || "un", qtde, custo, qtde * custo]
          );
        }
        await conn.commit();
        conn.release();
      } catch (txErr) {
        await conn.rollback();
        conn.release();
        throw txErr;
      }
      // Recalcula custo total da OP (insumos + prestadores)
      const custoTotal = await recalcularCustoOP(op_id);

      res.json({ success: true, message: `${insumos.length} insumo(s) salvos.`, custo_total: custoTotal });
      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "OP", acao: "Salvar Insumos",
        descricao: `${insumos.length} insumo(s) salvos na OP ${op_id}`,
        referencia_id: Number(op_id), referencia_label: await getNumeroOP(op_id),
      });
    } catch (err) {
      console.error("Erro ao salvar insumos:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─── Recalcular custo da OP: total = insumos + prestadores, unitário = total / qtde
async function recalcularCustoOP(opId) {
  try {
    console.log(`[recalcularCustoOP] Iniciando para OP ID ${opId}`);

    // Quantidade da OP
    let qtde = 1;
    try {
      const [rows] = await db.promise().query(
        `SELECT COALESCE(qtde_total, quantidade, 1) AS qtde FROM ordens_producao WHERE id = ?`, [opId]
      );
      qtde = Number(rows[0]?.qtde) || 1;
    } catch (e) { console.error('[recalcularCustoOP] Erro ao buscar qtde:', e.message); }

    // Soma insumos
    let totalInsumos = 0;
    try {
      const [rows] = await db.promise().query(
        `SELECT COALESCE(SUM(subtotal), 0) AS total FROM op_insumos WHERE op_id = ?`, [opId]
      );
      totalInsumos = Number(rows[0]?.total) || 0;
    } catch (e) { console.error('[recalcularCustoOP] Erro ao somar insumos:', e.message); }

    // Soma prestadores
    let totalPrestadores = 0;
    try {
      const [rows] = await db.promise().query(
        `SELECT COALESCE(SUM(valor_servico), 0) AS total FROM op_prestadores WHERE op_id = ?`, [opId]
      );
      totalPrestadores = Number(rows[0]?.total) || 0;
    } catch (e) { console.error('[recalcularCustoOP] Erro ao somar prestadores:', e.message); }

    const custoTotal    = totalInsumos + totalPrestadores;
    const custoUnitario = custoTotal / qtde;

    console.log(`[recalcularCustoOP] OP ${opId}: insumos=${totalInsumos}, prestadores=${totalPrestadores}, total=${custoTotal}, unit=${custoUnitario}, qtde=${qtde}`);

    await db.promise().query(
      `UPDATE ordens_producao SET custo_unitario = ?, custo_total = ? WHERE id = ?`,
      [custoUnitario, custoTotal, opId]
    );

    console.log(`[recalcularCustoOP] OP ${opId} atualizada com sucesso.`);
    return { custo_unitario: custoUnitario, custo_total: custoTotal };
  } catch (e) {
    console.error(`[recalcularCustoOP] ERRO FATAL OP ${opId}:`, e.message);
    return { custo_unitario: 0, custo_total: 0 };
  }
}
/* =====================================================
   PERDAS DA OP
===================================================== */
const OP_PERDAS_DDL = `
  CREATE TABLE IF NOT EXISTS op_perdas (
    id             INT NOT NULL AUTO_INCREMENT,
    op_id          INT NOT NULL,
    material_id    INT NULL,
    codigo_produto VARCHAR(50)  NULL,
    descricao      VARCHAR(255) NOT NULL,
    quantidade     DECIMAL(10,3) NOT NULL DEFAULT 0,
    unidade_medida VARCHAR(20)  NOT NULL DEFAULT 'un',
    motivo         VARCHAR(255) NULL,
    criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_op_perdas_op (op_id)
  )
`;

app.get(
  "/ordens_producao/:id/perdas",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  async (req, res) => {
    try {
      await db.promise().query(OP_PERDAS_DDL);
      const [rows] = await db.promise().query(
        `SELECT id, material_id, codigo_produto, descricao, quantidade, unidade_medida, motivo, criado_em
         FROM op_perdas WHERE op_id = ? ORDER BY id ASC`,
        [req.params.id]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("Erro ao buscar perdas:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.post(
  "/ordens_producao/:id/perdas",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    try {
      await db.promise().query(OP_PERDAS_DDL);
      const op_id = req.params.id;
      const { material_id, codigo_produto, descricao, quantidade, unidade_medida, motivo } = req.body;
      if (!descricao) return res.status(400).json({ success: false, message: "Descrição é obrigatória." });
      const [result] = await db.promise().query(
        `INSERT INTO op_perdas (op_id, material_id, codigo_produto, descricao, quantidade, unidade_medida, motivo)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [op_id, material_id || null, codigo_produto || null, descricao,
         Number(quantidade) || 0, unidade_medida || "un", motivo || null]
      );
      res.json({ success: true, id: result.insertId });
    } catch (err) {
      console.error("Erro ao salvar perda:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.delete(
  "/ordens_producao/:id/perdas/:perdaId",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    try {
      await db.promise().query(
        `DELETE FROM op_perdas WHERE id = ? AND op_id = ?`,
        [req.params.perdaId, req.params.id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// PUT /ordens_producao/:id/perdas — substitui todas as perdas da OP de uma vez
app.put(
  "/ordens_producao/:id/perdas",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    try {
      await db.promise().query(OP_PERDAS_DDL);
      const op_id = req.params.id;
      const perdas = req.body.perdas;
      if (!Array.isArray(perdas))
        return res.status(400).json({ success: false, message: "perdas deve ser um array." });

      await db.promise().query(`DELETE FROM op_perdas WHERE op_id = ?`, [op_id]);
      for (const p of perdas) {
        if (!p.descricao) continue;
        await db.promise().query(
          `INSERT INTO op_perdas (op_id, material_id, codigo_produto, descricao, quantidade, unidade_medida, motivo)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [op_id, p.material_id || null, p.codigo_produto || null, p.descricao,
           Number(p.quantidade), p.unidade_medida || "un", p.motivo || null]
        );
      }
      res.json({ success: true, message: "Perdas salvas." });
    } catch (err) {
      console.error("Erro ao salvar perdas em lote:", err);
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
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
app.post("/ordens_producao", authMiddleware, roleMiddleware(["admin", "pcp", "producao", "ped"]), async (req, res) => {
  try {
    const {
      processo_id,
      material_id,
      codigo_produto,
      descricao_material,
      quantidade,
      unidade_medida,
      responsavel,
      observacoes,
    } = req.body;
    if (!material_id)
      return res.status(400).json({ success: false, message: "material_id é obrigatório" });
    const qtdeTotal = Number(quantidade) || 0;
    const custoUnit = 0;
    const custoTotal = 0;

    // Retry loop para concorrência: se dois usuários tentam ao mesmo tempo,
    // o segundo detecta duplicata e tenta novamente com o próximo número
    const MAX_RETRIES = 5;
    for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
      try {
        const { seq, ano, numero_op } = await getNextNumeroOP_Real_Async();
        const sql = `
          INSERT INTO ordens_producao (
            numero_op, seq_ano, ano, processo_id,
            material_id, codigo_produto, descricao_material,
            qtde_total, quantidade, unidade_medida,
            custo_unitario, custo_total, status,
            responsavel, observacoes, criado_por, is_deleted
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA', ?, ?, ?, 0)
        `;
        const valores = [
          numero_op, seq, ano, processo_id || null,
          material_id, codigo_produto || null, descricao_material || null,
          qtdeTotal, qtdeTotal, unidade_medida || 'UN',
          custoUnit, custoTotal,
          responsavel || null, observacoes || null, req.user.id
        ];
        const [result] = await db.promise().query(sql, valores);
        res.json({ success: true, id: result.insertId, numero_op });
        registrarLog({
          usuario_id: req.user.id, usuario_nome: req.user.nome,
          modulo: "OP", acao: "Criar OP",
          descricao: `OP ${numero_op} criada — Material: ${codigo_produto || ""}, Qtde: ${quantidade || 0}`,
          referencia_id: result.insertId, referencia_label: numero_op,
        });
        return; // sucesso, sai do loop
      } catch (insertErr) {
        if (insertErr.code === "ER_DUP_ENTRY" && tentativa < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 50 * tentativa));
          continue; // tenta próximo número
        }
        throw insertErr;
      }
    }
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
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    // Bloqueia edição de OP concluída
    try {
      const [[opCheck]] = await db.promise().query(
        "SELECT status FROM ordens_producao WHERE id = ? AND is_deleted = 0", [req.params.id]
      );
      if (opCheck?.status === "CONCLUIDA")
        return res.status(403).json({ success: false, message: "OP concluída não pode ser editada." });
    } catch (e) { return res.status(500).json({ success: false, message: e.message }); }

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
    if (data_finalizacao !== undefined) {
      setClauses.push("data_finalizacao = ?");
      values.push(data_finalizacao ? normalizeDateToSql(data_finalizacao) : null);
    }
    if (observacoes !== undefined) { setClauses.push("observacoes = ?"); values.push(observacoes || null); }
    if (setClauses.length === 0)
      return res.status(400).json({ success: false, message: "Nenhum campo para atualizar" });
    const numOP = await getNumeroOP(req.params.id);
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
            descricao: `OP ${numOP} atualizada — Campos: ${setClauses.map(c => c.split(" =")[0]).join(", ")}`,
            referencia_id: Number(req.params.id), referencia_label: numOP,
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
   Usa SELECT FOR UPDATE dentro de transação para evitar
   duplicatas quando múltiplos usuários criam OPs ao mesmo tempo.
   Se a constraint UNIQUE falhar, faz retry automaticamente.
────────────────────────────────────────────────────────────── */
// Helper: busca numero_op pelo ID (para logs)
async function getNumeroOP(opId) {
  try {
    const [rows] = await db.promise().query("SELECT numero_op FROM ordens_producao WHERE id = ?", [opId]);
    return rows.length ? rows[0].numero_op : `ID ${opId}`;
  } catch { return `ID ${opId}`; }
}

async function getNextNumeroOP_Real_Async() {
  const ano = new Date().getFullYear();
  const MAX_RETRIES = 5;

  for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
    const conn = await db.promise().getConnection();
    try {
      await conn.beginTransaction();

      // Lock de leitura: garante que ninguém mais lê o MAX enquanto estamos inserindo
      const [rows] = await conn.query(
        `SELECT MAX(seq_ano) AS max_seq FROM ordens_producao WHERE ano = ? FOR UPDATE`,
        [ano]
      );
      const seq = (rows[0].max_seq || 0) + 1;
      const numero_op = String(seq).padStart(3, "0") + "/" + ano;

      await conn.commit();
      conn.release();
      return { seq, ano, numero_op };
    } catch (err) {
      await conn.rollback();
      conn.release();

      // Se for erro de deadlock ou lock timeout, tenta novamente
      if ((err.code === "ER_LOCK_DEADLOCK" || err.code === "ER_LOCK_WAIT_TIMEOUT") && tentativa < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 50 * tentativa)); // backoff progressivo
        continue;
      }
      throw err;
    }
  }
}

// Wrapper com callback para manter compatibilidade
function getNextNumeroOP_Real(callback) {
  getNextNumeroOP_Real_Async()
    .then(result => callback(null, result))
    .catch(err => callback(err));
}
/* ──────────────────────────────────────────────────────────────
   GET /op/buscar-pedidos?material_id=X
────────────────────────────────────────────────────────────── */
app.get(
  "/op/buscar-pedidos",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  (req, res) => {
    const { material_id } = req.query;
    if (!material_id)
      return res.status(400).json({ success: false, message: "material_id é obrigatório" });
    db.query(
      "SELECT codigo_produto, descricao FROM materiais WHERE id = ?",
      [material_id],
      (err, matRows) => {
        if (err) return serverError(res, err);
        if (!matRows.length)
          return res.status(404).json({ success: false, message: "Material não encontrado" });
        const { codigo_produto, descricao } = matRows[0];
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
   POST /op — Cria OP (destino: estoque)
────────────────────────────────────────────────────────────── */
app.post(
  "/op",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    const { material_id, quantidade, unidade_medida, observacoes, responsavel } = req.body;
    if (!material_id)
      return res.status(400).json({ success: false, message: "material_id é obrigatório" });
    if (!quantidade || Number(quantidade) <= 0)
      return res.status(400).json({ success: false, message: "Informe a quantidade" });
    try {
      const [matRows] = await db.promise().query(
        "SELECT codigo_produto, descricao, custo_fornecedor, qtde_embalagem FROM materiais WHERE id = ?",
        [material_id]
      );
      if (!matRows.length)
        return res.status(404).json({ success: false, message: "Material não encontrado" });
      const mat = matRows[0];
      const qtde_total = Number(quantidade);
      const custo_unitario = 0;
      const custo_total = 0;

      // Retry loop para concorrência
      const MAX_RETRIES = 5;
      for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
        try {
          const { seq, ano, numero_op } = await getNextNumeroOP_Real_Async();
          const [result] = await db.promise().query(
            `INSERT INTO ordens_producao
               (numero_op, seq_ano, ano, material_id, codigo_produto,
                descricao_material, qtde_total, unidade_medida,
                custo_unitario, custo_total, status,
                observacoes, responsavel, criado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA', ?, ?, ?)`,
            [numero_op, seq, ano, material_id,
             mat.codigo_produto, mat.descricao,
             qtde_total, unidade_medida || null,
             custo_unitario, custo_total,
             observacoes || null, responsavel || null, req.user.id]
          );
          const op_id = result.insertId;
          res.status(201).json({
            success: true, id: op_id, numero_op,
            message: `OP ${numero_op} criada com sucesso`,
          });
          registrarLog({
            usuario_id: req.user.id, usuario_nome: req.user.nome,
            modulo: "OP", acao: "Criar OP",
            descricao: `OP ${numero_op} criada — Material: ${mat.codigo_produto} (${mat.descricao}), Qtde: ${qtde_total} ${unidade_medida || ""}`,
            referencia_id: op_id, referencia_label: numero_op,
          });
          return; // sucesso
        } catch (insertErr) {
          if (insertErr.code === "ER_DUP_ENTRY" && tentativa < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 50 * tentativa));
            continue;
          }
          throw insertErr;
        }
      }
    } catch (err) { return serverError(res, err); }
  }
);
/* ──────────────────────────────────────────────────────────────
   GET /op — Lista OPs reais
────────────────────────────────────────────────────────────── */
app.get(
  "/op",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
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
      `SELECT * FROM ordens_producao op
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
/* ──────────────────────────────────────────────────────────────
   GET /op/:id — Busca OP
────────────────────────────────────────────────────────────── */
app.get(
  "/op/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  (req, res) => {
    db.query(
      "SELECT * FROM ordens_producao WHERE id = ? AND is_deleted = 0",
      [req.params.id],
      (err, opRows) => {
        if (err) return serverError(res, err);
        if (!opRows.length)
          return res.status(404).json({ success: false, message: "OP não encontrada" });
        res.json({ success: true, data: opRows[0] });
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
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    // Bloqueia edição de OP concluída
    try {
      const [[opCheck]] = await db.promise().query(
        "SELECT status FROM ordens_producao WHERE id = ? AND is_deleted = 0", [req.params.id]
      );
      if (opCheck?.status === "CONCLUIDA")
        return res.status(403).json({ success: false, message: "OP concluída não pode ser editada." });
    } catch (e) { return res.status(500).json({ success: false, message: e.message }); }

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
    const numOP = await getNumeroOP(req.params.id);
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
          descricao: `OP ${numOP} salva — Campos: ${Object.keys(fields).join(", ")}`,
          referencia_id: Number(req.params.id), referencia_label: numOP,
        });
      }
    );
  }
);
/* ──────────────────────────────────────────────────────────────
   DELETE /op/:id — Soft delete
────────────────────────────────────────────────────────────── */
app.delete(
  "/op/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp"]),
  async (req, res) => {
    try {
      const op_id = req.params.id;
      const [result] = await db.promise().query(
        "UPDATE ordens_producao SET is_deleted = 1 WHERE id = ?", [op_id]
      );
      if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "OP não encontrada" });
      const numOP = await getNumeroOP(op_id);
      res.json({ success: true, message: "OP removida." });
      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "OP", acao: "Excluir OP",
        descricao: `OP ${numOP} excluída.`,
        referencia_id: Number(op_id), referencia_label: numOP,
      });
    } catch (err) {
      console.error("Erro ao excluir OP:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);
/* =======================
   OPs — DELETE /ordens_producao/:id (soft delete)
======================= */
app.delete(
  "/ordens_producao/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp"]),
  async (req, res) => {
    try {
      const op_id = req.params.id;
      const numOP = await getNumeroOP(op_id);
      const [result] = await db.promise().query(
        "UPDATE ordens_producao SET is_deleted = 1 WHERE id = ?", [op_id]
      );
      if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "OP não encontrada" });
      res.json({ success: true, message: "OP removida." });
      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "OP", acao: "Excluir OP",
        descricao: `OP ${numOP} excluída.`,
        referencia_id: Number(op_id), referencia_label: numOP,
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  (req, res) => {
    const { cliente, status } = req.query;
    let where = "WHERE 1=1";
    const params = [];
    if (cliente) { where += " AND (cp.cliente LIKE ? OR cc.codigo_cliente LIKE ?)"; params.push(`%${cliente}%`, `%${cliente}%`); }
    if (status)  { where += " AND cp.status_producao = ?"; params.push(status); }
    db.query(
      `SELECT cp.*, cc.codigo_cliente, cc.codigo_zerb,
              m.codigo_produto, m.descricao AS descricao_material
       FROM controle_pedidos cp
       LEFT JOIN codigos_clientes cc ON cp.codigo_cliente = cc.codigo_cliente
       LEFT JOIN materiais m ON m.codigo_produto = cp.zerb
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  (req, res) => {
    const { ordem_compra, codigo_cliente, zerb, controle, cliente, estado, pedido_venda,
            qtde_solicitada, qtde_produzida, status_producao,
            data_contratual, data_finalizada } = req.body;
    const resolverZerb = (cb) => {
      if (zerb) return cb(zerb);
      if (!codigo_cliente) return cb(null);
      db.query(
        "SELECT codigo_zerb FROM codigos_clientes WHERE codigo_cliente = ? LIMIT 1",
        [codigo_cliente],
        (err, rows) => {
          if (err || !rows.length) return cb(null);
          let z = rows[0].codigo_zerb;
          // Regra especial: código 40000003488 + cliente RGE → produto 202
          if (String(codigo_cliente) === "40000003488" && /rge/i.test(cliente || "")) z = "202";
          cb(z);
        }
      );
    };
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
           normalizeDateToSql(data_contratual), normalizeDateToSql(data_finalizada)],
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  (req, res) => {
    const { ordem_compra, codigo_cliente, zerb, controle, cliente, estado, pedido_venda,
            qtde_solicitada, qtde_produzida, status_producao,
            data_contratual, data_finalizada } = req.body;
    const resolverZerb = (cb) => {
      if (zerb) return cb(zerb);
      if (!codigo_cliente) return cb(null);
      db.query(
        "SELECT codigo_zerb FROM codigos_clientes WHERE codigo_cliente = ? LIMIT 1",
        [codigo_cliente],
        (err, rows) => {
          if (err || !rows.length) return cb(null);
          let z = rows[0].codigo_zerb;
          // Regra especial: código 40000003488 + cliente RGE → produto 202
          if (String(codigo_cliente) === "40000003488" && /rge/i.test(cliente || "")) z = "202";
          cb(z);
        }
      );
    };
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
           normalizeDateToSql(data_contratual), normalizeDateToSql(data_finalizada),
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
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
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
  const clienteNome = (req.query.cliente || "").trim();
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

      const data = rows[0];

      // Regra especial: código 40000003488 + cliente RGE → produto 202
      if (String(data.codigo_cliente) === "40000003488" && /rge/i.test(clienteNome)) {
        return db.query(
          `SELECT id AS material_id, codigo_produto, descricao AS material_descricao,
                  custo_fornecedor, estoque
           FROM materiais WHERE codigo_produto = '202' LIMIT 1`,
          (err2, matRows) => {
            if (!err2 && matRows.length) {
              data.codigo_zerb        = "202";
              data.material_id        = matRows[0].material_id;
              data.codigo_produto     = matRows[0].codigo_produto;
              data.material_descricao = matRows[0].material_descricao;
              data.custo_fornecedor   = matRows[0].custo_fornecedor;
              data.estoque            = matRows[0].estoque;
            }
            res.json({ success: true, data });
          }
        );
      }

      res.json({ success: true, data });
    }
  );
});
/* =====================================================
   INICIAR OP — muda status ABERTA → EM_PRODUCAO
===================================================== */
app.post(
  "/ordens_producao/:id/iniciar",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    try {
      const op_id = req.params.id;
      const [[op]] = await db.promise().query(
        `SELECT numero_op, status FROM ordens_producao WHERE id = ?`, [op_id]
      );
      if (!op) return res.status(404).json({ success: false, message: "OP não encontrada." });
      if (op.status !== "ABERTA")
        return res.status(400).json({ success: false, message: `OP já está com status "${op.status}".` });

      await db.promise().query(
        `UPDATE ordens_producao SET status = 'EM_PRODUCAO' WHERE id = ?`, [op_id]
      );
      res.json({ success: true, message: "Produção iniciada." });
      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "OP", acao: "Iniciar Produção",
        descricao: `OP ${op.numero_op} iniciada (status: EM_PRODUCAO).`,
        referencia_id: Number(op_id), referencia_label: op.numero_op,
      });
    } catch (err) {
      console.error("Erro ao iniciar OP:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* =====================================================
   CONCLUIR OP — adiciona produção ao estoque + baixa insumos
===================================================== */
app.post(
  "/ordens_producao/:id/concluir",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    try {
      const op_id = req.params.id;
      const data_final = normalizeDateToSql(req.body.data_finalizacao) || todaySqlDate();
      await db.promise().query(
        `UPDATE ordens_producao SET status = 'CONCLUIDA', data_finalizacao = ? WHERE id = ?`,
        [data_final, op_id]
      );
      // Adiciona quantidade total produzida ao estoque do material
      await criarTabelaMovimentacoes();
      const [[opData]] = await db.promise().query(
        `SELECT material_id, qtde_total, codigo_produto, numero_op, descricao_material FROM ordens_producao WHERE id = ?`,
        [op_id]
      );
      let qtdeAdicionada = 0;
      if (opData && opData.material_id) {
        const qtde = Number(opData.qtde_total || 0);
        if (qtde > 0) {
          const [[matProd]] = await db.promise().query(
            `SELECT estoque, descricao FROM materiais WHERE id = ?`, [opData.material_id]
          );
          const estAnterior = Number(matProd?.estoque || 0);
          await db.promise().query(
            `UPDATE materiais SET estoque = estoque + ? WHERE id = ?`,
            [qtde, opData.material_id]
          );
          qtdeAdicionada = qtde;
          // Registra ENTRADA (produção) no extrato
          await db.promise().query(
            `INSERT INTO movimentacoes_estoque
               (material_id, codigo_produto, descricao, tipo, quantidade,
                estoque_anterior, estoque_novo, referencia_tipo, referencia_id,
                referencia_label, usuario_id, usuario_nome)
             VALUES (?, ?, ?, 'ENTRADA', ?, ?, ?, 'PRODUCAO_OP', ?, ?, ?, ?)`,
            [opData.material_id, opData.codigo_produto,
             matProd?.descricao || opData.descricao_material || '',
             qtde, estAnterior, estAnterior + qtde,
             Number(op_id), `OP ${opData.numero_op || op_id}`,
             req.user.id, req.user.nome]
          );
        }
      }
      // Baixa insumos do estoque
      const [insumos] = await db.promise().query(
        `SELECT oi.material_id, oi.quantidade, m.codigo_produto, m.descricao, m.estoque
         FROM op_insumos oi
         LEFT JOIN materiais m ON m.id = oi.material_id
         WHERE oi.op_id = ? AND oi.material_id IS NOT NULL`,
        [op_id]
      );
      let estoqueInsuficiente = [];
      for (const ins of insumos) {
        const estAnterior = Number(ins.estoque || 0);
        const qtdeIns = Number(ins.quantidade);
        if (estAnterior - qtdeIns < 0) {
          estoqueInsuficiente.push({ codigo: ins.codigo_produto, estoque_atual: estAnterior, necessario: qtdeIns });
        }
        await db.promise().query(
          `UPDATE materiais SET estoque = estoque - ? WHERE id = ?`,
          [qtdeIns, ins.material_id]
        );
        const estoqueNovo = estAnterior - qtdeIns;
        // Registra SAIDA (baixa insumo) no extrato
        await db.promise().query(
          `INSERT INTO movimentacoes_estoque
             (material_id, codigo_produto, descricao, tipo, quantidade,
              estoque_anterior, estoque_novo, referencia_tipo, referencia_id,
              referencia_label, usuario_id, usuario_nome)
           VALUES (?, ?, ?, 'SAIDA', ?, ?, ?, 'PRODUCAO_OP', ?, ?, ?, ?)`,
          [ins.material_id, ins.codigo_produto, ins.descricao || '',
           qtdeIns, estAnterior, estoqueNovo,
           Number(op_id), `OP ${opData?.numero_op || op_id} (insumo)`,
           req.user.id, req.user.nome]
        );
      }
      const avisoEstoque = estoqueInsuficiente.length > 0
        ? ` ⚠️ Estoque negativo: ${estoqueInsuficiente.map(e => `${e.codigo} (tinha ${e.estoque_atual}, usou ${e.necessario})`).join(", ")}`
        : "";
      res.json({
        success: true,
        message: `OP concluída. +${qtdeAdicionada} ao estoque. ${insumos.length} insumo(s) baixados.${avisoEstoque}`,
        insumos_baixados:    insumos.length,
        estoque_insuficiente: estoqueInsuficiente,
      });
      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "OP", acao: "Concluir OP",
        descricao: `OP ${op.numero_op} concluída em ${data_final}. +${qtdeAdicionada} ao estoque, ${insumos.length} insumo(s) baixados${avisoEstoque}`,
        referencia_id: Number(op_id), referencia_label: op.numero_op,
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
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
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
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
  roleMiddleware(["admin", "pcp", "logistica", "producao", "ped"]),
  async (req, res) => {
    try {
      await criarTabelasSaida();
      const { usuario, observacoes, itens } = req.body;
      if (!Array.isArray(itens) || itens.length === 0)
        return res.status(400).json({ success: false, message: "Dados inválidos." });

      const [[{ ultimo }]] = await db.promise().query(
        `SELECT COALESCE(MAX(numero), 0) AS ultimo FROM saidas_estoque`
      );
      const numero = ultimo + 1;
      const hoje   = new Date().toISOString().split("T")[0];

      // Coleta info do primeiro pedido vinculado (para compatibilidade do header)
      const primeiroPedido = itens.find(i => i.pedido_id) || {};
      const [ins] = await db.promise().query(
        `INSERT INTO saidas_estoque
           (numero, pedido_id, codigo_cliente, cliente, estado,
            pedido_venda, ordem_compra, zerb, data_saida, usuario, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [numero, primeiroPedido.pedido_id || null,
         primeiroPedido.codigo_cliente || null, primeiroPedido.cliente || null,
         primeiroPedido.estado || null, primeiroPedido.pedido_venda || null,
         primeiroPedido.ordem_compra || null, primeiroPedido.zerb || null,
         hoje, usuario || "Sistema", observacoes || null]
      );
      const saida_id = ins.insertId;

      await criarTabelaMovimentacoes();

      // IDs de pedidos únicos vinculados (para atualizar status depois)
      const pedidoIds = new Set();

      for (const it of itens) {
        const qtde  = Number(it.quantidade     || 0);
        const custo = Number(it.custo_unitario || 0);
        await db.promise().query(
          `INSERT INTO saidas_estoque_itens
             (saida_id, material_id, codigo_produto, descricao, unidade_medida,
              quantidade, custo_unitario, subtotal,
              pedido_id, pedido_venda, ordem_compra, cliente)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [saida_id, it.material_id || null, it.codigo_produto, it.descricao,
           it.unidade_medida || "un", qtde, custo, Number((qtde * custo).toFixed(2)),
           it.pedido_id || null, it.pedido_venda || null,
           it.ordem_compra || null, it.cliente || null]
        );

        if (it.material_id) {
          const [[matAntes]] = await db.promise().query(
            `SELECT estoque FROM materiais WHERE id = ?`, [it.material_id]
          );
          const estoqueAnterior = Number(matAntes?.estoque || 0);
          await db.promise().query(
            `UPDATE materiais SET estoque = GREATEST(0, estoque - ?) WHERE id = ?`,
            [qtde, it.material_id]
          );
          const estoqueNovo = Math.max(0, estoqueAnterior - qtde);
          await db.promise().query(
            `INSERT INTO movimentacoes_estoque
               (material_id, codigo_produto, descricao, tipo, quantidade,
                estoque_anterior, estoque_novo, referencia_tipo, referencia_id,
                referencia_label, pedido_venda, ordem_compra, usuario_id, usuario_nome)
             VALUES (?, ?, ?, 'SAIDA', ?, ?, ?, 'SAIDA_ESTOQUE', ?, ?, ?, ?, ?, ?)`,
            [it.material_id, it.codigo_produto, it.descricao, qtde,
             estoqueAnterior, estoqueNovo, saida_id,
             `Saída #${numero}${it.pedido_venda ? ' — PV ' + it.pedido_venda : ''}${it.ordem_compra ? ' — OC ' + it.ordem_compra : ''}`,
             it.pedido_venda || null, it.ordem_compra || null,
             req.user.id, req.user.nome]
          );
        }

        if (it.pedido_id) pedidoIds.add(it.pedido_id);
      }

      // Atualiza status dos pedidos vinculados
      for (const pid of pedidoIds) {
        await db.promise().query(
          `UPDATE controle_pedidos SET data_finalizada = ?, status_producao = 'Entregue' WHERE id = ?`,
          [hoje, pid]
        );
      }

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

      const pedidoLabel = pedidoIds.size > 0
        ? `${pedidoIds.size} pedido(s) atendido(s)`
        : "sem vínculo a pedidos";
      registrarLog({
        usuario_id:      req.user.id,
        usuario_nome:    req.user.nome,
        modulo:          "ESTOQUE",
        acao:            "Saída de Estoque",
        descricao:       `Saída Nº ${numero} — ${itens.length} item(s) retirado(s) do estoque, ${pedidoLabel}`,
        referencia_id:   saida_id,
        referencia_label: `Saída #${numero}`,
      });
    } catch (err) {
      console.error("Erro ao registrar saída:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);
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
      pedido_id      INT NULL,
      pedido_venda   VARCHAR(50) NULL,
      ordem_compra   VARCHAR(50) NULL,
      cliente        VARCHAR(100) NULL,
      PRIMARY KEY (id),
      KEY idx_sei_saida (saida_id)
    )
  `);
  // Migration: add pedido columns to existing table
  await db.promise().query(`ALTER TABLE saidas_estoque_itens ADD COLUMN pedido_id INT NULL`).catch(() => {});
  await db.promise().query(`ALTER TABLE saidas_estoque_itens ADD COLUMN pedido_venda VARCHAR(50) NULL`).catch(() => {});
  await db.promise().query(`ALTER TABLE saidas_estoque_itens ADD COLUMN ordem_compra VARCHAR(50) NULL`).catch(() => {});
  await db.promise().query(`ALTER TABLE saidas_estoque_itens ADD COLUMN cliente VARCHAR(100) NULL`).catch(() => {});
}
/* =====================================================
   MOVIMENTAÇÕES DE ESTOQUE
===================================================== */
async function criarTabelaMovimentacoes() {
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
      id              INT NOT NULL AUTO_INCREMENT,
      material_id     INT NOT NULL,
      codigo_produto  VARCHAR(100) NULL,
      descricao       VARCHAR(500) NULL,
      tipo            ENUM('ENTRADA','SAIDA','PRODUCAO','AJUSTE') NOT NULL,
      quantidade      DECIMAL(14,4) NOT NULL,
      estoque_anterior DECIMAL(14,4) NULL,
      estoque_novo    DECIMAL(14,4) NULL,
      referencia_tipo VARCHAR(50) NULL,
      referencia_id   INT NULL,
      referencia_label VARCHAR(100) NULL,
      pedido_venda    VARCHAR(50) NULL,
      ordem_compra    VARCHAR(50) NULL,
      observacoes     TEXT NULL,
      usuario_id      INT NULL,
      usuario_nome    VARCHAR(100) NULL,
      criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mov_material (material_id),
      KEY idx_mov_tipo (tipo),
      KEY idx_mov_data (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// GET /movimentacoes — lista paginada com filtros
app.get(
  "/movimentacoes",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  async (req, res) => {
    try {
      await criarTabelaMovimentacoes();
      const { material_id, tipo, page = 1, limit = 50 } = req.query;
      let where = "WHERE 1=1";
      const params = [];
      if (material_id) { where += " AND m.material_id = ?"; params.push(material_id); }
      if (tipo)        { where += " AND m.tipo = ?"; params.push(tipo); }
      const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
      const [[{ total }]] = await db.promise().query(
        `SELECT COUNT(*) AS total FROM movimentacoes_estoque m ${where}`, params
      );
      const [rows] = await db.promise().query(
        `SELECT m.* FROM movimentacoes_estoque m ${where} ORDER BY m.criado_em DESC LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset]
      );
      res.json({ success: true, data: rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

// GET /estoque/detalhe/:id — dados completos do material + ficha técnica
app.get(
  "/estoque/detalhe/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  async (req, res) => {
    try {
      const [[mat]] = await db.promise().query(
        `SELECT * FROM materiais WHERE id = ?`, [req.params.id]
      );
      if (!mat) return res.status(404).json({ success: false, message: "Material não encontrado" });

      // Ficha técnica com custo dos insumos
      const [ft] = await db.promise().query(
        `SELECT ft.*, m2.descricao AS insumo_descricao, m2.codigo_produto AS insumo_codigo,
                COALESCE(m2.custo_fornecedor, 0) AS custo_unit
         FROM ficha_tecnica ft
         LEFT JOIN materiais m2 ON m2.id = ft.insumo_material_id
         WHERE ft.material_id = ?
         ORDER BY ft.id ASC`, [req.params.id]
      ).catch(() => [[]]);

      res.json({ success: true, data: { ...mat, ficha_tecnica: ft } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

// GET /estoque/extrato/:id — movimentações de um material específico (paginado)
app.get(
  "/estoque/extrato/:id",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  async (req, res) => {
    try {
      await criarTabelaMovimentacoes();
      const { page = 1, limit = 30 } = req.query;
      const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
      const [[{ total }]] = await db.promise().query(
        `SELECT COUNT(*) AS total FROM movimentacoes_estoque WHERE material_id = ?`, [req.params.id]
      );
      const [rows] = await db.promise().query(
        `SELECT * FROM movimentacoes_estoque WHERE material_id = ? ORDER BY criado_em DESC LIMIT ? OFFSET ?`,
        [req.params.id, Number(limit), offset]
      );
      res.json({ success: true, data: rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

// GET /estoque/lista — materiais paginados com filtros para a página de estoque
app.get(
  "/estoque/lista",
  authMiddleware,
  roleMiddleware(["admin", "pcp", "logistica", "vendas", "producao", "ped"]),
  async (req, res) => {
    try {
      const { search, tipo, grupo, page = 1, limit = 50 } = req.query;
      let where = "WHERE 1=1";
      const params = [];
      if (search) {
        where += " AND (codigo_produto LIKE ? OR descricao LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
      }
      if (tipo)  { where += " AND tipo = ?"; params.push(tipo); }
      if (grupo) { where += " AND grupo = ?"; params.push(grupo); }
      const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
      const [[{ total }]] = await db.promise().query(
        `SELECT COUNT(*) AS total FROM materiais ${where}`, params
      );
      const [rows] = await db.promise().query(
        `SELECT id, codigo_produto, descricao, unidade_medida, tipo, grupo, subgrupo, marca, situacao, estoque, custo_fornecedor
         FROM materiais ${where}
         ORDER BY CAST(codigo_produto AS UNSIGNED) ASC
         LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset]
      );
      res.json({ success: true, data: rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

/* =======================
   DASHBOARD — KPIs e indicadores
======================= */
app.get(
  "/dashboard",
  authMiddleware,
  async (req, res) => {
    try {
      // OPs por status
      const [opsStatus] = await db.promise().query(`
        SELECT status, COUNT(*) AS total FROM ordens_producao WHERE is_deleted = 0 GROUP BY status
      `);
      const ops = { ABERTA: 0, EM_PRODUCAO: 0, CONCLUIDA: 0, CANCELADA: 0 };
      opsStatus.forEach(r => { ops[r.status] = r.total; });

      // OPs concluídas este mês
      const [[opsMes]] = await db.promise().query(`
        SELECT COUNT(*) AS total, COALESCE(SUM(qtde_total), 0) AS qtde_produzida
        FROM ordens_producao
        WHERE is_deleted = 0 AND status = 'CONCLUIDA'
          AND MONTH(data_finalizacao) = MONTH(CURDATE()) AND YEAR(data_finalizacao) = YEAR(CURDATE())
      `);

      // Materiais com estoque abaixo do mínimo
      const [abaixoMinimo] = await db.promise().query(`
        SELECT id, codigo_produto, descricao, estoque, estoque_minimo, unidade_medida
        FROM materiais
        WHERE estoque_minimo > 0 AND estoque < estoque_minimo
        ORDER BY (estoque_minimo - estoque) DESC
        LIMIT 20
      `);

      // Materiais com estoque zerado
      const [[{ estoque_zerado }]] = await db.promise().query(`
        SELECT COUNT(*) AS estoque_zerado FROM materiais WHERE estoque <= 0
      `);

      // Total de materiais e valor total em estoque
      const [[matStats]] = await db.promise().query(`
        SELECT COUNT(*) AS total_materiais,
               COALESCE(SUM(estoque * custo_fornecedor), 0) AS valor_total_estoque
        FROM materiais
      `);

      // Pedidos pendentes vs entregues
      const [pedidosStatus] = await db.promise().query(`
        SELECT status_producao, COUNT(*) AS total FROM controle_pedidos GROUP BY status_producao
      `).catch(() => [[]]);
      const pedidos = {};
      (pedidosStatus || []).forEach(r => { pedidos[r.status_producao || "Pendente"] = r.total; });

      // Últimas 10 movimentações de estoque
      const [ultMovs] = await db.promise().query(`
        SELECT m.*, mat.codigo_produto AS mat_codigo
        FROM movimentacoes_estoque m
        LEFT JOIN materiais mat ON mat.id = m.material_id
        ORDER BY m.criado_em DESC LIMIT 10
      `).catch(() => [[]]);

      // Produção últimos 6 meses (para gráfico)
      const [prod6m] = await db.promise().query(`
        SELECT DATE_FORMAT(data_finalizacao, '%Y-%m') AS mes,
               COUNT(*) AS total_ops,
               COALESCE(SUM(qtde_total), 0) AS qtde_total
        FROM ordens_producao
        WHERE is_deleted = 0 AND status = 'CONCLUIDA'
          AND data_finalizacao >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY mes ORDER BY mes ASC
      `);

      res.json({
        success: true,
        data: {
          ops,
          ops_mes: { total: opsMes.total, qtde_produzida: Number(opsMes.qtde_produzida) },
          materiais: {
            total: matStats.total_materiais,
            valor_estoque: Number(matStats.valor_total_estoque),
            estoque_zerado,
            abaixo_minimo: abaixoMinimo,
          },
          pedidos,
          ultimas_movimentacoes: ultMovs || [],
          producao_6m: prod6m || [],
        }
      });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

/* =======================
   DASHBOARD PEDIDOS — dados avançados + OPs
======================= */
app.get(
  "/dashboard-pedidos",
  authMiddleware,
  async (req, res) => {
    try {
      const p = db.promise();

      // ── Todas as queries em paralelo (Promise.all) ──
      const [
        [_kpis], [porStatus], [porMes], [entregasPorMes], [topClientes],
        [porUF], [pedidosAtrasados], [proximasEntregas], [ultimosPedidos],
        [_taxaPrazo],
        [_opsKpis], [opsStatus], [ops6m], [opsRecentes], [opsPerdas]
      ] = await Promise.all([
        p.query(`SELECT COUNT(*) AS total_pedidos,
          SUM(CASE WHEN status_producao NOT IN ('Entregue') THEN 1 ELSE 0 END) AS pedidos_ativos,
          SUM(CASE WHEN status_producao = 'Entregue' THEN 1 ELSE 0 END) AS pedidos_entregues,
          SUM(CASE WHEN status_producao = 'Item em Produção' THEN 1 ELSE 0 END) AS em_producao,
          SUM(CASE WHEN status_producao IN ('Pedido atrasado','Entrega com Atraso') THEN 1 ELSE 0 END) AS atrasados,
          SUM(CASE WHEN status_producao = 'Curso normal' THEN 1 ELSE 0 END) AS curso_normal,
          COALESCE(SUM(qtde_solicitada), 0) AS total_pecas_solicitadas,
          COALESCE(SUM(qtde_produzida), 0) AS total_pecas_produzidas
          FROM controle_pedidos`),
        p.query(`SELECT status_producao AS status, COUNT(*) AS total
          FROM controle_pedidos GROUP BY status_producao ORDER BY total DESC`),
        p.query(`SELECT DATE_FORMAT(criado_em, '%Y-%m') AS mes, COUNT(*) AS total,
          COALESCE(SUM(qtde_solicitada), 0) AS pecas FROM controle_pedidos
          WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY mes ORDER BY mes ASC`),
        p.query(`SELECT DATE_FORMAT(data_finalizada, '%Y-%m') AS mes, COUNT(*) AS total,
          COALESCE(SUM(qtde_produzida), 0) AS pecas FROM controle_pedidos
          WHERE status_producao = 'Entregue' AND data_finalizada >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          GROUP BY mes ORDER BY mes ASC`),
        p.query(`SELECT cliente, COUNT(*) AS total_pedidos,
          COALESCE(SUM(qtde_solicitada), 0) AS total_pecas,
          SUM(CASE WHEN status_producao = 'Entregue' THEN 1 ELSE 0 END) AS entregues
          FROM controle_pedidos WHERE cliente IS NOT NULL AND cliente != ''
          GROUP BY cliente ORDER BY total_pedidos DESC LIMIT 10`),
        p.query(`SELECT UPPER(TRIM(estado)) AS uf, COUNT(*) AS total
          FROM controle_pedidos WHERE estado IS NOT NULL AND estado != ''
          GROUP BY uf ORDER BY total DESC LIMIT 15`),
        p.query(`SELECT id, ordem_compra, cliente, estado, codigo_cliente, zerb,
          qtde_solicitada, qtde_produzida, status_producao,
          data_contratual, data_finalizada, controle FROM controle_pedidos
          WHERE status_producao IN ('Pedido atrasado','Entrega com Atraso')
          ORDER BY data_contratual ASC LIMIT 20`),
        p.query(`SELECT id, ordem_compra, cliente, estado, codigo_cliente, zerb,
          qtde_solicitada, qtde_produzida, status_producao, data_contratual, controle
          FROM controle_pedidos WHERE status_producao NOT IN ('Entregue')
          AND data_contratual IS NOT NULL AND data_contratual >= CURDATE()
          ORDER BY data_contratual ASC LIMIT 15`),
        p.query(`SELECT id, ordem_compra, cliente, estado, codigo_cliente, zerb,
          qtde_solicitada, qtde_produzida, status_producao,
          data_contratual, criado_em, controle FROM controle_pedidos ORDER BY id DESC LIMIT 10`),
        p.query(`SELECT COUNT(*) AS total_entregues,
          SUM(CASE WHEN data_finalizada <= data_contratual THEN 1 ELSE 0 END) AS no_prazo
          FROM controle_pedidos WHERE status_producao = 'Entregue'
          AND data_contratual IS NOT NULL AND data_finalizada IS NOT NULL`),
        // OPs
        p.query(`SELECT COUNT(*) AS total_ops,
          SUM(CASE WHEN status = 'ABERTA' THEN 1 ELSE 0 END) AS abertas,
          SUM(CASE WHEN status = 'EM_PRODUCAO' THEN 1 ELSE 0 END) AS em_producao,
          SUM(CASE WHEN status = 'CONCLUIDA' THEN 1 ELSE 0 END) AS concluidas,
          SUM(CASE WHEN status = 'CANCELADA' THEN 1 ELSE 0 END) AS canceladas,
          COALESCE(SUM(qtde_total), 0) AS total_pecas,
          COALESCE(SUM(custo_total), 0) AS custo_total
          FROM ordens_producao WHERE is_deleted = 0`),
        p.query(`SELECT status, COUNT(*) AS total FROM ordens_producao WHERE is_deleted = 0
          GROUP BY status ORDER BY FIELD(status,'ABERTA','EM_PRODUCAO','CONCLUIDA','CANCELADA')`),
        p.query(`SELECT DATE_FORMAT(data_finalizacao, '%Y-%m') AS mes,
          COUNT(*) AS total, COALESCE(SUM(qtde_total), 0) AS pecas FROM ordens_producao
          WHERE is_deleted = 0 AND status = 'CONCLUIDA'
          AND data_finalizacao >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY mes ORDER BY mes ASC`),
        p.query(`SELECT id, numero_op, codigo_produto, descricao_material,
          qtde_total, status, responsavel, data_finalizacao, custo_total
          FROM ordens_producao WHERE is_deleted = 0 ORDER BY id DESC LIMIT 10`),
        p.query(`SELECT p.op_id, p.codigo_produto, p.descricao, p.quantidade,
          p.unidade_medida, p.motivo, p.criado_em, o.numero_op FROM op_perdas p
          LEFT JOIN ordens_producao o ON o.id = p.op_id
          ORDER BY p.criado_em DESC LIMIT 15`).catch(() => [[]]),
      ]);

      const kpis = _kpis[0];
      const taxaPrazo = _taxaPrazo[0];
      const opsKpis = _opsKpis[0];

      res.json({
        success: true,
        data: {
          kpis,
          taxa_prazo: {
            total: taxaPrazo.total_entregues || 0,
            no_prazo: taxaPrazo.no_prazo || 0,
            percentual: taxaPrazo.total_entregues > 0
              ? Math.round((taxaPrazo.no_prazo / taxaPrazo.total_entregues) * 100) : 0
          },
          por_status: porStatus,
          por_mes: porMes,
          entregas_por_mes: entregasPorMes,
          top_clientes: topClientes,
          por_uf: porUF,
          pedidos_atrasados: pedidosAtrasados,
          proximas_entregas: proximasEntregas,
          ultimos_pedidos: ultimosPedidos,
          // OPs
          ops_kpis: opsKpis,
          ops_status: opsStatus,
          ops_6m: ops6m,
          ops_recentes: opsRecentes,
          ops_perdas: opsPerdas || [],
        }
      });
    } catch (e) {
      console.error("Erro dashboard-pedidos:", e);
      res.status(500).json({ success: false, message: e.message });
    }
  }
);

/* =======================
   DASHBOARD ESTOQUE — movimentações, alertas, perdas
======================= */
app.get(
  "/dashboard-estoque",
  authMiddleware,
  async (req, res) => {
    try {
      const p = db.promise();

      const [
        [_matKpis], [movsPorTipo], [movsPorMes], [topSaidas],
        [abaixoMinimo], [estoqueZerado], [ultimasMovs],
        [ultimasSaidas], [perdas], [_saidasValor], [_perdasTotal]
      ] = await Promise.all([
        p.query(`SELECT COUNT(*) AS total_materiais,
          COALESCE(SUM(estoque * custo_fornecedor), 0) AS valor_total,
          SUM(CASE WHEN estoque <= 0 THEN 1 ELSE 0 END) AS estoque_zerado,
          SUM(CASE WHEN estoque_minimo > 0 AND estoque < estoque_minimo THEN 1 ELSE 0 END) AS abaixo_minimo
          FROM materiais`),
        p.query(`SELECT tipo, COUNT(*) AS total, COALESCE(SUM(quantidade), 0) AS qtde_total
          FROM movimentacoes_estoque WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY tipo ORDER BY total DESC`),
        p.query(`SELECT DATE_FORMAT(criado_em, '%Y-%m') AS mes, tipo,
          COUNT(*) AS total, COALESCE(SUM(quantidade), 0) AS qtde
          FROM movimentacoes_estoque WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          GROUP BY mes, tipo ORDER BY mes ASC`),
        p.query(`SELECT m.codigo_produto, m.descricao, m.unidade_medida,
          COUNT(*) AS total_saidas, COALESCE(SUM(mov.quantidade), 0) AS qtde_saida,
          m.estoque AS estoque_atual, m.estoque_minimo
          FROM movimentacoes_estoque mov JOIN materiais m ON m.id = mov.material_id
          WHERE mov.tipo = 'SAIDA' AND mov.criado_em >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY mov.material_id ORDER BY qtde_saida DESC LIMIT 10`),
        p.query(`SELECT id, codigo_produto, descricao, estoque, estoque_minimo, unidade_medida
          FROM materiais WHERE estoque_minimo > 0 AND estoque < estoque_minimo
          ORDER BY (estoque_minimo - estoque) DESC LIMIT 20`),
        p.query(`SELECT id, codigo_produto, descricao, unidade_medida, estoque_minimo
          FROM materiais WHERE estoque <= 0 ORDER BY codigo_produto ASC LIMIT 20`),
        p.query(`SELECT m.*, mat.codigo_produto AS mat_codigo, mat.descricao AS mat_descricao
          FROM movimentacoes_estoque m LEFT JOIN materiais mat ON mat.id = m.material_id
          ORDER BY m.criado_em DESC LIMIT 15`),
        p.query(`SELECT s.id, s.numero, s.cliente, s.estado, s.pedido_venda,
          s.ordem_compra, s.data_saida, s.usuario,
          (SELECT COUNT(*) FROM saidas_estoque_itens WHERE saida_id = s.id) AS total_itens,
          (SELECT COALESCE(SUM(subtotal), 0) FROM saidas_estoque_itens WHERE saida_id = s.id) AS valor_total
          FROM saidas_estoque s ORDER BY s.id DESC LIMIT 10`).catch(() => [[]]),
        p.query(`SELECT p.op_id, p.codigo_produto, p.descricao, p.quantidade,
          p.unidade_medida, p.motivo, p.criado_em, o.numero_op FROM op_perdas p
          LEFT JOIN ordens_producao o ON o.id = p.op_id
          ORDER BY p.criado_em DESC LIMIT 15`).catch(() => [[]]),
        p.query(`SELECT COALESCE(SUM(i.subtotal), 0) AS valor_total, COUNT(DISTINCT s.id) AS total_saidas
          FROM saidas_estoque s JOIN saidas_estoque_itens i ON i.saida_id = s.id
          WHERE s.data_saida >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`)
          .catch(() => [[{ valor_total: 0, total_saidas: 0 }]]),
        p.query(`SELECT COUNT(*) AS total, COALESCE(SUM(quantidade), 0) AS qtde_total
          FROM op_perdas WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`)
          .catch(() => [[{ total: 0, qtde_total: 0 }]]),
      ]);

      const matKpis = _matKpis[0];
      const saidasValor = _saidasValor[0] || { valor_total: 0, total_saidas: 0 };
      const perdasTotal = _perdasTotal[0] || { total: 0, qtde_total: 0 };

      res.json({
        success: true,
        data: {
          kpis: matKpis,
          saidas_valor: saidasValor,
          perdas_total: perdasTotal,
          movs_por_tipo: movsPorTipo,
          movs_por_mes: movsPorMes,
          top_saidas: topSaidas,
          abaixo_minimo: abaixoMinimo,
          estoque_zerado: estoqueZerado,
          ultimas_movs: ultimasMovs,
          ultimas_saidas: ultimasSaidas || [],
          perdas: perdas || [],
        }
      });
    } catch (e) {
      console.error("Erro dashboard-estoque:", e);
      res.status(500).json({ success: false, message: e.message });
    }
  }
);

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
      // Validação de complexidade de senha
      if (senha.length < 8)
        return res.status(400).json({ success: false, message: "A senha deve ter no mínimo 8 caracteres." });
      if (!/[A-Z]/.test(senha))
        return res.status(400).json({ success: false, message: "A senha deve conter pelo menos 1 letra maiúscula." });
      if (!/[0-9]/.test(senha))
        return res.status(400).json({ success: false, message: "A senha deve conter pelo menos 1 número." });
      if (!/[^A-Za-z0-9]/.test(senha))
        return res.status(400).json({ success: false, message: "A senha deve conter pelo menos 1 caractere especial (!@#$%...)." });
      const senha_hash = await bcrypt.hash(senha, 12);
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
        if (senha.length < 8)
          return res.status(400).json({ success: false, message: "A senha deve ter no mínimo 8 caracteres." });
        if (!/[A-Z]/.test(senha))
          return res.status(400).json({ success: false, message: "A senha deve conter pelo menos 1 letra maiúscula." });
        if (!/[0-9]/.test(senha))
          return res.status(400).json({ success: false, message: "A senha deve conter pelo menos 1 número." });
        if (!/[^A-Za-z0-9]/.test(senha))
          return res.status(400).json({ success: false, message: "A senha deve conter pelo menos 1 caractere especial (!@#$%...)." });
        const hash = await bcrypt.hash(senha, 12);
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
   SISTEMA — BACKUP
======================= */
function escapeSQL(v) {
  if (v === null || v === undefined) return "NULL";
  // Buffer (JSON columns, blobs)
  if (Buffer.isBuffer(v)) v = v.toString("utf8");
  // Boolean
  if (typeof v === "boolean") return v ? "1" : "0";
  // Date
  if (v instanceof Date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `'${v.getFullYear()}-${pad(v.getMonth()+1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}'`;
  }
  // Number
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  // String
  const s = String(v);
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\x00/g, "")}'`;
}

app.get(
  "/sistema/backup",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
      const hora = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
      const filename = `backup_pcp_${hoje}_${hora}.sql`;

      // Busca todas as tabelas do banco pcp
      const [tables] = await db.promise().query("SHOW TABLES");
      if (!tables.length) {
        return res.status(400).json({ success: false, message: "Nenhuma tabela encontrada no banco." });
      }
      const tableKey = Object.keys(tables[0])[0];
      const tableNames = tables.map(t => t[tableKey]);

      // Monta o SQL completo na memoria
      const parts = [];
      parts.push(`-- ================================================`);
      parts.push(`-- Backup completo do banco PCP`);
      parts.push(`-- Data: ${new Date().toLocaleString("pt-BR")}`);
      parts.push(`-- Tabelas: ${tableNames.length}`);
      parts.push(`-- ================================================`);
      parts.push(``);
      parts.push(`SET FOREIGN_KEY_CHECKS = 0;`);
      parts.push(`SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';`);
      parts.push(`SET NAMES utf8mb4;`);
      parts.push(``);

      for (const table of tableNames) {
        parts.push(`-- ------------------------------------------------`);
        parts.push(`-- Tabela: ${table}`);
        parts.push(`-- ------------------------------------------------`);

        // DROP + CREATE
        parts.push(`DROP TABLE IF EXISTS \`${table}\`;`);
        const [[createResult]] = await db.promise().query(`SHOW CREATE TABLE \`pcp\`.\`${table}\``);
        const createSQL = createResult["Create Table"];
        parts.push(`${createSQL};`);
        parts.push(``);

        // INSERT dos dados
        const [rows] = await db.promise().query(`SELECT * FROM \`pcp\`.\`${table}\``);
        if (rows.length > 0) {
          const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(", ");
          // Insere em chunks de 100 linhas
          for (let i = 0; i < rows.length; i += 100) {
            const chunk = rows.slice(i, i + 100);
            const values = chunk.map(row => {
              const vals = Object.values(row).map(escapeSQL);
              return `(${vals.join(", ")})`;
            }).join(",\n  ");
            parts.push(`INSERT INTO \`${table}\` (${cols}) VALUES`);
            parts.push(`  ${values};`);
          }
          parts.push(``);
        }
      }

      parts.push(`SET FOREIGN_KEY_CHECKS = 1;`);
      parts.push(`-- Fim do backup`);

      const sqlContent = parts.join("\n");

      // Envia como arquivo para download
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", Buffer.byteLength(sqlContent, "utf8"));
      res.end(sqlContent, "utf8");

      // Tenta criar copia no servidor (nao bloqueia se falhar)
      const backupDb = filename.replace(".sql", "");
      try {
        await db.promise().query(`CREATE DATABASE IF NOT EXISTS \`${backupDb}\``);
        for (const table of tableNames) {
          await db.promise().query(`CREATE TABLE \`${backupDb}\`.\`${table}\` LIKE \`pcp\`.\`${table}\``);
          await db.promise().query(`INSERT INTO \`${backupDb}\`.\`${table}\` SELECT * FROM \`pcp\`.\`${table}\``);
        }
      } catch (dbErr) {
        console.warn("Copia do backup no servidor falhou (sem privilegios?):", dbErr.message);
      }

      registrarLog({
        usuario_id: req.user.id, usuario_nome: req.user.nome,
        modulo: "SISTEMA", acao: "Backup",
        descricao: `Backup gerado: ${filename} (${tableNames.length} tabelas, ${sqlContent.length} bytes)`,
      });
    } catch (err) {
      console.error("Erro no backup:", err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "Erro ao gerar backup: " + err.message });
      }
    }
  }
);
/* =======================
   SISTEMA — LISTAR BACKUPS
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
   SISTEMA — RESTAURAR BACKUP
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
      const [check] = await db.promise().query(`SHOW DATABASES LIKE ?`, [banco]);
      if (check.length === 0) {
        return res.status(404).json({ success: false, message: `Banco ${banco} não encontrado.` });
      }
      const [tables] = await db.promise().query(`SHOW TABLES FROM \`${banco}\``);
      const tableKey = Object.keys(tables[0])[0];
      const tableNames = tables.map(t => t[tableKey]);
      // Tabelas que existem no pcp (destino)
      const [ppcTables] = await db.promise().query(`SHOW TABLES FROM \`pcp\``);
      const ppcKey = Object.keys(ppcTables[0])[0];
      const ppcTableNames = new Set(ppcTables.map(t => t[ppcKey]));
      await db.promise().query("SET FOREIGN_KEY_CHECKS = 0");
      let restauradas = 0;
      for (const table of tableNames) {
        try {
          if (!ppcTableNames.has(table)) {
            // Tabela existe no backup mas não no pcp — cria e copia
            const [[createRow]] = await db.promise().query(`SHOW CREATE TABLE \`${banco}\`.\`${table}\``);
            const createSql = createRow["Create Table"].replace(`\`${table}\``, `\`pcp\`.\`${table}\``);
            await db.promise().query(createSql);
          } else {
            await db.promise().query(`TRUNCATE TABLE \`pcp\`.\`${table}\``);
          }
          await db.promise().query(`INSERT INTO \`pcp\`.\`${table}\` SELECT * FROM \`${banco}\`.\`${table}\``);
          restauradas++;
        } catch (tableErr) {
          console.warn(`Aviso ao restaurar tabela ${table}:`, tableErr.message);
        }
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
      const [ops] = await db.promise().query(
        `SELECT * FROM ordens_producao WHERE is_deleted = 0 ORDER BY id DESC`
      );
      criarAba("Ordens de Produção", ops);
      const [pedidos] = await db.promise().query(
        `SELECT * FROM controle_pedidos ORDER BY id DESC`
      );
      criarAba("Controle de Pedidos", pedidos);
      const [materiais] = await db.promise().query(
        `SELECT * FROM materiais ORDER BY CAST(codigo_produto AS UNSIGNED) ASC`
      );
      criarAba("Materiais", materiais);
      const [insumos] = await db.promise().query(
        `SELECT ins.*, op.numero_op
         FROM op_insumos ins
         LEFT JOIN ordens_producao op ON op.id = ins.op_id
         ORDER BY ins.op_id DESC, ins.id ASC`
      );
      criarAba("Insumos por OP", insumos);
      const [saidas] = await db.promise().query(
        `SELECT * FROM saidas_estoque ORDER BY id DESC`
      );
      criarAba("Saídas de Estoque", saidas);
      const [saidaItens] = await db.promise().query(
        `SELECT si.*, s.numero AS saida_numero
         FROM saidas_estoque_itens si
         LEFT JOIN saidas_estoque s ON s.id = si.saida_id
         ORDER BY si.saida_id DESC, si.id ASC`
      );
      criarAba("Itens de Saída", saidaItens);
      const [logs] = await db.promise().query(
        `SELECT * FROM logs_sistema ORDER BY id DESC LIMIT 5000`
      );
      criarAba("Logs", logs);
      const [usuarios] = await db.promise().query(
        `SELECT * FROM usuarios ORDER BY id`
      );
      const usuariosSafe = usuarios.map(u => { const { senha_hash, ...rest } = u; return rest; });
      criarAba("Usuários", usuariosSafe);
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
/* =====================================================
   ENTRADA DE NOTAS — processa itens do XML e atualiza estoque
===================================================== */
const ENTRADAS_NF_DDL = `
  CREATE TABLE IF NOT EXISTS entradas_nf (
    id              INT NOT NULL AUTO_INCREMENT,
    chave_nfe       VARCHAR(50) NULL,
    numero_nf       VARCHAR(20) NULL,
    serie           VARCHAR(5)  NULL,
    natureza_op     VARCHAR(255) NULL,
    data_emissao    DATETIME    NULL,
    data_entrada    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    emit_cnpj       VARCHAR(20) NULL,
    emit_nome       VARCHAR(255) NULL,
    emit_fantasia   VARCHAR(255) NULL,
    emit_uf         VARCHAR(2)  NULL,
    emit_cidade     VARCHAR(100) NULL,
    dest_cnpj       VARCHAR(20) NULL,
    dest_nome       VARCHAR(255) NULL,
    valor_produtos  DECIMAL(12,2) NULL,
    valor_total     DECIMAL(12,2) NULL,
    qtde_itens      INT          NULL,
    qtde_atualizado INT          NULL,
    criado_por      INT          NULL,
    criado_por_nome VARCHAR(100) NULL,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_chave (chave_nfe),
    KEY idx_entrada_data  (data_entrada),
    KEY idx_entrada_emit  (emit_cnpj),
    KEY idx_entrada_nf    (numero_nf)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const ENTRADAS_NF_ITENS_DDL = `
  CREATE TABLE IF NOT EXISTS entradas_nf_itens (
    id              INT NOT NULL AUTO_INCREMENT,
    entrada_id      INT NOT NULL,
    n_item          INT NULL,
    codigo_produto  VARCHAR(100) NULL,
    descricao       VARCHAR(500) NULL,
    ncm             VARCHAR(20)  NULL,
    cfop            VARCHAR(10)  NULL,
    unidade         VARCHAR(20)  NULL,
    quantidade      DECIMAL(14,4) NULL,
    valor_unitario  DECIMAL(14,4) NULL,
    valor_total     DECIMAL(12,2) NULL,
    material_id     INT          NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'NAO_ENCONTRADO',
    estoque_anterior DECIMAL(14,4) NULL,
    estoque_novo    DECIMAL(14,4) NULL,
    PRIMARY KEY (id),
    KEY idx_entrada_itens_entrada (entrada_id),
    KEY idx_entrada_itens_material (material_id),
    CONSTRAINT fk_entrada_itens_entrada FOREIGN KEY (entrada_id) REFERENCES entradas_nf(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function garantirTabelasEntrada() {
  await db.promise().query(ENTRADAS_NF_DDL);
  await db.promise().query(ENTRADAS_NF_ITENS_DDL);
}

// GET /entrada-notas — listar entradas
app.get("/entrada-notas", authMiddleware, roleMiddleware(["admin","pcp","logistica"]), async (req, res) => {
  try {
    await garantirTabelasEntrada();
    const { search } = req.query;
    let sql = `SELECT id, chave_nfe, numero_nf, serie, natureza_op, data_emissao, data_entrada,
                      emit_cnpj, emit_nome, emit_fantasia, valor_produtos, valor_total,
                      qtde_itens, qtde_atualizado, criado_por_nome, criado_em
               FROM entradas_nf`;
    const params = [];
    if (search) {
      sql += ` WHERE emit_nome LIKE ? OR emit_fantasia LIKE ? OR numero_nf LIKE ? OR chave_nfe LIKE ?`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ` ORDER BY criado_em DESC`;
    const [rows] = await db.promise().query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /entrada-notas/:id — detalhes de uma entrada com itens
app.get("/entrada-notas/:id", authMiddleware, roleMiddleware(["admin","pcp","logistica"]), async (req, res) => {
  try {
    await garantirTabelasEntrada();
    const [[entrada]] = await db.promise().query(`SELECT * FROM entradas_nf WHERE id = ?`, [req.params.id]);
    if (!entrada) return res.status(404).json({ success: false, message: "Entrada não encontrada." });
    const [itens] = await db.promise().query(
      `SELECT * FROM entradas_nf_itens WHERE entrada_id = ? ORDER BY n_item ASC`, [req.params.id]
    );
    res.json({ success: true, data: { ...entrada, itens } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /entrada-notas — processa XML e dá entrada no estoque
app.post("/entrada-notas", authMiddleware, roleMiddleware(["admin","pcp","logistica"]), async (req, res) => {
  try {
    await garantirTabelasEntrada();
    const { chave_nfe, numero_nf, serie, natureza_op, data_emissao,
            emit_cnpj, emit_nome, emit_fantasia, emit_uf, emit_cidade,
            dest_cnpj, dest_nome, valor_produtos, valor_total, itens, vinculacoes } = req.body;

    // vinculacoes = { "cProd": material_id, ... } — mapa de vinculações manuais feitas pelo usuário

    if (!itens || !itens.length)
      return res.status(400).json({ success: false, message: "Nenhum item na nota." });

    // Verifica duplicata pela chave
    if (chave_nfe) {
      const [[existe]] = await db.promise().query(
        `SELECT id FROM entradas_nf WHERE chave_nfe = ?`, [chave_nfe]
      );
      if (existe)
        return res.status(409).json({ success: false, message: `Nota já importada (ID ${existe.id}).` });
    }

    // Processa cada item: tenta vincular ao material e atualizar estoque
    const processados = [];
    for (const item of itens) {
      const { nItem, cProd, xProd, qCom, vUnCom, vProd, CFOP, uCom, NCM } = item;
      const qtde = parseFloat(qCom) || 0;
      const vUnit = parseFloat(vUnCom) || 0;
      const vTot  = parseFloat(vProd) || 0;

      // Busca material: primeiro por vinculação manual, depois pelo codigo_produto
      let matches;
      const vinculadoId = vinculacoes && vinculacoes[cProd] ? Number(vinculacoes[cProd]) : null;
      if (vinculadoId) {
        [matches] = await db.promise().query(
          `SELECT id, codigo_produto, descricao, estoque, unidade_medida,
                  unidade_compra, fator_conversao
           FROM materiais WHERE id = ? LIMIT 1`,
          [vinculadoId]
        );
      } else {
        // 1) Tenta busca exata por codigo_produto (só o código original, sem variações)
        [matches] = await db.promise().query(
          `SELECT id, codigo_produto, descricao, estoque, unidade_medida,
                  unidade_compra, fator_conversao
           FROM materiais WHERE codigo_produto = ? AND situacao = 'ativo' LIMIT 1`,
          [cProd]
        );

        // 2) Fallback: busca por descrição similar
        if (!matches.length && xProd) {
          const stopwords = new Set(["de","do","da","dos","das","em","com","para","por","sem","que","uma","uns","umas"]);
          const palavras = (xProd || "")
            .toUpperCase()
            .replace(/[^A-Z0-9À-Ú\s]/g, "")
            .split(/\s+/)
            .filter(p => p.length >= 3 && !stopwords.has(p.toLowerCase()));

          if (palavras.length) {
            const likeConditions = palavras.map(() => `(UPPER(descricao) LIKE ?)`).join(" + ");
            const params = palavras.map(p => `%${p}%`);
            const sql = `
              SELECT id, codigo_produto, descricao, estoque, unidade_medida,
                     unidade_compra, fator_conversao,
                     (${likeConditions}) AS relevancia
              FROM materiais
              WHERE situacao = 'ativo'
                AND (${palavras.map(() => `UPPER(descricao) LIKE ?`).join(" OR ")})
              ORDER BY relevancia DESC
              LIMIT 1
            `;
            [matches] = await db.promise().query(sql, [...params, ...params]);
          }
        }
      }

      let material_id = null;
      let status = "NAO_ENCONTRADO";
      let estoque_anterior = null;
      let estoque_novo = null;
      let fator_aplicado = 1;
      let qtde_convertida = qtde;

      if (matches.length) {
        const mat = matches[0];
        material_id = mat.id;
        estoque_anterior = Number(mat.estoque || 0);

        // Aplica fator de conversão quando a unidade da NF bate com a unidade de compra
        // Ex: material estocado em "m", compra em "rolo", fator = 25
        // NF vem com uCom="rolo" e qCom=2 → converte para 2 * 25 = 50 metros
        const fator = Number(mat.fator_conversao) || 1;
        const unCompra = (mat.unidade_compra || "").toLowerCase().trim();
        const unNF = (uCom || "").toLowerCase().trim();
        const unEstoque = (mat.unidade_medida || "").toLowerCase().trim();

        if (fator > 1 && unCompra && unNF && unNF !== unEstoque) {
          // Unidade da NF é diferente da unidade de estoque → aplica conversão
          fator_aplicado = fator;
          qtde_convertida = qtde * fator;
        } else if (fator > 1 && unCompra && unNF === unCompra) {
          // Unidade da NF bate exatamente com a unidade de compra configurada
          fator_aplicado = fator;
          qtde_convertida = qtde * fator;
        }

        await db.promise().query(
          `UPDATE materiais SET estoque = estoque + ? WHERE id = ?`,
          [qtde_convertida, material_id]
        );
        estoque_novo = estoque_anterior + qtde_convertida;
        status = "ATUALIZADO";

        // Registra movimentação de estoque
        await criarTabelaMovimentacoes();
        const obsConversao = fator_aplicado > 1
          ? `NF: ${qtde} ${uCom || '?'} × ${fator_aplicado} = ${qtde_convertida} ${unEstoque}`
          : null;
        await db.promise().query(
          `INSERT INTO movimentacoes_estoque
             (material_id, codigo_produto, descricao, tipo, quantidade,
              estoque_anterior, estoque_novo, referencia_tipo, referencia_label,
              observacoes, usuario_id, usuario_nome)
           VALUES (?, ?, ?, 'ENTRADA', ?, ?, ?, 'ENTRADA_NF', ?, ?, ?, ?)`,
          [material_id, cProd, xProd, qtde_convertida,
           estoque_anterior, estoque_novo,
           `NF ${numero_nf || '?'}`,
           obsConversao,
           req.user.id, req.user.nome]
        );
      }

      processados.push({
        nItem: parseInt(nItem) || null,
        cProd,
        xProd,
        NCM: NCM || "",
        CFOP: CFOP || "",
        uCom: uCom || "",
        qCom: qtde,
        vUnCom: vUnit,
        vProd: vTot,
        material_id,
        status,
        estoque_anterior,
        estoque_novo,
        fator_aplicado,
        qtde_convertida,
      });
    }

    const qtdeAtualizado = processados.filter(p => p.status === "ATUALIZADO").length;

    // Salva registro da entrada (header)
    const [result] = await db.promise().query(
      `INSERT INTO entradas_nf (chave_nfe, numero_nf, serie, natureza_op, data_emissao,
        emit_cnpj, emit_nome, emit_fantasia, emit_uf, emit_cidade,
        dest_cnpj, dest_nome, valor_produtos, valor_total,
        qtde_itens, qtde_atualizado, criado_por, criado_por_nome)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [chave_nfe || null, numero_nf || null, serie || null, natureza_op || null, data_emissao || null,
       emit_cnpj || null, emit_nome || null, emit_fantasia || null, emit_uf || null, emit_cidade || null,
       dest_cnpj || null, dest_nome || null, valor_produtos || null, valor_total || null,
       processados.length, qtdeAtualizado, req.user.id, req.user.nome]
    );

    const entradaId = result.insertId;

    // Salva itens individualmente na tabela de rastreabilidade
    for (const p of processados) {
      await db.promise().query(
        `INSERT INTO entradas_nf_itens
          (entrada_id, n_item, codigo_produto, descricao, ncm, cfop, unidade,
           quantidade, valor_unitario, valor_total, material_id, status, estoque_anterior, estoque_novo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [entradaId, p.nItem, p.cProd, p.xProd, p.NCM, p.CFOP, p.uCom,
         p.qCom, p.vUnCom, p.vProd, p.material_id, p.status, p.estoque_anterior, p.estoque_novo]
      );
    }

    // Log
    await registrarLog({
      usuario_id: req.user.id, usuario_nome: req.user.nome,
      modulo: "ESTOQUE", acao: "Entrada NF",
      descricao: `Entrada de NF ${numero_nf || '?'} (Série ${serie || '?'}) do emitente "${emit_nome || '?'}". ` +
        `${qtdeAtualizado}/${processados.length} itens atualizados no estoque. Valor total: R$ ${(valor_total || 0).toFixed(2)}.`,
      referencia_id: entradaId, referencia_label: numero_nf || chave_nfe,
    });

    res.json({
      success: true,
      id: entradaId,
      message: "Entrada processada!",
      processados,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* =======================
   ENTRADA NOTAS — REPROCESSAR (itens NAO_ENCONTRADO)
======================= */
app.put("/entrada-notas/:id/reprocessar", authMiddleware, roleMiddleware(["admin","pcp","logistica"]), async (req, res) => {
  try {
    await garantirTabelasEntrada();
    const entradaId = req.params.id;

    // Busca a entrada
    const [[entrada]] = await db.promise().query(`SELECT * FROM entradas_nf WHERE id = ?`, [entradaId]);
    if (!entrada) return res.status(404).json({ success: false, message: "Entrada não encontrada." });

    // Busca somente os itens que estão NAO_ENCONTRADO
    const [itensNaoEncontrados] = await db.promise().query(
      `SELECT * FROM entradas_nf_itens WHERE entrada_id = ? AND status = 'NAO_ENCONTRADO' ORDER BY n_item ASC`,
      [entradaId]
    );

    if (!itensNaoEncontrados.length)
      return res.json({ success: true, message: "Nenhum item pendente para reprocessar.", atualizados: 0 });

    let atualizados = 0;
    const resultados = [];

    for (const item of itensNaoEncontrados) {
      // 1) Tenta busca exata por codigo_produto
      let [matches] = await db.promise().query(
        `SELECT id, codigo_produto, descricao, estoque, unidade_medida,
                unidade_compra, fator_conversao
         FROM materiais WHERE codigo_produto = ? AND situacao = 'ativo' LIMIT 1`,
        [item.codigo_produto]
      );

      // 2) Fallback: busca por descrição similar
      if (!matches.length && item.descricao) {
        const stopwords = new Set(["de","do","da","dos","das","em","com","para","por","sem","que","uma","uns","umas"]);
        const palavras = (item.descricao || "")
          .toUpperCase()
          .replace(/[^A-Z0-9À-Ú\s]/g, "")
          .split(/\s+/)
          .filter(p => p.length >= 3 && !stopwords.has(p.toLowerCase()));

        if (palavras.length) {
          const likeConditions = palavras.map(() => `(UPPER(descricao) LIKE ?)`).join(" + ");
          const params = palavras.map(p => `%${p}%`);
          const sql = `
            SELECT id, codigo_produto, descricao, estoque, unidade_medida,
                   unidade_compra, fator_conversao,
                   (${likeConditions}) AS relevancia
            FROM materiais
            WHERE situacao = 'ativo'
              AND (${palavras.map(() => `UPPER(descricao) LIKE ?`).join(" OR ")})
            ORDER BY relevancia DESC
            LIMIT 1
          `;
          [matches] = await db.promise().query(sql, [...params, ...params]);
        }
      }

      if (matches.length) {
        const mat = matches[0];
        const qtde = Number(item.quantidade) || 0;
        const estoque_anterior = Number(mat.estoque || 0);

        // Calcula conversão
        const fator = Number(mat.fator_conversao) || 1;
        const unCompra = (mat.unidade_compra || "").toLowerCase().trim();
        const unNF = (item.unidade || "").toLowerCase().trim();
        const unEstoque = (mat.unidade_medida || "").toLowerCase().trim();
        let qtde_convertida = qtde;
        let fator_aplicado = 1;

        if (fator > 1 && unCompra && unNF && unNF !== unEstoque) {
          fator_aplicado = fator;
          qtde_convertida = qtde * fator;
        } else if (fator > 1 && unCompra && unNF === unCompra) {
          fator_aplicado = fator;
          qtde_convertida = qtde * fator;
        }

        const estoque_novo = estoque_anterior + qtde_convertida;

        // Atualiza estoque
        await db.promise().query(`UPDATE materiais SET estoque = estoque + ? WHERE id = ?`, [qtde_convertida, mat.id]);

        // Atualiza item da entrada
        await db.promise().query(
          `UPDATE entradas_nf_itens SET material_id = ?, status = 'ATUALIZADO', estoque_anterior = ?, estoque_novo = ? WHERE id = ?`,
          [mat.id, estoque_anterior, estoque_novo, item.id]
        );

        // Registra movimentação
        await criarTabelaMovimentacoes();
        const obsConversao = fator_aplicado > 1
          ? `NF: ${qtde} ${item.unidade || '?'} × ${fator_aplicado} = ${qtde_convertida} ${unEstoque}`
          : null;
        await db.promise().query(
          `INSERT INTO movimentacoes_estoque
             (material_id, codigo_produto, descricao, tipo, quantidade,
              estoque_anterior, estoque_novo, referencia_tipo, referencia_label,
              observacoes, usuario_id, usuario_nome)
           VALUES (?, ?, ?, 'ENTRADA', ?, ?, ?, 'ENTRADA_NF', ?, ?, ?, ?)`,
          [mat.id, item.codigo_produto, item.descricao, qtde_convertida,
           estoque_anterior, estoque_novo,
           `NF ${entrada.numero_nf || '?'} (reprocessado)`,
           obsConversao,
           req.user.id, req.user.nome]
        );

        atualizados++;
        resultados.push({ codigo: item.codigo_produto, descricao: item.descricao, status: "ATUALIZADO" });
      } else {
        resultados.push({ codigo: item.codigo_produto, descricao: item.descricao, status: "NAO_ENCONTRADO" });
      }
    }

    // Atualiza contador na entrada
    if (atualizados > 0) {
      await db.promise().query(
        `UPDATE entradas_nf SET qtde_atualizado = qtde_atualizado + ? WHERE id = ?`,
        [atualizados, entradaId]
      );
    }

    await registrarLog({
      usuario_id: req.user.id, usuario_nome: req.user.nome,
      modulo: "ESTOQUE", acao: "Reprocessar Entrada NF",
      descricao: `Reprocessamento da NF ${entrada.numero_nf || '?'}. ${atualizados}/${itensNaoEncontrados.length} itens atualizados.`,
      referencia_id: entradaId, referencia_label: entrada.numero_nf || entrada.chave_nfe,
    });

    res.json({
      success: true,
      message: `${atualizados} de ${itensNaoEncontrados.length} itens reprocessados com sucesso.`,
      atualizados,
      resultados,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* =====================================================
   ESPELHOS DE NOTA FISCAL
===================================================== */
const ESPELHOS_NF_DDL = `
  CREATE TABLE IF NOT EXISTS espelhos_nf (
    id             INT NOT NULL AUTO_INCREMENT,
    natureza       VARCHAR(255) NOT NULL DEFAULT 'REMESSA PARA INDUSTRIALIZAÇÃO',
    cfop_nf        VARCHAR(10)  NOT NULL DEFAULT '5901',
    outros         VARCHAR(255) NULL,
    razao_social   VARCHAR(255) NULL,
    cnpj_forn      VARCHAR(20)  NULL,
    inscricao_est  VARCHAR(50)  NULL,
    email_nf       VARCHAR(255) NULL,
    transportadora VARCHAR(255) NULL,
    cnpj_transp    VARCHAR(20)  NULL,
    tipo_frete     VARCHAR(50)  NULL,
    volume         VARCHAR(50)  NULL,
    peso           VARCHAR(50)  NULL,
    solicitado     VARCHAR(255) NULL,
    pop            VARCHAR(100) NULL,
    data_doc       DATE         NULL,
    ref_nf         VARCHAR(100) NULL,
    observacao     TEXT         NULL,
    base_icms      VARCHAR(50)  NULL,
    valor_icms     VARCHAR(50)  NULL,
    base_icms_sub  VARCHAR(50)  NULL,
    valor_icms_sub VARCHAR(50)  NULL,
    outras_desp    VARCHAR(50)  NULL,
    total_ipi      VARCHAR(50)  NULL,
    total_produtos VARCHAR(50)  NULL,
    total_nota     VARCHAR(50)  NULL,
    itens          JSON         NULL,
    criado_por     INT          NULL,
    criado_por_nome VARCHAR(100) NULL,
    criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_espelhos_data (data_doc),
    KEY idx_espelhos_ref  (ref_nf(50))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

// GET /espelhos_nf
app.get("/espelhos_nf", authMiddleware, roleMiddleware(["admin","pcp","logistica","vendas"]), async (req, res) => {
  try {
    await db.promise().query(ESPELHOS_NF_DDL);
    const { search } = req.query;
    let sql = `SELECT id, natureza, cfop_nf, razao_social, cnpj_forn, ref_nf, data_doc,
                      total_nota, criado_por_nome, criado_em
               FROM espelhos_nf`;
    const params = [];
    if (search) {
      sql += ` WHERE razao_social LIKE ? OR ref_nf LIKE ? OR cnpj_forn LIKE ?`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ` ORDER BY criado_em DESC`;
    const [rows] = await db.promise().query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /espelhos_nf/:id
app.get("/espelhos_nf/:id", authMiddleware, roleMiddleware(["admin","pcp","logistica","vendas"]), async (req, res) => {
  try {
    await db.promise().query(ESPELHOS_NF_DDL);
    const [[row]] = await db.promise().query(`SELECT * FROM espelhos_nf WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: "Espelho não encontrado." });
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /espelhos_nf — cria espelho e baixa estoque dos itens
app.post("/espelhos_nf", authMiddleware, roleMiddleware(["admin","pcp","logistica"]), async (req, res) => {
  try {
    await db.promise().query(ESPELHOS_NF_DDL);
    await criarTabelaMovimentacoes();
    const d = req.body;
    const [result] = await db.promise().query(
      `INSERT INTO espelhos_nf (natureza,cfop_nf,outros,razao_social,cnpj_forn,inscricao_est,email_nf,
        transportadora,cnpj_transp,tipo_frete,volume,peso,solicitado,pop,data_doc,ref_nf,observacao,
        base_icms,valor_icms,base_icms_sub,valor_icms_sub,outras_desp,total_ipi,total_produtos,total_nota,
        itens,criado_por,criado_por_nome)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.natureza,d.cfop_nf,d.outros||null,d.razao_social||null,d.cnpj_forn||null,
       d.inscricao_est||null,d.email_nf||null,d.transportadora||null,d.cnpj_transp||null,
       d.tipo_frete||null,d.volume||null,d.peso||null,d.solicitado||null,d.pop||null,
       d.data_doc||null,d.ref_nf||null,d.observacao||null,
       d.base_icms||null,d.valor_icms||null,d.base_icms_sub||null,d.valor_icms_sub||null,
       d.outras_desp||null,d.total_ipi||null,d.total_produtos||null,d.total_nota||null,
       JSON.stringify(d.itens||[]),req.user.id,req.user.nome]
    );
    const espelhoId = result.insertId;
    const refLabel = `Espelho NF #${espelhoId}` + (d.ref_nf ? ` (${d.ref_nf})` : "");

    // Baixa estoque para cada item com código de material
    const itens = Array.isArray(d.itens) ? d.itens : [];
    for (const it of itens) {
      if (!it.cod) continue;
      const qtde = parseFloat(String(it.qtd || "0").replace(/\./g, "").replace(",", ".")) || 0;
      if (qtde <= 0) continue;
      const [matches] = await db.promise().query(
        `SELECT id, codigo_produto, descricao, estoque FROM materiais WHERE codigo_produto = ? LIMIT 1`, [it.cod]
      );
      if (!matches.length) continue;
      const mat = matches[0];
      const estoqueAnterior = Number(mat.estoque || 0);
      await db.promise().query(
        `UPDATE materiais SET estoque = GREATEST(0, estoque - ?) WHERE id = ?`, [qtde, mat.id]
      );
      const estoqueNovo = Math.max(0, estoqueAnterior - qtde);
      await db.promise().query(
        `INSERT INTO movimentacoes_estoque
           (material_id, codigo_produto, descricao, tipo, quantidade,
            estoque_anterior, estoque_novo, referencia_tipo, referencia_id,
            referencia_label, usuario_id, usuario_nome)
         VALUES (?, ?, ?, 'SAIDA', ?, ?, ?, 'ESPELHO_NF', ?, ?, ?, ?)`,
        [mat.id, mat.codigo_produto, mat.descricao, qtde,
         estoqueAnterior, estoqueNovo, espelhoId, refLabel,
         req.user.id, req.user.nome]
      );
    }

    registrarLog({
      usuario_id: req.user.id, usuario_nome: req.user.nome,
      modulo: "ESTOQUE", acao: "Espelho NF (Saída)",
      descricao: `Espelho NF #${espelhoId} — ${d.natureza || "?"} para "${d.razao_social || "?"}". ${itens.length} item(s).`,
      referencia_id: espelhoId, referencia_label: refLabel,
    });
    res.json({ success: true, id: espelhoId, message: "Espelho salvo!" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /espelhos_nf/:id
app.put("/espelhos_nf/:id", authMiddleware, roleMiddleware(["admin","pcp","logistica"]), async (req, res) => {
  try {
    await db.promise().query(ESPELHOS_NF_DDL);
    const d = req.body;
    await db.promise().query(
      `UPDATE espelhos_nf SET natureza=?,cfop_nf=?,outros=?,razao_social=?,cnpj_forn=?,inscricao_est=?,
        email_nf=?,transportadora=?,cnpj_transp=?,tipo_frete=?,volume=?,peso=?,solicitado=?,pop=?,
        data_doc=?,ref_nf=?,observacao=?,base_icms=?,valor_icms=?,base_icms_sub=?,valor_icms_sub=?,
        outras_desp=?,total_ipi=?,total_produtos=?,total_nota=?,itens=?
       WHERE id=?`,
      [d.natureza,d.cfop_nf,d.outros||null,d.razao_social||null,d.cnpj_forn||null,
       d.inscricao_est||null,d.email_nf||null,d.transportadora||null,d.cnpj_transp||null,
       d.tipo_frete||null,d.volume||null,d.peso||null,d.solicitado||null,d.pop||null,
       d.data_doc||null,d.ref_nf||null,d.observacao||null,
       d.base_icms||null,d.valor_icms||null,d.base_icms_sub||null,d.valor_icms_sub||null,
       d.outras_desp||null,d.total_ipi||null,d.total_produtos||null,d.total_nota||null,
       JSON.stringify(d.itens||[]),req.params.id]
    );
    res.json({ success: true, message: "Espelho atualizado!" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /espelhos_nf/:id
app.delete("/espelhos_nf/:id", authMiddleware, roleMiddleware(["admin","pcp","logistica"]), async (req, res) => {
  try {
    await db.promise().query(`DELETE FROM espelhos_nf WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: "Espelho excluído." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

  app.set('db', db);
  app.set('registrarLog', registrarLog);
  const relatoriosRoutes   = require('./relatorios-routes');
  const fichaTecnicaRoutes = require('./ficha-tecnica-routes');
  app.use('/relatorios',    authMiddleware, relatoriosRoutes);
  app.use('/ficha-tecnica', authMiddleware, fichaTecnicaRoutes);
  const prestadoresRoutes = require('./prestadores-routes');
  app.use('/prestadores',   authMiddleware, prestadoresRoutes);
/* ══════════════════════════════════════════════════════════════
   BACKUP AUTOMÁTICO — roda diariamente às 02:00 e ao iniciar
   Mantém os últimos 7 backups, remove os mais antigos
══════════════════════════════════════════════════════════════ */
const BACKUP_DIR = path.join(__dirname, "backups");
const BACKUP_KEEP = 7; // quantos backups manter

async function executarBackupAutomatico() {
  try {
    // Cria pasta de backups se não existir
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
    const hora = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
    const filename = `backup_pcp_${hoje}_${hora}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    // Verifica se já existe backup de hoje
    const arquivos = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".sql"));
    const backupHoje = arquivos.find(f => f.includes(hoje));
    if (backupHoje) {
      console.log(`📋 Backup de hoje já existe: ${backupHoje}`);
      return;
    }

    console.log(`💾 Iniciando backup automático: ${filename}...`);

    // Pega todas as tabelas
    const [tables] = await db.promise().query("SHOW TABLES");
    const key = Object.keys(tables[0])[0];
    const tableNames = tables.map(t => t[key]);

    const parts = [];
    parts.push(`-- Backup automático PCP — ${new Date().toLocaleString("pt-BR")}`);
    parts.push(`-- Tabelas: ${tableNames.length}`);
    parts.push(`SET FOREIGN_KEY_CHECKS = 0;\n`);

    for (const table of tableNames) {
      // DDL
      const [ddlRows] = await db.promise().query(`SHOW CREATE TABLE \`${table}\``);
      const ddl = ddlRows[0]["Create Table"];
      parts.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      parts.push(ddl + ";\n");

      // Dados
      const [rows] = await db.promise().query(`SELECT * FROM \`${table}\``);
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        const colList = cols.map(c => `\`${c}\``).join(", ");
        // Insere em blocos de 100 linhas
        for (let b = 0; b < rows.length; b += 100) {
          const batch = rows.slice(b, b + 100);
          const valsList = batch.map(row =>
            `(${cols.map(c => escapeSQL(row[c])).join(", ")})`
          ).join(",\n  ");
          parts.push(`INSERT INTO \`${table}\` (${colList}) VALUES\n  ${valsList};\n`);
        }
      }
    }

    parts.push(`SET FOREIGN_KEY_CHECKS = 1;`);
    parts.push(`-- Fim do backup automático`);

    fs.writeFileSync(filepath, parts.join("\n"), "utf8");

    const sizeKB = (fs.statSync(filepath).size / 1024).toFixed(1);
    console.log(`✅ Backup automático salvo: ${filename} (${sizeKB} KB, ${tableNames.length} tabelas)`);

    // Também cria cópia no MySQL (se possível)
    try {
      const backupDb = filename.replace(".sql", "");
      await db.promise().query(`CREATE DATABASE IF NOT EXISTS \`${backupDb}\``);
      for (const table of tableNames) {
        await db.promise().query(`CREATE TABLE \`${backupDb}\`.\`${table}\` LIKE \`pcp\`.\`${table}\``);
        await db.promise().query(`INSERT INTO \`${backupDb}\`.\`${table}\` SELECT * FROM \`pcp\`.\`${table}\``);
      }
      console.log(`✅ Cópia no MySQL: ${backupDb}`);
    } catch (e) {
      console.warn(`⚠️  Cópia MySQL falhou (sem privilégios?): ${e.message}`);
    }

    // Limpeza: remove backups antigos (mantém os últimos BACKUP_KEEP)
    const todosBackups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("backup_pcp_") && f.endsWith(".sql"))
      .sort()
      .reverse();

    if (todosBackups.length > BACKUP_KEEP) {
      const remover = todosBackups.slice(BACKUP_KEEP);
      for (const old of remover) {
        fs.unlinkSync(path.join(BACKUP_DIR, old));
        console.log(`🗑️  Backup antigo removido: ${old}`);
        // Remove também do MySQL
        try {
          await db.promise().query(`DROP DATABASE IF EXISTS \`${old.replace(".sql", "")}\``);
        } catch { /* ignora */ }
      }
    }

    // Registra no log
    await registrarLog({
      usuario_id: null, usuario_nome: "Sistema (automático)",
      modulo: "SISTEMA", acao: "Backup Automático",
      descricao: `Backup automático: ${filename} (${sizeKB} KB, ${tableNames.length} tabelas)`,
    });

  } catch (err) {
    console.error("❌ Erro no backup automático:", err.message);
  }
}

// Agenda backup diário às 02:00
function agendarBackupDiario() {
  const agora = new Date();
  const proxima = new Date(agora);
  proxima.setHours(2, 0, 0, 0);
  if (proxima <= agora) proxima.setDate(proxima.getDate() + 1);

  const msAteProximo = proxima - agora;
  const horasAte = (msAteProximo / 3600000).toFixed(1);
  console.log(`⏰ Próximo backup automático em ${horasAte}h (${proxima.toLocaleString("pt-BR")})`);

  setTimeout(() => {
    executarBackupAutomatico();
    // Depois do primeiro, repete a cada 24h
    setInterval(executarBackupAutomatico, 24 * 60 * 60 * 1000);
  }, msAteProximo);
}

// Executa backup ao iniciar (se não existe backup de hoje) e agenda o diário
setTimeout(() => {
  executarBackupAutomatico();
  agendarBackupDiario();
}, 5000); // espera 5s para o DB estar pronto

const PORTA_SERVER = Number(process.env.SERVER_PORT) || 8080;

// ── HTTPS automático se certificados existirem ──────
const sslKey  = process.env.SSL_KEY;
const sslCert = process.env.SSL_CERT;

if (sslKey && sslCert && fs.existsSync(sslKey) && fs.existsSync(sslCert)) {
  const https = require("https");
  const httpsOptions = {
    key:  fs.readFileSync(sslKey),
    cert: fs.readFileSync(sslCert),
  };
  https.createServer(httpsOptions, app).listen(PORTA_SERVER, "0.0.0.0", () => {
    console.log(`🔒 Servidor HTTPS rodando!`);
    console.log(`🏠 Local: https://localhost:${PORTA_SERVER}`);
    console.log(`📡 Rede:  https://192.168.1.190:${PORTA_SERVER}`);
  });
} else {
  app.listen(PORTA_SERVER, "0.0.0.0", () => {
    console.log(`🚀 Servidor HTTP rodando!`);
    console.log(`🏠 Local: http://localhost:${PORTA_SERVER}`);
    console.log(`📡 Rede:  http://192.168.1.190:${PORTA_SERVER}`);
    if (!sslKey || !sslCert) {
      console.log(`⚠️  HTTPS desativado — configure SSL_KEY e SSL_CERT no .env para ativar`);
    }
  });
}