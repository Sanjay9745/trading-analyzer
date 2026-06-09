import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from 'lightweight-charts';
import type { SeriesMarker } from 'lightweight-charts';
import { MousePointer, TrendingUp, BarChart2, Eye, EyeOff, Trash2, HelpCircle, PenTool, Type, Activity } from 'lucide-react';

interface ChartBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema_20: number;
  ema_50: number;
  ema_200: number;
  marker?: {
    pattern: string;
    bias: string;
  } | null;
}

interface HSPattern {
  type: string;
  bias: string;
  left_shoulder: { index: number; price: number };
  head: { index: number; price: number };
  right_shoulder: { index: number; price: number };
  valley_1: { index: number; price: number };
  valley_2: { index: number; price: number };
  neckline_slope: number;
  neckline_intercept: number;
  breakout_index: number;
  breakout_price: number;
}

interface TradeReport {
  signal: 'Buy' | 'Sell';
  pattern: string;
  entry: number;
  stop_loss: number;
  take_profit: number;
  risk_reward_ratio: number;
  win_conviction_pct: number;
}

interface ChartSettings {
  showEma20: boolean;
  showEma50: boolean;
  showEma200: boolean;
  showVolume: boolean;
  showHSOutline: boolean;
  showNeckline: boolean;
  showPatternMarkers: boolean;
  showTradeSetup: boolean;
}

interface ChartProps {
  ticker: string;
  history: ChartBar[];
  hsPattern: HSPattern | null;
  tradeReport: TradeReport | null;
  settings: ChartSettings;
  mockExecutionPrice: number | null;
  onLivePriceUpdate?: (price: number) => void;
}

type DrawingTool = 'none' | 'trendline' | 'horizontalline' | 'fibonacci' | 'text';

interface HorizontalLineData {
  id: string;
  price: number;
}

interface TrendLineData {
  id: string;
  start: { time: any; price: number };
  end: { time: any; price: number };
}

interface FibonacciData {
  id: string;
  start: { time: any; price: number };
  end: { time: any; price: number };
}

interface TextData {
  id: string;
  time: any;
  price: number;
  text: string;
}

export const Chart: React.FC<ChartProps> = ({
  ticker,
  history,
  hsPattern,
  tradeReport,
  settings,
  mockExecutionPrice,
  onLivePriceUpdate,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const ema20Ref = useRef<any>(null);
  const ema50Ref = useRef<any>(null);
  const ema200Ref = useRef<any>(null);
  const hsOutlineRef = useRef<any>(null);
  const necklineRef = useRef<any>(null);
  const orderLinesRef = useRef<any[]>([]);

  // Simulation state
  const liveIntervalRef = useRef<any>(null);
  const lastBarRef = useRef<ChartBar | null>(null);

  // Drawing Tools State
  const [activeTool, setActiveTool] = useState<DrawingTool>('none');
  const [drawings, setDrawings] = useState<{
    horizontalLines: HorizontalLineData[];
    trendLines: TrendLineData[];
    fibonaccis: FibonacciData[];
    texts: TextData[];
  }>({
    horizontalLines: [],
    trendLines: [],
    fibonaccis: [],
    texts: [],
  });

  const [firstPoint, setFirstPoint] = useState<{ time: any; price: number } | null>(null);
  const [drawingStatusText, setDrawingStatusText] = useState<string>('');

  // Keep drawings and activeTool in refs for the chart event listener to access them cleanly
  const activeToolRef = useRef<DrawingTool>('none');
  const firstPointRef = useRef<{ time: any; price: number } | null>(null);
  const drawingsRef = useRef(drawings);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    firstPointRef.current = firstPoint;
  }, [firstPoint]);

  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  // Reset drawing tool state when switching tickers
  useEffect(() => {
    setActiveTool('none');
    setFirstPoint(null);
    setDrawingStatusText('');
  }, [ticker]);

  // 1. Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current || history.length === 0) return;

    // Create chart instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0c0f16' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.25)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.25)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(42, 46, 57, 0.6)',
      },
      timeScale: {
        borderColor: 'rgba(42, 46, 57, 0.6)',
        timeVisible: true,
      },
      crosshair: {
        vertLine: {
          color: '#787b86',
          width: 1,
          style: 3,
          labelBackgroundColor: '#2a2e39',
        },
        horzLine: {
          color: '#787b86',
          width: 1,
          style: 3,
          labelBackgroundColor: '#2a2e39',
        },
      },
    });

    chartRef.current = chart;

    // Add Candlestick Series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candSeriesRef.current = candlestickSeries;

    const candleData = history.map(bar => ({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    candlestickSeries.setData(candleData);

    // Add EMA lines
    const ema20Series = chart.addSeries(LineSeries, {
      color: '#ff9800',
      lineWidth: 1.5,
      title: 'EMA 20',
      visible: settings.showEma20,
    });
    ema20Series.setData(history.map(bar => ({ time: bar.time, value: bar.ema_20 })));
    ema20Ref.current = ema20Series;

    const ema50Series = chart.addSeries(LineSeries, {
      color: '#2196f3',
      lineWidth: 1.5,
      title: 'EMA 50',
      visible: settings.showEma50,
    });
    ema50Series.setData(history.map(bar => ({ time: bar.time, value: bar.ema_50 })));
    ema50Ref.current = ema50Series;

    const ema200Series = chart.addSeries(LineSeries, {
      color: '#9c27b0',
      lineWidth: 1.5,
      title: 'EMA 200',
      visible: settings.showEma200,
    });
    ema200Series.setData(history.map(bar => ({ time: bar.time, value: bar.ema_200 })));
    ema200Ref.current = ema200Series;

    // Add Volume Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      visible: settings.showVolume,
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    const volumeData = history.map(bar => ({
      time: bar.time,
      value: bar.volume,
      color: bar.close >= bar.open ? 'rgba(38, 166, 154, 0.2)' : 'rgba(239, 83, 80, 0.2)',
    }));
    volumeSeries.setData(volumeData);
    volumeSeriesRef.current = volumeSeries;

    // Render Markers (Patterns)
    const updateMarkers = () => {
      if (!settings.showPatternMarkers) {
        createSeriesMarkers(candlestickSeries, []);
        return;
      }

      const markers: SeriesMarker<string>[] = [];
      history.forEach((bar) => {
        if (bar.marker) {
          const isBuy = bar.marker.bias === 'Buy';
          markers.push({
            time: bar.time,
            position: isBuy ? 'belowBar' : 'aboveBar',
            color: isBuy ? '#26a69a' : '#ef5350',
            shape: isBuy ? 'arrowUp' : 'arrowDown',
            text: bar.marker.pattern,
          });
        }
      });

      // Include custom text drawings as markers
      drawingsRef.current.texts.forEach((textDraw) => {
        markers.push({
          time: textDraw.time,
          position: 'inBar',
          color: '#ffffff',
          shape: 'circle',
          text: textDraw.text,
        });
      });

      createSeriesMarkers(candlestickSeries, markers);
    };
    updateMarkers();

    // H&S outline geometry
    if (hsPattern && settings.showHSOutline) {
      const getBarTime = (idx: number) => {
        const safeIdx = Math.max(0, Math.min(idx, history.length - 1));
        return history[safeIdx].time;
      };

      const lsTime = getBarTime(hsPattern.left_shoulder.index);
      const v1Time = getBarTime(hsPattern.valley_1.index);
      const headTime = getBarTime(hsPattern.head.index);
      const v2Time = getBarTime(hsPattern.valley_2.index);
      const rsTime = getBarTime(hsPattern.right_shoulder.index);

      const hsPoints = [
        { time: lsTime, value: hsPattern.left_shoulder.price },
        { time: v1Time, value: hsPattern.valley_1.price },
        { time: headTime, value: hsPattern.head.price },
        { time: v2Time, value: hsPattern.valley_2.price },
        { time: rsTime, value: hsPattern.right_shoulder.price },
      ];
      const uniqueHsPoints = hsPoints.filter((point, idx, self) => 
        self.findIndex(p => p.time === point.time) === idx
      );

      const hsOutlineSeries = chart.addSeries(LineSeries, {
        color: '#facc15',
        lineWidth: 2,
        title: 'H&S Structure',
        priceLineVisible: false,
      });
      hsOutlineSeries.setData(uniqueHsPoints);
      hsOutlineRef.current = hsOutlineSeries;
    }

    // H&S neckline
    if (hsPattern && settings.showNeckline) {
      const getBarTime = (idx: number) => {
        const safeIdx = Math.max(0, Math.min(idx, history.length - 1));
        return history[safeIdx].time;
      };

      const necklinePoints = [];
      const startIdx = hsPattern.valley_1.index;
      for (let i = startIdx; i < history.length; i++) {
        const necklineVal = hsPattern.neckline_slope * i + hsPattern.neckline_intercept;
        necklinePoints.push({
          time: getBarTime(i),
          value: necklineVal,
        });
      }

      const necklineSeries = chart.addSeries(LineSeries, {
        color: '#ec4899',
        lineWidth: 1.5,
        lineStyle: 1, // Dotted
        title: 'Neckline',
        priceLineVisible: false,
      });
      necklineSeries.setData(necklinePoints);
      necklineRef.current = necklineSeries;
    }

    // Order Target Price Lines (Entry, SL, TP)
    const drawOrderLines = () => {
      // Clear old order lines
      orderLinesRef.current.forEach(line => candlestickSeries.removePriceLine(line));
      orderLinesRef.current = [];

      if (tradeReport && settings.showTradeSetup) {
        const entryLine = candlestickSeries.createPriceLine({
          price: tradeReport.entry,
          color: '#3b82f6',
          lineWidth: 2,
          lineStyle: 1, // Dotted
          axisLabelVisible: true,
          title: `ENTRY: $${tradeReport.entry.toFixed(2)}`,
        });
        
        const tpLine = candlestickSeries.createPriceLine({
          price: tradeReport.take_profit,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `TARGET (TP): $${tradeReport.take_profit.toFixed(2)}`,
        });

        const slLine = candlestickSeries.createPriceLine({
          price: tradeReport.stop_loss,
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `STOP LOSS (SL): $${tradeReport.stop_loss.toFixed(2)}`,
        });

        orderLinesRef.current = [entryLine, tpLine, slLine];
      }

      // Draw active mock execution line if trade active
      if (mockExecutionPrice) {
        const execLine = candlestickSeries.createPriceLine({
          price: mockExecutionPrice,
          color: '#eab308',
          lineWidth: 2,
          lineStyle: 0, // Solid
          axisLabelVisible: true,
          title: `MOCK EXECUTION: $${mockExecutionPrice.toFixed(2)}`,
        });
        orderLinesRef.current.push(execLine);
      }
    };
    drawOrderLines();

    // 2. Click Handler for Drawing Tools
    const handleChartClick = (param: any) => {
      if (!param.point || !param.time) return;
      const clickedTime = param.time;
      const clickedPrice = candlestickSeries.coordinateToPrice(param.point.y);
      if (!clickedPrice) return;

      const tool = activeToolRef.current;
      const pt1 = firstPointRef.current;

      if (tool === 'horizontalline') {
        const newLine: HorizontalLineData = {
          id: `h_${Date.now()}`,
          price: clickedPrice,
        };
        setDrawings(prev => ({
          ...prev,
          horizontalLines: [...prev.horizontalLines, newLine],
        }));
        setActiveTool('none');
        setDrawingStatusText('');
      } else if (tool === 'trendline') {
        if (!pt1) {
          setFirstPoint({ time: clickedTime, price: clickedPrice });
          setDrawingStatusText('Click second point to finish Trend Line');
        } else {
          const newTrend: TrendLineData = {
            id: `t_${Date.now()}`,
            start: pt1,
            end: { time: clickedTime, price: clickedPrice },
          };
          setDrawings(prev => ({
            ...prev,
            trendLines: [...prev.trendLines, newTrend],
          }));
          setFirstPoint(null);
          setActiveTool('none');
          setDrawingStatusText('');
        }
      } else if (tool === 'fibonacci') {
        if (!pt1) {
          setFirstPoint({ time: clickedTime, price: clickedPrice });
          setDrawingStatusText('Click second point (low/high) to finish Fibonacci');
        } else {
          const newFib: FibonacciData = {
            id: `f_${Date.now()}`,
            start: pt1,
            end: { time: clickedTime, price: clickedPrice },
          };
          setDrawings(prev => ({
            ...prev,
            fibonaccis: [...prev.fibonaccis, newFib],
          }));
          setFirstPoint(null);
          setActiveTool('none');
          setDrawingStatusText('');
        }
      } else if (tool === 'text') {
        const textVal = prompt('Enter text for label:');
        if (textVal) {
          const newText: TextData = {
            id: `txt_${Date.now()}`,
            time: clickedTime,
            price: clickedPrice,
            text: textVal,
          };
          setDrawings(prev => ({
            ...prev,
            texts: [...prev.texts, newText],
          }));
          updateMarkers(); // Redraw text markers
        }
        setActiveTool('none');
        setDrawingStatusText('');
      }
    };

    chart.subscribeClick(handleChartClick);

    // Auto-fit content
    chart.timeScale().fitContent();

    // Resize observer
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    // 3. Real-Time Price Simulation
    lastBarRef.current = { ...history[history.length - 1] };
    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);

    liveIntervalRef.current = setInterval(() => {
      if (!lastBarRef.current) return;

      const randomPct = (Math.random() - 0.5) * 0.0016; // fluctuate max 0.08%
      const newClose = lastBarRef.current.close * (1 + randomPct);
      const newHigh = Math.max(lastBarRef.current.high, newClose);
      const newLow = Math.min(lastBarRef.current.low, newClose);
      
      const newVolumeAdd = Math.floor(Math.random() * 500);

      lastBarRef.current = {
        ...lastBarRef.current,
        close: newClose,
        high: newHigh,
        low: newLow,
        volume: lastBarRef.current.volume + newVolumeAdd,
      };

      // Update series in chart
      candlestickSeries.update({
        time: lastBarRef.current.time,
        open: lastBarRef.current.open,
        high: lastBarRef.current.high,
        low: lastBarRef.current.low,
        close: lastBarRef.current.close,
      });

      volumeSeries.update({
        time: lastBarRef.current.time,
        value: lastBarRef.current.volume,
        color: lastBarRef.current.close >= lastBarRef.current.open ? 'rgba(38, 166, 154, 0.2)' : 'rgba(239, 83, 80, 0.2)',
      });

      // Trigger callback to propagate live price
      if (onLivePriceUpdate) {
        onLivePriceUpdate(newClose);
      }
    }, 1500);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
      chart.unsubscribeClick(handleChartClick);
      chart.removeSeries(candlestickSeries);
      chart.removeSeries(ema20Series);
      chart.removeSeries(ema50Series);
      chart.removeSeries(ema200Series);
      chart.removeSeries(volumeSeries);
      if (hsOutlineRef.current) chart.removeSeries(hsOutlineRef.current);
      if (necklineRef.current) chart.removeSeries(necklineRef.current);
      chart.remove();
    };
  }, [history, ticker]);

  // 4. Update visibility dynamically on props update
  useEffect(() => {
    if (ema20Ref.current) ema20Ref.current.applyOptions({ visible: settings.showEma20 });
    if (ema50Ref.current) ema50Ref.current.applyOptions({ visible: settings.showEma50 });
    if (ema200Ref.current) ema200Ref.current.applyOptions({ visible: settings.showEma200 });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: settings.showVolume });
    if (hsOutlineRef.current) hsOutlineRef.current.applyOptions({ visible: settings.showHSOutline });
    if (necklineRef.current) necklineRef.current.applyOptions({ visible: settings.showNeckline });
  }, [settings]);

  // Redraw order targets dynamically
  useEffect(() => {
    if (!candSeriesRef.current) return;
    // Clear old lines
    orderLinesRef.current.forEach(line => candSeriesRef.current.removePriceLine(line));
    orderLinesRef.current = [];

    if (tradeReport && settings.showTradeSetup) {
      const entryLine = candSeriesRef.current.createPriceLine({
        price: tradeReport.entry,
        color: '#3b82f6',
        lineWidth: 1.5,
        lineStyle: 1,
        axisLabelVisible: true,
        title: `ENTRY: $${tradeReport.entry.toFixed(2)}`,
      });

      const tpLine = candSeriesRef.current.createPriceLine({
        price: tradeReport.take_profit,
        color: '#10b981',
        lineWidth: 1.5,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `TARGET (TP): $${tradeReport.take_profit.toFixed(2)}`,
      });

      const slLine = candSeriesRef.current.createPriceLine({
        price: tradeReport.stop_loss,
        color: '#ef4444',
        lineWidth: 1.5,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `STOP LOSS (SL): $${tradeReport.stop_loss.toFixed(2)}`,
      });

      orderLinesRef.current = [entryLine, tpLine, slLine];
    }

    if (mockExecutionPrice) {
      const execLine = candSeriesRef.current.createPriceLine({
        price: mockExecutionPrice,
        color: '#eab308',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `MOCK EXECUTION: $${mockExecutionPrice.toFixed(2)}`,
      });
      orderLinesRef.current.push(execLine);
    }
  }, [tradeReport, settings.showTradeSetup, mockExecutionPrice]);

  // 5. Draw Custom User Drawings on the Chart
  const drawnSeriesRef = useRef<any[]>([]);
  const drawnPriceLinesRef = useRef<any[]>([]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = candSeriesRef.current;
    if (!chart || !series) return;

    // Clear old drawing instances
    drawnSeriesRef.current.forEach(s => chart.removeSeries(s));
    drawnSeriesRef.current = [];
    drawnPriceLinesRef.current.forEach(line => series.removePriceLine(line));
    drawnPriceLinesRef.current = [];

    // Redraw Horizontal Lines
    drawings.horizontalLines.forEach((line) => {
      const pl = series.createPriceLine({
        price: line.price,
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'H-Line',
      });
      drawnPriceLinesRef.current.push(pl);
    });

    // Redraw Trendlines
    drawings.trendLines.forEach((trend) => {
      const lineSeries = chart.addSeries(LineSeries, {
        color: '#f97316',
        lineWidth: 2,
        priceLineVisible: false,
        title: 'Trendline',
      });
      lineSeries.setData([trend.start, trend.end]);
      drawnSeriesRef.current.push(lineSeries);
    });

    // Redraw Fibonacci Levels
    drawings.fibonaccis.forEach((fib) => {
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
      const diff = fib.start.price - fib.end.price;
      
      levels.forEach((level) => {
        const lvlPrice = fib.start.price - diff * level;
        const fibLevelSeries = chart.addSeries(LineSeries, {
          color: level === 0.618 || level === 0.5 ? '#10b981' : '#64748b',
          lineWidth: level === 0.618 ? 2 : 1,
          lineStyle: 1, // Dotted
          priceLineVisible: false,
          title: `Fib ${(level * 100).toFixed(1)}%`,
        });
        fibLevelSeries.setData([
          { time: fib.start.time, value: lvlPrice },
          { time: fib.end.time, value: lvlPrice },
        ]);
        drawnSeriesRef.current.push(fibLevelSeries);
      });
    });
  }, [drawings]);

  const selectDrawingTool = (tool: DrawingTool) => {
    setActiveTool(tool);
    setFirstPoint(null);
    if (tool === 'none') {
      setDrawingStatusText('');
    } else if (tool === 'horizontalline') {
      setDrawingStatusText('Click on the chart to place a Horizontal Price Line');
    } else if (tool === 'trendline') {
      setDrawingStatusText('Click on the chart to place the START point of the Trend Line');
    } else if (tool === 'fibonacci') {
      setDrawingStatusText('Click the START (High/Low) point of the Fibonacci tool');
    } else if (tool === 'text') {
      setDrawingStatusText('Click on the chart where you want to place a Text Label');
    }
  };

  const handleClearAllDrawings = () => {
    setDrawings({
      horizontalLines: [],
      trendLines: [],
      fibonaccis: [],
      texts: [],
    });
    setDrawingStatusText('');
    setActiveTool('none');
  };

  return (
    <div className="relative w-full h-full bg-[#0c0f16] flex overflow-hidden">
      {/* 1. Left Vertical Drawing Toolbar */}
      <div className="w-14 bg-[#141824] border-r border-tv-border flex flex-col items-center py-4 space-y-4 shrink-0 z-10 shadow-lg">
        <div className="text-[10px] text-tv-muted font-bold tracking-widest uppercase mb-2">Tools</div>
        
        <button
          onClick={() => selectDrawingTool('none')}
          title="Cursor / Select"
          className={`p-2.5 rounded transition-all ${
            activeTool === 'none' ? 'bg-tv-green text-white shadow-md shadow-tv-green/20' : 'text-tv-muted hover:text-white hover:bg-tv-border/30'
          }`}
        >
          <MousePointer className="w-4 h-4" />
        </button>

        <button
          onClick={() => selectDrawingTool('trendline')}
          title="Trend Line"
          className={`p-2.5 rounded transition-all ${
            activeTool === 'trendline' ? 'bg-tv-green text-white shadow-md shadow-tv-green/20' : 'text-tv-muted hover:text-white hover:bg-tv-border/30'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
        </button>

        <button
          onClick={() => selectDrawingTool('horizontalline')}
          title="Horizontal Price Line"
          className={`p-2.5 rounded transition-all ${
            activeTool === 'horizontalline' ? 'bg-tv-green text-white shadow-md shadow-tv-green/20' : 'text-tv-muted hover:text-white hover:bg-tv-border/30'
          }`}
        >
          <BarChart2 className="w-4 h-4 rotate-90" />
        </button>

        <button
          onClick={() => selectDrawingTool('fibonacci')}
          title="Fibonacci Retracement"
          className={`p-2.5 rounded transition-all ${
            activeTool === 'fibonacci' ? 'bg-tv-green text-white shadow-md shadow-tv-green/20' : 'text-tv-muted hover:text-white hover:bg-tv-border/30'
          }`}
        >
          <PenTool className="w-4 h-4" />
        </button>

        <button
          onClick={() => selectDrawingTool('text')}
          title="Add Text Label"
          className={`p-2.5 rounded transition-all ${
            activeTool === 'text' ? 'bg-tv-green text-white shadow-md shadow-tv-green/20' : 'text-tv-muted hover:text-white hover:bg-tv-border/30'
          }`}
        >
          <Type className="w-4 h-4" />
        </button>

        <div className="w-8 border-b border-tv-border/50 my-2" />

        <button
          onClick={handleClearAllDrawings}
          title="Clear All Drawings"
          className="p-2.5 rounded text-tv-muted hover:text-tv-red hover:bg-tv-red/10 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Main Chart Canvas Area */}
      <div className="flex-grow h-full flex flex-col relative">
        {/* Chart Header Info Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-tv-border bg-[#141824] z-10 shadow-sm shrink-0">
          <div className="flex items-center space-x-4">
            <span className="text-xl font-extrabold text-white tracking-tight flex items-center space-x-2">
              <span>{ticker}</span>
              {liveIntervalRef.current && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tv-green opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-tv-green"></span>
                </span>
              )}
            </span>
            <span className="text-xs bg-tv-border px-2.5 py-1 rounded text-tv-text font-semibold uppercase tracking-wider">
              {ticker.includes('/') ? 'Custom Spread' : 'Daily Interval'}
            </span>
          </div>

          <div className="flex items-center space-x-6">
            {hsPattern && (
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-yellow-400 font-bold bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1 rounded">
                  {hsPattern.type.toUpperCase()} DETECTED
                </span>
                <span className={`px-2.5 py-1 rounded font-extrabold uppercase border ${
                  hsPattern.bias === 'Buy' 
                    ? 'bg-tv-green/10 text-tv-green border-tv-green/20' 
                    : 'bg-tv-red/10 text-tv-red border-tv-red/20'
                }`}>
                  {hsPattern.bias === 'Buy' ? 'Bullish Breakout' : 'Bearish Breakout'}
                </span>
              </div>
            )}
            
            <div className="flex items-center space-x-2 text-xs border-l border-tv-border/80 pl-6 text-tv-muted">
              <Activity className="w-3.5 h-3.5 text-tv-green animate-pulse" />
              <span>Real-time Ticking Active</span>
            </div>
          </div>
        </div>

        {/* Floating Drawing Status Helper Banner */}
        {drawingStatusText && (
          <div className="absolute top-16 left-6 z-20 bg-tv-green text-white text-xs px-4 py-2 rounded-lg shadow-xl font-medium flex items-center space-x-2 green-glow animate-bounce">
            <HelpCircle className="w-4 h-4" />
            <span>{drawingStatusText}</span>
          </div>
        )}

        {/* The Actual Lightweight Charts Container */}
        <div ref={chartContainerRef} className="w-full flex-grow relative z-0 bg-[#0c0f16]" />
      </div>
    </div>
  );
};
