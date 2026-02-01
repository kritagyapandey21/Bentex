# Tanix - Futuristic Trading Platform

A modern, professional binary options trading platform with a stunning futuristic glassmorphism UI, built with vanilla JavaScript and TailwindCSS.

## 🚀 Features

- **Futuristic UI Design**: Glassmorphism panels with neon accents and smooth animations
- **Real-time Chart Simulation**: Custom canvas-based chart with NN-style price simulation
- **Multiple Asset Types**: Forex, OTC, and Cryptocurrency trading pairs
- **Interactive Trading Panel**: Binary options (CALL/PUT) with customizable amounts and expiration times
- **Tournaments & Promotions**: Gamification features with leaderboards and bonuses
- **Account Management**: Profile settings, security controls, and preferences
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 📁 Project Structure

```
tanix/
├── index.html              # Main HTML file with complete UI markup
├── src/
│   ├── css/
│   │   └── style.css      # Custom styles (glassmorphism, neon effects, animations)
│   └── js/
│       ├── utils.js       # Utility functions (formatting, logging, helpers)
│       ├── chart.js       # Canvas chart rendering and price simulation engine
│       ├── ui.js          # UI interaction helpers and data loading functions
│       └── app.js         # Main application logic and initialization
├── backup/
│   └── khushii-original.html  # Backup of original monolithic file
└── README.md              # This file
```

## 🛠️ Technology Stack

- **HTML5**: Semantic markup with modern web standards
- **CSS3**: Custom properties, glassmorphism, backdrop filters
- **Tailwind CSS v3.x**: Utility-first CSS framework (via CDN)
- **Vanilla JavaScript (ES6+)**: No frameworks, pure JavaScript modules
- **Canvas 2D API**: Custom chart rendering with real-time updates
- **Font Awesome 6.4.0**: Icon library (via CDN)
- **Google Fonts (Inter)**: Modern typography

## 🎨 Design System

### Color Palette
- **Background**: Deep space black (`#05080f`) with radial gradients
- **Neon Accents**: Cyan (`#00e0ff`), Green (`#00ff9c`), Red (`#ff3b3b`), Blue (`#0077ff`)
- **Glass Panels**: Semi-transparent with backdrop blur (`rgba(10, 20, 35, 0.5)`)

### Key Components
- **Glassmorphism Panels**: `.glass-panel` with backdrop-filter blur
- **Neon Buttons**: `.btn-glow` with animated glow effects
- **Interactive Hover States**: `.glow-on-hover` for enhanced feedback
- **Custom Inputs**: `.glass-input` and `.glass-select` with futuristic styling

## 🚦 How to Run

### Local Development
1. Clone or download the project
2. Open `index.html` in a modern web browser (Chrome, Firefox, Safari, Edge)
3. No build process or server required - runs entirely client-side!

### Recommended Browsers
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Developer: exact commands (Windows / PowerShell)
If you want to run the Flask server which serves the SPA during development, here are exact steps that were used and verified in this repository.

1. Ensure you have a recent Python 3.x installed (3.10+ recommended). From project root:
```powershell
# (one-time) create a virtualenv with your Python executable
C:\Path\To\Python\python.exe -m venv .venv

# activate the venv in PowerShell
.venv\Scripts\Activate.ps1

# install dependencies
.venv\Scripts\python.exe -m pip install -r requirements.txt

# start the dev server (foreground)
.venv\Scripts\python.exe app.py
```

2. Verify the server is running and healthy (in a second terminal):
```powershell
# quick TCP check
Test-NetConnection -ComputerName 127.0.0.1 -Port 5000

# lightweight HTTP health check
Invoke-WebRequest -Uri http://127.0.0.1:5000/health -UseBasicParsing
```

3. Notes:
- The app listens by default on `127.0.0.1:5000`.
- Set `TANIX_SECRET_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as environment variables to configure runtime behavior.
- For persistent background runs you can use PowerShell's `Start-Process` and capture the PID, or use a process manager for production deployments.

### Developer helpers (included)

This repo now includes simple PowerShell helpers to simplify local development on Windows:

- `scripts/start.ps1` — activate venv (if present) and run `app.py` in the foreground.
- `scripts/stop.ps1` — attempt to stop any process listening on port 5000.
- `scripts/start-dev.ps1` — create a `.venv` if missing, install dependencies, then start the server.

Example usage (PowerShell):
```powershell
# One-time: create venv & start server (recommended)
./scripts/start-dev.ps1

# Quick start if venv already exists
./scripts/start.ps1

# Stop server (attempts to stop processes listening on port 5000)
./scripts/stop.ps1
```

### Running tests

Tests use `pytest` and the Flask test client. From project root with the venv activated:
```powershell
.venv\Scripts\python.exe -m pytest -q
```

If you need to install test dependencies:
```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

*Note: Requires modern browser with Canvas 2D API and ResizeObserver support*

## 📊 Chart Simulation Engine

The platform includes a sophisticated NN-style price simulation:
- **Mulberry32 PRNG**: Seedable random number generator for reproducibility
- **Geometric Brownian Motion**: Realistic price movement with drift and volatility
- **Mean Reversion**: Prices tend to revert to a mean value
- **Jump Diffusion**: Occasional large price jumps for realistic market behavior
- **Real-time Candles**: Smooth 1-minute candle formation with 1-second ticks
- **50+ OTC Assets**: Stock simulation for AAPL, TSLA, MSFT, GOOGL, and more

## 🔧 Module Breakdown

### utils.js
- Currency formatting (`formatCurrency`)
- Activity logging (`logActivity`, `logError`)
- DOM helpers (`debounce`, `getQueryParam`)
- Cookie management (`setCookie`, `getCookie`)

### chart.js
- Canvas chart initialization with ResizeObserver
- Chart rendering (candlesticks and line chart)
- Price simulation engine (`App.RNG`, `App.Sim`, `App.Chart`)
- SMA indicator support
- Chart type switching (CANDLES/LINE)

### ui.js
- Asset selection and display
- Data loading (Forex, OTC, Crypto, Tournaments, Promotions, History)
- Trading UI updates (potential payout, active trades)
- Chart asset selector population

### app.js
- Navigation system (multi-page SPA behavior)
- Trading panel initialization
- Asset sidebar with collapsible tabs
- Chart controls (timeframe, type, indicators)
- Main application bootstrap

## 🎯 Key Features Explained

### Trading Panel
- Investment amounts: $10, $50, $100, $500 (or custom)
- Expiration times: 1m, 5m, 15m
- Binary options: CALL (bullish) / PUT (bearish)
- Real-time payout calculation based on asset payout percentage

### Chart Controls
- **Timeframes**: 1m, 5m, 15m, 1h, 4h
- **Chart Types**: Candlestick or Line
- **Indicators**: Simple Moving Average (SMA) toggle
- **Asset Selector**: Switch between Forex, OTC, and Crypto pairs

### Navigation
- Trade: Main trading interface with chart and controls
- Account: Personal data, security settings, preferences
- Analytics: Trading statistics and performance metrics
- Market: Promotional offers and bonuses
- Deposit: Payment methods (e-wallets and crypto)
- Settings: Trading preferences and risk management
- Tournaments: Active competitions with prize pools
- Help: FAQ and support resources

## 🔐 Security & Privacy

This is a **demo platform** for educational purposes:
- No real trading occurs
- No actual funds are at risk
- All data is simulated client-side
- No backend or database connections

## 📝 License

This project is for educational and demonstration purposes only.

## 🤝 Contributing

This is a static demo project. For enhancements:
1. Maintain the modular structure
2. Follow the existing naming conventions
3. Preserve the futuristic design aesthetic
4. Test across multiple browsers

## 📧 Support

For questions or issues, refer to the in-app Help page or review the source code documentation.

---

**Built with ❤️ using modern web technologies**
