const express = require('express');
const app = express();

app.get('/public', (req, res) => {
  res.json({ message: 'no auth here' });
});

// Note: intentionally no auth middleware or JWT usage

app.listen(3001, () => console.log('App listening on 3001'));
