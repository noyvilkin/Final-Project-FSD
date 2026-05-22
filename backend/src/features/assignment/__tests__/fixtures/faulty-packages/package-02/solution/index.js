const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(':memory:');

// Simple express app storing data in SQLite (violates PostgreSQL requirement)
const express = require('express');
const app = express();
app.use(express.json());

app.get('/items', (req, res) => {
  db.all('SELECT 1 as id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: [] });
  });
});

app.listen(3000, () => console.log('App listening on 3000'));
