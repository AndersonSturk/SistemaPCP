const mysql = require('mysql2/promise');
(async () => {
  try {
    const db = await mysql.createConnection({ host: 'localhost', user: 'root', password: '4618', database: 'pcp', port: 3306 });
    const [rows] = await db.query('DESCRIBE ordens_producao');
    console.log(JSON.stringify(rows, null, 2));
    const [idx] = await db.query('SHOW INDEX FROM ordens_producao');
    console.log(JSON.stringify(idx, null, 2));
    await db.end();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();