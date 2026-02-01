/**
 * Test auto-save functionality
 * Simulates waiting for a candle to complete
 */

async function testAutoSave() {
  console.log('Testing auto-save...');
  console.log('Current time:', new Date().toISOString());
  
  const now = Date.now();
  const timeframeMs = 60 * 1000; // 1 minute
  const nextCandleTime = Math.ceil(now / timeframeMs) * timeframeMs;
  const waitMs = nextCandleTime - now;
  
  console.log(`Next candle completes at: ${new Date(nextCandleTime).toISOString()}`);
  console.log(`Waiting ${(waitMs / 1000).toFixed(1)} seconds...`);
  
  // Check server logs after waiting
  console.log('\n📋 Check the server terminal for auto-save messages like:');
  console.log('   ✓ Auto-saved candle: BTCUSD at 2025-11-09T...');
  console.log('\nOr query the database:');
  console.log('   GET http://localhost:3000/api/last_saved?symbol=BTCUSD&timeframeMinutes=1&version=v1');
}

testAutoSave();
