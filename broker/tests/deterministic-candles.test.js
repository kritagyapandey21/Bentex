/**
 * Unit Tests for Deterministic Candle Generator
 * 
 * Run with: node deterministic-candles.test.js
 * Or integrate with Jest
 */

// Import the module
const {
    generateSeries,
    generateLiveUpdate,
    deriveStartPrice,
    createSeedString,
    timeframeToMinutes,
    _internals
} = require('../src/js/deterministic-candles.js');

// Simple test framework
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }
    
    test(name, fn) {
        this.tests.push({ name, fn });
    }
    
    async run() {
        console.log('\n🧪 Running Deterministic Candle Tests\n');
        
        for (const { name, fn } of this.tests) {
            try {
                await fn();
                this.passed++;
                console.log(`✅ ${name}`);
            } catch (error) {
                this.failed++;
                console.log(`❌ ${name}`);
                console.log(`   Error: ${error.message}`);
            }
        }
        
        console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);
        return this.failed === 0;
    }
}

// Helper functions
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        throw new Error(message || `Expected ${expectedStr} but got ${actualStr}`);
    }
}

function assertArraysEqual(arr1, arr2, message) {
    assert(arr1.length === arr2.length, `${message}: Arrays have different lengths`);
    for (let i = 0; i < arr1.length; i++) {
        assertDeepEqual(arr1[i], arr2[i], `${message}: Mismatch at index ${i}`);
    }
}

// Test suite
const runner = new TestRunner();

// Test 1: Same seed produces identical output
runner.test('Same seed produces identical output', () => {
    const params = {
        seedString: 'BTCUSD|1m|v1|2025-11-09|2025-11-09',
        startTimestampMs: 1731110400000,
        candleCount: 100,
        timeframeMinutes: 1,
        startPrice: 42000,
        volatility: 0.002,
        decimals: 2
    };
    
    const series1 = generateSeries(params);
    const series2 = generateSeries(params);
    
    assertArraysEqual(series1, series2, 'Series should be identical');
});

// Test 2: Different seed produces different output
runner.test('Different seed produces different output', () => {
    const baseParams = {
        startTimestampMs: 1731110400000,
        candleCount: 100,
        timeframeMinutes: 1,
        startPrice: 42000,
        volatility: 0.002,
        decimals: 2
    };
    
    const series1 = generateSeries({
        ...baseParams,
        seedString: 'BTCUSD|1m|v1|2025-11-09|2025-11-09'
    });
    
    const series2 = generateSeries({
        ...baseParams,
        seedString: 'BTCUSD|1m|v2|2025-11-09|2025-11-09'
    });
    
    // At least one candle should be different
    let hasDifference = false;
    for (let i = 0; i < series1.length; i++) {
        if (JSON.stringify(series1[i]) !== JSON.stringify(series2[i])) {
            hasDifference = true;
            break;
        }
    }
    
    assert(hasDifference, 'Different seeds should produce different series');
});

// Test 3: OHLC relationships are valid
runner.test('OHLC relationships are valid', () => {
    const candles = generateSeries({
        seedString: 'BTCUSD|1m|v1|2025-11-09|2025-11-09',
        startTimestampMs: 1731110400000,
        candleCount: 100,
        timeframeMinutes: 1,
        startPrice: 42000,
        volatility: 0.002
    });
    
    candles.forEach((candle, i) => {
        assert(candle.high >= candle.open, `Candle ${i}: high should be >= open`);
        assert(candle.high >= candle.close, `Candle ${i}: high should be >= close`);
        assert(candle.low <= candle.open, `Candle ${i}: low should be <= open`);
        assert(candle.low <= candle.close, `Candle ${i}: low should be <= close`);
        assert(candle.high >= candle.low, `Candle ${i}: high should be >= low`);
    });
});

// Test 4: Candle continuity (open = previous close)
runner.test('Candle continuity: open equals previous close', () => {
    const candles = generateSeries({
        seedString: 'BTCUSD|1m|v1|2025-11-09|2025-11-09',
        startTimestampMs: 1731110400000,
        candleCount: 100,
        timeframeMinutes: 1,
        startPrice: 42000,
        volatility: 0.002
    });
    
    for (let i = 1; i < candles.length; i++) {
        assert(
            candles[i].open === candles[i - 1].close,
            `Candle ${i} open should equal candle ${i-1} close`
        );
    }
});

// Test 5: Timestamp progression is correct
runner.test('Timestamp progression is correct', () => {
    const timeframeMinutes = 5;
    const candles = generateSeries({
        seedString: 'BTCUSD|5m|v1|2025-11-09|2025-11-09',
        startTimestampMs: 1731110400000,
        candleCount: 50,
        timeframeMinutes: timeframeMinutes,
        startPrice: 42000,
        volatility: 0.002
    });
    
    const expectedInterval = timeframeMinutes * 60 * 1000;
    
    for (let i = 1; i < candles.length; i++) {
        const timeDiff = candles[i].time - candles[i - 1].time;
        assert(
            timeDiff === expectedInterval,
            `Time difference should be ${expectedInterval}ms, got ${timeDiff}ms`
        );
    }
});

// Test 6: Volume generation is deterministic
runner.test('Volume generation is deterministic', () => {
    const params = {
        seedString: 'BTCUSD|1m|v1|2025-11-09|2025-11-09',
        startTimestampMs: 1731110400000,
        candleCount: 50,
        timeframeMinutes: 1,
        startPrice: 42000,
        volatility: 0.002,
        includeVolume: true
    };
    
    const series1 = generateSeries(params);
    const series2 = generateSeries(params);
    
    series1.forEach((candle, i) => {
        assert(candle.volume === series2[i].volume, `Volume at ${i} should match`);
        assert(typeof candle.volume === 'number', `Volume should be a number`);
        assert(candle.volume > 0, `Volume should be positive`);
    });
});

// Test 7: Live update is deterministic
runner.test('Live update is deterministic', () => {
    const seedString = 'BTCUSD|1m|v1|2025-11-09|2025-11-09';
    const lastCandle = {
        time: 1731110400000,
        open: 42000,
        high: 42050,
        low: 41950,
        close: 42010
    };
    const nowMs = 1731110460000 + 30000; // 30 seconds into next candle
    
    const params = {
        seedString,
        lastCandle,
        nowMs,
        timeframeMinutes: 1,
        volatility: 0.002
    };
    
    const update1 = generateLiveUpdate(params);
    const update2 = generateLiveUpdate(params);
    
    assertDeepEqual(update1, update2, 'Live updates should be identical');
});

// Test 8: Live update progress is correct
runner.test('Live update progress is calculated correctly', () => {
    const seedString = 'BTCUSD|1m|v1|2025-11-09|2025-11-09';
    const lastCandle = {
        time: 1731110400000,
        open: 42000,
        high: 42050,
        low: 41950,
        close: 42010
    };
    
    // Test at 0%, 25%, 50%, 75%, 100% progress
    const timeframeMs = 60 * 1000;
    const candleStartTime = lastCandle.time + timeframeMs;
    
    [0, 0.25, 0.5, 0.75, 1.0].forEach(expectedProgress => {
        const nowMs = candleStartTime + (timeframeMs * expectedProgress);
        const update = generateLiveUpdate({
            seedString,
            lastCandle,
            nowMs,
            timeframeMinutes: 1,
            volatility: 0.002
        });
        
        assert(
            Math.abs(update.progress - expectedProgress) < 0.01,
            `Progress should be ~${expectedProgress}, got ${update.progress}`
        );
    });
});

// Test 9: Seed string creation
runner.test('Seed string creation is correct', () => {
    const seed = createSeedString('BTCUSD', '1m', 'v1', '2025-11-09', '2025-11-09');
    assert(seed === 'BTCUSD|1m|v1|2025-11-09|2025-11-09', 'Seed string format is correct');
});

// Test 10: Timeframe conversion
runner.test('Timeframe conversion works correctly', () => {
    assert(timeframeToMinutes('1m') === 1, '1m should be 1 minute');
    assert(timeframeToMinutes('5m') === 5, '5m should be 5 minutes');
    assert(timeframeToMinutes('15m') === 15, '15m should be 15 minutes');
    assert(timeframeToMinutes('1h') === 60, '1h should be 60 minutes');
    assert(timeframeToMinutes('4h') === 240, '4h should be 240 minutes');
    assert(timeframeToMinutes('1d') === 1440, '1d should be 1440 minutes');
});

// Test 11: Price derivation is deterministic
runner.test('Price derivation is deterministic', () => {
    const price1 = deriveStartPrice('BTCUSD', '2025-11-09', 42000);
    const price2 = deriveStartPrice('BTCUSD', '2025-11-09', 42000);
    
    assert(price1 === price2, 'Derived prices should be identical');
    
    const price3 = deriveStartPrice('ETHUSD', '2025-11-09', 42000);
    assert(price1 !== price3, 'Different symbols should derive different prices');
});

// Test 12: RNG internals are correct
runner.test('RNG produces values in [0,1)', () => {
    const rng = _internals.createSeededRNG('test-seed');
    
    for (let i = 0; i < 1000; i++) {
        const val = rng();
        assert(val >= 0 && val < 1, `RNG value should be in [0,1), got ${val}`);
    }
});

// Test 13: Box-Muller produces reasonable distribution
runner.test('Box-Muller produces reasonable normal distribution', () => {
    const rng = _internals.createSeededRNG('test-seed');
    const samples = [];
    
    for (let i = 0; i < 10000; i++) {
        samples.push(_internals.boxMuller(rng));
    }
    
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / samples.length;
    const stddev = Math.sqrt(variance);
    
    // Mean should be close to 0, stddev close to 1
    assert(Math.abs(mean) < 0.1, `Mean should be ~0, got ${mean}`);
    assert(Math.abs(stddev - 1) < 0.1, `Stddev should be ~1, got ${stddev}`);
});

// Test 14: Different history versions produce different results
runner.test('Different history versions produce different results', () => {
    const baseParams = {
        startTimestampMs: 1731110400000,
        candleCount: 100,
        timeframeMinutes: 1,
        startPrice: 42000,
        volatility: 0.002
    };
    
    const v1 = generateSeries({
        ...baseParams,
        seedString: createSeedString('BTCUSD', '1m', 'v1', '2025-11-09', '2025-11-09')
    });
    
    const v2 = generateSeries({
        ...baseParams,
        seedString: createSeedString('BTCUSD', '1m', 'v2', '2025-11-09', '2025-11-09')
    });
    
    let differences = 0;
    for (let i = 0; i < v1.length; i++) {
        if (JSON.stringify(v1[i]) !== JSON.stringify(v2[i])) {
            differences++;
        }
    }
    
    assert(differences > 90, 'Most candles should differ between versions');
});

// Test 15: Decimal precision is respected
runner.test('Decimal precision is respected', () => {
    const decimals = 4;
    const candles = generateSeries({
        seedString: 'BTCUSD|1m|v1|2025-11-09|2025-11-09',
        startTimestampMs: 1731110400000,
        candleCount: 50,
        timeframeMinutes: 1,
        startPrice: 42000.123456,
        volatility: 0.002,
        decimals: decimals
    });
    
    candles.forEach((candle, i) => {
        ['open', 'high', 'low', 'close'].forEach(field => {
            const value = candle[field];
            const decimalPlaces = (value.toString().split('.')[1] || '').length;
            assert(
                decimalPlaces <= decimals,
                `Candle ${i} ${field} should have at most ${decimals} decimals, got ${decimalPlaces}`
            );
        });
    });
});

// Run all tests
if (require.main === module) {
    runner.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { TestRunner, runner };
