/**
 * ========================================
 * APP.JS - Main Application Logic
 * ========================================
 * Handles navigation, trading panel, asset sidebar, and initialization.
 */

let currentUser = null;

function initNavigation() {
    logActivity('Initializing navigation...');

    const navItems = document.querySelectorAll('[data-page]');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = item.getAttribute('data-page');
            navigateToPage(pageId);
        });
    });
}

/**
 * Navigate to a specific page via client-side router.
 */
async function navigateToPage(pageId) {
    logActivity(`Navigating to page: ${pageId}`);
    await loadPageIntoRoot(pageId);
    updateActiveNavState(pageId);
    onPageLoaded(pageId);
    // Update URL hash for bookmarking/back
    if (location.hash !== `#${pageId}`) {
        location.hash = `#${pageId}`;
    }
}

/**
 * Fetch and inject page HTML into #page-root based on page key.
 */
async function loadPageIntoRoot(pageId) {
    const routeMap = {
        'trade': 'src/pages/trade.html',
        'tournaments': 'src/pages/tournaments.html',
        'promotions': 'src/pages/promotions.html',
        'help': 'src/pages/help.html',
        'account': 'src/pages/account.html',
        'analytics': 'src/pages/analytics.html',
        'market': 'src/pages/market.html',
        'deposit': 'src/pages/deposit.html',
        'settings': 'src/pages/settings.html',
        'history': 'src/pages/history.html'
    };
    const url = routeMap[pageId] || routeMap['trade'];
    const root = document.getElementById('page-root');
    if (!root) return;
    try {
        const res = await fetch(url, { cache: 'no-cache' });
        const html = await res.text();
        root.innerHTML = html;
    } catch (err) {
        logError(`Failed to load page '${pageId}' from ${url}`);
        root.innerHTML = `<div class="glass-panel p-6"><h2 class="text-xl text-white">Page not found</h2><p class="text-gray-400">Tried to load: ${url}</p></div>`;
    }
}

/**
 * After a page is injected, run page-specific initializers.
 */
function onPageLoaded(pageId) {
    // Fullscreen toggle button hookup
    const btnFullscreenToggle = document.getElementById('btn-fullscreen-toggle');
    if (btnFullscreenToggle) {
        btnFullscreenToggle.addEventListener('click', () => {
            const el = document.getElementById('tv-chart-container');
            if (!document.fullscreenElement) {
                if (el && el.requestFullscreen) {
                    el.requestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        });
        
        document.addEventListener('fullscreenchange', () => {
            const inFS = !!document.fullscreenElement;
            const icon = btnFullscreenToggle.querySelector('i');
            
            if (icon) {
                // Change icon based on fullscreen state
                icon.className = inFS ? 'fas fa-compress' : 'fas fa-expand';
            }
            
            // Update title
            btnFullscreenToggle.title = inFS ? 'Exit Fullscreen' : 'Fullscreen';
            
            // Trigger chart resize when entering/exiting fullscreen
            setTimeout(() => {
                if (window.ProChart && typeof window.ProChart.handleResize === 'function') {
                    window.ProChart.handleResize();
                }
            }, 100);
        });
    }

    if (pageId === 'trade') {
        // Initialize trade page (order per backup)
        if (typeof initAssetSidebar === 'function') initAssetSidebar();
        if (typeof initTrading === 'function') initTrading();
        
        // Initialize Lightweight Charts (TradingView-style) with delay to ensure DOM is ready
        setTimeout(() => {
            console.log('[APP] Initializing chart system...');
            console.log('[APP] LightweightCharts available:', typeof LightweightCharts !== 'undefined');
            console.log('[APP] LWChart available:', typeof LWChart !== 'undefined');
            
            // Find the chart container
            const chartContainer = document.getElementById('price-chart') || 
                                  document.getElementById('chart-area') ||
                                  document.getElementById('tv-chart-container');
            
            if (!chartContainer) {
                console.error('[APP] Chart container not found! Looking for #price-chart, #chart-area, or #tv-chart-container');
                return;
            }
            
            console.log('[APP] Chart container found:', chartContainer.id, 'Size:', chartContainer.clientWidth, 'x', chartContainer.clientHeight);
            
            // Check if Lightweight Charts library is loaded
            if (typeof LightweightCharts === 'undefined') {
                console.error('[APP] Lightweight Charts library not loaded!');
                return;
            }
            
            // Initialize Lightweight Charts
            if (window.LWChart && typeof LWChart.init === 'function') {
                try {
                    console.log('[APP] Calling LWChart.init()...');
                    const chart = LWChart.init(chartContainer);
                    if (chart) {
                        console.log('[APP] ✓ Lightweight Charts initialized successfully');
                        
                        // Load chart for default asset
                        const defaultAsset = window.currentAssetId || 'AAPL';
                        console.log('[APP] Loading chart for asset:', defaultAsset);
                        
                        setTimeout(() => {
                            LWChart.load(defaultAsset, 1, 500).then(() => {
                                console.log('[APP] ✓ Chart data loaded');
                            }).catch(err => {
                                console.error('[APP] Chart load error:', err);
                            });
                        }, 300);
                    } else {
                        console.error('[APP] Chart initialization returned null');
                    }
                } catch (error) {
                    console.error('[APP] Error initializing Lightweight Charts:', error);
                }
            } else {
                console.error('[APP] LWChart not defined or init function missing!');
                console.log('[APP] window.LWChart:', window.LWChart);
            }
            
            // Setup chart controls
            setupTimeframeControls();
            setupChartTypeDropdown();
            setupIndicatorsDropdown();
            setupChartTypeButtons();
        }, 200);
        
        if (typeof initIntegratedChartControls === 'function') initIntegratedChartControls();
        if (typeof populateChartAssetSelector === 'function') populateChartAssetSelector();

        // Ensure the chart sizes correctly after injection
        requestAnimationFrame(() => {
            try {
                if (window.App && App.Chart && typeof App.Chart.handleResize === 'function') {
                    App.Chart.handleResize();
                }
            } catch (e) { /* noop */ }
        });
        if (currentUser) {
            updateUserHeader(currentUser);
        }
    }

    if (pageId === 'account') {
        initializeAccountPage();
    }

    if (pageId === 'deposit') {
        initializeDepositPage();
    }

    if (pageId === 'tournaments' && typeof loadTournaments === 'function') loadTournaments();
    if (pageId === 'promotions' && typeof loadPromotions === 'function') loadPromotions();
    if (pageId === 'history' && typeof loadHistory === 'function') loadHistory();
    if (pageId === 'analytics' && typeof loadAnalytics === 'function') loadAnalytics();
}

/**
 * Update active navigation state.
 */
function updateActiveNavState(activePageId) {
    const navItems = document.querySelectorAll('[data-page]');
    navItems.forEach(item => {
        const pageId = item.getAttribute('data-page');
        const isActive = (pageId === activePageId);
        // Header nav links use .nav-link/.active-nav-link
        if (item.classList.contains('nav-link')) {
            item.classList.toggle('active-nav-link', isActive);
        }
        // Sidebar items use .sidebar-item/.active-sidebar-item
        if (item.classList.contains('sidebar-item')) {
            item.classList.toggle('active-sidebar-item', isActive);
        }
    });
}

/**
 * Initialize the asset sidebar with collapsible tabs.
 */
function initAssetSidebar() {
    logActivity('Initializing asset sidebar (backup behavior)...');

    const assetColumn = document.getElementById('asset-selection-column');
    const topSelector = document.getElementById('currentAssetSelector');

    // Toggle from top asset selector, intercept native dropdown
    if (topSelector && assetColumn) {
        const toggleSidebar = () => {
            const willOpen = assetColumn.classList.contains('hidden');
            assetColumn.classList.toggle('hidden');
            logActivity(`Asset sidebar ${willOpen ? 'opened' : 'closed'} from top selector`);
        };
        const pointerHandler = (e) => { e.preventDefault(); e.stopPropagation(); toggleSidebar(); };
        topSelector.addEventListener('pointerdown', pointerHandler);
        topSelector.addEventListener('mousedown', pointerHandler);
        topSelector.addEventListener('keydown', (e) => {
            const triggerKeys = ['Enter', ' ', 'Spacebar', 'ArrowDown', 'ArrowUp'];
            if (triggerKeys.includes(e.key)) { e.preventDefault(); e.stopPropagation(); toggleSidebar(); }
        });

        // Close when clicking outside
        document.addEventListener('click', (ev) => {
            if (assetColumn.classList.contains('hidden')) return;
            const target = ev.target;
            if (!assetColumn.contains(target) && target !== topSelector) {
                assetColumn.classList.add('hidden');
                logActivity('Asset sidebar closed (outside click)');
            }
        });
        // Close with Escape
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && !assetColumn.classList.contains('hidden')) {
                assetColumn.classList.add('hidden');
                logActivity('Asset sidebar closed (Escape)');
            }
        });
        
        // Close button functionality
        const closeBtn = document.getElementById('closeAssetPanel');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                assetColumn.classList.add('hidden');
                logActivity('Asset sidebar closed (close button)');
            });
        }
    }

    // Tabs
    const assetTabButtons = document.querySelectorAll('.asset-tab-btn');
    assetTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-asset-tab');
            assetTabButtons.forEach(btn => btn.classList.remove('active-tab'));
            button.classList.add('active-tab');
            document.querySelectorAll('.asset-tab-content').forEach(content => content.classList.add('hidden'));
            const targetContent = document.getElementById(`asset-tab-content-${targetTab}`);
            if (targetContent) targetContent.classList.remove('hidden');
            if (targetTab === 'forex') loadAssets();
            if (targetTab === 'otc') loadOTCPairs();
            if (targetTab === 'crypto') loadCryptoAssets();
        });
    });

    // Default list
    loadAssets();
}

/**
 * Initialize trading panel logic.
 */
function initTrading() {
    logActivity('Initializing trading panel...');
    
    const buyButton = document.getElementById('buyButton');
    const sellButton = document.getElementById('sellButton');
    const timeButtons = document.querySelectorAll('.expiration-time');
    const amountButtons = document.querySelectorAll('[data-amount]');
    
    if (buyButton) {
        buyButton.addEventListener('click', () => executeTrade('buy'));
    }
    
    if (sellButton) {
        sellButton.addEventListener('click', () => executeTrade('sell'));
    }
    
    const amountInput = document.getElementById('investmentAmount');
    if (amountInput && !amountInput.dataset.bound) {
        amountInput.dataset.bound = 'true';
        amountInput.addEventListener('input', updatePotentialWin);
        amountInput.addEventListener('change', updatePotentialWin);
    }

    const increaseBtn = document.getElementById('increaseAmount');
    const decreaseBtn = document.getElementById('decreaseAmount');

    const adjustAmount = (delta) => {
        if (!amountInput) return;
        const current = parseFloat(amountInput.value || '0') || 0;
        const step = parseFloat(amountInput.step || '1') || 1;
        const next = Math.max(1, current + (delta * step));
        amountInput.value = String(next);
        updatePotentialWin();
    };

    if (increaseBtn && !increaseBtn.dataset.bound) {
        increaseBtn.dataset.bound = 'true';
        increaseBtn.addEventListener('click', (event) => {
            event.preventDefault();
            adjustAmount(1);
        });
    }

    if (decreaseBtn && !decreaseBtn.dataset.bound) {
        decreaseBtn.dataset.bound = 'true';
        decreaseBtn.addEventListener('click', (event) => {
            event.preventDefault();
            adjustAmount(-1);
        });
    }

    timeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            timeButtons.forEach(b => b.classList.remove('active-btn'));
            btn.classList.add('active-btn');
        });
    });
    
    amountButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            amountButtons.forEach(b => b.classList.remove('active-btn'));
            btn.classList.add('active-btn');
            const amount = parseFloat(btn.getAttribute('data-amount') || '0');
            setInvestmentAmount(amount);
        });
    });
    
    updateActiveTrades();
    updatePotentialWin();
}

/**
 * Execute a trade (buy or sell).
 */
function executeTrade(direction) {
    const amountInput = document.getElementById('investmentAmount');
    const payoutEl = document.getElementById('payoutPercent');
    const assetSelector = document.getElementById('currentAssetSelector');
    const assetNameEl = document.getElementById('currentAssetName');
    const expirationElement = document.querySelector('.expiration-time.active-btn');
    const currency = (document.body && document.body.dataset && document.body.dataset.currency) ? document.body.dataset.currency : 'USD';

    const amountValue = parseFloat(amountInput?.value || '0');
    const assetId = assetSelector?.value || assetNameEl?.textContent || 'EUR/USD';
    const assetName = assetNameEl?.textContent || assetId;
    const expirationTime = expirationElement ? expirationElement.textContent : '5m';
    const payoutPercent = parseFloat((payoutEl?.textContent || '').replace('%', '')) || 0;

    logActivity(`Submitting ${direction.toUpperCase()} trade: ${assetId} / ${assetName} (${formatCurrency(amountValue, currency)}) exp ${expirationTime}`);

    const payload = {
        direction,
        asset_id: assetId,
        asset_name: assetName,
        amount: amountValue,
        expiration: expirationTime,
        payout_percent: payoutPercent,
    };

    fetchJson('/api/trades', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
        .then((data) => {
            currentUser = data.user || currentUser;
            updateUserHeader(currentUser);
            updateActiveTrades();
            
            // Show trade placed popup
            showTradePopup(direction, assetName, amountValue, expirationTime, currency);
        })
        .catch((err) => {
            console.error(err);
            alert(err.message || 'Failed to execute trade.');
        });
}

/**
 * Set investment amount and update UI.
 */
function setInvestmentAmount(amount) {
    const amountInput = document.getElementById('investmentAmount');
    if (amountInput) {
        amountInput.value = amount;
        updatePotentialWin();
    }
}

/**
 * Set expiration time button as active.
 */
function setExpirationTime(time) {
    const timeButtons = document.querySelectorAll('.expiration-time');
    timeButtons.forEach(btn => {
        if (btn.textContent === time) {
            btn.classList.add('active-btn');
        } else {
            btn.classList.remove('active-btn');
        }
    });
}

/**
 * Initialize integrated chart controls (timeframe, chart type, indicators).
 */
function initIntegratedChartControls() {
    logActivity('Initializing integrated chart controls...');
    
    const timeframeButtons = document.querySelectorAll('[data-timeframe]');
    timeframeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            timeframeButtons.forEach(b => b.classList.remove('active-btn'));
            btn.classList.add('active-btn');
            const timeframe = btn.getAttribute('data-timeframe');
            setTimeframe(timeframe);
        });
    });
    
    const chartTypeButtons = document.querySelectorAll('[data-chart-type]');
    chartTypeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            chartTypeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const chartType = btn.getAttribute('data-chart-type');
            setChartType(chartType);
        });
    });
    
    const indicatorButton = document.getElementById('indicatorButton');
    if (indicatorButton) {
        indicatorButton.addEventListener('click', () => {
            logActivity('Toggling indicators...');
            if (window.App && App.Chart) {
                App.Chart.showSMA = !App.Chart.showSMA;
                // Text update
                indicatorButton.textContent = App.Chart.showSMA ? 'Hide SMA' : 'Show SMA';
            }
        });
    }
    
    const assetSelector = document.getElementById('chart-asset-selector');
    if (assetSelector) {
        assetSelector.addEventListener('change', (e) => {
            const assetId = e.target.value;
            logActivity(`Chart asset changed to: ${assetId}`);
            if (window.App && App.Sim && typeof App.Sim.changeAsset === 'function') {
                App.Sim.changeAsset(assetId);
            }
        });
    }
    
    const currentTopSelector = document.getElementById('currentAssetSelector');
    if (currentTopSelector) {
        currentTopSelector.addEventListener('change', (e) => {
            const assetId = e.target.value;
            logActivity(`Trading asset changed to: ${assetId}`);
            if (window.App && App.Sim && typeof App.Sim.changeAsset === 'function') {
                App.Sim.changeAsset(assetId);
            }
            const chartSel = document.getElementById('chart-asset-selector');
            if (chartSel) chartSel.value = assetId;
        });
    }
}

/**
 * Set chart timeframe.
 */
function setTimeframe(timeframe) {
    logActivity(`Timeframe set to: ${timeframe}`);
    
    // Convert timeframe string to minutes
    const timeframeMap = {
        '1m': 1,
        '5m': 5,
        '15m': 15,
        '30m': 30,
        '1h': 60,
        '4h': 240,
        '1d': 1440,
    };
    
    const timeframeMinutes = timeframeMap[timeframe] || 1;
    
    // Use Lightweight Charts if available
    if (window.LWChart && typeof LWChart.changeTimeframe === 'function') {
        LWChart.changeTimeframe(timeframeMinutes);
    } else if (window.ChartStreamClient && typeof ChartStreamClient.setTimeframe === 'function') {
        ChartStreamClient.setTimeframe(timeframe || '1m');
    }
    
    // Map timeframe to number of visible bars for App.Chart.viewRange
    const map = {
        '1m': 100,
        '5m': 200,
        '15m': 300,
        '1h': 400,
        '4h': 500,
    };
    if (window.App && App.Chart) {
        App.Chart.viewRange = map[timeframe] || 100;
    }
}

/**
 * Set chart type (line or candles).
 */
function setChartType(type) {
    logActivity(`Chart type set to: ${type}`);
    if (window.ProChart) {
        ProChart.setChartType(type === 'line' ? 'line' : 'candles');
    } else if (window.App && App.Chart && typeof App.Chart.setChartType === 'function') {
        App.Chart.setChartType(type);
    }
}

/**
 * Setup timeframe controls for ProChart
 */
function setupTimeframeControls() {
    // Find timeframe buttons with data-timeframe attribute
    const timeframeButtons = document.querySelectorAll('.timeframe-btn[data-timeframe]');
    const expirationButtons = document.querySelectorAll('.expiration-time');
    
    timeframeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tf = btn.getAttribute('data-timeframe');
            
            if (window.ProChart && ProChart.config.timeframes[tf]) {
                ProChart.setTimeframe(tf);
                
                // Update active state for timeframe buttons only
                timeframeButtons.forEach(b => b.classList.remove('active-btn'));
                btn.classList.add('active-btn');
            }
        });
    });
}

/**
 * Close all dropdowns (helper function)
 */
function closeAllDropdowns() {
    const dropdowns = ['chartTypeDropdown', 'indicatorsDropdown'];
    dropdowns.forEach(id => {
        const dropdown = document.getElementById(id);
        if (dropdown) {
            dropdown.classList.add('hidden');
        }
    });
}

/**
 * Setup chart type dropdown menu
 */
function setupChartTypeDropdown() {
    const dropdownBtn = document.getElementById('chartTypeDropdownBtn');
    const dropdown = document.getElementById('chartTypeDropdown');
    const chartTypeLabel = document.getElementById('chartTypeLabel');
    
    if (!dropdownBtn || !dropdown) return;
    
    // Move dropdown to body to avoid clipping issues
    document.body.appendChild(dropdown);
    
    // Position dropdown using fixed positioning
    const positionDropdown = () => {
        const btnRect = dropdownBtn.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = (btnRect.bottom + 4) + 'px';
        dropdown.style.left = btnRect.left + 'px';
        dropdown.style.right = 'auto';
        dropdown.style.zIndex = '999999';
    };
    
    // Toggle dropdown on button click
    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = dropdown.classList.contains('hidden');
        
        // Close all dropdowns first
        closeAllDropdowns();
        
        if (isHidden) {
            positionDropdown();
            dropdown.classList.remove('hidden');
        } else {
            dropdown.classList.add('hidden');
        }
    });
    
    // Reposition on window resize
    window.addEventListener('resize', () => {
        if (!dropdown.classList.contains('hidden')) {
            positionDropdown();
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== dropdownBtn) {
            dropdown.classList.add('hidden');
        }
    });
    
    // Close button functionality
    const closeBtn = dropdown.querySelector('.close-chart-type-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.add('hidden');
        });
    }
    
    // Setup all chart type options
    const chartTypes = [
        { type: 'candles', label: 'Candlestick', icon: 'fa-chart-candlestick' },
        { type: 'line', label: 'Line', icon: 'fa-chart-line' },
        { type: 'area', label: 'Area', icon: 'fa-chart-area' },
        { type: 'bars', label: 'Bars', icon: 'fa-chart-bar' }
    ];
    
    const options = dropdown.querySelectorAll('.chart-type-option');
    options.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const chartType = btn.getAttribute('data-chart-type');
            const typeInfo = chartTypes.find(t => t.type === chartType);
            
            if (window.ProChart && typeof window.ProChart.setChartType === 'function') {
                window.ProChart.setChartType(chartType);
                
                // Update button label and icon
                if (chartTypeLabel && typeInfo) {
                    chartTypeLabel.textContent = typeInfo.label;
                    const btnIcon = dropdownBtn.querySelector('i.fas');
                    if (btnIcon) {
                        btnIcon.className = `fas ${typeInfo.icon}`;
                    }
                }
                
                // Update check marks
                dropdown.querySelectorAll('.chart-type-check').forEach(check => {
                    check.style.display = 'none';
                });
                const checkIcon = btn.querySelector('.chart-type-check');
                if (checkIcon) {
                    checkIcon.style.display = 'inline';
                }
                
                // Close dropdown after selection
                dropdown.classList.add('hidden');
            }
        });
    });
}

/**
 * Setup indicators dropdown menu
 */
function setupIndicatorsDropdown() {
    const dropdownBtn = document.getElementById('indicatorsDropdownBtn');
    const dropdown = document.getElementById('indicatorsDropdown');
    
    if (!dropdownBtn || !dropdown) return;
    
    // Move dropdown to body to avoid clipping issues
    document.body.appendChild(dropdown);
    
    // Position dropdown using fixed positioning
    const positionDropdown = () => {
        const btnRect = dropdownBtn.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = (btnRect.bottom + 4) + 'px';
        dropdown.style.left = btnRect.left + 'px';
        dropdown.style.right = 'auto';
        dropdown.style.zIndex = '999999';
    };
    
    // Toggle dropdown on button click
    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = dropdown.classList.contains('hidden');
        
        // Close all dropdowns first
        closeAllDropdowns();
        
        if (isHidden) {
            positionDropdown();
            dropdown.classList.remove('hidden');
        } else {
            dropdown.classList.add('hidden');
        }
    });
    
    // Reposition on window resize
    window.addEventListener('resize', () => {
        if (!dropdown.classList.contains('hidden')) {
            positionDropdown();
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== dropdownBtn) {
            dropdown.classList.add('hidden');
        }
    });
    
    // Close button functionality
    const closeBtn = dropdown.querySelector('.close-dropdown-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.add('hidden');
        });
    }
    
    // Setup all indicator toggles
    const indicators = [
        { id: 'toggleMAIndicator', method: 'toggleMA', config: 'showMA' },
        { id: 'toggleEMAIndicator', method: 'toggleEMA', config: 'showEMA' },
        { id: 'toggleBollingerIndicator', method: 'toggleBollinger', config: 'showBollinger' },
        { id: 'toggleRSIIndicator', method: 'toggleRSI', config: 'showRSI' },
        { id: 'toggleMACDIndicator', method: 'toggleMACD', config: 'showMACD' },
        { id: 'toggleStochasticIndicator', method: 'toggleStochastic', config: 'showStochastic' },
        { id: 'toggleVolumeIndicator', method: 'toggleVolume', config: 'showVolume' },
        { id: 'toggleOBVIndicator', method: 'toggleOBV', config: 'showOBV' },
        { id: 'toggleATRIndicator', method: 'toggleATR', config: 'showATR' }
    ];
    
    indicators.forEach(({ id, method, config }) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // For now, only MA and Volume are implemented in ProChart
            if (window.ProChart && typeof window.ProChart[method] === 'function') {
                window.ProChart[method]();
                const checkIcon = btn.querySelector('.indicator-check');
                if (checkIcon && window.ProChart.config[config] !== undefined) {
                    checkIcon.style.display = window.ProChart.config[config] ? 'inline' : 'none';
                }
            } else {
                // Show coming soon message for unimplemented indicators
                const checkIcon = btn.querySelector('.indicator-check');
                if (checkIcon) {
                    const isActive = checkIcon.style.display !== 'none';
                    checkIcon.style.display = isActive ? 'none' : 'inline';
                    
                    if (!isActive) {
                        // Show temporary notification
                        showNotification(`${id.replace('toggle', '').replace('Indicator', '')} indicator - Coming Soon!`, 'info');
                    }
                }
            }
        });
        
        // Set initial state for implemented indicators
        const checkIcon = btn.querySelector('.indicator-check');
        if (checkIcon && window.ProChart && window.ProChart.config[config] !== undefined) {
            checkIcon.style.display = window.ProChart.config[config] ? 'inline' : 'none';
        }
    });
}

// Notification queue to manage popup positions
let notificationQueue = [];
let notificationOffset = 100; // Starting offset from top (below header)

// Helper function to show notifications with stacking
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'fixed right-4 z-[10000] glass-panel px-4 py-3 rounded-lg shadow-lg transition-all duration-300';
    notification.style.minWidth = '250px';
    notification.style.opacity = '0';
    
    const colors = {
        info: 'var(--neon-cyan)',
        success: 'var(--neon-green)',
        warning: '#f59e0b',
        error: '#ef4444'
    };
    
    notification.innerHTML = `
        <div class="flex items-center gap-2">
            <i class="fas fa-info-circle" style="color: ${colors[type]}"></i>
            <span class="text-sm text-gray-200">${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Calculate position based on existing notifications
    const topPosition = notificationOffset + (notificationQueue.length * 80);
    notification.style.top = topPosition + 'px';
    notificationQueue.push(notification);
    
    // Fade in
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.remove();
            notificationQueue = notificationQueue.filter(n => n !== notification);
            repositionNotifications();
        }, 300);
    }, 3000);
}

// Reposition all notifications smoothly
function repositionNotifications() {
    notificationQueue.forEach((notification, index) => {
        notification.style.top = (notificationOffset + (index * 80)) + 'px';
    });
}

// Show trade placed popup
function showTradePopup(direction, asset, amount, expiration, currency = 'USD') {
    const popup = document.createElement('div');
    popup.className = 'fixed right-4 z-[10000] glass-panel rounded-lg shadow-2xl transition-all duration-300 overflow-hidden';
    popup.style.minWidth = '320px';
    popup.style.maxWidth = '400px';
    popup.style.opacity = '0';
    popup.style.transform = 'translateX(100%)';
    
    const directionColor = direction.toLowerCase() === 'buy' ? 'var(--neon-green)' : '#ef5350';
    const directionIcon = direction.toLowerCase() === 'buy' ? 'fa-arrow-up' : 'fa-arrow-down';
    const directionText = direction.toLowerCase() === 'buy' ? 'CALL' : 'PUT';
    
    popup.innerHTML = `
        <div class="p-4">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background: ${directionColor}20;">
                        <i class="fas ${directionIcon} text-lg" style="color: ${directionColor};"></i>
                    </div>
                    <div>
                        <div class="text-xs text-gray-400">Trade Placed</div>
                        <div class="text-sm font-bold" style="color: ${directionColor};">${directionText}</div>
                    </div>
                </div>
                <button class="close-popup-btn text-gray-400 hover:text-white transition-colors">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="space-y-2 mb-3">
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-400">Asset:</span>
                    <span class="text-white font-semibold">${asset}</span>
                </div>
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-400">Amount:</span>
                    <span class="text-[var(--neon-cyan)] font-bold">${formatCurrency(amount, currency)}</span>
                </div>
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-400">Expiration:</span>
                    <span class="text-white">${expiration}</span>
                </div>
            </div>
            
            <div class="flex items-center gap-2 p-2 rounded" style="background: rgba(56, 189, 248, 0.1);">
                <i class="fas fa-check-circle text-[var(--neon-cyan)]"></i>
                <span class="text-xs text-gray-300">Your trade is now active</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Calculate position based on existing notifications
    const topPosition = notificationOffset + (notificationQueue.length * 80);
    popup.style.top = topPosition + 'px';
    notificationQueue.push(popup);
    
    // Slide in animation
    setTimeout(() => {
        popup.style.opacity = '1';
        popup.style.transform = 'translateX(0)';
    }, 10);
    
    // Close button handler
    const closeBtn = popup.querySelector('.close-popup-btn');
    closeBtn.addEventListener('click', () => {
        closePopup(popup);
    });
    
    // Auto-close after 5 seconds
    setTimeout(() => {
        closePopup(popup);
    }, 5000);
}

// Close popup with animation
function closePopup(popup) {
    popup.style.opacity = '0';
    popup.style.transform = 'translateX(100%)';
    setTimeout(() => {
        popup.remove();
        notificationQueue = notificationQueue.filter(n => n !== popup);
        repositionNotifications();
    }, 300);
}

/**
 * Setup chart type buttons (Candles/Line)
 */
function setupChartTypeButtons() {
    const chartTypeButtons = document.querySelectorAll('[data-chart-type]');
    
    chartTypeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const chartType = this.getAttribute('data-chart-type');
            
            // Update active state
            chartTypeButtons.forEach(b => b.classList.remove('active-btn'));
            this.classList.add('active-btn');
            
            // Update ProChart if available
            if (window.ProChart) {
                ProChart.setChartType(chartType);
            }
        });
    });
}

/**
 * Main application initialization (runs on DOM ready).
 */
let activeTradesPollingId = null;

function initApp() {
    logActivity('=== Tanix Trading Platform Initializing ===');
    fetchCurrentUser()
        .then(user => {
            currentUser = user;
            updateUserHeader(user);
            maybeInitAccountPage();
            
            // Start polling for active trades to detect resolutions
            startActiveTradesPolling();
        })
        .catch(err => {
        console.error(err);
        window.location.href = '/login';
    });

    initNavigation();

    // Determine initial route from hash or default to trade
    const initialRoute = (location.hash && location.hash.startsWith('#')) ? location.hash.substring(1) : 'trade';
    navigateToPage(initialRoute);

    // Support browser back/forward
    window.addEventListener('hashchange', () => {
        const route = (location.hash && location.hash.startsWith('#')) ? location.hash.substring(1) : 'trade';
        navigateToPage(route);
    });

    // Quick shortcut buttons
    const depositBtn = document.getElementById('depositBtn');
    if (depositBtn) {
        depositBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage('deposit');
        });
    }

    // Initialize user dropdown menu
    initUserDropdown();

    logActivity('=== Initialization Complete ===');
}

/**
 * Start polling for active trades to detect when they resolve.
 */
function startActiveTradesPolling() {
    // Initial load
    if (typeof updateActiveTrades === 'function') {
        updateActiveTrades();
    }
    
    // Poll every 3 seconds to check for resolved trades
    if (activeTradesPollingId) {
        clearInterval(activeTradesPollingId);
    }
    
    activeTradesPollingId = setInterval(() => {
        if (typeof updateActiveTrades === 'function') {
            updateActiveTrades();
        }
    }, 3000);
}

/**
 * Initialize User Dropdown Menu
 */
function initUserDropdown() {
    const userMenu = document.getElementById('userMenu');
    const userDropdown = document.getElementById('userDropdown');
    const userMenuChevron = document.getElementById('userMenuChevron');
    
    if (!userMenu || !userDropdown) return;
    
    // Function to position dropdown
    function positionUserDropdown() {
        const rect = userMenu.getBoundingClientRect();
        userDropdown.style.top = `${rect.bottom + 8}px`;
        userDropdown.style.left = `${rect.right - 256}px`; // 256px = w-64
    }
    
    // Toggle dropdown on click
    userMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = userDropdown.classList.contains('hidden');
        
        if (isHidden) {
            positionUserDropdown();
            userDropdown.classList.remove('hidden');
            if (userMenuChevron) userMenuChevron.classList.add('rotated');
        } else {
            userDropdown.classList.add('hidden');
            if (userMenuChevron) userMenuChevron.classList.remove('rotated');
        }
    });
    
    // Reposition on window resize
    window.addEventListener('resize', () => {
        if (!userDropdown.classList.contains('hidden')) {
            positionUserDropdown();
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!userMenu.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.add('hidden');
            if (userMenuChevron) userMenuChevron.classList.remove('rotated');
        }
    });
    
    // Close button functionality
    const closeBtn = userDropdown.querySelector('.close-dropdown-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.add('hidden');
            if (userMenuChevron) userMenuChevron.classList.remove('rotated');
        });
    }
    
    // Handle menu item clicks
    const menuItems = userDropdown.querySelectorAll('.user-menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = item.getAttribute('data-action');
            
            // Close dropdown
            userDropdown.classList.add('hidden');
            if (userMenuChevron) userMenuChevron.classList.remove('rotated');
            
            // Handle action
            switch(action) {
                case 'account':
                    navigateToPage('account');
                    break;
                case 'history':
                    navigateToPage('history');
                    break;
                case 'analytics':
                    navigateToPage('analytics');
                    break;
                case 'deposit':
                    navigateToPage('deposit');
                    break;
                case 'logout':
                    await handleLogout();
                    break;
            }
        });
    });
}

/**
 * Handle user logout
 */
async function handleLogout() {
    try {
        const res = await fetch('/logout', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (res.ok) {
            // Clear current user
            currentUser = null;
            
            // Redirect to login page
            window.location.href = '/login';
        } else {
            console.error('Logout failed');
            alert('Failed to logout. Please try again.');
        }
    } catch (error) {
        console.error('Logout error:', error);
        alert('An error occurred during logout.');
    }
}

document.addEventListener('DOMContentLoaded', initApp);

async function fetchCurrentUser() {
    const res = await fetch('/api/me', {
        headers: {
            'Accept': 'application/json'
        }
    });
    if (!res.ok) {
        throw new Error('Failed to load user profile');
    }
    const data = await res.json();
    if (!data.ok) {
        throw new Error(data.error || 'Failed to load user profile');
    }
    return data.user;
}

function updateUserHeader(user) {
    if (!user) return;
    const balanceEl = document.getElementById('balanceAmount');
    if (balanceEl) {
        balanceEl.textContent = formatCurrency(user.balance || 0, user.currency || 'USD');
    }
    const userMenu = document.getElementById('userMenu');
    if (userMenu) {
        const nameSpan = document.getElementById('userMenuName');
        if (nameSpan) {
            nameSpan.textContent = user.email;
            nameSpan.title = user.email;
        }
        const avatar = userMenu.querySelector('div');
        if (avatar) {
            avatar.textContent = (user.initials || 'TR').slice(0, 2).toUpperCase();
        }
    }
    
    // Update dropdown email
    const dropdownEmail = document.getElementById('dropdownUserEmail');
    if (dropdownEmail) {
        dropdownEmail.textContent = user.email;
        dropdownEmail.title = user.email;
    }
    
    if (document && document.body) {
        document.body.dataset.userEmail = user.email || '';
        document.body.dataset.currency = user.currency || 'USD';
    }
    const emailBadge = document.getElementById('currentUserEmail');
    if (emailBadge) {
        emailBadge.textContent = user.email;
        emailBadge.title = user.email;
    }
    const currentRoute = (location.hash && location.hash.startsWith('#')) ? location.hash.substring(1) : 'trade';
    if (currentRoute === 'deposit') {
        initializeDepositPage();
    }
}

function initializeAccountPage() {
    if (!currentUser) return;
    const emailEl = document.getElementById('account-email');
    if (emailEl) {
        emailEl.textContent = `${currentUser.email} • ID: ${currentUser.account_id}`;
    }
    const sessionEmailEl = document.getElementById('account-session-email');
    if (sessionEmailEl) {
        sessionEmailEl.textContent = currentUser.email;
        sessionEmailEl.title = currentUser.email;
    }
    const nicknameInput = document.getElementById('account-nickname');
    const firstNameInput = document.getElementById('account-first-name');
    const lastNameInput = document.getElementById('account-last-name');
    if (nicknameInput) nicknameInput.value = currentUser.nickname || '';
    if (firstNameInput) firstNameInput.value = currentUser.first_name || '';
    if (lastNameInput) lastNameInput.value = currentUser.last_name || '';
    const currencyDisplay = document.getElementById('account-currency-display');
    const currencyOptions = document.getElementById('account-currency-options');
    const currencyWrapper = document.getElementById('account-currency-wrapper');
    if (currencyDisplay && currencyOptions) {
        // Set initial value
        currencyDisplay.textContent = currentUser.currency || 'USD';
        
        // Toggle options on click
        currencyDisplay.addEventListener('click', () => {
            currencyOptions.classList.toggle('open');
        });
        
        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!currencyWrapper.contains(e.target)) {
                currencyOptions.classList.remove('open');
            }
        });
        
        // Select option
        currencyOptions.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI') {
                const value = e.target.dataset.value;
                currencyDisplay.textContent = value;
                currencyOptions.classList.remove('open');
            }
        });
    }
    const twoFactorToggle = document.getElementById('account-two-factor');
    if (twoFactorToggle) twoFactorToggle.checked = !!currentUser.two_factor_enabled;
    const emailToggle = document.getElementById('account-email-notify');
    if (emailToggle) emailToggle.checked = !!currentUser.email_notifications;

    const profileForm = document.getElementById('account-profile-form');
    if (profileForm && !profileForm.dataset.bound) {
        profileForm.dataset.bound = 'true';
        profileForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const payload = {
                nickname: nicknameInput?.value || '',
                first_name: firstNameInput?.value || '',
                last_name: lastNameInput?.value || '',
                currency: currencyDisplay?.textContent || 'USD',
                two_factor_enabled: twoFactorToggle?.checked || false,
                email_notifications: emailToggle?.checked || false,
            };
            const res = await fetch('/api/me', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                alert(data.error || 'Failed to update profile');
                return;
            }
            currentUser = data.user;
            updateUserHeader(currentUser);
            alert('Profile updated successfully');
        });
    }

    const passwordForm = document.getElementById('account-password-form');
    if (passwordForm && !passwordForm.dataset.bound) {
        passwordForm.dataset.bound = 'true';
        passwordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const oldPassword = document.getElementById('account-old-password')?.value || '';
            const newPassword = document.getElementById('account-new-password')?.value || '';
            const res = await fetch('/api/me/password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                alert(data.error || 'Failed to update password');
                return;
            }
            alert('Password updated successfully');
            passwordForm.reset();
        });
    }

    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn && !logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = 'true';
        logoutBtn.addEventListener('click', (event) => {
            event.preventDefault();
            window.location.href = '/logout';
        });
    }
}

function maybeInitAccountPage() {
    const currentRoute = (location.hash && location.hash.startsWith('#')) ? location.hash.substring(1) : 'trade';
    if (currentRoute === 'account') {
        initializeAccountPage();
    }
}

function initializeDepositPage() {
    const depositPage = document.getElementById('deposit-page');
    if (!depositPage) return;

    const currency = (currentUser && currentUser.currency) || (document.body?.dataset?.currency) || 'USD';
    const emailEl = document.getElementById('deposit-user-email');
    if (emailEl && currentUser) {
        emailEl.textContent = currentUser.email;
        emailEl.title = currentUser.email;
    }

    const amountInput = document.getElementById('depositAmount');
    const summaryEl = document.getElementById('depositSummary');
    const amountButtons = depositPage.querySelectorAll('.amount-option[data-amount]');
    const increaseBtn = document.getElementById('increaseDeposit');
    const decreaseBtn = document.getElementById('decreaseDeposit');
    const submitBtn = document.getElementById('depositSubmit');

    const clampAmount = (value) => {
        const min = parseFloat(amountInput?.min || '10') || 10;
        const numeric = Number.isFinite(value) ? value : parseFloat(value || '0');
        const normalized = Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : min;
        return Math.max(min, normalized);
    };

    const updateSummary = (value) => {
        if (!summaryEl) return;
        const amount = clampAmount(value || parseFloat(amountInput?.value || '0'));
        summaryEl.textContent = `You are about to deposit ${formatCurrency(amount, currency)}.`;
    };

    amountButtons.forEach(btn => {
        const amount = parseFloat(btn.dataset.amount || '0');
        btn.textContent = formatCurrency(amount, currency);
        if (!btn.dataset.bound) {
            btn.dataset.bound = 'true';
            btn.addEventListener('click', () => {
                amountButtons.forEach(b => b.classList.remove('active-btn'));
                btn.classList.add('active-btn');
                if (amountInput) {
                    amountInput.value = String(amount);
                    updateSummary(amount);
                }
            });
        }
    });

    if (amountInput && !amountInput.dataset.bound) {
        amountInput.dataset.bound = 'true';
        amountInput.addEventListener('input', () => updateSummary(parseFloat(amountInput.value || '0')));
        amountInput.addEventListener('change', () => updateSummary(parseFloat(amountInput.value || '0')));
    }

    const adjustAmount = (delta) => {
        if (!amountInput) return;
        const current = parseFloat(amountInput.value || '0') || 0;
        const step = parseFloat(amountInput.step || '10') || 10;
        const next = clampAmount(current + (delta * step));
        amountInput.value = String(next);
        updateSummary(next);
    };

    if (increaseBtn && !increaseBtn.dataset.bound) {
        increaseBtn.dataset.bound = 'true';
        increaseBtn.addEventListener('click', (event) => {
            event.preventDefault();
            adjustAmount(1);
        });
    }

    if (decreaseBtn && !decreaseBtn.dataset.bound) {
        decreaseBtn.dataset.bound = 'true';
        decreaseBtn.addEventListener('click', (event) => {
            event.preventDefault();
            adjustAmount(-1);
        });
    }

    if (submitBtn && !submitBtn.dataset.bound) {
        submitBtn.dataset.bound = 'true';
        submitBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            if (!amountInput) return;
            const amountValue = clampAmount(parseFloat(amountInput.value || '0'));
            try {
                const res = await fetch('/api/deposit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ amount: amountValue })
                });
                const data = await res.json();
                if (!res.ok || !data.ok) {
                    alert(data.error || 'Unable to process deposit.');
                    return;
                }
                currentUser = data.user;
                updateUserHeader(currentUser);
                if (summaryEl) {
                    summaryEl.textContent = `Deposit successful! Your new balance is ${formatCurrency(currentUser.balance, currentUser.currency)}.`;
                }
                alert(`Deposit successful! Your new balance is ${formatCurrency(currentUser.balance, currentUser.currency)}.`);
            } catch (err) {
                console.error(err);
                alert('Unexpected error while processing deposit. Please try again.');
            }
        });
    }

    updateSummary(parseFloat(amountInput?.value || '0'));
}
