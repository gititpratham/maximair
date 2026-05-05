const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);

// Set defaults
db.defaults({
  orders: [],
  products: [
    {
      id: 'prod_1',
      sku: 'CP-060060030',
      name: 'CelPad 600×600×30',
      h: 600, w: 600, d: 30,
      price: 349,
      mrp: 499,
      stock: 150,
      description: 'Standard evaporative cooling pad for home and light commercial use.',
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prod_2',
      sku: 'CP-060060050',
      name: 'CelPad 600×600×50',
      h: 600, w: 600, d: 50,
      price: 449,
      mrp: 649,
      stock: 120,
      description: 'Mid-range pad with enhanced cooling depth for better performance.',
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prod_3',
      sku: 'CP-060090050',
      name: 'CelPad 600×900×50',
      h: 600, w: 900, d: 50,
      price: 599,
      mrp: 849,
      stock: 80,
      description: 'Wider pad for larger cooler units and commercial applications.',
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prod_4',
      sku: 'CP-090090100',
      name: 'CelPad 900×900×100',
      h: 900, w: 900, d: 100,
      price: 1299,
      mrp: 1799,
      stock: 50,
      description: 'Heavy-duty industrial pad for large commercial cooling systems.',
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prod_5',
      sku: 'CP-120090100',
      name: 'CelPad 1200×900×100',
      h: 1200, w: 900, d: 100,
      price: 1649,
      mrp: 2299,
      stock: 30,
      description: 'Extra-large industrial pad for factory and warehouse cooling.',
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prod_6',
      sku: 'CP-150090150',
      name: 'CelPad 1500×900×150',
      h: 1500, w: 900, d: 150,
      price: 2199,
      mrp: 2999,
      stock: 20,
      description: 'Premium XXL pad for maximum cooling in large industrial facilities.',
      active: true,
      createdAt: new Date().toISOString()
    }
  ],
  quotes: [],
  settings: {
    siteName: 'Suvidha Air Engineers',
    adminPassword: '121004',
    shippingFlat: 99,
    shippingFreeAbove: 2000,
    razorpayKeyId: 'rzp_test_SgS6ryaCihEJxn',
    delhiveryToken: '736cedf712c367a6d6b7f04d21e8b9d37604e118',
    delhiveryEnv: 'staging',
    delhiveryClientName: 'DEMOC',
    phone: '+91 98251 41727',
    email: 'info@suvidhaair.in'
  }
}).write();

module.exports = { db, uuidv4 };
