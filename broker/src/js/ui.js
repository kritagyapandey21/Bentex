/**
 * ========================================
 * UI.JS - UI Helpers & Data Loading
 * ========================================
 * Functions for asset selection, data loading, and DOM manipulation.
 */

const assetCategoryCache = {};
const assetLookup = {};
let assetCatalogPromise = null;

function normalizeAsset(asset, category) {
    const changeType = asset.changeType || asset.change_type || 'neutral';
    return {
        ...asset,
        changeType,
        category: category || asset.category,
        isOTC: Boolean(category === 'otc' || asset.isOTC),
    };
}

async function fetchAssetsByCategory(category) {
    const cacheKey = category ? category.toLowerCase() : 'all';
    if (assetCategoryCache[cacheKey]) {
        return assetCategoryCache[cacheKey];
    }
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const data = await fetchJson(`/api/assets${query}`);
    if (!category) {
        const catalog = data.assets || {};
        const normalizedCatalog = {};
        Object.entries(catalog).forEach(([key, assets]) => {
            const normalizedList = (assets || []).map((asset) => normalizeAsset(asset, key));
            normalizedList.forEach((asset) => {
                if (asset?.id) assetLookup[asset.id] = asset;
                if (asset?.name) assetLookup[asset.name] = asset;
            });
            assetCategoryCache[key] = normalizedList;
            normalizedCatalog[key] = normalizedList;
        });
        assetCategoryCache[cacheKey] = normalizedCatalog;
        return normalizedCatalog;
    }
    const payload = (data.assets || []).map((asset) => normalizeAsset(asset, category));
    payload.forEach((asset) => {
        if (asset?.id) assetLookup[asset.id] = asset;
        if (asset?.name) assetLookup[asset.name] = asset;
    });
    assetCategoryCache[cacheKey] = payload;
    return payload;
}

function renderAssetList(container, assets, category) {
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(assets) || assets.length === 0) {
        container.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">No assets available</div>';
        return;
    }
    assets.forEach((asset) => {
        const normalized = normalizeAsset(asset, category);
        if (normalized?.id) {
            assetLookup[normalized.id] = normalized;
        }
        if (normalized?.name) {
            assetLookup[normalized.name] = normalized;
        }
        const changeType = normalized.changeType;
        const wrapper = document.createElement('div');
        wrapper.className = 'glow-on-hover p-3 flex justify-between items-center rounded-lg';
        wrapper.innerHTML = `
            <div>
                <div class="text-sm font-medium text-white">${normalized.name || normalized.id}</div>
                <span class="text-xs font-semibold ${changeType === 'positive' ? 'text-[var(--neon-green)]' : changeType === 'negative' ? 'text-[var(--neon-red)]' : 'text-gray-300'}">${normalized.price || '—'}</span>
            </div>
            <span class="text-xs px-1.5 py-0.5 rounded ${changeType === 'positive' ? 'bg-green-900/50 text-[var(--neon-green)]' : changeType === 'negative' ? 'bg-red-900/50 text-[var(--neon-red)]' : 'bg-slate-800/60 text-gray-300'}">${normalized.change || '—'}</span>
        `;
        wrapper.addEventListener('click', () => selectAsset(normalized));
        container.appendChild(wrapper);
    });
}

function formatCountdown(secondsRemaining) {
    if (!Number.isFinite(secondsRemaining)) return '—';
    const seconds = Math.max(0, Math.round(secondsRemaining));
    if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
    if (seconds >= 60) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}m ${secs}s`;
    }
    return `${seconds}s`;
}

/**
 * Selects an asset, updates the chart header, and restarts the chart simulation.
 */
function selectAsset(asset) {
    if (!asset) return;
    const changeType = asset.changeType || asset.change_type || 'neutral';
    const assetId = asset.id || asset.name;
    const assetName = asset.name || assetId || '—';
    const displayName = asset.isOTC ? assetName : assetName;
    logActivity(`Asset selected: ${displayName}`);

    const topSel = document.getElementById('currentAssetSelector');
    if (topSel && assetId) {
        try { topSel.value = assetId; } catch (err) { /* ignore mismatched options */ }
    }
    const nameEl = document.getElementById('currentAssetName');
    if (nameEl) nameEl.textContent = displayName;

    const priceEl = document.getElementById('currentAssetPrice');
    if (priceEl && asset.price !== undefined) priceEl.textContent = asset.price;

    const changeEl = document.getElementById('currentAssetChange');
    if (changeEl) {
        changeEl.textContent = asset.change || '—';
        changeEl.className = `text-sm font-medium px-2 py-1 rounded-md ${changeType === 'positive' ? 'bg-green-900/50 text-[var(--neon-green)]' : changeType === 'negative' ? 'bg-red-900/50 text-[var(--neon-red)]' : 'bg-slate-800/60 text-gray-300'}`;
    }

    const payoutEl = document.getElementById('payoutPercent');
    if (payoutEl) {
        const payoutValue = asset.payout || asset.payout_percent || 95;
        payoutEl.textContent = `${payoutValue}%`;
    }

    // Close the asset column after selection (backup behavior)
    const assetColumn = document.getElementById('asset-selection-column');
    if (assetColumn && !assetColumn.classList.contains('hidden')) {
        assetColumn.classList.add('hidden');
    }
    
    updatePotentialWin();

    // Store current asset ID globally
    window.currentAssetId = assetId;

    // Load Lightweight Charts for the new asset
    if (window.LWChart && typeof LWChart.load === 'function') {
        // Get initial price from asset or use default
        const initialPrice = parseFloat(String(asset.price || '100').replace(/[^0-9.]/g, '')) || 100;
        LWChart.load(assetId, 1, 500).catch(err => {
            logError(`Failed to load Lightweight Chart: ${err.message}`);
        });
    }

    if (window.App && App.Sim && typeof App.Sim.changeAsset === 'function' && assetId) {
        let simId = assetId;
        if (asset.isOTC && !simId.startsWith('OTC-')) {
            simId = `OTC-${assetName.replace(/[^A-Z0-9]/g, '')}`;
        }
        if (simId) {
            const usingServerFeed = window.App && App.Chart && App.Chart.useServerFeed;
            if (!usingServerFeed) {
                if (!App.Sim.getAsset || !App.Sim.getAsset(simId)) {
                    if (Array.isArray(App.Sim.ASSET_CONFIGS)) {
                        App.Sim.ASSET_CONFIGS.push({ id: simId, name: simId, vol: 0.00015, drift: 0.000001, mean: 100.0, jump: 0.006, price: 100.0, data: [], history: [] });
                    }
                }
            }
            if (typeof App.Sim.changeAsset === 'function') {
                App.Sim.changeAsset(simId);
            }
            const sel = document.getElementById('chart-asset-selector');
            if (sel) sel.value = simId;
        }
    }
}

/**
 * Updates the 'Potential Payout' UI based on amount and asset payout.
 */
function updatePotentialWin() {
    const amountInput = document.getElementById('investmentAmount');
    const payoutLabel = document.getElementById('payoutPercent');
    if (!amountInput || !payoutLabel) return;

    const amount = parseFloat(amountInput.value || '0') || 0;
    const payoutPercent = parseFloat((payoutLabel.textContent || '').replace('%', '')) || 0;
    const potentialWin = amount + (amount * payoutPercent / 100);
    const currency = (document.body && document.body.dataset && document.body.dataset.currency) ? document.body.dataset.currency : 'USD';

    const potentialWinEl = document.getElementById('potentialWin');
    if (potentialWinEl) {
        potentialWinEl.textContent = formatCurrency(potentialWin, currency);
    }
    const multiplierEl = document.getElementById('multiplierValue');
    if (multiplierEl) {
        multiplierEl.textContent = `x${(1 + payoutPercent / 100).toFixed(2)}`;
    }
}

/**
 * Updates the 'Active Trades' list with live countdowns and auto-refresh.
 */
let activeTradesIntervalId = null;
let lastKnownTrades = [];

async function updateActiveTrades() {
    const countEl = document.getElementById('activeTradesCount');
    const listEl = document.getElementById('activeTradesList');
    if (!countEl || !listEl) return;

    try {
        const data = await fetchJson('/api/trades');
        const trades = data.trades || [];
        countEl.textContent = trades.length;

        if (data.user) {
            currentUser = data.user;
            updateUserHeader(currentUser);
        }

        // Check for resolved trades (trades that were in lastKnownTrades but not in current trades)
        if (lastKnownTrades.length > 0 && trades.length < lastKnownTrades.length) {
            const currentTradeIds = new Set(trades.map(t => t.id));
            const resolvedTrades = lastKnownTrades.filter(t => !currentTradeIds.has(t.id));
            
            // Fetch history to get results of resolved trades
            if (resolvedTrades.length > 0) {
                try {
                    const historyData = await fetchJson('/api/history');
                    const history = historyData.history || [];
                    const currency = (currentUser && currentUser.currency) || (document.body?.dataset?.currency) || 'USD';
                    
                    resolvedTrades.forEach(resolvedTrade => {
                        const historyEntry = history.find(h => h.id === resolvedTrade.id);
                        if (historyEntry) {
                            const result = historyEntry.result;
                            const net = parseFloat(historyEntry.net || 0);
                            const isWin = result === 'win';
                            
                            // Show notification
                            const message = isWin 
                                ? `🎉 WIN! ${historyEntry.asset_name || historyEntry.asset}\nProfit: +${formatCurrency(net, currency)}`
                                : `📉 Loss. ${historyEntry.asset_name || historyEntry.asset}\nLoss: ${formatCurrency(net, currency)}`;
                            
                            showTradeNotification(message, isWin);
                        }
                    });
                } catch (err) {
                    console.error('Failed to fetch history for resolved trades:', err);
                }
            }
        }

        lastKnownTrades = trades;

        if (trades.length === 0) {
            listEl.innerHTML = '<div class="text-center py-8 text-gray-500 text-sm">No active trades</div>';
            // Clear interval if no trades
            if (activeTradesIntervalId) {
                clearInterval(activeTradesIntervalId);
                activeTradesIntervalId = null;
            }
            return;
        }

        renderActiveTradesList(listEl, trades);
        
        // Start countdown interval if not already running
        if (!activeTradesIntervalId) {
            activeTradesIntervalId = setInterval(() => {
                renderActiveTradesList(listEl, lastKnownTrades);
            }, 1000); // Update every second
        }

    } catch (err) {
        logError(`Failed to load active trades: ${err.message}`);
        listEl.innerHTML = '<div class="text-center py-6 text-[var(--neon-red)] text-sm">Unable to load active trades</div>';
    }
}

/**
 * Renders the active trades list with live countdown timers.
 */
function renderActiveTradesList(listEl, trades) {
    if (!listEl) return;
    
    const currency = (currentUser && currentUser.currency) || (document.body?.dataset?.currency) || 'USD';
    const now = Date.now();
    
    listEl.innerHTML = '';
    trades.forEach((trade) => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center text-sm py-2 border-b border-[var(--glass-border)]';
        const expiresAt = trade.expires_at ? new Date(trade.expires_at).getTime() : null;
        const secondsRemaining = expiresAt ? Math.max(0, (expiresAt - now) / 1000) : null;
        const amountLabel = formatCurrency(trade.amount || 0, currency);
        
        // Change color to red when less than 10 seconds remaining
        const countdownColor = secondsRemaining !== null && secondsRemaining < 10 
            ? 'text-[var(--neon-red)]' 
            : 'text-gray-400';
        
        item.innerHTML = `
            <div class="flex flex-col">
                <span class="text-white font-medium">${trade.asset_name || trade.asset}</span>
                <span class="text-xs text-gray-400">${trade.direction?.toUpperCase() || ''} • Payout ${Math.round(trade.payout_percent || 0)}%</span>
            </div>
            <div class="text-right">
                <div class="text-[var(--neon-green)] font-semibold">${amountLabel}</div>
                <div class="text-xs font-mono ${countdownColor}">${formatCountdown(secondsRemaining)}</div>
            </div>
        `;
        listEl.appendChild(item);
    });
}

/**
 * Show a trade result notification.
 */
function showTradeNotification(message, isWin) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-20 right-4 z-50 glass-panel p-2 rounded-lg transform transition-all duration-300 anim-pop ${
        isWin ? 'border-l-4 border-[var(--neon-green)] win-popup' : 'border-l-4 border-[var(--neon-red)] loss-popup'
    }`;
    notification.style.maxWidth = '240px';
    notification.style.minWidth = '160px';
    notification.style.boxShadow = 'none';
    notification.innerHTML = `
        <div class="flex items-start space-x-3">
            <div class="flex-shrink-0 mt-1">
                <i class="fas ${isWin ? 'fa-trophy text-[var(--neon-green)]' : 'fa-times-circle text-[var(--neon-red)]'} text-2xl animate-bounce"></i>
            </div>
            <div class="flex-1">
                <div class="text-white font-bold text-lg mb-1">${isWin ? 'You Win!' : 'You Lost'}</div>
                <div class="text-white font-medium whitespace-pre-line">${message}</div>
            </div>
            <button class="text-gray-400 hover:text-white ml-2 mt-1" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        ${isWin ? '<canvas class="confetti-canvas absolute inset-0 pointer-events-none"></canvas>' : ''}
    `;
    notification.style.position = 'fixed';
    notification.style.overflow = 'visible';
    document.body.appendChild(notification);

    // Animate confetti for win
    if (isWin) {
        setTimeout(() => {
            launchConfetti(notification.querySelector('.confetti-canvas'));
        }, 100);
    } else {
        // Animate shake for loss
        notification.classList.add('shake-anim');
    }

    // Slide in animation
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
// End of showTradeNotification

// Simple confetti animation for win popup
function launchConfetti(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = 320;
    const H = canvas.height = 80;
    const confetti = Array.from({length: 24}, () => ({
        x: Math.random() * W,
        y: Math.random() * -H/2,
        r: 6 + Math.random() * 6,
        d: 2 + Math.random() * 2,
        color: [
            'var(--neon-green)',
            'var(--neon-cyan)',
            'var(--neon-blue)',
            'var(--neon-red)',
            '#fff',
        ][Math.floor(Math.random()*5)]
    }));
    let frame = 0;
    function draw() {
        ctx.clearRect(0,0,W,H);
        confetti.forEach(c => {
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, 2*Math.PI);
            ctx.fillStyle = c.color;
            ctx.globalAlpha = 0.85;
            ctx.fill();
            ctx.globalAlpha = 1;
        });
        update();
        if (frame++ < 40) requestAnimationFrame(draw);
    }
    function update() {
        confetti.forEach(c => {
            c.y += c.d + Math.random()*1.5;
            c.x += Math.sin(frame/4 + c.r) * 1.2;
        });
    }
    draw();
}
}

/**
 * Populate chart asset selector from App.Sim configs and the static Forex/Crypto lists
 */
async function populateChartAssetSelector() {
    const topSel = document.getElementById('currentAssetSelector');
    const chartSel = document.getElementById('chart-asset-selector');
    if (!topSel && !chartSel) return;

    try {
        const catalog = await fetchAssetsByCategory();
        const items = [];
        Object.values(catalog).forEach((assets) => {
            assets.forEach((asset) => {
                if (!asset?.id) return;
                assetLookup[asset.id] = asset;
                if (asset?.name) assetLookup[asset.name] = asset;
                items.push({
                    id: asset.id,
                    name: asset.name,
                });
            });
        });

        const seen = new Set();
        const unique = items.filter((item) => {
            if (!item.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        if (topSel) topSel.innerHTML = '';
        if (chartSel) chartSel.innerHTML = '';

        unique.forEach((item) => {
            if (topSel) {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.name || item.id;
                topSel.appendChild(option);
            }
            if (chartSel) {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.name || item.id;
                chartSel.appendChild(option);
            }
        });

        const preferred = (window.App && App.Sim && App.Sim.currentAssetId)
            || document.getElementById('currentAssetName')?.textContent
            || (unique.length ? unique[0].id : null);

        if (preferred) {
            if (topSel) topSel.value = preferred;
            if (chartSel) chartSel.value = preferred;
            const selectedAsset = assetLookup[preferred];
            if (selectedAsset) {
                selectAsset(selectedAsset);
            }
        }
    } catch (err) {
        logError(`Failed to populate asset selectors: ${err.message}`);
    }
}

/**
 * Loads Forex assets into the sidebar.
 */
async function loadAssets() {
    logActivity('Loading Forex assets...');
    const assetsList = document.getElementById('asset-tab-content-forex');
    if (!assetsList) return;
    assetsList.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">Loading assets...</div>';
    try {
        const assets = await fetchAssetsByCategory('forex');
        renderAssetList(assetsList, assets, 'forex');
    } catch (err) {
        logError(`Failed to load forex assets: ${err.message}`);
        assetsList.innerHTML = '<div class="text-center py-6 text-[var(--neon-red)] text-sm">Unable to load assets</div>';
    }
}

/**
 * Loads OTC pairs into the sidebar.
 */
async function loadOTCPairs() {
    logActivity('Loading OTC assets...');
    const otcAssetsList = document.getElementById('asset-tab-content-otc');
    if (!otcAssetsList) return;
    otcAssetsList.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">Loading assets...</div>';
    try {
        const assets = await fetchAssetsByCategory('otc');
        renderAssetList(otcAssetsList, assets, 'otc');
    } catch (err) {
        logError(`Failed to load OTC assets: ${err.message}`);
        otcAssetsList.innerHTML = '<div class="text-center py-6 text-[var(--neon-red)] text-sm">Unable to load assets</div>';
    }
}

/**
 * Loads Crypto assets into the sidebar.
 */
async function loadCryptoAssets() {
    logActivity('Loading crypto assets...');
    const assetsList = document.getElementById('asset-tab-content-crypto');
    if (!assetsList) return;
    assetsList.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">Loading assets...</div>';
    try {
        const assets = await fetchAssetsByCategory('crypto');
        renderAssetList(assetsList, assets, 'crypto');
    } catch (err) {
        logError(`Failed to load crypto assets: ${err.message}`);
        assetsList.innerHTML = '<div class="text-center py-6 text-[var(--neon-red)] text-sm">Unable to load assets</div>';
    }
}

/**
 * Loads tournament data into the Tournaments page.
 */
async function loadTournaments() {
    logActivity('Loading tournament data...');
    const tournamentsGrid = document.getElementById('tournamentsGrid');
    if (!tournamentsGrid) return;
    tournamentsGrid.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">Loading tournaments...</div>';
    try {
        const data = await fetchJson('/api/tournaments');
        const tournaments = data.tournaments || [];
        tournamentsGrid.innerHTML = '';
        if (!tournaments.length) {
            tournamentsGrid.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">No tournaments available right now</div>';
            return;
        }
        tournaments.forEach((tournament) => {
            const card = document.createElement('div');
            card.className = 'glass-panel glow-on-hover p-6';
            card.innerHTML = `
                <h3 class="text-xl font-bold text-white mb-2">${tournament.name}</h3>
                <div class="text-2xl font-bold text-[var(--neon-green)] mb-4">${tournament.prize}</div>
                <div class="flex justify-between text-sm text-[var(--text-secondary)]">
                    <span>${tournament.participants} traders</span>
                    <span>${tournament.end_date}</span>
                </div>
            `;
            tournamentsGrid.appendChild(card);
        });
    } catch (err) {
        logError(`Failed to load tournaments: ${err.message}`);
        tournamentsGrid.innerHTML = '<div class="text-center py-6 text-[var(--neon-red)] text-sm">Unable to load tournaments</div>';
    }
}

/**
 * Loads promotion data into the Promotions page.
 */
async function loadPromotions() {
    logActivity('Loading promotions data...');
    const promotionsGrid = document.getElementById('promotionsGrid');
    if (!promotionsGrid) return;
    promotionsGrid.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">Loading promotions...</div>';
    try {
        const data = await fetchJson('/api/promotions');
        const promotions = data.promotions || [];
        promotionsGrid.innerHTML = '';
        if (!promotions.length) {
            promotionsGrid.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">No promotions available right now</div>';
            return;
        }
        promotions.forEach((promotion) => {
            const card = document.createElement('div');
            card.className = 'glass-panel glow-on-hover p-6';
            card.innerHTML = `
                <h3 class="text-xl font-bold text-white mb-2">${promotion.name}</h3>
                <p class="text-[var(--text-secondary)] text-sm mb-4">${promotion.description}</p>
                <div class="glass-panel p-3 rounded-lg bg-[rgba(0,0,0,0.1)]">
                    <div class="text-sm text-[var(--text-secondary)]">Promo Code</div>
                    <div class="text-lg font-bold text-white">${promotion.code}</div>
                </div>
            `;
            promotionsGrid.appendChild(card);
        });
    } catch (err) {
        logError(`Failed to load promotions: ${err.message}`);
        promotionsGrid.innerHTML = '<div class="text-center py-6 text-[var(--neon-red)] text-sm">Unable to load promotions</div>';
    }
}

/**
 * Loads trade history data into the History page.
 */
async function loadHistory() {
    logActivity('Loading trade history...');
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    historyList.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">Loading history...</div>';
    try {
        const data = await fetchJson('/api/history');
        const history = data.history || [];
        historyList.innerHTML = '';
        if (!history.length) {
            historyList.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">No historical trades yet</div>';
            return;
        }
        const currency = (currentUser && currentUser.currency) || (document.body?.dataset?.currency) || 'USD';
        history.forEach((trade) => {
            const tradeElement = document.createElement('div');
            tradeElement.className = 'flex justify-between p-4 border-b border-[var(--glass-border)]';
            const net = Number(trade.net || 0);
            const netLabel = formatCurrency(Math.abs(net), currency);
            const sign = net >= 0 ? '+' : '-';
            tradeElement.innerHTML = `
                <span class="text-white">${trade.asset_name || trade.asset}</span>
                <span class="${net >= 0 ? 'text-[var(--neon-green)]' : 'text-[var(--neon-red)]'} font-semibold">${sign}${netLabel}</span>
            `;
            historyList.appendChild(tradeElement);
        });
    } catch (err) {
        logError(`Failed to load history: ${err.message}`);
        historyList.innerHTML = '<div class="text-center py-6 text-[var(--neon-red)] text-sm">Unable to load trade history</div>';
    }
}

/**
 * Loads analytics data into the Analytics page using real user trade history.
 */
async function loadAnalytics() {
    logActivity('Loading analytics data...');
    const totalTradesEl = document.getElementById('analytics-total-trades');
    const totalProfitEl = document.getElementById('analytics-total-profit');
    const winRateEl = document.getElementById('analytics-win-rate');
    const historyListEl = document.getElementById('analytics-history-list');
    const assetDistEl = document.getElementById('analytics-asset-dist');

    if (!totalTradesEl && !totalProfitEl && !winRateEl && !historyListEl && !assetDistEl) return;

    try {
        // Fetch real user history data
        const data = await fetchJson('/api/history');
        const history = data.history || [];
        const currency = (currentUser && currentUser.currency) || (document.body?.dataset?.currency) || 'USD';

        // Calculate analytics from real data
        const totalTrades = history.length;
        const wins = history.filter(t => t.result === 'win').length;
        const losses = history.filter(t => t.result === 'loss').length;
        const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;
        const totalPnL = history.reduce((sum, t) => sum + (parseFloat(t.net || 0)), 0);

        // Update stat cards
        if (totalTradesEl) totalTradesEl.textContent = totalTrades.toLocaleString();
        if (winRateEl) winRateEl.textContent = `${winRate}%`;
        if (totalProfitEl) {
            totalProfitEl.textContent = formatCurrency(totalPnL, currency);
            totalProfitEl.className = `stat-card-value ${totalPnL >= 0 ? 'text-[var(--neon-green)]' : 'text-[var(--neon-red)]'}`;
        }

        // Render recent trade history
        if (historyListEl) {
            historyListEl.innerHTML = '';
            if (history.length === 0) {
                historyListEl.innerHTML = '<p class="text-gray-400 text-center py-8">No trades yet</p>';
            } else {
                history.slice(0, 20).forEach((trade) => {
                    const net = parseFloat(trade.net || 0);
                    const item = document.createElement('div');
                    item.className = 'flex justify-between items-center p-3 border-b border-[var(--glass-border)] hover:bg-white/5 transition';
                    item.innerHTML = `
                        <div class="flex-1">
                            <div class="text-white font-medium">${trade.asset_name || trade.asset}</div>
                            <div class="text-xs text-gray-400">${trade.direction?.toUpperCase() || ''} • ${new Date(trade.closed_at).toLocaleString()}</div>
                        </div>
                        <div class="text-right">
                            <div class="${net >= 0 ? 'text-[var(--neon-green)]' : 'text-[var(--neon-red)]'} font-semibold">
                                ${net >= 0 ? '+' : ''}${formatCurrency(net, currency)}
                            </div>
                            <div class="text-xs ${trade.result === 'win' ? 'text-green-400' : 'text-red-400'}">${trade.result?.toUpperCase()}</div>
                        </div>
                    `;
                    historyListEl.appendChild(item);
                });
            }
        }

        // Render asset distribution
        if (assetDistEl) {
            const assetStats = {};
            history.forEach((trade) => {
                const asset = trade.asset_name || trade.asset || 'Unknown';
                if (!assetStats[asset]) {
                    assetStats[asset] = { count: 0, wins: 0, total: 0 };
                }
                assetStats[asset].count++;
                if (trade.result === 'win') assetStats[asset].wins++;
                assetStats[asset].total += parseFloat(trade.net || 0);
            });

            assetDistEl.innerHTML = '';
            const sortedAssets = Object.entries(assetStats).sort((a, b) => b[1].count - a[1].count);
            
            if (sortedAssets.length === 0) {
                assetDistEl.innerHTML = '<p class="text-gray-400 text-center py-8">No asset data</p>';
            } else {
                sortedAssets.forEach(([asset, stats]) => {
                    const winRateAsset = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 0;
                    const item = document.createElement('div');
                    item.className = 'p-3 border-b border-[var(--glass-border)] hover:bg-white/5 transition';
                    item.innerHTML = `
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-white font-medium">${asset}</span>
                            <span class="text-sm ${stats.total >= 0 ? 'text-[var(--neon-green)]' : 'text-[var(--neon-red)]'}">
                                ${stats.total >= 0 ? '+' : ''}${formatCurrency(stats.total, currency)}
                            </span>
                        </div>
                        <div class="flex justify-between text-xs text-gray-400">
                            <span>${stats.count} trades</span>
                            <span>Win rate: ${winRateAsset}%</span>
                        </div>
                    `;
                    assetDistEl.appendChild(item);
                });
            }
        }

    } catch (err) {
        logError(`Failed to load analytics: ${err.message}`);
        if (historyListEl) historyListEl.innerHTML = '<p class="text-[var(--neon-red)] text-center py-8">Unable to load analytics</p>';
    }
}
