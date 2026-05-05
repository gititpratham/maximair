const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { db, uuidv4 } = require('../db/database');

const getRazorpay = () => {
  const settings = db.get('settings').value();
  return new Razorpay({
    key_id: settings.razorpayKeyId || 'rzp_test_SgS6ryaCihEJxn',
    key_secret: settings.razorpayKeySecret || 'OCBC4wXd1SvEeQV7QnwzU1Rf'
  });
};

// Helper to generate random Order ID
function generateShortId() {
  const hash = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SAE-${hash}`;
}



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
    if (quantity < 1) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    const subtotal = product.price * quantity;
    const settings = db.get('settings').value();
    
    // Use dynamic shipping if provided by frontend, else fallback
    const shipping = req.body.shippingCost !== undefined ? req.body.shippingCost : (subtotal >= settings.shippingFreeAbove ? 0 : settings.shippingFlat);
    
    // Total calculation: (Subtotal + Shipping) + 18% GST
    const totalWithShipping = subtotal + shipping;
    const totalWithGst = Math.round(totalWithShipping * 1.18);

    const razorpay = getRazorpay();
    const rzpOrder = await razorpay.orders.create({
      amount: totalWithGst * 100, // in paise
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        product: product.name,
        qty: quantity,
        customer: name,
        phone
      }
    });

    // Store pending order with RANDOM SAE ID
    const orderId = generateShortId();
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
      total: totalWithGst,
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

    console.log(`✅ Order ${orderId} created for amount ${order.total}`);

    res.json({
      orderId,
      rzpOrderId: rzpOrder.id,
      amount: order.total * 100,
      currency: 'INR',
      keyId: settings.razorpayKeyId,
      productName: product.name,
      total: order.total,
      shipping
    });
  } catch (err) {
    console.error('❌ Create order error:', err);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
});

// Verify payment & trigger shipping
router.post('/verify-payment', async (req, res) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const settings = db.get('settings').value();
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', settings.razorpayKeySecret || 'OCBC4wXd1SvEeQV7QnwzU1Rf')
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('❌ Payment signature mismatch');
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
    if (product && product.stock !== undefined) {
      db.get('products').find({ id: order.productId }).assign({
        stock: Math.max(0, product.stock - order.qty)
      }).write();
    }

    // Create Delhivery shipment
    let waybill = null;
    try {
      waybill = await createDelhiveryShipment(order, razorpay_payment_id);
      if (waybill) {
        db.get('orders').find({ id: orderId }).assign({
          delhiveryWaybill: waybill,
          status: 'processing'
        }).write();
      }
    } catch (delErr) {
      console.error('Delhivery shipment process failed:', delErr.message);
    }

    res.json({
      success: true,
      orderId,
      paymentId: razorpay_payment_id,
      trackingUrl: waybill ? `https://staging-express.delhivery.com/api/v1/packages/json/?waybill=${waybill}&ref_ids=${orderId}` : null,
      message: waybill 
        ? 'Payment verified and shipment created!' 
        : 'Payment verified. Shipping will be processed manually.'
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Verification failed', details: err.message });
  }
});

async function createDelhiveryShipment(order, paymentId) {
  const axios = require('axios');
  const settings = db.get('settings').value();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const orderDate = tomorrow.toISOString().split('T')[0];

  const shipmentData = {
    shipments: [{
      name: order.customer.name,
      add: order.address.line,
      pin: order.address.pincode,
      city: order.address.city || 'Unknown',
      state: order.address.state || 'Unknown',
      country: 'India',
      phone: order.customer.phone.replace(/\D/g, '').slice(-10),
      order: order.id,
      payment_mode: 'Prepaid',
      return_pin: '384445',
      return_city: 'Kadi',
      return_phone: settings.phone.replace(/\s/g, ''),
      return_name: settings.siteName,
      return_add: 'Suvidha Air Engineers, Kadi, Gujarat',
      return_state: 'Gujarat',
      return_country: 'India',
      products_desc: order.productName,
      hsn_code: '84799090',
      cod_amount: '0',
      order_date: orderDate,
      total_amount: order.total.toString(),
      seller_add: 'Kadi, Gujarat',
      seller_name: settings.siteName,
      seller_inv: order.id,
      quantity: order.qty.toString(),
      weight: (order.qty * 500).toString(), // 500gms per unit
      shipment_width: '30',
      shipment_height: '30',
      shipment_length: '60',
      waybill: '', // Delhivery will assign automatically
      shipping_mode: 'Surface'
    }],
    pickup_location: {
      name: 'Morva'
    }
  };

  try {
    console.log(`🚚 Creating Delhivery shipment for order ${order.id}...`);
    const resp = await axios.post(
      'https://staging-express.delhivery.com/api/cmu/create.json',
      `format=json&data=${encodeURIComponent(JSON.stringify(shipmentData))}`,
      {
        headers: {
          'Authorization': `Token ${settings.delhiveryToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('Delhivery creation response:', JSON.stringify(resp.data));

    if (resp.data && resp.data.packages && resp.data.packages.length > 0) {
      const pkg = resp.data.packages[0];
      if (pkg.status === "Success" || pkg.waybill) {
        const finalWaybill = pkg.waybill;
        console.log(`✅ Delhivery shipment confirmed with waybill: ${finalWaybill}`);
        return finalWaybill;
      } else {
        console.error('❌ Delhivery shipment creation rejected:', pkg.remarks);
        return null;
      }
    }
    
    console.error('❌ Delhivery shipment creation failed:', resp.data);
    return null;
  } catch (err) {
    console.error('❌ Delhivery Creation API error:', err.response ? JSON.stringify(err.response.data) : err.message);
    return null;
  }
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