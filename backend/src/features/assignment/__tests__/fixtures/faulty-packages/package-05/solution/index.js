const express = require('express');
const app = express();

// Note: intentionally no /health endpoint provided here

app.get('/items', (req, res) => res.json({ items: [] }));

app.listen(3003, () => console.log('App listening on 3003'));
