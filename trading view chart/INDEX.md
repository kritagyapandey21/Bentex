# 📚 Documentation Index

Quick navigation guide for all project documentation.

## 🚀 Getting Started

| Document | Purpose | Time to Read |
|----------|---------|--------------|
| **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** | Complete project overview | 5 min |
| **[QUICKSTART.md](QUICKSTART.md)** | Installation & first run | 3 min |

**Recommended:** Start with PROJECT_SUMMARY.md, then QUICKSTART.md

---

## 📖 Core Documentation

### For Developers

| Document | What's Inside | When to Use |
|----------|---------------|-------------|
| **[README.md](README.md)** | Complete system documentation:<br>• Features & benefits<br>• API reference<br>• How it works<br>• Configuration<br>• Testing<br>• Troubleshooting | Main reference guide |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System design:<br>• Component diagrams<br>• Data flow<br>• Generation algorithm<br>• Design decisions<br>• Scalability | Understanding internals |

### For API Users

| Document | What's Inside | When to Use |
|----------|---------------|-------------|
| **[API.md](API.md)** | Complete API reference:<br>• All endpoints<br>• Request/response formats<br>• WebSocket protocol<br>• Code examples<br>• Error handling | Integrating with the API |

### For DevOps

| Document | What's Inside | When to Use |
|----------|---------------|-------------|
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Production deployment:<br>• Cloud platforms (AWS, GCP, etc.)<br>• Database setup<br>• Security hardening<br>• Monitoring & logging<br>• Backup & recovery | Deploying to production |

---

## 🧪 Testing

| Document | What's Inside | When to Use |
|----------|---------------|-------------|
| **[tests/run_tests.js](tests/run_tests.js)** | 8 automated tests | Verify system works |
| **[tests/manual_test_no_rollback.md](tests/manual_test_no_rollback.md)** | Manual test guide for no-rollback feature | Acceptance testing |

**Run tests:** Double-click `test.bat` or `npm test`

---

## 🔧 Utilities

| File | Purpose | How to Use |
|------|---------|------------|
| **install.bat** | One-click installation | Double-click to install |
| **start.bat** | One-click server start | Double-click to start |
| **test.bat** | One-click test runner | Double-click to test |
| **utils.bat** | Menu with common tasks | Double-click for options |

---

## 📂 Code Organization

### Server-Side

```
server/src/
├── server.js           → Main entry point (Express + WebSocket)
├── db.js               → Database operations (SQLite/Postgres)
├── ws.js               → WebSocket broadcasting
├── migrate.js          → Migration runner
├── shared/
│   ├── rng.js          → Deterministic RNG (xmur3, sfc32, Box-Muller)
│   └── generator.js    → OHLC generation logic
└── routes/
    ├── ohlc.js         → GET /api/ohlc, /api/last_saved
    └── save_candle.js  → POST /api/save_candle
```

### Client-Side

```
server/public/
├── demo.html              → Lightweight Charts demo
├── tradingview-demo.html  → TradingView datafeed demo
├── rng.js                 → Client RNG (identical to server)
└── generator.js           → Client generator (identical to server)
```

### Database

```
server/migrations/
└── 001_create_candles.sql → Database schema

server/data/
└── candles.db             → SQLite database (auto-created)
```

---

## 🎯 Quick Reference by Task

### I want to...

**...get started quickly**
→ Read [QUICKSTART.md](QUICKSTART.md), then double-click `install.bat` and `start.bat`

**...understand the system**
→ Read [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) and [README.md](README.md)

**...integrate with the API**
→ Read [API.md](API.md) for complete endpoint reference

**...see how it works internally**
→ Read [ARCHITECTURE.md](ARCHITECTURE.md) for design details

**...deploy to production**
→ Read [DEPLOYMENT.md](DEPLOYMENT.md) for platform-specific guides

**...change volatility or decimals**
→ See README.md → Configuration section

**...run tests**
→ Double-click `test.bat` or see [tests/run_tests.js](tests/run_tests.js)

**...verify no rollback works**
→ Follow [tests/manual_test_no_rollback.md](tests/manual_test_no_rollback.md)

**...troubleshoot issues**
→ See README.md → Troubleshooting section

**...secure the system**
→ See DEPLOYMENT.md → Security Hardening section

**...scale the system**
→ See ARCHITECTURE.md → Scalability Considerations section

---

## 📋 Checklists

### Pre-Launch Checklist

- [ ] Install dependencies (`install.bat`)
- [ ] Run migrations (`npm run migrate`)
- [ ] Run tests (`test.bat`) — all pass?
- [ ] Test demo (`http://localhost:3000/demo.html`)
- [ ] Verify no-rollback (manual test)
- [ ] Review security settings (DEPLOYMENT.md)

### Production Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure database (PostgreSQL recommended)
- [ ] Set up SSL/TLS (Let's Encrypt)
- [ ] Configure reverse proxy (nginx)
- [ ] Enable rate limiting
- [ ] Set up monitoring & logging
- [ ] Configure automated backups
- [ ] Test health endpoint (`/health`)
- [ ] Load test (expected traffic)
- [ ] Document rollback procedure

---

## 🔍 Finding Information

### By Topic

**Determinism**
- README.md → How It Works → Deterministic Generation
- ARCHITECTURE.md → Deterministic Generation Flow

**Partial Candles**
- README.md → How It Works → Partial Candle (Live)
- ARCHITECTURE.md → Partial Candle Interpolation

**Persistence**
- README.md → How It Works → Idempotent Persistence
- ARCHITECTURE.md → Database Schema

**Real-time Updates**
- API.md → WebSocket API
- README.md → API Reference → WebSocket

**Configuration**
- README.md → Configuration
- QUICKSTART.md → Customization

**Deployment**
- DEPLOYMENT.md (complete guide)
- README.md → Security & Production

**Testing**
- README.md → Testing
- tests/run_tests.js (code)
- tests/manual_test_no_rollback.md (manual)

---

## 📞 Support & Resources

**Documentation Issues?**
- Check this index for the right document
- Use Ctrl+F to search within documents

**Code Issues?**
- Check README.md → Troubleshooting
- Review server console logs
- Check browser console (F12)

**Deployment Issues?**
- See DEPLOYMENT.md → Troubleshooting
- Check platform-specific guides

---

## 📄 Document Metadata

| Document | Size | Last Updated |
|----------|------|--------------|
| PROJECT_SUMMARY.md | ~8 KB | 2025-11-09 |
| QUICKSTART.md | ~3 KB | 2025-11-09 |
| README.md | ~18 KB | 2025-11-09 |
| API.md | ~15 KB | 2025-11-09 |
| ARCHITECTURE.md | ~12 KB | 2025-11-09 |
| DEPLOYMENT.md | ~20 KB | 2025-11-09 |

**Total Documentation:** ~76 KB

---

## 🎓 Learning Path

### Beginner (New to Project)

1. Read **PROJECT_SUMMARY.md** (5 min)
2. Read **QUICKSTART.md** (3 min)
3. Install & run (`install.bat`, `start.bat`)
4. Open demo (`http://localhost:3000/demo.html`)
5. Try saving candles & refreshing

### Intermediate (Integrating API)

1. Review **API.md** (15 min)
2. Read **README.md** → API Reference (10 min)
3. Test endpoints with curl/Postman
4. Build simple client integration
5. Connect to WebSocket

### Advanced (Production Deployment)

1. Read **ARCHITECTURE.md** (20 min)
2. Read **DEPLOYMENT.md** (30 min)
3. Set up PostgreSQL
4. Configure nginx/reverse proxy
5. Enable SSL/TLS
6. Set up monitoring
7. Run load tests

### Expert (System Internals)

1. Read **ARCHITECTURE.md** completely
2. Review source code (`server/src/`)
3. Understand RNG implementation (`shared/rng.js`)
4. Study generator logic (`shared/generator.js`)
5. Modify & extend system

---

**Quick Navigation:**
- [← Back to README](README.md)
- [Get Started →](QUICKSTART.md)

---

**Last Updated:** November 9, 2025  
**Version:** 1.0.0
