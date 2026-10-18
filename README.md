# Indian Stock Market Tracker (NSE / BSE Live)

A complete, clean, responsive web application for tracking Indian National Stock Exchange (NSE) and Bombay Stock Exchange (BSE) stocks with real-time, accurate market metrics in Indian Rupees (₹).

Built with zero placeholders, simulated data, or fake numbers. All Open, High, Low, and Close (OHLC) numbers are extracted directly from live exchange feeds.

---

## 🌟 Key Features

1. **Accurate Live Market Data:**
   - Real-time Last Traded Price (LTP), daily price changes, and exact Open, High, Low, Close (OHLC) values in Indian Rupees (₹).
   - Zero hardcoded or random numbers.

2. **Interactive Timeframe Views:**
   - **Daily View:** Clean table row for each stock with the latest trading day's OHLC numbers.
   - **Weekly View (Day-by-Day Breakdown):** Interactive nested breakdown accordion displaying the Open, High, Low, Close prices for every individual trading day of that week (e.g., Monday through Friday).
   - **Monthly View (Day-by-Day Breakdown):** Expands to show a full nested table of every single trading day in that month (~22 active trading sessions) with corresponding OHLC metrics.

3. **Spacious & Uncluttered Accordion UI:**
   - Expand arrow (`v`) on each stock row smoothly opens a nested sub-table beneath that specific stock with clear padding and aligned numeric columns.
   - Prevents table overcrowding while providing comprehensive historical depth.

4. **Instant Stock Management & Control Center:**
   - **Default Stocks:** Pre-loads top Indian market blue chips: `RELIANCE`, `TCS`, `INFY`, and `HDFC BANK`.
   - **Add Stock Instant Sync:** Search bar & "Add Stock" button to query and add any NSE (`.NS`) or BSE (`.BO`) ticker (e.g., `TATAMOTORS.NS`, `SBIN.NS`, `ITC.NS`, `ICICIBANK.NS`).
   - **Fetch All Stocks Button:** A prominent main button that batch updates all stocks in the watchlist simultaneously.
   - **Individual Stock Refresh Button:** Dedicated refresh button on each row to fetch and update only that specific stock.
   - **Quick Ticker Pills:** One-click shortcuts for prominent Indian companies.

---

## 📁 Project Structure

```
indian-stock-tracker/
├── server.py             # Python HTTP & REST API server with live exchange integrations
├── requirements.txt      # Optional dependencies (requests)
├── start.bat             # 1-click Windows launcher
├── start.sh              # 1-click Linux/macOS launcher
├── README.md             # Complete documentation and API guide
└── static/               # Frontend assets
    ├── index.html        # Clean, accessible UI markup
    ├── css/
    │   └── styles.css    # Modern dark theme with spacious accordion design
    └── js/
        └── app.js        # Interactive client-side controller & real-time fetcher
```

---

## 🚀 Quick Setup Instructions

### Prerequisites
- Python 3.8 or higher installed on your computer.

### Step 1: Run the Server
You can launch the tracker with zero extra installations using Python's standard library, or with `requests` for enhanced connection pooling:

#### On Windows:
Double-click `start.bat` or run in Command Prompt / PowerShell:
```cmd
python server.py
```

#### On Linux / macOS:
```bash
python3 server.py
```

### Step 2: Open in Browser
Visit:
```
http://localhost:5000
```

---

## 🔑 Free API Key Configuration (Optional)

The application works out of the box using live exchange feeds. If you also wish to use an **Alpha Vantage** API key:

1. Obtain a free key from [Alpha Vantage](https://www.alphavantage.co/support/#api-key).
2. Set the environment variable before starting `server.py`:
   - **Windows PowerShell:**
     ```powershell
     $env:ALPHA_VANTAGE_KEY="YOUR_FREE_API_KEY"
     python server.py
     ```
   - **Windows Command Prompt:**
     ```cmd
     set ALPHA_VANTAGE_KEY=YOUR_FREE_API_KEY
     python server.py
     ```
   - **Linux / macOS:**
     ```bash
     export ALPHA_VANTAGE_KEY="YOUR_FREE_API_KEY"
     python3 server.py
     ```

---

## 💡 How to Use the App

- **Switching Timeframes:** Click **Daily**, **Weekly**, or **Monthly** in the top control bar.
- **Selecting a Month:** Open **Monthly**, choose a month in the **Select Month** field, and the table will load every trading session from that month.
- **Expanding Day-by-Day Breakdown:** Click on any stock row or its expand arrow icon to open the sub-table showing all trading dates, daily Open, High, Low, and Close prices.
- **Adding Tickers:** Type any NSE ticker (e.g., `SBIN` or `SBIN.NS`) in the search input and click **Add Stock** or press Enter.
- **Refreshing:** Click **Fetch All Stocks** in the top right to refresh all rows at once, or click the individual refresh icon beside any ticker.
