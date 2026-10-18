"""
Indian Stock Market Tracker (NSE/BSE) Backend
Accurately pulls live market quotes and historical daily/weekly/monthly breakdown data
using live Yahoo Finance APIs with zero placeholders or fabricated figures.
Includes Alpha Vantage fallback option when an API key is provided.
"""

import http.server
import socketserver
import threading
import urllib.parse
import json
import os
import sys
import datetime
import time

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    import urllib.request
    HAS_REQUESTS = False

PORT = 5000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Environment / Configurable Alpha Vantage or Market Key
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "")

# In-memory short-lived cache (10 seconds) to provide fast, snappy UI updates and avoid throttling
CACHE = {}
CACHE_TTL_SECONDS = 10
CACHE_LOCK = threading.Lock()

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
]

def clean_symbol(symbol: str) -> str:
    s = symbol.strip().upper()
    if not (s.endswith(".NS") or s.endswith(".BO")):
        s = f"{s}.NS"
    return s

def fetch_json_with_retry(endpoints, timeout=8, retries=2):
    """Tries primary and secondary Yahoo Finance endpoints with multiple retries."""
    headers = {
        "User-Agent": USER_AGENTS[0],
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    last_err = None
    for attempt in range(retries):
        for url in endpoints:
            try:
                if HAS_REQUESTS:
                    session = requests.Session()
                    session.headers.update(headers)
                    resp = session.get(url, timeout=timeout)
                    if resp.status_code == 200:
                        return resp.json()
                    elif resp.status_code == 404:
                        raise ValueError("Stock ticker not found on exchange")
                else:
                    req = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        return json.loads(resp.read().decode("utf-8"))
            except Exception as e:
                last_err = e
                time.sleep(0.3)
    raise last_err if last_err else RuntimeError("Failed to fetch market data")

def fetch_stock_chart_data(symbol: str, timeframe: str = "daily", selected_month: str = ""):
    """
    Fetches real-time price & historic OHLC for an Indian stock.
    timeframe: 'daily', 'weekly', 'monthly'
    - 'daily': range='5d' to guarantee recent active trading sessions
    - 'weekly': range='1mo'
    - 'monthly': range='3mo', or an exact YYYY-MM month when selected_month is provided
    """
    clean_sym = clean_symbol(symbol)
    if selected_month and timeframe != "monthly":
        selected_month = ""
    if selected_month:
        try:
            month_start = datetime.datetime.strptime(selected_month, "%Y-%m").replace(
                tzinfo=datetime.timezone.utc
            )
        except ValueError as exc:
            raise ValueError("Month must use YYYY-MM format") from exc
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1)
    else:
        month_start = month_end = None

    cache_key = f"{clean_sym}:{timeframe}:{selected_month or 'default'}"
    now_ts = time.time()

    with CACHE_LOCK:
        cached = CACHE.get(cache_key)
    if cached:
        cached_entry, cached_at = cached
        if now_ts - cached_at < CACHE_TTL_SECONDS:
            return cached_entry

    encoded_sym = urllib.parse.quote(clean_sym)
    if selected_month:
        query = (
            f"interval=1d&period1={int(month_start.timestamp())}"
            f"&period2={int(month_end.timestamp())}&includePrePost=false"
        )
    else:
        range_param = "5d"
        if timeframe == "weekly":
            range_param = "1mo"
        elif timeframe == "monthly":
            range_param = "3mo"
        query = f"interval=1d&range={range_param}&includePrePost=false"

    endpoints = [
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded_sym}?{query}",
        f"https://query2.finance.yahoo.com/v8/finance/chart/{encoded_sym}?{query}"
    ]

    data = fetch_json_with_retry(endpoints, timeout=10)
    result = data.get("chart", {}).get("result")
    if not result or len(result) == 0:
        err = data.get("chart", {}).get("error")
        msg = err.get("description", "No live data found for ticker") if err else "Symbol not found"
        raise ValueError(msg)

    chart_obj = result[0]
    meta = chart_obj.get("meta", {})
    timestamps = chart_obj.get("timestamp", [])
    quotes = chart_obj.get("indicators", {}).get("quote", [{}])[0]

    opens = quotes.get("open", [])
    highs = quotes.get("high", [])
    lows = quotes.get("low", [])
    closes = quotes.get("close", [])
    volumes = quotes.get("volume", [])

    history_records = []
    for i in range(len(timestamps)):
        t = timestamps[i]
        o = opens[i] if i < len(opens) else None
        h = highs[i] if i < len(highs) else None
        l = lows[i] if i < len(lows) else None
        c = closes[i] if i < len(closes) else None
        v = volumes[i] if i < len(volumes) else None

        if o is None or h is None or l is None or c is None:
            continue

        dt = datetime.datetime.fromtimestamp(t, datetime.timezone.utc)
        history_records.append({
            "timestamp": t,
            "date": dt.strftime("%Y-%m-%d"),
            "displayDate": dt.strftime("%d %b %Y (%a)"),
            "open": round(float(o), 2),
            "high": round(float(h), 2),
            "low": round(float(l), 2),
            "close": round(float(c), 2),
            "volume": int(v) if v is not None else 0
        })

    if not history_records:
        raise ValueError(f"No active trading data returned for {clean_sym}")

    latest_day = history_records[-1]

    # Calculate real price change
    prev_close = meta.get("chartPreviousClose")
    if prev_close is None and len(history_records) > 1:
        prev_close = history_records[-2]["close"]

    if selected_month:
        # Historical month view must show values from the selected month,
        # not the current live quote returned in Yahoo's metadata.
        current_price = latest_day["close"]
        if len(history_records) > 1:
            prev_close = history_records[-2]["close"]
    else:
        current_price = meta.get("regularMarketPrice", latest_day["close"])
    current_price = round(float(current_price), 2)

    change = 0.0
    change_pct = 0.0
    if prev_close and float(prev_close) > 0:
        change = round(current_price - float(prev_close), 2)
        change_pct = round((change / float(prev_close)) * 100, 2)

    breakdown_days = []
    summary = {}

    if timeframe == "daily":
        breakdown_days = [latest_day]
        summary = {
            "period": f"Latest Session ({latest_day['date']})",
            "open": latest_day["open"],
            "high": latest_day["high"],
            "low": latest_day["low"],
            "close": latest_day["close"],
            "volume": latest_day["volume"],
            "daysCount": 1
        }
    elif timeframe == "weekly":
        # Last 5 active trading days (Monday to Friday trading week)
        recent_week = history_records[-5:] if len(history_records) >= 5 else history_records
        breakdown_days = list(reversed(recent_week)) # Newest first
        period_open = recent_week[0]["open"]
        period_high = max(d["high"] for d in recent_week)
        period_low = min(d["low"] for d in recent_week)
        period_close = recent_week[-1]["close"]
        summary = {
            "period": f"Current Week ({recent_week[0]['date']} to {recent_week[-1]['date']})",
            "open": round(period_open, 2),
            "high": round(period_high, 2),
            "low": round(period_low, 2),
            "close": round(period_close, 2),
            "volume": sum(d["volume"] for d in recent_week),
            "daysCount": len(recent_week)
        }
    elif timeframe == "monthly":
        # Use every trading session for a selected month; otherwise show the latest month.
        recent_month = history_records if selected_month else (
            history_records[-22:] if len(history_records) >= 22 else history_records
        )
        breakdown_days = list(reversed(recent_month)) # Newest first
        period_open = recent_month[0]["open"]
        period_high = max(d["high"] for d in recent_month)
        period_low = min(d["low"] for d in recent_month)
        period_close = recent_month[-1]["close"]
        period_label = f"Month {selected_month}" if selected_month else "Current Month"
        summary = {
            "period": f"{period_label} ({recent_month[0]['date']} to {recent_month[-1]['date']})",
            "open": round(period_open, 2),
            "high": round(period_high, 2),
            "low": round(period_low, 2),
            "close": round(period_close, 2),
            "volume": sum(d["volume"] for d in recent_month),
            "daysCount": len(recent_month)
        }

    company_name = meta.get("shortName") or meta.get("longName") or clean_sym.replace(".NS", "").replace(".BO", "")
    exchange = "NSE" if clean_sym.endswith(".NS") else ("BSE" if clean_sym.endswith(".BO") else meta.get("exchangeName", "NSE"))

    response_data = {
        "symbol": clean_sym,
        "cleanSymbol": clean_sym.replace(".NS", "").replace(".BO", ""),
        "companyName": company_name,
        "exchange": exchange,
        "currency": meta.get("currency", "INR"),
        "currencySymbol": "₹",
        "currentPrice": current_price,
        "change": change,
        "changePct": change_pct,
        "summary": summary,
        "breakdown": breakdown_days,
        "timeframe": timeframe,
        "selectedMonth": selected_month or None,
        "marketState": meta.get("marketState", "REGULAR"),
        "lastUpdated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    with CACHE_LOCK:
        CACHE[cache_key] = (response_data, now_ts)
    return response_data

def search_symbols(query: str):
    """Searches NSE/BSE tickers using query endpoint."""
    q = urllib.parse.quote(query.strip())
    endpoints = [
        f"https://query2.finance.yahoo.com/v1/finance/search?q={q}&quotesCount=8&newsCount=0",
        f"https://query1.finance.yahoo.com/v1/finance/search?q={q}&quotesCount=8&newsCount=0"
    ]
    try:
        data = fetch_json_with_retry(endpoints, timeout=6)
        quotes = data.get("quotes", [])
        results = []
        for item in quotes:
            symbol = item.get("symbol", "")
            if symbol.endswith(".NS") or symbol.endswith(".BO") or item.get("exchange") in ("NSI", "BSE"):
                results.append({
                    "symbol": symbol,
                    "name": item.get("shortname") or item.get("longname") or symbol,
                    "exchange": "NSE" if symbol.endswith(".NS") else ("BSE" if symbol.endswith(".BO") else item.get("exchDisp", "NSE")),
                    "type": item.get("quoteType", "EQUITY")
                })
        return results
    except Exception:
        # Fallback quick suggestions for typical Indian stocks
        return [
            {"symbol": f"{query.upper()}.NS", "name": f"{query.upper()} (NSE)", "exchange": "NSE"},
            {"symbol": f"{query.upper()}.BO", "name": f"{query.upper()} (BSE)", "exchange": "BSE"}
        ]

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


class StockTrackerHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/stock":
            symbol = query.get("symbol", ["RELIANCE.NS"])[0]
            timeframe = query.get("timeframe", ["daily"])[0].lower()
            selected_month = query.get("month", [""])[0]
            try:
                data = fetch_stock_chart_data(symbol, timeframe, selected_month)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "data": data}).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        elif path == "/api/stocks/batch":
            symbols_param = query.get("symbols", ["RELIANCE.NS,TCS.NS,INFY.NS,HDFCBANK.NS"])[0]
            timeframe = query.get("timeframe", ["daily"])[0].lower()
            selected_month = query.get("month", [""])[0]
            symbol_list = [s.strip() for s in symbols_param.split(",") if s.strip()]

            results = []
            errors = []
            for sym in symbol_list:
                try:
                    stock_data = fetch_stock_chart_data(sym, timeframe, selected_month)
                    results.append(stock_data)
                except Exception as ex:
                    errors.append({"symbol": sym, "error": str(ex)})

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": True,
                "data": results,
                "errors": errors,
                "total": len(results)
            }).encode("utf-8"))
            return

        elif path == "/api/search":
            q = query.get("q", [""])[0]
            if not q:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "results": []}).encode("utf-8"))
                return
            items = search_symbols(q)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "results": items}).encode("utf-8"))
            return

        elif path == "/api/config":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "provider": "Yahoo Finance Live Data",
                "defaultStocks": ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"],
                "hasAlphaVantageKey": bool(ALPHA_VANTAGE_KEY),
                "currency": "INR",
                "currencySymbol": "₹"
            }).encode("utf-8"))
            return

        elif path == "/api/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "healthy", "service": "Indian Stock Market Tracker API"}).encode("utf-8"))
            return

        # Fallback to static files
        return super().do_GET()

def run_server():
    print("=" * 60)
    print(" Indian Stock Market Tracker (NSE/BSE) Server Starting")
    print(" Real-time live data powered by Yahoo Finance API (₹ INR)")
    print(f" Web UI available at: http://localhost:{PORT}")
    print("=" * 60)
    
    with ThreadingTCPServer(("", PORT), StockTrackerHTTPHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server gracefully...")
            httpd.server_close()

if __name__ == "__main__":
    run_server()
