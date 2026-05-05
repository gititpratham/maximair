const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../db/database');
const { adminAuth } = require('../middleware/auth');

function getSettings() {
  return db.get('settings').value();
}

function getBase(env) {
  return env === 'production'
    ? 'https://track.delhivery.com'
    : 'https://staging-express.delhivery.com';
}

function delhiveryHeaders(token, contentType = 'application/json') {
  return {
    'Authorization': `Token ${token}`,
    'Content-Type': contentType,
    'Accept': 'application/json'
  };
}

// ── GET /api/delhivery/check-pincode (PUBLIC, for checkout) ───────────────────
router.get('/check-pincode', async (req, res) => {
  const { dest } = req.query;
  if (!dest || dest.length !== 6) return res.json({ serviceable: false, message: 'Invalid Pincode' });
  
  const s = getSettings();
  const env = s.delhiveryEnv || 'staging';
  // Use a hardcoded origin or fetch from DB if available. Defaulting to 380001 (Ahmedabad) as per warehouse logic
  const origin = '380001'; 
  
  try {
    // We use the production track.delhivery.com API for pincode serviceability to avoid test token issues
    const r = await axios.get(`https://track.delhivery.com/c/api/pin-codes/json/`, {
      params: { filter_codes: dest },
      headers: delhiveryHeaders(s.delhiveryToken, undefined),
      timeout: 10000
    });
    // Check delhivery response format
    const isServiceable = r.data && r.data.delivery_codes && r.data.delivery_codes.length > 0;
    res.json({ serviceable: !!isServiceable, message: isServiceable ? 'Pincode is serviceable' : 'Pincode not serviceable' });
  } catch (e) {
    console.error('Checkout Serviceability Check Failed:', e.message);
    res.json({ serviceable: false, message: 'Pincode verification failed' });
  }
});

// All other Delhivery routes are admin-only
router.use(adminAuth);

// Generic error handler
function handleError(res, err, endpoint) {
  const status = err.response?.status || 500;
  const data = err.response?.data || { error: err.message };
  console.error(`❌ Delhivery [${endpoint}] error:`, JSON.stringify(data));
  res.status(status).json(data);
}

// ── GET /api/delhivery/serviceability ─────────────────────────────────────────
router.get('/serviceability', async (req, res) => {
  const { pincode, originPincode, PaymentMode = 'Prepaid', env } = req.query;
  const s = getSettings();
  try {
    const r = await axios.get(`${getBase(env)}/api/dc/fetch/serviceability/pincode`, {
      params: { pincode, originPincode, PaymentMode },
      headers: delhiveryHeaders(s.delhiveryToken, undefined),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'serviceability'); }
});

// ── GET /api/delhivery/tat ────────────────────────────────────────────────────
router.get('/tat', async (req, res) => {
  const { origin, destination, env } = req.query;
  const s = getSettings();
  try {
    const r = await axios.get(`${getBase(env)}/c/api/p/expected-tat`, {
      params: { origin, destination },
      headers: delhiveryHeaders(s.delhiveryToken, undefined),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'tat'); }
});

// ── GET /api/delhivery/waybill ────────────────────────────────────────────────
router.get('/waybill', async (req, res) => {
  const { count = 1, client, env } = req.query;
  const s = getSettings();
  try {
    const r = await axios.get(`${getBase(env)}/api/p/ele/fetch-wbn`, {
      params: { count, client: client || s.delhiveryClientName || 'DEMOC' },
      headers: delhiveryHeaders(s.delhiveryToken, undefined),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'waybill'); }
});

// ── POST /api/delhivery/create ────────────────────────────────────────────────
router.post('/create', async (req, res) => {
  const { payload, env } = req.body; // payload = the shipments object
  const s = getSettings();
  try {
    const formData = new URLSearchParams({
      format: 'json',
      data: JSON.stringify(payload)
    });
    const r = await axios.post(`${getBase(env)}/api/cmu/create.json`, formData.toString(), {
      headers: delhiveryHeaders(s.delhiveryToken, 'application/x-www-form-urlencoded'),
      timeout: 20000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'create'); }
});

// ── POST /api/delhivery/update ────────────────────────────────────────────────
router.post('/update', async (req, res) => {
  const { payload, env } = req.body;
  const s = getSettings();
  try {
    const r = await axios.post(`${getBase(env)}/api/p/edit`, { shipments: [payload] }, {
      headers: delhiveryHeaders(s.delhiveryToken),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'update'); }
});

// ── POST /api/delhivery/cancel ────────────────────────────────────────────────
router.post('/cancel', async (req, res) => {
  const { waybill, env } = req.body;
  const s = getSettings();
  try {
    const r = await axios.post(`${getBase(env)}/api/p/edit`,
      { waybills: [waybill], cancellation: true },
      { headers: delhiveryHeaders(s.delhiveryToken), timeout: 15000 }
    );
    res.json(r.data);
  } catch (e) { handleError(res, e, 'cancel'); }
});

// ── POST /api/delhivery/ewaybill ──────────────────────────────────────────────
router.post('/ewaybill', async (req, res) => {
  const { payload, env } = req.body;
  const s = getSettings();
  try {
    const r = await axios.post(`${getBase(env)}/api/p/edit`, payload, {
      headers: delhiveryHeaders(s.delhiveryToken),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'ewaybill'); }
});

// ── GET /api/delhivery/track ──────────────────────────────────────────────────
router.get('/track', async (req, res) => {
  const { waybill, env } = req.query;
  const s = getSettings();
  try {
    const r = await axios.get(`${getBase(env)}/api/v1/packages/json`, {
      params: { waybill },
      headers: delhiveryHeaders(s.delhiveryToken, undefined),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'track'); }
});

// ── GET /api/delhivery/rates ──────────────────────────────────────────────────
router.get('/rates', async (req, res) => {
  const { md, destination, weight, cod = 0, env } = req.query;
  const s = getSettings();
  try {
    const r = await axios.get(`${getBase(env)}/api/kinko/v1/invoice/charges/`, {
      params: { md, destination, weight, cod },
      headers: delhiveryHeaders(s.delhiveryToken, undefined),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'rates'); }
});

// ── GET /api/delhivery/label ──────────────────────────────────────────────────
router.get('/label', async (req, res) => {
  const { wbn, env } = req.query;
  const s = getSettings();
  try {
    const r = await axios.get(`${getBase(env)}/api/p/packing_slip`, {
      params: { wbn },
      headers: delhiveryHeaders(s.delhiveryToken, undefined),
      responseType: 'arraybuffer',
      timeout: 20000
    });
    const ct = r.headers['content-type'] || 'application/pdf';
    res.set('Content-Type', ct);
    if (ct.includes('pdf')) {
      res.set('Content-Disposition', `attachment; filename="label-${wbn}.pdf"`);
    }
    res.send(r.data);
  } catch (e) { handleError(res, e, 'label'); }
});

// ── POST /api/delhivery/pickup ────────────────────────────────────────────────
router.post('/pickup', async (req, res) => {
  const { payload, env } = req.body;
  const s = getSettings();
  try {
    const r = await axios.post(`${getBase(env)}/api/p/dispatch`, payload, {
      headers: delhiveryHeaders(s.delhiveryToken),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'pickup'); }
});

// ── POST /api/delhivery/ndr ───────────────────────────────────────────────────
router.post('/ndr', async (req, res) => {
  const { payload, env } = req.body;
  const s = getSettings();
  try {
    const r = await axios.post(`${getBase(env)}/api/p/ndr`, payload, {
      headers: delhiveryHeaders(s.delhiveryToken),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'ndr'); }
});

// ── POST /api/delhivery/warehouse/create ──────────────────────────────────────
router.post('/warehouse/create', async (req, res) => {
  const { payload, env } = req.body;
  const s = getSettings();
  try {
    const r = await axios.post(`${getBase(env)}/api/backend/clientwarehouse/create/`, payload, {
      headers: delhiveryHeaders(s.delhiveryToken),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'warehouse/create'); }
});

// ── POST /api/delhivery/warehouse/update ──────────────────────────────────────
router.post('/warehouse/update', async (req, res) => {
  const { payload, env } = req.body;
  const s = getSettings();
  try {
    const r = await axios.post(`${getBase(env)}/api/backend/clientwarehouse/update/`, payload, {
      headers: delhiveryHeaders(s.delhiveryToken),
      timeout: 15000
    });
    res.json(r.data);
  } catch (e) { handleError(res, e, 'warehouse/update'); }
});

// ── GET /api/delhivery/docs ───────────────────────────────────────────────────
router.get('/docs', async (req, res) => {
  const { docType = 'packing_slip', wbn, env } = req.query;
  const s = getSettings();
  try {
    const r = await axios.get(`${getBase(env)}/api/p/${docType}`, {
      params: { wbn },
      headers: delhiveryHeaders(s.delhiveryToken, undefined),
      responseType: 'arraybuffer',
      timeout: 20000
    });
    const ct = r.headers['content-type'] || 'application/pdf';
    res.set('Content-Type', ct);
    if (ct.includes('pdf')) {
      res.set('Content-Disposition', `attachment; filename="${docType}-${wbn}.pdf"`);
    }
    res.send(r.data);
  } catch (e) { handleError(res, e, 'docs'); }
});

// ── GET /api/delhivery/ping ───────────────────────────────────────────────────
// Quick health-check ping
router.get('/ping', async (req, res) => {
  const s = getSettings();
  try {
    const r = await axios.get(`https://track.delhivery.com/c/api/pin-codes/json/`, {
      params: { filter_codes: '110001' },
      headers: delhiveryHeaders(s.delhiveryToken, undefined),
      timeout: 10000
    });
    res.json({ ok: true, data: r.data });
  } catch (e) {
    res.json({ ok: false, error: e.message, status: e.response?.status });
  }
});

// ── GET /api/delhivery/config ─────────────────────────────────────────────────
// Expose safe config (masked token) to the frontend
router.get('/config', (req, res) => {
  const s = getSettings();
  const token = s.delhiveryToken || '';
  res.json({
    tokenMasked: token ? token.slice(0, 8) + '...' + token.slice(-4) : '(not set)',
    env: s.delhiveryEnv || 'staging',
    client: s.delhiveryClientName || 'DEMOC'
  });
});

module.exports = router;
