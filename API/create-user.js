const mysql = require("mysql2");
const bcrypt = require("bcrypt");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "4618",
  database: "pcp",
  port: 3000,
});

async function criarUsuario() {
  const nome = "Luana";
  const email = "Luana@lucabe.com";
  const senha = "Luana123";
  const perfil = "vendas";

  const senha_hash = await bcrypt.hash(senha, 10);

  const sql = `
    INSERT INTO usuarios (nome, email, senha_hash, perfil)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [nome, email, senha_hash, perfil], (err) => {
    if (err) {
      console.error("Erro:", err);
    } else {
      console.log("Usuário " + $[perfil] + " criado com sucesso!") ;
    }
    db.end();
  });
}

criarUsuario();
