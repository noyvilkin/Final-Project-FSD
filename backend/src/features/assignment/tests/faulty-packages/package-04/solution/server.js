const express = require('express');
const app = express();

app.use(express.json());

// Middleware
app.use((req, res, next) => {
  req.requestTime = new Date();
  next();
});

// In-memory database
let users = [
  { id: 1, username: 'admin', email: 'admin@example.com' }
];

let items = [];

// Public endpoints
app.get('/api/users', (req, res) => {
  res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email })));
});

app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, email: user.email });
});

app.post('/api/users', (req, res) => {
  const { username, email } = req.body;
  
  if (!username || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newUser = {
    id: Math.max(...users.map(u => u.id), 0) + 1,
    username,
    email
  };
  
  users.push(newUser);
  res.status(201).json(newUser);
});

app.put('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.username = req.body.username || user.username;
  user.email = req.body.email || user.email;
  
  res.json(user);
});

app.delete('/api/users/:id', (req, res) => {
  const index = users.findIndex(u => u.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'User not found' });
  
  users.splice(index, 1);
  res.json({ message: 'User deleted' });
});

// Items endpoints
app.get('/api/items', (req, res) => {
  res.json(items);
});

app.get('/api/items/:id', (req, res) => {
  const item = items.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

app.post('/api/items', (req, res) => {
  const { name, description, price } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const newItem = {
    id: Math.max(...items.map(i => i.id), 0) + 1,
    name,
    description: description || '',
    price: price || 0,
    created_at: new Date()
  };
  
  items.push(newItem);
  res.status(201).json(newItem);
});

app.put('/api/items/:id', (req, res) => {
  const item = items.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });

  item.name = req.body.name || item.name;
  item.description = req.body.description || item.description;
  item.price = req.body.price !== undefined ? req.body.price : item.price;
  
  res.json(item);
});

app.delete('/api/items/:id', (req, res) => {
  const index = items.findIndex(i => i.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Item not found' });
  
  const deleted = items.splice(index, 1);
  res.json({ message: 'Item deleted', deleted: deleted[0] });
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 3002;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
