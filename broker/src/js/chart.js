/**
 * ========================================
 * CHART.JS - Chart Engine & Simulation
 * ========================================
 * Canvas-based chart rendering and NN-style price simulation.
 */

// Global variables for the NEW Custom Canvas Chart
let canvas = null;
let ctx = null;
let chartData = []; // This will hold our {time, open, high, low, close} objects
let chartSimulationInterval = null; // Holds the setInterval for the "always working" chart (legacy, may be unused)
let candleWidth = 6; // Width of one candle
let candleSpacing = 3; // Space between candles
let priceMin = 0; // Lowest price visible on chart
let priceMax = 0; // Highest price visible on chart
let currentPrice = 1.08500; // The price for the asset
let assetStartPrice = 1.08500; // The base price of the current asset
let MAX_CANDLES_ON_SCREEN = 150; // Max candles to draw (will be auto-calculated)
let chartInitialized = false; // Flag to prevent multiple chart inits
let globalResizeObserver = null; // The observer to watch the container

// Backend chart streaming client
const ChartStreamClient = {
    pollingTimer: null,
    currentAssetId: null,
    timeframe: '1m',
    points: 180,
    minPollMs: 5000,

    async fetchSnapshot(assetId, timeframe, points) {
        if (!assetId) return null;
        try {
            const params = new URLSearchParams({
                asset: assetId,
                timeframe: timeframe || this.timeframe || '1m',
                points: String(points || this.points),
            });
            const data = await fetchJson(`/api/chart?${params.toString()}`);
            return data.chart;
        } catch (err) {
            logError(`Failed to fetch chart data: ${err.message}`);
            return null;
        }
    },

    async load(assetId, timeframe) {
        if (!assetId) return;
        this.currentAssetId = assetId;
        if (timeframe) this.timeframe = timeframe;
        const snapshot = await this.fetchSnapshot(assetId, this.timeframe, this.points);
        if (!snapshot || !snapshot.candles) return;
        App.Chart.ingestServerSnapshot(snapshot);
        const intervalSeconds = snapshot.interval_seconds || 60;
        const pollMs = Math.max(intervalSeconds * 1000, this.minPollMs);
        this.schedule(pollMs);
    },

    async poll() {
        if (!this.currentAssetId) return;
        const snapshot = await this.fetchSnapshot(this.currentAssetId, this.timeframe, this.points);
        if (!snapshot || !snapshot.candles) return;
        App.Chart.ingestServerSnapshot(snapshot);
    },

    schedule(intervalMs) {
        this.stop();
        this.pollingTimer = setInterval(() => this.poll(), intervalMs);
    },

    stop() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    },

    setTimeframe(nextTimeframe) {
        if (!nextTimeframe || this.timeframe === nextTimeframe) return;
        this.timeframe = nextTimeframe;
        if (this.currentAssetId) {
            this.load(this.currentAssetId, this.timeframe);
        }
    }
};

// Expose chart stream client globally for other modules
window.ChartStreamClient = ChartStreamClient;

// Candle formation (smoother, 1-minute per candle)
let formingCandle = null;                // Current candle being formed (open/high/low/close/time)
let formingStartTime = 0;                // Timestamp when current candle started forming
let formingTickIntervalMs = 1000;       // How often to update the forming candle (1s ticks)
let formingTimer = null;                 // Interval timer for forming ticks
const CANDLE_FORMATION_MS = 60 * 1000;   // 1 minute per candle

/**
 * !! CHART FIX !!
 * Initializes the ResizeObserver for the chart.
 * The chart creation is *deferred* until the observer fires
 * with a valid container size.
 */
function initCanvasChartObserver() {
    logActivity('Initializing chart observer...');
    const chartContainer = document.getElementById('tv-chart-container');
    if (!chartContainer) {
        logError('Chart container not found!');
        return;
    }

    // If NN-style chart engine is active with #price-chart, skip legacy observer to avoid conflicts
    if (window.App && App.Chart && document.getElementById('price-chart')) {
        logActivity('NN chart detected; skipping legacy canvas observer.');
        return;
    }

    // Create a ResizeObserver to watch the container
    globalResizeObserver = new ResizeObserver(entries => {
        if (!entries || entries.length === 0) return;

        const { width, height } = entries[0].contentRect;

        // Only proceed if the container has valid dimensions
        if (width === 0 || height === 0) {
            logActivity('Chart container size is 0, waiting for layout...');
            return;
        }

        // If the chart hasn't been created yet, create it NOW.
        if (!chartInitialized) {
            logActivity(`Container has size ${width}x${height}. Creating chart...`);
            createCanvasChartInstance(chartContainer, width, height);
            chartInitialized = true;
        } 
        // If chart *is* created, just update its size on subsequent resizes.
        else {
            resizeCanvas();
            drawChart();
        }
    });

    // Start observing the container.
    globalResizeObserver.observe(chartContainer);
}

/**
 * !! CHART FIX !!
 * NEW FUNCTION: createCanvasChartInstance
 * This function holds all the logic to create the chart.
 * It's called by the ResizeObserver *only once* when a valid size is detected.
 */
function createCanvasChartInstance(container, width, height) {
    logActivity('Creating Canvas Chart Instance...');
    
    // 1. Prefer an existing static canvas (from nn.html) with id 'price-chart'
    const existingPriceCanvas = document.getElementById('price-chart');
    if (existingPriceCanvas) {
        canvas = existingPriceCanvas;
        // ensure canvas fills the container
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        // If canvas is not yet appended to container, append it
        if (canvas.parentElement !== container) container.appendChild(canvas);
        ctx = canvas.getContext('2d');
    } else {
        // Fallback: create a dynamic canvas (legacy behavior)
        canvas = document.createElement('canvas');
        canvas.id = 'tradingCanvas';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        container.appendChild(canvas);
        ctx = canvas.getContext('2d');
    }

    // 2. Set Canvas Size
    setCanvasSize(width, height); 

    // 3. Generate initial data
    chartData = generateInitialCanvasData(MAX_CANDLES_ON_SCREEN, assetStartPrice);
    
    // 4. Draw the first frame
    drawChart();
    
    // 5. Start the simulation
    startCanvasSimulation();
    
    // 6. Add resize listener to redraw chart
    window.addEventListener('resize', debounce(resizeAndRedraw, 250));
}

/**
 * Helper function to set the canvas size and scaling for High-DPI screens.
 */
function setCanvasSize(width, height) {
    if (!canvas || !ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    ctx.scale(dpr, dpr);

    // Recalculate max candles
    const barWidth = candleWidth + candleSpacing;
    MAX_CANDLES_ON_SCREEN = Math.floor(width / barWidth);
}

/**
 * Debounced function to resize and redraw the chart.
 */
function resizeAndRedraw() {
    logActivity('Resizing and redrawing canvas chart...');
    const container = document.getElementById('tv-chart-container');
    if(!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        setCanvasSize(rect.width, rect.height);
        // Re-generate data for new screen size and redraw
        chartData = generateInitialCanvasData(MAX_CANDLES_ON_SCREEN, currentPrice);
        drawChart();
    }
}

function resizeCanvas() {
    const container = document.getElementById('tv-chart-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        setCanvasSize(rect.width, rect.height);
    }
}

/**
 * Generates an array of initial OHLC data for the custom chart.
 */
function generateInitialCanvasData(count, startPrice) {
    logActivity(`Generating ${count} initial canvas candles...`);
    const data = [];
    let lastClose = startPrice;
    let currentTime = Math.floor(new Date().getTime() / 1000) - (count * 60); // 'count' minutes ago

    for (let i = 0; i < count; i++) {
        const open = lastClose;
        // Make price movement proportional to price but much smaller for smoother history
        const volatility = Math.max(0.00005, open * 0.0002);
        const close = open + (Math.random() - 0.5) * volatility;
        const high = Math.max(open, close) + Math.random() * (volatility * 0.3);
        const low = Math.min(open, close) - Math.random() * (volatility * 0.3);
        
        const candle = {
            time: currentTime,
            open: open,
            high: high,
            low: low,
            close: close,
        };
        data.push(candle);
        lastClose = close;
        currentTime += 60; // Increment by 1 minute
    }
    
    currentPrice = lastClose; // Set global current price
    return data;
}

/**
 * Starts the "always working" simulation for the custom canvas chart.
 */
function startCanvasSimulation() {
    logActivity('Starting canvas chart simulation (smooth 1-min candles)...');

    // clear any existing timers
    if (chartSimulationInterval) {
        clearInterval(chartSimulationInterval);
        chartSimulationInterval = null;
    }
    if (formingTimer) {
        clearInterval(formingTimer);
        formingTimer = null;
    }

    // Ensure we have historical data to base the new candle on
    if (!chartData || chartData.length === 0) {
        chartData = generateInitialCanvasData(MAX_CANDLES_ON_SCREEN, assetStartPrice);
    }

    // Initialize the first forming candle (open at last close)
    const lastCandle = chartData[chartData.length - 1];
    const openPrice = lastCandle ? lastCandle.close : currentPrice;
    currentPrice = openPrice;
    formingCandle = { time: (lastCandle ? lastCandle.time + 60 : Math.floor(Date.now() / 1000)), open: openPrice, high: openPrice, low: openPrice, close: openPrice };
    formingStartTime = Date.now();

    // Tick every second (smooth micro-steps) and build a 1-minute candle
    formingTimer = setInterval(() => {
        // Use App.RNG if available for smoother normal-distributed steps
        const rndNormal = (window.App && App.RNG && typeof App.RNG.randomNormal === 'function') ? App.RNG.randomNormal() : (function(){ let u=0,v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random(); return Math.sqrt(-2.0*Math.log(u))*Math.cos(2*Math.PI*v); })();

        // small volatility per tick (proportional but much smaller than before)
        const volPerTick = Math.max(0.00002, (formingCandle.close || currentPrice) * 0.00003);

        // gentle mean reversion towards assetStartPrice to avoid sudden large drifts
        const meanReversionStrength = 0.00005;

        // compute step and apply slight damping for smoothness
        let step = rndNormal * volPerTick;
        // apply mean reversion
        step += (assetStartPrice - currentPrice) * meanReversionStrength;
        // damping
        step *= 0.85;

        currentPrice = Math.max(0.00001, currentPrice + step);

        // update forming candle
        formingCandle.close = currentPrice;
        formingCandle.high = Math.max(formingCandle.high, currentPrice);
        formingCandle.low = Math.min(formingCandle.low, currentPrice);

        // redraw to show in-progress candle
        drawChart();

        // if formation complete, finalize candle and start a new one
        const elapsed = Date.now() - formingStartTime;
        if (elapsed >= CANDLE_FORMATION_MS) {
            // finalize time to the next minute tick
            formingCandle.time = (lastCandle ? lastCandle.time + 60 : Math.floor(Date.now() / 1000));
            chartData.push({ ...formingCandle });
            while (chartData.length > MAX_CANDLES_ON_SCREEN) chartData.shift();

            // prepare next candle
            const newOpen = formingCandle.close;
            formingCandle = { time: formingCandle.time + 60, open: newOpen, high: newOpen, low: newOpen, close: newOpen };
            formingStartTime = Date.now();
            // keep currentPrice aligned
            currentPrice = newOpen;
        }

    }, formingTickIntervalMs);
}

/**
 * The main drawing function. Clears and redraws the entire chart.
 */
function drawChart() {
    if (!ctx || !canvas) return;

    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;

    // 1. Clear canvas with dark background
    ctx.fillStyle = 'var(--bg-dark-primary)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Combine existing data with the forming candle if present for display
    const combinedData = chartData.slice();
    if (formingCandle) combinedData.push(formingCandle);

    if (combinedData.length === 0) return;

    // 3. Find min/max price in the visible data
    priceMin = Math.min(...combinedData.map(c => c.low));
    priceMax = Math.max(...combinedData.map(c => c.high));

    // Add some padding to the price range
    let priceRange = priceMax - priceMin;
    if (priceRange === 0) priceRange = priceMax * 0.01 || 1; // avoid zero range
    const padding = priceRange * 0.08; // 8% padding for nicer visuals
    priceMin -= padding;
    priceMax += padding;
    const finalRange = priceMax - priceMin;

    // 4. Determine visible data based on MAX_CANDLES_ON_SCREEN
    const startIndex = Math.max(0, combinedData.length - MAX_CANDLES_ON_SCREEN);
    const visibleData = combinedData.slice(startIndex);

    // 5. Loop and draw each candle (visibleData)
    visibleData.forEach((candle, idx) => {
        const x = idx * (candleWidth + candleSpacing);
        drawSingleCandle(candle, x, finalRange, canvasHeight);
    });

    // 6. Draw price line and label using currentPrice (which follows formingCandle if present)
    drawPriceLine(finalRange, canvasHeight);
}

/**
 * Draws a single candle on the canvas.
 */
function drawSingleCandle(candle, x, priceRange, canvasHeight) {
    const { open, high, low, close } = candle;

    // Helper to convert price to Y-coordinate
    const getY = (price) => {
        if (priceRange === 0) return canvasHeight / 2;
        return canvasHeight - ((price - priceMin) / priceRange) * canvasHeight;
    };

    const color = close >= open ? 'var(--neon-green)' : 'var(--neon-red)';
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    // Draw Wick (High/Low)
    const highY = getY(high);
    const lowY = getY(low);
    ctx.beginPath();
    ctx.moveTo(x + candleWidth / 2, highY);
    ctx.lineTo(x + candleWidth / 2, lowY);
    ctx.stroke();

    // Draw Body (Open/Close)
    const openY = getY(open);
    const closeY = getY(close);
    const bodyHeight = Math.abs(openY - closeY);
    // Ensure minimum 1px body height so it's visible
    ctx.fillRect(x, Math.min(openY, closeY), candleWidth, bodyHeight < 1 ? 1 : bodyHeight);
}

/**
 * Draws the horizontal price line and its label.
 */
function drawPriceLine(priceRange, canvasHeight) {
    const canvasWidth = canvas.clientWidth;

    const getY = (price) => {
        if (priceRange === 0) return canvasHeight / 2;
        return canvasHeight - ((price - priceMin) / priceRange) * canvasHeight;
    };
    
    const currentPriceY = getY(currentPrice);

    // Draw Dashed Line
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'var(--neon-cyan)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, currentPriceY);
    ctx.lineTo(canvasWidth - 60, currentPriceY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Price Label Background
    ctx.fillStyle = 'var(--neon-cyan)';
    ctx.fillRect(canvasWidth - 60, currentPriceY - 10, 60, 20);

    // Draw Price Label Text
    ctx.fillStyle = 'var(--bg-dark-primary)';
    ctx.font = 'bold 12px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentPrice.toFixed(5), canvasWidth - 30, currentPriceY);
}

// -----------------------------------------------------------------
// Lightweight NN-style simulation & chart engine (isolated under App)
// -----------------------------------------------------------------
const App = window.App || {};
// Ensure global reference is available for other modules
window.App = App;

// Seedable PRNG (Mulberry32)
App.RNG = {
    seed: 0,
    _state: 0,
    init(seedString) {
        let hash = 0;
        seedString = seedString || Date.now().toString();
        for (let i = 0; i < seedString.length; i++) {
            hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
        }
        this.seed = hash;
        this._state = this.seed;
    },
    random() {
        let t = this._state += 0x6d2b79f5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    },
    randomNormal() {
        let u = 0, v = 0;
        while (u === 0) u = this.random();
        while (v === 0) v = this.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
};

// Simulation engine
App.Sim = {
    ASSET_CONFIGS: (function(){
        const base = [
            { id: 'OTC-USD', name: 'OTC-USD', vol: 0.0001, drift: 0.000001, mean: 100.0, jump: 0.005, price: 100.0, data: [], history: [] },
            { id: 'OTC-EUR', name: 'OTC-EUR', vol: 0.0002, drift: 0.000002, mean: 100.0, jump: 0.01, price: 100.0, data: [], history: [] },
            { id: 'OTC-GOLD', name: 'OTC-GOLD', vol: 0.00008, drift: 0.0000005, mean: 100.0, jump: 0.002, price: 100.0, data: [], history: [] }
        ];
        const tickers = [
            'AAPL','TSLA','MSFT','AMZN','GOOGL','META','NVDA','NFLX','AMD','INTC','PYPL','ADBE','CRM','DIS','NKE','SBUX','BA','COIN','UBER','ZM','PFE','JPM','WMT','MCD','SPOT',
            'BABA','ORCL','TSM','T','VZ','V','MA','BRKB','BAC','CSCO','ABNB','SHOP','SQ','PLTR','SNAP','ROKU','UBER','LYFT','TWTR','BIDU','JD','IQ'
        ];
        const make = (t)=>({ id: `OTC-${t}`, name: `OTC-${t}`, vol: 0.00015, drift: 0.000001, mean: 100.0, jump: 0.006, price: 100.0, data: [], history: [] });
        return base.concat(tickers.map(make));
    })(),
    currentAssetId: 'OTC-AAPL',
    historyLength: 300,
    barIntervalMs: 60000,  // 1 minute = 60,000ms (changed from 3000ms)
    tickIntervalMs: 1000,   // Update every 1 second for smooth movement (changed from 200ms)
    volFactor: 0.6,
    simTimer: null,
    currentBar: {},

    init() {
        if (App.Chart && App.Chart.useServerFeed) {
            // Don't stop simulation completely - we need local animation between server updates
            // Just don't override server data
            logActivity('Server feed enabled, simulation will blend with server data');
        }
        App.RNG.init();
        this.ASSET_CONFIGS.forEach(asset => {
            asset.price = 100.0;
            asset.data = [];
            asset.history = [];
            // warmup history
            for (let i = 0; i < this.historyLength * 5; i++) {
                this._priceStep(asset, this.tickIntervalMs / this.barIntervalMs);
            }
            // build bars - ensure we have enough initial candles
            const minInitialBars = Math.min(this.historyLength, 150); // At least 150 candles
            for (let i = 0; i < minInitialBars; i++) {
                const prices = asset.history.slice(i * 5, (i + 1) * 5).map(p => p.price);
                if (prices.length > 0) {
                    const bar = this._createBar(asset.history[i * 5].time, prices);
                    asset.data.push(bar);
                }
            }
        });

        this._startNewBar();
        this.currentBar.time = Date.now();

        if (this.simTimer) clearInterval(this.simTimer);
        this.simTimer = setInterval(() => this.tick(), this.tickIntervalMs);
        
        // Add watchdog to restart simulation if it gets stuck
        this._lastTickTime = Date.now();
        if (this.watchdogTimer) clearInterval(this.watchdogTimer);
        this.watchdogTimer = setInterval(() => this._checkStuck(), 10000); // Check every 10 seconds
    },
    
    _checkStuck() {
        const now = Date.now();
        const timeSinceLastTick = now - (this._lastTickTime || now);
        
        // If no tick in 5 seconds, restart simulation
        if (timeSinceLastTick > 5000) {
            logError('Chart simulation appears stuck, restarting...');
            if (this.simTimer) clearInterval(this.simTimer);
            this.simTimer = setInterval(() => this.tick(), this.tickIntervalMs);
            this._lastTickTime = now;
        }
    },

    getAsset(id) { return this.ASSET_CONFIGS.find(a => a.id === id); },

    changeAsset(newAssetId) {
        this.currentAssetId = newAssetId;
        if (App.Chart && App.Chart.useServerFeed) {
            ChartStreamClient.load(newAssetId, ChartStreamClient.timeframe);
            return;
        }
        const currentAsset = this.getAsset(newAssetId);
        this.currentBar.open = currentAsset.price;
        this.currentBar.high = currentAsset.price;
        this.currentBar.low = currentAsset.price;
        this.currentBar.close = currentAsset.price;
        App.Chart.renderChart(currentAsset.data, currentAsset.price);
    },

    _priceStep(asset, dt = 1) {
        const volFactor = this.volFactor || 1.0;
        const dW = App.RNG.randomNormal() * Math.sqrt(dt);
        const gbmChange = asset.price * (asset.drift * dt + asset.vol * volFactor * dW);
        const meanReversion = 0.01 * (asset.mean - asset.price) * dt;
        let jump = 0;
        if (App.RNG.random() < 0.001 * dt) jump = App.RNG.randomNormal() * asset.jump * volFactor;
        asset.price += gbmChange + meanReversion + jump;
        asset.price = Math.max(0.0001, asset.price);
        asset.history.push({ time: Date.now(), price: asset.price });
        if (asset.history.length > this.historyLength * 5 + 20) asset.history.shift();
        return asset.price;
    },

    _createBar(time, prices) {
        if (prices.length === 0) return { open: 0, high: 0, low: 0, close: 0, time: time, volume: 0 };
        return { time: time, open: prices[0], close: prices.at(-1), high: Math.max(...prices), low: Math.min(...prices), volume: prices.length };
    },

    _startNewBar() {
        const currentAsset = this.getAsset(this.currentAssetId);
        if (!currentAsset) {
            logError('Asset not found in _startNewBar');
            return;
        }
        // New candle opens at the last candle's closing price
        const openPrice = this.currentBar && this.currentBar.close ? this.currentBar.close : currentAsset.price;
        // Set asset price to match so there's continuity
        currentAsset.price = openPrice;
        this.currentBar = { 
            open: openPrice, 
            high: openPrice, 
            low: openPrice, 
            close: openPrice, 
            time: Date.now() 
        };
    },

    tick() {
        this._lastTickTime = Date.now(); // Track last tick time for watchdog
        
        const currentAsset = this.getAsset(this.currentAssetId);
        if (!currentAsset) {
            logError('Current asset not found: ' + this.currentAssetId);
            this.currentAssetId = 'OTC-AAPL';
            return;
        }
        
        try {
            const newPrice = this._priceStep(currentAsset, this.tickIntervalMs / this.barIntervalMs);
            
            // Ensure currentBar exists
            if (!this.currentBar || !this.currentBar.time) {
                this._startNewBar();
                if (!this.currentBar) return; // Safety check
            }
            
            this.currentBar.high = Math.max(this.currentBar.high || newPrice, newPrice);
            this.currentBar.low = Math.min(this.currentBar.low || newPrice, newPrice);
            this.currentBar.close = newPrice;
            
            // Check if 1 minute has passed - if so, finalize this candle and start a new one
            if (Date.now() >= this.currentBar.time + this.barIntervalMs) {
                // Push completed candle to data
                currentAsset.data.push({ ...this.currentBar });
                if (currentAsset.data.length > this.historyLength) currentAsset.data.shift();
                // Start new candle at this candle's close price
                this._startNewBar();
            }
            
            // Always render to show smooth candle formation - ensure we have data
            if (currentAsset.data.length > 0 && App.Chart && App.Chart.renderChart) {
                App.Chart.renderChart(currentAsset.data, newPrice);
            }
        } catch (err) {
            console.error('Error in tick:', err);
        }
    }
};

// Chart renderer
App.Chart = {
    chartCanvas: null, ctx: null, width: 0, height: 0, viewRange: 100,
    margin: { top: 10, bottom: 20, left: 60, right: 10 }, chartType: 'CANDLES', showSMA: false,
    useServerFeed: true,
    snapshotData: [],
    latestPrice: null,

    ingestServerSnapshot(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.candles)) return;
        const candles = snapshot.candles;
        if (!candles.length) return;
        const bars = candles.map((candle) => ({
            time: (candle.time || 0) * 1000,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
        }));
        this.snapshotData = bars;
        const lastBar = bars[bars.length - 1];
        this.latestPrice = lastBar ? lastBar.close : (this.latestPrice || 0);
        currentPrice = this.latestPrice;
        assetStartPrice = this.latestPrice;
        this.renderChart(this.snapshotData, this.latestPrice);
    },

    init() {
        this.chartCanvas = document.getElementById('price-chart');
        if (!this.chartCanvas) return;
        this.ctx = this.chartCanvas.getContext('2d');
        const container = document.getElementById('chart-area') || document.getElementById('tv-chart-container');
        new ResizeObserver(() => this.handleResize()).observe(container);
        this.handleResize();
    },

    handleResize() {
        const container = document.getElementById('chart-area') || document.getElementById('tv-chart-container');
        if (!container || !this.chartCanvas) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === this.width && h === this.height) return;
        this.width = w; this.height = h;
        const dpr = window.devicePixelRatio || 1;
        const pxW = Math.max(1, Math.floor(w * dpr));
        const pxH = Math.max(1, Math.floor(h * dpr));
        if (this.chartCanvas.width !== pxW) this.chartCanvas.width = pxW;
        if (this.chartCanvas.height !== pxH) this.chartCanvas.height = pxH;
        if (this.chartCanvas.style.width !== `${w}px`) this.chartCanvas.style.width = `${w}px`;
        if (this.chartCanvas.style.height !== `${h}px`) this.chartCanvas.style.height = `${h}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (this.useServerFeed && this.snapshotData.length > 1 && this.latestPrice !== null) {
            this.renderChart(this.snapshotData, this.latestPrice);
        }
    },

    setChartType(type) {
        if (!type) return;
        const t = type.toString().toUpperCase();
        this.chartType = (t === 'LINE' ? 'LINE' : 'CANDLES');
    },
    
    renderChart(data, currentPrice) {
        if (!this.ctx || !this.chartCanvas) return;
        if (Number.isFinite(currentPrice)) {
            this.latestPrice = currentPrice;
        }
        const ctx = this.ctx; const width = this.width; const height = this.height; const margin = this.margin;
        ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,this.chartCanvas.width,this.chartCanvas.height); ctx.restore();
        
        // Ensure we have minimum data to display
        if (!data || data.length < 10) {
            ctx.fillStyle = 'rgba(160,160,160,0.6)';
            ctx.font = '14px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('Loading chart data...', width / 2, height / 2);
            return;
        }
        
        // Reserve space for 10 future candles on the right side
        const futureCandles = 10;
        const effectiveViewRange = this.viewRange - futureCandles;
        
        const startBarIndex = Math.max(0, data.length - effectiveViewRange);
        const visibleData = data.slice(startBarIndex);
        const highs = visibleData.map(d => d.high); const lows = visibleData.map(d => d.low); const prices = visibleData.map(d => d.close);
        let minPrice = Math.min(...lows); let maxPrice = Math.max(...highs); 
        const priceRange = maxPrice - minPrice;
        
        // Add padding to price range to prevent chart from touching top/bottom edges
        const padding = priceRange * 0.1; // 10% padding
        minPrice = minPrice - padding;
        maxPrice = maxPrice + padding;
        const paddedPriceRange = maxPrice - minPrice;
        
        const chartWidth = width - margin.left - margin.right; const chartHeight = height - margin.top - margin.bottom;
        // Calculate spacing based on full viewRange (including future space)
        const numBars = Math.max(1, this.viewRange - 1); 
        const xStep = chartWidth / numBars; 
        const candleW = Math.max(2, xStep * 0.7);
        const priceToY = (price) => paddedPriceRange === 0 ? chartHeight / 2 + margin.top : height - margin.bottom - ((price - minPrice) / paddedPriceRange) * chartHeight;
        const ySteps = 5; const priceDecimals = maxPrice >= 100 ? 2 : 4; ctx.fillStyle = 'rgba(160,160,160,0.6)'; ctx.font='10px Inter';
        for (let i=0;i<=ySteps;i++){ const p=minPrice + (paddedPriceRange / ySteps) * i; const y=Math.round(priceToY(p)) + 0.5; ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke(); ctx.fillText(p.toFixed(priceDecimals), 6, y+3);} 
        ctx.save(); ctx.beginPath(); ctx.rect(margin.left, margin.top, chartWidth, chartHeight); ctx.clip();
        if (this.chartType === 'CANDLES') {
            for (let i=0;i<visibleData.length;i++){
                const b=visibleData[i]; const x=margin.left + i * xStep; const openY=Math.round(priceToY(b.open)); const closeY=Math.round(priceToY(b.close)); const highY=Math.round(priceToY(b.high)); const lowY=Math.round(priceToY(b.low)); const up=b.close>=b.open; const col= up ? 'rgba(0,255,156,0.9)' : 'rgba(255,59,59,0.9)'; ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(Math.round(x + candleW/2)+0.5, highY+0.5); ctx.lineTo(Math.round(x + candleW/2)+0.5, lowY+0.5); ctx.stroke(); const bodyY=Math.min(openY, closeY); const bodyH=Math.max(1, Math.abs(openY - closeY)); ctx.fillRect(Math.round(x)+0.5, bodyY, Math.max(1, Math.round(candleW)), bodyH);
            }
        } else {
            ctx.strokeStyle = 'rgba(0,224,255,0.9)'; ctx.lineWidth=2; ctx.beginPath(); prices.forEach((p,i)=>{ const x=margin.left + i * xStep + candleW/2; const y=priceToY(p); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
        }
        if (this.showSMA && visibleData.length >= 10) { const period=10; ctx.strokeStyle='#ffb74d'; ctx.lineWidth=2; ctx.beginPath(); for (let i=period-1;i<visibleData.length;i++){ let sum=0; for (let j=i-period+1;j<=i;j++) sum += visibleData[j].close; const sma=sum/period; const x=margin.left + i * xStep + candleW/2; const y=priceToY(sma); if (i===period-1) ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke(); }
        ctx.restore();
        const priceY = priceToY(currentPrice); ctx.strokeStyle='rgba(0,224,255,0.6)'; ctx.setLineDash([4,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(margin.left, priceY); ctx.lineTo(width - margin.right - 48, priceY); ctx.stroke(); ctx.setLineDash([]); const tagW=48, tagH=16, tagX=width - margin.right - tagW, tagY=priceY - tagH/2; ctx.fillStyle='rgba(0,224,255,0.95)'; ctx.fillRect(tagX, tagY, tagW, tagH); ctx.fillStyle='#05080f'; ctx.font='bold 10px Inter'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(currentPrice.toFixed(priceDecimals), tagX + tagW/2, priceY);
    }
};

function initNNChartEngine() {
    try {
        App.Chart.init();
        App.Sim.init();
        if (App.Chart.useServerFeed && App.Sim && App.Sim.currentAssetId) {
            ChartStreamClient.load(App.Sim.currentAssetId, ChartStreamClient.timeframe);
        }
    } catch (e) { console.error('NN Chart Engine init error', e); }
}
