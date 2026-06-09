import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, BarSeries, AreaSeries, createSeriesMarkers } from 'lightweight-charts';
import type { SeriesMarker } from 'lightweight-charts';
import { MousePointer, TrendingUp, BarChart2, Trash2, HelpCircle, PenTool, Type, Activity } from 'lucide-react';

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
  showCandlestickPatterns: boolean;
}

export interface HorizontalLineData {
  id: string;
  price: number;
}

export interface TrendLineData {
  id: string;
  start: { time: any; price: number };
  end: { time: any; price: number };
}

export interface FibonacciData {
  id: string;
  start: { time: any; price: number };
  end: { time: any; price: number };
}

export interface TextData {
  id: string;
  time: any;
  price: number;
  text: string;
}

interface ChartProps {
  ticker: string;
  history: ChartBar[];
  hsPattern: HSPattern | null;
  tradeReport: TradeReport | null;
  settings: ChartSettings;
  mockExecutionPrice: number | null;
  onLivePriceUpdate?: (price: number) => void;
  showLeftToolbar: boolean;
  drawings: {
    horizontalLines: HorizontalLineData[];
    trendLines: TrendLineData[];
    fibonaccis: FibonacciData[];
    texts: TextData[];
  };
  setDrawings: React.Dispatch<React.SetStateAction<{
    horizontalLines: HorizontalLineData[];
    trendLines: TrendLineData[];
    fibonaccis: FibonacciData[];
    texts: TextData[];
  }>>;
  chartType: 'candlestick' | 'line' | 'bar' | 'area';
  setChartType: (type: 'candlestick' | 'line' | 'bar' | 'area') => void;
}

type DrawingTool = 'none' | 'trendline' | 'horizontalline' | 'fibonacci' | 'text';

function getDistanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export const Chart: React.FC<ChartProps> = ({
  ticker,
  history,
  hsPattern,
  tradeReport,
  settings,
  mockExecutionPrice,
  onLivePriceUpdate,
  showLeftToolbar,
  drawings,
  setDrawings,
  chartType,
  setChartType,
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
  const markersApiRef = useRef<any>(null);

  // WebSocket references
  const wsRefA = useRef<WebSocket | null>(null);
  const wsRefB = useRef<WebSocket | null>(null);
  
  // Real-time prices for custom spreads
  const livePriceARef = useRef<number | null>(null);
  const livePriceBRef = useRef<number | null>(null);
  const lastBarRef = useRef<ChartBar | null>(null);

  // Drawing Tools State
  const [activeTool, setActiveTool] = useState<DrawingTool>('none');

  const [firstPoint, setFirstPoint] = useState<{ time: any; price: number } | null>(null);
  const [drawingStatusText, setDrawingStatusText] = useState<string>('');

  // Keep references updated for listener closures
  const activeToolRef = useRef<DrawingTool>('none');
  const firstPointRef = useRef<{ time: any; price: number } | null>(null);
  const drawingsRef = useRef(drawings);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { firstPointRef.current = firstPoint; }, [firstPoint]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);

  // Ref and State for Canvas overlay drawings
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);

  const [hoveredItem, setHoveredItem] = useState<any>(null);
  const [draggedItem, setDraggedItem] = useState<any>(null);
  const [previewMousePos, setPreviewMousePos] = useState<{ x: number; y: number } | null>(null);

  const hoveredItemRef = useRef<any>(null);
  const draggedItemRef = useRef<any>(null);

  useEffect(() => { hoveredItemRef.current = hoveredItem; }, [hoveredItem]);
  useEffect(() => { draggedItemRef.current = draggedItem; }, [draggedItem]);

  // Reset drawing helper text when symbol changes
  useEffect(() => {
    setActiveTool('none');
    setFirstPoint(null);
    setDrawingStatusText('');
  }, [ticker]);

  // 1. Initialize Chart & WebSockets
  useEffect(() => {
    if (!chartContainerRef.current || history.length === 0) return;

    hsOutlineRef.current = null;
    necklineRef.current = null;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0c0f16' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.25)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.25)' },
      },
      rightPriceScale: { borderColor: 'rgba(42, 46, 57, 0.6)' },
      timeScale: { borderColor: 'rgba(42, 46, 57, 0.6)', timeVisible: true },
      crosshair: {
        vertLine: { color: '#787b86', width: 1, style: 3, labelBackgroundColor: '#2a2e39' },
        horzLine: { color: '#787b86', width: 1, style: 3, labelBackgroundColor: '#2a2e39' },
      },
    });
    chartRef.current = chart;

    // Subscriptions to sync overlay drawings on scroll/zoom
    const handleRangeChange = () => {
      syncCanvasBounds();
      drawAllDrawings();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);
    chart.timeScale().subscribeVisibleTimeRangeChange(handleRangeChange);
    chart.subscribeCrosshairMove(handleRangeChange);

    // Main price series based on chart type
    let mainSeries;
    if (chartType === 'candlestick') {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });
      mainSeries.setData(history.map(bar => ({
        time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      })));
    } else if (chartType === 'line') {
      mainSeries = chart.addSeries(LineSeries, {
        color: '#2196f3',
        lineWidth: 2,
      });
      mainSeries.setData(history.map(bar => ({
        time: bar.time, value: bar.close,
      })));
    } else if (chartType === 'bar') {
      mainSeries = chart.addSeries(BarSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
      });
      mainSeries.setData(history.map(bar => ({
        time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      })));
    } else { // 'area'
      mainSeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(33, 150, 243, 0.4)',
        bottomColor: 'rgba(33, 150, 243, 0.0)',
        lineColor: '#2196f3',
        lineWidth: 2,
      });
      mainSeries.setData(history.map(bar => ({
        time: bar.time, value: bar.close,
      })));
    }
    candSeriesRef.current = mainSeries;

    // EMAs
    const ema20Series = chart.addSeries(LineSeries, {
      color: '#ff9800', lineWidth: 2, title: 'EMA 20', visible: settings.showEma20,
    });
    ema20Series.setData(history.map(bar => ({ time: bar.time, value: bar.ema_20 })));
    ema20Ref.current = ema20Series;

    const ema50Series = chart.addSeries(LineSeries, {
      color: '#2196f3', lineWidth: 2, title: 'EMA 50', visible: settings.showEma50,
    });
    ema50Series.setData(history.map(bar => ({ time: bar.time, value: bar.ema_50 })));
    ema50Ref.current = ema50Series;

    const ema200Series = chart.addSeries(LineSeries, {
      color: '#9c27b0', lineWidth: 2, title: 'EMA 200', visible: settings.showEma200,
    });
    ema200Series.setData(history.map(bar => ({ time: bar.time, value: bar.ema_200 })));
    ema200Ref.current = ema200Series;

    // Volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: 'volume', visible: settings.showVolume,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(history.map(bar => ({
      time: bar.time,
      value: bar.volume,
      color: bar.close >= bar.open ? 'rgba(38, 166, 154, 0.2)' : 'rgba(239, 83, 80, 0.2)',
    })));
    volumeSeriesRef.current = volumeSeries;

    // Initialize markers plugin (once per chart creation)
    markersApiRef.current = createSeriesMarkers(mainSeries, []);

    // H&S Structure Outlines
    if (hsPattern) {
      const getBarTime = (idx: number) => history[Math.max(0, Math.min(idx, history.length - 1))].time;
      const hsPoints = [
        { time: getBarTime(hsPattern.left_shoulder.index), value: hsPattern.left_shoulder.price },
        { time: getBarTime(hsPattern.valley_1.index), value: hsPattern.valley_1.price },
        { time: getBarTime(hsPattern.head.index), value: hsPattern.head.price },
        { time: getBarTime(hsPattern.valley_2.index), value: hsPattern.valley_2.price },
        { time: getBarTime(hsPattern.right_shoulder.index), value: hsPattern.right_shoulder.price },
      ].filter((pt, idx, self) => self.findIndex(p => p.time === pt.time) === idx);

      const hsOutlineSeries = chart.addSeries(LineSeries, {
        color: '#facc15',
        lineWidth: 2,
        title: 'H&S Structure',
        priceLineVisible: false,
        visible: settings.showHSOutline,
      });
      hsOutlineSeries.setData(hsPoints);
      hsOutlineRef.current = hsOutlineSeries;
    }

    // H&S Neckline
    if (hsPattern) {
      const getBarTime = (idx: number) => history[Math.max(0, Math.min(idx, history.length - 1))].time;
      const necklinePoints = [];
      for (let i = hsPattern.valley_1.index; i < history.length; i++) {
        necklinePoints.push({ time: getBarTime(i), value: hsPattern.neckline_slope * i + hsPattern.neckline_intercept });
      }
      const necklineSeries = chart.addSeries(LineSeries, {
        color: '#ec4899',
        lineWidth: 2,
        lineStyle: 1,
        title: 'Neckline',
        priceLineVisible: false,
        visible: settings.showNeckline,
      });
      necklineSeries.setData(necklinePoints);
      necklineRef.current = necklineSeries;
    }

    // 2. Click Handler for Drawings
    const handleChartClick = (param: any) => {
      if (!param.point || !param.time) return;
      const clickedTime = param.time;
      const clickedPrice = mainSeries.coordinateToPrice(param.point.y);
      if (!clickedPrice) return;

      const tool = activeToolRef.current;
      const pt1 = firstPointRef.current;

      if (tool === 'horizontalline') {
        setDrawings(prev => ({
          ...prev,
          horizontalLines: [...prev.horizontalLines, { id: `h_${Date.now()}`, price: clickedPrice }],
        }));
        setActiveTool('none');
        setDrawingStatusText('');
      } else if (tool === 'trendline') {
        if (!pt1) {
          setFirstPoint({ time: clickedTime, price: clickedPrice });
          setDrawingStatusText('Click second point to finish Trend Line');
        } else {
          setDrawings(prev => ({
            ...prev,
            trendLines: [...prev.trendLines, { id: `t_${Date.now()}`, start: pt1, end: { time: clickedTime, price: clickedPrice } }],
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
          setDrawings(prev => ({
            ...prev,
            fibonaccis: [...prev.fibonaccis, { id: `f_${Date.now()}`, start: pt1, end: { time: clickedTime, price: clickedPrice } }],
          }));
          setFirstPoint(null);
          setActiveTool('none');
          setDrawingStatusText('');
        }
      } else if (tool === 'text') {
        const txtVal = prompt('Enter text for label:');
        if (txtVal) {
          setDrawings(prev => ({
            ...prev,
            texts: [...prev.texts, { id: `txt_${Date.now()}`, time: clickedTime, price: clickedPrice, text: txtVal }],
          }));
        }
        setActiveTool('none');
        setDrawingStatusText('');
      }
    };
    chart.subscribeClick(handleChartClick);

    // 3. WebSocket Real-time live updates
    lastBarRef.current = { ...history[history.length - 1] };
    const wsBase = 'ws://localhost:8000/api/ws/ticker';

    const handleTickUpdate = (newPrice: number) => {
      if (!lastBarRef.current || !candSeriesRef.current || !volumeSeriesRef.current) return;
      
      const newHigh = Math.max(lastBarRef.current.high, newPrice);
      const newLow = Math.min(lastBarRef.current.low, newPrice);
      const volumeAdd = Math.floor(Math.random() * 200);

      lastBarRef.current = {
        ...lastBarRef.current,
        close: newPrice,
        high: newHigh,
        low: newLow,
        volume: lastBarRef.current.volume + volumeAdd,
      };

      if (chartType === 'line' || chartType === 'area') {
        candSeriesRef.current.update({
          time: lastBarRef.current.time,
          value: lastBarRef.current.close,
        });
      } else {
        candSeriesRef.current.update({
          time: lastBarRef.current.time,
          open: lastBarRef.current.open,
          high: lastBarRef.current.high,
          low: lastBarRef.current.low,
          close: lastBarRef.current.close,
        });
      }

      volumeSeriesRef.current.update({
        time: lastBarRef.current.time,
        value: lastBarRef.current.volume,
        color: lastBarRef.current.close >= lastBarRef.current.open ? 'rgba(38, 166, 154, 0.2)' : 'rgba(239, 83, 80, 0.2)',
      });

      if (onLivePriceUpdate) {
        onLivePriceUpdate(newPrice);
      }
    };

    // Close any previous websockets
    if (wsRefA.current) wsRefA.current.close();
    if (wsRefB.current) wsRefB.current.close();
    livePriceARef.current = null;
    livePriceBRef.current = null;

    if (ticker.includes('/')) {
      // Spread Pair web sockets
      const [tickerA, tickerB] = ticker.split('/');
      
      const wsA = new WebSocket(`${wsBase}/${tickerA}`);
      wsRefA.current = wsA;
      wsA.onmessage = (event) => {
        const data = JSON.parse(event.data);
        livePriceARef.current = data.price;
        if (livePriceARef.current && livePriceBRef.current) {
          const ratio = livePriceARef.current / livePriceBRef.current;
          handleTickUpdate(ratio);
        }
      };

      const wsB = new WebSocket(`${wsBase}/${tickerB}`);
      wsRefB.current = wsB;
      wsB.onmessage = (event) => {
        const data = JSON.parse(event.data);
        livePriceBRef.current = data.price;
        if (livePriceARef.current && livePriceBRef.current) {
          const ratio = livePriceARef.current / livePriceBRef.current;
          handleTickUpdate(ratio);
        }
      };
    } else {
      // Single stock web socket
      const ws = new WebSocket(`${wsBase}/${ticker}`);
      wsRefA.current = ws;
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleTickUpdate(data.price);
      };
    }

    // Auto-fit content
    chart.timeScale().fitContent();

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRefA.current) wsRefA.current.close();
      if (wsRefB.current) wsRefB.current.close();
      chart.unsubscribeClick(handleChartClick);
      chart.removeSeries(mainSeries);
      chart.removeSeries(ema20Series);
      chart.removeSeries(ema50Series);
      chart.removeSeries(ema200Series);
      chart.removeSeries(volumeSeries);
      if (hsOutlineRef.current) {
        try { chart.removeSeries(hsOutlineRef.current); } catch (e) {}
        hsOutlineRef.current = null;
      }
      if (necklineRef.current) {
        try { chart.removeSeries(necklineRef.current); } catch (e) {}
        necklineRef.current = null;
      }
      chart.remove();
    };
  }, [history, ticker, chartType]);

  // 4. Update Visibility of overlays
  useEffect(() => {
    if (ema20Ref.current) ema20Ref.current.applyOptions({ visible: settings.showEma20 });
    if (ema50Ref.current) ema50Ref.current.applyOptions({ visible: settings.showEma50 });
    if (ema200Ref.current) ema200Ref.current.applyOptions({ visible: settings.showEma200 });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: settings.showVolume });
    if (hsOutlineRef.current) hsOutlineRef.current.applyOptions({ visible: settings.showHSOutline });
    if (necklineRef.current) necklineRef.current.applyOptions({ visible: settings.showNeckline });
  }, [settings]);

  // 4b. Update Series Markers reactively
  useEffect(() => {
    const markersApi = markersApiRef.current;
    if (!markersApi || history.length === 0) return;

    const markers: SeriesMarker<string>[] = [];

    // 1. Candlestick patterns
    if (settings.showCandlestickPatterns) {
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
    }

    // 2. Pattern breakout markers (H&S)
    if (settings.showPatternMarkers && hsPattern) {
      const getBarTime = (idx: number) => history[Math.max(0, Math.min(idx, history.length - 1))].time;
      if (hsPattern.breakout_index >= 0 && hsPattern.breakout_index < history.length) {
        const bTime = getBarTime(hsPattern.breakout_index);
        const isBuy = hsPattern.bias === 'Buy';
        markers.push({
          time: bTime,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? '#10b981' : '#ef4444',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: `${hsPattern.type === 'head_and_shoulders' ? 'H&S' : 'iH&S'} Breakout`,
        });
      }
    }

    // 3. Text drawings (circle labels on chart)
    drawings.texts.forEach((txt) => {
      markers.push({ time: txt.time, position: 'inBar', color: '#ffffff', shape: 'circle', text: txt.text });
    });

    markersApi.setMarkers(markers);
  }, [history, settings.showCandlestickPatterns, settings.showPatternMarkers, hsPattern, drawings.texts, chartType]);

  // 5. Redraw Order targets
  useEffect(() => {
    if (!candSeriesRef.current) return;
    orderLinesRef.current.forEach(line => candSeriesRef.current.removePriceLine(line));
    orderLinesRef.current = [];

    if (tradeReport && settings.showTradeSetup) {
      const entry = candSeriesRef.current.createPriceLine({
        price: tradeReport.entry, color: '#3b82f6', lineWidth: 1.5, lineStyle: 1, axisLabelVisible: true,
        title: `ENTRY: $${tradeReport.entry.toFixed(2)}`,
      });
      const tp = candSeriesRef.current.createPriceLine({
        price: tradeReport.take_profit, color: '#10b981', lineWidth: 1.5, lineStyle: 2, axisLabelVisible: true,
        title: `TARGET (TP): $${tradeReport.take_profit.toFixed(2)}`,
      });
      const sl = candSeriesRef.current.createPriceLine({
        price: tradeReport.stop_loss, color: '#ef4444', lineWidth: 1.5, lineStyle: 2, axisLabelVisible: true,
        title: `STOP LOSS (SL): $${tradeReport.stop_loss.toFixed(2)}`,
      });
      orderLinesRef.current = [entry, tp, sl];
    }

    if (mockExecutionPrice) {
      const exec = candSeriesRef.current.createPriceLine({
        price: mockExecutionPrice, color: '#eab308', lineWidth: 2, lineStyle: 0, axisLabelVisible: true,
        title: `MOCK EXECUTION: $${mockExecutionPrice.toFixed(2)}`,
      });
      orderLinesRef.current.push(exec);
    }
  }, [tradeReport, settings.showTradeSetup, mockExecutionPrice]);

  // Synchronize canvas overlay dimensions with the chart's inner pane canvas
  const syncCanvasBounds = () => {
    const container = chartContainerRef.current;
    const canvas = overlayCanvasRef.current;
    if (!container || !canvas) return;

    const chartCanvas = container.querySelector('canvas');
    if (chartCanvas) {
      canvas.style.left = `${chartCanvas.offsetLeft}px`;
      canvas.style.top = `${chartCanvas.offsetTop}px`;
      canvas.style.width = `${chartCanvas.offsetWidth}px`;
      canvas.style.height = `${chartCanvas.offsetHeight}px`;
      canvas.width = chartCanvas.offsetWidth;
      canvas.height = chartCanvas.offsetHeight;
    }
  };

  // Draw all custom overlay shapes to the 2D canvas context
  const drawAllDrawings = () => {
    const canvas = overlayCanvasRef.current;
    const chart = chartRef.current;
    const series = candSeriesRef.current;
    if (!canvas || !chart || !series) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    
    const drawingsData = drawingsRef.current;
    const hover = hoveredItemRef.current;
    const drag = draggedItemRef.current;
    const tool = activeToolRef.current;
    const pt1 = firstPointRef.current;

    const getCoords = (time: any, price: number) => {
      const x = chart.timeScale().timeToCoordinate(time);
      const y = series.priceToCoordinate(price);
      return { x, y };
    };

    // 1. Horizontal lines
    drawingsData.horizontalLines.forEach((line) => {
      const y = series.priceToCoordinate(line.price);
      if (y === null || y === undefined) return;

      const isHovered = hover && hover.type === 'horizontalline' && hover.id === line.id;
      const isDragged = drag && drag.type === 'horizontalline' && drag.id === line.id;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.lineWidth = isHovered || isDragged ? 3 : 2;
      ctx.strokeStyle = isHovered || isDragged ? '#f97316' : '#3b82f6';
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isHovered || isDragged ? '#f97316' : '#3b82f6';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(`$${line.price.toFixed(2)}`, 10, y - 5);
    });

    // 2. Trend lines
    drawingsData.trendLines.forEach((trend) => {
      const start = getCoords(trend.start.time, trend.start.price);
      const end = getCoords(trend.end.time, trend.end.price);
      if (start.x === null || start.y === null || end.x === null || end.y === null) return;

      const isHovered = hover && hover.type === 'trendline' && hover.id === trend.id;
      const isDragged = drag && drag.type === 'trendline' && drag.id === trend.id;

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.lineWidth = isHovered || isDragged ? 3 : 2;
      ctx.strokeStyle = isHovered || isDragged ? '#f97316' : '#eab308';
      ctx.stroke();

      if (isHovered || isDragged) {
        ctx.beginPath();
        ctx.arc(start.x, start.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(end.x, end.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // 3. Fibonacci
    drawingsData.fibonaccis.forEach((fib) => {
      const start = getCoords(fib.start.time, fib.start.price);
      const end = getCoords(fib.end.time, fib.end.price);
      if (start.x === null || start.y === null || end.x === null || end.y === null) return;

      const isHovered = hover && hover.type === 'fibonacci' && hover.id === fib.id;
      const isDragged = drag && drag.type === 'fibonacci' && drag.id === fib.id;

      ctx.beginPath();
      ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
      const diff = fib.start.price - fib.end.price;

      levels.forEach((level) => {
        const lvlPrice = fib.start.price - diff * level;
        const y = series.priceToCoordinate(lvlPrice);
        if (y === null || y === undefined) return;

        ctx.beginPath();
        ctx.moveTo(start.x, y);
        ctx.lineTo(end.x, y);
        ctx.lineWidth = isHovered || isDragged ? 2 : (level === 0.618 || level === 0.5 ? 2 : 1);
        ctx.strokeStyle = isHovered || isDragged ? '#f97316' : (level === 0.618 || level === 0.5 ? '#10b981' : '#64748b');
        ctx.stroke();

        ctx.fillStyle = isHovered || isDragged ? '#f97316' : (level === 0.618 || level === 0.5 ? '#10b981' : '#94a3b8');
        ctx.font = '10px sans-serif';
        const label = `Fib ${(level * 100).toFixed(1)}% ($${lvlPrice.toFixed(2)})`;
        ctx.fillText(label, Math.min(start.x, end.x) + 6, y - 4);
      });

      if (isHovered || isDragged) {
        ctx.beginPath();
        ctx.arc(start.x, start.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(end.x, end.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // 4. Texts
    drawingsData.texts.forEach((txt) => {
      const pt = getCoords(txt.time, txt.price);
      if (pt.x === null || pt.y === null) return;

      const isHovered = hover && hover.type === 'text' && hover.id === txt.id;
      const isDragged = drag && drag.type === 'text' && drag.id === txt.id;

      ctx.font = 'bold 11px sans-serif';
      const textWidth = ctx.measureText(txt.text).width;

      ctx.fillStyle = isHovered || isDragged ? 'rgba(249, 115, 22, 0.2)' : 'rgba(20, 24, 38, 0.75)';
      ctx.fillRect(pt.x - 6, pt.y - 12, textWidth + 12, 18);

      ctx.strokeStyle = isHovered || isDragged ? '#f97316' : '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(pt.x - 6, pt.y - 12, textWidth + 12, 18);

      ctx.fillStyle = isHovered || isDragged ? '#f97316' : '#f8fafc';
      ctx.fillText(txt.text, pt.x, pt.y + 1);

      ctx.beginPath();
      ctx.arc(pt.x - 6, pt.y - 3, 3, 0, 2 * Math.PI);
      ctx.fillStyle = isHovered || isDragged ? '#f97316' : '#26a69a';
      ctx.fill();
    });

    // 5. Preview Line (in-progress drawing)
    if (tool !== 'none' && pt1 && previewMousePos) {
      const start = getCoords(pt1.time, pt1.price);
      const end = previewMousePos;

      ctx.beginPath();
      ctx.setLineDash([4, 4]);

      if (tool === 'trendline') {
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (tool === 'fibonacci') {
        ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const p1Price = pt1.price;
        const p2Price = series.coordinateToPrice(end.y);
        if (p2Price) {
          const diff = p1Price - p2Price;
          const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
          levels.forEach((level) => {
            const lvlPrice = p1Price - diff * level;
            const y = series.priceToCoordinate(lvlPrice);
            if (y === null || y === undefined) return;
            ctx.beginPath();
            ctx.moveTo(start.x, y);
            ctx.lineTo(end.x, y);
            ctx.strokeStyle = '#f97316';
            ctx.stroke();
          });
        }
      }

      ctx.setLineDash([]);
    }
  };

  // Re-draw when drawings, hover states, or tools changes
  useEffect(() => {
    syncCanvasBounds();
    drawAllDrawings();
  }, [drawings, hoveredItem, draggedItem, previewMousePos, activeTool, firstPoint]);

  // Hook mouse move, down, and up events to implement the interaction engine
  useEffect(() => {
    const area = chartAreaRef.current;
    if (!area) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = chartContainerRef.current;
      const chart = chartRef.current;
      const series = candSeriesRef.current;
      const canvas = overlayCanvasRef.current;
      if (!container || !chart || !series || !canvas) return;

      const chartCanvas = container.querySelector('canvas');
      if (!chartCanvas) return;

      const canvasRect = chartCanvas.getBoundingClientRect();
      const mouseX = e.clientX - canvasRect.left;
      const mouseY = e.clientY - canvasRect.top;

      // 1. Dragging active
      if (draggedItemRef.current) {
        const item = draggedItemRef.current;
        const curTime = chart.timeScale().coordinateToTime(mouseX);
        const curPrice = series.coordinateToPrice(mouseY);
        if (!curPrice || !curTime) return;

        setDrawings((prev) => {
          const updated = { ...prev };
          if (item.type === 'horizontalline') {
            updated.horizontalLines = prev.horizontalLines.map((line) => {
              if (line.id === item.id) return { ...line, price: curPrice };
              return line;
            });
          } else if (item.type === 'trendline') {
            updated.trendLines = prev.trendLines.map((trend) => {
              if (trend.id === item.id) {
                if (item.part === 'start') {
                  return { ...trend, start: { time: curTime, price: curPrice } };
                } else if (item.part === 'end') {
                  return { ...trend, end: { time: curTime, price: curPrice } };
                } else if (item.part === 'all') {
                  const sCoords = chart.timeScale().timeToCoordinate(trend.start.time);
                  const sPriceY = series.priceToCoordinate(trend.start.price);
                  const eCoords = chart.timeScale().timeToCoordinate(trend.end.time);
                  const ePriceY = series.priceToCoordinate(trend.end.price);

                  if (sCoords !== null && sPriceY !== null && eCoords !== null && ePriceY !== null) {
                    const newSCoords = sCoords + (mouseX - item.lastMouseX);
                    const newSPriceY = sPriceY + (mouseY - item.lastMouseY);
                    const newECoords = eCoords + (mouseX - item.lastMouseX);
                    const newEPriceY = ePriceY + (mouseY - item.lastMouseY);

                    const newSTime = chart.timeScale().coordinateToTime(newSCoords);
                    const newSPrice = series.coordinateToPrice(newSPriceY);
                    const newETime = chart.timeScale().coordinateToTime(newECoords);
                    const newEPrice = series.coordinateToPrice(newEPriceY);

                    if (newSTime && newSPrice && newETime && newEPrice) {
                      return {
                        ...trend,
                        start: { time: newSTime, price: newSPrice },
                        end: { time: newETime, price: newEPrice },
                      };
                    }
                  }
                }
              }
              return trend;
            });
          } else if (item.type === 'fibonacci') {
            updated.fibonaccis = prev.fibonaccis.map((fib) => {
              if (fib.id === item.id) {
                if (item.part === 'start') {
                  return { ...fib, start: { time: curTime, price: curPrice } };
                } else if (item.part === 'end') {
                  return { ...fib, end: { time: curTime, price: curPrice } };
                } else if (item.part === 'all') {
                  const sCoords = chart.timeScale().timeToCoordinate(fib.start.time);
                  const sPriceY = series.priceToCoordinate(fib.start.price);
                  const eCoords = chart.timeScale().timeToCoordinate(fib.end.time);
                  const ePriceY = series.priceToCoordinate(fib.end.price);

                  if (sCoords !== null && sPriceY !== null && eCoords !== null && ePriceY !== null) {
                    const newSCoords = sCoords + (mouseX - item.lastMouseX);
                    const newSPriceY = sPriceY + (mouseY - item.lastMouseY);
                    const newECoords = eCoords + (mouseX - item.lastMouseX);
                    const newEPriceY = ePriceY + (mouseY - item.lastMouseY);

                    const newSTime = chart.timeScale().coordinateToTime(newSCoords);
                    const newSPrice = series.coordinateToPrice(newSPriceY);
                    const newETime = chart.timeScale().coordinateToTime(newECoords);
                    const newEPrice = series.coordinateToPrice(newEPriceY);

                    if (newSTime && newSPrice && newETime && newEPrice) {
                      return {
                        ...fib,
                        start: { time: newSTime, price: newSPrice },
                        end: { time: newETime, price: newEPrice },
                      };
                    }
                  }
                }
              }
              return fib;
            });
          } else if (item.type === 'text') {
            updated.texts = prev.texts.map((txt) => {
              if (txt.id === item.id) return { ...txt, time: curTime, price: curPrice };
              return txt;
            });
          }
          return updated;
        });

        item.lastMouseX = mouseX;
        item.lastMouseY = mouseY;
        requestAnimationFrame(drawAllDrawings);
        return;
      }

      // 2. Preview mode
      if (activeToolRef.current !== 'none') {
        setPreviewMousePos({ x: mouseX, y: mouseY });
        requestAnimationFrame(drawAllDrawings);
        return;
      }

      // 3. Hover checking
      let foundHover: any = null;
      let targetCursor = 'default';
      const drawingsState = drawingsRef.current;

      const getCoords = (time: any, price: number) => {
        const x = chart.timeScale().timeToCoordinate(time);
        const y = series.priceToCoordinate(price);
        return { x, y };
      };

      // Endpoints (Highest priority)
      for (const trend of drawingsState.trendLines) {
        const s = getCoords(trend.start.time, trend.start.price);
        const e = getCoords(trend.end.time, trend.end.price);
        if (s.x !== null && s.y !== null && Math.hypot(mouseX - s.x, mouseY - s.y) < 8) {
          foundHover = { type: 'trendline', id: trend.id, part: 'start' };
          targetCursor = 'pointer';
          break;
        }
        if (e.x !== null && e.y !== null && Math.hypot(mouseX - e.x, mouseY - e.y) < 8) {
          foundHover = { type: 'trendline', id: trend.id, part: 'end' };
          targetCursor = 'pointer';
          break;
        }
      }

      if (!foundHover) {
        for (const fib of drawingsState.fibonaccis) {
          const s = getCoords(fib.start.time, fib.start.price);
          const e = getCoords(fib.end.time, fib.end.price);
          if (s.x !== null && s.y !== null && Math.hypot(mouseX - s.x, mouseY - s.y) < 8) {
            foundHover = { type: 'fibonacci', id: fib.id, part: 'start' };
            targetCursor = 'pointer';
            break;
          }
          if (e.x !== null && e.y !== null && Math.hypot(mouseX - e.x, mouseY - e.y) < 8) {
            foundHover = { type: 'fibonacci', id: fib.id, part: 'end' };
            targetCursor = 'pointer';
            break;
          }
        }
      }

      // Trendline segments
      if (!foundHover) {
        for (const trend of drawingsState.trendLines) {
          const s = getCoords(trend.start.time, trend.start.price);
          const e = getCoords(trend.end.time, trend.end.price);
          if (s.x !== null && s.y !== null && e.x !== null && e.y !== null) {
            if (getDistanceToSegment(mouseX, mouseY, s.x, s.y, e.x, e.y) < 6) {
              foundHover = { type: 'trendline', id: trend.id, part: 'all' };
              targetCursor = 'move';
              break;
            }
          }
        }
      }

      // Fibonacci lines
      if (!foundHover) {
        for (const fib of drawingsState.fibonaccis) {
          const s = getCoords(fib.start.time, fib.start.price);
          const e = getCoords(fib.end.time, fib.end.price);
          if (s.x !== null && s.y !== null && e.x !== null && e.y !== null) {
            const minX = Math.min(s.x, e.x);
            const maxX = Math.max(s.x, e.x);
            if (mouseX >= minX - 5 && mouseX <= maxX + 5) {
              const diff = fib.start.price - fib.end.price;
              const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
              for (const level of levels) {
                const lvlPrice = fib.start.price - diff * level;
                const y = series.priceToCoordinate(lvlPrice);
                if (y !== null && Math.abs(mouseY - y) < 6) {
                  foundHover = { type: 'fibonacci', id: fib.id, part: 'all' };
                  targetCursor = 'move';
                  break;
                }
              }
            }
          }
          if (foundHover) break;
        }
      }

      // Horizontal lines
      if (!foundHover) {
        for (const line of drawingsState.horizontalLines) {
          const y = series.priceToCoordinate(line.price);
          if (y !== null && Math.abs(mouseY - y) < 6) {
            foundHover = { type: 'horizontalline', id: line.id, part: 'all' };
            targetCursor = 'ns-resize';
            break;
          }
        }
      }

      // Text labels
      if (!foundHover) {
        for (const txt of drawingsState.texts) {
          const pt = getCoords(txt.time, txt.price);
          if (pt.x !== null && pt.y !== null && Math.hypot(mouseX - pt.x, mouseY - pt.y) < 12) {
            foundHover = { type: 'text', id: txt.id, part: 'all' };
            targetCursor = 'move';
            break;
          }
        }
      }

      if (foundHover) {
        setHoveredItem(foundHover);
        area.style.cursor = targetCursor;
      } else {
        if (hoveredItemRef.current) {
          setHoveredItem(null);
          area.style.cursor = 'default';
        }
      }
      requestAnimationFrame(drawAllDrawings);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const container = chartContainerRef.current;
      const chart = chartRef.current;
      if (!container || !chart) return;

      const chartCanvas = container.querySelector('canvas');
      if (!chartCanvas) return;

      const canvasRect = chartCanvas.getBoundingClientRect();
      const mouseX = e.clientX - canvasRect.left;
      const mouseY = e.clientY - canvasRect.top;

      if (hoveredItemRef.current) {
        const item = hoveredItemRef.current;
        e.preventDefault();
        e.stopPropagation();

        setDraggedItem({
          ...item,
          startMouseX: mouseX,
          startMouseY: mouseY,
          lastMouseX: mouseX,
          lastMouseY: mouseY,
        });

        // Disable standard zoom/pan
        chart.applyOptions({
          handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
          handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false }
        });
      }
    };

    const handleMouseUp = () => {
      if (draggedItemRef.current) {
        const chart = chartRef.current;
        if (chart) {
          chart.applyOptions({
            handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
            handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
          });
        }
        setDraggedItem(null);
      }
    };

    area.addEventListener('mousemove', handleMouseMove);
    area.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      area.removeEventListener('mousemove', handleMouseMove);
      area.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [drawings]);

  // Adjust scroll lock options on drawing tool active/inactive
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (activeTool !== 'none') {
      chart.applyOptions({
        handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false }
      });
    } else {
      chart.applyOptions({
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
      });
    }
  }, [activeTool]);

  const selectDrawingTool = (tool: DrawingTool) => {
    setActiveTool(tool);
    setFirstPoint(null);
    setPreviewMousePos(null);
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
    setDrawings({ horizontalLines: [], trendLines: [], fibonaccis: [], texts: [] });
    setDrawingStatusText('');
    setActiveTool('none');
  };

  return (
    <div className="relative w-full h-full bg-[#0c0f16] flex overflow-hidden">
      {/* 1. Left Vertical Drawing Toolbar */}
      {showLeftToolbar && (
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
      )}

      {/* 2. Main Chart Canvas Area */}
      <div className="flex-grow h-full flex flex-col relative">
        {/* Chart Header Info Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-tv-border bg-[#141824] z-10 shadow-sm shrink-0">
          <div className="flex items-center space-x-4">
            <span className="text-xl font-extrabold text-white tracking-tight flex items-center space-x-2">
              <span>{ticker}</span>
              {wsRefA.current && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tv-green opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-tv-green"></span>
                </span>
              )}
            </span>
            <span className="text-xs bg-tv-border px-2.5 py-1 rounded text-tv-text font-semibold uppercase tracking-wider">
              {ticker.includes('/') ? 'Custom Spread' : 'Daily Interval'}
            </span>

            {/* Chart Type Selector */}
            <div className="flex items-center space-x-1 bg-[#0c0f16]/60 p-1 rounded border border-tv-border/30 ml-4">
              {[
                { type: 'candlestick', label: 'Candles' },
                { type: 'line', label: 'Line' },
                { type: 'bar', label: 'Bars' },
                { type: 'area', label: 'Area' },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => setChartType(item.type as any)}
                  className={`px-2.5 py-1 text-[10px] rounded font-bold uppercase transition-all ${
                    chartType === item.type
                      ? 'bg-tv-green text-white shadow-sm'
                      : 'text-tv-muted hover:text-white hover:bg-tv-border/20'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
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
              <span>FastAPI WebSocket Link Active</span>
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

        {/* The Actual Lightweight Charts Container and Transparent Drawing Canvas */}
        <div ref={chartAreaRef} className="w-full flex-grow relative overflow-hidden bg-[#0c0f16]">
          <div ref={chartContainerRef} className="w-full h-full absolute inset-0 z-0" />
          <canvas
            ref={overlayCanvasRef}
            className="absolute z-10 pointer-events-none"
            style={{ display: 'block', top: 0, left: 0 }}
          />
        </div>
      </div>
    </div>
  );
};
