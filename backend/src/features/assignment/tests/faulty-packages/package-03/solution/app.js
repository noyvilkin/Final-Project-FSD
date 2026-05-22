const express = require('express');
const jwt = require('jsonwebtoken'); // SECONDARY VIOLATION: Imported but never used
const bcryptjs = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

app.use(express.json());

// Mock user database
const users = [
  { id: 1, username: 'testuser', email: 'test@example.com', password: bcryptjs.hashSync('password123', 10) }
];

let items = [];

// SECONDARY VIOLATION: Auth middleware defined but never applied
const authenticateToken = (req, res, next) => {
  // This middleware is defined but not used on any protected routes
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Public endpoint: get all items (NO AUTH PROTECTION)
app.get('/api/items', (req, res) => {
  res.json(items);
});

// Public endpoint: get user info (NO AUTH PROTECTION)
app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  // Returns user with password hash (security issue)
  res.json(user);
});

// Public endpoint: create item (SHOULD be protected, but isn't)
app.post('/api/items', (req, res) => {
  const { name, description } = req.body;
  const item = {
    id: items.length + 1,
    name,
    description,
    created_at: new Date()
  };
  items.push(item);
  res.status(201).json(item);
});

// Public endpoint: update item (SHOULD be protected, but isn't)
app.put('/api/items/:id', (req, res) => {
  const item = items.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  
  item.name = req.body.name || item.name;
  item.description = req.body.description || item.description;
  res.json(item);
});

// Public endpoint: delete item (SHOULD be protected, but isn't)
app.delete('/api/items/:id', (req, res) => {
  const index = items.findIndex(i => i.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Item not found' });
  
  items.splice(index, 1);
  res.json({ message: 'Item deleted' });
});

// Public endpoint: login (doesn't generate JWT, just returns dummy token)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  if (!bcryptjs.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // SECONDARY VIOLATION: Returns dummy token instead of JWT
  res.json({
    token: 'dummy-token-' + user.id,
    user: { id: user.id, username: user.username }
  });
});

// Public endpoint: get profile (SHOULD be protected)
app.get('/api/profile', (req, res) => {
  // No auth check, returns hardcoded user
  res.json({ id: 1, username: 'testuser', email: 'test@example.com' });
});

// Public endpoint: update profile (SHOULD be protected, but isn't)
app.put('/api/profile', (req, res) => {
  // No auth, just updates fake user
  const user = users[0];
  user.email = req.body.email || user.email;
  res.json({ message: 'Profile updated', user });
});

// Endpoint that LOOKS protected but isn't (header name is wrong)
app.post('/api/protected-action', (req, res) => {
  const authHeader = req.headers['auth-token']; // Wrong header name!
  if (!authHeader) {
    return res.json({ message: 'Action performed', data: 'This should require auth!' });
  }
  res.json({ message: 'Action performed' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
