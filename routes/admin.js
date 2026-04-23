const express = require('express');
const router = express.Router();
const { db, uuidv4 } = require('../db/database');
const { adminAuth } = require('../middleware/auth');

// Login
router.post('/login', (req, res) => {
  const { password } = req.body;
  const settings = db.get('settings').value();
  if (password !== settings.adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = Buffer.from(settings.adminPassword).toString('base64');
  res.json({ success: true, token });
});

// Dashboard stats
router.get('/stats', adminAuth, (req, res) => {
  const orders = db.get('orders').value();
  const products = db.get('products').value();
  const quotes = db.get('quotes').value();

  const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
  const totalRevenue = paidOrders.reduce((s, o) => s + o.total, 0);
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o.createdAt.startsWith(today));
  const todayRevenue = todayOrders.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + o.total, 0);

  const statusBreakdown = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    totalOrders: orders.length,
    paidOrders: paidOrders.length,
    totalRevenue,
    todayOrders: todayOrders.length,
    todayRevenue,
    totalProducts: products.filter(p => p.active).length,
    pendingQuotes: quotes.filter(q => q.status === 'new').length,
    statusBreakdown,
    recentOrders: orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10)
  });
});

// All orders
router.get('/orders', adminAuth, (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let orders = db.get('orders').value();
  if (status) orders = orders.filter(o => o.status === status);
  orders = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = orders.length;
  const paginated = orders.slice((page - 1) * limit, page * limit);
  res.json({ orders: paginated, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

// Update order status
router.patch('/orders/:id', adminAuth, (req, res) => {
  const { status, delhiveryWaybill } = req.body;
  const order = db.get('orders').find({ id: req.params.id }).value();
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const updates = { updatedAt: new Date().toISOString() };
  if (status) updates.status = status;
  if (delhiveryWaybill) updates.delhiveryWaybill = delhiveryWaybill;

  db.get('orders').find({ id: req.params.id }).assign(updates).write();
  res.json({ success: true, order: db.get('orders').find({ id: req.params.id }).value() });
});

// All products
router.get('/products', adminAuth, (req, res) => {
  res.json(db.get('products').value());
});

// Update product
router.patch('/products/:id', adminAuth, (req, res) => {
  const { price, mrp, stock, active, description } = req.body;
  const product = db.get('products').find({ id: req.params.id }).value();
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const updates = {};
  if (price !== undefined) updates.price = parseFloat(price);
  if (mrp !== undefined) updates.mrp = parseFloat(mrp);
  if (stock !== undefined) updates.stock = parseInt(stock);
  if (active !== undefined) updates.active = active;
  if (description !== undefined) updates.description = description;

  db.get('products').find({ id: req.params.id }).assign(updates).write();
  res.json({ success: true, product: db.get('products').find({ id: req.params.id }).value() });
});

// Add product
router.post('/products', adminAuth, (req, res) => {
  const { name, h, w, d, price, mrp, stock, description, sku } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price required' });

  const product = {
    id: uuidv4(),
    sku: sku || `CP-${Date.now()}`,
    name, h: parseInt(h) || 0, w: parseInt(w) || 0, d: parseInt(d) || 0,
    price: parseFloat(price), mrp: parseFloat(mrp) || parseFloat(price),
    stock: parseInt(stock) || 0,
    description: description || '',
    active: true,
    createdAt: new Date().toISOString()
  };

  db.get('products').push(product).write();
  res.json({ success: true, product });
});

// All quotes
router.get('/quotes', adminAuth, (req, res) => {
  const quotes = db.get('quotes').value().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(quotes);
});

// Update quote status
router.patch('/quotes/:id', adminAuth, (req, res) => {
  const { status } = req.body;
  db.get('quotes').find({ id: req.params.id }).assign({ status }).write();
  res.json({ success: true });
});

// Settings
router.get('/settings', adminAuth, (req, res) => {
  const settings = db.get('settings').value();
  // Don't expose secrets
  res.json({ ...settings, adminPassword: '***', delhiveryToken: '***' });
});

router.patch('/settings', adminAuth, (req, res) => {
  const { shippingFlat, shippingFreeAbove, phone, email } = req.body;
  const updates = {};
  if (shippingFlat !== undefined) updates.shippingFlat = parseFloat(shippingFlat);
  if (shippingFreeAbove !== undefined) updates.shippingFreeAbove = parseFloat(shippingFreeAbove);
  if (phone) updates.phone = phone;
  if (email) updates.email = email;
  db.get('settings').assign(updates).write();
  res.json({ success: true });
});

module.exports = router;
