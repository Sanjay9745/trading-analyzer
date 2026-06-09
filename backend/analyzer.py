import numpy as np
import pandas as pd
from scipy.signal import savgol_filter, find_peaks
import logging

logger = logging.getLogger(__name__)

def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes 20, 50, 200 EMAs and 14 ATR.
    """
    df = df.copy()
    df['ema_20'] = df['Close'].ewm(span=20, adjust=False).mean()
    df['ema_50'] = df['Close'].ewm(span=50, adjust=False).mean()
    df['ema_200'] = df['Close'].ewm(span=200, adjust=False).mean()
    
    # Calculate ATR (Average True Range)
    high_low = df['High'] - df['Low']
    high_close_prev = (df['High'] - df['Close'].shift(1)).abs()
    low_close_prev = (df['Low'] - df['Close'].shift(1)).abs()
    
    tr = pd.concat([high_low, high_close_prev, low_close_prev], axis=1).max(axis=1)
    df['atr'] = tr.ewm(span=14, adjust=False).mean()
    
    # Fill any NaNs
    df = df.bfill()
    df = df.fillna(0)
    return df

def detect_candlesticks(df: pd.DataFrame) -> list:
    """
    Vectorized candlestick pattern detection.
    Returns list of dicts: {"index": int, "pattern": str, "bias": str}
    """
    patterns = []
    if len(df) < 3:
        return patterns

    open_p = df['Open'].values
    high_p = df['High'].values
    low_p = df['Low'].values
    close_p = df['Close'].values
    
    body = np.abs(close_p - open_p)
    candle_range = high_p - low_p
    # Avoid division by zero
    candle_range = np.where(candle_range == 0, 0.0001, candle_range)
    
    upper_shadow = high_p - np.maximum(close_p, open_p)
    lower_shadow = np.minimum(close_p, open_p) - low_p
    
    # 1. Doji
    doji = body <= (0.1 * candle_range)
    
    # 2. Hammer (Bullish Reversal)
    # Body is in the upper part of range, lower shadow is long, upper shadow is tiny
    hammer = (lower_shadow >= 2 * body) & (upper_shadow <= 0.1 * candle_range) & (body > 0)
    
    # 3. Shooting Star (Bearish Reversal)
    # Body is in the lower part of range, upper shadow is long, lower shadow is tiny
    shooting_star = (upper_shadow >= 2 * body) & (lower_shadow <= 0.1 * candle_range) & (body > 0)
    
    # Iterate and detect multiple patterns, especially focusing on recent bars
    for i in range(2, len(df)):
        # Check single candle patterns
        if doji[i]:
            patterns.append({"index": i, "pattern": "Doji", "bias": "Neutral"})
        elif hammer[i]:
            patterns.append({"index": i, "pattern": "Hammer", "bias": "Buy"})
        elif shooting_star[i]:
            patterns.append({"index": i, "pattern": "Shooting Star", "bias": "Sell"})
            
        # 4. Bullish Engulfing
        # Prev body is bearish, current body is bullish and engulfs prev body
        prev_bearish = close_p[i-1] < open_p[i-1]
        curr_bullish = close_p[i] > open_p[i]
        if prev_bearish and curr_bullish and (open_p[i] <= close_p[i-1]) and (close_p[i] >= open_p[i-1]) and (body[i] > body[i-1]):
            patterns.append({"index": i, "pattern": "Bullish Engulfing", "bias": "Buy"})
            
        # 5. Bearish Engulfing
        prev_bullish = close_p[i-1] > open_p[i-1]
        curr_bearish = close_p[i] < open_p[i]
        if prev_bullish and curr_bearish and (open_p[i] >= close_p[i-1]) and (close_p[i] <= open_p[i-1]) and (body[i] > body[i-1]):
            patterns.append({"index": i, "pattern": "Bearish Engulfing", "bias": "Sell"})

        # 6. Morning Star (Bullish 3-candle)
        # i-2: large red candle, i-1: small candle, i: green candle closing above midpoint of i-2
        c_i2 = close_p[i-2]
        o_i2 = open_p[i-2]
        c_i1 = close_p[i-1]
        o_i1 = open_p[i-1]
        c_i = close_p[i]
        o_i = open_p[i]
        
        is_red_i2 = c_i2 < o_i2
        is_green_i = c_i > o_i
        small_body_i1 = body[i-1] <= (0.35 * (high_p[i-1] - low_p[i-1] + 0.0001))
        midpoint_i2 = o_i2 - (o_i2 - c_i2) / 2
        
        if is_red_i2 and small_body_i1 and is_green_i and (c_i > midpoint_i2) and (np.maximum(c_i1, o_i1) < c_i2):
            patterns.append({"index": i, "pattern": "Morning Star", "bias": "Buy"})

        # 7. Evening Star (Bearish 3-candle)
        is_green_i2 = c_i2 > o_i2
        is_red_i = c_i < o_i
        midpoint_green_i2 = o_i2 + (c_i2 - o_i2) / 2
        
        if is_green_i2 and small_body_i1 and is_red_i and (c_i < midpoint_green_i2) and (np.minimum(c_i1, o_i1) > c_i2):
            patterns.append({"index": i, "pattern": "Evening Star", "bias": "Sell"})
            
    return patterns

def detect_head_and_shoulders(df: pd.DataFrame) -> dict:
    """
    Detects standard Head & Shoulders and Inverse Head & Shoulders using Savitzky-Golay filtering and find_peaks.
    Returns detailed dictionary of the detected pattern or None.
    """
    if len(df) < 30:
        return None
        
    close_prices = df['Close'].values
    
    # 1. Smooth using Savitzky-Golay
    # Window length must be odd and polyorder < window_length
    window_length = min(15, len(df) // 2 * 2 - 1)
    if window_length < 5:
        window_length = 5
    smoothed = savgol_filter(close_prices, window_length, 2)
    
    # 2. Find Peaks (Standard H&S: Bearish)
    # Peaks must have some prominence to filter micro-noise
    std_close = np.std(close_prices)
    prominence = max(std_close * 0.1, 0.01)
    peaks, _ = find_peaks(smoothed, distance=10, prominence=prominence)
    
    # 3. Find Valleys (Inverse H&S: Bullish)
    valleys, _ = find_peaks(-smoothed, distance=10, prominence=prominence)
    
    # Check for Standard Head & Shoulders (Bearish)
    if len(peaks) >= 3:
        for idx in range(len(peaks) - 2):
            p1_idx = peaks[idx]
            p2_idx = peaks[idx+1]
            p3_idx = peaks[idx+2]
            
            p1 = close_prices[p1_idx]
            p2 = close_prices[p2_idx]
            p3 = close_prices[p3_idx]
            
            # Head (p2) must be higher than shoulders (p1, p3)
            if p2 > p1 and p2 > p3:
                # Shoulders must be close in height (within 10% of each other)
                diff_ratio = abs(p1 - p3) / max(p1, p3)
                if diff_ratio <= 0.12: # Allowing up to 12% for flexibility
                    # Find intervening valleys
                    # V1 is minimum between p1 and p2
                    v1_range_idx = np.argmin(close_prices[p1_idx:p2_idx]) + p1_idx
                    # V2 is minimum between p2 and p3
                    v2_range_idx = np.argmin(close_prices[p2_idx:p3_idx]) + p2_idx
                    
                    v1_val = close_prices[v1_range_idx]
                    v2_val = close_prices[v2_range_idx]
                    
                    # Neckline line equation: y = m * x + c
                    m = (v2_val - v1_val) / (v2_range_idx - v1_range_idx) if v2_range_idx != v1_range_idx else 0
                    c = v1_val - m * v1_range_idx
                    
                    # Look for neckline breakout in subsequent candles
                    # Start checking from p3_idx to the end
                    for check_idx in range(p3_idx, len(df)):
                        neckline_val = m * check_idx + c
                        # Breakout: close price crosses below neckline
                        if close_prices[check_idx] < neckline_val:
                            # Height of head from neckline at head index
                            neckline_at_head = m * p2_idx + c
                            head_height = p2 - neckline_at_head
                            
                            return {
                                "type": "Head & Shoulders",
                                "bias": "Sell",
                                "left_shoulder": {"index": int(p1_idx), "price": float(p1)},
                                "head": {"index": int(p2_idx), "price": float(p2)},
                                "right_shoulder": {"index": int(p3_idx), "price": float(p3)},
                                "valley_1": {"index": int(v1_range_idx), "price": float(v1_val)},
                                "valley_2": {"index": int(v2_range_idx), "price": float(v2_val)},
                                "neckline_slope": float(m),
                                "neckline_intercept": float(c),
                                "breakout_index": int(check_idx),
                                "breakout_price": float(close_prices[check_idx]),
                                "head_height": float(head_height)
                            }
                            
    # Check for Inverse Head & Shoulders (Bullish)
    if len(valleys) >= 3:
        for idx in range(len(valleys) - 2):
            v1_idx = valleys[idx]
            v2_idx = valleys[idx+1]
            v3_idx = valleys[idx+2]
            
            v1 = close_prices[v1_idx]
            v2 = close_prices[v2_idx]
            v3 = close_prices[v3_idx]
            
            # Head (v2) must be lower than shoulders (v1, v3)
            if v2 < v1 and v2 < v3:
                # Shoulders must be close in depth (within 10%)
                diff_ratio = abs(v1 - v3) / max(v1, v3)
                if diff_ratio <= 0.12:
                    # Find intervening peaks (local maxima between valleys)
                    p1_range_idx = np.argmax(close_prices[v1_idx:v2_idx]) + v1_idx
                    p2_range_idx = np.argmax(close_prices[v2_idx:v3_idx]) + v2_idx
                    
                    p1_val = close_prices[p1_range_idx]
                    p2_val = close_prices[p2_range_idx]
                    
                    # Neckline line equation
                    m = (p2_val - p1_val) / (p2_range_idx - p1_range_idx) if p2_range_idx != p1_range_idx else 0
                    c = p1_val - m * p1_range_idx
                    
                    for check_idx in range(v3_idx, len(df)):
                        neckline_val = m * check_idx + c
                        # Breakout: close price crosses above neckline
                        if close_prices[check_idx] > neckline_val:
                            # Height of head
                            neckline_at_head = m * v2_idx + c
                            head_height = neckline_at_head - v2
                            
                            return {
                                "type": "Inverse Head & Shoulders",
                                "bias": "Buy",
                                "left_shoulder": {"index": int(v1_idx), "price": float(v1)},
                                "head": {"index": int(v2_idx), "price": float(v2)},
                                "right_shoulder": {"index": int(v3_idx), "price": float(v3)},
                                "valley_1": {"index": int(p1_range_idx), "price": float(p1_val)},
                                "valley_2": {"index": int(p2_range_idx), "price": float(p2_val)},
                                "neckline_slope": float(m),
                                "neckline_intercept": float(c),
                                "breakout_index": int(check_idx),
                                "breakout_price": float(close_prices[check_idx]),
                                "head_height": float(head_height)
                            }
                            
    return None

def analyze_ticker(df: pd.DataFrame, ticker: str) -> dict:
    """
    Performs full analysis on the dataframe.
    Combines indicators, candlestick patterns, and H&S detection.
    """
    df_ind = calculate_indicators(df)
    c_patterns = detect_candlesticks(df_ind)
    hs_pattern = detect_head_and_shoulders(df_ind)
    
    last_idx = len(df_ind) - 1
    current_close = float(df_ind['Close'].iloc[last_idx])
    current_atr = float(df_ind['atr'].iloc[last_idx])
    
    # Check for breakouts/triggers:
    # 1. H&S Breakout is direct
    # 2. EMA Bounce (Price bounces off 20, 50, or 200 EMA + Bullish/Bearish candlestick pattern on the last 3 bars)
    
    signal = None
    entry = 0.0
    sl = 0.0
    tp = 0.0
    pattern_name = "None"
    conviction = 0.0
    
    # H&S trigger takes priority
    if hs_pattern and hs_pattern['breakout_index'] >= last_idx - 3:
        # Detected a recent H&S breakout
        pattern_name = hs_pattern['type']
        entry = current_close
        if hs_pattern['bias'] == "Buy":
            signal = "Buy"
            sl = entry - 1.5 * current_atr
            tp = entry + hs_pattern['head_height']
            conviction = 85.0
        else:
            signal = "Sell"
            sl = entry + 1.5 * current_atr
            tp = entry - hs_pattern['head_height']
            conviction = 85.0
    else:
        # Check EMA Bounce
        # We look for a recent candlestick pattern (last 2 bars) and if it aligns with EMA support/resistance
        recent_patterns = [p for p in c_patterns if p['index'] >= last_idx - 2]
        
        for p in recent_patterns:
            if p['bias'] in ["Buy", "Sell"]:
                # Check proximity to EMAs
                for ema_col in ['ema_20', 'ema_50', 'ema_200']:
                    ema_val = float(df_ind[ema_col].iloc[p['index']])
                    price_val = float(df_ind['Close'].iloc[p['index']])
                    diff = abs(price_val - ema_val) / price_val
                    
                    if diff <= 0.015:  # Within 1.5% of the EMA
                        # Valid EMA Bounce/Rejection
                        signal = p['bias']
                        pattern_name = f"{p['pattern']} at {ema_col.upper()}"
                        entry = current_close
                        
                        if signal == "Buy":
                            sl = entry - 1.5 * current_atr
                            tp = entry + 2.5 * current_atr # 1:1.66 or target
                            conviction = 70.0
                        else:
                            sl = entry + 1.5 * current_atr
                            tp = entry - 2.5 * current_atr
                            conviction = 70.0
                        break
                if signal:
                    break
                    
    # Format structural trade report
    trade_report = None
    if signal and sl != entry:
        rr = abs(tp - entry) / abs(entry - sl) if abs(entry - sl) > 0 else 0
        trade_report = {
            "signal": signal,
            "pattern": pattern_name,
            "entry": float(entry),
            "stop_loss": float(sl),
            "take_profit": float(tp),
            "risk_reward_ratio": float(round(rr, 2)),
            "win_conviction_pct": float(conviction)
        }
        
    # Build full result
    # We will format historical bars for frontend rendering
    history_bars = []
    for i in range(len(df_ind)):
        # Include custom marker flag if candlestick matches
        marker = None
        for cp in c_patterns:
            if cp['index'] == i:
                marker = {
                    "pattern": cp['pattern'],
                    "bias": cp['bias']
                }
                break
                
        ts = df_ind.index[i]
        time_str = ts.strftime("%Y-%m-%d") if hasattr(ts, 'strftime') else str(ts)[:10]
        history_bars.append({
            "time": time_str,
            "open": float(df_ind['Open'].iloc[i]),
            "high": float(df_ind['High'].iloc[i]),
            "low": float(df_ind['Low'].iloc[i]),
            "close": float(df_ind['Close'].iloc[i]),
            "volume": float(df_ind['Volume'].iloc[i]),
            "ema_20": float(df_ind['ema_20'].iloc[i]),
            "ema_50": float(df_ind['ema_50'].iloc[i]),
            "ema_200": float(df_ind['ema_200'].iloc[i]),
            "marker": marker
        })
        
    return {
        "ticker": ticker,
        "current_price": current_close,
        "history": history_bars,
        "hs_pattern": hs_pattern,
        "trade_report": trade_report
    }
