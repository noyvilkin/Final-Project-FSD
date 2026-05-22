const express = require('express');
const app = express();

app.get('/health', (req, res) => res.sendStatus(200));

app.get('/items', (req, res) => res.json({ items: [] }));

// Note: intentionally no tests directory or test files included

app.listen(3002, () => console.log('App listening on 3002'));
