import { useState, useEffect, useRef } from 'react';
import { Chart } from './components/Chart';
import { Dashboard } from './components/Dashboard';
import { StockBrowser } from './components/StockBrowser';
import { 
  Radio, Activity, AlertTriangle, Play, Plus, Trash2, 
  Settings, Move, Terminal, PlusCircle, RefreshCw, PenTool 
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

interface ChartSettings {
  showEma20: boolean;
  showEma50: boolean;
  showEma200: boolean;
  showVolume: boolean;
  showHSOutline: boolean;
  showNeckline: boolean;
  showPatternMarkers: boolean;
  showTradeSetup: boolean;
  showCandlestickPatterns: boolean;
}

interface MockTrade {
  ticker: string;
  entryPrice: number;
  qty: number;
  side: 'Buy' | 'Sell';
}

function App() {
  const [activePage, setActivePage] = useState<'trading' | 'stockbrowser'>('trading');
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>('AAPL');
  const [activeHistory, setActiveHistory] = useState<any[]>([]);

  const [activeHSPattern, setActiveHSPattern] = useState<any | null>(null);
  const [activeTradeReport, setActiveTradeReport] = useState<any | null>(null);
  
  // UI & Panel Visibility States
  const [isScanning, setIsScanning] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'watchlist' | 'settings'>('watchlist');
  
  // Toggles for showing/hiding panels
  const [showLeftToolbar, setShowLeftToolbar] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [showFloatingPanel, setShowFloatingPanel] = useState(true);
  
  // Live simulation & WebSockets
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [mockTrade, setMockTrade] = useState<MockTrade | null>(null);
  const [mockTradeQty, setMockTradeQty] = useState<number>(100);

  // Custom Pair Creator state
  const [pairStockA, setPairStockA] = useState('');
  const [pairStockB, setPairStockB] = useState('');

  // Live Console Logs state
  const [scanLogs, setScanLogs] = useState<string[]>([
    '[SYSTEM] Antigravity Quant Platform Engine Initialized.',
    '[DB] Connected to MongoDB database successfully.',
    '[WEBSOCKET] Dynamic WebSockets connected for live price feeds.',
  ]);

  // Settings
  const [chartSettings, setChartSettings] = useState<ChartSettings>({
    showEma20: true,
    showEma50: true,
    showEma200: true,
    showVolume: true,
    showHSOutline: true,
    showNeckline: true,
    showPatternMarkers: true,
    showTradeSetup: true,
    showCandlestickPatterns: true,
  });

  const [intervalState, setIntervalState] = useState<'1d' | '1h' | '15m' | '5m'>('1d');
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'bar' | 'area'>('candlestick');
  const [drawings, setDrawings] = useState<any>({
    horizontalLines: [],
    trendLines: [],
    fibonaccis: [],
    texts: [],
  });

  const handleResetAll = () => {
    setChartSettings({
      showEma20: true,
      showEma50: true,
      showEma200: true,
      showVolume: true,
      showHSOutline: true,
      showNeckline: true,
      showPatternMarkers: true,
      showTradeSetup: true,
      showCandlestickPatterns: true,
    });
    setIntervalState('1d');
    setChartType('candlestick');
    setDrawings({
      horizontalLines: [],
      trendLines: [],
      fibonaccis: [],
      texts: [],
    });
    addLog('[SYSTEM] All settings, chart styles, timeframes, and active manual drawings have been reset to defaults.');
  };

  // Floating Panel Draggable State
  const [floatingPos, setFloatingPos] = useState({ x: 80, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  
  const pollIntervalRef = useRef<any>(null);
  const watchlistAddRef = useRef<HTMLInputElement>(null);

  // Drag Handlers for Floating Widget
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.drag-handle')) return;
    
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - floatingPos.x,
      y: e.clientY - floatingPos.y
    };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setFloatingPos({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Fetch Watchlist on Mount
  useEffect(() => {
    fetchWatchlist();
    fetchReports();
  }, []);

  // Load chart data whenever selectedTicker or intervalState changes
  useEffect(() => {
    if (selectedTicker) {
      loadTickerData(selectedTicker);
    }
  }, [selectedTicker, intervalState]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setScanLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  };

  const fetchWatchlist = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/watchlist`);
      if (res.ok) {
        const data = await res.json();
        const uniqueData = Array.from(new Set(data as string[]));
        setWatchlist(uniqueData);
        if (uniqueData.length > 0 && !selectedTicker) {
          setSelectedTicker(uniqueData[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load watchlist:", err);
      setErrorMessage("Could not connect to FastAPI server. Please ensure backend is running.");
      addLog('[ERROR] Connection to FastAPI backend failed.');
    }
  };

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/scanner/report`);
      if (res.ok) {
        const data = await res.json();
        // Deduplicate by ticker (keep the first occurrence, which is already sorted by backend)
        const seen = new Set<string>();
        const uniqueReports = data.filter((r: any) => {
          if (seen.has(r.ticker)) return false;
          seen.add(r.ticker);
          return true;
        });
        setReports(uniqueReports);
      }
    } catch (err) {
      console.error("Failed to load scanner reports:", err);
    }
  };

  // Spread calculation utilities
  const computeFrontendEMAs = (data: any[]) => {
    if (data.length === 0) return;
    const calculateEMA = (period: number, key: string) => {
      const k = 2 / (period + 1);
      let ema = data[0].close;
      data[0][key] = ema;
      for (let i = 1; i < data.length; i++) {
        ema = data[i].close * k + ema * (1 - k);
        data[i][key] = ema;
      }
    };
    calculateEMA(20, 'ema_20');
    calculateEMA(50, 'ema_50');
    calculateEMA(200, 'ema_200');
  };

  const loadTickerData = async (ticker: string) => {
    setLoadingChart(true);
    setErrorMessage(null);
    setLivePrice(null);
    
    addLog(`[FETCH] Loading historical candles for ${ticker}...`);

    if (ticker.includes('/')) {
      const [tickerA, tickerB] = ticker.split('/');
      addLog(`[SPREAD] Parsing pair spread ratio: ${tickerA} / ${tickerB} (Interval: ${intervalState})`);

      try {
        const [resA, resB] = await Promise.all([
          fetch(`${API_BASE}/api/ticker/${tickerA}?interval=${intervalState}`),
          fetch(`${API_BASE}/api/ticker/${tickerB}?interval=${intervalState}`)
        ]);

        if (!resA.ok || !resB.ok) {
          throw new Error(`Failed to load historical candles for ${!resA.ok ? tickerA : tickerB}`);
        }

        const dataA = await resA.json();
        const dataB = await resB.json();

        const historyA = dataA.history;
        const historyB = dataB.history;

        // Align by date time
        const historyBMap = new Map(historyB.map((bar: any) => [bar.time, bar]));
        const mergedHistory: any[] = [];

        historyA.forEach((barA: any) => {
          const barB: any = historyBMap.get(barA.time);
          if (barB && barB.close !== 0) {
            const openRatio = barA.open / barB.open;
            const highRatio = barA.high / barB.low;
            const lowRatio = barA.low / barB.high;
            const closeRatio = barA.close / barB.close;

            mergedHistory.push({
              time: barA.time,
              open: openRatio,
              high: Math.max(openRatio, highRatio, closeRatio),
              low: Math.min(openRatio, lowRatio, closeRatio),
              close: closeRatio,
              volume: barA.volume + barB.volume,
            });
          }
        });

        if (mergedHistory.length === 0) {
          throw new Error("Date histories do not overlap.");
        }

        computeFrontendEMAs(mergedHistory);
        setActiveHistory(mergedHistory);
        setActiveHSPattern(null);
        setActiveTradeReport(null);
        addLog(`[SUCCESS] Generated spread ratio dataset for ${ticker}. Overlapping days: ${mergedHistory.length}`);
      } catch (err: any) {
        console.error(err);
        setErrorMessage(err.message || `Error computing custom spread for ${ticker}`);
        setActiveHistory([]);
        setActiveHSPattern(null);
        setActiveTradeReport(null);
        addLog(`[ERROR] Failed to compile spread pair: ${err.message}`);
      } finally {
        setLoadingChart(false);
      }
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/ticker/${ticker}?interval=${intervalState}`);
        if (res.ok) {
          const data = await res.json();
          setActiveHistory(data.history);
          setActiveHSPattern(data.hs_pattern);
          setActiveTradeReport(data.trade_report);
          
          if (data.hs_pattern) {
            addLog(`[SCAN] Pattern Match: ${data.hs_pattern.type} identified on ${ticker}.`);
          } else {
            addLog(`[SCAN] Ticker loaded. No active structures detected.`);
          }
        } else {
          setActiveHistory([]);
          setActiveHSPattern(null);
          setActiveTradeReport(null);
          setErrorMessage(`No analysis found for ${ticker}. Please run scanner first.`);
        }
      } catch (err) {
        console.error("Failed to load ticker data:", err);
        setErrorMessage("Error fetching ticker historical calculations.");
      } finally {
        setLoadingChart(false);
      }
    }
  };

  const handleTriggerScan = async () => {
    setIsScanning(true);
    setErrorMessage(null);
    addLog('[SCAN] Initiating multi-threaded quantitative scanner job in background...');
    
    try {
      const res = await fetch(`${API_BASE}/api/scanner/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: watchlist }),
      });
      if (res.ok) {
        let attempts = 0;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        
        pollIntervalRef.current = setInterval(async () => {
          attempts++;
          addLog(`[SCAN] Polling results matrix (Batch check #${attempts})...`);
          await fetchReports();
          if (selectedTicker) {
            await loadTickerData(selectedTicker);
          }
          if (attempts >= 6) {
            setIsScanning(false);
            clearInterval(pollIntervalRef.current);
            addLog('[SUCCESS] Batch scanning complete. Signal matrix updated.');
          }
        }, 3000);
      } else {
        setIsScanning(false);
        setErrorMessage("Failed to initiate background scan job.");
        addLog('[ERROR] Scanner backend trigger rejected.');
      }
    } catch (err) {
      setIsScanning(false);
      setErrorMessage("Network error launching background batch scan.");
    }
  };

  const handleAddToWatchlist = async (tickerName: string) => {
    const cleanTicker = tickerName.trim().toUpperCase();
    if (!cleanTicker) return;

    addLog(`[WATCHLIST] Adding ${cleanTicker} to watchlist...`);
    try {
      const res = await fetch(`${API_BASE}/api/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: cleanTicker }),
      });
      if (res.ok) {
        const data = await res.json();
        const uniqueData = Array.from(new Set(data.watchlist as string[]));
        setWatchlist(uniqueData);
        setSelectedTicker(cleanTicker);
        addLog(`[SUCCESS] ${cleanTicker} added and selected.`);
      }
    } catch (err) {
      console.error("Failed to add to watchlist:", err);
    }
  };

  const handleCreateCustomSpread = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanA = pairStockA.trim().toUpperCase();
    const cleanB = pairStockB.trim().toUpperCase();
    if (!cleanA || !cleanB) return;

    const spreadTicker = `${cleanA}/${cleanB}`;
    addLog(`[WATCHLIST] Creating custom pair ratio: ${spreadTicker}...`);
    
    if (!watchlist.includes(spreadTicker)) {
      setWatchlist(prev => [...prev, spreadTicker]);
    }
    setSelectedTicker(spreadTicker);
    setPairStockA('');
    setPairStockB('');
  };

  const handleRemoveFromWatchlist = async (tickerName: string) => {
    addLog(`[WATCHLIST] Removing ${tickerName}...`);
    if (tickerName.includes('/')) {
      const newWl = watchlist.filter(w => w !== tickerName);
      setWatchlist(newWl);
      if (selectedTicker === tickerName && newWl.length > 0) {
        setSelectedTicker(newWl[0]);
      }
      addLog(`[SUCCESS] Removed custom spread ${tickerName}.`);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/watchlist/${tickerName}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        const uniqueData = Array.from(new Set(data.watchlist as string[]));
        setWatchlist(uniqueData);
        if (selectedTicker === tickerName && uniqueData.length > 0) {
          setSelectedTicker(uniqueData[0]);
        }
        addLog(`[SUCCESS] Removed ${tickerName} from database watchlist.`);
      }
    } catch (err) {
      console.error("Failed to remove from watchlist:", err);
    }
  };

  // Mock Trading execution
  const executeMockTrade = (side: 'Buy' | 'Sell') => {
    if (!livePrice) return;
    
    const newTrade: MockTrade = {
      ticker: selectedTicker,
      entryPrice: livePrice,
      qty: mockTradeQty,
      side: side
    };
    
    setMockTrade(newTrade);
    addLog(`[MOCK TRADE] ${side.toUpperCase()} Executed: ${mockTradeQty} shares of ${selectedTicker} at $${livePrice.toFixed(2)}.`);
  };

  const closeMockTrade = () => {
    if (!mockTrade || !livePrice) return;
    
    const diff = livePrice - mockTrade.entryPrice;
    const finalPnl = diff * mockTrade.qty * (mockTrade.side === 'Buy' ? 1 : -1);
    
    addLog(`[MOCK TRADE] Trade Closed: ${mockTrade.side.toUpperCase()} ${mockTrade.qty} shares of ${mockTrade.ticker}. Realized P&L: $${finalPnl.toFixed(2)} (${(finalPnl / (mockTrade.entryPrice * mockTrade.qty) * 100).toFixed(2)}%).`);
    setMockTrade(null);
  };

  // Compute live P&L
  let livePnl = 0;
  let livePnlPct = 0;
  if (mockTrade && livePrice && mockTrade.ticker === selectedTicker) {
    const diff = livePrice - mockTrade.entryPrice;
    livePnl = diff * mockTrade.qty * (mockTrade.side === 'Buy' ? 1 : -1);
    livePnlPct = (livePnl / (mockTrade.entryPrice * mockTrade.qty)) * 100;
  }

  // Monitor live prices to logs on mock trade state
  const handleLivePriceUpdate = (price: number) => {
    setLivePrice(price);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0c0f16] text-[#d1d4dc] font-sans overflow-hidden">
      
      {/* 1. Header Bar */}
      <header className="h-14 border-b border-tv-border bg-[#141824] flex items-center justify-between px-6 shrink-0 z-20 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-tv-green to-blue-500 rounded p-1.5 shadow-md shadow-tv-green/20">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest text-white uppercase flex items-center space-x-1.5">
              <span>Antigravity</span>
              <span className="text-tv-green text-[10px] font-bold normal-case bg-tv-green/10 px-2 py-0.5 rounded border border-tv-green/20">
                PRO QUANT HUD
              </span>
            </h1>
            <p className="text-[10px] text-tv-muted tracking-wider">Algorithmic Pattern & Spread Engine</p>
          </div>
        </div>

        {/* Page Navigation Switcher */}
        <div className="flex items-center space-x-1 bg-[#0c0f16]/60 p-1 rounded-lg border border-tv-border/40">
          <button
            onClick={() => setActivePage('trading')}
            className={`px-4 py-1.5 text-xs rounded font-bold uppercase transition-all ${
              activePage === 'trading'
                ? 'bg-tv-green text-white shadow-md'
                : 'text-tv-muted hover:text-white hover:bg-tv-border/25'
            }`}
          >
            Trading Terminal
          </button>
          <button
            onClick={() => setActivePage('stockbrowser')}
            className={`px-4 py-1.5 text-xs rounded font-bold uppercase transition-all ${
              activePage === 'stockbrowser'
                ? 'bg-tv-green text-white shadow-md'
                : 'text-tv-muted hover:text-white hover:bg-tv-border/25'
            }`}
          >
            Stock Directory
          </button>
        </div>

        {/* Global Toolbar Controllers & Toggle switches */}
        <div className="flex items-center space-x-4">
          
          {/* Panel Visibility Toggles */}
          <div className="flex items-center space-x-1.5 bg-[#0c0f16]/60 p-1.5 rounded-lg border border-tv-border/40">
            <span className="text-[9px] text-tv-muted font-bold uppercase tracking-wider px-1">Panels:</span>
            
            <button
              onClick={() => setShowLeftToolbar(prev => !prev)}
              title="Toggle Left Drawings Toolbar"
              className={`p-1.5 rounded transition-all ${
                showLeftToolbar ? 'bg-tv-green/20 text-tv-green border border-tv-green/30' : 'text-tv-muted hover:text-white border border-transparent'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setShowBottomPanel(prev => !prev)}
              title="Toggle Screener & Logs Panel"
              className={`p-1.5 rounded transition-all ${
                showBottomPanel ? 'bg-tv-green/20 text-tv-green border border-tv-green/30' : 'text-tv-muted hover:text-white border border-transparent'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setShowRightSidebar(prev => !prev)}
              title="Toggle Settings Sidebar"
              className={`p-1.5 rounded transition-all ${
                showRightSidebar ? 'bg-tv-green/20 text-tv-green border border-tv-green/30' : 'text-tv-muted hover:text-white border border-transparent'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setShowFloatingPanel(prev => !prev)}
              title="Toggle HUD Trade Overlay"
              className={`p-1.5 rounded transition-all ${
                showFloatingPanel ? 'bg-tv-green/20 text-tv-green border border-tv-green/30' : 'text-tv-muted hover:text-white border border-transparent'
              }`}
            >
              <Move className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interval Selector Tab Group */}
          <div className="flex items-center space-x-1 bg-[#0c0f16]/60 p-1 rounded-lg border border-tv-border/40">
            {['1d', '1h', '15m', '5m'].map((i) => (
              <button
                key={i}
                onClick={() => setIntervalState(i as any)}
                className={`px-2.5 py-1 text-xs rounded font-bold uppercase transition-all ${
                  intervalState === i
                    ? 'bg-tv-green text-white shadow-md'
                    : 'text-tv-muted hover:text-white hover:bg-tv-border/20'
                }`}
              >
                {i}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-1.5 text-xs bg-[#0c0f16] border border-tv-border px-3 py-1.5 rounded">
            <Activity className="w-3.5 h-3.5 text-tv-green animate-pulse" />
            <span className="text-tv-muted">Market Ticks:</span>
            <span className="font-semibold text-white">LIVE WEBSOCKET</span>
          </div>

          <button
            onClick={handleTriggerScan}
            disabled={isScanning}
            className={`flex items-center space-x-1.5 px-4 py-1.5 rounded text-xs font-bold transition-all ${
              isScanning
                ? 'bg-tv-border text-tv-muted cursor-not-allowed border border-tv-border'
                : 'bg-tv-green text-white hover:bg-tv-green-hover shadow-lg shadow-tv-green/10 border border-tv-green/40'
            }`}
          >
            <Play className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
          </button>
        </div>
      </header>

      {/* 2. Main Work Area (Split Pane) */}
      {activePage === 'stockbrowser' ? (
        <StockBrowser
          watchlist={watchlist}
          onAddToWatchlist={handleAddToWatchlist}
          onRemoveFromWatchlist={handleRemoveFromWatchlist}
          onSelectTicker={setSelectedTicker}
          onNavigateToTrading={() => setActivePage('trading')}
        />
      ) : (
        <div className="flex flex-grow w-full overflow-hidden">
          
          {/* Left main workspace */}
          <div className="flex flex-col flex-grow h-full overflow-hidden">
          
          {/* Top Panel: Chart */}
          <div className="flex-grow w-full relative z-0">
            {loadingChart ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0c0f16]/90 z-10 backdrop-blur-sm">
                <div className="flex flex-col items-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-tv-green animate-spin" />
                  <span className="text-xs text-tv-muted font-medium">Connecting sockets & fetching history...</span>
                </div>
              </div>
            ) : activeHistory.length > 0 ? (
              <Chart
                ticker={selectedTicker}
                history={activeHistory}
                hsPattern={activeHSPattern}
                tradeReport={activeTradeReport}
                settings={chartSettings}
                mockExecutionPrice={mockTrade && mockTrade.ticker === selectedTicker ? mockTrade.entryPrice : null}
                onLivePriceUpdate={handleLivePriceUpdate}
                showLeftToolbar={showLeftToolbar}
                drawings={drawings}
                setDrawings={setDrawings}
                chartType={chartType}
                setChartType={setChartType}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#0c0f16]">
                <AlertTriangle className="w-8 h-8 text-yellow-500 mb-2 animate-bounce" />
                <span className="text-xs font-semibold text-white uppercase">Historical Data Required</span>
                <p className="text-xs text-tv-muted mt-2 max-w-sm leading-relaxed">
                  {errorMessage || `No historical cached analysis found for ${selectedTicker}. Please trigger 'Scan Now' to run scanner.`}
                </p>
              </div>
            )}

            {/* Draggable HUD Setup Panel Overlay */}
            {showFloatingPanel && (
              <div
                onMouseDown={handleMouseDown}
                style={{ left: `${floatingPos.x}px`, top: `${floatingPos.y}px` }}
                className="absolute w-80 glass-panel text-white rounded-lg shadow-2xl z-30 select-none overflow-hidden live-border-pulse"
              >
                {/* Header handle */}
                <div className="drag-handle cursor-grab active:cursor-grabbing px-4 py-2.5 bg-[#141824]/90 border-b border-tv-border/50 flex justify-between items-center text-xs font-black uppercase tracking-wider text-[#d1d4dc]">
                  <div className="flex items-center space-x-1.5">
                    <Move className="w-3.5 h-3.5 text-tv-green" />
                    <span>Setup HUD: {selectedTicker}</span>
                  </div>
                  <button 
                    onClick={() => setShowFloatingPanel(false)}
                    className="text-tv-muted hover:text-white text-sm font-bold animate-pulse"
                  >
                    ✕
                  </button>
                </div>

                {/* Panel Details */}
                <div className="p-4 space-y-4 text-xs">
                  <div className="flex justify-between items-center bg-[#0c0f16]/60 p-2.5 rounded border border-tv-border/30">
                    <span className="text-tv-muted font-semibold">Live Price:</span>
                    <span className="text-base font-black text-white tracking-tight">
                      {livePrice ? `$${livePrice.toFixed(2)}` : '--'}
                    </span>
                  </div>

                  {activeTradeReport ? (
                    <div className={`p-3 rounded-lg border ${
                      activeTradeReport.signal === 'Buy' ? 'trade-glow-buy' : 'trade-glow-sell'
                    }`}>
                      <div className="flex justify-between font-bold text-white mb-2">
                        <span className="text-[11px] uppercase">{activeTradeReport.pattern}</span>
                        <span className={activeTradeReport.signal === 'Buy' ? 'text-tv-green' : 'text-tv-red'}>
                          {activeTradeReport.signal.toUpperCase()} SETUP
                        </span>
                      </div>
                      <div className="space-y-1 text-[11px] text-slate-300">
                        <div className="flex justify-between">
                          <span>Entry Trigger:</span>
                          <span className="font-semibold text-white">${activeTradeReport.entry.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Take Profit:</span>
                          <span className="font-semibold text-tv-green">${activeTradeReport.take_profit.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stop Loss:</span>
                          <span className="font-semibold text-tv-red">${activeTradeReport.stop_loss.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-tv-border/20 mt-1">
                          <span>Risk Reward:</span>
                          <span className="font-bold text-white">{activeTradeReport.risk_reward_ratio}:1</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Win Conviction:</span>
                          <span className="font-bold text-yellow-400">{activeTradeReport.win_conviction_pct}%</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-[#0c0f16]/40 rounded border border-tv-border/30 text-center italic text-tv-muted text-[11px]">
                      No active geometric setups found.
                    </div>
                  )}

                  {/* Mock Trading Simulator controls */}
                  <div className="border-t border-tv-border/40 pt-3">
                    <div className="text-[10px] text-tv-muted font-bold uppercase tracking-wider mb-2">Live Trade Simulator</div>

                    {mockTrade && mockTrade.ticker === selectedTicker ? (
                      <div className="bg-[#121622]/60 p-3 rounded border border-tv-border/40 space-y-2">
                        <div className="flex justify-between font-semibold">
                          <span>Position:</span>
                          <span className={mockTrade.side === 'Buy' ? 'text-tv-green' : 'text-tv-red'}>
                            {mockTrade.side.toUpperCase()} {mockTrade.qty} Shares
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Entry Price:</span>
                          <span className="font-semibold text-white">${mockTrade.entryPrice.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1.5 border-t border-tv-border/20">
                          <span className="font-bold">Floating P&L:</span>
                          <span className={`text-sm font-black ${livePnl >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                            {livePnl >= 0 ? '+' : ''}${livePnl.toFixed(2)} ({livePnlPct.toFixed(2)}%)
                          </span>
                        </div>
                        <button
                          onClick={closeMockTrade}
                          className="w-full mt-2 py-1.5 rounded font-bold text-[11px] bg-tv-red hover:bg-tv-red-hover text-white transition-all shadow-md shadow-tv-red/10"
                        >
                          Close Position
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-tv-muted font-medium">Quantity:</label>
                          <input
                            type="number"
                            value={mockTradeQty}
                            onChange={(e) => setMockTradeQty(Math.max(1, parseInt(e.target.value) || 0))}
                            className="w-20 bg-[#0c0f16] border border-tv-border rounded px-2 py-0.5 text-right font-semibold text-white text-[11px] focus:outline-none focus:border-tv-green"
                          />
                        </div>
                        
                        <div className="flex space-x-2">
                          <button
                            onClick={() => executeMockTrade('Buy')}
                            className="flex-grow py-1.5 rounded font-bold bg-tv-green hover:bg-tv-green-hover text-white transition-all shadow-md shadow-tv-green/10 text-[11px]"
                          >
                            Buy Long
                          </button>
                          <button
                            onClick={() => executeMockTrade('Sell')}
                            className="flex-grow py-1.5 rounded font-bold bg-tv-red hover:bg-tv-red-hover text-white transition-all shadow-md shadow-tv-red/10 text-[11px]"
                          >
                            Sell Short
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Panel */}
        {showBottomPanel && (
          <div className="h-64 shrink-0 w-full relative z-10">
            <Dashboard
              reports={reports}
              selectedTicker={selectedTicker}
              onSelectTicker={setSelectedTicker}
              isScanning={isScanning}
              scanLogs={scanLogs}
            />
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      {showRightSidebar && (
        <aside className="w-80 border-l border-tv-border bg-[#101420] flex flex-col h-full shrink-0 z-10">
          <div className="flex border-b border-tv-border/50 bg-[#141824] shrink-0">
            <button
              onClick={() => setSidebarTab('watchlist')}
              className={`flex-grow py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                sidebarTab === 'watchlist' 
                  ? 'text-white border-b-2 border-tv-green bg-[#101420]/40' 
                  : 'text-tv-muted hover:text-white'
              }`}
            >
              Watchlist & Pairs
            </button>
            <button
              onClick={() => setSidebarTab('settings')}
              className={`flex-grow py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                sidebarTab === 'settings' 
                  ? 'text-white border-b-2 border-tv-green bg-[#101420]/40' 
                  : 'text-tv-muted hover:text-white'
              }`}
            >
              Chart Layers
            </button>
          </div>

          <div className="flex-grow overflow-y-auto p-4 space-y-4">
            
            {sidebarTab === 'watchlist' ? (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] text-tv-muted font-bold uppercase tracking-wider">Add Single Stock</label>
                  <div className="flex space-x-2">
                    <input
                      ref={watchlistAddRef}
                      type="text"
                      placeholder="Add ticker (e.g. TSLA)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddToWatchlist(e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                      className="flex-grow bg-[#0c0f16] border border-tv-border rounded px-3 py-1.5 text-xs text-white placeholder-tv-muted focus:outline-none focus:border-tv-green transition-all"
                    />
                    <button
                      onClick={() => {
                        if (watchlistAddRef.current) {
                          handleAddToWatchlist(watchlistAddRef.current.value);
                          watchlistAddRef.current.value = '';
                        }
                      }}
                      className="bg-tv-border border border-tv-border hover:border-tv-muted hover:bg-tv-border/80 text-white rounded p-1.5 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleCreateCustomSpread} className="space-y-3 bg-[#141824]/60 p-3 rounded-lg border border-tv-border/40">
                  <div className="text-[10px] text-white font-bold uppercase tracking-wider flex items-center space-x-1">
                    <PlusCircle className="w-3.5 h-3.5 text-tv-green" />
                    <span>Watchlist Pair Spread</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-tv-muted block mb-0.5">Stock A</label>
                      <input
                        type="text"
                        placeholder="AAPL"
                        value={pairStockA}
                        onChange={(e) => setPairStockA(e.target.value.toUpperCase())}
                        className="w-full bg-[#0c0f16] border border-tv-border rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-tv-green"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-tv-muted block mb-0.5">Stock B</label>
                      <input
                        type="text"
                        placeholder="MSFT"
                        value={pairStockB}
                        onChange={(e) => setPairStockB(e.target.value.toUpperCase())}
                        className="w-full bg-[#0c0f16] border border-tv-border rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-tv-green"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-1.5 rounded bg-tv-green hover:bg-tv-green-hover text-white font-semibold text-xs transition-all shadow-md shadow-tv-green/15"
                  >
                    Create Spread Pair
                  </button>
                </form>

                <div className="space-y-2">
                  <label className="text-[10px] text-tv-muted font-bold uppercase tracking-wider">Watchlist Items</label>
                  <div className="divide-y divide-tv-border/20 border border-tv-border/30 rounded-lg overflow-hidden bg-[#0c0f16]/20">
                    {watchlist.map((symbol) => {
                      const report = reports.find((r) => r.ticker === symbol);
                      const isSelected = selectedTicker === symbol;
                      const hasSignal = report?.trade_report;

                      return (
                        <div
                          key={symbol}
                          onClick={() => setSelectedTicker(symbol)}
                          className={`flex items-center justify-between p-3 cursor-pointer transition-colors duration-100 ${
                            isSelected ? 'bg-tv-green/10 border-l-2 border-tv-green text-white' : 'hover:bg-tv-panel/40'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold tracking-wide">{symbol}</div>
                            <div className="text-[9px] text-tv-muted mt-0.5">
                              {symbol.includes('/') ? 'Spread Ratio' : report ? `$${report.current_price.toFixed(2)}` : '--'}
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                            {hasSignal && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                                hasSignal.signal === 'Buy' ? 'bg-tv-green/10 text-tv-green' : 'bg-tv-red/10 text-tv-red'
                              }`}>
                                {hasSignal.signal}
                              </span>
                            )}
                            <button
                              onClick={() => handleRemoveFromWatchlist(symbol)}
                              className="text-tv-muted hover:text-tv-red p-1 rounded hover:bg-tv-border/40 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {watchlist.length === 0 && (
                      <div className="p-8 text-center text-xs text-tv-muted italic">
                        No stocks in watchlist. Add one above.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="text-[10px] text-tv-muted font-bold uppercase tracking-wider mb-2">Overlay Indicators</div>
                
                <div className="space-y-3 bg-[#141824]/40 p-4 rounded-lg border border-tv-border/30">
                  <label className="flex items-center space-x-3 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={chartSettings.showEma20}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showEma20: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="flex items-center space-x-2">
                      <span className="w-3 h-1.5 bg-[#ff9800] rounded-full"></span>
                      <span className="text-slate-200">Show EMA 20</span>
                    </span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={chartSettings.showEma50}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showEma50: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="flex items-center space-x-2">
                      <span className="w-3 h-1.5 bg-[#2196f3] rounded-full"></span>
                      <span className="text-slate-200">Show EMA 50</span>
                    </span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={chartSettings.showEma200}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showEma200: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="flex items-center space-x-2">
                      <span className="w-3 h-1.5 bg-[#9c27b0] rounded-full"></span>
                      <span className="text-slate-200">Show EMA 200</span>
                    </span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={chartSettings.showVolume}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showVolume: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-slate-200">Show Volume Histogram</span>
                  </label>
                </div>

                <div className="text-[10px] text-tv-muted font-bold uppercase tracking-wider mb-2">Geometric Pattern Layers</div>

                <div className="space-y-3 bg-[#141824]/40 p-4 rounded-lg border border-tv-border/30">
                  <label className="flex items-center space-x-3 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={chartSettings.showHSOutline}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showHSOutline: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="flex items-center space-x-2">
                      <span className="w-3 h-1.5 bg-yellow-400 rounded-full"></span>
                      <span className="text-slate-200">Show H&S Outlines</span>
                    </span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={chartSettings.showNeckline}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showNeckline: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="flex items-center space-x-2">
                      <span className="w-3 h-1.5 bg-pink-500 rounded-full"></span>
                      <span className="text-slate-200">Show Necklines</span>
                    </span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={chartSettings.showPatternMarkers}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showPatternMarkers: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-slate-200">Show Pattern Breakout Markers</span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={chartSettings.showTradeSetup}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showTradeSetup: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-slate-200">Show Entry/SL/TP order lines</span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={chartSettings.showCandlestickPatterns}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showCandlestickPatterns: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-slate-200">Show Candlestick Patterns</span>
                  </label>
                </div>

                {/* Reset All Settings Button */}
                <div className="pt-4 border-t border-tv-border/30">
                  <button
                    onClick={handleResetAll}
                    className="w-full flex items-center justify-center space-x-2 py-2 rounded bg-tv-red/10 border border-tv-red/20 text-tv-red hover:bg-tv-red hover:text-white font-semibold text-xs transition-all shadow-md"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset Settings & Drawings</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          </aside>
        )}
      </div>
      )}
    </div>
  );
}

export default App;
