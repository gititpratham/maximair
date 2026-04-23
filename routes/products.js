const express = require('express');
const router = express.Router();
const { db, uuidv4 } = require('../db/database');

// Get all active products
router.get('/', (req, res) => {
  const products = db.get('products').filter({ active: true }).value();
  res.json(products);
});

// Get single product
router.get('/:id', (req, res) => {
  const product = db.get('products').find({ id: req.params.id, active: true }).value();
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// Submit bulk quote
router.post('/quote', (req, res) => {
  const { name, phone, email, h, w, d, qty, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });

  const quote = {
    id: uuidv4(),
    name, phone, email: email || '',
    dimensions: { h: h || 'Custom', w: w || 'Custom', d: d || 'Custom' },
    qty: qty || 1,
    notes: notes || '',
    status: 'new',
    createdAt: new Date().toISOString()
  };

  db.get('quotes').push(quote).write();
  res.json({ success: true, quoteId: quote.id, message: 'Quote request submitted successfully' });
});

module.exports = router;
