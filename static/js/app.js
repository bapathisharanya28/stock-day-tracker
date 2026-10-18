/**
 * Indian Stock Market Tracker - Frontend Interactive Controller
 * Real-time quotes, OHLC breakdown by Daily, Weekly (5-day), Monthly (full month)
 */

(function () {
  'use strict';

  // Application State
  const state = {
    // Default monitored stocks (Indian NSE Tickers)
    stocks: ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS'],
    activeTimeframe: 'daily', // 'daily' | 'weekly' | 'monthly'
    selectedMonth: new Date().toISOString().slice(0, 7),
    expandedRows: new Set(),  // Set of stock symbols currently expanded
    stockDataMap: new Map(),  // symbol -> data object
    isLoadingAll: false,
    refreshInterval: null
  };

  // DOM Elements
  const elements = {
    stocksTableBody: document.getElementById('stocksTableBody'),
    tableLoading: document.getElementById('tableLoading'),
    tableEmptyState: document.getElementById('tableEmptyState'),
    btnFetchAll: document.getElementById('btnFetchAll'),
    btnAddStock: document.getElementById('btnAddStock'),
    stockSearchInput: document.getElementById('stockSearchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    searchSuggestions: document.getElementById('searchSuggestions'),
    timeframeButtons: document.querySelectorAll('.timeframe-btn'),
    viewHeading: document.getElementById('viewHeading'),
    viewIndicator: document.getElementById('viewIndicator'),
    lastSyncTime: document.getElementById('lastSyncTime'),
    toastMessage: document.getElementById('toastMessage'),
    popularPills: document.querySelectorAll('.ticker-pill'),
    thOpen: document.getElementById('thOpen'),
    thHigh: document.getElementById('thHigh'),
    thLow: document.getElementById('thLow'),
    thClose: document.getElementById('thClose'),
    monthPicker: document.getElementById('monthPicker'),
    monthInput: document.getElementById('monthInput'),
  };

  // Format currency in Indian format
  function formatINR(val) {
    if (val === null || val === undefined || isNaN(val)) return '₹0.00';
    return '₹' + Number(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatNumber(val) {
    if (val === null || val === undefined || isNaN(val)) return '-';
    return Number(val).toLocaleString('en-IN');
  }

  // Toast Notification
  let toastTimer = null;
  function showToast(message, type = 'info') {
    if (toastTimer) clearTimeout(toastTimer);
    const toast = elements.toastMessage;
    toast.textContent = message;
    toast.className = 'toast';
    if (type === 'error') toast.classList.add('toast-error');
    if (type === 'success') toast.classList.add('toast-success');
    toast.classList.remove('hidden');

    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  // API Call: Fetch single stock
  async function fetchStockData(symbol, timeframe) {
    const month = timeframe === 'monthly' ? `&month=${encodeURIComponent(state.selectedMonth)}` : '';
    const res = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}${month}`);
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || `Failed to fetch data for ${symbol}`);
    }
    return json.data;
  }

  // API Call: Batch fetch stocks
  async function fetchBatchStocks(symbols, timeframe) {
    if (symbols.length === 0) return [];
    const query = symbols.join(',');
    const month = timeframe === 'monthly' ? `&month=${encodeURIComponent(state.selectedMonth)}` : '';
    const res = await fetch(`/api/stocks/batch?symbols=${encodeURIComponent(query)}&timeframe=${encodeURIComponent(timeframe)}${month}`);
    const json = await res.json();
    if (!json.success) {
      throw new Error('Failed to fetch batch stocks');
    }
    return json;
  }

  // Render Table Header labels based on Timeframe
  function updateHeaderLabels() {
    elements.monthPicker.classList.toggle('hidden', state.activeTimeframe !== 'monthly');
    if (state.activeTimeframe === 'daily') {
      elements.viewHeading.textContent = 'Daily Market Watchlist';
      elements.viewIndicator.textContent = 'Latest Trading Day';
      elements.thOpen.textContent = 'Open (₹)';
      elements.thHigh.textContent = 'High (₹)';
      elements.thLow.textContent = 'Low (₹)';
      elements.thClose.textContent = 'Close (₹)';
    } else if (state.activeTimeframe === 'weekly') {
      elements.viewHeading.textContent = 'Weekly Market Watchlist';
      elements.viewIndicator.textContent = '5-Day Trading Week Breakdown';
      elements.thOpen.textContent = 'Week Open (₹)';
      elements.thHigh.textContent = 'Week High (₹)';
      elements.thLow.textContent = 'Week Low (₹)';
      elements.thClose.textContent = 'Week Close (₹)';
    } else if (state.activeTimeframe === 'monthly') {
      elements.viewHeading.textContent = 'Monthly Market Watchlist';
      elements.viewIndicator.textContent = 'Full Month Daily Breakdown';
      elements.thOpen.textContent = 'Month Open (₹)';
      elements.thHigh.textContent = 'Month High (₹)';
      elements.thLow.textContent = 'Month Low (₹)';
      elements.thClose.textContent = 'Month Close (₹)';
    }
  }

  // Render Single Stock Main Row & Its Breakdown Accordion
  function renderStockRow(stock) {
    const sym = stock.symbol;
    const isExpanded = state.expandedRows.has(sym);
    const summary = stock.summary || {};
    const changeClass = stock.change >= 0 ? 'bull-change' : 'bear-change';
    const changeSign = stock.change >= 0 ? '+' : '';
    const exchangeBadge = stock.exchange === 'BSE' ? 'badge-bse' : 'badge-nse';

    // Main Table Row
    const tr = document.createElement('tr');
    tr.className = `stock-row ${isExpanded ? 'expanded' : ''}`;
    tr.dataset.symbol = sym;

    tr.innerHTML = `
      <td class="col-expand">
        <button class="expand-icon-btn" title="Toggle day-by-day breakdown table" data-symbol="${sym}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </td>
      <td class="col-stock">
        <div class="stock-identity">
          <div class="stock-ticker-line">
            <span class="stock-symbol">${stock.cleanSymbol}</span>
            <span class="badge ${exchangeBadge}">${stock.exchange}</span>
          </div>
          <span class="stock-company" title="${stock.companyName}">${stock.companyName}</span>
        </div>
      </td>
      <td class="col-price text-right">
        <div class="numeric-cell price-main">${formatINR(stock.currentPrice)}</div>
      </td>
      <td class="col-change text-right">
        <span class="change-pill ${changeClass}">
          ${changeSign}${stock.change.toFixed(2)} (${changeSign}${stock.changePct.toFixed(2)}%)
        </span>
      </td>
      <td class="col-open text-right numeric-cell">${formatINR(summary.open)}</td>
      <td class="col-high text-right numeric-cell">${formatINR(summary.high)}</td>
      <td class="col-low text-right numeric-cell">${formatINR(summary.low)}</td>
      <td class="col-close text-right numeric-cell">${formatINR(summary.close)}</td>
      <td class="col-actions text-center">
        <div class="action-buttons">
          <button class="btn-icon btn-refresh-stock" title="Refresh this stock" data-symbol="${sym}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/>
            </svg>
          </button>
          <button class="btn-icon btn-danger btn-remove-stock" title="Remove from watchlist" data-symbol="${sym}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </td>
    `;

    // Breakdown Accordion Sub-row
    const trBreakdown = document.createElement('tr');
    trBreakdown.className = `breakdown-row ${isExpanded ? 'visible' : ''}`;
    trBreakdown.id = `breakdown-${sym.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const days = stock.breakdown || [];
    let breakdownRowsHtml = '';

    if (days.length === 0) {
      breakdownRowsHtml = `<tr><td colspan="6" class="text-center" style="padding: 16px; color: var(--text-muted);">No historical day records available.</td></tr>`;
    } else {
      breakdownRowsHtml = days.map(d => {
        const dayChange = d.close - d.open;
        const dayChangeClass = dayChange >= 0 ? 'day-delta-positive' : 'day-delta-negative';
        const daySign = dayChange >= 0 ? '+' : '';
        return `
          <tr>
            <td class="day-badge">${d.displayDate}</td>
            <td class="text-right">${formatINR(d.open)}</td>
            <td class="text-right">${formatINR(d.high)}</td>
            <td class="text-right">${formatINR(d.low)}</td>
            <td class="text-right"><strong>${formatINR(d.close)}</strong></td>
            <td class="text-right ${dayChangeClass}">${daySign}${dayChange.toFixed(2)}</td>
          </tr>
        `;
      }).join('');
    }

    const timeframeDescriptor = state.activeTimeframe === 'weekly' 
      ? `Weekly Breakdown (${days.length} Trading Days Mon-Fri)` 
      : (state.activeTimeframe === 'monthly' ? `Monthly Breakdown (${days.length} Active Trading Days)` : `Daily Session Detail`);

    trBreakdown.innerHTML = `
      <td colspan="9" class="breakdown-cell">
        <div class="nested-breakdown-card">
          <div class="breakdown-header-bar">
            <div class="breakdown-title-info">
              <span>Day-by-Day Historical Breakdown: <strong>${stock.cleanSymbol}</strong></span>
              <span class="breakdown-period-badge">${summary.period || ''}</span>
            </div>
            <span class="breakdown-period-badge">${timeframeDescriptor}</span>
          </div>
          <table class="nested-table">
            <thead>
              <tr>
                <th>Date / Trading Session</th>
                <th class="text-right">Daily Open (₹)</th>
                <th class="text-right">Daily High (₹)</th>
                <th class="text-right">Daily Low (₹)</th>
                <th class="text-right">Daily Close (₹)</th>
                <th class="text-right">Day Delta (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${breakdownRowsHtml}
            </tbody>
          </table>
        </div>
      </td>
    `;

    return { mainRow: tr, breakdownRow: trBreakdown };
  }

  // Render Full Table from state
  function renderAllStocks() {
    elements.stocksTableBody.innerHTML = '';
    updateHeaderLabels();

    if (state.stocks.length === 0) {
      elements.tableEmptyState.classList.remove('hidden');
      return;
    }
    elements.tableEmptyState.classList.add('hidden');

    state.stocks.forEach(sym => {
      const stock = state.stockDataMap.get(sym);
      if (stock) {
        const { mainRow, breakdownRow } = renderStockRow(stock);
        elements.stocksTableBody.appendChild(mainRow);
        elements.stocksTableBody.appendChild(breakdownRow);
      }
    });

    elements.lastSyncTime.textContent = `Last sync: ${new Date().toLocaleTimeString('en-IN')}`;
  }

  // Toggle Accordion Breakdown for a stock
  function toggleAccordion(symbol) {
    if (state.expandedRows.has(symbol)) {
      state.expandedRows.delete(symbol);
    } else {
      state.expandedRows.add(symbol);
    }
    renderAllStocks();
  }

  // Fetch all stocks together
  async function loadAllStocks(showLoader = true) {
    if (state.stocks.length === 0) {
      renderAllStocks();
      return;
    }

    if (showLoader) {
      elements.tableLoading.classList.remove('hidden');
    }
    elements.btnFetchAll.classList.add('is-refreshing');

    try {
      const resp = await fetchBatchStocks(state.stocks, state.activeTimeframe);
      if (resp.data) {
        resp.data.forEach(item => {
          state.stockDataMap.set(item.symbol, item);
        });
      }
      if (resp.errors && resp.errors.length > 0) {
        showToast(`Notice: Some symbols had issues: ${resp.errors.map(e => e.symbol).join(', ')}`, 'error');
      }
      renderAllStocks();
    } catch (err) {
      console.error(err);
      showToast('Error fetching live data. Please retry.', 'error');
    } finally {
      elements.tableLoading.classList.add('hidden');
      elements.btnFetchAll.classList.remove('is-refreshing');
    }
  }

  // Fetch individual stock
  async function refreshIndividualStock(symbol, buttonElement) {
    if (buttonElement) buttonElement.classList.add('spin-icon');
    try {
      const data = await fetchStockData(symbol, state.activeTimeframe);
      state.stockDataMap.set(symbol, data);
      renderAllStocks();
      showToast(`Updated live data for ${data.cleanSymbol}`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Could not refresh ${symbol}: ${err.message}`, 'error');
    } finally {
      if (buttonElement) buttonElement.classList.remove('spin-icon');
    }
  }

  // Add stock to watchlist
  async function addStockToWatchlist(rawSymbol) {
    if (!rawSymbol || !rawSymbol.trim()) return;
    let sym = rawSymbol.trim().toUpperCase();
    if (!sym.endsWith('.NS') && !sym.endsWith('.BO')) {
      sym = `${sym}.NS`;
    }

    if (state.stocks.includes(sym)) {
      showToast(`${sym} is already in your watchlist!`, 'info');
      // If already present, expand it
      state.expandedRows.add(sym);
      renderAllStocks();
      return;
    }

    elements.btnAddStock.disabled = true;
    elements.btnAddStock.textContent = 'Adding...';

    try {
      const data = await fetchStockData(sym, state.activeTimeframe);
      state.stocks.push(sym);
      state.stockDataMap.set(sym, data);
      // Auto-expand in weekly or monthly view so user immediately inspects day-by-day table
      if (state.activeTimeframe !== 'daily') {
        state.expandedRows.add(sym);
      }
      elements.stockSearchInput.value = '';
      elements.searchSuggestions.classList.add('hidden');
      renderAllStocks();
      showToast(`Added ${data.cleanSymbol} (${data.exchange}) to Watchlist!`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Error adding ${sym}: ${err.message}`, 'error');
    } finally {
      elements.btnAddStock.disabled = false;
      elements.btnAddStock.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Add Stock</span>
      `;
    }
  }

  // Remove stock from watchlist
  function removeStockFromWatchlist(symbol) {
    state.stocks = state.stocks.filter(s => s !== symbol);
    state.stockDataMap.delete(symbol);
    state.expandedRows.delete(symbol);
    renderAllStocks();
    showToast(`Removed ${symbol} from Watchlist`, 'info');
  }

  // Setup Event Listeners
  function setupListeners() {
    // "Fetch All Stocks" button
    elements.btnFetchAll.addEventListener('click', () => {
      loadAllStocks(false);
    });

    // Timeframe toggle buttons
    elements.timeframeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tf = btn.dataset.timeframe;
        if (state.activeTimeframe === tf) return;

        elements.timeframeButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        state.activeTimeframe = tf;
        // In Weekly or Monthly view, auto-expand the first stock so the user immediately sees the day-by-day nested breakdown!
        if (tf !== 'daily' && state.stocks.length > 0 && state.expandedRows.size === 0) {
          state.expandedRows.add(state.stocks[0]);
        }

        loadAllStocks(true);
      });
    });

    elements.monthInput.value = state.selectedMonth;
    elements.monthInput.addEventListener('change', () => {
      if (!elements.monthInput.value) return;
      state.selectedMonth = elements.monthInput.value;
      if (state.activeTimeframe === 'monthly') {
        loadAllStocks(true);
      }
    });

    // Add Stock button
    elements.btnAddStock.addEventListener('click', () => {
      addStockToWatchlist(elements.stockSearchInput.value);
    });

    // Search Input Enter key
    elements.stockSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addStockToWatchlist(elements.stockSearchInput.value);
      }
    });

    // Search input clear button
    elements.stockSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        elements.btnClearSearch.classList.remove('hidden');
        handleSearchSuggestions(val);
      } else {
        elements.btnClearSearch.classList.add('hidden');
        elements.searchSuggestions.classList.add('hidden');
      }
    });

    elements.btnClearSearch.addEventListener('click', () => {
      elements.stockSearchInput.value = '';
      elements.btnClearSearch.classList.add('hidden');
      elements.searchSuggestions.classList.add('hidden');
    });

    // Quick ticker pills click
    elements.popularPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const sym = pill.dataset.symbol;
        addStockToWatchlist(sym);
      });
    });

    // Table Delegated Event Handling (Row click to expand, individual refresh, removal)
    elements.stocksTableBody.addEventListener('click', (e) => {
      const expandBtn = e.target.closest('.expand-icon-btn');
      const refreshBtn = e.target.closest('.btn-refresh-stock');
      const removeBtn = e.target.closest('.btn-remove-stock');
      const row = e.target.closest('.stock-row');

      if (refreshBtn) {
        e.stopPropagation();
        const sym = refreshBtn.dataset.symbol;
        refreshIndividualStock(sym, refreshBtn);
        return;
      }

      if (removeBtn) {
        e.stopPropagation();
        const sym = removeBtn.dataset.symbol;
        removeStockFromWatchlist(sym);
        return;
      }

      if (expandBtn) {
        e.stopPropagation();
        const sym = expandBtn.dataset.symbol;
        toggleAccordion(sym);
        return;
      }

      // If user clicks anywhere on the main row, toggle the accordion breakdown
      if (row) {
        const sym = row.dataset.symbol;
        toggleAccordion(sym);
      }
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-section')) {
        elements.searchSuggestions.classList.add('hidden');
      }
    });
  }

  // Debounced Search Suggestions
  let debounceTimer = null;
  function handleSearchSuggestions(query) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success && data.results && data.results.length > 0) {
          renderSuggestions(data.results);
        } else {
          elements.searchSuggestions.classList.add('hidden');
        }
      } catch (err) {
        // Silently fail on search suggestions
      }
    }, 300);
  }

  function renderSuggestions(results) {
    const list = elements.searchSuggestions;
    list.innerHTML = '';
    results.forEach(item => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.innerHTML = `
        <div>
          <span class="suggestion-symbol">${item.symbol}</span>
          <span class="suggestion-name">${item.name}</span>
        </div>
        <span class="badge ${item.exchange === 'BSE' ? 'badge-bse' : 'badge-nse'}">${item.exchange}</span>
      `;
      div.addEventListener('click', () => {
        elements.stockSearchInput.value = item.symbol;
        list.classList.add('hidden');
        addStockToWatchlist(item.symbol);
      });
      list.appendChild(div);
    });
    list.classList.remove('hidden');
  }

  // Initialization
  async function init() {
    setupListeners();
    // In initial load, pre-expand the first default stock (RELIANCE) if in weekly/monthly, or start clean
    await loadAllStocks(true);
  }

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
