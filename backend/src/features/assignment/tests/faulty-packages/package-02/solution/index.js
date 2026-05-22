const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcryptjs = require('bcryptjs');

const app = express();
app.use(express.json());

// PRIMARY VIOLATION: Uses SQLite instead of PostgreSQL
const db = new sqlite3.Database(':memory:');

// Initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// SECONDARY VIOLATION: No input validation on any endpoint
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  
  // Missing validation - accepts empty strings, no email format check, no password strength
  const hashedPassword = bcryptjs.hashSync(password, 10);
  
  db.run(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    [username, email, hashedPassword],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, username, email });
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  // SECONDARY VIOLATION: No input validation
  
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    if (bcryptjs.compareSync(password, user.password)) {
      res.json({ token: 'fake-jwt-token', user: { id: user.id, username } });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });
});

app.get('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  // SECONDARY VIOLATION: No validation of userId type
  
  db.get('SELECT id, username, email FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

app.get('/api/users/:id/items', (req, res) => {
  const userId = req.params.id;
  
  db.all('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, items) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(items);
  });
});

app.post('/api/items', (req, res) => {
  const { user_id, name, description } = req.body;
  // SECONDARY VIOLATION: No validation, no check if user_id exists
  
  db.run(
    'INSERT INTO items (user_id, name, description) VALUES (?, ?, ?)',
    [user_id, name, description],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, user_id, name, description });
    }
  );
});

app.get('/api/items/:id', (req, res) => {
  db.get('SELECT * FROM items WHERE id = ?', [req.params.id], (err, item) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  });
});

app.put('/api/items/:id', (req, res) => {
  const { name, description } = req.body;
  // SECONDARY VIOLATION: SQL injection possible, no validation
  
  db.run(
    'UPDATE items SET name = ?, description = ? WHERE id = ?',
    [name, description, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Item updated' });
    }
  );
});

app.delete('/api/items/:id', (req, res) => {
  db.run('DELETE FROM items WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Item deleted' });
  });
});

app.post('/api/orders', (req, res) => {
  const { user_id, total } = req.body;
  // SECONDARY VIOLATION: No validation of order data
  
  db.run(
    'INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)',
    [user_id, total, 'pending'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, user_id, total, status: 'pending' });
    }
  );
});

app.get('/api/orders/:id', (req, res) => {
  db.get('SELECT * FROM orders WHERE id = ?', [req.params.id], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  });
});

// Error handling middleware (basic)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
