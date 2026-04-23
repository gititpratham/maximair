const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { db, uuidv4 } = require('../db/database');

const getRazorpay = () => new Razorpay({
  key_id: 'rzp_test_SgS6ryaCihEJxn',
  key_secret: 'OCBC4wXd1SvEeQV7QnwzU1Rf'
});

// Create Razorpay order
router.post('/create-order', async (req, res) => {
  try {
    const { productId, qty, name, email, phone, address, pincode, city, state } = req.body;

    if (!productId || !qty || !name || !phone || !address || !pincode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const product = db.get('products').find({ id: productId, active: true }).value();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const quantity = parseInt(qty);
    if (quantity < 1 || quantity > product.stock) {
      return res.status(400).json({ error: 'Invalid quantity or insufficient stock' });
    }

    const subtotal = product.price * quantity;
    const settings = db.get('settings').value();
    const shipping = subtotal >= settings.shippingFreeAbove ? 0 : settings.shippingFlat;
    const total = subtotal + shipping;

    const razorpay = getRazorpay();
    const rzpOrder = await razorpay.orders.create({
      amount: total * 100, // paise
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        product: product.name,
        qty: quantity,
        customer: name,
        phone
      }
    });

    // Store pending order
    const orderId = uuidv4();
    const order = {
      id: orderId,
      rzpOrderId: rzpOrder.id,
      productId,
      productName: product.name,
      productSku: product.sku,
      qty: quantity,
      unitPrice: product.price,
      subtotal,
      shipping,
      total,
      customer: { name, email, phone },
      address: { line: address, pincode, city, state },
      status: 'pending',
      paymentStatus: 'pending',
      rzpPaymentId: null,
      delhiveryWaybill: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.get('orders').push(order).write();

    res.json({
      orderId,
      rzpOrderId: rzpOrder.id,
      amount: total * 100,
      currency: 'INR',
      keyId: 'rzp_test_SgS6ryaCihEJxn',
      productName: product.name,
      total,
      shipping
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
});

// Verify payment & trigger shipping
router.post('/verify-payment', async (req, res) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', 'OCBC4wXd1SvEeQV7QnwzU1Rf')
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const order = db.get('orders').find({ id: orderId }).value();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Update order
    db.get('orders').find({ id: orderId }).assign({
      paymentStatus: 'paid',
      status: 'confirmed',
      rzpPaymentId: razorpay_payment_id,
      updatedAt: new Date().toISOString()
    }).write();

    // Deduct stock
    const product = db.get('products').find({ id: order.productId }).value();
    if (product) {
      db.get('products').find({ id: order.productId }).assign({
        stock: Math.max(0, product.stock - order.qty)
      }).write();
    }

    // Create Delhivery shipment
    try {
      const waybill = await createDelhiveryShipment(order, razorpay_payment_id);
      if (waybill) {
        db.get('orders').find({ id: orderId }).assign({
          delhiveryWaybill: waybill,
          status: 'processing'
        }).write();
      }
    } catch (delErr) {
      console.error('Delhivery error:', delErr.message);
      // Non-fatal: order still confirmed
    }

    const updatedOrder = db.get('orders').find({ id: orderId }).value();
    res.json({
      success: true,
      orderId,
      paymentId: razorpay_payment_id,
      waybill: updatedOrder.delhiveryWaybill,
      message: 'Payment verified successfully'
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Verification failed', details: err.message });
  }
});

async function createDelhiveryShipment(order, paymentId) {
  const axios = require('axios');
  const settings = db.get('settings').value();

  const shipmentData = {
    format: 'open',
    data: JSON.stringify({
      shipments: [{
        name: order.customer.name,
        add: order.address.line,
        pin: order.address.pincode,
        city: order.address.city || 'Unknown',
        state: order.address.state || 'Unknown',
        country: 'India',
        phone: order.customer.phone,
        order: order.id,
        payment_mode: 'Prepaid',
        return_pin: '380001',
        return_city: 'Ahmedabad',
        return_phone: settings.phone.replace(/\s/g, ''),
        return_name: settings.siteName,
        return_add: 'Suvidha Air Engineers, Ahmedabad, Gujarat',
        return_state: 'Gujarat',
        return_country: 'India',
        products_desc: order.productName,
        hsn_code: '84799090',
        cod_amount: '0',
        order_date: new Date().toISOString().split('T')[0],
        total_amount: order.total.toString(),
        seller_add: 'Ahmedabad, Gujarat',
        seller_name: settings.siteName,
        seller_inv: order.id,
        quantity: order.qty.toString(),
        weight: (order.qty * 2.5).toString(), // ~2.5kg per pad
        shipment_width: '30',
        shipment_height: '30',
        shipment_length: '60',
        waybill: '',
        seller_tin: '',
        fragile_shipment: false
      }]
    })
  };

  const resp = await axios.post(
    'https://track.delhivery.com/api/cmu/create.json',
    new URLSearchParams(shipmentData),
    {
      headers: {
        'Authorization': `Token ${settings.delhiveryToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000
    }
  );

  if (resp.data && resp.data.packages && resp.data.packages[0]) {
    return resp.data.packages[0].waybill;
  }
  return null;
}

// Track order
router.get('/track/:orderId', (req, res) => {
  const order = db.get('orders').find({ id: req.params.orderId }).value();
  if (!order) return res.status(404).json({ error: 'Order not found' });

  res.json({
    orderId: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    product: order.productName,
    qty: order.qty,
    total: order.total,
    waybill: order.delhiveryWaybill,
    createdAt: order.createdAt
  });
});

module.exports = router;
