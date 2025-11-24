import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Sun, Moon, Maximize2, Minimize2, Bell, BellOff, RefreshCw, AlertTriangle, Database, Wifi, FileText, Clock, ChevronDown, ChevronUp } from 'lucide-react';

// ==================== CONSTANTS ====================
const TIME_RANGES = {
  '1D': { label: '1D', days: 1, points: 24, interval: 'hour' },
  '1W': { label: '1W', days: 7, points: 7, interval: 'day' },
  '1M': { label: '1M', days: 30, points: 30, interval: 'day' },
  '6M': { label: '6M', days: 180, points: 60, interval: 'day' },
  '1Y': { label: '1Y', days: 365, points: 52, interval: 'week' },
  '5Y': { label: '5Y', days: 1825, points: 60, interval: 'month' },
  'ALL': { label: 'ALL', days: 5000, points: 100, interval: 'month' }
};

const LOG_DURATIONS = [
  { id: '1D', label: 'Last 24 Hours', ms: 24 * 60 * 60 * 1000 },
  { id: '1W', label: 'Last 7 Days', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '1M', label: 'Last 30 Days', ms: 30 * 24 * 60 * 60 * 1000 }
];

// ==================== UTILITIES ====================
const formatCurrency = (value) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);

const formatTime = (timestamp) => 
  new Date(timestamp).toLocaleString('en-US', { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });

// ==================== THEME CONTEXT ====================
const ThemeContext = createContext();
const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      <div className={isDarkMode ? 'dark' : ''}>{children}</div>
    </ThemeContext.Provider>
  );
};
const useTheme = () => useContext(ThemeContext);

// ==================== INDEXEDDB SERVICE ====================
class BTCDatabase {
  static dbName = 'btc_price_db';
  static storeName = 'daily_prices';
  static version = 1;

  static async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'timestamp' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: true });
        }
      };
    });
  }

  static async saveDailyPrice(data) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async saveBulkDailyPrices(dataArray) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      dataArray.forEach(data => store.put(data));
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  static async getAllDailyPrices() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async clearAllData() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async getDataStats() {
    const data = await this.getAllDailyPrices();
    if (data.length === 0) {
      return { count: 0, firstDate: null, lastDate: null };
    }
    const sorted = data.sort((a, b) => a.timestamp - b.timestamp);
    return {
      count: data.length,
      firstDate: new Date(sorted[0].timestamp).toISOString(),
      lastDate: new Date(sorted[sorted.length - 1].timestamp).toISOString()
    };
  }
}

// Expose globally for debugging
window.BTCDatabase = BTCDatabase;

// ==================== DATA SERVICE ====================
class CryptoService {
  static csvData = null;
  static loadingPromise = null;

  static aggregateData(data, intervalType) {
    if (!data || data.length === 0) return [];
    const grouped = new Map();

    data.forEach(point => {
      const date = new Date(point.timestamp);
      let key;

      if (intervalType === 'hour') key = date.setMinutes(0, 0, 0);
      else if (intervalType === 'day') key = date.setHours(0, 0, 0, 0);
      else if (intervalType === 'week') {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        key = new Date(date.setDate(diff)).setHours(0,0,0,0);
      } else if (intervalType === 'month') key = new Date(date.getFullYear(), date.getMonth(), 1).getTime();

      if (!grouped.has(key)) {
        grouped.set(key, { ...point, timestamp: key });
      } else {
        const group = grouped.get(key);
        group.high = Math.max(group.high, point.high);
        group.low = Math.min(group.low, point.low);
        group.close = point.close;
        group.volume += point.volume;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  static async loadCSVData() {
    if (this.csvData) return this.csvData;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        const response = await fetch('/data/btcusd_1-min_data.csv');
        const text = await response.text();
        const lines = text.split('\n');
        
        // Parse CSV - aggregate to daily data to reduce memory
        const dailyData = new Map();
        
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const [timestamp, open, high, low, close, volume] = lines[i].split(',').map(v => parseFloat(v));
          if (isNaN(timestamp)) continue;
          
          const date = new Date(timestamp * 1000);
          const dayKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
          
          if (!dailyData.has(dayKey)) {
            dailyData.set(dayKey, {
              timestamp: dayKey,
              open: open,
              high: high,
              low: low,
              close: close,
              volume: volume
            });
          } else {
            const day = dailyData.get(dayKey);
            day.high = Math.max(day.high, high);
            day.low = Math.min(day.low, low);
            day.close = close; // Last close of the day
            day.volume += volume;
          }
        }
        
        this.csvData = Array.from(dailyData.values()).sort((a, b) => a.timestamp - b.timestamp);
        console.log(`Loaded ${this.csvData.length} days of historical data from CSV`);
        return this.csvData;
      } catch (error) {
        console.error('Failed to load CSV:', error);
        throw error;
      }
    })();

    return this.loadingPromise;
  }

  static async fetchMissingDataFromAPI(fromTimestamp, toTimestamp) {
    // Use CoinGecko API to fetch historical data
    const startDate = Math.floor(fromTimestamp / 1000);
    const endDate = Math.floor(toTimestamp / 1000);
    
    try {
      // CoinGecko market_chart/range endpoint
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${startDate}&to=${endDate}`
      );
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Convert to our format (daily aggregation)
      const dailyData = new Map();
      
      data.prices.forEach(([timestamp, price]) => {
        const date = new Date(timestamp);
        const dayKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        
        if (!dailyData.has(dayKey)) {
          dailyData.set(dayKey, {
            timestamp: dayKey,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0
          });
        } else {
          const day = dailyData.get(dayKey);
          day.high = Math.max(day.high, price);
          day.low = Math.min(day.low, price);
          day.close = price;
        }
      });
      
      const result = Array.from(dailyData.values()).sort((a, b) => a.timestamp - b.timestamp);
      
      // Save to IndexedDB
      await BTCDatabase.saveBulkDailyPrices(result);
      
      return result;
    } catch (error) {
      console.error('API fetch failed:', error);
      throw error;
    }
  }

  static async fetchCombinedData(forceFetch = false) {
    let source = 'CSV_ONLY';
    let missingDays = 0;

    try {
      // Load CSV data
      const csvData = await this.loadCSVData();
      
      // Get data from IndexedDB
      const cachedData = await BTCDatabase.getAllDailyPrices();
      
      // Find the last timestamp
      const lastCSVTimestamp = csvData[csvData.length - 1].timestamp;
      const lastCachedTimestamp = cachedData.length > 0 
        ? Math.max(...cachedData.map(d => d.timestamp))
        : lastCSVTimestamp;
      
      const lastTimestamp = Math.max(lastCSVTimestamp, lastCachedTimestamp);
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      
      // Calculate missing days
      const daysSinceLastData = Math.floor((now - lastTimestamp) / oneDayMs);
      missingDays = daysSinceLastData;
      
      // Merge CSV and cached data
      const allData = [...csvData];
      const csvTimestamps = new Set(csvData.map(d => d.timestamp));
      
      cachedData.forEach(cached => {
        if (!csvTimestamps.has(cached.timestamp)) {
          allData.push(cached);
        }
      });
      
      allData.sort((a, b) => a.timestamp - b.timestamp);
      
      // Check if we need to fetch new data
      if (daysSinceLastData > 0 || forceFetch) {
        source = 'FETCHING';
        
        const newData = await this.fetchMissingDataFromAPI(
          lastTimestamp + oneDayMs,
          now
        );
        
        if (newData.length > 0) {
          // Merge new data
          const newTimestamps = new Set(allData.map(d => d.timestamp));
          newData.forEach(d => {
            if (!newTimestamps.has(d.timestamp)) {
              allData.push(d);
            }
          });
          
          allData.sort((a, b) => a.timestamp - b.timestamp);
          source = 'LIVE_API';
          missingDays = 0;
        }
      } else {
        source = cachedData.length > csvData.length ? 'CSV_AND_CACHE' : 'CSV_ONLY';
      }
      
      return {
        data: allData,
        source,
        error: null,
        missingDays,
        lastUpdate: new Date().toISOString()
      };
      
    } catch (e) {
      console.error('Error fetching combined data:', e);
      const error = e.message;
      
      // Fallback to whatever we have
      try {
        const csvData = await this.loadCSVData();
        return {
          data: csvData,
          source: 'CSV_ONLY',
          error,
          missingDays,
          lastUpdate: new Date().toISOString()
        };
      } catch (csvError) {
        return {
          data: [],
          source: 'ERROR',
          error: csvError.message,
          missingDays: 0,
          lastUpdate: new Date().toISOString()
        };
      }
    }
  }
}

// ==================== COMPONENTS ====================

const StatusBadge = ({ source, missingDays }) => {
  if (source === 'LIVE_API') {
    return (
      <div className="flex items-center px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
        <Wifi size={12} className="mr-1.5" />
        Up to Date
      </div>
    );
  }
  if (source === 'FETCHING') {
    return (
      <div className="flex items-center px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium animate-pulse">
        <RefreshCw size={12} className="mr-1.5 animate-spin" />
        Fetching...
      </div>
    );
  }
  if (source === 'CSV_AND_CACHE') {
    return (
      <div className="flex items-center px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
        <Database size={12} className="mr-1.5" />
        Current
      </div>
    );
  }
  if (missingDays > 0) {
    return (
      <div className="flex items-center px-3 py-1 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full text-xs font-medium">
        <AlertTriangle size={12} className="mr-1.5" />
        {missingDays}d Behind
      </div>
    );
  }
  return (
    <div className="flex items-center px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full text-xs font-medium">
      <Database size={12} className="mr-1.5" />
      Historical
    </div>
  );
};

const DataLog = ({ data, durationId }) => {
  
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const duration = LOG_DURATIONS.find(d => d.id === durationId);
    if (!duration) return [];

    const cutoff = data[data.length - 1].timestamp - duration.ms;
    // Filter and reverse to show newest first (Streaming style)
    return data.filter(d => d.timestamp >= cutoff).reverse();
  }, [data, durationId]);

  if (filteredData.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
        No data points found for this period in the current dataset.
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        <div className="w-1/3">Timestamp</div>
        <div className="w-1/3 text-right">Price (USD)</div>
        <div className="w-1/3 text-right">Status</div>
      </div>
      <div className="max-h-64 overflow-y-auto font-mono text-sm custom-scrollbar">
        {filteredData.map((point, index) => {
          // Calculate simpler change for the log
          const prevPoint = filteredData[index + 1]; 
          const change = prevPoint ? ((point.close - prevPoint.close) / prevPoint.close) * 100 : 0;
          
          return (
            <div 
              key={point.timestamp} 
              className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
            >
              <div className="w-1/3 text-slate-600 dark:text-slate-400">
                {formatTime(point.timestamp)}
              </div>
              <div className="w-1/3 text-right font-medium text-slate-700 dark:text-slate-200">
                {formatCurrency(point.close)}
              </div>
              <div className={`w-1/3 text-right flex justify-end items-center ${change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {change !== 0 && (
                  <>
                    {change > 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                    {Math.abs(change).toFixed(2)}%
                  </>
                )}
                {change === 0 && <span className="text-slate-400">-</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 text-xs text-center text-slate-400">
        Showing {filteredData.length} data points
      </div>
    </div>
  );
};

const PriceCard = ({ currentData, previousData, loading, onRefresh, onFetchMissing, fetchStatus }) => {
  if (!currentData) return null;

  const price = currentData.close;
  const prevPrice = previousData ? previousData.close : price;
  const change = ((price - prevPrice) / prevPrice) * 100;
  const isPositive = change >= 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl transition-all duration-300 border border-slate-100 dark:border-slate-700">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <span className="text-white font-bold text-lg">₿</span>
          </div>
          <div>
            <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">Bitcoin Price</h2>
            <div className="flex items-center space-x-2">
              <StatusBadge source={fetchStatus.source} missingDays={fetchStatus.missingDays || 0} />
              {fetchStatus.error && (
                <span className="text-xs text-red-500 hidden sm:inline-block">
                  ⚠ {fetchStatus.error}
                </span>
              )}
            </div>
          </div>
        </div>
        <button 
          onClick={onRefresh}
          disabled={loading}
          className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors ${loading ? 'animate-spin' : ''}`}
        >
          <RefreshCw size={18} className="text-slate-600 dark:text-slate-300" />
        </button>
      </div>

      <div className="mb-6">
        <div className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">
          {loading ? '---' : formatCurrency(price)}
        </div>
        <div className={`flex items-center ${isPositive ? 'text-emerald-500' : 'text-rose-500'} font-medium`}>
          {isPositive ? <TrendingUp size={20} className="mr-1" /> : <TrendingDown size={20} className="mr-1" />}
          <span className="text-lg">{Math.abs(change).toFixed(2)}%</span>
          <span className="text-slate-400 dark:text-slate-500 text-sm ml-2 font-normal">24h change</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">24h High</div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(currentData.high)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">24h Low</div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(currentData.low)}</div>
        </div>
      </div>

      {fetchStatus.missingDays > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={onFetchMissing}
            disabled={loading || fetchStatus.source === 'FETCHING'}
            className="w-full py-2 px-4 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center space-x-2"
          >
            <RefreshCw size={16} className={fetchStatus.source === 'FETCHING' ? 'animate-spin' : ''} />
            <span>
              {fetchStatus.source === 'FETCHING' 
                ? 'Fetching Data...' 
                : `Update Missing ${fetchStatus.missingDays} Day${fetchStatus.missingDays > 1 ? 's' : ''}`
              }
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

const ChartSection = ({ data, range, setRange }) => {
  const { isDarkMode } = useTheme();
  
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const now = data[data.length - 1].timestamp;
    const rangeConfig = TIME_RANGES[range];
    const cutoff = now - (rangeConfig.days * 24 * 60 * 60 * 1000);
    
    const filtered = data.filter(d => d.timestamp >= cutoff);
    const aggregated = CryptoService.aggregateData(filtered, rangeConfig.interval);
    
    return aggregated.map(d => ({
      ...d,
      dateStr: new Date(d.timestamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: range === 'ALL' ? '2-digit' : undefined
      })
    }));
  }, [data, range]);

  const periodChange = chartData.length > 0 
    ? ((chartData[chartData.length - 1].close - chartData[0].close) / chartData[0].close) * 100
    : 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-100 dark:border-slate-700 mt-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Price History</h3>
          <span className={`text-sm font-medium ${periodChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}% 
            <span className="text-slate-400 dark:text-slate-500 ml-1">past {TIME_RANGES[range].label}</span>
          </span>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
          {Object.keys(TIME_RANGES).map((key) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                range === key 
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} vertical={false} />
            <XAxis 
              dataKey="dateStr" 
              stroke={isDarkMode ? '#94a3b8' : '#64748b'} 
              tick={{ fontSize: 11 }}
              tickMargin={10}
              minTickGap={30}
            />
            <YAxis 
              stroke={isDarkMode ? '#94a3b8' : '#64748b'}
              tick={{ fontSize: 11 }}
              domain={['auto', 'auto']}
              tickFormatter={(val) => val >= 1000 ? `$${(val/1000).toFixed(0)}k` : `$${val}`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              }}
              formatter={(val) => [formatCurrency(val), 'Price']}
              labelStyle={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}
            />
            <Area 
              type="monotone" 
              dataKey="close" 
              stroke="#f97316" 
              strokeWidth={2} 
              fillOpacity={1} 
              fill="url(#colorPrice)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ==================== MAIN APP ====================
const BitcoinTracker = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('1Y');
  const [fetchStatus, setFetchStatus] = useState({ source: 'LOADING', error: null, missingDays: 0 });
  
  // New State for Data Log Feature
  const [showLog, setShowLog] = useState(false);
  const [logDuration, setLogDuration] = useState('1D');

  const loadData = async (forceFetch = false) => {
    setLoading(true);
    
    const result = await CryptoService.fetchCombinedData(forceFetch);
    setAllData(result.data);
    setFetchStatus({ 
      source: result.source, 
      error: result.error, 
      missingDays: result.missingDays || 0 
    });
    setLoading(false);
  };

  const handleFetchMissing = async () => {
    await loadData(true);
  };

  useEffect(() => {
    loadData(); // Auto-fetch on load
  }, []);

  const currentData = allData.length > 0 ? allData[allData.length - 1] : null;
  
  const previousData = useMemo(() => {
    if (!currentData) return null;
    const oneDayAgo = currentData.timestamp - (24 * 60 * 60 * 1000);
    return allData.find(d => d.timestamp >= oneDayAgo) || allData[0];
  }, [allData, currentData]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-50 text-slate-800'}`}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Crypto Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Real-time market insights</p>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>

        {fetchStatus.error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-start">
            <AlertTriangle className="text-red-500 shrink-0 mt-0.5 mr-3" size={20} />
            <div>
              <h4 className="text-sm font-bold text-red-800 dark:text-red-200">Data Fetch Error</h4>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                {fetchStatus.error}
              </p>
            </div>
          </div>
        )}

        <PriceCard 
          currentData={currentData} 
          previousData={previousData} 
          loading={loading}
          onRefresh={() => loadData(true)}
          onFetchMissing={handleFetchMissing}
          fetchStatus={fetchStatus}
        />

        <ChartSection 
          data={allData} 
          range={range} 
          setRange={setRange} 
        />

        {/* Data Inspector Section */}
        <div className="mt-6 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={showLog}
                  onChange={(e) => setShowLog(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500"></div>
                <span className="ml-3 text-sm font-medium text-slate-900 dark:text-slate-300 flex items-center">
                  <FileText size={16} className="mr-2 text-slate-500" />
                  Raw Data Inspector
                </span>
              </label>
            </div>

            {showLog && (
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg self-start sm:self-auto">
                {LOG_DURATIONS.map((duration) => (
                  <button
                    key={duration.id}
                    onClick={() => setLogDuration(duration.id)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center ${
                      logDuration === duration.id 
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {duration.id}
                    <span className="hidden sm:inline ml-1 opacity-60 font-normal">- {duration.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {showLog && (
            <DataLog 
              data={allData} 
              durationId={logDuration} 
            />
          )}
        </div>

      </div>
    </div>
  );
};

const App = () => (
  <ThemeProvider>
    <BitcoinTracker />
  </ThemeProvider>
);

export default App;