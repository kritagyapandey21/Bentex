/**
 * Client-side deterministic candle generator (identical to server)
 * CRITICAL: Must produce same candles as server-side Python implementation
 */

function generateDeterministicCandle({
  seedBase,
  index,
  prevClose,
  volatility = 0.02,
  timeframeMinutes = 1,
  priceDecimals = 2,
  startTimeMs,
}) {
  // Seed for close price movement
  const closeSeed = `${seedBase}|candle|${index}`;
  const closeRng = createSeededRNG(closeSeed);

  // Generate Gaussian random variable for price movement
  const z = gaussian(closeRng);

  // Calculate percentage move
  const pctMove = z * volatility * Math.sqrt(timeframeMinutes);

  // Calculate OHLC
  const close = prevClose * (1 + pctMove);
  const open = prevClose;

  // Intraday high/low factors (deterministic)
  const intradaySeed = `${seedBase}|candle|${index}|intraday`;
  const intradayRng = createSeededRNG(intradaySeed);

  const intradayHighFactor = Math.abs(gaussian(intradayRng)) * volatility * 0.3;
  const intradayLowFactor = Math.abs(gaussian(intradayRng)) * volatility * 0.3;

  const high = Math.max(open, close) * (1 + intradayHighFactor);
  const low = Math.min(open, close) * (1 - intradayLowFactor);

  // Deterministic volume
  const volumeSeed = `${seedBase}|candle|${index}|volume`;
  const volumeRng = createSeededRNG(volumeSeed);
  const baseVolume = 100;
  const volume = Math.floor(baseVolume * (1 + volumeRng() * 0.5));

  // Round to specified decimals
  const round = (num) => Number(num.toFixed(priceDecimals));

  return {
    start_time_ms: startTimeMs,
    time: Math.floor(startTimeMs / 1000), // For lightweight-charts (seconds)
    open: round(open),
    high: round(high),
    low: round(low),
    close: round(close),
    volume,
  };
}

function generateSeries({
  symbol,
  timeframeMinutes,
  version,
  startTimeMs,
  count,
  initialPrice,
  volatility = 0.02,
  priceDecimals = 2,
  dateRangeStartISO = '',
}) {
  const seedBase = `${symbol}|${timeframeMinutes}|${version}|${dateRangeStartISO}`;
  const candles = [];
  let prevClose = initialPrice;

  const timeframeMs = timeframeMinutes * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const candleStartTimeMs = startTimeMs + i * timeframeMs;

    const candle = generateDeterministicCandle({
      seedBase,
      index: i,
      prevClose,
      volatility,
      timeframeMinutes,
      priceDecimals,
      startTimeMs: candleStartTimeMs,
    });

    candles.push(candle);
    prevClose = candle.close;
  }

  return candles;
}

function generatePartialCandle({
  seedBase,
  index,
  prevClose,
  candleStartMs,
  serverTimeMs,
  timeframeMs,
  volatility = 0.02,
  timeframeMinutes = 1,
  priceDecimals = 2,
}) {
  // Generate target candle (what it will be when completed)
  const targetCandle = generateDeterministicCandle({
    seedBase,
    index,
    prevClose,
    volatility,
    timeframeMinutes,
    priceDecimals,
    startTimeMs: candleStartMs,
  });

  // Calculate elapsed fraction
  const elapsed = serverTimeMs - candleStartMs;
  const f = Math.min(1, Math.max(0, elapsed / timeframeMs));

  // Interpolate close
  const open = prevClose;
  const curClose = open + (targetCandle.close - open) * f;

  // Deterministic high/low for partial
  const intradaySeed = `${seedBase}|candle|${index}|intraday`;
  const intradayRng = createSeededRNG(intradaySeed);

  const intradayHighFactor = Math.abs(gaussian(intradayRng)) * volatility * 0.3 * f;
  const intradayLowFactor = Math.abs(gaussian(intradayRng)) * volatility * 0.3 * f;

  const curHigh = Math.max(open, curClose) * (1 + intradayHighFactor);
  const curLow = Math.min(open, curClose) * (1 - intradayLowFactor);

  const round = (num) => Number(num.toFixed(priceDecimals));

  return {
    time: Math.floor(candleStartMs / 1000), // lightweight-charts uses seconds
    open: round(open),
    high: round(curHigh),
    low: round(curLow),
    close: round(curClose),
    volume: Math.floor(targetCandle.volume * f),
    isPartial: true,
  };
}

function getCandleIndex(timeMs, timeframeMinutes) {
  const timeframeMs = timeframeMinutes * 60 * 1000;
  return Math.floor(timeMs / timeframeMs);
}

function getCandleStartTime(index, timeframeMinutes) {
  const timeframeMs = timeframeMinutes * 60 * 1000;
  return index * timeframeMs;
}
