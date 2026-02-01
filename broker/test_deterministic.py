"""
Test script to verify deterministic candle generation
Run this to ensure identical candles are generated across multiple runs
"""

import time
from services.deterministic_generator import (
    generate_series,
    generate_partial_candle,
    get_candle_index,
    get_candle_start_time,
)


def test_deterministic_generation():
    """Test that deterministic generation produces identical results"""
    print("=" * 60)
    print("DETERMINISTIC CANDLE GENERATION TEST")
    print("=" * 60)
    
    # Test parameters
    symbol = "BTCUSD"
    timeframe_minutes = 1
    version = "v1"
    initial_price = 42000.0
    count = 10
    
    # Generate candles twice
    start_time_ms = int(time.time() * 1000) - (count * 60 * 1000)
    
    print(f"\n1. Generating {count} candles for {symbol}...")
    candles1 = generate_series(
        symbol=symbol,
        timeframe_minutes=timeframe_minutes,
        version=version,
        start_time_ms=start_time_ms,
        count=count,
        initial_price=initial_price,
        volatility=0.02,
        price_decimals=2,
    )
    
    print(f"\n2. Generating same {count} candles again...")
    candles2 = generate_series(
        symbol=symbol,
        timeframe_minutes=timeframe_minutes,
        version=version,
        start_time_ms=start_time_ms,
        count=count,
        initial_price=initial_price,
        volatility=0.02,
        price_decimals=2,
    )
    
    # Compare results
    print("\n3. Comparing results...")
    all_match = True
    for i, (c1, c2) in enumerate(zip(candles1, candles2)):
        match = (
            c1.open == c2.open and
            c1.high == c2.high and
            c1.low == c2.low and
            c1.close == c2.close and
            c1.volume == c2.volume
        )
        if not match:
            print(f"   ❌ Candle {i} MISMATCH:")
            print(f"      Run 1: O={c1.open} H={c1.high} L={c1.low} C={c1.close} V={c1.volume}")
            print(f"      Run 2: O={c2.open} H={c2.high} L={c2.low} C={c2.close} V={c2.volume}")
            all_match = False
    
    if all_match:
        print("   ✅ All candles match perfectly!")
    else:
        print("   ❌ Some candles don't match!")
    
    # Display first 3 candles
    print(f"\n4. First 3 candles:")
    for i, candle in enumerate(candles1[:3]):
        print(f"   Candle {i}: O={candle.open} H={candle.high} L={candle.low} C={candle.close} V={candle.volume}")
    
    # Test partial candle generation
    print(f"\n5. Testing partial candle generation...")
    current_time_ms = int(time.time() * 1000)
    current_index = get_candle_index(current_time_ms, timeframe_minutes)
    current_start_ms = get_candle_start_time(current_index, timeframe_minutes)
    
    seed_base = f"{symbol}|{timeframe_minutes}|{version}|"
    partial = generate_partial_candle(
        seed_base=seed_base,
        index=current_index,
        prev_close=candles1[-1].close,
        candle_start_ms=current_start_ms,
        server_time_ms=current_time_ms,
        timeframe_ms=timeframe_minutes * 60 * 1000,
        volatility=0.02,
        timeframe_minutes=timeframe_minutes,
        price_decimals=2,
    )
    
    print(f"   Partial: O={partial.open} H={partial.high} L={partial.low} C={partial.close} V={partial.volume}")
    print(f"   Is Partial: {partial.is_partial}")
    
    # Test with different symbols
    print(f"\n6. Testing different symbols produce different candles...")
    btc_candles = generate_series(
        symbol="BTCUSD",
        timeframe_minutes=1,
        version="v1",
        start_time_ms=start_time_ms,
        count=3,
        initial_price=42000,
        volatility=0.02,
        price_decimals=2,
    )
    
    eth_candles = generate_series(
        symbol="ETHUSD",
        timeframe_minutes=1,
        version="v1",
        start_time_ms=start_time_ms,
        count=3,
        initial_price=2500,
        volatility=0.02,
        price_decimals=2,
    )
    
    different = any(
        btc.close != eth.close
        for btc, eth in zip(btc_candles, eth_candles)
    )
    
    if different:
        print("   ✅ Different symbols produce different candles (as expected)")
    else:
        print("   ❌ Different symbols produced identical candles (unexpected!)")
    
    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)
    
    return all_match


if __name__ == "__main__":
    success = test_deterministic_generation()
    exit(0 if success else 1)
