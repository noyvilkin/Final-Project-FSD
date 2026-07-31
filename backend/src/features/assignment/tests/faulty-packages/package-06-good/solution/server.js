const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
// In production JWT_SECRET must come from the environment; the fallback only exists
// so the app/tests can boot locally without extra setup.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost/dbname',
});

// Demo credential store. In a real system this row would live in PostgreSQL; it is
// kept in-memory here only so the auth flow is verifiable without a seeded database.
const DEMO_USER = {
  id: 1,
  username: 'testuser',
  passwordHash: bcrypt.hashSync('password123', 10),
};

// Middleware
app.use(express.json());

// JWT authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public endpoint: login (verifies credentials before issuing a JWT)
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const validUser =
    username === DEMO_USER.username &&
    (await bcrypt.compare(password, DEMO_USER.passwordHash));

  if (!validUser) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const token = jwt.sign(
    { id: DEMO_USER.id, username: DEMO_USER.username },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  res.json({ token });
});

// Protected endpoint: get user
app.get('/api/users/:id', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }

  try {
    const result = await pool.query('SELECT id, username FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.sendStatus(404);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected endpoint: create item
app.post('/api/items', authenticateToken, async (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO items (name, created_by) VALUES ($1, $2) RETURNING id, name',
      [name.trim(), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (only if not imported as module for testing)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
