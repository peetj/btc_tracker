# Bitcoin Price Tracker

A comprehensive Bitcoin price tracking application with historical data from 2012 to present, featuring live data updates and beautiful visualizations.

## Features

- 📊 **Historical Data**: Complete Bitcoin price data from January 1, 2012
- 🔴 **Live Updates**: Automatic gap-filling with real-time data from CoinGecko API
- 📈 **Interactive Charts**: Multiple time ranges (1D, 1W, 1M, 6M, 1Y, 5Y, ALL)
- 🔄 **Smart Gap Detection**: Automatically identifies missing data and allows manual fetching
- 🌓 **Dark/Light Mode**: Toggle between themes
- 📱 **PWA Support**: Install as a desktop/mobile app
- 💾 **IndexedDB Storage**: Persistent browser database for daily price data
- 🗄️ **Smart Caching**: Automatic data persistence across sessions
- 🔍 **Raw Data Inspector**: View detailed price logs with customizable time windows

## Data Architecture

### Dual Data Source System
1. **CSV Archive** (`data/btcusd_1-min_data.csv`):
   - Historical data from 2012-01-01 to mid-2025
   - Minute-level OHLC (Open, High, Low, Close) data
   - ~7.2M records, aggregated to daily on load for performance

2. **Live API Integration** (CoinGecko):
   - Automatically detects gaps between CSV end date and current date
   - Fetches **daily OHLC prices** using CoinGecko market_chart API
   - Manual "Update Missing Data" button when gaps detected
   - **Stored in IndexedDB** for persistent browser-side storage

### How It Works
1. **Initial Load**: CSV file is loaded and aggregated to daily data
2. **Check IndexedDB**: Looks for previously fetched daily data in browser database
3. **Gap Detection**: Calculates days missing between last data point and today
4. **Auto-Fetch on Load**: Automatically attempts to fetch missing data on startup
5. **Manual Fetch Option**: Button appears when data gaps detected, showing number of missing days
6. **Data Storage**: New daily prices saved to IndexedDB (persistent)
7. **Merge & Display**: CSV + IndexedDB data merged and displayed
8. **Status Indicators**: Clear badges showing data freshness (Up to Date, X days Behind, etc.)

### IndexedDB Storage
- **Database**: `btc_price_db`
- **Store**: `daily_prices`
- **Key**: timestamp (unique)
- **Persistence**: Survives browser restarts
- **Capacity**: Much larger than localStorage (~50MB+)

### Daily Close Pricing
Bitcoin trades 24/7, so we use **midnight UTC (00:00 UTC)** as the daily close:
- Industry standard for crypto daily candles
- Consistent with major exchanges and data providers
- Aggregated from hourly/minute data to daily OHLC bars

## Installation

```bash
npm install
npm run dev
```

## 🚀 Windows Desktop Shortcut
You can create a desktop shortcut to launch the application in two ways:

### Method 1: One-Click Dev Launcher (Recommended for Local Use)
This method creates a script that automatically starts the dev server and opens your browser.

1. Create a new file named `start_tracker.bat` in the root of your project folder.
2. Paste the following code into the file:

```batch
@echo off
echo Starting Bitcoin Price Tracker...
cd /d "%~dp0"
start "" "http://localhost:5173"
npm run dev
```

3. Right-click `start_tracker.bat` -> Show more options -> Send to -> Desktop (create shortcut).
4. You can now double-click the shortcut on your desktop to boot the app instantly.

*(Note: You can change the icon of the shortcut by Right-Clicking the shortcut -> Properties -> Change Icon).*

### Method 2: Install as Native App (PWA)
Once the server is running (via `npm run dev`):

1. Open the app in Chrome or Edge (http://localhost:5173).
2. Look for the Install icon (computer with down arrow) on the right side of the address bar.
3. Click Install.
4. This will create a standalone application window and automatically place a Bitcoin Price Tracker icon on your desktop and Start menu.

## Tech Stack

- React + Vite
- Tailwind CSS
- Recharts (charts)
- Lucide React (icons)
- PWA (Progressive Web App)
- CoinGecko API (live data)
- IndexedDB (data persistence)

## Development

The app automatically handles:
- CSV data loading and daily aggregation (for memory efficiency)
- Live data fetching and merging from CoinGecko API
- IndexedDB storage management for fetched data
- Data aggregation for different time ranges (hour, day, week, month)
- Intelligent gap detection and status reporting
- Manual and automatic data updates

### Browser Console Commands

Open browser console (F12) and use:

```javascript
// View IndexedDB statistics
await BTCDatabase.getDataStats()

// View all stored daily prices
await BTCDatabase.getAllDailyPrices()

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
