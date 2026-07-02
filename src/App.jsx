import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Sun, Moon, RefreshCw, AlertTriangle, Database, Wifi, FileText, Plus } from 'lucide-react';
import btcUsdCsvUrl from '../data/btcusd_1-min_data.csv?url';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_START_TIMESTAMP = Date.UTC(2012, 0, 1);
const HOURLY_HISTORY_DAYS = 30;
const HOURLY_REFRESH_WINDOW_MS = 2 * ONE_HOUR_MS;
const COINBASE_MAX_CANDLES_PER_REQUEST = 300;
const DEFAULT_PINNED_CURRENCIES = ['usd', 'aud'];
const SUPPORTED_CURRENCIES_TTL_MS = 7 * ONE_DAY_MS;

const STORAGE_KEYS = {
  pinnedCurrencies: 'btc_tracker_pinned_currencies',
  supportedCurrencies: 'btc_tracker_supported_fiat_currencies_v1'
};

const TIME_RANGES = {
  '1D': { label: '1D', days: 1, interval: 'hour', preferHourly: true },
  '1W': { label: '1W', days: 7, interval: 'hour', preferHourly: true },
  '1M': { label: '1M', days: 30, interval: 'hour', preferHourly: true },
  '6M': { label: '6M', days: 180, interval: 'day', preferHourly: false },
  '1Y': { label: '1Y', days: 365, interval: 'week', preferHourly: false },
  '5Y': { label: '5Y', days: 1825, interval: 'month', preferHourly: false },
  'ALL': { label: 'ALL', days: 5000, interval: 'month', preferHourly: false }
};

const LOG_DURATIONS = [
  { id: '1D', label: 'Last 24 Hours', ms: ONE_DAY_MS },
  { id: '1W', label: 'Last 7 Days', ms: 7 * ONE_DAY_MS },
  { id: '1M', label: 'Last 30 Days', ms: 30 * ONE_DAY_MS }
];

const PERFORMANCE_PERIODS = [
  { id: '1D', label: '1 day', type: 'duration', ms: ONE_DAY_MS },
  { id: '1W', label: '1 week', type: 'duration', ms: 7 * ONE_DAY_MS },
  { id: '1M', label: '1 month', type: 'duration', ms: 30 * ONE_DAY_MS },
  { id: '6M', label: '6 months', type: 'duration', ms: 180 * ONE_DAY_MS },
  { id: 'YTD', label: 'Year to date', type: 'ytd' },
  { id: '1Y', label: '1 year', type: 'duration', ms: 365 * ONE_DAY_MS },
  { id: '5Y', label: '5 years', type: 'duration', ms: 1825 * ONE_DAY_MS },
  { id: '10Y', label: '10 years', type: 'duration', ms: 3650 * ONE_DAY_MS },
  { id: 'ALL', label: 'All time', type: 'all' }
];

const MONTHLY_VISUAL_THEMES = [
  { title: 'Genesis Frost', caption: 'Cold conviction, clean blocks.', light: ['#fff7ed', '#dbeafe'], dark: ['#1e293b', '#172554'], accent: '#f97316', orbit: '#38bdf8' },
  { title: 'Hash Bloom', caption: 'Momentum begins under the surface.', light: ['#fefce8', '#e0f2fe'], dark: ['#1f2937', '#0f172a'], accent: '#fb7185', orbit: '#f59e0b' },
  { title: 'Spring Ledger', caption: 'Network energy compounding quietly.', light: ['#f0fdf4', '#e0e7ff'], dark: ['#14532d', '#1e1b4b'], accent: '#22c55e', orbit: '#60a5fa' },
  { title: 'Halving Sun', caption: 'Supply pressure meets brighter skies.', light: ['#fff7ed', '#fde68a'], dark: ['#7c2d12', '#1f2937'], accent: '#f97316', orbit: '#facc15' },
  { title: 'Cobalt Flow', caption: 'Capital rotates, price structure forms.', light: ['#eff6ff', '#dbeafe'], dark: ['#0f172a', '#172554'], accent: '#3b82f6', orbit: '#f97316' },
  { title: 'Solstice Run', caption: 'Long daylight, longer risk appetite.', light: ['#fff1f2', '#fde68a'], dark: ['#3f0d12', '#451a03'], accent: '#fb7185', orbit: '#f59e0b' },
  { title: 'Midyear Range', caption: 'July often looks calm until momentum picks a side.', light: ['#fef2f2', '#fee2e2'], dark: ['#3f0d12', '#111827'], accent: '#ef4444', orbit: '#f97316' },
  { title: 'Aurora Blocks', caption: 'Cooling air, bright tapes, clean trend.', light: ['#ecfeff', '#e0f2fe'], dark: ['#0f172a', '#164e63'], accent: '#06b6d4', orbit: '#f97316' },
  { title: 'Autumn Nodes', caption: 'Network steadies while sentiment shifts.', light: ['#fff7ed', '#fde68a'], dark: ['#292524', '#78350f'], accent: '#f59e0b', orbit: '#22c55e' },
  { title: 'Voltage Rain', caption: 'Liquidity flashes through the order book.', light: ['#f5f3ff', '#dbeafe'], dark: ['#1e1b4b', '#0f172a'], accent: '#8b5cf6', orbit: '#38bdf8' },
  { title: 'Miner Night', caption: 'Difficulty rises in the long dark.', light: ['#f8fafc', '#e2e8f0'], dark: ['#111827', '#020617'], accent: '#94a3b8', orbit: '#f97316' },
  { title: 'Year-End Signal', caption: 'Cycle closes, next thesis loads.', light: ['#ecfccb', '#dbeafe'], dark: ['#0f172a', '#14532d'], accent: '#84cc16', orbit: '#60a5fa' }
];

const normalizeCurrencyCode = (value) => value.trim().toLowerCase();
const joinErrorMessages = (...messages) => messages.filter(Boolean).join(' | ') || null;

const uniqueCurrencies = (currencies) => Array.from(new Set(
  [...DEFAULT_PINNED_CURRENCIES, ...currencies.map(normalizeCurrencyCode)]
)).filter(Boolean);

const readStoredJson = (key) => {
  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
};

const readPinnedCurrencies = () => {
  const stored = readStoredJson(STORAGE_KEYS.pinnedCurrencies);
  return Array.isArray(stored) ? uniqueCurrencies(stored) : DEFAULT_PINNED_CURRENCIES;
};

const savePinnedCurrencies = (currencies) => {
  localStorage.setItem(STORAGE_KEYS.pinnedCurrencies, JSON.stringify(uniqueCurrencies(currencies)));
};

const toUtcDayTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const toUtcHourTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours()
  );
};

const toUtcWeekTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const toUtcMonthTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

const toIsoDate = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);

const formatCurrency = (value, currency) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numericValue);
  } catch {
    return `${currency.toUpperCase()} ${numericValue.toFixed(2)}`;
  }
};

const formatWholeCurrency = (value, currency) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(numericValue);
  } catch {
    return `${currency.toUpperCase()} ${Math.round(numericValue)}`;
  }
};

const formatAxisCurrency = (value, currency) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';

  const prefix = currency.toUpperCase();
  if (numericValue >= 1_000_000) return `${prefix} ${(numericValue / 1_000_000).toFixed(1)}M`;
  if (numericValue >= 1_000) return `${prefix} ${(numericValue / 1_000).toFixed(0)}k`;
  return `${prefix} ${numericValue.toFixed(0)}`;
};

const formatDateLabel = (timestamp, range) => {
  const options = {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric'
  };

  if (range === '1D' || range === '1W') {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  if (range === '1Y' || range === '5Y' || range === 'ALL') {
    options.year = '2-digit';
  }

  return new Date(timestamp).toLocaleDateString(undefined, options);
};

const formatTime = (timestamp) => new Date(timestamp).toLocaleString('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const monthLabel = (timestamp = Date.now()) => new Date(timestamp).toLocaleString('en-US', {
  month: 'long',
  timeZone: 'UTC'
});

const getMonthlyVisualTheme = (timestamp = Date.now()) => {
  const monthIndex = new Date(timestamp).getUTCMonth();
  return MONTHLY_VISUAL_THEMES[monthIndex];
};

const mergeSeriesByTimestamp = (...seriesList) => {
  const merged = new Map();

  seriesList.forEach((series) => {
    series.forEach((point) => {
      merged.set(point.timestamp, point);
    });
  });

  return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
};

const findClosestPointAtOrBefore = (data, targetTimestamp) => {
  for (let index = data.length - 1; index >= 0; index -= 1) {
    if (data[index].timestamp <= targetTimestamp) {
      return data[index];
    }
  }

  return data[0] || null;
};

const buildRollingWindowStats = (data, currentPoint) => {
  if (!currentPoint || data.length === 0) {
    return { high: null, low: null, previousPoint: null };
  }

  const cutoff = currentPoint.timestamp - ONE_DAY_MS;
  const recentPoints = data.filter((point) => point.timestamp >= cutoff);
  const previousPoint = findClosestPointAtOrBefore(data, cutoff);
  const prices = recentPoints.length > 0
    ? recentPoints.flatMap((point) => [point.high ?? point.close, point.low ?? point.close, point.close])
    : [currentPoint.close];

  return {
    high: Math.max(...prices),
    low: Math.min(...prices),
    previousPoint
  };
};

const buildPerformanceStats = (data, currentPoint) => {
  if (!currentPoint || data.length === 0) return [];

  return PERFORMANCE_PERIODS.map((period) => {
    let anchorPoint = null;

    if (period.type === 'duration') {
      anchorPoint = findClosestPointAtOrBefore(data, currentPoint.timestamp - period.ms);
    } else if (period.type === 'ytd') {
      const startOfYear = Date.UTC(new Date(currentPoint.timestamp).getUTCFullYear(), 0, 1);
      anchorPoint = findClosestPointAtOrBefore(data, startOfYear);
    } else if (period.type === 'all') {
      anchorPoint = data[0] || null;
    }

    if (!anchorPoint || !Number.isFinite(anchorPoint.close) || anchorPoint.close === 0) {
      return { ...period, change: null };
    }

    return {
      ...period,
      change: ((currentPoint.close - anchorPoint.close) / anchorPoint.close) * 100
    };
  });
};

const buildMeanAnnualGrowth = (data, currentPoint) => {
  if (!currentPoint || data.length < 2) return null;

  const yearlyReturns = [];
  const yearlyWindowMs = 365.25 * ONE_DAY_MS;
  let intervalStart = data[0].timestamp;
  let intervalEnd = intervalStart + yearlyWindowMs;

  while (intervalEnd <= currentPoint.timestamp) {
    const startPoint = findClosestPointAtOrBefore(data, intervalStart);
    const endPoint = findClosestPointAtOrBefore(data, intervalEnd);

    if (
      startPoint &&
      endPoint &&
      Number.isFinite(startPoint.close) &&
      Number.isFinite(endPoint.close) &&
      startPoint.close > 0 &&
      endPoint.timestamp > startPoint.timestamp
    ) {
      yearlyReturns.push(((endPoint.close - startPoint.close) / startPoint.close) * 100);
    }

    intervalStart = intervalEnd;
    intervalEnd += yearlyWindowMs;
  }

  if (yearlyReturns.length === 0) return null;

  return yearlyReturns.reduce((total, value) => total + value, 0) / yearlyReturns.length;
};

const convertSeriesToCurrency = (series, currency, fxRates) => {
  if (currency === 'usd') return series;
  if (!fxRates || fxRates.length === 0) return [];

  const sortedRates = [...fxRates].sort((a, b) => a.timestamp - b.timestamp);
  const converted = [];
  let rateIndex = 0;
  let activeRate = null;

  series.forEach((point) => {
    const dayTimestamp = toUtcDayTimestamp(point.timestamp);

    while (rateIndex < sortedRates.length && sortedRates[rateIndex].timestamp <= dayTimestamp) {
      activeRate = sortedRates[rateIndex].rate;
      rateIndex += 1;
    }

    if (!activeRate) return;

    converted.push({
      ...point,
      open: (point.open ?? point.close) * activeRate,
      high: (point.high ?? point.close) * activeRate,
      low: (point.low ?? point.close) * activeRate,
      close: point.close * activeRate
    });
  });

  return converted;
};

// ==================== THEME CONTEXT ====================
const ThemeContext = createContext();

const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const toggleTheme = () => setIsDarkMode((value) => !value);

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
  static version = 2;
  static legacyStoreName = 'daily_prices';
  static priceStoreName = 'price_points';

  static async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(this.priceStoreName)) {
          const store = db.createObjectStore(this.priceStoreName, { keyPath: 'cacheKey' });
          store.createIndex('currency_granularity', ['currency', 'granularity'], { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  static buildCacheKey(currency, granularity, timestamp) {
    return `${currency}:${granularity}:${timestamp}`;
  }

  static async saveBulkPoints(dataArray, currency, granularity) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.priceStoreName], 'readwrite');
      const store = transaction.objectStore(this.priceStoreName);

      dataArray.forEach((data) => {
        store.put({
          ...data,
          currency,
          granularity,
          cacheKey: this.buildCacheKey(currency, granularity, data.timestamp)
        });
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  static async getPoints(currency, granularity) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.priceStoreName], 'readonly');
      const store = transaction.objectStore(this.priceStoreName);
      const index = store.index('currency_granularity');
      const request = index.getAll(IDBKeyRange.only([currency, granularity]));

      request.onsuccess = () => {
        const points = request.result
          .map((record) => {
            const point = { ...record };
            delete point.cacheKey;
            delete point.currency;
            delete point.granularity;
            return point;
          })
          .sort((a, b) => a.timestamp - b.timestamp);
        resolve(points);
      };

      request.onerror = () => reject(request.error);
    });
  }

  static async clearAllData() {
    const db = await this.openDB();
    const storeNames = [this.priceStoreName];

    if (db.objectStoreNames.contains(this.legacyStoreName)) {
      storeNames.push(this.legacyStoreName);
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readwrite');

      storeNames.forEach((storeName) => {
        transaction.objectStore(storeName).clear();
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  static async getDataStats() {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.priceStoreName], 'readonly');
      const store = transaction.objectStore(this.priceStoreName);
      const request = store.getAll();

      request.onsuccess = () => {
        const stats = request.result.reduce((accumulator, record) => {
          const key = `${record.currency}:${record.granularity}`;

          if (!accumulator[key]) {
            accumulator[key] = { count: 0, firstDate: null, lastDate: null };
          }

          accumulator[key].count += 1;
          accumulator[key].firstDate = accumulator[key].firstDate
            ? Math.min(accumulator[key].firstDate, record.timestamp)
            : record.timestamp;
          accumulator[key].lastDate = accumulator[key].lastDate
            ? Math.max(accumulator[key].lastDate, record.timestamp)
            : record.timestamp;

          return accumulator;
        }, {});

        Object.values(stats).forEach((entry) => {
          entry.firstDate = new Date(entry.firstDate).toISOString();
          entry.lastDate = new Date(entry.lastDate).toISOString();
        });

        resolve(stats);
      };

      request.onerror = () => reject(request.error);
    });
  }
}

window.BTCDatabase = BTCDatabase;

// ==================== DATA SERVICE ====================
class CryptoService {
  static usdCsvData = null;
  static csvLoadingPromise = null;
  static supportedCurrencies = null;
  static supportedCurrenciesPromise = null;

  static aggregateData(data, intervalType) {
    if (!data || data.length === 0) return [];

    const grouped = new Map();

    data.forEach((point) => {
      let key;

      if (intervalType === 'hour') key = toUtcHourTimestamp(point.timestamp);
      else if (intervalType === 'day') key = toUtcDayTimestamp(point.timestamp);
      else if (intervalType === 'week') key = toUtcWeekTimestamp(point.timestamp);
      else key = toUtcMonthTimestamp(point.timestamp);

      if (!grouped.has(key)) {
        grouped.set(key, { ...point, timestamp: key });
      } else {
        const group = grouped.get(key);
        group.high = Math.max(group.high, point.high ?? point.close);
        group.low = Math.min(group.low, point.low ?? point.close);
        group.close = point.close;
        group.volume = (group.volume || 0) + (point.volume || 0);
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  static buildPriceSeriesFromPrices(prices, granularity) {
    const grouped = new Map();

    prices.forEach(([timestamp, price]) => {
      const key = granularity === 'hour'
        ? toUtcHourTimestamp(timestamp)
        : toUtcDayTimestamp(timestamp);

      if (!grouped.has(key)) {
        grouped.set(key, {
          timestamp: key,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0
        });
      } else {
        const point = grouped.get(key);
        point.high = Math.max(point.high, price);
        point.low = Math.min(point.low, price);
        point.close = price;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  static buildFxSeries(rows) {
    return rows
      .filter((row) => row?.date && Number.isFinite(row?.rate))
      .map((row) => ({
        timestamp: Date.parse(`${row.date}T00:00:00Z`),
        rate: row.rate
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  static buildPriceSeriesFromCandles(candles, granularity) {
    return candles
      .filter((entry) => Array.isArray(entry) && entry.length >= 6)
      .map(([time, low, high, open, close, volume]) => {
        const rawTimestamp = Number(time) * 1000;
        const key = granularity === 'hour'
          ? toUtcHourTimestamp(rawTimestamp)
          : toUtcDayTimestamp(rawTimestamp);

        return {
          timestamp: key,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume) || 0
        };
      })
      .filter((point) => (
        Number.isFinite(point.timestamp) &&
        Number.isFinite(point.open) &&
        Number.isFinite(point.high) &&
        Number.isFinite(point.low) &&
        Number.isFinite(point.close)
      ))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  static async loadUsdCSVData() {
    if (this.usdCsvData) return this.usdCsvData;
    if (this.csvLoadingPromise) return this.csvLoadingPromise;

    this.csvLoadingPromise = (async () => {
      const response = await fetch(btcUsdCsvUrl, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`Bundled BTC CSV error: ${response.status}`);
      }

      const text = await response.text();
      const lines = text.split('\n');
      const dailyData = new Map();

      for (let index = 1; index < lines.length; index += 1) {
        if (!lines[index].trim()) continue;

        const [rawTimestamp, rawOpen, rawHigh, rawLow, rawClose, rawVolume] = lines[index]
          .split(',')
          .map((value) => parseFloat(value));

        if (Number.isNaN(rawTimestamp)) continue;

        const dayKey = toUtcDayTimestamp(rawTimestamp * 1000);

        if (!dailyData.has(dayKey)) {
          dailyData.set(dayKey, {
            timestamp: dayKey,
            open: rawOpen,
            high: rawHigh,
            low: rawLow,
            close: rawClose,
            volume: rawVolume
          });
        } else {
          const point = dailyData.get(dayKey);
          point.high = Math.max(point.high, rawHigh);
          point.low = Math.min(point.low, rawLow);
          point.close = rawClose;
          point.volume += rawVolume;
        }
      }

      const parsedData = Array.from(dailyData.values()).sort((a, b) => a.timestamp - b.timestamp);
      if (parsedData.length === 0) {
        throw new Error('Bundled BTC CSV returned no usable rows');
      }

      return parsedData;
    })();

    try {
      this.usdCsvData = await this.csvLoadingPromise;
      return this.usdCsvData;
    } finally {
      this.csvLoadingPromise = null;
    }
  }

  static async fetchSupportedCurrencies() {
    if (this.supportedCurrencies) return this.supportedCurrencies;
    if (this.supportedCurrenciesPromise) return this.supportedCurrenciesPromise;

    const cachedValue = readStoredJson(STORAGE_KEYS.supportedCurrencies);
    if (
      cachedValue &&
      Array.isArray(cachedValue.codes) &&
      Number.isFinite(cachedValue.fetchedAt) &&
      (Date.now() - cachedValue.fetchedAt) < SUPPORTED_CURRENCIES_TTL_MS
    ) {
      this.supportedCurrencies = cachedValue.codes;
      return this.supportedCurrencies;
    }

    this.supportedCurrenciesPromise = (async () => {
      const response = await fetch('https://api.frankfurter.dev/v2/currencies');
      if (!response.ok) {
        throw new Error(`Supported currencies API error: ${response.status}`);
      }

      const data = await response.json();
      const codes = data
        .map((entry) => normalizeCurrencyCode(entry.iso_code || ''))
        .filter(Boolean)
        .sort();

      localStorage.setItem(
        STORAGE_KEYS.supportedCurrencies,
        JSON.stringify({ codes, fetchedAt: Date.now() })
      );

      return codes;
    })();

    try {
      this.supportedCurrencies = await this.supportedCurrenciesPromise;
      return this.supportedCurrencies;
    } finally {
      this.supportedCurrenciesPromise = null;
    }
  }

  static async fetchUsdDailyHistoryFromAPI(fromTimestamp, toTimestamp) {
    try {
      const from = Math.floor(fromTimestamp / 1000);
      const to = Math.floor(toTimestamp / 1000);
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${from}&to=${to}&interval=daily`
      );

      if (!response.ok) {
        throw new Error(`BTC daily API error: ${response.status}`);
      }

      const data = await response.json();
      return this.buildPriceSeriesFromPrices(data.prices || [], 'day');
    } catch {
      return this.fetchUsdCandlesFromCoinbase(fromTimestamp, toTimestamp, ONE_DAY_MS, 'day');
    }
  }

  static async fetchUsdRecentHourlyDataFromAPI() {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${HOURLY_HISTORY_DAYS}&interval=hourly`
      );

      if (!response.ok) {
        throw new Error(`BTC hourly API error: ${response.status}`);
      }

      const data = await response.json();
      return this.buildPriceSeriesFromPrices(data.prices || [], 'hour');
    } catch {
      const endTimestamp = Date.now();
      const startTimestamp = endTimestamp - (HOURLY_HISTORY_DAYS * ONE_DAY_MS);
      return this.fetchUsdCandlesFromCoinbase(startTimestamp, endTimestamp, ONE_HOUR_MS, 'hour');
    }
  }

  static async fetchUsdCandlesFromCoinbase(fromTimestamp, toTimestamp, granularityMs, granularityLabel) {
    const candles = [];
    const granularitySeconds = Math.floor(granularityMs / 1000);
    const chunkSpanMs = (COINBASE_MAX_CANDLES_PER_REQUEST - 1) * granularityMs;
    let cursor = granularityLabel === 'day'
      ? toUtcDayTimestamp(fromTimestamp)
      : toUtcHourTimestamp(fromTimestamp);
    const finalTimestamp = granularityLabel === 'day'
      ? toUtcDayTimestamp(toTimestamp)
      : toUtcHourTimestamp(toTimestamp);

    while (cursor <= finalTimestamp) {
      const chunkEnd = Math.min(finalTimestamp, cursor + chunkSpanMs);
      const startIso = new Date(cursor).toISOString();
      const endIso = new Date(chunkEnd).toISOString();
      const response = await fetch(
        `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${granularitySeconds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
      );

      if (!response.ok) {
        throw new Error(`BTC ${granularityLabel} fallback API error: ${response.status}`);
      }

      const data = await response.json();
      candles.push(...(Array.isArray(data) ? data : []));
      cursor = chunkEnd + granularityMs;
    }

    return this.buildPriceSeriesFromCandles(candles, granularityLabel);
  }

  static async fetchFxRatesFromAPI(currency, fromTimestamp, toTimestamp) {
    const from = toIsoDate(fromTimestamp);
    const to = toIsoDate(toTimestamp);
    const response = await fetch(
      `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${currency.toUpperCase()}&from=${from}&to=${to}`
    );

    if (!response.ok) {
      throw new Error(`FX API error: ${response.status}`);
    }

    const data = await response.json();
    return this.buildFxSeries(Array.isArray(data) ? data : []);
  }

  static async loadUsdDailySeries() {
    let csvData = [];
    let csvError = null;

    try {
      csvData = await this.loadUsdCSVData();
    } catch (error) {
      csvError = error instanceof Error ? error.message : 'Bundled BTC CSV unavailable';
    }

    const cachedData = await BTCDatabase.getPoints('usd', 'day');
    let mergedData = mergeSeriesByTimestamp(csvData, cachedData);

    const now = Date.now();
    const lastClosedUtcDay = toUtcDayTimestamp(now);
    const lastTimestamp = mergedData.length > 0
      ? mergedData[mergedData.length - 1].timestamp
      : (HISTORY_START_TIMESTAMP - ONE_DAY_MS);
    let missingDays = Math.max(0, Math.floor((lastClosedUtcDay - lastTimestamp) / ONE_DAY_MS));
    let source = cachedData.length > 0 ? 'CSV_AND_CACHE' : 'CSV_ONLY';
    const loadErrors = [];

    if (csvError && mergedData.length === 0) {
      loadErrors.push(csvError);
    }

    if (missingDays > 0) {
      try {
        const fetchedData = await this.fetchUsdDailyHistoryFromAPI(lastTimestamp + ONE_DAY_MS, now);
        if (fetchedData.length > 0) {
          await BTCDatabase.saveBulkPoints(fetchedData, 'usd', 'day');
          mergedData = mergeSeriesByTimestamp(csvData, cachedData, fetchedData);
          source = 'LIVE_API';
        }
      } catch (fetchError) {
        loadErrors.push(fetchError instanceof Error ? fetchError.message : 'BTC daily refresh failed');
        source = mergedData.length > 0 ? source : 'ERROR';
      }
    }

    if (mergedData.length > 0) {
      const latestTimestamp = mergedData[mergedData.length - 1].timestamp;
      missingDays = Math.max(0, Math.floor((lastClosedUtcDay - latestTimestamp) / ONE_DAY_MS));
    }

    return {
      data: mergedData,
      source,
      error: mergedData.length > 0 ? null : joinErrorMessages(...loadErrors),
      missingDays
    };
  }

  static async loadUsdHourlySeries(forceFetch = false) {
    const cachedData = await BTCDatabase.getPoints('usd', 'hour');
    const cutoff = Date.now() - (HOURLY_HISTORY_DAYS * ONE_DAY_MS);
    let recentData = cachedData.filter((point) => point.timestamp >= cutoff);
    let source = recentData.length > 0 ? 'CACHE_ONLY' : 'EMPTY';
    let error = null;

    const latestTimestamp = recentData.length > 0 ? recentData[recentData.length - 1].timestamp : 0;
    const isStale = !latestTimestamp || (Date.now() - latestTimestamp) > HOURLY_REFRESH_WINDOW_MS;

    if (forceFetch || isStale) {
      try {
        const fetchedData = await this.fetchUsdRecentHourlyDataFromAPI();
        if (fetchedData.length > 0) {
          await BTCDatabase.saveBulkPoints(fetchedData, 'usd', 'hour');
          recentData = fetchedData.filter((point) => point.timestamp >= cutoff);
          source = 'LIVE_API';
        }
      } catch (fetchError) {
        error = recentData.length > 0
          ? null
          : (fetchError instanceof Error ? fetchError.message : 'BTC hourly refresh failed');
        source = recentData.length > 0 ? 'CACHE_ONLY' : 'ERROR';
      }
    }

    return {
      data: recentData,
      source,
      error
    };
  }

  static async loadFxRates(currency) {
    const normalizedCurrency = normalizeCurrencyCode(currency);

    if (normalizedCurrency === 'usd') {
      return {
        data: [{ timestamp: HISTORY_START_TIMESTAMP, rate: 1 }],
        source: 'USD_NATIVE',
        error: null
      };
    }

    const cachedRates = await BTCDatabase.getPoints(normalizedCurrency, 'fx-day');
    let mergedRates = cachedRates;
    const now = Date.now();
    const latestExpectedDay = toUtcDayTimestamp(now);
    const lastTimestamp = cachedRates.length > 0
      ? cachedRates[cachedRates.length - 1].timestamp
      : (HISTORY_START_TIMESTAMP - ONE_DAY_MS);
    const shouldFetch = cachedRates.length === 0 || lastTimestamp < latestExpectedDay;
    let source = cachedRates.length > 0 ? 'CACHE_ONLY' : 'EMPTY';
    let error = null;

    if (shouldFetch) {
      try {
        const fetchFrom = cachedRates.length === 0 ? HISTORY_START_TIMESTAMP : (lastTimestamp + ONE_DAY_MS);
        const fetchedRates = await this.fetchFxRatesFromAPI(normalizedCurrency, fetchFrom, now);
        if (fetchedRates.length > 0) {
          await BTCDatabase.saveBulkPoints(fetchedRates, normalizedCurrency, 'fx-day');
          mergedRates = mergeSeriesByTimestamp(cachedRates, fetchedRates);
          source = 'LIVE_API';
        }
      } catch (fetchError) {
        error = mergedRates.length > 0
          ? null
          : (fetchError instanceof Error ? fetchError.message : 'FX refresh failed');
        source = mergedRates.length > 0 ? 'CACHE_ONLY' : 'ERROR';
      }
    }

    return {
      data: mergedRates,
      source,
      error
    };
  }

  static async getCachedFxRates(currency) {
    const normalizedCurrency = normalizeCurrencyCode(currency);

    if (normalizedCurrency === 'usd') {
      return [{ timestamp: HISTORY_START_TIMESTAMP, rate: 1 }];
    }

    return BTCDatabase.getPoints(normalizedCurrency, 'fx-day');
  }

  static async getCachedFxRatesForCurrencies(currencies) {
    const normalizedCurrencies = uniqueCurrencies(currencies).filter((currency) => currency !== 'usd');
    const cacheEntries = await Promise.all(
      normalizedCurrencies.map(async (currency) => [currency, await this.getCachedFxRates(currency)])
    );

    return cacheEntries.reduce((accumulator, [currency, rates]) => {
      if (rates.length > 0) {
        accumulator[currency] = rates;
      }

      return accumulator;
    }, {});
  }
}

// ==================== COMPONENTS ====================
const StatusBadge = ({ source, missingDays, isIntradayEnabled, currency }) => {
  if (source === 'LIVE_API') {
    return (
      <div className="flex items-center px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
        <Wifi size={12} className="mr-1.5" />
        {currency === 'usd' ? 'Live + Hourly' : 'Live + FX'}
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
      {isIntradayEnabled ? 'Cached + Hourly' : 'Current'}
    </div>
  );
};

const CurrencyControls = ({
  selectedCurrency,
  pinnedCurrencies,
  pendingCurrency,
  supportedCurrencies,
  currencyError,
  onCurrencyChange,
  onPendingCurrencyChange,
  onAddCurrency
}) => (
  <div className="bg-white theme-panel rounded-2xl p-4 shadow-xl border border-slate-100 dark:border-slate-700 mb-6">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Display Currency</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          BTC history stays in USD. Other currencies are derived from cached daily USD FX rates.
        </p>
      </div>

      <div className="flex flex-col gap-3 min-w-0 sm:flex-row sm:items-center">
        <div className="min-w-0 max-w-full overflow-x-auto whitespace-nowrap pb-1 soft-scrollbar-x">
          <div className="flex flex-nowrap gap-2">
            {pinnedCurrencies.map((currency) => (
              <button
                key={currency}
                onClick={() => onCurrencyChange(currency)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                  selectedCurrency === currency
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {currency.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            list="supported-currency-codes"
            value={pendingCurrency}
            onChange={(event) => onPendingCurrencyChange(event.target.value)}
            placeholder="Add fiat"
            className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200"
          />
          <button
            onClick={onAddCurrency}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-orange-500 dark:hover:bg-orange-600"
            aria-label="Add currency"
          >
            <Plus size={14} />
            <span className="ml-1.5">Add</span>
          </button>
          <datalist id="supported-currency-codes">
            {supportedCurrencies.map((currency) => (
              <option key={currency} value={currency.toUpperCase()} />
            ))}
          </datalist>
        </div>
      </div>
    </div>

    {currencyError && (
      <p className="mt-3 text-xs text-red-500">{currencyError}</p>
    )}
  </div>
);

const DataLog = ({ data, durationId, currency }) => {
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const duration = LOG_DURATIONS.find((entry) => entry.id === durationId);
    if (!duration) return [];

    const latestTimestamp = data[data.length - 1].timestamp;
    const cutoff = latestTimestamp - duration.ms;
    return data.filter((point) => point.timestamp >= cutoff).reverse();
  }, [data, durationId]);

  if (filteredData.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-800">
        No data points found for this period in the current dataset.
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        <div className="w-1/3">Timestamp</div>
        <div className="w-1/3 text-right">Price</div>
        <div className="w-1/3 text-right">Change</div>
      </div>
      <div className="max-h-64 overflow-y-auto font-mono text-sm custom-scrollbar">
        {filteredData.map((point, index) => {
          const previousPoint = filteredData[index + 1];
          const change = previousPoint
            ? ((point.close - previousPoint.close) / previousPoint.close) * 100
            : 0;

          return (
            <div
              key={point.timestamp}
              className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              <div className="w-1/3 text-slate-600 dark:text-slate-400">
                {formatTime(point.timestamp)}
              </div>
              <div className="w-1/3 text-right font-medium text-slate-700 dark:text-slate-200">
                {formatCurrency(point.close, currency)}
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
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/70 border-t border-slate-200 dark:border-slate-800 text-xs text-center text-slate-400">
        Showing {filteredData.length} data points
      </div>
    </div>
  );
};

const PriceCard = ({
  currentData,
  previousData,
  currency,
  loading,
  refreshing,
  onRefresh,
  fetchStatus
}) => {
  if (loading && !currentData) {
    return (
      <div className="bg-white theme-panel rounded-2xl border border-slate-100 p-6 shadow-xl transition-all duration-300 dark:border-slate-700">
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-slate-200 dark:border-slate-700 rounded-full"></div>
            <div className="w-20 h-20 border-4 border-orange-500 border-t-transparent rounded-full animate-spin absolute top-0"></div>
          </div>
          <div className="text-center">
            <p className="text-slate-700 dark:text-slate-300 font-medium text-lg">Loading Bitcoin Data</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Preparing BTC history and fiat conversion rates...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentData) return null;

  const price = currentData.close;
  const previousPrice = previousData ? previousData.close : price;
  const change = previousPrice ? ((price - previousPrice) / previousPrice) * 100 : 0;
  const isPositive = change >= 0;
  const visualTheme = getMonthlyVisualTheme();

  return (
    <div
      className="relative overflow-hidden rounded-[30px] border border-slate-200/60 bg-white theme-panel hero-panel p-6 shadow-xl transition-all duration-300 dark:border-slate-800/80 lg:p-7"
      style={{
        backgroundImage: `linear-gradient(120deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.93) 48%, transparent 100%), radial-gradient(circle at 78% 24%, ${visualTheme.accent}22, transparent 24%), radial-gradient(circle at 88% 84%, ${visualTheme.orbit}18, transparent 22%)`
      }}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden lg:block w-[40%]">
        <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-white/10 dark:to-slate-950/6" />
        <div className="absolute inset-y-0 right-0 left-0">
          <MonthlyBitcoinVisual
            currentData={currentData}
            currency={currency}
            change={change}
            compact
          />
        </div>
      </div>

      <div className="relative z-10 max-w-3xl lg:pr-[37%]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/25">
                <span className="text-white font-bold text-lg">BTC</span>
              </div>
              <div>
                <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Bitcoin Price ({currency.toUpperCase()})
                </h2>
                <div className="mt-1 flex items-center flex-wrap gap-2">
                  <StatusBadge
                    source={fetchStatus.source}
                    missingDays={fetchStatus.missingDays || 0}
                    isIntradayEnabled={fetchStatus.isIntradayEnabled}
                    currency={currency}
                  />
                  {fetchStatus.error && (
                    <span className="text-xs text-red-500 hidden sm:inline-block">
                      {fetchStatus.error}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading || refreshing}
            className={`shrink-0 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-900 transition-colors ${refreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={16} />
            <span className="hidden sm:inline">{refreshing ? 'Refreshing' : 'Refresh'}</span>
          </button>
        </div>

        <div className="mt-8 rounded-[28px] border border-slate-200/70 dark:border-slate-800/90 bg-white/70 dark:bg-slate-950/36 backdrop-blur-sm p-6 sm:p-7">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
            Spot price
          </div>
          <div className="mt-4 max-w-full overflow-hidden text-[clamp(2.8rem,7vw,5.6rem)] font-black text-slate-950 dark:text-slate-50 tracking-[-0.05em] leading-[0.92] break-words">
            {formatWholeCurrency(price, currency)}
          </div>
          <div className={`mt-5 inline-flex items-center rounded-full px-3 py-1.5 ${isPositive ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300' : 'bg-rose-500/12 text-rose-600 dark:text-rose-300'} font-semibold`}>
            {isPositive ? <TrendingUp size={18} className="mr-1.5" /> : <TrendingDown size={18} className="mr-1.5" />}
            <span className="text-lg">{Math.abs(change).toFixed(2)}%</span>
            <span className="ml-2 text-sm font-medium opacity-80">24h change</span>
          </div>

          <div className="mt-6 max-w-xl text-base leading-7 text-slate-800 dark:text-slate-100">
            <span className="font-semibold text-slate-950 dark:text-white">{visualTheme.title}.</span>{' '}
            {visualTheme.caption}
          </div>
        </div>

        <div className="mt-5 lg:hidden">
          <MonthlyBitcoinVisual
            currentData={currentData}
            currency={currency}
            change={change}
            compact
          />
        </div>
      </div>
    </div>
  );
};

const MarketStatsStrip = ({ performanceStats, stats24h, currency, loading, meanAnnualGrowth }) => {
  const summaryCards = [
    ...performanceStats.map((entry) => ({
      id: entry.id,
      label: entry.label,
      value: entry.change === null ? '-' : `${entry.change >= 0 ? '+' : ''}${entry.change.toFixed(2)}%`,
      tone: entry.change === null ? 'neutral' : (entry.change >= 0 ? 'positive' : 'negative')
    })),
    {
      id: 'HIGH_24H',
      label: '24h high',
      value: stats24h.high ? formatCurrency(stats24h.high, currency) : '-',
      tone: 'neutral'
    },
    {
      id: 'LOW_24H',
      label: '24h low',
      value: stats24h.low ? formatCurrency(stats24h.low, currency) : '-',
      tone: 'neutral'
    },
    {
      id: 'MEAN_ANNUAL_GROWTH',
      label: 'Avg YoY since start',
      value: meanAnnualGrowth === null ? '-' : `${meanAnnualGrowth >= 0 ? '+' : ''}${meanAnnualGrowth.toFixed(2)}%`,
      tone: meanAnnualGrowth === null ? 'neutral' : (meanAnnualGrowth >= 0 ? 'positive' : 'negative')
    }
  ];

  return (
    <div className="mt-6 rounded-2xl border border-slate-100 bg-white theme-panel p-4 shadow-xl dark:border-slate-700">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-6">
        {summaryCards.map((card) => (
          <div
            key={card.id}
            className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 theme-subpanel px-4 py-3 border border-slate-100 dark:border-slate-700"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{card.label}</div>
            <div className={`mt-2 text-sm font-semibold ${
              card.tone === 'positive'
                ? 'text-emerald-500'
                : card.tone === 'negative'
                  ? 'text-rose-500'
                  : 'text-slate-700 dark:text-slate-200'
            }`}>
              {loading ? '...' : card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MonthlyBitcoinVisual = ({ currentData, currency, change, compact = false }) => {
  const { isDarkMode } = useTheme();
  const monthIndex = new Date().getUTCMonth();
  const visualTheme = getMonthlyVisualTheme();
  const [colorA, colorB] = isDarkMode ? visualTheme.dark : visualTheme.light;
  const waveSeed = monthIndex + 3;
  const sparkPath = Array.from({ length: 7 }, (_, index) => {
    const x = 20 + (index * 60);
    const variance = ((index * waveSeed * 17) % 46) - 18;
    const yBase = 158 - (index * 11);
    return `${index === 0 ? 'M' : 'L'} ${x} ${yBase + variance}`;
  }).join(' ');

  return (
    <div
      className={`relative overflow-hidden ${compact ? 'h-full min-h-[190px] rounded-[24px] lg:rounded-l-none lg:rounded-r-[28px]' : 'min-h-[250px] rounded-[28px]'}`}
      style={{
        background: `linear-gradient(135deg, ${colorA}, ${colorB})`
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,24,0.12),rgba(8,12,24,0.32))] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.16),rgba(2,6,23,0.58))]" />
      <div
        className="absolute -left-10 top-10 h-40 w-40 rounded-full blur-3xl opacity-80"
        style={{ backgroundColor: `${visualTheme.orbit}55` }}
      />
      <div
        className="absolute -right-10 bottom-2 h-44 w-44 rounded-full blur-3xl opacity-75"
        style={{ backgroundColor: `${visualTheme.accent}55` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),transparent_38%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_32%)]" />

      <svg viewBox="0 0 420 260" className="absolute inset-0 h-full w-full opacity-90">
        <defs>
          <linearGradient id="btc-wave" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={visualTheme.orbit} />
            <stop offset="100%" stopColor={visualTheme.accent} />
          </linearGradient>
        </defs>
        <path
          d="M 0 220 C 80 168, 145 245, 240 188 S 352 138, 420 188 L 420 260 L 0 260 Z"
          fill={isDarkMode ? 'rgba(15, 23, 42, 0.48)' : 'rgba(255,255,255,0.34)'}
        />
        <path
          d={sparkPath}
          fill="none"
          stroke="url(#btc-wave)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="300" cy="82" r="48" fill={isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.6)'} />
        <circle cx="300" cy="82" r="39" fill={visualTheme.accent} />
        <text x="300" y="95" textAnchor="middle" fontSize="34" fontWeight="700" fill="#ffffff">₿</text>
        <circle cx="76" cy="62" r="6" fill={visualTheme.orbit} opacity="0.9" />
        <circle cx="102" cy="46" r="3.5" fill={visualTheme.accent} opacity="0.85" />
        <circle cx="124" cy="72" r="2.5" fill={visualTheme.orbit} opacity="0.65" />
      </svg>

      <div className={`relative z-10 flex h-full flex-col justify-between ${compact ? 'p-6' : 'p-6'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/80">
              {monthLabel()}
            </p>
            <h3 className={`${compact ? 'mt-1 text-[1.85rem]' : 'mt-2 text-2xl'} font-semibold text-white tracking-tight`}>
              {visualTheme.title}
            </h3>
            <p className={`mt-2 max-w-[18rem] ${compact ? 'text-sm' : 'text-sm'} text-white/88`}>
              {visualTheme.caption}
            </p>
          </div>
          <div className="rounded-full border border-white/18 bg-black/20 px-3 py-1 text-xs font-medium text-white backdrop-blur">
            {currency.toUpperCase()}
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/65">
              {monthLabel()} frame
            </div>
            <div className={`mt-2 ${compact ? 'text-sm' : 'text-sm'} font-semibold text-white`}>
              {currentData ? formatCurrency(currentData.close, currency) : '--'}
            </div>
          </div>
          <div className={`rounded-2xl px-3 py-2 text-sm font-semibold backdrop-blur ${
            change >= 0
              ? 'bg-emerald-500/18 text-emerald-100'
              : 'bg-rose-500/18 text-rose-100'
          }`}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  );
};

const ChartSection = ({ data, range, setRange, loading, currency, dataModeLabel }) => {
  const { isDarkMode } = useTheme();

  const chartData = useMemo(() => data.map((point) => ({
    ...point,
    dateStr: formatDateLabel(point.timestamp, range)
  })), [data, range]);

  const periodChange = chartData.length > 1
    ? ((chartData[chartData.length - 1].close - chartData[0].close) / chartData[0].close) * 100
    : 0;

  return (
    <div className="mt-6 rounded-2xl border border-slate-100 bg-white theme-panel p-6 shadow-xl dark:border-slate-700">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Price History</h3>
          {!loading && (
            <div className="flex flex-col gap-1">
              <span className={`text-sm font-medium ${periodChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}%
                <span className="text-slate-400 dark:text-slate-500 ml-1">past {TIME_RANGES[range].label}</span>
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {dataModeLabel}
              </span>
            </div>
          )}
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-950/80 p-1 rounded-lg flex-wrap">
          {Object.keys(TIME_RANGES).map((key) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                range === key
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[300px] w-full">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 theme-overlay-surface rounded-lg">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-slate-200 dark:border-slate-700 rounded-full"></div>
                <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin absolute top-0"></div>
              </div>
              <div className="text-center">
                <p className="text-slate-700 dark:text-slate-300 font-medium">Loading Price History</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Preparing the selected currency series...</p>
              </div>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
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
                tickFormatter={(value) => formatAxisCurrency(value, currency)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                  borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value) => [formatCurrency(value, currency), 'Price']}
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
        )}
      </div>
    </div>
  );
};

// ==================== MAIN APP ====================
const BitcoinTracker = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const [usdDailyData, setUsdDailyData] = useState([]);
  const [usdHourlyData, setUsdHourlyData] = useState([]);
  const hasVisibleBaseDataRef = useRef(false);
  const [fxSeriesByCurrency, setFxSeriesByCurrency] = useState({
    usd: [{ timestamp: HISTORY_START_TIMESTAMP, rate: 1 }]
  });
  const [activeFxCurrency, setActiveFxCurrency] = useState('usd');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [range, setRange] = useState('1W');
  const [selectedCurrency, setSelectedCurrency] = useState('usd');
  const [supportedCurrencies, setSupportedCurrencies] = useState([]);
  const [pinnedCurrencies, setPinnedCurrencies] = useState(() => readPinnedCurrencies());
  const [pendingCurrency, setPendingCurrency] = useState('');
  const [currencyError, setCurrencyError] = useState('');
  const [fetchStatus, setFetchStatus] = useState({
    source: 'FETCHING',
    error: null,
    missingDays: 0,
    isIntradayEnabled: false
  });
  const [showLog, setShowLog] = useState(false);
  const [logDuration, setLogDuration] = useState('1D');

  useEffect(() => {
    let isCancelled = false;

    CryptoService.fetchSupportedCurrencies()
      .then((currencies) => {
        if (!isCancelled) {
          setSupportedCurrencies(currencies);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSupportedCurrencies([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const preloadPinnedFx = async () => {
      const cachedFxByCurrency = await CryptoService.getCachedFxRatesForCurrencies(pinnedCurrencies);
      if (isCancelled || Object.keys(cachedFxByCurrency).length === 0) return;

      setFxSeriesByCurrency((previous) => ({
        ...previous,
        ...cachedFxByCurrency
      }));
    };

    preloadPinnedFx();

    return () => {
      isCancelled = true;
    };
  }, [pinnedCurrencies]);

  const loadBaseData = useCallback(async (forceFetch = false, currency = 'usd') => {
    const hasVisibleData = hasVisibleBaseDataRef.current;
    const isBlockingLoad = !hasVisibleData;

    if (isBlockingLoad) {
      setLoading(true);
      setFetchStatus((previous) => ({ ...previous, source: 'FETCHING' }));
    } else {
      setRefreshing(true);
    }

    try {
      const tasks = [
        CryptoService.loadUsdDailySeries(),
        CryptoService.loadUsdHourlySeries(forceFetch)
      ];

      if (currency !== 'usd' && forceFetch) {
        tasks.push(CryptoService.loadFxRates(currency));
      }

      const [dailyResult, hourlyResult, fxResult] = await Promise.all(tasks);

      if (fxResult?.data?.length > 0) {
        setFxSeriesByCurrency((previous) => ({
          ...previous,
          [currency]: fxResult.data
        }));
        setActiveFxCurrency(currency);
      }

      const errors = [dailyResult.error, hourlyResult.error, fxResult?.error].filter(Boolean);
      const nextSource = dailyResult.source === 'LIVE_API' || hourlyResult.source === 'LIVE_API' || fxResult?.source === 'LIVE_API'
        ? 'LIVE_API'
        : (dailyResult.missingDays > 0 ? 'STALE' : 'CACHE_ONLY');

      hasVisibleBaseDataRef.current = dailyResult.data.length > 0 || hourlyResult.data.length > 0;

      setUsdDailyData(dailyResult.data);
      setUsdHourlyData(hourlyResult.data);
      setFetchStatus({
        source: nextSource,
        error: errors.length > 0 ? errors.join(' | ') : null,
        missingDays: dailyResult.missingDays || 0,
        isIntradayEnabled: hourlyResult.data.length > 0
      });
    } catch (error) {
      setFetchStatus((previous) => ({
        ...previous,
        source: hasVisibleData ? previous.source : 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown refresh error'
      }));
    } finally {
      if (isBlockingLoad) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const runInitialLoad = async () => {
      await loadBaseData(false, 'usd');
    };

    runInitialLoad();
  }, [loadBaseData]);

  useEffect(() => {
    let isCancelled = false;

    const activateCurrency = async () => {
      if (selectedCurrency === 'usd') {
        setActiveFxCurrency('usd');
        setCurrencyLoading(false);
        return;
      }

      const inMemoryRates = fxSeriesByCurrency[selectedCurrency];
      if (inMemoryRates?.length > 0) {
        setActiveFxCurrency(selectedCurrency);
        setCurrencyLoading(false);
        return;
      }

      const cachedRates = await CryptoService.getCachedFxRates(selectedCurrency);
      if (isCancelled) return;

      if (cachedRates.length > 0) {
        setFxSeriesByCurrency((previous) => ({
          ...previous,
          [selectedCurrency]: cachedRates
        }));
        setActiveFxCurrency(selectedCurrency);
        setCurrencyLoading(false);
        return;
      }

      setCurrencyLoading(true);
      const fxResult = await CryptoService.loadFxRates(selectedCurrency);
      if (isCancelled) return;

      if (fxResult.data.length > 0) {
        setFxSeriesByCurrency((previous) => ({
          ...previous,
          [selectedCurrency]: fxResult.data
        }));
        setActiveFxCurrency(selectedCurrency);
      }

      if (fxResult.error) {
        setFetchStatus((previous) => ({
          ...previous,
          error: [previous.error, fxResult.error].filter(Boolean).join(' | ')
        }));
      }

      setCurrencyLoading(false);
    };

    activateCurrency();

    return () => {
      isCancelled = true;
    };
  }, [fxSeriesByCurrency, selectedCurrency]);

  const handleAddCurrency = () => {
    const normalized = normalizeCurrencyCode(pendingCurrency);
    if (!normalized) return;

    if (supportedCurrencies.length > 0 && !supportedCurrencies.includes(normalized)) {
      setCurrencyError(`"${normalized.toUpperCase()}" is not in the supported fiat currency list.`);
      return;
    }

    const nextPinnedCurrencies = uniqueCurrencies([...pinnedCurrencies, normalized]);
    setPinnedCurrencies(nextPinnedCurrencies);
    savePinnedCurrencies(nextPinnedCurrencies);
    setCurrencyLoading(!fxSeriesByCurrency[normalized]?.length && normalized !== 'usd');
    setSelectedCurrency(normalized);
    setPendingCurrency('');
    setCurrencyError('');
  };

  const handleCurrencyChange = (currency) => {
    const normalizedCurrency = normalizeCurrencyCode(currency);
    if (normalizedCurrency === selectedCurrency) return;

    if (normalizedCurrency === 'usd' || fxSeriesByCurrency[normalizedCurrency]?.length > 0) {
      setActiveFxCurrency(normalizedCurrency);
      setCurrencyLoading(false);
    } else {
      setCurrencyLoading(true);
    }

    setSelectedCurrency(normalizedCurrency);
    setCurrencyError('');
  };

  const activeFxRates = useMemo(
    () => fxSeriesByCurrency[activeFxCurrency] || [],
    [activeFxCurrency, fxSeriesByCurrency]
  );

  const dailyData = useMemo(
    () => (
      selectedCurrency === activeFxCurrency
        ? convertSeriesToCurrency(usdDailyData, selectedCurrency, activeFxRates)
        : []
    ),
    [activeFxCurrency, activeFxRates, selectedCurrency, usdDailyData]
  );

  const hourlyData = useMemo(
    () => (
      selectedCurrency === activeFxCurrency
        ? convertSeriesToCurrency(usdHourlyData, selectedCurrency, activeFxRates)
        : []
    ),
    [activeFxCurrency, activeFxRates, selectedCurrency, usdHourlyData]
  );

  const activeRangeConfig = TIME_RANGES[range];

  const chartSourceData = useMemo(() => {
    const shouldUseHourly = activeRangeConfig.preferHourly && hourlyData.length > 0;
    return shouldUseHourly ? hourlyData : dailyData;
  }, [activeRangeConfig.preferHourly, dailyData, hourlyData]);

  const chartData = useMemo(() => {
    if (chartSourceData.length === 0) return [];

    const latestTimestamp = chartSourceData[chartSourceData.length - 1].timestamp;
    const cutoff = latestTimestamp - (activeRangeConfig.days * ONE_DAY_MS);
    const filtered = chartSourceData.filter((point) => point.timestamp >= cutoff);
    return CryptoService.aggregateData(filtered, activeRangeConfig.interval);
  }, [activeRangeConfig.days, activeRangeConfig.interval, chartSourceData]);

  const chartDataModeLabel = activeRangeConfig.preferHourly && hourlyData.length > 0
    ? `Hourly BTC/USD converted with daily ${selectedCurrency.toUpperCase()} FX rates`
    : `Daily BTC/USD history converted into ${selectedCurrency.toUpperCase()}`;

  const latestSeries = useMemo(() => mergeSeriesByTimestamp(dailyData, hourlyData), [dailyData, hourlyData]);
  const currentData = latestSeries.length > 0 ? latestSeries[latestSeries.length - 1] : null;
  const stats24h = useMemo(() => buildRollingWindowStats(latestSeries, currentData), [latestSeries, currentData]);
  const performanceStats = useMemo(() => buildPerformanceStats(latestSeries, currentData), [latestSeries, currentData]);
  const meanAnnualGrowth = useMemo(() => buildMeanAnnualGrowth(latestSeries, currentData), [latestSeries, currentData]);
  const blockingLoad = loading || (currencyLoading && selectedCurrency !== activeFxCurrency);
  const showBlockingFetchError = Boolean(fetchStatus.error) && !currentData && chartData.length === 0;

  return (
    <div className={`min-h-screen overflow-x-hidden theme-shell transition-colors duration-300 ${isDarkMode ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-800'}`}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Nexgen Bitcoin Price Graph</h1>
              <span className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/12 dark:text-amber-200">
                Preview
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Bitcoin history with hourly zoom and fiat conversion</p>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>

        <CurrencyControls
          selectedCurrency={selectedCurrency}
          pinnedCurrencies={pinnedCurrencies}
          pendingCurrency={pendingCurrency}
          supportedCurrencies={supportedCurrencies}
          currencyError={currencyError}
          onCurrencyChange={handleCurrencyChange}
          onPendingCurrencyChange={setPendingCurrency}
          onAddCurrency={handleAddCurrency}
        />

        {showBlockingFetchError && (
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
          previousData={stats24h.previousPoint}
          currency={selectedCurrency}
          loading={blockingLoad}
          refreshing={refreshing}
          onRefresh={() => loadBaseData(true, selectedCurrency)}
          fetchStatus={fetchStatus}
        />

        <MarketStatsStrip
          performanceStats={performanceStats}
          stats24h={stats24h}
          currency={selectedCurrency}
          loading={blockingLoad}
          meanAnnualGrowth={meanAnnualGrowth}
        />

        <ChartSection
          data={chartData}
          range={range}
          setRange={setRange}
          loading={blockingLoad}
          currency={selectedCurrency}
          dataModeLabel={chartDataModeLabel}
        />

        <div className="mt-6 bg-white theme-panel rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={showLog}
                  onChange={(event) => setShowLog(event.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800 rounded-full peer dark:bg-slate-950/80 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-700 peer-checked:bg-orange-500"></div>
                <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center">
                  <FileText size={16} className="mr-2 text-slate-500" />
                  Raw Data Inspector
                </span>
              </label>
            </div>

            {showLog && (
              <div className="flex bg-slate-100 dark:bg-slate-950/80 p-1 rounded-lg self-start sm:self-auto">
                {LOG_DURATIONS.map((duration) => (
                  <button
                    key={duration.id}
                    onClick={() => setLogDuration(duration.id)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center ${
                      logDuration === duration.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
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
              data={hourlyData.length > 0 ? hourlyData : dailyData}
              durationId={logDuration}
              currency={selectedCurrency}
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
