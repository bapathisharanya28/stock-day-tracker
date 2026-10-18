"""Vercel serverless adapter for the stock tracker API."""

import json
import os
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server


def api_response(path, query):
    if path == "/stock":
        symbol = query.get("symbol", ["RELIANCE.NS"])[0]
        timeframe = query.get("timeframe", ["daily"])[0].lower()
        selected_month = query.get("month", [""])[0]
        try:
            data = server.fetch_stock_chart_data(symbol, timeframe, selected_month)
            return 200, {"success": True, "data": data}
        except Exception as exc:
            return 400, {"success": False, "error": str(exc)}

    if path == "/stocks/batch":
        symbols_param = query.get(
            "symbols", ["RELIANCE.NS,TCS.NS,INFY.NS,HDFCBANK.NS"]
        )[0]
        timeframe = query.get("timeframe", ["daily"])[0].lower()
        selected_month = query.get("month", [""])[0]
        symbols = [symbol.strip() for symbol in symbols_param.split(",") if symbol.strip()]
        results = []
        errors = []
        for symbol in symbols:
            try:
                results.append(
                    server.fetch_stock_chart_data(symbol, timeframe, selected_month)
                )
            except Exception as exc:
                errors.append({"symbol": symbol, "error": str(exc)})
        return 200, {
            "success": True,
            "data": results,
            "errors": errors,
            "total": len(results),
        }

    if path == "/search":
        search_query = query.get("q", [""])[0]
        return 200, {
            "success": True,
            "results": server.search_symbols(search_query) if search_query else [],
        }

    if path == "/config":
        return 200, {
            "provider": "Yahoo Finance Live Data",
            "defaultStocks": ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"],
            "hasAlphaVantageKey": bool(server.ALPHA_VANTAGE_KEY),
            "currency": "INR",
            "currencySymbol": "₹",
        }

    if path == "/health":
        return 200, {
            "status": "healthy",
            "service": "Indian Stock Market Tracker API",
        }

    return 404, {"success": False, "error": "API endpoint not found"}


class handler(BaseHTTPRequestHandler):
    def _route(self):
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        route = query.pop("route", [parsed.path])[0]
        if not route.startswith("/"):
            route = f"/{route}"
        return route.rstrip("/") or "/"

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_common_headers()
        self.end_headers()

    def do_GET(self):
        status, payload = api_response(self._route(), urllib.parse.parse_qs(
            urllib.parse.urlparse(self.path).query
        ))
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_common_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
