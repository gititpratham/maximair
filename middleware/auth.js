const { db } = require('../db/database');

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  const settings = db.get('settings').value();
  
  if (!token || token !== Buffer.from(settings.adminPassword).toString('base64')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { adminAuth };
