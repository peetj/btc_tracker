import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Sun, Moon, Maximize2, Minimize2, Bell, BellOff } from 'lucide-react';

// ==================== CONSTANTS ====================
const REFRESH_INTERVAL = 30000; // 30 seconds
const BASE_PRICE = 43250;
const PRICE_VOLATILITY = 0.002;
const NOTIFICATION_THRESHOLD = 1; // 1% change triggers notification
const MAX_HISTORY_POINTS = 20;

const TIME_RANGES = {
  '1D': { label: '1D', days: 1, points: 24, interval: 'hour' },
  '1M': { label: '1M', days: 30, points: 30, interval: 'day' },
  '6M': { label: '6M', days: 180, points: 30, interval: 'week' },
  '1Y': { label: '1Y', days: 365, points: 52, interval: 'week' },
  '5Y': { label: '5Y', days: 1825, points: 60, interval: 'month' }
};

// ==================== THEME CONTEXT ====================
const ThemeContext = createContext();

const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  
  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

// ==================== API SERVICE ====================
class BitcoinPriceService {
  static async fetchPrice(previousPrice) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Generate realistic price fluctuations
    const randomChange = (Math.random() - 0.5) * 2 * PRICE_VOLATILITY;
    const newPrice = previousPrice > 0 ? previousPrice * (1 + randomChange) : BASE_PRICE;
    
    // Simulate 24h change between -5% and +5%
    const change24h = (Math.random() - 0.5) * 10;
    
    return {
      price: newPrice,
      change_24h: change24h,
      timestamp: new Date().toISOString()
    };
  }
  
  static async fetchHistoricalData(timeRange) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const range = TIME_RANGES[timeRange];
    const data = [];
    const now = new Date();
    let currentPrice = BASE_PRICE;
    
    // Generate historical data points
    for (let i = range.points; i >= 0; i--) {
      const date = new Date(now);
      
      switch (range.interval) {
        case 'hour':
          date.setHours(date.getHours() - i);
          break;
        case 'day':
          date.setDate(date.getDate() - i);
          break;
        case 'week':
          date.setDate(date.getDate() - (i * 7));
          break;
        case 'month':
          date.setMonth(date.getMonth() - i);
          break;
      }
      
      // Generate price with trend
      const trend = timeRange === '5Y' ? 1.0001 : // Slight upward trend for long term
                    timeRange === '1Y' ? 1.00005 : 
                    1; // No trend for short term
      const volatility = range.interval === 'hour' ? 0.001 : 0.003;
      const randomChange = (Math.random() - 0.5) * 2 * volatility;
      currentPrice = currentPrice * (1 + randomChange) * trend;
      
      data.push({
        time: this.formatDate(date, range.interval),
        price: currentPrice,
        timestamp: date.getTime()
      });
    }
    
    return data;
  }
  
  static formatDate(date, interval) {
    switch (interval) {
      case 'hour':
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      case 'day':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      case 'week':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      case 'month':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          year: '2-digit' 
        });
      default:
        return date.toLocaleDateString('en-US');
    }
  }
}

// ==================== NOTIFICATION SERVICE ====================
class NotificationService {
  static async requestPermission() {
    if (!('Notification' in window)) {
      return false;
    }
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  static sendPriceAlert(price, changePercent) {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('Bitcoin Price Alert', {
        body: `BTC: $${price.toLocaleString('en-US', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`,
        icon: '/api/placeholder/64/64'
      });
      
      setTimeout(() => notification.close(), 5000);
    }
  }
}

// ==================== CUSTOM HOOKS ====================
const useBitcoinPrice = () => {
  const [price, setPrice] = useState(0);
  const [previousPrice, setPreviousPrice] = useState(0);
  const [change24h, setChange24h] = useState(0);
  const [historicalData, setHistoricalData] = useState([]);
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  const fetchPrice = useCallback(async () => {
    try {
      const data = await BitcoinPriceService.fetchPrice(previousPrice);
      
      setPreviousPrice(price);
      setPrice(data.price);
      setChange24h(data.change_24h);
      setLastUpdateTime(new Date());
      setIsLoading(false);
      
      // Update historical data
      setHistoricalData(prev => {
        const newPoint = {
          time: new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          price: data.price
        };
        const updated = [...prev, newPoint];
        return updated.slice(-MAX_HISTORY_POINTS);
      });
      
      return { newPrice: data.price, previousPrice: price };
    } catch (error) {
      console.error('Error fetching Bitcoin price:', error);
      setIsLoading(false);
    }
  }, [price, previousPrice]);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return {
    price,
    previousPrice,
    change24h,
    historicalData,
    lastUpdateTime,
    isLoading,
    fetchPrice
  };
};

const useNotifications = (price, previousPrice) => {
  const [enabled, setEnabled] = useState(false);

  const toggle = async () => {
    if (!enabled) {
      const granted = await NotificationService.requestPermission();
      setEnabled(granted);
    } else {
      setEnabled(false);
    }
  };

  useEffect(() => {
    if (enabled && previousPrice > 0 && price > 0) {
      const changePercent = ((price - previousPrice) / previousPrice) * 100;
      if (Math.abs(changePercent) > NOTIFICATION_THRESHOLD) {
        NotificationService.sendPriceAlert(price, changePercent);
      }
    }
  }, [price, enabled, previousPrice]);

  return { enabled, toggle };
};

// ==================== COMPONENTS ====================

// Header Component
const Header = ({ onCompactToggle, notificationsEnabled, onNotificationToggle }) => {
  const { isDarkMode, toggleTheme } = useTheme();
  
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-3xl font-bold">Bitcoin Price Tracker</h1>
      <div className="flex items-center space-x-2">
        <button
          onClick={onNotificationToggle}
          className={`p-2 rounded-lg ${
            isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100'
          } transition-colors`}
          title={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
        >
          {notificationsEnabled ? <Bell size={20} /> : <BellOff size={20} />}
        </button>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-lg ${
            isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100'
          } transition-colors`}
          title={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button
          onClick={onCompactToggle}
          className={`p-2 rounded-lg ${
            isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100'
          } transition-colors`}
          title="Compact view"
        >
          <Minimize2 size={20} />
        </button>
      </div>
    </div>
  );
};

// Price Indicator Component
const PriceIndicator = ({ change, size = 'medium' }) => {
  const getIndicator = () => {
    if (change > 0) return { Icon: TrendingUp, color: 'text-green-500' };
    if (change < 0) return { Icon: TrendingDown, color: 'text-red-500' };
    return { Icon: Minus, color: 'text-gray-500' };
  };
  
  const { Icon, color } = getIndicator();
  const iconSize = size === 'small' ? 20 : 32;
  
  return (
    <div className={`flex items-center ${color}`}>
      <Icon size={iconSize} />
      <div className={size === 'small' ? 'ml-1' : 'ml-2'}>
        <div className={`font-bold ${size === 'small' ? 'text-sm' : 'text-2xl'}`}>
          {change > 0 ? '+' : ''}{change.toFixed(2)}%
        </div>
        {size !== 'small' && (
          <div className="text-sm text-gray-500">24h change</div>
        )}
      </div>
    </div>
  );
};

// Price Card Component
const PriceCard = ({ price, change24h, lastUpdateTime }) => {
  const { isDarkMode } = useTheme();
  const bgColor = change24h > 0 ? 'bg-green-500' : change24h < 0 ? 'bg-red-500' : 'bg-gray-500';
  
  return (
    <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-6 mb-6`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-500 mb-1">Bitcoin (BTC)</h2>
          <div className="text-4xl font-bold">
            ${price.toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}
          </div>
        </div>
        <PriceIndicator change={change24h} />
      </div>
      
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Last updated: {lastUpdateTime.toLocaleTimeString()}</span>
        <div className="flex items-center">
          <div className={`w-2 h-2 rounded-full ${bgColor} mr-2 animate-pulse`}></div>
          <span>Live</span>
        </div>
      </div>
    </div>
  );
};

// Time Range Selector Component
const TimeRangeSelector = ({ selectedRange, onRangeChange, isLoading }) => {
  const { isDarkMode } = useTheme();
  
  return (
    <div className="flex space-x-1">
      {Object.keys(TIME_RANGES).map(range => (
        <button
          key={range}
          onClick={() => onRangeChange(range)}
          disabled={isLoading}
          className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
            selectedRange === range
              ? isDarkMode
                ? 'bg-amber-500 text-white'
                : 'bg-amber-500 text-white'
              : isDarkMode
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {TIME_RANGES[range].label}
        </button>
      ))}
    </div>
  );
};

// Chart Component
const PriceChart = ({ currentPrice }) => {
  const { isDarkMode } = useTheme();
  const [selectedRange, setSelectedRange] = useState('1D');
  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Fetch historical data when range changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const data = await BitcoinPriceService.fetchHistoricalData(selectedRange);
        setChartData(data);
      } catch (error) {
        console.error('Error fetching historical data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [selectedRange]);
  
  // Calculate price change for selected period
  const calculatePriceChange = () => {
    if (chartData.length < 2) return 0;
    const firstPrice = chartData[0].price;
    const lastPrice = chartData[chartData.length - 1].price;
    return ((lastPrice - firstPrice) / firstPrice) * 100;
  };
  
  const priceChange = calculatePriceChange();
  
  return (
    <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-6`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold">Price History</h3>
          {chartData.length > 0 && (
            <p className={`text-sm mt-1 ${
              priceChange > 0 ? 'text-green-500' : priceChange < 0 ? 'text-red-500' : 'text-gray-500'
            }`}>
              {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}% in {TIME_RANGES[selectedRange].label}
            </p>
          )}
        </div>
        <TimeRangeSelector
          selectedRange={selectedRange}
          onRangeChange={setSelectedRange}
          isLoading={isLoading}
        />
      </div>
      
      <div className="h-64 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-opacity-50 z-10">
            <div className="text-gray-500">Loading chart data...</div>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke={isDarkMode ? '#374151' : '#e5e7eb'} 
            />
            <XAxis 
              dataKey="time" 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              tick={{ fontSize: 12 }}
              angle={selectedRange === '5Y' ? -45 : 0}
              textAnchor={selectedRange === '5Y' ? 'end' : 'middle'}
            />
            <YAxis 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              domain={['dataMin - 50', 'dataMax + 50']}
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                border: '1px solid',
                borderColor: isDarkMode ? '#374151' : '#e5e7eb',
                borderRadius: '8px'
              }}
              formatter={(value) => [`$${value.toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}`, 'Price']}
            />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="#f59e0b" 
              strokeWidth={2}
              dot={false}
              animationDuration={500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Compact Widget Component
const CompactWidget = ({ price, change24h, onExpand }) => {
  const { isDarkMode } = useTheme();
  
  return (
    <div className={`${
      isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
    } rounded-lg shadow-lg p-4 w-64`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-500">BTC/USD</h3>
        <button
          onClick={onExpand}
          className="text-gray-500 hover:text-gray-700"
        >
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold">
          ${price.toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          })}
        </div>
        <PriceIndicator change={change24h} size="small" />
      </div>
    </div>
  );
};

// Footer Component
const Footer = () => (
  <div className="mt-6 text-center text-sm text-gray-500">
    <p>Data updates every 30 seconds • No user data collected</p>
    <p className="mt-1">Install as PWA for desktop widget functionality</p>
  </div>
);

// Main App Component
const BitcoinPriceTracker = () => {
  const [isCompactMode, setIsCompactMode] = useState(false);
  const { isDarkMode } = useTheme();
  
  const {
    price,
    previousPrice,
    change24h,
    historicalData,
    lastUpdateTime,
    isLoading
  } = useBitcoinPrice();
  
  const notifications = useNotifications(price, previousPrice);

  if (isLoading) {
    return (
      <div className={`${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'} min-h-screen p-4 flex items-center justify-center`}>
        <div className="text-xl">Loading Bitcoin price data...</div>
      </div>
    );
  }

  if (isCompactMode) {
    return (
      <CompactWidget
        price={price}
        change24h={change24h}
        onExpand={() => setIsCompactMode(false)}
      />
    );
  }

  return (
    <div className={`${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'} min-h-screen p-4`}>
      <div className="max-w-4xl mx-auto">
        <Header
          onCompactToggle={() => setIsCompactMode(true)}
          notificationsEnabled={notifications.enabled}
          onNotificationToggle={notifications.toggle}
        />
        
        <PriceCard
          price={price}
          change24h={change24h}
          lastUpdateTime={lastUpdateTime}
        />
        
        <PriceChart currentPrice={price} />
        
        <Footer />
      </div>
    </div>
  );
};

// Root App with Theme Provider
const App = () => {
  return (
    <ThemeProvider>
      <BitcoinPriceTracker />
    </ThemeProvider>
  );
};

export default App;