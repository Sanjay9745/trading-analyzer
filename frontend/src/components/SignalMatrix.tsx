import { useState, useEffect } from 'react';
import { Search, Loader2, Sparkles, RefreshCw, BarChart2, Calendar } from 'lucide-react';
import { getCurrencySymbol } from '../utils/currency';

interface SignalMatrixProps {
  apiBase: string;
  authToken: string;
  onSelectTicker: (ticker: string) => void;
  onNavigateToTrading: () => void;
}

interface MatrixItem {
  ticker: string;
  interval: string;
  current_price: number | null;
  last_updated: string;
  hs_pattern: any | null;
  trade_report: any | null;
}

export function SignalMatrix({ apiBase, authToken, onSelectTicker, onNavigateToTrading }: SignalMatrixProps) {
  const [data, setData] = useState<MatrixItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExchange, setSelectedExchange] = useState('ALL');
  const [selectedSignal, setSelectedSignal] = useState('ALL'); // ALL, Buy, Sell, NONE
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const fetchMatrixData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/scanner/signal-matrix`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        setErrorMsg('Failed to load matrix data from server.');
      }
    } catch (err) {
      console.error('Error fetching signal matrix:', err);
      setErrorMsg('Failed to connect to database backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrixData();
  }, [apiBase, authToken]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedExchange, selectedSignal]);

  const handleRowClick = (symbol: string) => {
    onSelectTicker(symbol);
    onNavigateToTrading();
  };

  const getExchange = (symbol: string): string => {
    const sym = symbol.toUpperCase();
    if (sym.endsWith('.NS')) return 'NSE';
    if (sym.endsWith('.BO')) return 'BSE';
    return 'US';
  };

  // Filter logic
  const filteredData = data.filter(item => {
    const query = searchQuery.toLowerCase().trim();
    const symbolMatches = item.ticker.toLowerCase().includes(query);
    
    // Also support searching by pattern shape or signal
    const patternType = item.hs_pattern?.type || '';
    const patternLabel = patternType === 'head_and_shoulders' ? 'head and shoulders' : patternType === 'inverse_head_and_shoulders' ? 'inverse head and shoulders' : '';
    const patternMatches = patternLabel.includes(query);
    
    const signal = item.trade_report?.signal || '';
    const signalMatches = signal.toLowerCase().includes(query);

    const matchesSearch = symbolMatches || patternMatches || signalMatches;

    // Exchange filter
    const exch = getExchange(item.ticker);
    if (selectedExchange !== 'ALL' && exch !== selectedExchange) {
      return false;
    }
    
    // Signal filter
    const signalVal = item.trade_report?.signal || 'NONE';
    if (selectedSignal !== 'ALL') {
      if (selectedSignal === 'ACTIVE' && signalVal === 'NONE') return false;
      if (selectedSignal !== 'ACTIVE' && signalVal.toUpperCase() !== selectedSignal.toUpperCase()) return false;
    }

    return matchesSearch;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getExchangeBadgeStyle = (exchange: string) => {
    switch (exchange) {
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

  const formatLastUpdated = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch (e) {
      return isoStr;
    }
  };

  return (
    <div className="flex-grow flex flex-col h-full bg-[#0c0f16] overflow-y-auto px-8 py-6">
      
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight uppercase flex items-center space-x-2.5">
            <span>Algorithmic Signal Matrix</span>
            <span className="text-xs bg-tv-green/10 text-tv-green px-2.5 py-1 rounded-full border border-tv-green/25 font-bold uppercase tracking-wider animate-pulse">
              Scanned Data
            </span>
          </h2>
          <p className="text-sm text-tv-muted mt-1 max-w-xl">
            Complete matrix showing pattern classifications and buy/sell conviction metrics compiled during the midnight background scan.
          </p>
        </div>

        <button
          onClick={fetchMatrixData}
          disabled={loading}
          className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-tv-muted hover:text-white transition-colors bg-tv-panel/50 px-4 py-2.5 rounded-lg border border-tv-border/50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Filter panel */}
      <div className="glass-panel p-4 rounded-xl mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tv-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stock symbol..."
            className="w-full bg-[#07090e] border border-tv-border hover:border-tv-muted focus:border-tv-green rounded-lg pl-10 pr-4 py-2.5 text-xs text-white placeholder-tv-muted focus:outline-none transition-all"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          
          {/* Exchange Filter */}
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-tv-muted uppercase tracking-wider whitespace-nowrap">Exchange:</span>
            <select
              value={selectedExchange}
              onChange={(e) => setSelectedExchange(e.target.value)}
              className="w-full sm:w-auto bg-[#07090e] border border-tv-border hover:border-tv-muted focus:border-tv-green rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition-all cursor-pointer"
            >
              <option value="ALL">All Markets</option>
              <option value="US">US Markets</option>
              <option value="NSE">NSE (India)</option>
              <option value="BSE">BSE (India)</option>
            </select>
          </div>

          {/* Signal Filter */}
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-tv-muted uppercase tracking-wider whitespace-nowrap">Signal Trigger:</span>
            <select
              value={selectedSignal}
              onChange={(e) => setSelectedSignal(e.target.value)}
              className="w-full sm:w-auto bg-[#07090e] border border-tv-border hover:border-tv-muted focus:border-tv-green rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition-all cursor-pointer"
            >
              <option value="ALL">All Conditions</option>
              <option value="ACTIVE">Active Signals Only (Buy/Sell)</option>
              <option value="BUY">Buy Trigger</option>
              <option value="SELL">Sell Trigger</option>
              <option value="NONE">No Trigger</option>
            </select>
          </div>

        </div>

      </div>

      {/* Main Table view */}
      {loading ? (
        <div className="flex-grow flex flex-col items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-tv-green animate-spin mb-3" />
          <p className="text-xs text-tv-muted">Querying quant database matrix...</p>
        </div>
      ) : errorMsg ? (
        <div className="flex-grow flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-tv-red font-bold uppercase">{errorMsg}</p>
          <button 
            onClick={fetchMatrixData} 
            className="mt-4 text-xs font-bold text-tv-green hover:underline uppercase tracking-wider"
          >
            Retry Connection
          </button>
        </div>
      ) : filteredData.length > 0 ? (
        <div className="glass-panel rounded-xl overflow-hidden border border-tv-border/50 mb-12 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left border-collapse">
              <thead>
                <tr className="bg-[#07090e]/85 border-b border-tv-border text-[10px] font-extrabold uppercase tracking-wider text-tv-muted">
                  <th className="py-4 px-6">Ticker</th>
                  <th className="py-4 px-4">Market</th>
                  <th className="py-4 px-4 text-right">Price</th>
                  <th className="py-4 px-6 text-center">Pattern Shape</th>
                  <th className="py-4 px-6 text-center">Bias</th>
                  <th className="py-4 px-4 text-right">Conviction</th>
                  <th className="py-4 px-4 text-right">Target Entry</th>
                  <th className="py-4 px-4 text-right">Stop Loss</th>
                  <th className="py-4 px-4 text-right">Take Profit</th>
                  <th className="py-4 px-6 text-right">Last Scanned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/40 text-xs font-semibold text-slate-200">
                {paginatedData.map((item) => {
                  const exchange = getExchange(item.ticker);
                  const isBuy = item.trade_report?.signal === 'Buy';
                  const isSell = item.trade_report?.signal === 'Sell';
                  
                  return (
                    <tr
                      key={item.ticker}
                      onClick={() => handleRowClick(item.ticker)}
                      className="hover:bg-tv-panel/30 cursor-pointer transition-colors group"
                    >
                      {/* Symbol */}
                      <td className="py-3.5 px-6 font-black text-white group-hover:text-tv-green transition-colors tracking-wide">
                        {item.ticker}
                      </td>
                      
                      {/* Exchange */}
                      <td className="py-3.5 px-4">
                        <span className={`text-[9px] px-2 py-0.5 rounded font-black tracking-wider uppercase ${getExchangeBadgeStyle(exchange)}`}>
                          {exchange}
                        </span>
                      </td>

                      {/* Current Price */}
                      <td className="py-3.5 px-4 text-right font-bold text-white">
                        {item.current_price !== null ? `${getCurrencySymbol(item.ticker)}${item.current_price.toFixed(2)}` : '—'}
                      </td>

                      {/* Pattern */}
                      <td className="py-3.5 px-6 text-center font-medium">
                        {item.hs_pattern ? (
                          <span className="text-yellow-400 bg-yellow-400/5 border border-yellow-400/20 px-2 py-0.5 rounded text-[10px]">
                            {item.hs_pattern.type === 'head_and_shoulders' ? 'Head & Shoulders' : 'Inv. Head & Shoulders'}
                          </span>
                        ) : (
                          <span className="text-tv-muted">—</span>
                        )}
                      </td>

                      {/* Signal Bias */}
                      <td className="py-3.5 px-6 text-center font-extrabold">
                        {isBuy && (
                          <span className="text-tv-green bg-tv-green/10 border border-tv-green/20 px-2 py-0.5 rounded text-[10px]">
                            BUY
                          </span>
                        )}
                        {isSell && (
                          <span className="text-tv-red bg-tv-red/10 border border-tv-red/20 px-2 py-0.5 rounded text-[10px]">
                            SELL
                          </span>
                        )}
                        {!isBuy && !isSell && (
                          <span className="text-tv-muted font-medium">—</span>
                        )}
                      </td>

                      {/* Win Conviction */}
                      <td className="py-3.5 px-4 text-right font-black">
                        {item.trade_report ? (
                          <span className={isBuy ? 'text-tv-green' : 'text-tv-red'}>
                            {item.trade_report.win_conviction_pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-tv-muted font-normal">—</span>
                        )}
                      </td>

                      {/* Entry Price */}
                      <td className="py-3.5 px-4 text-right font-bold">
                        {item.trade_report ? `${getCurrencySymbol(item.ticker)}${item.trade_report.entry.toFixed(2)}` : '—'}
                      </td>

                      {/* Stop Loss */}
                      <td className="py-3.5 px-4 text-right font-bold text-tv-red/80">
                        {item.trade_report ? `${getCurrencySymbol(item.ticker)}${item.trade_report.stop_loss.toFixed(2)}` : '—'}
                      </td>

                      {/* Take Profit */}
                      <td className="py-3.5 px-4 text-right font-bold text-tv-green/80">
                        {item.trade_report ? `${getCurrencySymbol(item.ticker)}${item.trade_report.take_profit.toFixed(2)}` : '—'}
                      </td>

                      {/* Last Scanned */}
                      <td className="py-3.5 px-6 text-right text-tv-muted font-medium">
                        {formatLastUpdated(item.last_updated)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between bg-[#141824]/40 border-t border-tv-border/30 px-6 py-4 gap-4 shrink-0">
              <div className="text-xs text-tv-muted font-bold uppercase tracking-wider">
                Showing <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                <span className="text-white">
                  {Math.min(currentPage * itemsPerPage, filteredData.length)}
                </span>{' '}
                of <span className="text-tv-green">{filteredData.length}</span> results
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[#0c0f16] border border-tv-border text-tv-text hover:text-white disabled:opacity-30 disabled:hover:text-tv-text transition-all cursor-pointer disabled:cursor-not-allowed uppercase tracking-wider"
                >
                  Previous
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = currentPage;
                  if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  if (pageNum < 1 || pageNum > totalPages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        currentPage === pageNum
                          ? 'bg-tv-green text-white shadow-md shadow-tv-green/20'
                          : 'bg-[#0c0f16] border border-tv-border text-tv-muted hover:text-white hover:border-tv-muted'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[#0c0f16] border border-tv-border text-tv-text hover:text-white disabled:opacity-30 disabled:hover:text-tv-text transition-all cursor-pointer disabled:cursor-not-allowed uppercase tracking-wider"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-grow flex flex-col items-center justify-center py-20 text-center">
          <BarChart2 className="w-8 h-8 text-tv-muted mb-3 animate-pulse" />
          <h4 className="text-sm font-bold text-white uppercase">No Matrix Records found</h4>
          <p className="text-xs text-tv-muted mt-1.5 max-w-xs leading-relaxed">
            No scanned data matches your active query filters. Make sure the scheduled background scans have run at least once.
          </p>
        </div>
      )}

      {/* Table Footer */}
      <div className="mt-auto pt-6 border-t border-tv-border/20 text-center flex flex-col sm:flex-row sm:justify-between items-center text-[10px] text-tv-muted gap-2">
        <div className="flex items-center space-x-1.5">
          <Sparkles className="w-3.5 h-3.5 text-tv-green" />
          <span>Click on any row to open the active stock charting dashboard and execute manual tests.</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Calendar className="w-3.5 h-3.5" />
          <span>Last automated background run schedule: Midnight (GMT+5:30)</span>
        </div>
      </div>

    </div>
  );
}
