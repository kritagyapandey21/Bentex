/**
 * ========================================
 * CHART.JS - Lightweight Charts Implementation
 * ========================================
 * Professional TradingView-style chart with deterministic candles
 */

// Global chart state
let lwChart = null;              // Lightweight Charts instance
let candleSeries = null;         // Candlestick series
let volumeSeries = null;         // Volume series
let allCandles = [];             // All loaded candles
let currentConfig = null;        // Current chart configuration
let partialUpdateInterval = null; // Interval for partial candle updates
let clientTimeOffset = 0;        // Server-client time offset
let chart_container = null;      // Chart container element
let resizeObserver = null;       // Resize observer for chart

/**
 * Initialize Lightweight Charts
 */
function initLightweightChart(containerElement) {
    console.log('[LWChart] Initializing...');
    
    if (!containerElement) {
        console.log('[LWChart] No container provided, searching...');
        containerElement = document.getElementById('price-chart') || 
                          document.getElementById('chart-area') ||
                          document.getElementById('tv-chart-container');
    }
    
    if (!containerElement) {
        console.error('[LWChart] Chart container not found!');
        return null;
    }

    console.log('[LWChart] Container found:', containerElement.id, 'Size:', containerElement.clientWidth, 'x', containerElement.clientHeight);
    
    chart_container = containerElement;
    
    // Get container dimensions
    let width = containerElement.clientWidth || containerElement.offsetWidth || 800;
    let height = containerElement.clientHeight || containerElement.offsetHeight || 500;
    
    // If container has no size, set a minimum
    if (width < 100) width = 800;
    if (height < 100) height = 500;
    
    console.log('[LWChart] Using dimensions:', width, 'x', height);
    
    // Clear previous chart
    if (lwChart) {
        console.log('[LWChart] Removing previous chart instance');
        try {
            lwChart.remove();
        } catch (e) {
            console.error('[LWChart] Error removing chart:', e);
        }
        lwChart = null;
    }
    
    containerElement.innerHTML = '';

    // Check if LightweightCharts is available
    if (typeof LightweightCharts === 'undefined') {
        console.error('[LWChart] LightweightCharts library not loaded!');
        return null;
    }

    try {
        // Create chart with dark theme and proper time formatting
        lwChart = LightweightCharts.createChart(containerElement, {
            width: width,
            height: height,
            layout: {
                background: { color: 'transparent' },
                textColor: '#d1d4dc',
            },
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.4)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.4)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,  // Show seconds for precise time display
                rightOffset: 12,
                barSpacing: 8,
                minBarSpacing: 3,
                fixLeftEdge: false,
                fixRightEdge: false,
                borderVisible: true,
                borderColor: 'rgba(197, 203, 206, 0.4)',
                // Custom time formatter for better readability
                tickMarkFormatter: (time, tickMarkType, locale) => {
                    const date = new Date(time * 1000);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const minutes = date.getMinutes().toString().padStart(2, '0');
                    const seconds = date.getSeconds().toString().padStart(2, '0');
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = (date.getMonth() + 1).toString().padStart(2, '0');
                    
                    // Show date + time for major ticks, time only for minor ticks
                    if (tickMarkType === LightweightCharts.TickMarkType.Year ||
                        tickMarkType === LightweightCharts.TickMarkType.Month ||
                        tickMarkType === LightweightCharts.TickMarkType.DayOfMonth) {
                        return `${day}/${month} ${hours}:${minutes}`;
                    }
                    return `${hours}:${minutes}:${seconds}`;
                },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    color: '#758696',
                    width: 1,
                    style: LightweightCharts.LineStyle.Dashed,
                    labelBackgroundColor: '#2962FF',
                },
                horzLine: {
                    color: '#758696',
                    width: 1,
                    style: LightweightCharts.LineStyle.Dashed,
                    labelBackgroundColor: '#2962FF',
                },
            },
            rightPriceScale: {
                mode: LightweightCharts.PriceScaleMode.Normal,
                autoScale: true,
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.2,
                },
                borderVisible: false,
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: false,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
        });

        console.log('[LWChart] Chart instance created');

        // Add candlestick series
        candleSeries = lwChart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            priceLineVisible: true,
            lastValueVisible: true,
            priceFormat: {
                type: 'price',
                precision: 5,
                minMove: 0.00001,
            },
        });

        console.log('[LWChart] Candlestick series added');

        // Add crosshair move handler to show time tooltip
        lwChart.subscribeCrosshairMove(param => {
            if (!param.time || !param.point) {
                // Hide tooltip when not hovering
                const tooltip = document.getElementById('chart-time-tooltip');
                if (tooltip) tooltip.style.display = 'none';
                return;
            }

            // Get or create tooltip element
            let tooltip = document.getElementById('chart-time-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'chart-time-tooltip';
                tooltip.style.position = 'absolute';
                tooltip.style.padding = '8px 12px';
                tooltip.style.background = 'rgba(0, 0, 0, 0.85)';
                tooltip.style.color = '#fff';
                tooltip.style.borderRadius = '4px';
                tooltip.style.fontSize = '12px';
                tooltip.style.fontFamily = 'monospace';
                tooltip.style.pointerEvents = 'none';
                tooltip.style.zIndex = '1000';
                tooltip.style.border = '1px solid rgba(255, 255, 255, 0.2)';
                tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
                containerElement.appendChild(tooltip);
            }

            // Format the time
            const date = new Date(param.time * 1000);
            const dateStr = date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: '2-digit' 
            });
            const timeStr = date.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false
            });

            // Get candle data at this time
            const candleData = param.seriesData.get(candleSeries);
            let tooltipContent = `<div style="font-weight: bold; margin-bottom: 4px;">${dateStr}</div>`;
            tooltipContent += `<div style="color: #26a69a;">${timeStr}</div>`;
            
            if (candleData) {
                tooltipContent += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">`;
                tooltipContent += `<div>O: ${candleData.open?.toFixed(5) || '-'}</div>`;
                tooltipContent += `<div>H: ${candleData.high?.toFixed(5) || '-'}</div>`;
                tooltipContent += `<div>L: ${candleData.low?.toFixed(5) || '-'}</div>`;
                tooltipContent += `<div>C: ${candleData.close?.toFixed(5) || '-'}</div>`;
                tooltipContent += `</div>`;
            }

            tooltip.innerHTML = tooltipContent;
            tooltip.style.display = 'block';

            // Position tooltip
            const containerRect = containerElement.getBoundingClientRect();
            const tooltipWidth = 180;
            const tooltipHeight = 160;
            
            let left = param.point.x + 15;
            let top = param.point.y - tooltipHeight / 2;

            // Keep tooltip within container bounds
            if (left + tooltipWidth > containerRect.width) {
                left = param.point.x - tooltipWidth - 15;
            }
            if (top < 0) top = 10;
            if (top + tooltipHeight > containerRect.height) {
                top = containerRect.height - tooltipHeight - 10;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        });

        // Auto-resize on container size change
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
        
        resizeObserver = new ResizeObserver(entries => {
            if (lwChart && entries.length > 0) {
                const { width, height } = entries[0].contentRect;
                if (width > 0 && height > 0) {
                    lwChart.applyOptions({ 
                        width: width,
                        height: height 
                    });
                    console.log('[LWChart] Chart resized to:', width, 'x', height);
                }
            }
        });
        resizeObserver.observe(containerElement);

        console.log('[LWChart] Initialization complete!');
        return lwChart;
        
    } catch (error) {
        console.error('[LWChart] Error during initialization:', error);
        return null;
    }
}

/**
 * Load chart data from API
 */
async function loadLightweightChart(assetId, timeframeMinutes = 1, candleCount = 500) {
    if (!assetId) {
        console.error('[LWChart] Asset ID required');
        return;
    }

    console.log('[LWChart] Loading chart for', assetId, 'timeframe:', timeframeMinutes, 'count:', candleCount);

    // Initialize chart if not already done
    if (!lwChart) {
        console.log('[LWChart] Chart not initialized, initializing now...');
        const container = document.getElementById('price-chart') || 
                         document.getElementById('chart-area') ||
                         document.getElementById('tv-chart-container');
        initLightweightChart(container);
    }

    if (!lwChart || !candleSeries) {
        console.error('[LWChart] Chart or series not available after initialization!');
        return;
    }

    try {
        // Build API URL
        const params = new URLSearchParams({
            asset: assetId,
            timeframe: timeframeMinutes.toString(),
            count: candleCount.toString(),
            includePartial: 'true'
        });
        
        const url = `/api/ohlc?${params.toString()}`;
        console.log('[LWChart] Fetching:', url);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('[LWChart] Received data:', data.candles ? data.candles.length : 0, 'candles');
        
        if (!data.ok || !data.candles) {
            throw new Error(data.error || 'Invalid response format');
        }

        // Calculate server time offset
        clientTimeOffset = data.serverTimeMs - Date.now();

        // Store configuration
        currentConfig = {
            symbol: assetId,
            timeframeMinutes: timeframeMinutes,
            version: data.version || 'v1',
            timeframeMs: timeframeMinutes * 60 * 1000
        };

        // Convert candles for Lightweight Charts (ms → seconds)
        allCandles = data.candles.map(c => ({
            time: Math.floor((c.start_time_ms || c.time * 1000) / 1000),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        }));

        // Add server-provided partial if present
        if (data.partial) {
            const partial = {
                time: Math.floor(data.partial.start_time_ms / 1000),
                open: data.partial.open,
                high: data.partial.high,
                low: data.partial.low,
                close: data.partial.close,
            };
            allCandles.push(partial);
        }

        console.log('[LWChart] Setting', allCandles.length, 'candles on series');
        
        // Set candle data
        if (candleSeries && allCandles.length > 0) {
            candleSeries.setData(allCandles);
            
            // Set visible range to show last 50-100 candles
            const lastCandle = allCandles[allCandles.length - 1];
            const startIndex = Math.max(0, allCandles.length - 80);
            const firstVisible = allCandles[startIndex];
            
            setTimeout(() => {
                if (lwChart) {
                    lwChart.timeScale().setVisibleRange({
                        from: firstVisible.time,
                        to: lastCandle.time + 300, // Add 5 minutes padding
                    });
                    console.log('[LWChart] Chart visible range set');
                }
            }, 100);
        }

        // Start partial candle updates
        console.log('[LWChart] Starting partial candle updates...');
        startPartialCandleUpdates();

        // Update current price display if available
        if (allCandles.length > 0) {
            const lastPrice = allCandles[allCandles.length - 1].close;
            updateCurrentPrice(lastPrice);
            console.log('[LWChart] Current price:', lastPrice);
        }

        console.log('[LWChart] ✓ Chart loaded successfully:', allCandles.length, 'candles for', assetId);
        return allCandles;
        
    } catch (error) {
        console.error('[LWChart] Failed to load chart:', error);
        logError(`Chart load failed: ${error.message}`);
        return null;
    }
}

/**
 * Update partial (forming) candle
 */
function updatePartialCandle() {
    if (!currentConfig || !candleSeries) {
        console.log('[LWChart] Update skipped - no config or series');
        return;
    }

    try {
        const { symbol, timeframeMinutes, version, timeframeMs } = currentConfig;
        const serverTimeMs = Date.now() + clientTimeOffset;

        // Get current candle index and start time
        const currentCandleIndex = getCandleIndex(serverTimeMs, timeframeMinutes);
        const currentCandleStartMs = getCandleStartTime(currentCandleIndex, timeframeMinutes);

        // Get previous close price
        let prevClose = 42000; // Default fallback
        if (allCandles && allCandles.length > 0) {
            const currentCandleTime = Math.floor(currentCandleStartMs / 1000);
            const completedCandles = allCandles.filter(c => c.time < currentCandleTime);
            if (completedCandles.length > 0) {
                prevClose = completedCandles[completedCandles.length - 1].close;
            } else {
                prevClose = allCandles[0].open || 42000;
            }
        }

        // Generate partial candle
        const seedBase = `${symbol}|${timeframeMinutes}|${version}|`;
        const partial = generatePartialCandle({
            seedBase,
            index: currentCandleIndex,
            prevClose,
            candleStartMs: currentCandleStartMs,
            serverTimeMs,
            timeframeMs,
            volatility: 0.02,
            timeframeMinutes,
            priceDecimals: 5,
        });

        // Update chart
        candleSeries.update(partial);
        
        // Log every 5 seconds
        if (!window._lastUpdateLog || Date.now() - window._lastUpdateLog > 5000) {
            console.log('[LWChart] Updating candle:', partial.close.toFixed(2));
            window._lastUpdateLog = Date.now();
        }

        // Update current price display
        updateCurrentPrice(partial.close);
        
    } catch (error) {
        console.error('[LWChart] Error updating partial candle:', error);
    }
}

/**
 * Start partial candle updates
 */
function startPartialCandleUpdates() {
    stopPartialCandleUpdates();
    
    // Track the last candle index to detect when a new candle starts
    let lastCandleIndex = -1;
    
    const updateFunction = () => {
        if (!currentConfig || !candleSeries) {
            console.log('[LWChart] Update skipped - no config or series');
            return;
        }

        try {
            const { symbol, timeframeMinutes, version, timeframeMs } = currentConfig;
            const serverTimeMs = Date.now() + clientTimeOffset;

            // Get current candle index and start time
            const currentCandleIndex = getCandleIndex(serverTimeMs, timeframeMinutes);
            const currentCandleStartMs = getCandleStartTime(currentCandleIndex, timeframeMinutes);

            // Check if we moved to a new candle (completed previous candle)
            if (lastCandleIndex !== -1 && currentCandleIndex > lastCandleIndex) {
                console.log('[LWChart] 🎯 New candle started! Fetching completed candle from server...');
                
                // Fetch the completed candle from server to ensure data consistency
                // Do NOT regenerate client-side to avoid data mismatch
                const completedCandleIndex = lastCandleIndex;
                const completedCandleStartMs = getCandleStartTime(completedCandleIndex, timeframeMinutes);
                const completedCandleTime = Math.floor(completedCandleStartMs / 1000);
                
                // Fetch from server (async, but we'll handle it in background)
                fetch(`/api/ohlc?asset=${symbol}&timeframe=${timeframeMinutes}&count=1&end_time=${completedCandleTime}`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.candles && data.candles.length > 0) {
                            const completedCandle = data.candles[data.candles.length - 1];
                            
                            // Remove any existing candle at this time (the partial one)
                            allCandles = allCandles.filter(c => c.time !== completedCandleTime);
                            
                            // Add the server-saved completed candle to history
                            allCandles.push(completedCandle);
                            allCandles.sort((a, b) => a.time - b.time);
                            
                            console.log('[LWChart] ✓ Completed candle fetched from DB:', completedCandle.time, 'Close:', completedCandle.close);
                            
                            // Update the series with the completed candle from DB
                            candleSeries.update(completedCandle);
                        }
                    })
                    .catch(error => {
                        console.error('[LWChart] Error fetching completed candle:', error);
                    });
            }
            
            // Update last candle index
            lastCandleIndex = currentCandleIndex;

            // Get previous close for current partial candle
            let prevClose = 42000;
            if (allCandles && allCandles.length > 0) {
                const currentCandleTime = Math.floor(currentCandleStartMs / 1000);
                const completedCandles = allCandles.filter(c => c.time < currentCandleTime);
                if (completedCandles.length > 0) {
                    prevClose = completedCandles[completedCandles.length - 1].close;
                } else {
                    prevClose = allCandles[0].open || 42000;
                }
            }

            // Generate partial candle (currently forming)
            const seedBase = `${symbol}|${timeframeMinutes}|${version}|`;
            const partial = generatePartialCandle({
                seedBase,
                index: currentCandleIndex,
                prevClose,
                candleStartMs: currentCandleStartMs,
                serverTimeMs,
                timeframeMs,
                volatility: 0.02,
                timeframeMinutes,
                priceDecimals: 5,
            });

            // Update chart with partial candle
            candleSeries.update(partial);
            
            // Log every 5 seconds
            if (!window._lastUpdateLog || Date.now() - window._lastUpdateLog > 5000) {
                console.log('[LWChart] Updating partial candle:', partial.close.toFixed(2));
                window._lastUpdateLog = Date.now();
            }

            // Update current price display
            updateCurrentPrice(partial.close);
            
        } catch (error) {
            console.error('[LWChart] Error in update loop:', error);
        }
    };
    
    // Run immediately, then every second
    updateFunction();
    partialUpdateInterval = setInterval(updateFunction, 1000);
    
    console.log('[LWChart] ✓ Partial candle updates started (1s interval)');
}

/**
 * Stop partial candle updates
 */
function stopPartialCandleUpdates() {
    if (partialUpdateInterval) {
        clearInterval(partialUpdateInterval);
        partialUpdateInterval = null;
    }
}

/**
 * Update current price display
 */
function updateCurrentPrice(price) {
    if (typeof price !== 'number') return;
    
    // Update global current price
    currentPrice = price;
    
    // Update DOM elements
    const priceElements = document.querySelectorAll('[data-current-price]');
    priceElements.forEach(el => {
        el.textContent = price.toFixed(5);
    });
    
    // Update specific price display if exists
    const currentPriceEl = document.getElementById('current-price') || 
                          document.getElementById('currentPrice');
    if (currentPriceEl) {
        currentPriceEl.textContent = price.toFixed(5);
    }
}

/**
 * Change chart timeframe
 */
async function changeChartTimeframe(timeframeMinutes) {
    if (!currentConfig) return;
    
    stopPartialCandleUpdates();
    await loadLightweightChart(currentConfig.symbol, timeframeMinutes, 500);
}

/**
 * Cleanup chart resources
 */
function cleanupChart() {
    stopPartialCandleUpdates();
    
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    
    if (lwChart) {
        lwChart.remove();
        lwChart = null;
    }
    
    candleSeries = null;
    volumeSeries = null;
    allCandles = [];
    currentConfig = null;
}

// Expose functions globally
window.LWChart = {
    init: initLightweightChart,
    load: loadLightweightChart,
    updatePartial: updatePartialCandle,
    changeTimeframe: changeChartTimeframe,
    cleanup: cleanupChart,
    getInstance: () => lwChart,
    getSeries: () => candleSeries,
    getCandles: () => allCandles,
    getConfig: () => currentConfig,
};

// Backward compatibility exports
window.initLightweightChart = initLightweightChart;
window.loadLightweightChart = loadLightweightChart;
window.currentPrice = 0;
