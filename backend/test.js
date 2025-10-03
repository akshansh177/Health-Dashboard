const mysql = require('mysql2');

const conn = mysql.createConnection({
  host: 'localhost',
  user: 'healthuser',
  password: 'Annadada#08',
  database: 'healthdata2'
});

conn.connect((err) => {
  if (err) {
    console.error("❌ Connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL successfully!");
  }
  conn.end();
});
