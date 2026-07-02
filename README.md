# Bitcoin Price Tracker

A web-based Bitcoin price tracker with historical data from 2012 onward, hourly zoom, fiat conversion, and persistent local caching.

## Features

- 📊 **Historical Data**: Complete Bitcoin price data from January 1, 2012
- 🔴 **Live Updates**: Automatic backfill using CoinGecko with Coinbase fallback
- 📈 **Interactive Charts**: Multiple time ranges (1D, 1W, 1M, 6M, 1Y, 5Y, ALL)
- 💱 **Fiat Conversion**: Switch between USD, AUD, and additional supported fiat currencies
- 🌓 **Dark/Light Mode**: Toggle between themes
- 📱 **PWA Support**: Optional browser install for desktop/mobile use
- 💾 **IndexedDB Storage**: Persistent browser database for price and FX cache
- 🗄️ **Smart Caching**: Automatic data persistence across sessions
- 🔍 **Raw Data Inspector**: View detailed price logs with customizable time windows

## Data Architecture

### Source Layers
1. **Bundled CSV Archive** (`data/btcusd_1-min_data.csv`)
   - Minute-level BTC/USD archive starting on 2012-01-01
   - Aggregated to daily candles on load for fast rendering

2. **Live USD Price Refresh**
   - Daily backfill extends the archive from its cutoff date to today
   - Recent hourly BTC/USD history is fetched for the short-range views
   - CoinGecko is attempted first, with Coinbase candle data as fallback

3. **Daily FX Conversion**
   - Non-USD views are converted from cached BTC/USD data
   - USD-to-fiat daily FX rates are fetched from Frankfurter and stored locally

### How It Works
1. Load the bundled CSV archive and aggregate it into daily BTC/USD candles.
2. Merge any previously cached daily, hourly, and FX data from IndexedDB.
3. Backfill missing USD history and refresh recent hourly data if the cache is stale.
4. Convert USD price series into the selected fiat currency using cached daily FX rates.
5. Render the hero card, performance strip, chart, and raw-data inspector from the merged cache.

### IndexedDB Storage
- **Database**: `btc_price_db`
- **Store**: `price_points`
- **Key**: `currency:granularity:timestamp`
- **Persistence**: Survives browser restarts
- **Capacity**: Much larger than localStorage (~50MB+)

### Daily Close Pricing
Bitcoin trades 24/7, so we use **midnight UTC (00:00 UTC)** as the daily close:
- Industry standard for crypto daily candles
- Consistent with major exchanges and data providers
- Aggregated from hourly/minute data to daily OHLC bars

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Production Build

```bash
npm run build
npm run preview
```

## Optional Browser Install (PWA)

When the app is served over a browser that supports PWA install prompts, you can install it from the address bar menu for a standalone app-like window.

## Tech Stack

- React + Vite
- Tailwind CSS
- Recharts (charts)
- Lucide React (icons)
- PWA (Progressive Web App)
- CoinGecko + Coinbase fallback (market data)
- Frankfurter (FX rates)
- IndexedDB (data persistence)

## Development

The app automatically handles:
- CSV data loading and daily aggregation (for memory efficiency)
- Live data fetching and merging with fallback providers
- IndexedDB storage management for fetched data
- Data aggregation for different time ranges (hour, day, week, month)
- Automatic fiat conversion from cached USD history
- Automatic refresh and cache reuse

### Browser Console Commands

Open browser console (F12) and use:

```javascript
// View IndexedDB statistics
await BTCDatabase.getDataStats()

// Clear all IndexedDB data
await BTCDatabase.clearAllData()
```

## Time Range Views

- **1D**: Last 24 hours (hourly aggregation)
- **1W**: Last 7 days (daily aggregation)
- **1M**: Last 30 days (daily aggregation)
- **6M**: Last 6 months (daily aggregation)
- **1Y**: Last year (weekly aggregation)
- **5Y**: Last 5 years (monthly aggregation)
- **ALL**: Complete history from 2012 (monthly aggregation)

## Data Status Indicators

- **Up to Date** (Green): All data current, API fetch successful
- **Current** (Green): Using cached data, no gaps detected
- **X days Behind** (Amber): Data gap detected, manual fetch available
- **Historical** (Gray): Viewing CSV data only
- **Fetching...** (Blue): Currently retrieving data from API

## Notes

- The CSV file contains ~7.2M records. The app aggregates them to daily data on load to optimize memory usage and chart performance.
- CoinGecko API has rate limits. The app automatically handles this and provides clear feedback.
- IndexedDB data persists across browser sessions but is specific to each browser/profile.
- For best results, open the app daily to keep data current, or use the manual fetch button when needed.
