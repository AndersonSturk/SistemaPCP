const mysql = require("mysql2");

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "4618",
  database: "pcp",
  port: 3306,
});
module.exports = db;

