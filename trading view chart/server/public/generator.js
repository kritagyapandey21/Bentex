/**
 * Client-side generator (identical to server)
 */

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
  // Generate target candle
  const closeSeed = `${seedBase}|candle|${index}`;
  const closeRng = createSeededRNG(closeSeed);
  const z = gaussian(closeRng);
  const pctMove = z * volatility * Math.sqrt(timeframeMinutes);
  const targetClose = prevClose * (1 + pctMove);

  // Calculate elapsed fraction
  const elapsed = serverTimeMs - candleStartMs;
  const f = Math.min(1, Math.max(0, elapsed / timeframeMs));

  // Interpolate
  const open = prevClose;
  const curClose = open + (targetClose - open) * f;

  // Deterministic high/low
  const intradaySeed = `${seedBase}|candle|${index}|intraday`;
  const intradayRng = createSeededRNG(intradaySeed);
  const intradayHighFactor = Math.abs(gaussian(intradayRng)) * volatility * 0.3 * f;
  const intradayLowFactor = Math.abs(gaussian(intradayRng)) * volatility * 0.3 * f;

  const curHigh = Math.max(open, curClose) * (1 + intradayHighFactor);
  const curLow = Math.min(open, curClose) * (1 - intradayLowFactor);

  const round = (num) => Number(num.toFixed(priceDecimals));

  // Volume seed
  const volumeSeed = `${seedBase}|candle|${index}|volume`;
  const volumeRng = createSeededRNG(volumeSeed);
  const baseVolume = 100;
  const targetVolume = Math.floor(baseVolume * (1 + volumeRng() * 0.5));

  return {
    time: Math.floor(candleStartMs / 1000), // lightweight-charts uses seconds
    open: round(open),
    high: round(curHigh),
    low: round(curLow),
    close: round(curClose),
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
