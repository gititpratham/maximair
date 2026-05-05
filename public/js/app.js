// ── State Management ───────────────────────────────────────────────────────
let state = {
  view: 'products',
  products: [],
  cart: null, // single product purchase for now
  order: null,
  pincodeServiceable: false
};

const COLORS = [
  { name: 'Natural Amber', hex: '#E65100' },
  { name: 'Forest Green', hex: '#2E7D32' },
  { name: 'Arctic Blue', hex: '#0277BD' },
  { name: 'Steel Gray', hex: '#455A64' },
  { name: 'Pure White', hex: '#F5F5F5' }
];

// ── Router ──────────────────────────────────────────────────────────────────
function navigate(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${view}`);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
  }
}

// ── API Calls ────────────────────────────────────────────────────────────────
async function loadProducts() {
  try {
    const resp = await fetch('/api/products');
    state.products = await resp.json();
    renderProducts();
    
    // Auto-checkout if specified in URL
    const params = new URLSearchParams(window.location.search);
    const buyPid = params.get('buy');
    if (buyPid) {
      startCheckout(buyPid);
      // Optional: remove the parameter from URL to prevent loop on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

// ── Rendering ───────────────────────────────────────────────────────────────
function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  
  grid.innerHTML = state.products.map(p => `
    <div class="product-card">
      <div class="product-img">
        ${p.stock < 10 ? `<div class="product-badge">Low Stock</div>` : ''}
        <svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
          <rect x="15" y="20" width="80" height="100" rx="4" fill="${COLORS[0].hex}" opacity=".9"/>
          <g stroke="rgba(0,0,0,.1)" stroke-width=".5">
            <line x1="15" y1="40" x2="95" y2="40"/><line x1="15" y1="60" x2="95" y2="60"/>
            <line x1="15" y1="80" x2="95" y2="80"/><line x1="35" y1="20" x2="35" y2="120"/>
          </g>
          <polygon points="95,20 120,40 120,120 95,120" fill="rgba(0,0,0,.2)"/>
        </svg>
      </div>
      <div class="product-info">
        <div class="product-title">${p.name}</div>
        <p style="font-size:0.875rem; color:#64748b; margin-bottom:1rem">
          Size: ${p.h}×${p.w}×${p.d} mm
        </p>
        <div class="product-price">₹${p.price.toLocaleString()} <span>+ GST</span></div>
        <button class="btn btn-primary btn-block" onclick="startCheckout('${p.id}')">
          Buy Now →
        </button>
      </div>
    </div>
  `).join('');
}

function startCheckout(pid) {
  const product = state.products.find(x => x.id === pid);
  if (!product) return;
  state.cart = { product, qty: 1 };
  updateCheckoutSummary();
  navigate('checkout');
}

function updateCheckoutSummary() {
  if (!state.cart) return;
  const { product, qty } = state.cart;
  const base = product.price * qty;
  const gst = Math.round(base * 0.18);
  const shipping = base >= 2000 ? 0 : 99;
  const total = base + gst + shipping;

  document.getElementById('checkoutItemName').textContent = product.name;
  document.getElementById('checkoutItemPrice').textContent = `₹${product.price.toLocaleString()}`;
  document.getElementById('checkSubtotal').textContent = `₹${base.toLocaleString()}`;
  document.getElementById('checkGst').textContent = `₹${gst.toLocaleString()}`;
  document.getElementById('checkShip').textContent = shipping === 0 ? 'FREE' : `₹${shipping}`;
  document.getElementById('checkTotal').textContent = `₹${total.toLocaleString()}`;
}

// ── Transaction Flow ────────────────────────────────────────────────────────
async function processPayment() {
  const name = document.getElementById('buyName').value.trim();
  const email = document.getElementById('buyEmail').value.trim();
  const phone = document.getElementById('buyPhone').value.trim();
  const address = document.getElementById('buyAddr').value.trim();
  const pincode = document.getElementById('buyPin').value.trim();
  const city = document.getElementById('buyCity').value.trim();
  const stateVal = document.getElementById('buyState').value.trim();

  if (!name || !phone || !address || !pincode) {
    alert('Please fill all required fields');
    return;
  }

  if (!state.pincodeServiceable) {
    alert('The provided PIN Code is not serviceable by our logistics partner. Please provide a different PIN Code.');
    return;
  }

  const payBtn = document.getElementById('payBtn');
  payBtn.disabled = true;
  payBtn.textContent = 'Processing...';

  try {
    const orderResp = await fetch('/api/payment/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: state.cart.product.id,
        qty: state.cart.qty,
        name, email, phone, address, pincode, city, state: stateVal
      })
    });
    
    const orderData = await orderResp.json();
    if (!orderResp.ok) throw new Error(orderData.error);

    const options = {
      key: orderData.keyId,
      amount: orderData.amount,
      currency: 'INR',
      order_id: orderData.rzpOrderId,
      name: 'Suvidha Air Engineers',
      description: `Purchase: ${state.cart.product.name}`,
      prefill: { name, email, contact: phone },
      theme: { color: '#00897B' },
      handler: async function(response) {
        verifyPayment(orderData.orderId, response);
      },
      modal: {
        ondismiss: () => {
          payBtn.disabled = false;
          payBtn.textContent = 'Complete Payment';
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();
  } catch (err) {
    alert('Error: ' + err.message);
    payBtn.disabled = false;
    payBtn.textContent = 'Complete Payment';
  }
}

async function verifyPayment(orderId, rzpResponse) {
  try {
    const resp = await fetch('/api/payment/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        razorpay_order_id: rzpResponse.razorpay_order_id,
        razorpay_payment_id: rzpResponse.razorpay_payment_id,
        razorpay_signature: rzpResponse.razorpay_signature
      })
    });
    
    const result = await resp.json();
    if (result.success) {
      showSuccess(result);
    } else {
      alert('Payment verification failed');
    }
  } catch (err) {
    alert('System error during verification');
  }
}

function showSuccess(data) {
  document.getElementById('successOrderId').textContent = data.orderId;
  document.getElementById('successPaymentId').textContent = data.paymentId;
  document.getElementById('successWaybill').textContent = data.waybill || 'TBD';
  
  const statusEl = document.getElementById('waybillStatus');
  if (data.waybill) {
    statusEl.innerHTML = `
      <div style="color:var(--primary); font-weight:600">✅ Delhivery Shipment Created</div>
      <div style="font-size:0.75rem; color:var(--text-light)">Label generated automatically</div>
    `;
  } else {
    statusEl.innerHTML = `
      <div style="color:var(--accent); font-weight:600">📦 Preparing for Shipment</div>
      <div style="font-size:0.75rem; color:var(--text-light)">Our team will update your tracking number shortly via SMS.</div>
    `;
  }
  
  navigate('success');
}

// ── Serviceability Check ────────────────────────────────────────────────────
async function verifyPincode() {
  const pinInput = document.getElementById('buyPin').value.trim();
  const statusEl = document.getElementById('pinStatus');
  
  if (pinInput.length !== 6) {
    statusEl.textContent = '';
    state.pincodeServiceable = false;
    return;
  }

  statusEl.textContent = '⏳ Verifying...';
  statusEl.style.color = '#eab308'; // yellow
  
  try {
    const r = await fetch('/api/delhivery/check-pincode?dest=' + pinInput);
    const data = await r.json();
    if (data.serviceable) {
      statusEl.textContent = '✅ Delivery Available';
      statusEl.style.color = '#22c55e'; // green
      state.pincodeServiceable = true;
    } else {
      statusEl.textContent = '❌ Not Serviceable';
      statusEl.style.color = '#ef4444'; // red
      state.pincodeServiceable = false;
    }
  } catch (e) {
    statusEl.textContent = '⚠️ Check Failed';
    statusEl.style.color = '#ef4444';
    state.pincodeServiceable = false;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadProducts();
});
