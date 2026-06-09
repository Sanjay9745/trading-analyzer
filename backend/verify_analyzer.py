import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from analyzer import analyze_ticker

def generate_hs_dummy_data() -> pd.DataFrame:
    """
    Generates synthetic OHLCV data that outlines a Head & Shoulders pattern:
    - Base price around 100
    - Left shoulder peaking at 110 (valley 1 dipping to 98)
    - Head peaking at 120 (valley 2 dipping to 97)
    - Right shoulder peaking at 109
    - Neckline break (price drops to 94)
    """
    dates = [datetime.now() - timedelta(days=100-i) for i in range(100)]
    
    # Base pattern array (100 days)
    # We will build a smoothed line representing the H&S shape and then add minor noise to Open, High, Low
    prices = np.ones(100) * 100.0
    
    # Left Shoulder: day 20 to 40
    # peak around day 30
    for idx in range(20, 31):
        prices[idx] = 100.0 + (idx - 20) * 1.0 # rises to 110
    for idx in range(31, 40):
        prices[idx] = 110.0 - (idx - 31) * 1.33 # drops to 98 (valley 1)
        
    # Head: day 40 to 65
    # peak around day 52
    for idx in range(40, 53):
        prices[idx] = 98.0 + (idx - 40) * 1.7 # rises to 120
    for idx in range(53, 65):
        prices[idx] = 120.0 - (idx - 53) * 1.91 # drops to 97 (valley 2)
        
    # Right Shoulder: day 65 to 85
    # peak around day 75
    for idx in range(65, 76):
        prices[idx] = 97.0 + (idx - 65) * 1.1 # rises to 109
    for idx in range(76, 85):
        prices[idx] = 109.0 - (idx - 76) * 1.33 # drops to 97
        
    # Neckline break: day 85 to 100
    for idx in range(85, 100):
        prices[idx] = 97.0 - (idx - 85) * 0.5 # drops below neckline (approx 97) down to ~90
        
    # Generate OHLCV based on the smoothed prices
    data = []
    np.random.seed(42)
    
    for i, base_p in enumerate(prices):
        # Add tiny daily fluctuation
        noise_open = np.random.uniform(-0.5, 0.5)
        noise_close = np.random.uniform(-0.5, 0.5)
        
        o = base_p + noise_open
        c = base_p + noise_close
        h = max(o, c) + np.random.uniform(0.1, 1.0)
        l = min(o, c) - np.random.uniform(0.1, 1.0)
        v = int(np.random.uniform(1000, 5000))
        
        data.append([o, h, l, c, v])
        
    df = pd.DataFrame(data, columns=['Open', 'High', 'Low', 'Close', 'Volume'], index=dates)
    return df

def test_analyzer():
    print("Generating H&S dummy data...")
    df = generate_hs_dummy_data()
    
    print("Running analysis engine...")
    res = analyze_ticker(df, "TEST")
    
    print("\n--- Analysis Result for Ticker:", res["ticker"], "---")
    print(f"Current Price: {res['current_price']:.2f}")
    
    hs = res["hs_pattern"]
    if hs:
        print(f"Detected Pattern: {hs['type']}")
        print(f"  Left Shoulder: index {hs['left_shoulder']['index']}, price {hs['left_shoulder']['price']:.2f}")
        print(f"  Head: index {hs['head']['index']}, price {hs['head']['price']:.2f}")
        print(f"  Right Shoulder: index {hs['right_shoulder']['index']}, price {hs['right_shoulder']['price']:.2f}")
        print(f"  Valley 1: index {hs['valley_1']['index']}, price {hs['valley_1']['price']:.2f}")
        print(f"  Valley 2: index {hs['valley_2']['index']}, price {hs['valley_2']['price']:.2f}")
        print(f"  Neckline slope: {hs['neckline_slope']:.4f}, intercept: {hs['neckline_intercept']:.2f}")
    else:
        print("No Head & Shoulders pattern detected!")
        
    tr = res["trade_report"]
    if tr:
        print("\n--- Trade Signal Generated ---")
        print(f"  Signal: {tr['signal']}")
        print(f"  Pattern Trigger: {tr['pattern']}")
        print(f"  Entry: ${tr['entry']:.2f}")
        print(f"  Stop Loss: ${tr['stop_loss']:.2f}")
        print(f"  Take Profit: ${tr['take_profit']:.2f}")
        print(f"  Risk-to-Reward: {tr['risk_reward_ratio']}:1")
        print(f"  Win Conviction: {tr['win_conviction_pct']}%")
    else:
        print("\nNo trade report generated.")

if __name__ == "__main__":
    test_analyzer()
