import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, Sparkles, ArrowUpRight, ArrowDownRight, Compass, ShieldAlert, BadgeDollarSign, ChevronRight } from 'lucide-react';
import { getCurrencySymbol } from '../utils/currency';

interface PriorityTradesProps {
  apiBase: string;
  authToken: string;
  onSelectTicker: (ticker: string) => void;
  onNavigateToTrading: () => void;
}

interface PriorityItem {
  ticker: string;
  current_price: number | null;
  last_updated: string;
  hs_pattern: any | null;
  trade_report: {
    signal: 'Buy' | 'Sell';
    pattern: string;
    entry: number;
    stop_loss: number;
    take_profit: number;
    risk_reward_ratio: number;
    win_conviction_pct: number;
  };
}

export function PriorityTrades({ apiBase, authToken, onSelectTicker, onNavigateToTrading }: PriorityTradesProps) {
  const [trades, setTrades] = useState<PriorityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPriorityTrades = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/scanner/priority-trades`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const result = await res.json();
        setTrades(result);
      } else {
        setErrorMsg('Failed to load priority trade setups.');
      }
    } catch (err) {
      console.error('Error fetching priority trades:', err);
      setErrorMsg('Failed to connect to scanner database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPriorityTrades();
  }, [apiBase, authToken]);

  const handleCardClick = (symbol: string) => {
    onSelectTicker(symbol);
    onNavigateToTrading();
  };

  const getExchange = (symbol: string): string => {
    if (symbol.endsWith('.NS')) return 'NSE';
    if (symbol.endsWith('.BO')) return 'BSE';
    return 'US';
  };

  return (
    <div className="flex-grow flex flex-col h-full bg-[#0c0f16] overflow-y-auto px-8 py-6">
      
      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-black text-white tracking-tight uppercase flex items-center space-x-2.5">
          <span>Priority Trade Setups</span>
          <span className="text-xs bg-gradient-to-r from-tv-green/15 to-blue-500/15 text-tv-green px-2.5 py-1 rounded-full border border-tv-green/30 font-bold uppercase tracking-wider animate-pulse flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>High Conviction</span>
          </span>
        </h2>
        <p className="text-sm text-tv-muted mt-1 max-w-xl">
          High-probability algorithmic configurations filtered from yesterday's analysis. These assets show active pattern breakouts and favorable Risk/Reward criteria.
        </p>
      </div>

      {/* Grid container */}
      {loading ? (
        <div className="flex-grow flex flex-col items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-tv-green animate-spin mb-3" />
          <p className="text-xs text-tv-muted">Sifting through pattern classifications...</p>
        </div>
      ) : errorMsg ? (
        <div className="flex-grow flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-tv-red font-bold uppercase">{errorMsg}</p>
          <button 
            onClick={fetchPriorityTrades} 
            className="mt-4 text-xs font-bold text-tv-green hover:underline uppercase tracking-wider"
          >
            Retry Connection
          </button>
        </div>
      ) : trades.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
          {trades.map((item) => {
            const isBuy = item.trade_report.signal === 'Buy';
            const exch = getExchange(item.ticker);
            const riskReward = item.trade_report.risk_reward_ratio;
            const conviction = item.trade_report.win_conviction_pct;
            const cs = getCurrencySymbol(item.ticker);

            return (
              <div
                key={item.ticker}
                onClick={() => handleCardClick(item.ticker)}
                className="group glass-panel hover:bg-tv-panel/30 border border-tv-border/40 hover:border-tv-green/40 p-6 rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-1.5 flex flex-col h-[380px] relative overflow-hidden shadow-lg"
              >
                {/* Visual hover background gradients */}
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${isBuy ? 'from-tv-green/5' : 'from-tv-red/5'} to-transparent rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform duration-300`}></div>
                <div className={`absolute top-0 left-0 right-0 h-[3px] ${isBuy ? 'bg-gradient-to-r from-tv-green/40 to-emerald-500/40' : 'bg-gradient-to-r from-tv-red/40 to-rose-500/40'}`}></div>

                {/* Top Header Card */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xl font-black text-white tracking-wide group-hover:text-tv-green transition-colors">
                      {item.ticker}
                    </span>
                    <span className="text-[9px] text-tv-muted font-bold ml-2 uppercase tracking-widest">{exch} Market</span>
                  </div>
                  
                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border tracking-wider flex items-center space-x-1 ${
                    isBuy 
                      ? 'bg-tv-green/10 text-tv-green border-tv-green/25' 
                      : 'bg-tv-red/10 text-tv-red border-tv-red/25'
                  }`}>
                    {isBuy ? (
                      <>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>BUY CALL</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="w-3.5 h-3.5" />
                        <span>SELL CALL</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Subtitle / Company/Pattern */}
                <div className="mb-6">
                  <h4 className="text-xs font-semibold text-tv-muted uppercase tracking-wider mb-1">
                    Detected Structure
                  </h4>
                  <p className="text-sm font-bold text-white uppercase">
                    {item.trade_report.pattern} Setup
                  </p>
                </div>

                {/* Core Trade Metrics Grid */}
                <div className="grid grid-cols-2 gap-4 bg-[#07090e]/75 p-4 rounded-xl border border-tv-border/20 mb-6">
                  
                  {/* Conviction */}
                  <div>
                    <span className="block text-[9px] font-bold text-tv-muted uppercase tracking-wider mb-0.5">Win Conviction</span>
                    <span className={`text-base font-black tracking-tight ${isBuy ? 'text-tv-green' : 'text-tv-red'}`}>
                      {conviction.toFixed(1)}%
                    </span>
                  </div>

                  {/* Risk/Reward */}
                  <div>
                    <span className="block text-[9px] font-bold text-tv-muted uppercase tracking-wider mb-0.5">Risk : Reward</span>
                    <span className="text-base font-black text-white tracking-tight">
                      1 : {riskReward.toFixed(2)}
                    </span>
                  </div>

                </div>

                {/* Target Boundaries */}
                <div className="space-y-2.5 mb-6 text-xs font-bold uppercase tracking-wider">
                  <div className="flex items-center justify-between">
                    <span className="text-tv-muted flex items-center space-x-1.5 text-[10px]">
                      <Compass className="w-3.5 h-3.5 text-blue-500" />
                      <span>Target Entry:</span>
                    </span>
                    <span className="text-white">{cs}{item.trade_report.entry.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-tv-muted flex items-center space-x-1.5 text-[10px]">
                      <BadgeDollarSign className="w-3.5 h-3.5 text-tv-green" />
                      <span>Take Profit:</span>
                    </span>
                    <span className="text-tv-green font-extrabold">{cs}{item.trade_report.take_profit.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-tv-muted flex items-center space-x-1.5 text-[10px]">
                      <ShieldAlert className="w-3.5 h-3.5 text-tv-red" />
                      <span>Stop Loss:</span>
                    </span>
                    <span className="text-tv-red font-extrabold">{cs}{item.trade_report.stop_loss.toFixed(2)}</span>
                  </div>
                </div>

                {/* Action button */}
                <div className="mt-auto pt-4 border-t border-tv-border/20 flex items-center justify-between text-xs font-bold text-tv-green group-hover:text-white transition-colors uppercase tracking-wider">
                  <span>Analyze setup on chart</span>
                  <ChevronRight className="w-4 h-4 translate-x-0 group-hover:translate-x-1 transition-transform" />
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-grow flex flex-col items-center justify-center py-20 text-center">
          <TrendingUp className="w-8 h-8 text-tv-muted mb-3 animate-pulse" />
          <h4 className="text-sm font-bold text-white uppercase">No Priority setups found</h4>
          <p className="text-xs text-tv-muted mt-1.5 max-w-xs leading-relaxed">
            There are currently no active pattern breakouts that satisfy the high conviction requirements. Check back after the next scheduled scanning batch runs.
          </p>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-auto pt-6 border-t border-tv-border/20 text-center flex flex-col sm:flex-row sm:justify-between items-center text-[10px] text-tv-muted gap-2">
        <div className="flex items-center space-x-1.5">
          <Sparkles className="w-3.5 h-3.5 text-tv-green" />
          <span>Priority setups are computed dynamically using technical oscillators & composite indicators.</span>
        </div>
        <div>
          <span>Antigravity Platform • High Conviction Signal Pipeline</span>
        </div>
      </div>

    </div>
  );
}
