/**
 * ========================================
 * PRO-CHART.JS - Professional Trading Chart Engine
 * ========================================
 * TradingView-style chart with realistic candle movement
 */

const ProChart = {
    // Configuration
    config: {
        timeframes: {
            '30s': { seconds: 30, label: '30s', tickMs: 300 },
            '1m': { seconds: 60, label: '1m', tickMs: 500 },
            '5m': { seconds: 300, label: '5m', tickMs: 1000 },
            '15m': { seconds: 900, label: '15m', tickMs: 2000 },
            '30m': { seconds: 1800, label: '30m', tickMs: 3000 },
            '1h': { seconds: 3600, label: '1H', tickMs: 5000 },
            '4h': { seconds: 14400, label: '4H', tickMs: 8000 },
        },
        currentTimeframe: '1m',
        maxCandles: 300,
        visibleCandles: 100,
        futureCandles: 10,
        chartType: 'candles', // 'candles' or 'line'
        showVolume: false,
        showMA: false,
        showEMA: false,
        showBollinger: false,
        showRSI: false,
        showMACD: false,
        showStochastic: false,
        showOBV: false,
        showATR: false,
        maPeriods: [7, 25, 99],
        emaPeriod: 12,
        bollingerPeriod: 20,
        bollingerStdDev: 2,
        rsiPeriod: 14,
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        stochasticK: 14,
        stochasticD: 3,
        atrPeriod: 14,
    },

    // State
    state: {
        canvas: null,
        ctx: null,
        width: 0,
        height: 0,
        currentAsset: 'OTC-AAPL',
        candles: [],
        formingCandle: null,
        tickTimer: null,
        candleTimer: null,
        basePrice: 189.42,
        volatility: 0.0003, // Reduced to 0.03% for subtle, realistic movement
        mouseX: -1,
        mouseY: -1,
        crosshair: true,
        isDragging: false,
        dragStartX: 0,
        scrollOffset: 0,
    },

    // Price movement algorithm (realistic market behavior)
    priceModel: {
        // Ornstein-Uhlenbeck process for mean reversion - reduced
        meanReversion: 0.01, // Much weaker to avoid directional bias
        
        // Add microstructure noise
        getMicroNoise() {
            return (Math.random() - 0.5) * 0.0005; // Increased noise
        },

        // Weighted random walk with momentum
        getNextPrice(currentPrice, basePrice, volatility, momentum = 0) {
            // Pure random walk - completely random up/down movement
            const randomMove = (Math.random() - 0.5) * volatility * 2; // Reduced from 4 to 2
            
            // Very weak pull to prevent price from drifting too far
            const weakPull = (basePrice - currentPrice) * 0.0002;
            
            // Combine - random dominates
            let newPrice = currentPrice + (currentPrice * randomMove) + weakPull;
            
            // Add random spikes occasionally - very rare
            if (Math.random() < 0.005) { // Reduced from 1% to 0.5%
                newPrice += currentPrice * (Math.random() - 0.5) * 0.002;
            }
            
            return Math.max(0.01, newPrice);
        },

        // Box-Muller transform for normal distribution
        normalRandom() {
            let u = 0, v = 0;
            while(u === 0) u = Math.random();
            while(v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        },

        // Calculate momentum from recent price action
        calculateMomentum(candles, lookback = 5) {
            if (candles.length < lookback) return 0;
            
            const recent = candles.slice(-lookback);
            let momentum = 0;
            
            for (let i = 1; i < recent.length; i++) {
                momentum += (recent[i].close - recent[i-1].close);
            }
            
            return momentum / lookback;
        }
    },

    // Initialize chart
    init(canvasId = 'price-chart') {
        console.log('Initializing Professional Chart...');
        
        this.state.canvas = document.getElementById(canvasId);
        if (!this.state.canvas) {
            console.error('Canvas not found:', canvasId);
            return;
        }

        this.state.ctx = this.state.canvas.getContext('2d');
        
        // Setup resize observer
        const container = this.state.canvas.parentElement;
        const resizeObserver = new ResizeObserver(() => this.handleResize());
        resizeObserver.observe(container);
        
        // Setup mouse events for crosshair and drag
        this.setupMouseEvents();
        
        // Initial resize
        this.handleResize();
        
        // Load historical data from server instead of generating
        this.loadServerData();
        
        console.log('Professional Chart initialized successfully');
    },

    // Load chart data from server (consistent for all users)
    async loadServerData() {
        try {
            // Always generate deterministically from seed - don't use localStorage
            // This ensures all users see identical charts
            console.log('📊 Generating deterministic historical candles from seed');
            this.generateHistoricalData();
            this.render();
            this.startCandleFormation();
            return;
            
            /* DISABLED - We use deterministic generation instead of caching
            // Try loading from localStorage first
            const loadedFromCache = this.loadCandles();
            
            if (loadedFromCache) {
                console.log('✅ Using cached candles from localStorage');
                this.render();
                this.startCandleFormation();
                return;
            }
            */
            
            const assetId = this.state.currentAsset;
            const tf = this.config.currentTimeframe;
            
            // Fetch from server
            const params = new URLSearchParams({
                asset: assetId,
                timeframe: tf,
                points: this.config.maxCandles,
            });
            
            const response = await fetch(`/api/chart?${params.toString()}`);
            const data = await response.json();
            
            if (data.ok && data.chart && data.chart.candles) {
                // Convert server candles to our format
                this.state.candles = data.chart.candles.map(c => ({
                    timestamp: c.time,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: Math.floor(Math.random() * 1000000) + 500000,
                }));
                
                // Set base price from last candle
                if (this.state.candles.length > 0) {
                    const lastCandle = this.state.candles[this.state.candles.length - 1];
                    this.state.basePrice = lastCandle.close;
                }
                
                console.log(`Loaded ${this.state.candles.length} candles from server`);
                
                // Save server candles to localStorage
                this.saveCandles();
                
                // Start forming new candles on top of server data
                this.startCandleFormation();
                
                // Initial render
                this.render();
            } else {
                console.warn('No server data, generating local data');
                this.generateHistoricalData();
                this.startCandleFormation();
                this.render();
            }
        } catch (error) {
            console.error('Failed to load server data:', error);
            // Fallback to local generation
            this.generateHistoricalData();
            this.startCandleFormation();
            this.render();
        }
    },

    // Save candles to localStorage for persistence
    saveCandles() {
        try {
            const storageKey = `tanix_candles_${this.state.currentAsset}_${this.config.currentTimeframe}`;
            const candleData = {
                candles: this.state.candles,
                lastUpdate: Date.now(),
                basePrice: this.state.basePrice,
            };
            localStorage.setItem(storageKey, JSON.stringify(candleData));
        } catch (e) {
            console.warn('Failed to save candles to localStorage:', e);
        }
    },

    // Load candles from localStorage
    loadCandles() {
        try {
            const storageKey = `tanix_candles_${this.state.currentAsset}_${this.config.currentTimeframe}`;
            const stored = localStorage.getItem(storageKey);
            
            if (stored) {
                const candleData = JSON.parse(stored);
                const tf = this.config.timeframes[this.config.currentTimeframe];
                const now = Math.floor(Date.now() / 1000);
                
                // Check if stored data is still recent (within last 24 hours)
                const ageInHours = (Date.now() - candleData.lastUpdate) / (1000 * 60 * 60);
                
                if (ageInHours < 24 && candleData.candles && candleData.candles.length > 0) {
                    const timeframeSeconds = tf.seconds;
                    const currentPeriodStart = Math.floor(now / timeframeSeconds) * timeframeSeconds;
                    
                    console.log(`🔍 Loading candles - Current period starts at: ${new Date(currentPeriodStart * 1000).toLocaleTimeString()}`);
                    console.log(`🔍 Total stored candles: ${candleData.candles.length}`);
                    
                    // Safety check: if stored candles are way too many, clear and regenerate
                    if (candleData.candles.length > this.config.maxCandles * 3) {
                        console.warn(`⚠️ localStorage has ${candleData.candles.length} candles (>${this.config.maxCandles * 3}). Clearing bloated data.`);
                        localStorage.removeItem(storageKey);
                        return false;
                    }
                    
                    // Filter out candles that are:
                    // 1. Too old (> 24 hours)
                    // 2. In the future
                    // 3. From the current time period OR the immediate previous period (to be safe)
                    const safetyMargin = timeframeSeconds * 2; // Remove current and previous period
                    const cutoffTimestamp = currentPeriodStart - timeframeSeconds;
                    
                    let validCandles = candleData.candles.filter(c => {
                        const age = now - c.timestamp;
                        const isTooOld = age < 0 || age >= (24 * 60 * 60);
                        const isTooRecent = c.timestamp >= cutoffTimestamp; // Remove current AND previous period
                        
                        if (isTooRecent) {
                            console.log(`🔍 Filtering out recent candle: ${new Date(c.timestamp * 1000).toLocaleTimeString()} (cutoff: ${new Date(cutoffTimestamp * 1000).toLocaleTimeString()})`);
                        }
                        
                        return !isTooOld && !isTooRecent;
                    });
                    
                    console.log(`🔍 After filtering: ${validCandles.length} valid candles (filtered out ${candleData.candles.length - validCandles.length})`);
                    
                    if (validCandles.length > 0) {
                        // Trim to maxCandles to prevent bloat
                        if (validCandles.length > this.config.maxCandles) {
                            validCandles = validCandles.slice(-this.config.maxCandles);
                            console.log(`⚠️ Trimmed loaded candles from ${validCandles.length} to ${this.config.maxCandles}`);
                        }
                        
                        this.state.candles = validCandles;
                        this.state.basePrice = candleData.basePrice || validCandles[validCandles.length - 1].close;
                        const lastValidCandle = validCandles[validCandles.length - 1];
                        console.log(`📂 Loaded ${validCandles.length} candles from localStorage (last: ${new Date(lastValidCandle.timestamp * 1000).toLocaleTimeString()})`);
                        console.log(`📂 this.state.candles now has ${this.state.candles.length} candles`);
                        return true;
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to load candles from localStorage:', e);
        }
        return false;
    },

    // Generate realistic historical candle data
    generateHistoricalData() {
        const tf = this.config.timeframes[this.config.currentTimeframe];
        const now = Math.floor(Date.now() / 1000);
        const numCandles = this.config.maxCandles;
        
        // Create deterministic seed based ONLY on date, asset, and timeframe
        // This ensures all users see identical charts
        const today = new Date();
        const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const symbol = this.state.currentAsset || 'AAPL';
        const seedBase = `${symbol}|${dateString}|${this.config.currentTimeframe}`;
        const masterHash = this.hashCode(seedBase);
        
        let price = this.state.basePrice;
        
        for (let i = 0; i < numCandles; i++) {
            const timestamp = now - ((numCandles - i) * tf.seconds);
            
            // Create deterministic random generator for this candle index
            // Same index always gives same result
            const candleHash = masterHash + i * 9999;
            let seed = candleHash;
            const seededRandom = () => {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            };
            
            const open = price;
            
            // Simulate candle formation with deterministic movement
            const ticksPerCandle = 20;
            let high = open;
            let low = open;
            let close = open;
            
            for (let tick = 0; tick < ticksPerCandle; tick++) {
                const randomVal = (seededRandom() - 0.5) * 2;
                const move = randomVal * this.state.volatility * 2;
                const newPrice = close + (close * move);
                
                high = Math.max(high, newPrice);
                low = Math.min(low, newPrice);
                close = newPrice;
            }
            
            // Add candle
            this.state.candles.push({
                timestamp,
                open: this.roundPrice(open),
                high: this.roundPrice(high),
                low: this.roundPrice(low),
                close: this.roundPrice(close),
                volume: Math.floor(seededRandom() * 1000000) + 500000,
            });
            
            price = close;
        }
        
        console.log(`✅ Generated ${this.state.candles.length} deterministic historical candles (seed: ${seedBase})`);
        
        // Don't save - we regenerate from seed on each load for consistency
        // this.saveCandles();
    },
    
    // Simple hash function for seeding
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    },

    // Start forming new candles in real-time
    startCandleFormation() {
        const tf = this.config.timeframes[this.config.currentTimeframe];
        
        // Clear existing timers
        if (this.state.tickTimer) clearInterval(this.state.tickTimer);
        if (this.state.candleTimer) clearInterval(this.state.candleTimer);
        if (this.state.syncTimer) clearInterval(this.state.syncTimer);
        
        // Get the last complete candle
        const lastCandle = this.state.candles[this.state.candles.length - 1];
        const now = Math.floor(Date.now() / 1000);
        
        // Align to timeframe boundary for perfect sync across all users
        const timeframeSeconds = tf.seconds;
        const alignedTimestamp = Math.floor(now / timeframeSeconds) * timeframeSeconds;
        
        // Start forming candle for current period
        this.state.formingCandle = {
            timestamp: alignedTimestamp,
            open: lastCandle ? lastCandle.close : this.state.basePrice,
            high: lastCandle ? lastCandle.close : this.state.basePrice,
            low: lastCandle ? lastCandle.close : this.state.basePrice,
            close: lastCandle ? lastCandle.close : this.state.basePrice,
            volume: 0,
            startTime: alignedTimestamp * 1000,
        };
        
        console.log(`🕐 Starting candle formation at ${new Date(alignedTimestamp * 1000).toLocaleTimeString()}`);
        if (lastCandle) {
            console.log(`🕐 Last complete candle was at ${new Date(lastCandle.timestamp * 1000).toLocaleTimeString()}`);
        }
        
        // Reconstruct the forming candle state if user joined mid-candle
        // This ensures all users see the same candle state regardless of when they joined
        this.reconstructFormingCandle();
        
        // Tick every second to update forming candle (smooth animation)
        this.state.tickTimer = setInterval(() => this.tickFormingCandle(), tf.tickMs);
        
        // Calculate time until next candle boundary
        const currentTime = Math.floor(Date.now() / 1000);
        const candleStart = Math.floor(this.state.formingCandle.startTime / 1000);
        const timeUntilNextCandle = (candleStart + timeframeSeconds - currentTime) * 1000;
        
        // Wait until the exact candle boundary, then finalize and set up regular interval
        setTimeout(() => {
            this.finalizeCandle();
            // Now set up regular interval for future candles
            this.state.candleTimer = setInterval(() => this.finalizeCandle(), tf.seconds * 1000);
        }, timeUntilNextCandle);
        
        // Sync disabled - we use fully deterministic local candles
        // this.state.syncTimer = setInterval(() => this.syncWithServer(), 30000);
        
        console.log(`Started candle formation: ${this.config.currentTimeframe} timeframe (next finalize in ${Math.floor(timeUntilNextCandle/1000)}s)`);
    },

    // Sync with server to ensure all users see the same chart
    async syncWithServer() {
        try {
            const assetId = this.state.currentAsset;
            const tf = this.config.currentTimeframe;
            
            const params = new URLSearchParams({
                asset: assetId,
                timeframe: tf,
                points: 50, // Just get recent candles for sync
            });
            
            const response = await fetch(`/api/chart?${params.toString()}`);
            const data = await response.json();
            
            if (data.ok && data.chart && data.chart.candles) {
                const serverCandles = data.chart.candles.map(c => ({
                    timestamp: c.time,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: Math.floor(Math.random() * 1000000) + 500000,
                }));
                
                // Update our historical candles with server data
                // Keep the most recent server candles
                if (serverCandles.length > 0) {
                    const lastServerTime = serverCandles[serverCandles.length - 1].timestamp;
                    
                    // Remove our local candles that overlap with server data
                    this.state.candles = this.state.candles.filter(c => c.timestamp > lastServerTime);
                    
                    // Prepend server candles
                    this.state.candles = [...serverCandles, ...this.state.candles];
                    
                    // Trim to max length
                    if (this.state.candles.length > this.config.maxCandles) {
                        this.state.candles = this.state.candles.slice(-this.config.maxCandles);
                    }
                    
                    console.log('Synced with server:', serverCandles.length, 'candles updated');
                }
            }
        } catch (error) {
            console.error('Failed to sync with server:', error);
        }
    },

    // Update the forming candle with realistic price movement
    // Reconstruct the forming candle state from seed (for users joining mid-candle)
    reconstructFormingCandle() {
        if (!this.state.formingCandle) return;
        
        const currentSecond = Math.floor(Date.now() / 1000);
        const candleStartSecond = Math.floor(this.state.formingCandle.startTime / 1000);
        const elapsedSeconds = currentSecond - candleStartSecond;
        
        // Reset to initial state
        const openPrice = this.state.formingCandle.open;
        this.state.formingCandle.close = openPrice;
        this.state.formingCandle.high = openPrice;
        this.state.formingCandle.low = openPrice;
        this.state.formingCandle.volume = 0;
        
        // Replay all ticks deterministically from start to current time
        for (let i = 0; i < elapsedSeconds; i++) {
            const seed = candleStartSecond + i;
            const deterministicRandom = Math.sin(seed) * 10000;
            const normalizedRandom = (deterministicRandom - Math.floor(deterministicRandom)) - 0.5;
            
            const randomMove = normalizedRandom * this.state.volatility * 2;
            const weakPull = (this.state.basePrice - this.state.formingCandle.close) * 0.0002;
            const priceChange = (this.state.formingCandle.close * randomMove) + weakPull;
            
            const newPrice = this.state.formingCandle.close + priceChange;
            
            this.state.formingCandle.close = this.roundPrice(newPrice);
            this.state.formingCandle.high = Math.max(this.state.formingCandle.high, newPrice);
            this.state.formingCandle.low = Math.min(this.state.formingCandle.low, newPrice);
            this.state.formingCandle.volume += Math.floor(Math.abs(normalizedRandom * 20000)) + 1000;
        }
        
        console.log(`🔄 Reconstructed forming candle state (${elapsedSeconds} ticks replayed)`);
    },

    tickFormingCandle() {
        if (!this.state.formingCandle) return;
        
        // Make forming candle deterministic based on timestamp
        // Align current time to second for consistency across all users
        const currentSecond = Math.floor(Date.now() / 1000);
        const candleStartSecond = Math.floor(this.state.formingCandle.startTime / 1000);
        
        // Calculate seconds elapsed since candle start
        const elapsedSeconds = currentSecond - candleStartSecond;
        
        // Create deterministic "random" value based on candle start + elapsed seconds
        // This ensures all users see the same movement at the same time
        const seed = candleStartSecond + elapsedSeconds;
        const deterministicRandom = Math.sin(seed) * 10000;
        const normalizedRandom = (deterministicRandom - Math.floor(deterministicRandom)) - 0.5; // -0.5 to 0.5
        
        // Use deterministic random for price movement
        const randomMove = normalizedRandom * this.state.volatility * 2;
        const weakPull = (this.state.basePrice - this.state.formingCandle.close) * 0.0002;
        const priceChange = (this.state.formingCandle.close * randomMove) + weakPull;
        
        const newPrice = this.state.formingCandle.close + priceChange;
        
        this.state.formingCandle.close = this.roundPrice(newPrice);
        this.state.formingCandle.high = Math.max(this.state.formingCandle.high, newPrice);
        this.state.formingCandle.low = Math.min(this.state.formingCandle.low, newPrice);
        this.state.formingCandle.volume += Math.floor(Math.abs(normalizedRandom * 20000)) + 1000;
        
        // Render the updated candle
        this.render();
    },

    // Finalize the current candle and start a new one
    finalizeCandle() {
        if (!this.state.formingCandle) return;
        
        const tf = this.config.timeframes[this.config.currentTimeframe];
        
        console.log(`✅ Finalizing candle at ${new Date(this.state.formingCandle.timestamp * 1000).toLocaleTimeString()}`);
        
        // Add completed candle to history
        this.state.candles.push({ ...this.state.formingCandle });
        
        // Trim old candles - keep only the most recent maxCandles
        if (this.state.candles.length > this.config.maxCandles) {
            const excess = this.state.candles.length - this.config.maxCandles;
            this.state.candles.splice(0, excess); // Remove from beginning
            console.log(`⚠️ Trimmed ${excess} old candles, now have ${this.state.candles.length}`);
        }
        
        // DON'T save to localStorage - we regenerate from seed instead
        // this.saveCandles();
        
        // Start new candle at close of previous with proper timestamp
        // Use the previous timestamp + timeframe seconds for continuity
        const nextTimestamp = this.state.formingCandle.timestamp + tf.seconds;
        
        console.log(`🆕 Starting new candle at ${new Date(nextTimestamp * 1000).toLocaleTimeString()}`);
        
        this.state.formingCandle = {
            timestamp: nextTimestamp,
            open: this.state.formingCandle.close,
            high: this.state.formingCandle.close,
            low: this.state.formingCandle.close,
            close: this.state.formingCandle.close,
            volume: 0,
            startTime: nextTimestamp * 1000, // Use aligned timestamp for determinism
        };
        
        console.log(`Candle finalized. Total candles: ${this.state.candles.length}`);
    },

    // Handle canvas resize
    handleResize() {
        const container = this.state.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        this.state.width = rect.width;
        this.state.height = rect.height;
        
        const dpr = window.devicePixelRatio || 1;
        this.state.canvas.width = Math.floor(this.state.width * dpr);
        this.state.canvas.height = Math.floor(this.state.height * dpr);
        this.state.canvas.style.width = `${this.state.width}px`;
        this.state.canvas.style.height = `${this.state.height}px`;
        
        this.state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        this.render();
    },

    // Setup mouse events for crosshair and drag
    setupMouseEvents() {
        this.state.canvas.addEventListener('mousemove', (e) => {
            const rect = this.state.canvas.getBoundingClientRect();
            this.state.mouseX = e.clientX - rect.left;
            this.state.mouseY = e.clientY - rect.top;
            
            if (this.state.isDragging) {
                const dx = e.clientX - this.state.dragStartX;
                this.state.scrollOffset += Math.floor(dx / 10);
                this.state.scrollOffset = Math.max(0, Math.min(
                    this.state.candles.length - this.config.visibleCandles,
                    this.state.scrollOffset
                ));
                this.state.dragStartX = e.clientX;
            }
            
            this.render();
        });

        this.state.canvas.addEventListener('mouseleave', () => {
            this.state.mouseX = -1;
            this.state.mouseY = -1;
            this.state.isDragging = false;
            this.render();
        });

        this.state.canvas.addEventListener('mousedown', (e) => {
            this.state.isDragging = true;
            this.state.dragStartX = e.clientX;
        });

        this.state.canvas.addEventListener('mouseup', () => {
            this.state.isDragging = false;
        });

        // Zoom with mouse wheel
        this.state.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 5 : -5;
            this.config.visibleCandles = Math.max(20, Math.min(200, this.config.visibleCandles + delta));
            this.render();
        });
    },

    // Main render function
    render() {
        const ctx = this.state.ctx;
        const width = this.state.width;
        const height = this.state.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw background - matching app theme with slight visibility
        // Using a slightly lighter shade to make it more visible against the glass panel
        ctx.fillStyle = '#0d1628'; // color-surface-800 from theme
        ctx.fillRect(0, 0, width, height);
        
        // Calculate visible data
        const allData = [...this.state.candles];
        if (this.state.formingCandle) {
            allData.push(this.state.formingCandle);
        }
        
        const effectiveVisible = this.config.visibleCandles - this.config.futureCandles;
        const startIdx = Math.max(0, allData.length - effectiveVisible - this.state.scrollOffset);
        const visibleData = allData.slice(startIdx);
        
        if (visibleData.length < 2) return;
        
        // Calculate price range
        const prices = visibleData.flatMap(c => [c.high, c.low]);
        let minPrice = Math.min(...prices);
        let maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        const padding = priceRange * 0.1;
        minPrice -= padding;
        maxPrice += padding;
        
        // Chart dimensions
        const margin = { top: 20, right: 80, bottom: 40, left: 10 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;
        
        // Drawing parameters
        const totalSlots = this.config.visibleCandles;
        const candleWidth = Math.max(1, (chartWidth / totalSlots) * 0.7);
        const spacing = chartWidth / totalSlots;
        
        // Helper: price to Y coordinate
        const priceToY = (price) => {
            const normalizedPrice = (price - minPrice) / (maxPrice - minPrice);
            return height - margin.bottom - (normalizedPrice * chartHeight);
        };
        
        // Draw grid lines
        this.drawGrid(ctx, margin, chartWidth, chartHeight, minPrice, maxPrice, priceToY);
        
        // Draw Moving Averages
        if (this.config.showMA) {
            this.drawMovingAverages(ctx, visibleData, spacing, margin, priceToY);
        }
        
        // Draw EMA
        if (this.config.showEMA) {
            this.drawEMA(ctx, visibleData, spacing, margin, priceToY);
        }
        
        // Draw Bollinger Bands
        if (this.config.showBollinger) {
            this.drawBollinger(ctx, visibleData, spacing, margin, priceToY);
        }
        
        // Draw chart based on type
        if (this.config.chartType === 'line') {
            this.drawLineChart(ctx, visibleData, spacing, margin, priceToY);
        } else if (this.config.chartType === 'area') {
            this.drawAreaChart(ctx, visibleData, spacing, margin, priceToY, height);
        } else if (this.config.chartType === 'bars') {
            this.drawBars(ctx, visibleData, spacing, candleWidth, margin, priceToY);
        } else {
            // Default to candles
            this.drawCandles(ctx, visibleData, spacing, candleWidth, margin, priceToY);
        }
        
        // Draw volume bars
        if (this.config.showVolume) {
            this.drawVolume(ctx, visibleData, spacing, candleWidth, margin, height);
        }
        
        // Draw RSI in bottom panel
        if (this.config.showRSI) {
            this.drawRSI(ctx, visibleData, spacing, margin, width, height);
        }
        
        // Draw MACD in bottom panel
        if (this.config.showMACD) {
            const offset = this.config.showRSI ? 110 : 0;
            this.drawMACD(ctx, visibleData, spacing, margin, width, height - offset);
        }
        
        // Draw Stochastic in bottom panel
        if (this.config.showStochastic) {
            let offset = 0;
            if (this.config.showRSI) offset += 110;
            if (this.config.showMACD) offset += 110;
            this.drawStochastic(ctx, visibleData, spacing, margin, width, height - offset);
        }
        
        // Draw OBV in bottom panel
        if (this.config.showOBV) {
            let offset = 0;
            if (this.config.showRSI) offset += 110;
            if (this.config.showMACD) offset += 110;
            if (this.config.showStochastic) offset += 110;
            this.drawOBV(ctx, visibleData, spacing, margin, width, height - offset);
        }
        
        // Draw ATR in bottom panel
        if (this.config.showATR) {
            let offset = 0;
            if (this.config.showRSI) offset += 110;
            if (this.config.showMACD) offset += 110;
            if (this.config.showStochastic) offset += 110;
            if (this.config.showOBV) offset += 110;
            this.drawATR(ctx, visibleData, spacing, margin, width, height - offset);
        }
        
        // Draw price scale
        this.drawPriceScale(ctx, margin, chartWidth, chartHeight, minPrice, maxPrice, width);
        
        // Draw time scale
        this.drawTimeScale(ctx, visibleData, spacing, margin, width, height);
        
        // Draw crosshair
        if (this.state.mouseX > 0 && this.state.crosshair) {
            this.drawCrosshair(ctx, margin, chartWidth, chartHeight, visibleData, spacing, priceToY);
        }
        
        // Draw current price line
        if (this.state.formingCandle) {
            this.drawCurrentPriceLine(ctx, this.state.formingCandle.close, priceToY, margin, chartWidth, width);
            
            // Draw candle formation timer - position it above the bottom margin
            const currentCandleX = margin.left + ((visibleData.length - 1) * spacing) + spacing / 2;
            const timerY = height - margin.bottom + 15; // Position in the time scale area
            this.drawCandleTimer(ctx, this.state.formingCandle, currentCandleX, timerY);
        }
    },

    // Draw grid lines
    drawGrid(ctx, margin, chartWidth, chartHeight, minPrice, maxPrice, priceToY) {
        // Horizontal grid lines - matching app's subtle border style
        ctx.strokeStyle = 'rgba(88, 120, 180, 0.12)';
        ctx.lineWidth = 1;
        
        const numLines = 8;
        const priceStep = (maxPrice - minPrice) / numLines;
        
        for (let i = 0; i <= numLines; i++) {
            const price = minPrice + (i * priceStep);
            const y = priceToY(price);
            
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + chartWidth, y);
            ctx.stroke();
        }
        
        // Add vertical grid lines for time
        ctx.strokeStyle = 'rgba(88, 120, 180, 0.08)';
        const numVertLines = 10;
        const xStep = chartWidth / numVertLines;
        
        for (let i = 0; i <= numVertLines; i++) {
            const x = margin.left + (i * xStep);
            ctx.beginPath();
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, chartHeight + margin.top);
            ctx.stroke();
        }
    },

    // Draw candles
    drawCandles(ctx, candles, spacing, candleWidth, margin, priceToY) {
        candles.forEach((candle, i) => {
            const x = margin.left + (i * spacing);
            const isGreen = candle.close >= candle.open;
            
            // Candle colors matching reference image
            const bullColor = '#26a69a'; // Teal green for bullish
            const bearColor = '#ef5350'; // Red for bearish
            const color = isGreen ? bullColor : bearColor;
            const wickColor = isGreen ? bullColor : bearColor;
            
            // Draw wick (thin line)
            ctx.strokeStyle = wickColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + candleWidth / 2, priceToY(candle.high));
            ctx.lineTo(x + candleWidth / 2, priceToY(candle.low));
            ctx.stroke();
            
            // Draw body
            const bodyTop = priceToY(Math.max(candle.open, candle.close));
            const bodyBottom = priceToY(Math.min(candle.open, candle.close));
            const bodyHeight = Math.max(1, bodyBottom - bodyTop);
            
            ctx.fillStyle = color;
            ctx.fillRect(x, bodyTop, candleWidth, bodyHeight);
        });
    },

    // Draw volume bars
    drawVolume(ctx, candles, spacing, candleWidth, margin, totalHeight) {
        const volumeHeight = 80;
        const volumeTop = totalHeight - volumeHeight;
        
        const maxVolume = Math.max(...candles.map(c => c.volume));
        
        candles.forEach((candle, i) => {
            const x = margin.left + (i * spacing);
            const isGreen = candle.close >= candle.open;
            // Match candle colors with transparency
            const color = isGreen ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)';
            
            const barHeight = (candle.volume / maxVolume) * (volumeHeight - 10);
            
            ctx.fillStyle = color;
            ctx.fillRect(x, volumeTop + (volumeHeight - barHeight - 10), candleWidth, barHeight);
        });
    },

    // Draw line chart
    drawLineChart(ctx, candles, spacing, margin, priceToY) {
        if (candles.length === 0) return;
        
        ctx.strokeStyle = '#38bdf8'; // Neon cyan
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        candles.forEach((candle, i) => {
            const x = margin.left + (i * spacing) + spacing / 2;
            const y = priceToY(candle.close);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    },

    // Draw area chart
    drawAreaChart(ctx, candles, spacing, margin, priceToY, height) {
        if (candles.length === 0) return;
        
        // Create gradient for area fill
        const gradient = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom);
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.3)'); // Neon cyan with opacity
        gradient.addColorStop(1, 'rgba(56, 189, 248, 0.01)');
        
        // Draw filled area
        ctx.fillStyle = gradient;
        ctx.beginPath();
        
        const firstX = margin.left + spacing / 2;
        const firstY = priceToY(candles[0].close);
        ctx.moveTo(firstX, firstY);
        
        candles.forEach((candle, i) => {
            const x = margin.left + (i * spacing) + spacing / 2;
            const y = priceToY(candle.close);
            ctx.lineTo(x, y);
        });
        
        // Complete the area by going to bottom
        const lastX = margin.left + ((candles.length - 1) * spacing) + spacing / 2;
        const bottomY = height - margin.bottom;
        ctx.lineTo(lastX, bottomY);
        ctx.lineTo(firstX, bottomY);
        ctx.closePath();
        ctx.fill();
        
        // Draw line on top
        ctx.strokeStyle = '#38bdf8'; // Neon cyan
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        candles.forEach((candle, i) => {
            const x = margin.left + (i * spacing) + spacing / 2;
            const y = priceToY(candle.close);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    },

    // Draw bar chart (OHLC bars)
    drawBars(ctx, candles, spacing, candleWidth, margin, priceToY) {
        candles.forEach((candle, i) => {
            const x = margin.left + (i * spacing) + spacing / 2;
            const highY = priceToY(candle.high);
            const lowY = priceToY(candle.low);
            const openY = priceToY(candle.open);
            const closeY = priceToY(candle.close);
            
            const isBullish = candle.close >= candle.open;
            const color = isBullish ? '#26a69a' : '#ef5350';
            
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            
            // Draw vertical line (high to low)
            ctx.beginPath();
            ctx.moveTo(x, highY);
            ctx.lineTo(x, lowY);
            ctx.stroke();
            
            // Draw open tick (left)
            ctx.beginPath();
            ctx.moveTo(x - candleWidth / 2, openY);
            ctx.lineTo(x, openY);
            ctx.stroke();
            
            // Draw close tick (right)
            ctx.beginPath();
            ctx.moveTo(x, closeY);
            ctx.lineTo(x + candleWidth / 2, closeY);
            ctx.stroke();
        });
    },

    // Draw moving averages
    drawMovingAverages(ctx, candles, spacing, margin, priceToY) {
        const colors = ['#f0b90b', '#00bcd4', '#e91e63'];
        
        this.config.maPeriods.forEach((period, idx) => {
            if (candles.length < period) return;
            
            ctx.strokeStyle = colors[idx];
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let i = period - 1; i < candles.length; i++) {
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += candles[i - j].close;
                }
                const ma = sum / period;
                const x = margin.left + (i * spacing) + spacing / 2;
                const y = priceToY(ma);
                
                if (i === period - 1) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
        });
    },

    // Draw EMA (Exponential Moving Average)
    drawEMA(ctx, candles, spacing, margin, priceToY) {
        const period = this.config.emaPeriod;
        if (candles.length < period) return;
        
        ctx.strokeStyle = '#9c27b0'; // Purple color
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // Calculate initial SMA for the first EMA value
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += candles[i].close;
        }
        let ema = sum / period;
        
        const multiplier = 2 / (period + 1);
        
        for (let i = 0; i < candles.length; i++) {
            if (i >= period - 1) {
                if (i > period - 1) {
                    ema = (candles[i].close - ema) * multiplier + ema;
                }
                
                const x = margin.left + (i * spacing) + spacing / 2;
                const y = priceToY(ema);
                
                if (i === period - 1) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
        }
        
        ctx.stroke();
    },

    // Draw Bollinger Bands
    drawBollinger(ctx, candles, spacing, margin, priceToY) {
        const period = this.config.bollingerPeriod;
        const stdDevMultiplier = this.config.bollingerStdDev;
        
        if (candles.length < period) return;
        
        // Calculate Bollinger Bands values
        const upperBand = [];
        const middleBand = [];
        const lowerBand = [];
        
        for (let i = period - 1; i < candles.length; i++) {
            // Calculate SMA (middle band)
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += candles[i - j].close;
            }
            const sma = sum / period;
            
            // Calculate standard deviation
            let variance = 0;
            for (let j = 0; j < period; j++) {
                variance += Math.pow(candles[i - j].close - sma, 2);
            }
            const stdDev = Math.sqrt(variance / period);
            
            upperBand.push({ index: i, value: sma + (stdDevMultiplier * stdDev) });
            middleBand.push({ index: i, value: sma });
            lowerBand.push({ index: i, value: sma - (stdDevMultiplier * stdDev) });
        }
        
        // Draw upper band
        ctx.strokeStyle = 'rgba(33, 150, 243, 0.6)'; // Blue
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        upperBand.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const y = priceToY(point.value);
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Draw middle band (SMA)
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.6)'; // Amber
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]); // Dashed line
        ctx.beginPath();
        
        middleBand.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const y = priceToY(point.value);
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        ctx.setLineDash([]); // Reset to solid line
        
        // Draw lower band
        ctx.strokeStyle = 'rgba(33, 150, 243, 0.6)'; // Blue
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        lowerBand.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const y = priceToY(point.value);
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Fill area between bands with semi-transparent color
        ctx.fillStyle = 'rgba(33, 150, 243, 0.08)';
        ctx.beginPath();
        
        // Draw upper band path
        upperBand.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const y = priceToY(point.value);
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        // Draw lower band path in reverse
        for (let i = lowerBand.length - 1; i >= 0; i--) {
            const point = lowerBand[i];
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const y = priceToY(point.value);
            ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        ctx.fill();
    },

    // Calculate RSI
    calculateRSI(candles, period) {
        if (candles.length < period + 1) return [];
        
        const rsiValues = [];
        
        for (let i = period; i < candles.length; i++) {
            let gains = 0;
            let losses = 0;
            
            for (let j = 0; j < period; j++) {
                const change = candles[i - j].close - candles[i - j - 1].close;
                if (change > 0) {
                    gains += change;
                } else {
                    losses += Math.abs(change);
                }
            }
            
            const avgGain = gains / period;
            const avgLoss = losses / period;
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));
            
            rsiValues.push({ index: i, value: rsi });
        }
        
        return rsiValues;
    },

    // Draw RSI in bottom panel
    drawRSI(ctx, candles, spacing, margin, width, height) {
        const rsiHeight = 100;
        const rsiY = height - margin.bottom - rsiHeight - 10;
        
        // Draw RSI panel background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(margin.left, rsiY, width - margin.left - margin.right, rsiHeight);
        
        // Draw border
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(margin.left, rsiY, width - margin.left - margin.right, rsiHeight);
        
        // Draw reference lines at 30, 50, 70
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        
        [30, 50, 70].forEach(level => {
            const y = rsiY + rsiHeight - (level / 100) * rsiHeight;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(width - margin.right, y);
            ctx.stroke();
            
            // Draw level labels
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(level.toString(), margin.left - 5, y + 3);
        });
        
        ctx.setLineDash([]);
        
        // Draw oversold/overbought zones
        // Oversold zone (below 30) - green tint
        ctx.fillStyle = 'rgba(34, 211, 167, 0.08)';
        ctx.fillRect(margin.left, rsiY + rsiHeight - (30 / 100) * rsiHeight, 
                     width - margin.left - margin.right, (30 / 100) * rsiHeight);
        
        // Overbought zone (above 70) - red tint
        ctx.fillStyle = 'rgba(234, 57, 67, 0.08)';
        ctx.fillRect(margin.left, rsiY, 
                     width - margin.left - margin.right, rsiHeight - (70 / 100) * rsiHeight);
        
        // Calculate and draw RSI line
        const rsiValues = this.calculateRSI(candles, this.config.rsiPeriod);
        if (rsiValues.length === 0) return;
        
        ctx.strokeStyle = '#9c27b0'; // Purple
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        rsiValues.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const y = rsiY + rsiHeight - (point.value / 100) * rsiHeight;
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw RSI label and current value
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 11px Inter';
        ctx.textAlign = 'left';
        ctx.fillText('RSI (' + this.config.rsiPeriod + ')', margin.left + 5, rsiY + 14);
        
        // Show current RSI value
        if (rsiValues.length > 0) {
            const currentRSI = rsiValues[rsiValues.length - 1].value;
            const rsiColor = currentRSI > 70 ? '#ea3943' : currentRSI < 30 ? '#22d3a7' : '#9c27b0';
            ctx.fillStyle = rsiColor;
            ctx.fillText(currentRSI.toFixed(2), margin.left + 70, rsiY + 14);
        }
    },

    // Calculate EMA for MACD
    calculateEMA(data, period) {
        const emaValues = [];
        let ema = data[0];
        const multiplier = 2 / (period + 1);
        
        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                emaValues.push(ema);
            } else {
                ema = (data[i] - ema) * multiplier + ema;
                emaValues.push(ema);
            }
        }
        
        return emaValues;
    },

    // Draw MACD in bottom panel
    drawMACD(ctx, candles, spacing, margin, width, height) {
        if (candles.length < this.config.macdSlow) return;
        
        const macdHeight = 100;
        const macdY = height - margin.bottom - macdHeight - 10;
        
        // Draw MACD panel background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(margin.left, macdY, width - margin.left - margin.right, macdHeight);
        
        // Draw border
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(margin.left, macdY, width - margin.left - margin.right, macdHeight);
        
        // Extract close prices
        const closePrices = candles.map(c => c.close);
        
        // Calculate EMAs
        const ema12 = this.calculateEMA(closePrices, this.config.macdFast);
        const ema26 = this.calculateEMA(closePrices, this.config.macdSlow);
        
        // Calculate MACD line (12 EMA - 26 EMA)
        const macdLine = ema12.map((val, i) => val - ema26[i]);
        
        // Calculate Signal line (9 EMA of MACD line)
        const signalLine = this.calculateEMA(macdLine, this.config.macdSignal);
        
        // Calculate Histogram (MACD - Signal)
        const histogram = macdLine.map((val, i) => val - signalLine[i]);
        
        // Find min/max for scaling
        const allValues = [...macdLine, ...signalLine];
        const maxValue = Math.max(...allValues.map(Math.abs));
        const centerY = macdY + macdHeight / 2;
        
        // Draw zero line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(margin.left, centerY);
        ctx.lineTo(width - margin.right, centerY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw histogram bars
        histogram.forEach((val, i) => {
            if (i < this.config.macdSlow - 1) return;
            
            const x = margin.left + (i * spacing) + spacing / 2;
            const barHeight = (Math.abs(val) / maxValue) * (macdHeight / 2.5);
            
            // Color based on value and previous value
            const isPositive = val >= 0;
            const isPrevPositive = i > 0 ? histogram[i - 1] >= 0 : true;
            const isIncreasing = i > 0 ? Math.abs(val) > Math.abs(histogram[i - 1]) : true;
            
            if (isPositive) {
                ctx.fillStyle = isIncreasing ? 'rgba(34, 211, 167, 0.8)' : 'rgba(34, 211, 167, 0.5)';
            } else {
                ctx.fillStyle = isIncreasing ? 'rgba(234, 57, 67, 0.8)' : 'rgba(234, 57, 67, 0.5)';
            }
            
            if (val >= 0) {
                ctx.fillRect(x - spacing / 3, centerY - barHeight, spacing * 0.66, barHeight);
            } else {
                ctx.fillRect(x - spacing / 3, centerY, spacing * 0.66, barHeight);
            }
        });
        
        // Draw MACD line
        ctx.strokeStyle = '#2196f3'; // Blue
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        macdLine.forEach((val, i) => {
            if (i < this.config.macdSlow - 1) return;
            
            const x = margin.left + (i * spacing) + spacing / 2;
            const y = centerY - (val / maxValue) * (macdHeight / 2.5);
            
            if (i === this.config.macdSlow - 1) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Draw Signal line
        ctx.strokeStyle = '#ff9800'; // Orange
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        signalLine.forEach((val, i) => {
            if (i < this.config.macdSlow - 1) return;
            
            const x = margin.left + (i * spacing) + spacing / 2;
            const y = centerY - (val / maxValue) * (macdHeight / 2.5);
            
            if (i === this.config.macdSlow - 1) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Draw labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 11px Inter';
        ctx.textAlign = 'left';
        ctx.fillText('MACD (' + this.config.macdFast + ',' + this.config.macdSlow + ',' + this.config.macdSignal + ')', 
                     margin.left + 5, macdY + 14);
        
        // Draw legend
        ctx.font = '10px Inter';
        const legendX = margin.left + 100;
        
        ctx.fillStyle = '#2196f3';
        ctx.fillRect(legendX, macdY + 6, 12, 3);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText('MACD', legendX + 16, macdY + 14);
        
        ctx.fillStyle = '#ff9800';
        ctx.fillRect(legendX + 60, macdY + 6, 12, 3);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText('Signal', legendX + 76, macdY + 14);
        
        // Show current values
        if (macdLine.length > 0) {
            const currentMACD = macdLine[macdLine.length - 1];
            const currentSignal = signalLine[signalLine.length - 1];
            const currentHist = histogram[histogram.length - 1];
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(
                'M: ' + currentMACD.toFixed(5) + ' | S: ' + currentSignal.toFixed(5) + ' | H: ' + currentHist.toFixed(5),
                width - margin.right - 5,
                macdY + 14
            );
        }
    },

    // Draw Stochastic Oscillator in bottom panel
    drawStochastic(ctx, candles, spacing, margin, width, height) {
        const kPeriod = this.config.stochasticK;
        const dPeriod = this.config.stochasticD;
        
        if (candles.length < kPeriod) return;
        
        const stochHeight = 100;
        const stochY = height - margin.bottom - stochHeight - 10;
        
        // Draw panel background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(margin.left, stochY, width - margin.left - margin.right, stochHeight);
        
        // Draw border
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(margin.left, stochY, width - margin.left - margin.right, stochHeight);
        
        // Draw reference lines at 20, 50, 80
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        
        [20, 50, 80].forEach(level => {
            const y = stochY + stochHeight - (level / 100) * stochHeight;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(width - margin.right, y);
            ctx.stroke();
            
            // Draw level labels
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(level.toString(), margin.left - 5, y + 3);
        });
        
        ctx.setLineDash([]);
        
        // Draw oversold/overbought zones
        // Oversold zone (below 20) - green tint
        ctx.fillStyle = 'rgba(34, 211, 167, 0.08)';
        ctx.fillRect(margin.left, stochY + stochHeight - (20 / 100) * stochHeight, 
                     width - margin.left - margin.right, (20 / 100) * stochHeight);
        
        // Overbought zone (above 80) - red tint
        ctx.fillStyle = 'rgba(234, 57, 67, 0.08)';
        ctx.fillRect(margin.left, stochY, 
                     width - margin.left - margin.right, stochHeight - (80 / 100) * stochHeight);
        
        // Calculate %K (Fast Stochastic)
        const kValues = [];
        
        for (let i = kPeriod - 1; i < candles.length; i++) {
            let highest = -Infinity;
            let lowest = Infinity;
            
            for (let j = 0; j < kPeriod; j++) {
                highest = Math.max(highest, candles[i - j].high);
                lowest = Math.min(lowest, candles[i - j].low);
            }
            
            const k = lowest === highest ? 50 : ((candles[i].close - lowest) / (highest - lowest)) * 100;
            kValues.push({ index: i, value: k });
        }
        
        // Calculate %D (Slow Stochastic - SMA of %K)
        const dValues = [];
        
        for (let i = dPeriod - 1; i < kValues.length; i++) {
            let sum = 0;
            for (let j = 0; j < dPeriod; j++) {
                sum += kValues[i - j].value;
            }
            const d = sum / dPeriod;
            dValues.push({ index: kValues[i].index, value: d });
        }
        
        // Draw %K line (Fast - Blue)
        ctx.strokeStyle = '#2196f3';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        kValues.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const y = stochY + stochHeight - (point.value / 100) * stochHeight;
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw %D line (Slow - Orange)
        if (dValues.length > 0) {
            ctx.strokeStyle = '#ff9800';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            dValues.forEach((point, idx) => {
                const x = margin.left + (point.index * spacing) + spacing / 2;
                const y = stochY + stochHeight - (point.value / 100) * stochHeight;
                
                if (idx === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();
        }
        
        // Draw labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 11px Inter';
        ctx.textAlign = 'left';
        ctx.fillText('Stochastic (' + kPeriod + ',' + dPeriod + ')', margin.left + 5, stochY + 14);
        
        // Draw legend
        ctx.font = '10px Inter';
        const legendX = margin.left + 120;
        
        ctx.fillStyle = '#2196f3';
        ctx.fillRect(legendX, stochY + 6, 12, 3);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText('%K', legendX + 16, stochY + 14);
        
        ctx.fillStyle = '#ff9800';
        ctx.fillRect(legendX + 45, stochY + 6, 12, 3);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText('%D', legendX + 61, stochY + 14);
        
        // Show current values
        if (kValues.length > 0) {
            const currentK = kValues[kValues.length - 1].value;
            const kColor = currentK > 80 ? '#ea3943' : currentK < 20 ? '#22d3a7' : '#2196f3';
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            
            let valueText = '%K: ' + currentK.toFixed(2);
            if (dValues.length > 0) {
                const currentD = dValues[dValues.length - 1].value;
                valueText += ' | %D: ' + currentD.toFixed(2);
            }
            
            ctx.fillText(valueText, width - margin.right - 5, stochY + 14);
        }
    },

    // Draw OBV (On Balance Volume) in bottom panel
    drawOBV(ctx, candles, spacing, margin, width, height) {
        if (candles.length < 2) return;
        
        const obvHeight = 100;
        const obvY = height - margin.bottom - obvHeight - 10;
        
        // Draw panel background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(margin.left, obvY, width - margin.left - margin.right, obvHeight);
        
        // Draw border
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(margin.left, obvY, width - margin.left - margin.right, obvHeight);
        
        // Calculate OBV
        let obv = 0;
        const obvValues = [{ index: 0, value: 0 }];
        
        for (let i = 1; i < candles.length; i++) {
            const volume = candles[i].volume || 1000; // Default volume if not available
            
            if (candles[i].close > candles[i - 1].close) {
                obv += volume;
            } else if (candles[i].close < candles[i - 1].close) {
                obv -= volume;
            }
            // If close equals previous close, OBV stays the same
            
            obvValues.push({ index: i, value: obv });
        }
        
        // Find min/max for scaling
        const obvOnly = obvValues.map(v => v.value);
        const maxObv = Math.max(...obvOnly);
        const minObv = Math.min(...obvOnly);
        const obvRange = maxObv - minObv || 1;
        
        // Draw zero line (or middle line if OBV is all positive or all negative)
        const zeroY = minObv >= 0 ? obvY + obvHeight : 
                      maxObv <= 0 ? obvY : 
                      obvY + obvHeight - ((0 - minObv) / obvRange) * obvHeight;
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(margin.left, zeroY);
        ctx.lineTo(width - margin.right, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw OBV line with gradient fill
        ctx.strokeStyle = '#ff9800'; // Orange
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        obvValues.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const normalized = (point.value - minObv) / obvRange;
            const y = obvY + obvHeight - (normalized * obvHeight);
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Fill area under OBV line
        const gradient = ctx.createLinearGradient(0, obvY, 0, obvY + obvHeight);
        gradient.addColorStop(0, 'rgba(255, 152, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 152, 0, 0.05)');
        
        ctx.fillStyle = gradient;
        ctx.lineTo(margin.left + ((obvValues.length - 1) * spacing) + spacing / 2, zeroY);
        ctx.lineTo(margin.left + spacing / 2, zeroY);
        ctx.closePath();
        ctx.fill();
        
        // Draw OBV line again on top of fill
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        obvValues.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const normalized = (point.value - minObv) / obvRange;
            const y = obvY + obvHeight - (normalized * obvHeight);
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 11px Inter';
        ctx.textAlign = 'left';
        ctx.fillText('OBV (On Balance Volume)', margin.left + 5, obvY + 14);
        
        // Show current OBV value
        if (obvValues.length > 0) {
            const currentOBV = obvValues[obvValues.length - 1].value;
            const prevOBV = obvValues.length > 1 ? obvValues[obvValues.length - 2].value : 0;
            const obvChange = currentOBV - prevOBV;
            const changeColor = obvChange > 0 ? '#22d3a7' : obvChange < 0 ? '#ea3943' : '#ff9800';
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            
            const obvText = 'OBV: ' + this.formatNumber(currentOBV) + ' ';
            ctx.fillText(obvText, width - margin.right - 60, obvY + 14);
            
            ctx.fillStyle = changeColor;
            const changeText = (obvChange > 0 ? '+' : '') + this.formatNumber(obvChange);
            ctx.fillText(changeText, width - margin.right - 5, obvY + 14);
        }
        
        // Draw min/max labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '9px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(this.formatNumber(maxObv), margin.left - 5, obvY + 10);
        ctx.fillText(this.formatNumber(minObv), margin.left - 5, obvY + obvHeight - 2);
    },

    // Format large numbers with K, M, B suffixes
    formatNumber(num) {
        if (Math.abs(num) >= 1e9) {
            return (num / 1e9).toFixed(2) + 'B';
        } else if (Math.abs(num) >= 1e6) {
            return (num / 1e6).toFixed(2) + 'M';
        } else if (Math.abs(num) >= 1e3) {
            return (num / 1e3).toFixed(2) + 'K';
        }
        return num.toFixed(0);
    },

    drawATR(ctx, candles, spacing, margin, width, height) {
        if (candles.length < this.config.atrPeriod) return;
        
        const atrHeight = 100;
        const atrY = height - margin.bottom - atrHeight - 10;
        
        // Draw panel background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(margin.left, atrY, width - margin.left - margin.right, atrHeight);
        
        // Draw border
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(margin.left, atrY, width - margin.left - margin.right, atrHeight);
        
        // Calculate True Range and ATR
        const trueRanges = [];
        const atrValues = [];
        
        // Calculate True Range for each candle
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            
            const tr = Math.max(
                high - low,                    // Current high-low range
                Math.abs(high - prevClose),    // High to previous close
                Math.abs(low - prevClose)      // Low to previous close
            );
            
            trueRanges.push({ index: i, value: tr });
        }
        
        // Calculate ATR using smoothed moving average (Wilder's smoothing)
        if (trueRanges.length >= this.config.atrPeriod) {
            // First ATR is simple average of first N true ranges
            let sum = 0;
            for (let i = 0; i < this.config.atrPeriod; i++) {
                sum += trueRanges[i].value;
            }
            let atr = sum / this.config.atrPeriod;
            atrValues.push({ index: trueRanges[this.config.atrPeriod - 1].index, value: atr });
            
            // Subsequent ATR values use Wilder's smoothing: ATR = ((prior ATR * (n-1)) + current TR) / n
            for (let i = this.config.atrPeriod; i < trueRanges.length; i++) {
                atr = ((atr * (this.config.atrPeriod - 1)) + trueRanges[i].value) / this.config.atrPeriod;
                atrValues.push({ index: trueRanges[i].index, value: atr });
            }
        }
        
        if (atrValues.length === 0) return;
        
        // Find min/max for scaling
        const atrOnly = atrValues.map(v => v.value);
        const maxATR = Math.max(...atrOnly);
        const minATR = Math.min(...atrOnly);
        const atrRange = maxATR - minATR || maxATR || 1;
        
        // Draw ATR line
        ctx.strokeStyle = '#00bcd4'; // Cyan
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        atrValues.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const normalized = (point.value - minATR) / atrRange;
            const y = atrY + atrHeight - (normalized * atrHeight);
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Fill area under ATR line
        const gradient = ctx.createLinearGradient(0, atrY, 0, atrY + atrHeight);
        gradient.addColorStop(0, 'rgba(0, 188, 212, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 188, 212, 0.05)');
        
        ctx.fillStyle = gradient;
        ctx.lineTo(margin.left + (atrValues[atrValues.length - 1].index * spacing) + spacing / 2, atrY + atrHeight);
        ctx.lineTo(margin.left + (atrValues[0].index * spacing) + spacing / 2, atrY + atrHeight);
        ctx.closePath();
        ctx.fill();
        
        // Draw ATR line again on top of fill
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        atrValues.forEach((point, idx) => {
            const x = margin.left + (point.index * spacing) + spacing / 2;
            const normalized = (point.value - minATR) / atrRange;
            const y = atrY + atrHeight - (normalized * atrHeight);
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 11px Inter';
        ctx.textAlign = 'left';
        ctx.fillText(`ATR (${this.config.atrPeriod})`, margin.left + 5, atrY + 14);
        
        // Show current ATR value
        if (atrValues.length > 0) {
            const currentATR = atrValues[atrValues.length - 1].value;
            const prevATR = atrValues.length > 1 ? atrValues[atrValues.length - 2].value : currentATR;
            const atrChange = currentATR - prevATR;
            const changePercent = prevATR !== 0 ? ((atrChange / prevATR) * 100) : 0;
            const changeColor = atrChange > 0 ? '#22d3a7' : atrChange < 0 ? '#ea3943' : '#00bcd4';
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            
            const atrText = 'ATR: ' + currentATR.toFixed(4) + ' ';
            ctx.fillText(atrText, width - margin.right - 60, atrY + 14);
            
            ctx.fillStyle = changeColor;
            const changeText = (atrChange > 0 ? '+' : '') + changePercent.toFixed(2) + '%';
            ctx.fillText(changeText, width - margin.right - 5, atrY + 14);
        }
        
        // Draw min/max labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '9px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(maxATR.toFixed(4), margin.left - 5, atrY + 10);
        ctx.fillText(minATR.toFixed(4), margin.left - 5, atrY + atrHeight - 2);
    },

    // Draw price scale on right side
    drawPriceScale(ctx, margin, chartWidth, chartHeight, minPrice, maxPrice, width) {
        ctx.fillStyle = '#9eabc8'; // color-text-secondary from theme
        ctx.font = '11px Inter';
        ctx.textAlign = 'left';
        
        const numLabels = 8;
        const priceStep = (maxPrice - minPrice) / numLabels;
        
        for (let i = 0; i <= numLabels; i++) {
            const price = minPrice + (i * priceStep);
            const y = height - margin.bottom - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
            
            ctx.fillText(this.formatPrice(price), width - 75, y + 4);
        }
    },

    // Draw time scale at bottom
    drawTimeScale(ctx, candles, spacing, margin, width, height) {
        ctx.fillStyle = '#9eabc8'; // color-text-secondary from theme
        ctx.font = '11px Inter';
        ctx.textAlign = 'center';
        
        // Show more time labels for better readability
        const maxLabels = Math.min(12, Math.floor(candles.length / 5));
        const step = Math.max(1, Math.floor(candles.length / maxLabels));
        
        for (let i = 0; i < candles.length; i += step) {
            const candle = candles[i];
            const x = margin.left + (i * spacing);
            const timeStr = this.formatTime(candle.timestamp);
            const dateStr = this.formatDate(candle.timestamp);
            
            // Draw time
            ctx.fillStyle = '#9eabc8';
            ctx.fillText(timeStr, x, height - 22);
            
            // Draw date (smaller, lighter) if it's a new day or first label
            if (i === 0 || this.isDifferentDay(candles[i-step]?.timestamp, candle.timestamp)) {
                ctx.fillStyle = '#5f6c88'; // color-text-muted from theme
                ctx.font = '9px Inter';
                ctx.fillText(dateStr, x, height - 8);
                ctx.font = '11px Inter';
            }
        }
        
        // Draw a separating line above timestamps
        ctx.strokeStyle = 'rgba(88, 120, 180, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin.left, height - 40);
        ctx.lineTo(width - margin.right, height - 40);
        ctx.stroke();
    },

    // Draw crosshair
    drawCrosshair(ctx, margin, chartWidth, chartHeight, candles, spacing, priceToY) {
        const x = this.state.mouseX;
        const y = this.state.mouseY;
        
        // Draw lines - matching app's border color with more opacity
        ctx.strokeStyle = 'rgba(88, 120, 180, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + chartHeight);
        ctx.stroke();
        
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + chartWidth, y);
        ctx.stroke();
        
        ctx.setLineDash([]);
        
        // Show OHLC data for candle under cursor
        const candleIdx = Math.floor((x - margin.left) / spacing);
        if (candleIdx >= 0 && candleIdx < candles.length) {
            const candle = candles[candleIdx];
            this.drawOHLCLabel(ctx, candle, 10, 30);
            
            // Draw timestamp label at bottom
            this.drawTimestampLabel(ctx, candle.timestamp, x, this.state.height - 5);
        }
        
        // Draw price label on Y-axis
        const priceAtMouse = this.getPriceAtY(y, margin, chartHeight);
        if (priceAtMouse) {
            this.drawPriceLabel(ctx, priceAtMouse, y, this.state.width - 75);
        }
    },

    // Draw timestamp label at cursor position
    drawTimestampLabel(ctx, timestamp, x, y) {
        const timeStr = this.formatTime(timestamp);
        const dateStr = this.formatDate(timestamp);
        const fullText = `${dateStr} ${timeStr}`;
        
        // Measure text
        ctx.font = '11px Inter';
        const textWidth = ctx.measureText(fullText).width;
        
        // Draw background - using theme overlay color
        ctx.fillStyle = 'rgba(12, 22, 38, 0.95)';
        ctx.fillRect(x - textWidth/2 - 6, y - 18, textWidth + 12, 20);
        
        // Border - using theme border color
        ctx.strokeStyle = 'rgba(88, 120, 180, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - textWidth/2 - 6, y - 18, textWidth + 12, 20);
        
        // Draw text - using theme primary text color
        ctx.fillStyle = '#ecf2ff';
        ctx.textAlign = 'center';
        ctx.fillText(fullText, x, y - 4);
    },

    // Draw price label at cursor position
    drawPriceLabel(ctx, price, y, x) {
        const priceText = this.formatPrice(price);
        
        // Measure text
        ctx.font = '11px Inter';
        const textWidth = ctx.measureText(priceText).width;
        
        // Draw background - using theme overlay color
        ctx.fillStyle = 'rgba(12, 22, 38, 0.95)';
        ctx.fillRect(x, y - 10, 70, 20);
        
        // Border - using theme border color
        ctx.strokeStyle = 'rgba(88, 120, 180, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y - 10, 70, 20);
        
        // Draw text - using theme primary text color
        ctx.fillStyle = '#ecf2ff';
        ctx.textAlign = 'center';
        ctx.fillText(priceText, x + 35, y + 4);
    },

    // Get price at Y coordinate (inverse of priceToY)
    getPriceAtY(y, margin, chartHeight) {
        // This will be calculated in render context
        return null; // Placeholder - will be enhanced if needed
    },

    // Draw OHLC label
    drawOHLCLabel(ctx, candle, x, y) {
        const isGreen = candle.close >= candle.open;
        ctx.font = '12px Inter';
        
        const labels = [
            { text: 'O', value: candle.open, color: '#9eabc8' }, // color-text-secondary
            { text: 'H', value: candle.high, color: '#9eabc8' },
            { text: 'L', value: candle.low, color: '#9eabc8' },
            { text: 'C', value: candle.close, color: isGreen ? '#22d3a7' : '#ef476f' }, // neon-green / neon-red
        ];
        
        let offsetX = x;
        labels.forEach(label => {
            ctx.fillStyle = label.color;
            const text = `${label.text} ${this.formatPrice(label.value)}`;
            ctx.fillText(text, offsetX, y);
            offsetX += ctx.measureText(text).width + 15;
        });
    },

    // Draw current price line
    drawCurrentPriceLine(ctx, price, priceToY, margin, chartWidth, width) {
        const y = priceToY(price);
        
        // Dashed line - using app's neon cyan color
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)'; // neon-cyan from theme
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + chartWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Price label with neon cyan background
        ctx.fillStyle = '#38bdf8'; // neon-cyan
        ctx.fillRect(width - 75, y - 10, 70, 20);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(this.formatPrice(price), width - 40, y + 4);
    },

    // Draw candle formation timer
    drawCandleTimer(ctx, candle, x, y) {
        if (!candle || !candle.timestamp) return;
        
        const currentTime = Math.floor(Date.now() / 1000);
        const tf = this.config.timeframes[this.config.currentTimeframe];
        const elapsed = currentTime - candle.timestamp;
        const remaining = Math.max(0, tf.seconds - elapsed);
        
        // Format time remaining
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Measure text
        ctx.font = 'bold 11px Inter';
        const textWidth = ctx.measureText(timeText).width;
        
        // Draw background box - make it more visible
        const boxWidth = textWidth + 16;
        const boxHeight = 22;
        const boxX = x - boxWidth / 2;
        const boxY = y - boxHeight / 2;
        
        // Background
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        // Border with theme color
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        
        // Draw timer text
        ctx.fillStyle = '#ecf2ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timeText, x, y);
        
        // Reset baseline
        ctx.textBaseline = 'alphabetic';
    },

    // Utility: Format price
    formatPrice(price) {
        return price >= 100 ? price.toFixed(2) : price.toFixed(4);
    },

    // Utility: Round price to realistic precision
    roundPrice(price) {
        return Math.round(price * 10000) / 10000;
    },

    // Utility: Format timestamp
    formatTime(timestamp) {
        const date = new Date(timestamp * 1000);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    },

    // Utility: Format date
    formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
    },

    // Utility: Check if two timestamps are on different days
    isDifferentDay(ts1, ts2) {
        if (!ts1 || !ts2) return true;
        const d1 = new Date(ts1 * 1000);
        const d2 = new Date(ts2 * 1000);
        return d1.getDate() !== d2.getDate() || d1.getMonth() !== d2.getMonth() || d1.getFullYear() !== d2.getFullYear();
    },

    // Change timeframe
    setTimeframe(tf) {
        if (!this.config.timeframes[tf]) {
            console.error('Invalid timeframe:', tf);
            return;
        }
        
        console.log('Changing timeframe to:', tf);
        this.config.currentTimeframe = tf;
        
        // Clear existing data
        this.state.candles = [];
        
        // Stop existing timers
        if (this.state.tickTimer) clearInterval(this.state.tickTimer);
        if (this.state.candleTimer) clearInterval(this.state.candleTimer);
        
        // Reload from server with new timeframe
        this.loadServerData();
    },

    // Toggle chart type
    setChartType(type) {
        // Convert to lowercase for consistency
        this.config.chartType = type.toLowerCase();
        this.render();
    },

    // Toggle indicators
    toggleMA() {
        this.config.showMA = !this.config.showMA;
        this.render();
    },

    toggleEMA() {
        this.config.showEMA = !this.config.showEMA;
        this.render();
    },

    toggleBollinger() {
        this.config.showBollinger = !this.config.showBollinger;
        this.render();
    },

    toggleRSI() {
        this.config.showRSI = !this.config.showRSI;
        this.render();
    },

    toggleMACD() {
        this.config.showMACD = !this.config.showMACD;
        this.render();
    },

    toggleStochastic() {
        this.config.showStochastic = !this.config.showStochastic;
        this.render();
    },

    toggleOBV() {
        this.config.showOBV = !this.config.showOBV;
        this.render();
    },

    toggleATR() {
        this.config.showATR = !this.config.showATR;
        this.render();
    },

    toggleVolume() {
        this.config.showVolume = !this.config.showVolume;
        this.render();
    },

    // Change asset
    changeAsset(assetId, basePrice) {
        console.log('Changing asset to:', assetId);
        this.state.currentAsset = assetId;
        if (basePrice) this.state.basePrice = basePrice;
        
        // Stop existing timers
        if (this.state.tickTimer) clearInterval(this.state.tickTimer);
        if (this.state.candleTimer) clearInterval(this.state.candleTimer);
        
        // Reload from server for new asset
        this.state.candles = [];
        this.loadServerData();
    },

    // Cleanup
    destroy() {
        if (this.state.tickTimer) clearInterval(this.state.tickTimer);
        if (this.state.candleTimer) clearInterval(this.state.candleTimer);
        if (this.state.syncTimer) clearInterval(this.state.syncTimer);
    }
};

// Export globally
window.ProChart = ProChart;
