const mysql = require("mysql2");
const bcrypt = require("bcrypt");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "4618",
  database: "pcp",
  port: 3306,
});

async function criarUsuario() {

  const nome = "Anderson";
  const email = "Anderson@gmail.com";
  const senha = "Admin123";
  const perfil = "admin";

  const senha_hash = await bcrypt.hash(senha, 10);

  const sql = `
    INSERT INTO usuarios (nome, email, senha_hash, perfil)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [nome, email, senha_hash, perfil], (err) => {
    if (err) {
      console.error("Erro:", err);
    } else {
      console.log(`Usuário ${perfil} criado com sucesso!`);
    }
    db.end();
  });
}

criarUsuario();
