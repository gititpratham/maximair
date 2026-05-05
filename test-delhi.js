const axios = require('axios');
const fs = require('fs');

const db = JSON.parse(fs.readFileSync('/var/www/suvidhaair.in/db/db.json', 'utf8'));
const token = db.settings.delhiveryToken;

axios.get(`https://track.delhivery.com/c/api/pin-codes/json/`, {
  params: { filter_codes: '110001' },
  headers: {
    'Authorization': `Token ${token}`,
    'Accept': 'application/json'
  }
}).then(r => console.log("SUCCESS:", JSON.stringify(r.data)))
  .catch(e => console.log("ERROR:", e.response ? e.response.status : e.message, e.response ? e.response.data : ''));
