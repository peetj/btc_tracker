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
1. **Bundled Daily Archive** (`data/btcusd_daily_data.csv`)
   - Checked-in daily BTC/USD archive starting on 2012-01-01
   - Small enough for GitHub Pages deployment and fast first-load rendering
   - Used by default in local, preview, and GitHub Pages builds

2. **Live USD Price Refresh**
   - Daily backfill extends the archive from its cutoff date to today
   - Recent hourly BTC/USD history is fetched for the short-range views
   - CoinGecko is attempted first, with Coinbase candle data as fallback

3. **Daily FX Conversion**
   - Non-USD views are converted from cached BTC/USD data
   - USD-to-fiat daily FX rates are fetched from Frankfurter and stored locally

### How It Works
1. Load the bundled daily BTC/USD archive.
2. Merge any previously cached daily, hourly, and FX data from IndexedDB.
3. Backfill missing USD history and refresh recent hourly data if the cache is stale.
4. Convert USD price series into the selected fiat currency using cached daily FX rates.
5. Render the hero card, performance strip, chart, and raw-data inspector from the merged cache.

### Optional Local High-Resolution Mode

If you want to use the full minute archive locally:

1. Copy your local minute CSV to `public/local-data/btcusd_1-min_data.csv`
2. Run `npm run dev`
3. Open `http://localhost:5173/?archive=local-minute`

If the local minute file is missing or incomplete, the app falls back to the bundled daily archive automatically.

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

## GitHub Pages

The repository is configured to deploy from GitHub Actions to GitHub Pages using the bundled daily archive.

- Public Pages builds default to the lightweight daily archive
- The default visible chart range remains `1W`
- Local minute resolution is still available through the optional manual mode above

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
- Bundled daily archive loading plus optional local minute-archive fallback
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

- The original local minute CSV contains ~7.2M records.
- The checked-in archive is the pre-aggregated daily version of that larger local minute dataset.
- CoinGecko API has rate limits. The app automatically handles this and provides clear feedback.
- IndexedDB data persists across browser sessions but is specific to each browser/profile.
- For best results, open the app daily to keep data current, or use the manual fetch button when needed.
