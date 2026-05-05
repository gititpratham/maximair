require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(cors({
  origin: ['https://suvidhaair.in', 'https://www.suvidhaair.in', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/payment', require('./routes/payment'));
app.use('/api/products', require('./routes/products'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/delhivery', require('./routes/delhivery'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), service: 'SuvidhaAir Backend' });
});

// Admin dashboard route (secret URL)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});



// Catch-all: serve main site
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ SuvidhaAir server running on port ${PORT}`);
  console.log(`📦 Database: db.json`);
  console.log(`🔐 Admin: /admin (password: 121004)`);
});

// Polling for Order Status Updates (Every 1 hour)
setInterval(async () => {
  const { db } = require('./db/database');
  const axios = require('axios');
  const orders = db.get('orders').value();
  const settings = db.get('settings').value();
  
  // Find active orders that have a waybill but are not yet delivered/cancelled
  const activeOrders = orders.filter(o => 
    (o.status === 'picked_up' || o.status === 'shipped' || o.status === 'processing') && o.delhiveryWaybill
  );

  for (const order of activeOrders) {
    try {
      const url = `https://staging-express.delhivery.com/api/v1/packages/json/?waybill=${order.delhiveryWaybill}`;
      const r = await axios.get(url, {
        headers: {
          'Authorization': `Token ${settings.delhiveryToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (r.data && r.data.ShipmentData && r.data.ShipmentData.length > 0) {
        const status = r.data.ShipmentData[0].Shipment.Status.Status;
        let newStatus = null;

        if (status === 'Delivered') {
          newStatus = 'delivered';
        } else if (['In Transit', 'Dispatched', 'Pending'].includes(status)) {
          newStatus = 'shipped';
        }

        if (newStatus && newStatus !== order.status) {
          db.get('orders').find({ id: order.id }).assign({ 
            status: newStatus, 
            updatedAt: new Date().toISOString() 
          }).write();
          console.log(`[Background Job] Order ${order.id} status updated to ${newStatus} (from Delhivery: ${status})`);
        }
      }
    } catch (e) {
      console.error(`[Background Job] Error polling tracking for ${order.id}:`, e.message);
    }
  }
}, 60 * 60 * 1000); // 1 hour

module.exports = app;
