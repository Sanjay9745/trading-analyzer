import { useState, useEffect, useRef } from 'react';
import { Chart } from './components/Chart';
import { Dashboard } from './components/Dashboard';
import { StockBrowser } from './components/StockBrowser';
import { AuthPage } from './components/AuthPage';
import { SignalMatrix } from './components/SignalMatrix';
import { PriorityTrades } from './components/PriorityTrades';
import { getCurrencySymbol, formatPrice } from './utils/currency';
import { 
  Radio, AlertTriangle, Play, Plus, Trash2, RefreshCw, LogOut,
  X, LayoutGrid, BarChart3, Zap, LineChart, PanelLeftOpen
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
  const [activePage, setActivePage] = useState<'trading' | 'stockbrowser' | 'signalmatrix' | 'priority'>('trading');
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>('AAPL');
  const [activeHistory, setActiveHistory] = useState<any[]>([]);

  const [activeHSPattern, setActiveHSPattern] = useState<any | null>(null);
  const [activeTradeReport, setActiveTradeReport] = useState<any | null>(null);
  
  // User Authentication State
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('session_token'));
  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('user_email'));

  // UI & Panel Visibility States
  const [isScanning, setIsScanning] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Toggles for showing/hiding panels
  const [showLeftToolbar, setShowLeftToolbar] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [showWatchlistSidebar, setShowWatchlistSidebar] = useState(false);
  const [showNavSidebar, setShowNavSidebar] = useState(false);
  
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

  const [intervalState, setIntervalState] = useState<'1d' | '4h' | '1h' | '15m' | '5m'>('1d');
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
  
  const pollIntervalRef = useRef<any>(null);
  const watchlistAddRef = useRef<HTMLInputElement>(null);

  // User Login & Logout handlers
  const handleLoginSuccess = (token: string, email: string) => {
    setAuthToken(token);
    setUserEmail(email);
    localStorage.setItem('session_token', token);
    localStorage.setItem('user_email', email);
    addLog(`[AUTH] User ${email} logged in successfully.`);
  };

  const handleLogout = async () => {
    if (authToken) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });
      } catch (e) {
        console.error('Logout request failed:', e);
      }
    }
    setAuthToken(null);
    setUserEmail(null);
    localStorage.removeItem('session_token');
    localStorage.removeItem('user_email');
    setWatchlist([]);
    addLog('[AUTH] User logged out.');
  };

  // Fetch Watchlist & Reports whenever authToken changes
  useEffect(() => {
    if (authToken) {
      fetchWatchlist();
      fetchReports();
    }
  }, [authToken]);

  // Load chart data whenever selectedTicker or intervalState changes
  useEffect(() => {
    if (selectedTicker && authToken) {
      loadTickerData(selectedTicker);
    }
  }, [selectedTicker, intervalState, authToken]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setScanLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  };

  const fetchWatchlist = async () => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/watchlist`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
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
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/scanner/report`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
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
    if (!authToken) return;
    setLoadingChart(true);
    setErrorMessage(null);
    setLivePrice(null);
    
    addLog(`[FETCH] Loading historical candles for ${ticker}...`);

    const headers = {
      'Authorization': `Bearer ${authToken}`
    };

    if (ticker.includes('/')) {
      const [tickerA, tickerB] = ticker.split('/');
      addLog(`[SPREAD] Parsing pair spread ratio: ${tickerA} / ${tickerB} (Interval: ${intervalState})`);

      try {
        const [resA, resB] = await Promise.all([
          fetch(`${API_BASE}/api/ticker/${tickerA}?interval=${intervalState}`, { headers }),
          fetch(`${API_BASE}/api/ticker/${tickerB}?interval=${intervalState}`, { headers })
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
        const res = await fetch(`${API_BASE}/api/ticker/${ticker}?interval=${intervalState}`, { headers });
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
    if (!authToken) return;
    setIsScanning(true);
    setErrorMessage(null);
    addLog('[SCAN] Initiating multi-threaded quantitative scanner job in background...');
    
    try {
      const res = await fetch(`${API_BASE}/api/scanner/run`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
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
    if (!authToken) return;
    const cleanTicker = tickerName.trim().toUpperCase();
    if (!cleanTicker) return;

    addLog(`[WATCHLIST] Adding ${cleanTicker} to watchlist...`);
    try {
      const res = await fetch(`${API_BASE}/api/watchlist`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
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

  const handleAddBatchToWatchlist = async (tickers: string[]) => {
    if (!authToken || tickers.length === 0) return;
    addLog(`[WATCHLIST] Adding batch of ${tickers.length} tickers...`);
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/batch`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ tickers }),
      });
      if (res.ok) {
        const data = await res.json();
        const uniqueData = Array.from(new Set(data.watchlist as string[]));
        setWatchlist(uniqueData);
        addLog(`[SUCCESS] Added batch of ${tickers.length} tickers to watchlist.`);
      }
    } catch (err) {
      console.error("Failed to add batch to watchlist:", err);
    }
  };

  const handleRemoveBatchFromWatchlist = async (tickers: string[]) => {
    if (!authToken || tickers.length === 0) return;
    addLog(`[WATCHLIST] Removing batch of ${tickers.length} tickers...`);
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/batch/delete`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ tickers }),
      });
      if (res.ok) {
        const data = await res.json();
        const uniqueData = Array.from(new Set(data.watchlist as string[]));
        setWatchlist(uniqueData);
        addLog(`[SUCCESS] Removed batch of ${tickers.length} tickers from watchlist.`);
      }
    } catch (err) {
      console.error("Failed to remove batch from watchlist:", err);
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
    if (!authToken) return;
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
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
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
    addLog(`[MOCK TRADE] ${side.toUpperCase()} Executed: ${mockTradeQty} shares of ${selectedTicker} at ${getCurrencySymbol(selectedTicker)}${livePrice.toFixed(2)}.`);
  };

  const closeMockTrade = () => {
    if (!mockTrade || !livePrice) return;
    
    const diff = livePrice - mockTrade.entryPrice;
    const finalPnl = diff * mockTrade.qty * (mockTrade.side === 'Buy' ? 1 : -1);
    
    addLog(`[MOCK TRADE] Trade Closed: ${mockTrade.side.toUpperCase()} ${mockTrade.qty} shares of ${mockTrade.ticker}. Realized P&L: ${getCurrencySymbol(mockTrade.ticker)}${finalPnl.toFixed(2)} (${(finalPnl / (mockTrade.entryPrice * mockTrade.qty) * 100).toFixed(2)}%).`);
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

  if (!authToken) {
    return <AuthPage apiBase={API_BASE} onLoginSuccess={handleLoginSuccess} />;
  }
  const currSym = getCurrencySymbol(selectedTicker);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0c0f16] text-[#d1d4dc] font-sans overflow-hidden pb-12 md:pb-0">
      
      {/* 1. Header Bar - compact: toggle + logo + user */}
      <header className="h-12 md:h-14 border-b border-tv-border bg-[#141824] flex items-center justify-between px-3 md:px-5 shrink-0 z-40 shadow-md safe-top">
        {/* Left: Nav toggle + Logo */}
        <div className="flex items-center space-x-2 md:space-x-3">
          <button 
            onClick={() => setShowNavSidebar(!showNavSidebar)} 
            className="p-1.5 rounded-lg text-tv-muted hover:text-white hover:bg-tv-border/30 transition-colors"
            title="Toggle Navigation"
          >
            {showNavSidebar ? <X className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>

          <div className="bg-gradient-to-tr from-tv-green to-blue-500 rounded p-1 md:p-1.5 shadow-md shadow-tv-green/20">
            <Radio className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xs md:text-sm font-black tracking-widest text-white uppercase flex items-center space-x-1.5">
              <span>Antigravity</span>
              <span className="hidden sm:inline text-tv-green text-[9px] md:text-[10px] font-bold normal-case bg-tv-green/10 px-1.5 py-0.5 rounded border border-tv-green/20">
                PRO QUANT
              </span>
            </h1>
          </div>
        </div>

        {/* Center: Active page label (visible on mobile) */}
        <div className="text-[10px] md:text-xs font-bold text-tv-muted uppercase tracking-widest">
          {activePage === 'trading' ? 'Trading' : activePage === 'stockbrowser' ? 'Directory' : activePage === 'signalmatrix' ? 'Signals' : 'Priority'}
        </div>

        {/* Right: User Info & Logout */}
        <div className="flex items-center space-x-2 bg-[#0c0f16]/85 px-2 md:px-3 py-1 md:py-1.5 rounded-lg border border-tv-border/50 shadow">
          <span className="text-[9px] md:text-[10px] text-slate-300 font-bold uppercase truncate max-w-[60px] md:max-w-[120px]">{userEmail}</span>
          <button
            onClick={handleLogout}
            title="Logout Session"
            className="p-1.5 rounded text-tv-muted hover:text-tv-red hover:bg-tv-red/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Navigation Sidebar Drawer (slides from left, works on ALL screen sizes) */}
      {showNavSidebar && (
        <div onClick={() => setShowNavSidebar(false)} className="fixed inset-0 bg-black/50 z-40" />
      )}
      <aside className={`fixed top-0 left-0 bottom-0 w-64 z-50 bg-[#141824] border-r border-tv-border shadow-2xl flex flex-col transition-transform duration-200 ease-in-out ${
        showNavSidebar ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between p-4 border-b border-tv-border/40">
          <div className="flex items-center space-x-2">
            <div className="bg-gradient-to-tr from-tv-green to-blue-500 rounded p-1 shadow-md shadow-tv-green/20">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-black tracking-widest text-white uppercase">Navigate</span>
          </div>
          <button onClick={() => setShowNavSidebar(false)} className="p-1 rounded text-tv-muted hover:text-white hover:bg-tv-border/30 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex flex-col p-3 space-y-1 flex-grow">
          {[
            { id: 'trading', label: 'Trading Terminal', icon: LineChart },
            { id: 'stockbrowser', label: 'Stock Directory', icon: LayoutGrid },
            { id: 'signalmatrix', label: 'Signal Matrix', icon: BarChart3 },
            { id: 'priority', label: 'Priority Setups', icon: Zap },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActivePage(tab.id as any); setShowNavSidebar(false); }}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-bold uppercase tracking-wide transition-all ${
                activePage === tab.id
                  ? 'bg-tv-green/15 text-tv-green border border-tv-green/25'
                  : 'text-tv-muted hover:text-white hover:bg-tv-border/20 border border-transparent'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-tv-border/30 text-[9px] text-tv-muted uppercase tracking-widest">
          Antigravity Quant Engine
        </div>
      </aside>

      {/* 2. Main Work Area */}
      {activePage === 'stockbrowser' ? (
        <StockBrowser
          watchlist={watchlist}
          onAddToWatchlist={handleAddToWatchlist}
          onRemoveFromWatchlist={handleRemoveFromWatchlist}
          onAddBatchToWatchlist={handleAddBatchToWatchlist}
          onRemoveBatchFromWatchlist={handleRemoveBatchFromWatchlist}
          onSelectTicker={setSelectedTicker}
          onNavigateToTrading={() => setActivePage('trading')}
          apiBase={API_BASE}
        />
      ) : activePage === 'signalmatrix' ? (
        <SignalMatrix
          apiBase={API_BASE}
          authToken={authToken || ''}
          onSelectTicker={setSelectedTicker}
          onNavigateToTrading={() => setActivePage('trading')}
        />
      ) : activePage === 'priority' ? (
        <PriorityTrades
          apiBase={API_BASE}
          authToken={authToken || ''}
          onSelectTicker={setSelectedTicker}
          onNavigateToTrading={() => setActivePage('trading')}
        />
      ) : (
        <div className="flex flex-grow w-full overflow-hidden relative">
          
          {/* Mobile sidebar backdrop overlay */}
          {((showWatchlistSidebar || showRightSidebar) && activePage === 'trading') && (
            <div 
              onClick={() => {
                setShowWatchlistSidebar(false);
                setShowRightSidebar(false);
              }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
            />
          )}

          {/* Left Watchlist Sidebar (Sleek & responsive) */}
          <aside className={`absolute lg:static inset-y-0 left-0 z-30 w-[280px] sm:w-64 border-r border-tv-border bg-[#101420] flex flex-col h-full shrink-0 transition-transform duration-200 ease-in-out ${
            showWatchlistSidebar ? 'translate-x-0' : '-translate-x-full lg:hidden'
          }`}>
            <div className="p-4 border-b border-tv-border/40 bg-[#141824] shrink-0">
              <h3 className="text-xs font-extrabold tracking-widest text-white uppercase">Watchlist & Pairs</h3>
            </div>
            
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              <div className="space-y-1.5">
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
                    className="flex-grow bg-[#0c0f16] border border-tv-border rounded px-2.5 py-1.5 text-xs text-white placeholder-tv-muted focus:outline-none focus:border-tv-green transition-all"
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
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreateCustomSpread} className="space-y-2 bg-[#141824]/40 p-2.5 rounded-lg border border-tv-border/30">
                <div className="text-[9px] text-white font-bold uppercase tracking-wider">Spread Ratio</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    placeholder="AAPL"
                    value={pairStockA}
                    onChange={(e) => setPairStockA(e.target.value.toUpperCase())}
                    className="w-full bg-[#0c0f16] border border-tv-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-tv-green"
                  />
                  <input
                    type="text"
                    placeholder="MSFT"
                    value={pairStockB}
                    onChange={(e) => setPairStockB(e.target.value.toUpperCase())}
                    className="w-full bg-[#0c0f16] border border-tv-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-tv-green"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-1 rounded bg-tv-green hover:bg-tv-green-hover text-white font-semibold text-[10px] transition-all"
                >
                  Create Pair
                </button>
              </form>

              <div className="divide-y divide-tv-border/10 border border-tv-border/20 rounded-lg overflow-hidden bg-[#0c0f16]/10">
                {watchlist.map((symbol) => {
                  const report = reports.find((r) => r.ticker === symbol);
                  const isSelected = selectedTicker === symbol;
                  const hasSignal = report?.trade_report;

                  return (
                    <div
                      key={symbol}
                      onClick={() => setSelectedTicker(symbol)}
                      className={`flex items-center justify-between p-2.5 cursor-pointer transition-colors duration-100 ${
                        isSelected ? 'bg-tv-green/10 border-l-2 border-tv-green text-white' : 'hover:bg-tv-panel/30'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="text-xs font-bold tracking-wide truncate">{symbol}</div>
                        <div className="text-[9px] text-tv-muted mt-0.5">
                          {symbol.includes('/') ? 'Spread' : report ? formatPrice(symbol, report.current_price) : '--'}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        {hasSignal && (
                          <span className={`text-[9px] px-1 py-0.2 rounded font-extrabold uppercase ${
                            hasSignal.signal === 'Buy' ? 'bg-tv-green/10 text-tv-green' : 'bg-tv-red/10 text-tv-red'
                          }`}>
                            {hasSignal.signal}
                          </span>
                        )}
                        <button
                          onClick={() => handleRemoveFromWatchlist(symbol)}
                          className="text-tv-muted hover:text-tv-red p-1 rounded transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {watchlist.length === 0 && (
                  <div className="p-4 text-center text-[10px] text-tv-muted italic">
                    Empty watchlist.
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Center Column: Control strip + Chart + Collapsible Console bottom drawer */}
          <div className="flex-grow flex flex-col h-full overflow-hidden">
            
            {/* Control Strip */}
            <div className="h-auto min-h-10 md:min-h-11 py-1.5 md:py-2 px-2 md:px-4 border-b border-tv-border/50 bg-[#101420] flex items-center justify-between gap-2 md:gap-3 shrink-0 z-10 overflow-x-auto mobile-scroll">
              <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <span className="text-xs md:text-sm font-black text-white whitespace-nowrap">{selectedTicker}</span>
                
                <div className="flex bg-[#0c0f16] p-0.5 rounded border border-tv-border/40 shrink-0">
                  {['1d', '4h', '1h', '15m', '5m'].map((i) => (
                    <button
                      key={i}
                      onClick={() => setIntervalState(i as any)}
                      className={`px-2 md:px-2.5 py-1 md:py-0.5 text-[10px] rounded font-bold uppercase transition-all ${
                        intervalState === i
                          ? 'bg-tv-green text-white shadow'
                          : 'text-tv-muted hover:text-white'
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
                
                {/* Panel toggles - visible on mobile & desktop (scrollable bar) */}
                <div className="flex items-center gap-1 sm:gap-1.5 border-l border-tv-border/40 pl-2 sm:pl-3">
                  <button
                    onClick={() => setShowLeftToolbar(prev => !prev)}
                    className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px] font-bold border transition-all ${
                      showLeftToolbar 
                        ? 'bg-tv-green/10 text-tv-green border-tv-green/30' 
                        : 'text-tv-muted hover:text-white border-transparent'
                    }`}
                  >
                    Drawings
                  </button>

                  <button
                    onClick={() => setShowWatchlistSidebar(prev => !prev)}
                    className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px] font-bold border transition-all ${
                      showWatchlistSidebar 
                        ? 'bg-tv-green/10 text-tv-green border-tv-green/30' 
                        : 'text-tv-muted hover:text-white border-transparent'
                    }`}
                  >
                    Watchlist
                  </button>
                  
                  <button
                    onClick={() => setShowRightSidebar(prev => !prev)}
                    className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px] font-bold border transition-all ${
                      showRightSidebar 
                        ? 'bg-tv-green/10 text-tv-green border-tv-green/30' 
                        : 'text-tv-muted hover:text-white border-transparent'
                    }`}
                  >
                    HUD & Layers
                  </button>
                  
                  <button
                    onClick={() => setShowBottomPanel(prev => !prev)}
                    className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px] font-bold border transition-all ${
                      showBottomPanel 
                        ? 'bg-tv-green/10 text-tv-green border-tv-green/30' 
                        : 'text-tv-muted hover:text-white border-transparent'
                    }`}
                  >
                    Console
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <div className="hidden sm:flex items-center space-x-1 text-[10px] text-tv-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-tv-green animate-ping"></span>
                  <span>LIVE</span>
                </div>
                
                <button
                  onClick={handleTriggerScan}
                  disabled={isScanning}
                  className={`flex items-center space-x-1.5 px-2.5 md:px-3 py-1.5 md:py-1 rounded text-[10px] font-bold transition-all whitespace-nowrap ${
                    isScanning
                      ? 'bg-tv-border text-tv-muted cursor-not-allowed'
                      : 'bg-tv-green text-white hover:bg-tv-green-hover shadow'
                  }`}
                >
                  <Play className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{isScanning ? 'Scanning...' : 'Scan Now'}</span>
                  <span className="sm:hidden">{isScanning ? '...' : 'Scan'}</span>
                </button>
              </div>
            </div>

            {/* Chart */}
            <div className="flex-grow w-full relative z-0">
              {loadingChart ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0c0f16]/90 z-10 backdrop-blur-xs">
                  <div className="flex flex-col items-center space-y-2">
                    <RefreshCw className="w-6 h-6 text-tv-green animate-spin" />
                    <span className="text-[10px] text-tv-muted font-medium">Fetching history...</span>
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
                  <AlertTriangle className="w-6 h-6 text-yellow-500 mb-1 animate-bounce" />
                  <span className="text-[10px] font-semibold text-white uppercase">Historical Data Required</span>
                  <p className="text-[10px] text-tv-muted mt-1 max-w-xs leading-relaxed">
                    {errorMessage || `No historical cached analysis found for ${selectedTicker}. Please trigger 'Scan Now' to run scanner.`}
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Collapsible Console drawer */}
            {showBottomPanel && (
              <div className="h-40 md:h-60 shrink-0 w-full relative z-10 border-t border-tv-border/50">
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

          {/* Right Setup & overlay Settings sidebar */}
          <aside className={`absolute lg:static inset-y-0 right-0 z-30 w-[300px] sm:w-72 border-l border-tv-border bg-[#101420] flex flex-col h-full shrink-0 transition-transform duration-200 ease-in-out ${
            showRightSidebar ? 'translate-x-0' : 'translate-x-full lg:hidden'
          }`}>
            <div className="p-4 border-b border-tv-border/40 bg-[#141824] shrink-0">
              <h3 className="text-xs font-extrabold tracking-widest text-white uppercase">HUD & Indicator Controls</h3>
            </div>
            
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              
              {/* 1. Active Breakout Signal */}
              <div className="space-y-2">
                <div className="text-[10px] text-tv-muted font-bold uppercase tracking-wider">Breakout HUD</div>
                
                <div className="bg-[#0c0f16]/50 p-3 rounded-lg border border-tv-border/30 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-tv-muted">Live Price:</span>
                    <span className="text-sm font-black text-white">
                      {livePrice ? `${currSym}${livePrice.toFixed(2)}` : '--'}
                    </span>
                  </div>

                  {activeTradeReport ? (
                    <div className={`p-2.5 rounded-md border mt-2 ${
                      activeTradeReport.signal === 'Buy' ? 'trade-glow-buy' : 'trade-glow-sell'
                    }`}>
                      <div className="flex justify-between font-bold text-white mb-1.5">
                        <span className="text-[10px] uppercase">{activeTradeReport.pattern}</span>
                        <span className={activeTradeReport.signal === 'Buy' ? 'text-tv-green' : 'text-tv-red'}>
                          {activeTradeReport.signal.toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="space-y-1 text-[10px] text-slate-300">
                        <div className="flex justify-between">
                          <span>Entry Trigger:</span>
                          <span className="font-semibold text-white">{currSym}{activeTradeReport.entry.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Take Profit:</span>
                          <span className="font-semibold text-tv-green">{currSym}{activeTradeReport.take_profit.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stop Loss:</span>
                          <span className="font-semibold text-tv-red">{currSym}{activeTradeReport.stop_loss.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between border-t border-tv-border/10 pt-1 mt-1 font-bold text-white">
                          <span>R:R Ratio:</span>
                          <span>{activeTradeReport.risk_reward_ratio}:1</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Conviction:</span>
                          <span className="text-yellow-400">{activeTradeReport.win_conviction_pct}%</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center italic text-tv-muted text-[10px] py-2 bg-[#0c0f16]/30 border border-transparent rounded">
                      No pattern detected.
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Live Simulator */}
              <div className="space-y-2 border-t border-tv-border/20 pt-3">
                <div className="text-[10px] text-tv-muted font-bold uppercase tracking-wider">Live Simulator</div>
                
                {mockTrade && mockTrade.ticker === selectedTicker ? (
                  <div className="bg-[#121622]/80 p-3 rounded-lg border border-tv-border/50 space-y-2">
                    <div className="flex justify-between font-bold text-xs">
                      <span>Position:</span>
                      <span className={mockTrade.side === 'Buy' ? 'text-tv-green' : 'text-tv-red'}>
                        {mockTrade.side.toUpperCase()} {mockTrade.qty} Shares
                      </span>
                    </div>
                    <div className="space-y-1 text-[10px] text-slate-300">
                      <div className="flex justify-between">
                        <span>Entry Price:</span>
                        <span>{getCurrencySymbol(mockTrade.ticker)}{mockTrade.entryPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-tv-border/10 pt-1.5 mt-1">
                        <span className="font-bold text-white">Profit & Loss:</span>
                        <span className={`font-black ${livePnl >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {livePnl >= 0 ? '+' : ''}{getCurrencySymbol(mockTrade.ticker)}{livePnl.toFixed(2)} ({livePnlPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={closeMockTrade}
                      className="w-full py-1.5 rounded font-bold text-[10px] bg-tv-red hover:bg-tv-red-hover text-white transition-all"
                    >
                      Close Position
                    </button>
                  </div>
                ) : (
                  <div className="bg-[#0c0f16]/30 p-3 rounded-lg border border-tv-border/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-tv-muted">Qty:</label>
                      <input
                        type="number"
                        value={mockTradeQty}
                        onChange={(e) => setMockTradeQty(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-16 bg-[#0c0f16] border border-tv-border rounded px-1.5 py-0.5 text-right font-semibold text-white text-[10px]"
                      />
                    </div>
                    <div className="flex space-x-1.5">
                      <button
                        onClick={() => executeMockTrade('Buy')}
                        className="flex-grow py-1 rounded font-bold bg-tv-green hover:bg-tv-green-hover text-white text-[10px]"
                      >
                        Buy Long
                      </button>
                      <button
                        onClick={() => executeMockTrade('Sell')}
                        className="flex-grow py-1 rounded font-bold bg-tv-red hover:bg-tv-red-hover text-white text-[10px]"
                      >
                        Sell Short
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Indicators & overlays */}
              <div className="space-y-2 border-t border-tv-border/20 pt-3">
                <div className="text-[10px] text-tv-muted font-bold uppercase tracking-wider">Indicator Overlays</div>
                <div className="space-y-2 bg-[#0c0f16]/30 p-3 rounded-lg border border-tv-border/30">
                  {[
                    { key: 'showEma20', label: 'EMA 20', color: 'bg-[#ff9800]' },
                    { key: 'showEma50', label: 'EMA 50', color: 'bg-[#2196f3]' },
                    { key: 'showEma200', label: 'EMA 200', color: 'bg-[#9c27b0]' },
                  ].map(ema => (
                    <label key={ema.key} className="flex items-center space-x-2.5 cursor-pointer text-[10px] text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={(chartSettings as any)[ema.key]}
                        onChange={(e) => setChartSettings(prev => ({ ...prev, [ema.key]: e.target.checked }))}
                        className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="flex items-center space-x-1.5">
                        <span className={`w-2.5 h-1 ${ema.color} rounded-full`}></span>
                        <span>{ema.label}</span>
                      </span>
                    </label>
                  ))}
                  
                  <label className="flex items-center space-x-2.5 cursor-pointer text-[10px] text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={chartSettings.showVolume}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showVolume: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span>Volume Histogram</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2 border-t border-tv-border/20 pt-3">
                <div className="text-[10px] text-tv-muted font-bold uppercase tracking-wider">Pattern Outlines</div>
                <div className="space-y-2 bg-[#0c0f16]/30 p-3 rounded-lg border border-tv-border/30">
                  {[
                    { key: 'showHSOutline', label: 'H&S Outlines', color: 'bg-yellow-400' },
                    { key: 'showNeckline', label: 'Necklines', color: 'bg-pink-500' },
                  ].map(layer => (
                    <label key={layer.key} className="flex items-center space-x-2.5 cursor-pointer text-[10px] text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={(chartSettings as any)[layer.key]}
                        onChange={(e) => setChartSettings(prev => ({ ...prev, [layer.key]: e.target.checked }))}
                        className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="flex items-center space-x-1.5">
                        <span className={`w-2.5 h-1 ${layer.color} rounded-full`}></span>
                        <span>{layer.label}</span>
                      </span>
                    </label>
                  ))}
                  
                  <label className="flex items-center space-x-2.5 cursor-pointer text-[10px] text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={chartSettings.showPatternMarkers}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showPatternMarkers: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span>Breakout Markers</span>
                  </label>
                  
                  <label className="flex items-center space-x-2.5 cursor-pointer text-[10px] text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={chartSettings.showTradeSetup}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showTradeSetup: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span>Trade Setup Targets</span>
                  </label>

                  <label className="flex items-center space-x-2.5 cursor-pointer text-[10px] text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={chartSettings.showCandlestickPatterns}
                      onChange={(e) => setChartSettings(prev => ({ ...prev, showCandlestickPatterns: e.target.checked }))}
                      className="rounded bg-[#0c0f16] border-tv-border text-tv-green focus:ring-0 focus:ring-offset-0"
                    />
                    <span>Candlestick Patterns</span>
                  </label>
                </div>
              </div>

              <button
                onClick={handleResetAll}
                className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded bg-tv-red/10 border border-tv-red/20 text-tv-red hover:bg-tv-red hover:text-white font-semibold text-[10px] transition-all"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset Layers</span>
              </button>

            </div>
          </aside>

        </div>
      )}

      {/* Mobile bottom tab bar - only visible on small screens */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#141824] border-t border-tv-border/50 flex items-center justify-around px-1 py-1 safe-bottom">
        {[
          { id: 'trading', label: 'Trade', icon: LineChart },
          { id: 'stockbrowser', label: 'Stocks', icon: LayoutGrid },
          { id: 'signalmatrix', label: 'Signals', icon: BarChart3 },
          { id: 'priority', label: 'Priority', icon: Zap },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActivePage(tab.id as any)}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-lg flex-1 transition-all ${
              activePage === tab.id
                ? 'text-tv-green bg-tv-green/10'
                : 'text-tv-muted hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default App;
