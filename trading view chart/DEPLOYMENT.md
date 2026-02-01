# Deployment Guide

Production deployment guide for the TradingView-like deterministic OHLC chart system.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Production Deployment](#production-deployment)
4. [Cloud Platforms](#cloud-platforms)
5. [Database Setup](#database-setup)
6. [Environment Variables](#environment-variables)
7. [Security Hardening](#security-hardening)
8. [Monitoring & Logging](#monitoring--logging)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Database**: SQLite (dev) or PostgreSQL (production)
- **Reverse Proxy**: nginx or Caddy (production)

### System Requirements

**Minimum:**
- CPU: 1 core
- RAM: 512 MB
- Storage: 1 GB

**Recommended:**
- CPU: 2+ cores
- RAM: 2 GB
- Storage: 10 GB SSD

---

## Local Development

### Setup

```powershell
# Clone or navigate to project
cd "c:\Users\krita\OneDrive\Desktop\trading view chart"

# Install dependencies
cd server
npm install

# Initialize database
npm run migrate

# Start development server
npm start
```

### Development URLs

- Server: http://localhost:3000
- Demo: http://localhost:3000/demo.html
- API: http://localhost:3000/api/ohlc

### Hot Reload (Optional)

Install nodemon:

```powershell
npm install --save-dev nodemon
```

Update `package.json`:

```json
{
  "scripts": {
    "dev": "nodemon src/server.js"
  }
}
```

Run with hot reload:

```powershell
npm run dev
```

---

## Production Deployment

### 1. Prepare Application

**Install production dependencies:**

```bash
cd server
npm install --production
```

**Set NODE_ENV:**

```bash
export NODE_ENV=production
```

**Update server configuration:**

Edit `server/src/server.js`:

```javascript
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
```

### 2. Process Manager (PM2)

Install PM2:

```bash
npm install -g pm2
```

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'ohlc-chart-server',
    script: './src/server.js',
    cwd: './server',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
  }],
};
```

Start with PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 3. Reverse Proxy (nginx)

**Install nginx:**

```bash
# Ubuntu/Debian
sudo apt-get install nginx

# CentOS/RHEL
sudo yum install nginx
```

**Configure nginx** (`/etc/nginx/sites-available/ohlc-chart`):

```nginx
upstream ohlc_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Gzip compression
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1000;

    # API endpoints
    location /api/ {
        proxy_pass http://ohlc_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://ohlc_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Static files
    location / {
        proxy_pass http://ohlc_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Health check
    location /health {
        proxy_pass http://ohlc_backend;
        access_log off;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/ohlc-chart /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. SSL/TLS with Let's Encrypt

Install Certbot:

```bash
sudo apt-get install certbot python3-certbot-nginx
```

Obtain certificate:

```bash
sudo certbot --nginx -d yourdomain.com
```

Auto-renewal (already set up by certbot):

```bash
sudo certbot renew --dry-run
```

---

## Cloud Platforms

### AWS Deployment

#### EC2 + RDS

1. **Launch EC2 instance** (t3.small or larger)
2. **Create RDS PostgreSQL** instance
3. **Security Groups:**
   - Allow 443 (HTTPS)
   - Allow 80 (HTTP redirect)
   - Allow 3000 (internal, from load balancer)
4. **Elastic IP** for static IP
5. **Application Load Balancer** for WebSocket support

**User Data Script:**

```bash
#!/bin/bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
cd /home/ubuntu
# Clone your repository
npm install --production
npm run migrate
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

#### Elastic Beanstalk

Create `.ebextensions/nodecommand.config`:

```yaml
option_settings:
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: "npm start"
    NodeVersion: 18.x
```

Deploy:

```bash
eb init
eb create production-env
eb deploy
```

### Google Cloud Platform

#### App Engine

Create `app.yaml`:

```yaml
runtime: nodejs18
instance_class: F2
env_variables:
  NODE_ENV: 'production'

handlers:
  - url: /.*
    script: auto
    secure: always
```

Deploy:

```bash
gcloud app deploy
```

#### Cloud Run

Build Docker image:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --production
COPY server/ ./
EXPOSE 3000
CMD ["node", "src/server.js"]
```

Deploy:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/ohlc-chart
gcloud run deploy ohlc-chart \
  --image gcr.io/PROJECT_ID/ohlc-chart \
  --platform managed \
  --allow-unauthenticated
```

### DigitalOcean

#### Droplet + Managed Database

1. Create Droplet (Ubuntu 22.04)
2. Create Managed PostgreSQL Database
3. Setup as per [Production Deployment](#production-deployment)
4. Add domain and SSL via DigitalOcean DNS

#### App Platform

Create `app.yaml`:

```yaml
name: ohlc-chart-server
services:
  - name: api
    github:
      repo: your-username/your-repo
      branch: main
      deploy_on_push: true
    source_dir: /server
    run_command: npm start
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xxs
    routes:
      - path: /
    envs:
      - key: NODE_ENV
        value: production
```

Deploy via dashboard or CLI.

### Heroku

Create `Procfile`:

```
web: node server/src/server.js
```

Deploy:

```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:mini
git push heroku main
heroku open
```

---

## Database Setup

### SQLite (Development/Small Production)

**Location:** `server/data/candles.db`

**Backup:**

```bash
sqlite3 server/data/candles.db ".backup 'backup.db'"
```

**Pros:**
- Zero configuration
- File-based
- Fast for single server

**Cons:**
- No concurrent writes
- Single server only
- Limited scalability

### PostgreSQL (Recommended for Production)

**Install:**

```bash
# Ubuntu/Debian
sudo apt-get install postgresql

# macOS
brew install postgresql
```

**Create Database:**

```sql
CREATE DATABASE ohlc_charts;
CREATE USER ohlc_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE ohlc_charts TO ohlc_user;
```

**Update `server/src/db.js`:**

```javascript
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const db = {
  query: (text, params) => pool.query(text, params),
};
```

**Update migration:**

```sql
-- Change AUTOINCREMENT to SERIAL
-- Change BIGINT to BIGINT (same)
-- Change INSERT OR IGNORE to INSERT ON CONFLICT DO NOTHING
```

**Connection String:**

```bash
export DATABASE_URL="postgresql://ohlc_user:password@localhost:5432/ohlc_charts"
```

---

## Environment Variables

Create `.env` file (use `dotenv` package):

```bash
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Security
ADMIN_TOKEN=your-secret-admin-token

# CORS
ALLOWED_ORIGINS=https://yourdomain.com

# Logging
LOG_LEVEL=info
```

Load in `server.js`:

```javascript
import dotenv from 'dotenv';
dotenv.config();
```

**Never commit `.env` to git!**

Add to `.gitignore`:

```
.env
.env.*
!.env.example
```

---

## Security Hardening

### 1. Rate Limiting

Install:

```bash
npm install express-rate-limit
```

Implement:

```javascript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP',
});

app.use('/api/', apiLimiter);
```

### 2. Helmet (Security Headers)

Install:

```bash
npm install helmet
```

Use:

```javascript
import helmet from 'helmet';
app.use(helmet());
```

### 3. CORS Configuration

```javascript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));
```

### 4. Input Sanitization

Already implemented via validation in routes. Ensure:
- Type checking
- Range validation
- SQL parameterized queries

### 5. Admin Endpoints Protection

```javascript
const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.delete('/api/admin/purge', adminAuth, (req, res) => {
  // Purge logic
});
```

### 6. HTTPS Only

```javascript
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}
```

---

## Monitoring & Logging

### Structured Logging with Winston

Install:

```bash
npm install winston
```

Create `logger.js`:

```javascript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
```

### Application Performance Monitoring (APM)

**New Relic:**

```bash
npm install newrelic
```

Create `newrelic.js` and require at top of `server.js`.

**Datadog:**

```bash
npm install dd-trace --save
```

Initialize:

```javascript
import tracer from 'dd-trace';
tracer.init();
```

### Health Checks

Enhanced health endpoint:

```javascript
app.get('/health', async (req, res) => {
  try {
    // Check database
    await db.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});
```

---

## Backup & Recovery

### Database Backups

**PostgreSQL:**

```bash
# Backup
pg_dump -U ohlc_user -h localhost ohlc_charts > backup_$(date +%Y%m%d).sql

# Restore
psql -U ohlc_user -h localhost ohlc_charts < backup_20251109.sql
```

**Automated Backups (cron):**

```bash
# Edit crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /usr/bin/pg_dump -U ohlc_user ohlc_charts > /backups/ohlc_$(date +\%Y\%m\%d).sql
```

### Cloud Backups

**AWS RDS:**
- Automated backups enabled by default
- Point-in-time recovery
- Snapshot retention: 7-35 days

**Google Cloud SQL:**
- Automated daily backups
- On-demand backups
- Point-in-time recovery

---

## Troubleshooting

### High Memory Usage

**Symptom:** Node process consuming >1GB RAM

**Solutions:**
1. Check for memory leaks (use `heapdump`)
2. Limit WebSocket connections
3. Implement connection pooling
4. Increase server RAM

### Database Lock Errors (SQLite)

**Symptom:** `SQLITE_BUSY` errors

**Solutions:**
1. Migrate to PostgreSQL
2. Reduce write concurrency
3. Increase SQLite timeout

### WebSocket Disconnections

**Symptom:** Clients frequently disconnect

**Solutions:**
1. Increase nginx `proxy_read_timeout`
2. Implement heartbeat/ping-pong
3. Check firewall rules
4. Enable WebSocket compression

### Slow API Responses

**Symptom:** `/api/ohlc` takes >2 seconds

**Solutions:**
1. Add database indexes
2. Reduce requested range
3. Implement caching (Redis)
4. Use pagination

### PM2 Process Crashes

**Symptom:** App restarts frequently

**Solutions:**
1. Check logs: `pm2 logs`
2. Fix uncaught exceptions
3. Increase max memory: `max_memory_restart: '500M'`
4. Use `--exp-backoff-restart-delay`

---

## Maintenance

### Update Dependencies

```bash
# Check outdated packages
npm outdated

# Update
npm update

# Security audit
npm audit
npm audit fix
```

### Rotate Logs

**logrotate** configuration (`/etc/logrotate.d/ohlc-chart`):

```
/path/to/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nodejs nodejs
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Database Maintenance

**PostgreSQL VACUUM:**

```bash
# Manual
psql -U ohlc_user -c "VACUUM ANALYZE candles;"

# Automated (cron weekly)
0 3 * * 0 psql -U ohlc_user -c "VACUUM ANALYZE candles;"
```

---

**Last Updated:** November 9, 2025  
**Version:** 1.0.0
