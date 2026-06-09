import { useState, useEffect } from 'react';
import { Search, Plus, Check, Globe, Tag, ArrowLeft, Loader2, Sparkles, TrendingUp, Trash2 } from 'lucide-react';

interface Stock {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
}

interface StockBrowserProps {
  watchlist: string[];
  onAddToWatchlist: (ticker: string) => Promise<void>;
  onRemoveFromWatchlist: (ticker: string) => Promise<void>;
  onAddBatchToWatchlist: (tickers: string[]) => Promise<void>;
  onRemoveBatchFromWatchlist: (tickers: string[]) => Promise<void>;
  onSelectTicker: (ticker: string) => void;
  onNavigateToTrading: () => void;
  apiBase?: string;
}

export function StockBrowser({
  watchlist,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onAddBatchToWatchlist,
  onRemoveBatchFromWatchlist,
  onSelectTicker,
  onNavigateToTrading,
  apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
}: StockBrowserProps) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExchange, setSelectedExchange] = useState('ALL');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // Fetch stocks from the search endpoint
  useEffect(() => {
    const fetchStocks = async () => {
      setLoading(true);
      try {
        const url = `${apiBase}/api/stocks/search?q=${encodeURIComponent(searchQuery)}&exchange=${selectedExchange}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setStocks(data);
        }
      } catch (err) {
        console.error("Error fetching stock list:", err);
      } finally {
        setLoading(false);
      }
    };

    // Simple debounce to prevent excessive backend queries on search keystrokes
    const delayDebounceFn = setTimeout(() => {
      fetchStocks();
    }, 250);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedExchange, apiBase]);

  // Extract unique sectors from stocks for the sector dropdown filter
  const sectors = ['ALL', ...Array.from(new Set(stocks.map(s => s.sector))).filter(Boolean)];

  // Filter stocks on frontend by sector (on top of backend queries)
  const filteredStocks = stocks.filter(stock => {
    if (selectedSector !== 'ALL' && stock.sector !== selectedSector) return false;
    return true;
  });

  const handleWatchlistToggle = async (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation(); // Avoid triggering card click (view chart)
    setActionLoading(symbol);
    try {
      if (watchlist.includes(symbol)) {
        await onRemoveFromWatchlist(symbol);
      } else {
        await onAddToWatchlist(symbol);
      }
    } catch (err) {
      console.error("Watchlist action failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelectAll = async () => {
    if (filteredStocks.length === 0) return;
    setBatchLoading(true);
    const symbols = filteredStocks.map(s => s.symbol);
    try {
      await onAddBatchToWatchlist(symbols);
    } catch (err) {
      console.error("Batch add failed:", err);
    } finally {
      setBatchLoading(false);
    }
  };

  const handleDeselectAll = async () => {
    if (filteredStocks.length === 0) return;
    setBatchLoading(true);
    const symbols = filteredStocks.map(s => s.symbol);
    try {
      await onRemoveBatchFromWatchlist(symbols);
    } catch (err) {
      console.error("Batch remove failed:", err);
    } finally {
      setBatchLoading(false);
    }
  };

  const handleCardClick = (symbol: string) => {
    onSelectTicker(symbol);
    onNavigateToTrading();
  };

  const getExchangeBadgeStyle = (exchange: string) => {
    switch (exchange.toUpperCase()) {
      case 'US':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'NSE':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'BSE':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      default:
        return 'bg-tv-muted/10 text-tv-muted border border-tv-border';
    }
  };

  return (
    <div className="flex-grow flex flex-col h-full bg-[#0c0f16] overflow-y-auto px-8 py-6">
      
      {/* Navigation Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onNavigateToTrading}
          className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-tv-muted hover:text-white transition-colors bg-tv-panel/50 px-4 py-2 rounded-lg border border-tv-border/50"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Terminal</span>
        </button>

        <div className="flex items-center space-x-2 bg-gradient-to-r from-tv-green/10 to-blue-500/10 border border-tv-green/20 px-3 py-1.5 rounded-lg">
          <Sparkles className="w-4 h-4 text-tv-green animate-pulse" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Indian Stocks Supported (.NS / .BO)</span>
        </div>
      </div>

      {/* Page Title */}
      <div className="mb-8">
        <h2 className="text-2xl font-black text-white tracking-tight uppercase flex items-center space-x-2.5">
          <span>Global Stock Directory</span>
          <span className="text-xs bg-tv-green/10 text-tv-green px-2 py-0.5 rounded border border-tv-green/20 normal-case">
            Exchange Catalog
          </span>
        </h2>
        <p className="text-sm text-tv-muted mt-1 max-w-xl">
          Browse and search popular US stocks or Indian BSE & NSE equities. Click on cards to inspect historical patterns or add them to your persistent watchlist.
        </p>
      </div>

      {/* Filter and Search Controls */}
      <div className="glass-panel p-4 rounded-xl mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tv-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search symbol, company name, or sector..."
            className="w-full bg-[#0c0f16] border border-tv-border hover:border-tv-muted focus:border-tv-green rounded-lg pl-10 pr-4 py-2.5 text-xs text-white placeholder-tv-muted focus:outline-none transition-all"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          
          {/* Exchange Tab Selectors */}
          <div className="flex overflow-x-auto bg-[#0c0f16] p-1 rounded-lg border border-tv-border scrollbar-none shrink-0 max-w-full gap-1">
            {[
              { id: 'ALL', label: 'All Exchanges' },
              { id: 'US', label: 'US Markets' },
              { id: 'NSE', label: 'NSE (India)' },
              { id: 'BSE', label: 'BSE (India)' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedExchange(tab.id);
                  setSelectedSector('ALL'); // Reset sector filter when changing exchange
                }}
                className={`whitespace-nowrap px-2.5 sm:px-3 py-1.5 text-xs rounded font-bold uppercase transition-all ${
                  selectedExchange === tab.id
                    ? 'bg-tv-green text-white shadow-md'
                    : 'text-tv-muted hover:text-white hover:bg-tv-border/20'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sector Selector Dropdown */}
          <div className="relative w-full sm:w-auto">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="appearance-none w-full bg-[#0c0f16] border border-tv-border rounded-lg px-4 py-2 text-xs text-white pr-8 hover:border-tv-muted focus:border-tv-green focus:outline-none transition-all cursor-pointer"
            >
              {sectors.map(sec => (
                <option key={sec} value={sec}>
                  {sec === 'ALL' ? 'All Sectors' : sec}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-tv-muted">
              <ArrowLeft className="w-3.5 h-3.5" style={{ transform: 'rotate(-90deg)' }} />
            </div>
          </div>
        </div>

      </div>

      {/* Batch Select / Deselect Controls */}
      {filteredStocks.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#141824]/50 border border-tv-border/50 rounded-xl px-5 py-3 gap-3 mb-6">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-tv-muted">Filtered Results:</span>
            <span className="text-xs font-bold text-white bg-tv-border px-2.5 py-0.5 rounded border border-tv-border/50">
              {filteredStocks.length} {filteredStocks.length === 1 ? 'stock' : 'stocks'}
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSelectAll}
              disabled={batchLoading}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-tv-green/15 text-tv-green border border-tv-green/30 hover:bg-tv-green hover:text-white transition-all disabled:opacity-50"
            >
              {batchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Add All to Watchlist</span>
            </button>
            
            <button
              onClick={handleDeselectAll}
              disabled={batchLoading}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-tv-red/15 text-tv-red border border-tv-red/30 hover:bg-tv-red hover:text-white transition-all disabled:opacity-50"
            >
              {batchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Remove All from Watchlist</span>
            </button>
          </div>
        </div>
      )}

      {/* Grid List of Cards */}
      {loading ? (
        <div className="flex-grow flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-tv-green animate-spin mb-3" />
          <p className="text-xs text-tv-muted">Searching exchange catalogs...</p>
        </div>
      ) : filteredStocks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-12">
          {filteredStocks.map(stock => {
            const isAdded = watchlist.includes(stock.symbol);
            const isProcessing = actionLoading === stock.symbol;

            return (
              <div
                key={stock.symbol}
                onClick={() => handleCardClick(stock.symbol)}
                className="group glass-panel hover:bg-tv-panel/30 border border-tv-border/40 hover:border-tv-green/40 p-5 rounded-xl cursor-pointer transition-all duration-200 hover:-translate-y-1 flex flex-col justify-between h-44 relative overflow-hidden"
              >
                {/* Visual hover grid lines / design overlay */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-tv-green/5 to-transparent rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform duration-300"></div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-black text-white group-hover:text-tv-green transition-colors tracking-wide">
                      {stock.symbol}
                    </span>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-black tracking-wider uppercase ${getExchangeBadgeStyle(stock.exchange)}`}>
                      {stock.exchange}
                    </span>
                  </div>

                  <h4 className="text-xs font-semibold text-slate-200 line-clamp-2 pr-6 leading-relaxed mb-3">
                    {stock.name}
                  </h4>
                </div>

                <div className="flex items-center justify-between mt-auto pt-3 border-t border-tv-border/20">
                  <div className="flex items-center space-x-1.5 text-[10px] text-tv-muted">
                    <Tag className="w-3.5 h-3.5 text-tv-green/70" />
                    <span className="font-medium truncate max-w-[120px]">{stock.sector}</span>
                  </div>

                  <button
                    onClick={(e) => handleWatchlistToggle(e, stock.symbol)}
                    disabled={isProcessing}
                    className={`flex items-center justify-center p-1.5 rounded-lg border transition-all ${
                      isAdded
                        ? 'bg-tv-green/10 text-tv-green border-tv-green/35 hover:bg-tv-red/10 hover:text-tv-red hover:border-tv-red/35'
                        : 'bg-[#0c0f16] text-tv-muted border-tv-border hover:text-white hover:border-tv-muted hover:bg-tv-panel/50'
                    }`}
                    title={isAdded ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5 group-hover:hidden" />
                        <span className="hidden group-hover:inline text-[9px] font-extrabold uppercase px-1">Remove</span>
                      </>
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-grow flex flex-col items-center justify-center py-20 text-center">
          <Globe className="w-8 h-8 text-tv-muted mb-3 animate-pulse" />
          <h4 className="text-sm font-bold text-white uppercase">No Stocks Match Filter</h4>
          <p className="text-xs text-tv-muted mt-1.5 max-w-xs leading-relaxed">
            We couldn't find any stocks matching your query. Try searching for other popular names or adjusting your filters.
          </p>
        </div>
      )}

      {/* Directory Quick-Fact Footer */}
      <div className="mt-auto pt-6 border-t border-tv-border/20 text-center flex flex-col sm:flex-row sm:justify-between items-center text-[10px] text-tv-muted gap-2">
        <div className="flex items-center space-x-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-tv-green" />
          <span>Real-time price simulations automatically start upon watchlisting.</span>
        </div>
        <div>
          <span>Antigravity Quant Platform Exchange Catalog • Last updated June 2026</span>
        </div>
      </div>

    </div>
  );
}
