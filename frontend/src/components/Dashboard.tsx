import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Clock, Terminal, FileText } from 'lucide-react';
import { getCurrencySymbol } from '../utils/currency';

interface TradeReport {
  signal: 'Buy' | 'Sell';
  pattern: string;
  entry: number;
  stop_loss: number;
  take_profit: number;
  risk_reward_ratio: number;
  win_conviction_pct: number;
}

interface ScanReport {
  ticker: string;
  current_price: number;
  last_updated: string;
  hs_pattern: any | null;
  trade_report?: TradeReport | null;
}

interface DashboardProps {
  reports: ScanReport[];
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
  isScanning: boolean;
  scanLogs: string[];
}

export const Dashboard: React.FC<DashboardProps> = ({
  reports,
  selectedTicker,
  onSelectTicker,
  isScanning,
  scanLogs,
}) => {
  // Tab state: 'matrix' for the breakout table, 'console' for system logs
  const [activeTab, setActiveTab] = useState<'matrix' | 'console'>('matrix');

  // Compute basic statistics
  const activeSetups = reports.filter((r) => r.trade_report);
  const buySetups = activeSetups.filter((r) => r.trade_report?.signal === 'Buy');
  const sellSetups = activeSetups.filter((r) => r.trade_report?.signal === 'Sell');
  
  const avgRR = activeSetups.length > 0 
    ? (activeSetups.reduce((acc, r) => acc + (r.trade_report?.risk_reward_ratio || 0), 0) / activeSetups.length).toFixed(2) 
    : '0.00';

  const highConvictionSetups = activeSetups.filter((r) => (r.trade_report?.win_conviction_pct || 0) >= 80);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#101420]">
      {/* Tab Switcher Header */}
      <div className="px-4 py-2 border-b border-tv-border bg-[#141824] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-1.5 bg-[#0c0f16]/60 p-0.5 rounded border border-tv-border/30">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1 text-[10px] rounded font-bold uppercase transition-all flex items-center space-x-1.5 ${
              activeTab === 'matrix'
                ? 'bg-tv-green text-white shadow'
                : 'text-tv-muted hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Signal Matrix</span>
          </button>
          
          <button
            onClick={() => setActiveTab('console')}
            className={`px-3 py-1 text-[10px] rounded font-bold uppercase transition-all flex items-center space-x-1.5 ${
              activeTab === 'console'
                ? 'bg-tv-green text-white shadow'
                : 'text-tv-muted hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>System Console</span>
          </button>
        </div>

        {/* Right Header Status Indicators */}
        {activeTab === 'matrix' ? (
          <div className="flex items-center space-x-3 text-[10px] text-tv-muted font-bold uppercase tracking-wider">
            {isScanning && (
              <span className="text-[9px] bg-yellow-400/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded font-black animate-pulse">
                Scanning...
              </span>
            )}
            <div className="hidden sm:flex items-center space-x-1 bg-[#0c0f16] px-2.5 py-1 rounded border border-tv-border/30 text-slate-300">
              <span>Setups: {activeSetups.length} ({buySetups.length} B / {sellSetups.length} S)</span>
            </div>
            <div className="hidden sm:flex items-center space-x-1 bg-[#0c0f16] px-2.5 py-1 rounded border border-tv-border/30 text-tv-green">
              <span>Avg R:R: {avgRR}:1</span>
            </div>
            <div className="flex items-center space-x-1.5 text-tv-muted font-medium bg-[#0c0f16] px-2.5 py-1 rounded border border-tv-border/30">
              <Clock className="w-3 h-3 text-tv-green" />
              <span className="normal-case">Auto-Updated</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-2 text-[10px] text-tv-muted font-bold uppercase tracking-wider">
            <span className="text-[9px] bg-tv-green/10 text-tv-green border border-tv-green/30 px-2.5 py-1 rounded font-black flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-tv-green animate-pulse inline-block"></span>
              <span>Quant Engine Live Link</span>
            </span>
          </div>
        )}
      </div>

      {/* Content Panels */}
      <div className="flex-grow w-full overflow-hidden relative bg-[#0c0f16]/10">
        
        {/* Tab 1: Signal Matrix */}
        {activeTab === 'matrix' && (
          <div className="h-full w-full overflow-auto">
            <table className="w-full min-w-[700px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-tv-border/40 text-tv-muted bg-[#101420] sticky top-0 font-semibold tracking-wider text-[10px] uppercase z-10">
                  <th className="py-2.5 px-6">Ticker / Price</th>
                  <th className="py-2.5 px-4">Pattern Type</th>
                  <th className="py-2.5 px-4">Bias</th>
                  <th className="py-2.5 px-4">Entry</th>
                  <th className="py-2.5 px-4">Stop Loss</th>
                  <th className="py-2.5 px-4">Target (TP)</th>
                  <th className="py-2.5 px-4">R:R Ratio</th>
                  <th className="py-2.5 px-6 text-right">Win Conviction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/10">
                {reports.map((report) => {
                  const tr = report.trade_report;
                  const isSelected = selectedTicker === report.ticker;
                  
                  return (
                    <tr
                      key={report.ticker}
                      onClick={() => onSelectTicker(report.ticker)}
                      className={`cursor-pointer transition-all duration-150 ${
                        isSelected 
                          ? 'bg-tv-green/10 border-l-2 border-tv-green text-white font-semibold' 
                          : 'hover:bg-tv-panel/35 text-tv-text'
                      }`}
                    >
                      <td className="py-3 px-6 font-bold flex items-center space-x-2">
                        <span className="text-white">{report.ticker}</span>
                        <span className="text-[10px] text-tv-muted font-normal">
                          ({getCurrencySymbol(report.ticker)}{report.current_price.toFixed(2)})
                        </span>
                      </td>
                      
                      <td className="py-3 px-4 text-[#e2e8f0]">
                        {tr ? (
                          <span className="flex items-center space-x-1.5">
                            {tr.signal === 'Buy' ? (
                              <TrendingUp className="w-3.5 h-3.5 text-tv-green" />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5 text-tv-red" />
                            )}
                            <span className="text-[11px] font-medium">{tr.pattern}</span>
                          </span>
                        ) : (
                          <span className="text-tv-muted italic text-[11px]">No setup found</span>
                        )}
                      </td>
                      
                      <td className="py-3 px-4 font-bold text-[10px]">
                        {tr ? (
                          <span className={`px-2 py-0.5 rounded font-extrabold uppercase ${
                            tr.signal === 'Buy' 
                              ? 'bg-tv-green/15 text-tv-green border border-tv-green/20' 
                              : 'bg-tv-red/15 text-tv-red border border-tv-red/20'
                          }`}>
                            {tr.signal}
                          </span>
                        ) : (
                          <span className="text-tv-muted">-</span>
                        )}
                      </td>
                      
                      <td className="py-3 px-4 font-semibold text-slate-100">
                        {tr ? `${getCurrencySymbol(report.ticker)}${tr.entry.toFixed(2)}` : <span className="text-tv-muted">-</span>}
                      </td>
                      
                      <td className="py-3 px-4 font-semibold text-tv-red">
                        {tr ? `${getCurrencySymbol(report.ticker)}${tr.stop_loss.toFixed(2)}` : <span className="text-tv-muted">-</span>}
                      </td>
                      
                      <td className="py-3 px-4 font-semibold text-tv-green">
                        {tr ? `${getCurrencySymbol(report.ticker)}${tr.take_profit.toFixed(2)}` : <span className="text-tv-muted">-</span>}
                      </td>
                      
                      <td className="py-3 px-4 font-bold text-slate-200">
                        {tr ? `${tr.risk_reward_ratio}:1` : <span className="text-tv-muted">-</span>}
                      </td>
                      
                      <td className="py-3 px-6 text-right font-extrabold">
                        {tr ? (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            tr.win_conviction_pct >= 85 
                              ? 'bg-tv-green/20 text-tv-green' 
                              : tr.win_conviction_pct >= 70
                              ? 'bg-yellow-500/10 text-yellow-400'
                              : 'bg-tv-red/10 text-tv-red'
                          }`}>
                            {tr.win_conviction_pct}%
                          </span>
                        ) : (
                          <span className="text-tv-muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-tv-muted">
                      No setups computed. Add symbols to the watchlist and trigger "Scan Now".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: System Console */}
        {activeTab === 'console' && (
          <div className="h-full w-full flex flex-col">
            <div className="flex-grow p-4 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-1.5 bg-[#080b12] mobile-scroll">
              {scanLogs.map((log, index) => {
                let color = 'text-slate-400';
                let icon = '⚡';

                if (log.includes('[SUCCESS]') || log.includes('succeeded') || log.includes('Ready')) {
                  color = 'text-tv-green font-medium';
                  icon = '✔';
                } else if (log.includes('[ERROR]') || log.includes('failed') || log.includes('Errno')) {
                  color = 'text-tv-red font-bold';
                  icon = '✘';
                } else if (log.includes('[SCAN]') || log.includes('Fetching') || log.includes('Scanning')) {
                  color = 'text-yellow-400';
                  icon = '⚙';
                }

                return (
                  <div key={index} className={`flex items-start space-x-1.5 leading-relaxed ${color}`}>
                    <span className="shrink-0 opacity-70">{icon}</span>
                    <span className="break-all">{log}</span>
                  </div>
                );
              })}
              {scanLogs.length === 0 && (
                <div className="text-tv-muted italic text-center pt-8">
                  Console idle. Scanner logs will display here dynamically.
                </div>
              )}
            </div>
            
            {/* Quick Stats Summary Widget */}
            <div className="p-3 border-t border-tv-border/40 bg-[#121622] grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
              <div className="bg-[#0c0f16]/60 border border-tv-border/20 rounded p-2 text-center">
                <div className="text-[9px] text-tv-muted font-bold uppercase tracking-wider">Active Setups</div>
                <div className="text-sm font-black text-white mt-0.5 flex items-center justify-center space-x-1.5">
                  <span>{activeSetups.length}</span>
                  <span className="text-[8px] font-normal text-tv-muted">({buySetups.length} B / {sellSetups.length} S)</span>
                </div>
              </div>

              <div className="bg-[#0c0f16]/60 border border-tv-border/20 rounded p-2 text-center">
                <div className="text-[9px] text-tv-muted font-bold uppercase tracking-wider">Average R:R</div>
                <div className="text-sm font-black text-tv-green mt-0.5">{avgRR}:1</div>
              </div>

              <div className="bg-[#0c0f16]/60 border border-tv-border/20 rounded p-2 text-center">
                <div className="text-[9px] text-tv-muted font-bold uppercase tracking-wider">Confidence Level</div>
                <div className="text-sm font-black text-yellow-400 mt-0.5">
                  {highConvictionSetups.length} <span className="text-[8px] font-normal text-tv-muted">Setups &gt;80%</span>
                </div>
              </div>

              <div className="bg-[#0c0f16]/60 border border-tv-border/20 rounded p-2 text-center flex flex-col justify-center">
                <div className="text-[9px] text-tv-muted font-bold uppercase tracking-wider">Engine Status</div>
                <div className="text-[9px] font-bold text-tv-green mt-1 flex items-center justify-center space-x-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-tv-green animate-ping inline-block"></span>
                  <span>RUNNING (OK)</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
