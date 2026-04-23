# Suvidha Air Engineers — Backend Deployment Guide

## What's included

```
suvidhaair/
├── server.js              ← Express app (entry point)
├── package.json
├── ecosystem.config.js    ← PM2 process config
├── nginx.conf             ← Nginx site config
├── db/
│   └── database.js        ← JSON database (lowdb)
├── routes/
│   ├── payment.js         ← Razorpay + Delhivery
│   ├── products.js        ← Product listing + quotes
│   └── admin.js           ← Admin API (password protected)
├── middleware/
│   └── auth.js            ← Admin token auth
└── public/
    ├── index.html         ← Main website
    └── admin/
        └── index.html     ← Admin dashboard (secret)
```

## Credentials configured

| Service    | Key/Token                                        |
|------------|--------------------------------------------------|
| Razorpay   | `rzp_test_SgS6ryaCihEJxn` (test mode)            |
| Delhivery  | `736cedf712c367a6d6b7f04d21e8b9d37604e118`       |
| Admin URL  | `https://suvidhaair.in/admin`                    |
| Admin Pass | `121004`                                          |

## Step-by-step deployment

### 1. Upload files to your server
```bash
scp -r ./suvidhaair/ user@your-server-ip:/var/www/
```

### 2. SSH into your server and install dependencies
```bash
ssh user@your-server-ip
cd /var/www/suvidhaair
npm install
```

### 3. Install PM2 (process manager)
```bash
npm install -g pm2
```

### 4. Start the app with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # Follow the printed command to auto-start on reboot
```

### 5. Set up Nginx
```bash
sudo cp nginx.conf /etc/nginx/sites-available/suvidhaair
sudo ln -s /etc/nginx/sites-available/suvidhaair /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Get free SSL certificate
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d suvidhaair.in -d www.suvidhaair.in
```

## Admin Dashboard

- URL: `https://suvidhaair.in/admin` (not linked anywhere on main site)
- Password: `121004`
- Features: Orders, Products, Bulk Quotes, Revenue stats, Shipping settings

## How payments work

1. Customer fills checkout form → clicks Pay
2. Frontend calls `POST /api/payment/create-order` → backend creates Razorpay order
3. Razorpay checkout opens (UPI, cards, net banking, wallets)
4. On success, frontend calls `POST /api/payment/verify-payment`
5. Backend verifies HMAC signature → marks order paid
6. Backend automatically creates Delhivery shipment
7. Waybill number stored in order record, shown to customer

## Switch to Razorpay Live mode

1. Log in to https://dashboard.razorpay.com
2. Go to Settings → API Keys → Generate Live Key
3. In `routes/payment.js`, replace:
   - `rzp_test_SgS6ryaCihEJxn` → your live key ID
   - `OCBC4wXd1SvEeQV7QnwzU1Rf` → your live key secret

## Database

Data is stored in `db.json` (auto-created on first run). Back it up regularly:
```bash
cp /var/www/suvidhaair/db/db.json /backups/db-$(date +%Y%m%d).json
```

## Useful PM2 commands
```bash
pm2 status           # Check running processes
pm2 logs suvidhaair  # View live logs
pm2 restart suvidhaair
pm2 stop suvidhaair
```
