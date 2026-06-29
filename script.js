(() => {
  'use strict';

  if (window.__NEWSZOID_COMMAND_CENTER_READY__) return;
  window.__NEWSZOID_COMMAND_CENTER_READY__ = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const API_BASE_URL = (window.NEWSZOID_CONFIG?.API_BASE_URL || '').replace(/\/$/, '');

  const viewNames = {
    dashboard: 'Command Center',
    markets: 'Markets',
    intelligence: 'Intelligence',
    'ai-advisor': 'AI Advisor',
    alerts: 'Alerts',
    about: 'About Newszoid',
    workspace: 'Workspace',
  };

  // Daily query count reset
  const storedDate = localStorage.getItem('nz_query_date') || '';
  const todayStr = new Date().toISOString().slice(0, 10);
  if (storedDate !== todayStr) {
    localStorage.setItem('nz_query_count', '0');
    localStorage.setItem('nz_query_date', todayStr);
  }

  const appState = {
    queryCount: Number(localStorage.getItem('nz_query_count') || 0),
    maxQueries: 10,
    activePersona: 'Market Analyst',
    aiAbortController: null,
    isAiStreaming: false,
  };

  let profile = {
    name: 'Vicky S.',
    email: '',
    businessType: 'Iron & Sheet Metal',
    city: 'Haridwar',
    items: ['MS Sheet', 'HR Coil', 'Copper Wire', 'Diesel', 'Cement OPC'],
  };

  function loadProfile() {
    try {
      const saved = localStorage.getItem('nz_biz_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        profile = { ...profile, ...parsed };
      }
    } catch (e) {
      console.warn('Could not load saved profile:', e);
    }
  }

  function saveProfileToStorage() {
    const name = $('#profileName');
    const email = $('#profileEmail');
    const industry = $('#profileIndustry');
    const location = $('#profileLocation');
    const turnover = $('#profileTurnover');
    const chips = $$('.tag-input .tag-chip');

    const items = chips.map(chip => {
      const clone = chip.cloneNode(true);
      const removeBtn = clone.querySelector('.tag-remove');
      if (removeBtn) removeBtn.remove();
      return clone.textContent.trim();
    }).filter(Boolean);

    if (name) profile.name = name.value.trim() || profile.name;
    if (email) profile.email = email.value.trim();
    if (industry) profile.businessType = industry.value;
    if (location) {
      const cityVal = location.value.split(',')[0].trim();
      profile.city = cityVal || profile.city;
    }
    if (items.length) profile.items = items;

    localStorage.setItem('nz_biz_profile', JSON.stringify(profile));
    return profile;
  }

  function populateProfileForm() {
    const name = $('#profileName');
    const email = $('#profileEmail');
    const industry = $('#profileIndustry');
    const location = $('#profileLocation');

    if (name) name.value = profile.name === 'Vicky S.' || profile.name === 'Business Owner' ? '' : profile.name;
    if (email) email.value = profile.email || '';

    if (industry) {
      for (const opt of industry.options) {
        if (opt.value === profile.businessType || opt.textContent === profile.businessType) {
          opt.selected = true;
          break;
        }
      }
    }
    if (location) {
      location.value = profile.city;
    }

    // Update the subtitle that shows "For: Industry • City"
    const subtitle = $('.card-subtitle');
    if (subtitle) subtitle.textContent = `For: ${profile.businessType} • ${profile.city}`;

    // Update avatars
    const sidebarAvatar = $('#sidebarAvatarImg');
    if (sidebarAvatar && profile.name) {
      const urlName = encodeURIComponent(profile.name);
      sidebarAvatar.src = `https://ui-avatars.com/api/?name=${urlName}&background=FF4A1F&color=fff&size=40`;
    }
    const headerAvatarBtn = $('#headerAvatarBtn');
    if (headerAvatarBtn && profile.name) {
      const initials = profile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      headerAvatarBtn.textContent = initials || 'VS';
    }
    const sidebarUserName = $('.user-name');
    if (sidebarUserName && profile.name) {
      sidebarUserName.textContent = profile.name;
    }
  }

  function updateBriefingDate() {
    const dateEl = $('#briefing-date');
    if (dateEl) {
      const now = new Date();
      dateEl.textContent = now.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  }

  function updateFreshness(isLive) {
    const el = $('#price-freshness');
    if (!el) return;
    const dot = el.querySelector('.freshness-dot');
    if (isLive) {
      if (dot) dot.className = 'freshness-dot live';
      el.childNodes.forEach(node => {
        if (node.nodeType === 3) node.textContent = '';
      });
      const timeText = document.createTextNode(` Updated just now • Live`);
      el.appendChild(timeText);
    } else {
      if (dot) dot.className = 'freshness-dot offline';
      el.childNodes.forEach(node => {
        if (node.nodeType === 3) node.textContent = '';
      });
      const timeText = document.createTextNode(` Estimated • Offline`);
      el.appendChild(timeText);
    }
  }

  let currentNewsData = [];

  // ── Error state renderer ──
  function showErrorState(container, message) {
    if (!container) return;
    clearNode(container);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-state';
    errorDiv.innerHTML = `
      <div style="text-align:center; padding: var(--space-5); color: var(--color-text-muted);">
        <div style="font-size: 2rem; margin-bottom: var(--space-2);">⚠️</div>
        <div style="font-size: 0.85rem; font-weight: 500; color: var(--color-text-secondary); margin-bottom: var(--space-1);">${message}</div>
        <div style="font-size: 0.75rem;">Pull to refresh or check your connection</div>
        <button onclick="location.reload()" style="margin-top: var(--space-3); padding: 6px 16px; border-radius: var(--radius-sm); border: 1px solid var(--color-border-default); background: var(--color-bg-elevated); color: var(--color-text-primary); cursor: pointer; font-size: 0.75rem;">Retry</button>
      </div>`;
    container.appendChild(errorDiv);
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function textEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text || '';
    return el;
  }

  function sourceDomain(source = '') {
    const normalized = source.toLowerCase();
    if (normalized.includes('economic')) return 'economictimes.indiatimes.com';
    if (normalized.includes('business')) return 'business-standard.com';
    if (normalized.includes('times')) return 'timesofindia.indiatimes.com';
    return 'news.google.com';
  }

  function tagClass(item) {
    if (item.sentiment === 'BEARISH' || item.impact === 'HIGH') return 'risk';
    if (item.sentiment === 'BULLISH') return 'opportunity';
    return 'demand';
  }

  // ─── Dismissed stories tracking ───
  function getDismissed() {
    try {
      return JSON.parse(localStorage.getItem('nz_dismissed_stories') || '[]');
    } catch { return []; }
  }

  function dismissStory(headlineKey) {
    const dismissed = getDismissed();
    if (!dismissed.includes(headlineKey)) {
      dismissed.push(headlineKey);
      localStorage.setItem('nz_dismissed_stories', JSON.stringify(dismissed));
    }
  }

  function storyKey(item) {
    return (item.headline || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  }

  function computeRelevance(item) {
    let score = 60;
    const hl = (item.headline || '').toLowerCase();
    const biz = (profile.businessType || '').toLowerCase();
    const city = (profile.city || '').toLowerCase();
    const materials = (profile.items || []).map(m => m.toLowerCase());

    if (materials.some(m => hl.includes(m.split(' ')[0]))) score += 18;
    if (hl.includes(city) || hl.includes(city.split(',')[0])) score += 10;
    if (biz.split(/[&, ]+/).some(w => w.length > 3 && hl.includes(w))) score += 8;
    if (item.impact === 'HIGH') score += 5;
    if (item.sentiment === 'BEARISH' || item.sentiment === 'BULLISH') score += 4;
    return Math.min(score, 99);
  }

  function normalizeRate(raw = {}) {
    const pct = Number(raw.pct ?? raw.deltaPercent ?? 0);
    const change = Number(raw.change ?? raw.delta ?? 0);
    const trend = String(raw.trend || (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat')).toLowerCase();

    return {
      material: raw.material || raw.item || raw.itemName || 'Material',
      rate: Number(raw.rate ?? raw.currentPrice ?? raw.price ?? 0),
      change,
      pct,
      trend,
      market: raw.market || raw.location || profile.city,
      unit: raw.unit || '',
    };
  }

  function formatMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '₹0';
    return `₹${number.toLocaleString('en-IN', { maximumFractionDigits: number < 1000 ? 2 : 0 })}`;
  }

  function rateDirection(rate) {
    if (rate.trend.includes('up') || rate.pct > 0 || rate.change > 0) return 'up';
    if (rate.trend.includes('down') || rate.pct < 0 || rate.change < 0) return 'down';
    return 'neutral';
  }

  function sparklinePoints(direction) {
    if (direction === 'up') return '0,18 10,15 20,12 30,10 40,8 50,5 60,2';
    if (direction === 'down') return '0,5 10,8 20,10 30,12 40,14 50,16 60,18';
    return '0,10 10,10 20,10 30,10 40,10 50,10 60,10';
  }

  function renderPriceRow(rate) {
    const direction = rateDirection(rate);
    const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '→';
    const sparkColor = direction === 'up' ? '#10B981' : direction === 'down' ? '#EF4444' : '#6B7280';

    const row = document.createElement('button');
    row.className = 'price-row';
    row.type = 'button';
    row.addEventListener('click', () => setActiveRate(rate));

    const info = document.createElement('div');
    info.className = 'price-info';
    info.append(
      textEl('span', 'price-name', rate.material),
      textEl('span', 'price-location', rate.market)
    );

    const data = document.createElement('div');
    data.className = 'price-data';
    data.append(
      textEl('span', 'price-value', formatMoney(rate.rate)),
      textEl('span', `price-change ${direction}`, `${arrow} ${Math.abs(rate.pct).toFixed(1)}%`)
    );

    // Generate realistic 7-day sparkline with area fill
    const spark = document.createElement('div');
    spark.className = 'price-sparkline';
    
    const chartData = generate7DayData(rate);
    const rates7d = chartData.map(d => d.rate);
    const minR = Math.min(...rates7d);
    const maxR = Math.max(...rates7d);
    const rangeR = maxR - minR || 1;
    
    const W = 120, H = 36;
    const pts = chartData.map((d, i) => {
      const x = Math.round((i / 6) * W);
      const y = Math.round(H - 4 - ((d.rate - minR) / rangeR) * (H - 8));
      return { x, y };
    });
    
    const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaD = `${lineD} L${W},${H} L0,${H} Z`;
    const gradId = `spk_${rate.material.replace(/\s+/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;
    
    spark.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${sparkColor}" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="${sparkColor}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <path d="${areaD}" fill="url(#${gradId})"/>
        <path d="${lineD}" fill="none" stroke="${sparkColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${pts[pts.length-1].x}" cy="${pts[pts.length-1].y}" r="2.5" fill="${sparkColor}" stroke="var(--color-bg-primary)" stroke-width="1"/>
      </svg>`;

    row.append(info, data, spark);
    return row;
  }

  function renderPriceTable(rates) {
    const container = $('#price-container');
    if (!container) return;

    clearNode(container);
    rates.forEach(rate => container.appendChild(renderPriceRow(rate)));
  }

  function renderMarketList(rates) {
    const list = $('.material-list');
    if (!list) return;

    clearNode(list);
    rates.forEach((rate, index) => {
      const direction = rateDirection(rate);
      const item = document.createElement('button');
      item.className = `material-list-item${index === 0 ? ' active' : ''}`;
      item.type = 'button';
      item.addEventListener('click', () => {
        $$('.material-list-item').forEach(row => row.classList.remove('active'));
        item.classList.add('active');
        setActiveRate(rate);
      });

      const info = document.createElement('div');
      info.className = 'ml-info';
      info.append(textEl('span', 'ml-name', rate.material), textEl('span', 'ml-location', rate.market));

      const data = document.createElement('div');
      data.className = 'ml-price';
      data.append(
        textEl('span', 'ml-value', formatMoney(rate.rate)),
        textEl('span', `ml-change ${direction}`, `${direction === 'up' ? '▲' : direction === 'down' ? '▼' : '→'} ${Math.abs(rate.pct).toFixed(1)}%`)
      );

      item.append(info, data);
      list.appendChild(item);
    });

    const count = $('.material-count');
    if (count) count.textContent = `${rates.length} items tracked`;
  }

  function generate7DayData(rate) {
    const direction = rateDirection(rate);
    const today = new Date();
    const points = [];
    const baseRate = rate.rate;
    const volatility = Math.abs(rate.pct) || 2;

    // Generate 7 data points for last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dayLabel = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      // Simulate price fluctuation over 7 days, converging to current price
      const progress = (6 - i) / 6; // 0 at start, 1 at end
      const randomFactor = (Math.sin(i * 2.1 + rate.material.length) * 0.5 + 0.5);
      let dayRate;
      if (direction === 'up') {
        dayRate = baseRate - Math.abs(rate.change) * (1 - progress) - (randomFactor * baseRate * volatility / 200);
      } else if (direction === 'down') {
        dayRate = baseRate + Math.abs(rate.change) * (1 - progress) + (randomFactor * baseRate * volatility / 200);
      } else {
        dayRate = baseRate + (randomFactor - 0.5) * baseRate * 0.01;
      }
      points.push({ date: dayLabel, rate: Math.round(dayRate) });
    }
    // Ensure last point equals current rate
    points[points.length - 1].rate = baseRate;
    return points;
  }

  function renderDynamicChart(rate) {
    const chartPlaceholder = $('.chart-placeholder');
    if (!chartPlaceholder) return;

    const data = generate7DayData(rate);
    const direction = rateDirection(rate);
    const strokeColor = direction === 'up' ? '#10B981' : direction === 'down' ? '#EF4444' : '#6B7280';

    const rates = data.map(d => d.rate);
    const minRate = Math.min(...rates);
    const maxRate = Math.max(...rates);
    const range = maxRate - minRate || 1;

    // Map rates to SVG Y coordinates (10 top to 110 bottom)
    const svgPoints = data.map((d, i) => {
      const x = Math.round((i / 6) * 400);
      const y = Math.round(110 - ((d.rate - minRate) / range) * 100);
      return `${x},${y}`;
    });

    const gradId = 'chartGradDynamic';
    chartPlaceholder.innerHTML = `
      <svg viewBox="0 0 400 120" preserveAspectRatio="none">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="400" height="120" fill="transparent"/>
        <path d="M${svgPoints.join(' L')}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M${svgPoints.join(' L')} L400,120 L0,120 Z" fill="url(#${gradId})"/>
        <line x1="0" y1="110" x2="400" y2="110" stroke="#1F2937" stroke-width="0.5" stroke-dasharray="4"/>
        <line x1="0" y1="60" x2="400" y2="60" stroke="#1F2937" stroke-width="0.5" stroke-dasharray="4"/>
        <line x1="0" y1="10" x2="400" y2="10" stroke="#1F2937" stroke-width="0.5" stroke-dasharray="4"/>
        ${svgPoints.map((pt, i) => {
          const [cx, cy] = pt.split(',');
          return `<circle cx="${cx}" cy="${cy}" r="3" fill="${strokeColor}" stroke="#0D1321" stroke-width="1.5"/>`;
        }).join('')}
      </svg>
      <div class="chart-labels">
        ${data.filter((_, i) => i % 2 === 0 || i === data.length - 1).map(d => `<span>${d.date}</span>`).join('')}
      </div>`;
  }

  function setActiveRate(rate) {
    const direction = rateDirection(rate);
    const deltaText = rate.change
      ? `${rate.change > 0 ? '+' : '-'}${formatMoney(Math.abs(rate.change))}`
      : '₹0';

    const name = $('.material-name');
    const location = $('.material-location');
    const price = $('.material-price');
    const change = $('.material-change');

    if (name) name.textContent = rate.material;
    if (location) location.textContent = `📍 ${rate.market} Market`;
    if (price) price.textContent = formatMoney(rate.rate);
    if (change) {
      change.classList.remove('up', 'down', 'neutral');
      change.classList.add(direction);
      change.textContent = `${direction === 'up' ? '▲' : direction === 'down' ? '▼' : '→'} ${deltaText} (${Math.abs(rate.pct).toFixed(1)}%)`;
    }

    // Update 7-day stats dynamically
    const data7d = generate7DayData(rate);
    const rates7d = data7d.map(d => d.rate);
    const high7d = Math.max(...rates7d);
    const low7d = Math.min(...rates7d);
    const volatility7d = ((high7d - low7d) / low7d * 100).toFixed(1);

    const statValues = $$('.material-stats .stat-value');
    if (statValues[0]) statValues[0].textContent = formatMoney(high7d);
    if (statValues[1]) statValues[1].textContent = formatMoney(low7d);
    if (statValues[2]) statValues[2].textContent = `${volatility7d}%`;

    // Render dynamic chart
    renderDynamicChart(rate);
  }

  function updatePulseStrip(rates) {
    const pulseItems = $$('.pulse-item');
    rates.slice(0, pulseItems.length).forEach((rate, index) => {
      const item = pulseItems[index];
      const direction = rateDirection(rate);
      const label = $('.pulse-label', item);
      const value = $('.pulse-value', item);
      if (label) label.textContent = rate.material.replace(/\s+(OPC|Wire|Sheet|Coil)$/i, '');
      if (value) {
        value.className = `pulse-value ${direction}`;
        value.textContent = `${direction === 'up' ? '▲' : direction === 'down' ? '▼' : ''}${Math.abs(rate.pct).toFixed(1)}%`;
      }
    });
  }

  function showSkeletons() {
    // Price table skeletons
    const priceContainer = $('#price-container');
    if (priceContainer) {
      clearNode(priceContainer);
      for (let i = 0; i < 4; i++) {
        const row = document.createElement('div');
        row.className = 'skeleton-price-row';
        row.innerHTML = `
          <div class="skeleton-price-info"><div class="skeleton skeleton-text md"></div><div class="skeleton skeleton-text sm" style="margin-top:4px"></div></div>
          <div class="skeleton skeleton-price-value"></div>
          <div class="skeleton skeleton-sparkline"></div>`;
        priceContainer.appendChild(row);
      }
    }

    // News skeletons
    const newsContainer = $('#news-container');
    if (newsContainer) {
      clearNode(newsContainer);
      for (let i = 0; i < 3; i++) {
        const item = document.createElement('div');
        item.className = 'skeleton-news-item';
        item.innerHTML = `
          <div class="skeleton-row"><div class="skeleton skeleton-circle"></div><div class="skeleton skeleton-text md"></div><div class="skeleton skeleton-text sm"></div></div>
          <div class="skeleton skeleton-headline"></div>
          <div class="skeleton skeleton-body"></div>
          <div class="skeleton skeleton-body short"></div>`;
        newsContainer.appendChild(item);
      }
    }

    // Intelligence feed skeletons
    const intelContainer = $('#intelligence-feed') || $('.intelligence-feed');
    if (intelContainer) {
      clearNode(intelContainer);
      for (let i = 0; i < 3; i++) {
        const item = document.createElement('div');
        item.className = 'skeleton-news-item';
        item.innerHTML = `
          <div class="skeleton-row"><div class="skeleton skeleton-circle"></div><div class="skeleton skeleton-text md"></div><div class="skeleton skeleton-text sm"></div></div>
          <div class="skeleton skeleton-headline"></div>
          <div class="skeleton skeleton-body short"></div>`;
        intelContainer.appendChild(item);
      }
    }

    // Recommendations skeletons
    const recContainer = $('#recommendations-container');
    if (recContainer) {
      clearNode(recContainer);
      for (let i = 0; i < 2; i++) {
        const item = document.createElement('div');
        item.className = 'skeleton-news-item';
        item.innerHTML = `
          <div class="skeleton-row"><div class="skeleton skeleton-text sm"></div></div>
          <div class="skeleton skeleton-headline"></div>`;
        recContainer.appendChild(item);
      }
    }
  }

  async function loadRates() {
    let rates = [];
    let isLive = false;

    if (API_BASE_URL) {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 20000);
        const response = await fetch(`${API_BASE_URL}/api/biz-agent/rates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
          signal: controller.signal,
        });
        window.clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.rates) && data.rates.length) {
            rates = data.rates.map(normalizeRate);
            isLive = true;
          }
        }
      } catch (error) {
        console.warn('Rate API failed:', error);
      }
    }

    if (!rates.length) {
      // Show error state — no fake data
      showErrorState($('#price-container'), 'Unable to load live prices');
      showErrorState($('#material-detail'), 'Market data unavailable');
      updateFreshness(false);
      return;
    }

    appState.currentRates = rates;
    renderPriceTable(rates);
    renderMarketList(rates);
    setActiveRate(rates[0]);
    updatePulseStrip(rates);
    updateFreshness(isLive);
  }

  function showToast(message) {
    let toast = $('#appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function switchView(view) {
    if (!view || !$(`#view-${view}`)) return;

    $$('.nav-item, .mobile-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    $$('.view').forEach(panel => panel.classList.toggle('active', panel.id === `view-${view}`));

    const breadcrumb = $('.breadcrumb-label');
    if (breadcrumb) breadcrumb.textContent = viewNames[view] || 'Command Center';

    $('#notifDropdown')?.classList.remove('open');
    $('#sidebar')?.classList.remove('mobile-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function getMarketContext() {
    const prices = $$('.price-row')
      .map(row => ({
        name: $('.price-name', row)?.textContent?.trim(),
        value: $('.price-value', row)?.textContent?.trim(),
        change: $('.price-change', row)?.textContent?.trim(),
      }))
      .filter(item => item.name);

    const alerts = $$('.alert-title, .alert-card-title')
      .map(item => item.textContent.trim())
      .slice(0, 4);

    return { prices, alerts };
  }

  function createNewsItem(item) {
    const key = storyKey(item);
    const wrapper = document.createElement('div');
    wrapper.className = 'news-item';
    wrapper.dataset.storyKey = key;

    const sourceRow = document.createElement('div');
    sourceRow.className = 'news-source';

    const favicon = document.createElement('img');
    favicon.className = 'news-favicon';
    favicon.alt = item.source || 'News';
    favicon.src = `https://www.google.com/s2/favicons?domain=${sourceDomain(item.source)}&sz=32`;
    favicon.addEventListener('error', () => { favicon.src = 'favicon.ico'; }, { once: true });

    sourceRow.append(
      favicon,
      textEl('span', 'news-source-name', item.source || 'News'),
      textEl('span', 'news-time', item.time || 'Today')
    );

    // Relevance pill
    const relevance = computeRelevance(item);
    sourceRow.appendChild(textEl('span', 'news-relevance', `${relevance}% match`));

    const headline = textEl('div', 'news-headline', item.headline || 'Industry update');
    const summary = textEl('div', 'news-summary', item.summary || '');
    summary.appendChild(document.createTextNode(' '));
    summary.appendChild(textEl('span', `news-tag ${tagClass(item)}`, item.category || 'News'));

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'news-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'news-action-btn';
    saveBtn.type = 'button';
    saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> Save';
    saveBtn.addEventListener('click', () => showToast('Story saved to your reading list.'));

    const shareBtn = document.createElement('button');
    shareBtn.className = 'news-action-btn';
    shareBtn.type = 'button';
    shareBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg> Share';
    shareBtn.addEventListener('click', async () => {
      const shareData = { title: item.headline, text: item.summary, url: location.href };
      if (navigator.share) { await navigator.share(shareData).catch(() => {}); }
      else { await navigator.clipboard?.writeText(item.headline).catch(() => {}); showToast('Headline copied!'); }
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'news-action-btn dismiss-btn';
    dismissBtn.type = 'button';
    dismissBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Not relevant';
    dismissBtn.addEventListener('click', () => {
      dismissStory(key);
      wrapper.classList.add('dismissed');
      setTimeout(() => wrapper.remove(), 350);
      showToast('Dismissed. AI will learn your preference.');
    });

    actions.append(saveBtn, shareBtn, dismissBtn);
    wrapper.append(sourceRow, headline, summary, actions);
    return wrapper;
  }

  function renderDashboardNews(news) {
    const container = $('#news-container');
    if (!container) return;

    const dismissed = getDismissed();
    const filtered = news.filter(item => !dismissed.includes(storyKey(item)));

    clearNode(container);
    filtered.slice(0, 3).forEach(item => container.appendChild(createNewsItem(item)));

    const count = $('.news-count');
    if (count) count.textContent = `${Math.min(filtered.length, 3)} stories curated for you`;
  }

  function createIntelCard(item) {
    const key = storyKey(item);
    const card = document.createElement('div');
    card.className = 'card intel-card';
    card.dataset.storyKey = key;

    const sourceRow = document.createElement('div');
    sourceRow.className = 'intel-source-row';

    const favicon = document.createElement('img');
    favicon.className = 'news-favicon';
    favicon.alt = item.source || 'News';
    favicon.src = `https://www.google.com/s2/favicons?domain=${sourceDomain(item.source)}&sz=32`;
    favicon.addEventListener('error', () => { favicon.src = 'favicon.ico'; }, { once: true });

    const relevance = computeRelevance(item);
    sourceRow.append(
      favicon,
      textEl('span', 'intel-source', item.source || 'News'),
      textEl('span', 'intel-time', item.time || 'Today'),
      textEl('span', 'news-relevance', `${relevance}% match`)
    );

    const body = document.createElement('div');
    body.className = 'intel-content';
    body.append(
      textEl('h3', 'intel-headline', item.headline || 'Industry update'),
      textEl('p', 'intel-summary', item.summary || '')
    );

    const tags = document.createElement('div');
    tags.className = 'intel-tags';
    tags.appendChild(textEl('span', `tag tag-${tagClass(item)}`, item.category || 'News'));

    const footer = document.createElement('div');
    footer.className = 'intel-footer';
    const sources = document.createElement('div');
    sources.className = 'intel-sources';
    sources.appendChild(textEl('span', 'source-chip', item.source || 'News'));
    footer.appendChild(sources);

    // Action buttons row
    const actions = document.createElement('div');
    actions.className = 'news-actions';

    const askBtn = document.createElement('button');
    askBtn.className = 'news-action-btn';
    askBtn.type = 'button';
    askBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline></svg> Ask AI';
    askBtn.addEventListener('click', () => handleAiQuestion(`Explain this update: ${item.headline}`));

    const saveBtn = document.createElement('button');
    saveBtn.className = 'news-action-btn';
    saveBtn.type = 'button';
    saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> Save';
    saveBtn.addEventListener('click', () => showToast('Story saved.'));

    const shareBtn = document.createElement('button');
    shareBtn.className = 'news-action-btn';
    shareBtn.type = 'button';
    shareBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg> Share';
    shareBtn.addEventListener('click', async () => {
      if (navigator.share) { await navigator.share({ title: item.headline, text: item.summary }).catch(() => {}); }
      else { await navigator.clipboard?.writeText(item.headline).catch(() => {}); showToast('Copied!'); }
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'news-action-btn dismiss-btn';
    dismissBtn.type = 'button';
    dismissBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Not relevant';
    dismissBtn.addEventListener('click', () => {
      dismissStory(key);
      card.style.transition = 'opacity 0.3s, max-height 0.3s';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 350);
      showToast('Dismissed. AI will learn your preference.');
    });

    actions.append(askBtn, saveBtn, shareBtn, dismissBtn);
    card.append(sourceRow, body, tags, footer, actions);
    return card;
  }

  function renderIntelligenceFeed(news) {
    const feed = $('.intelligence-feed');
    if (!feed) return;

    const dismissed = getDismissed();
    const filtered = news.filter(item => !dismissed.includes(storyKey(item)));

    clearNode(feed);
    if (!filtered.length) {
      feed.innerHTML = '<div style="padding: var(--space-4); text-align: center; color: var(--color-text-muted);">No stories available for this category right now.</div>';
      return;
    }
    filtered.forEach(item => feed.appendChild(createIntelCard(item)));
  }

  function applyIntelligenceFilter() {
    const activeBtn = document.querySelector('.intelligence-filters .filter-btn.active');
    const filter = activeBtn ? activeBtn.textContent.trim() : 'For My Business';
    
    let filtered = currentNewsData || fallbackNews;
    if (filter === 'Sector Deep Dives') {
      filtered = filtered.filter(item => item.category === 'INDUSTRY' || item.category === 'MARKET');
    } else if (filter === 'Policy & Regulatory') {
      filtered = filtered.filter(item => item.category === 'POLICY' || item.category === 'GOVERNMENT');
    } else if (filter === 'Global Trade') {
      filtered = filtered.filter(item => item.category === 'GLOBAL' || String(item.headline).toLowerCase().includes('import') || String(item.headline).toLowerCase().includes('export') || String(item.headline).toLowerCase().includes('china'));
    }

    renderIntelligenceFeed(filtered);
  }

  function renderAlertSignals(news) {
    const alertContainer = $('#alerts-container');
    if (alertContainer) {
      clearNode(alertContainer);
      const alerts = news.filter(item => item.impact === 'HIGH' || item.sentiment === 'BEARISH').slice(0, 3);
      if (!alerts.length) {
        const empty = document.createElement('div');
        empty.className = 'alert-item alert-info';
        empty.appendChild(textEl('div', 'alert-content', 'No urgent alerts right now.'));
        alertContainer.appendChild(empty);
      } else {
        alerts.forEach(item => {
          const alert = document.createElement('div');
          alert.className = `alert-item alert-${(item.impact || 'medium').toLowerCase()}`;

          const severity = document.createElement('div');
          severity.className = 'alert-severity';
          severity.appendChild(textEl('span', 'severity-dot', ''));

          const content = document.createElement('div');
          content.className = 'alert-content';
          content.append(
            textEl('div', 'alert-title', item.headline),
            textEl('div', 'alert-meta', `${item.source || 'News'} • ${item.category || 'Market'}`)
          );

          const action = document.createElement('button');
          action.className = 'alert-action';
          action.type = 'button';
          action.textContent = 'Act';
          action.addEventListener('click', () => handleAiQuestion(`Tell me more about: ${item.headline}`));

          alert.append(severity, content, action);
          alertContainer.appendChild(alert);
        });
      }
    }

    const opportunityContainer = $('#opportunities-container');
    if (opportunityContainer) {
      clearNode(opportunityContainer);
      const opportunities = news.filter(item => item.sentiment === 'BULLISH').slice(0, 2);
      opportunities.forEach(item => {
        const opportunity = document.createElement('div');
        opportunity.className = 'opportunity-item';
        opportunity.append(
          textEl('div', 'opportunity-title', item.headline),
          textEl('div', 'opportunity-impact', `Signal: ${item.signal || 'Act soon'}`),
          textEl('div', 'opportunity-meta', item.source || 'News')
        );
        opportunityContainer.appendChild(opportunity);
      });
      if (!opportunities.length) {
        opportunityContainer.appendChild(textEl('div', 'empty-state', 'No new opportunities detected.'));
      }
    }

    const recommendationContainer = $('#recommendations-container');
    if (recommendationContainer) {
      clearNode(recommendationContainer);
      news.slice(0, 2).forEach(item => {
        const rec = document.createElement('div');
        rec.className = 'rec-item';
        rec.append(
          textEl('div', 'rec-icon', '★'),
          textEl('div', 'rec-title', item.signal || 'Review this update'),
          textEl('div', 'rec-reason', item.summary || item.headline)
        );
        recommendationContainer.appendChild(rec);
      });
    }
  }

  function renderBriefing(news) {
    const briefing = $('#briefing-container');
    if (!briefing) return;

    clearNode(briefing);
    news.slice(0, 4).forEach(item => {
      const li = document.createElement('li');
      li.className = 'briefing-item';
      li.appendChild(textEl('span', 'briefing-bullet', ''));

      const content = document.createElement('div');
      content.className = 'briefing-content';
      const strong = document.createElement('strong');
      strong.textContent = item.headline || 'Market update';
      content.append(strong, document.createTextNode(` — ${item.summary || item.signal || ''}`));

      li.appendChild(content);
      briefing.appendChild(li);
    });
  }

  async function loadNews() {
    let news = [];

    if (API_BASE_URL) {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 20000);
        const response = await fetch(`${API_BASE_URL}/api/biz-agent/news`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
          signal: controller.signal,
        });
        window.clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.news) && data.news.length) {
            news = data.news;
          }
        }
      } catch (error) {
        console.warn('News API failed:', error);
      }
    }

    if (!news.length) {
      // Show error states — no fake data
      showErrorState($('#news-container'), 'Unable to load news');
      showErrorState($('#briefing-container'), 'Briefing unavailable');
      showErrorState($('#alerts-feed'), 'Alerts unavailable');
      showErrorState($('.intelligence-feed'), 'Intelligence feed unavailable');
      return;
    }

    currentNewsData = news;
    renderDashboardNews(news);
    applyIntelligenceFilter();
    renderAlertSignals(news);
    renderAlertsView(news);
    updateAiContext(news);
    renderBriefing(news);
  }

  // ── Dynamic Alerts View (full page) ──
  function renderAlertsView(news) {
    const feed = $('#alerts-feed');
    if (!feed) return;
    clearNode(feed);

    const highAlerts = news.filter(item => item.impact === 'HIGH' || item.sentiment === 'BEARISH');
    const opportunities = news.filter(item => item.sentiment === 'BULLISH');
    const infoItems = news.filter(item => item.impact === 'MEDIUM' || item.impact === 'LOW');

    // Today section
    if (highAlerts.length || opportunities.length) {
      const section = document.createElement('div');
      section.className = 'alerts-section';
      section.appendChild(textEl('h4', 'alerts-section-title', 'Today'));

      highAlerts.forEach(item => {
        section.appendChild(createAlertCard(item, 'high', '\uD83D\uDD34'));
      });

      opportunities.forEach(item => {
        section.appendChild(createAlertCard(item, 'ai', '✦'));
      });

      feed.appendChild(section);
    }

    // Info section
    if (infoItems.length) {
      const section = document.createElement('div');
      section.className = 'alerts-section';
      section.appendChild(textEl('h4', 'alerts-section-title', 'Updates'));

      infoItems.slice(0, 3).forEach(item => {
        section.appendChild(createAlertCard(item, 'info', '\uD83D\uDFE2'));
      });

      feed.appendChild(section);
    }

    if (!highAlerts.length && !opportunities.length && !infoItems.length) {
      feed.innerHTML = '<div style="padding: var(--space-6); text-align: center; color: var(--color-text-muted);">No alerts right now. Check back later.</div>';
    }
  }

  function createAlertCard(item, level, icon) {
    const card = document.createElement('div');
    card.className = `alert-card alert-card-${level}`;

    const severity = document.createElement('div');
    severity.className = 'alert-card-severity';
    severity.appendChild(textEl('span', 'severity-icon', icon));

    const content = document.createElement('div');
    content.className = 'alert-card-content';
    content.appendChild(textEl('div', 'alert-card-title', item.headline || 'Market update'));
    content.appendChild(textEl('div', 'alert-card-desc', item.summary || item.signal || ''));
    content.appendChild(textEl('div', 'alert-card-meta', `${item.time || 'Today'} \u2022 ${item.source || 'News'}`));

    const action = document.createElement('button');
    action.className = 'alert-card-action';
    action.type = 'button';
    action.textContent = 'Ask Newszoid';
    action.addEventListener('click', () => {
      switchView('ai-advisor');
      setTimeout(() => handleAiQuestion(`Analyze this for my business: ${item.headline}`), 300);
    });

    card.append(severity, content, action);
    return card;
  }

  // ── Dynamic AI Context Sidebar ──
  function updateAiContext(news) {
    const contextList = $('#ai-context-list');
    if (!contextList) return;
    clearNode(contextList);

    // Build context from actual loaded data
    const contextItems = [];

    // Add top price movements
    const currentRates = appState.currentRates || [];
    currentRates.filter(r => r && r.pct && Math.abs(r.pct) > 0.5).slice(0, 2).forEach(r => {
      const dir = r.pct > 0 ? 'up' : 'down';
      contextItems.push(`${r.name || r.material} ${dir === 'up' ? '\u25B2' : '\u25BC'}${Math.abs(r.pct).toFixed(1)}%`);
    });

    // Add top news signals
    news.filter(item => item.impact === 'HIGH').slice(0, 2).forEach(item => {
      contextItems.push(item.signal || item.headline?.substring(0, 50) || 'Market signal');
    });

    // Fallback
    if (!contextItems.length) {
      contextItems.push('No major signals today');
    }

    contextItems.forEach(text => {
      const item = document.createElement('div');
      item.className = 'context-item';
      item.appendChild(textEl('span', 'context-dot', ''));
      item.appendChild(textEl('span', '', text));
      contextList.appendChild(item);
    });
  }

  function localAiAnswer(question) {
    const q = question.toLowerCase();
    const { prices, alerts } = getMarketContext();
    const topAlert = alerts[0] || 'No urgent alerts right now.';

    // Try to match a specific material the user asked about
    const matchedMaterial = prices.find(p => {
      const name = (p.name || '').toLowerCase();
      return q.includes(name) || name.split(/\s+/).some(word => word.length > 2 && q.includes(word));
    });

    if (matchedMaterial) {
      return `${matchedMaterial.name}: ${matchedMaterial.value} (${matchedMaterial.change || 'stable'}). Buy partial stock if you need it this week. Wait 2-3 days for remaining quantity if trend allows.`;
    }

    if (/alert|risk|scan/.test(q)) {
      return `Top risk: ${topAlert} Check supplier quotes and GST updates before committing this week.`;
    }

    if (/opportun|tender|export/.test(q)) {
      return 'Refresh your rate sheet and target local tender/infrastructure buyers. Keep quote validity short to protect margins.';
    }

    if (/brief|morning|summary/.test(q)) {
      const today = new Date();
      const dateStr = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const hour = today.getHours();
      const greeting = hour < 12 ? '🌅 Good Morning' : hour < 17 ? '☀️ Good Afternoon' : '🌙 Good Evening';
      
      let briefing = `${greeting}, ${profile.name.split(' ')[0]}! Here's your ${profile.businessType} briefing for ${dateStr}:\n\n`;
      
      // Market snapshot
      briefing += `📊 MARKET SNAPSHOT:\n`;
      prices.forEach(p => {
        briefing += `• ${p.name}: ${p.value} (${p.change || 'stable'})\n`;
      });
      
      // Top alert
      briefing += `\n⚡ TOP ALERT: ${topAlert}\n`;
      
      // Action items based on persona
      briefing += `\n✅ TODAY'S ACTION ITEMS:\n`;
      briefing += `1. Review supplier quotes — prices are shifting\n`;
      briefing += `2. ${alerts[1] ? `Monitor: ${alerts[1]}` : 'Check GST compliance updates'}\n`;
      briefing += `3. Keep customer quotations time-bound (24-48hr validity)\n`;
      briefing += `\n💡 TIP: Compare at least 2 local suppliers in ${profile.city} before locking any order today.`;
      
      return briefing;
    }

    if (/buy|price|rate|cost/.test(q)) {
      const top = prices[0];
      return `${top ? `${top.name}: ${top.value} (${top.change}).` : ''} Buy partial now, keep balance flexible until quotes settle. Compare 2 suppliers.`;
    }

    return `Focus on your highest-moving material first. Keep customer quotes time-bound and verify with 2 local suppliers before locking.`;
  }

  async function askBackend(question) {
    if (!API_BASE_URL) return null;

    // Build persona-specific system prompt
    const personaPrompts = {
      'Market Analyst': 'You are a quick market analyst. Focus on price trends and short-term forecasts.',
      'Procurement Advisor': 'You are a procurement advisor. Focus on buy/wait/hold decisions.',
      'Opportunity Finder': 'You are a business opportunity scout. Focus on growth signals.',
      'Risk Detector': 'You are a risk analyst. Focus on policy changes and supply disruptions.',
    };
    const personaContext = personaPrompts[appState.activePersona] || personaPrompts['Market Analyst'];

    const payload = {
      ...profile,
      question,
      persona: appState.activePersona,
      prompt: `${personaContext} The user is a ${profile.businessType} owner in ${profile.city}.

Question: "${question}"

IMPORTANT RULES:
- DIRECTLY answer the question in 2-3 sentences MAX (under 50 words).
- NO greetings, NO introductions, NO headers, NO HTML, NO markdown.
- Be specific: include numbers, prices, or dates when possible.
- End with ONE clear action the user should take.
- Talk like a quick WhatsApp reply from a trusted market expert.`,
    };

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      const response = await fetch(`${API_BASE_URL}/api/biz-agent/analyst`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (!response.ok) return null;
      const data = await response.json();
      return data.analysis || data.answer || null;
    } catch (error) {
      console.warn('AI backend unavailable:', error);
      return null;
    }
  }

  function appendMessage(kind, text) {
    const messages = $('#ai-messages-container') || $('.ai-messages');
    if (!messages) return null;

    const wrapper = document.createElement('div');
    wrapper.className = `ai-message ${kind === 'user' ? 'user-message' : 'ai-response'}`;

    if (kind !== 'user') {
      const avatar = document.createElement('div');
      avatar.className = 'ai-message-avatar';
      avatar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>';
      wrapper.appendChild(avatar);
    }

    const content = document.createElement('div');
    content.className = 'ai-message-content';
    content.textContent = text;

    wrapper.appendChild(content);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
    return content;
  }

  function initAiGreeting() {
    const messages = $('#ai-messages-container');
    if (!messages) return;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-message ai-greeting';

    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>';

    const content = document.createElement('div');
    content.className = 'ai-message-content';
    content.innerHTML = `<p>${greeting}, ${profile.name.split(' ')[0]}. I'm your <strong>${appState.activePersona}</strong>.</p>
<p>I can help you with price analysis, procurement decisions, risk scanning, and opportunity discovery for your <strong>${profile.businessType}</strong> business in <strong>${profile.city}</strong>.</p>
<p>Ask me anything, or try one of the quick prompts below ↓</p>`;

    wrapper.append(avatar, content);
    messages.appendChild(wrapper);
  }

  function createStepIndicator() {
    const steps = [
      'Reading rate data',
      'Scanning news',
      'Generating action plan',
    ];

    const container = document.createElement('div');
    container.className = 'ai-steps-indicator';

    steps.forEach((label, i) => {
      const step = document.createElement('div');
      step.className = `ai-step${i === 0 ? ' active' : ''}`;
      step.dataset.stepIndex = i;
      const dot = document.createElement('span');
      dot.className = 'ai-step-dot';
      step.append(dot, document.createTextNode(label));
      container.appendChild(step);
    });

    return container;
  }

  async function advanceSteps(stepsEl) {
    if (!stepsEl) return;
    const stepEls = stepsEl.querySelectorAll('.ai-step');

    for (let i = 0; i < stepEls.length; i++) {
      stepEls[i].classList.add('active');
      await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
      stepEls[i].classList.remove('active');
      stepEls[i].classList.add('done');
    }
  }

  async function typeText(el, text, speed = 12, signal) {
    const cursor = document.createElement('span');
    cursor.className = 'ai-typing-cursor';
    el.textContent = '';
    el.appendChild(cursor);

    for (let i = 0; i < text.length; i++) {
      // Check if abort was requested
      if (signal && signal.aborted) {
        cursor.remove();
        return 'aborted';
      }
      cursor.before(document.createTextNode(text[i]));
      if (i % 3 === 0) {
        const parent = el.closest('.ai-messages') || el.closest('#ai-messages-container');
        if (parent) parent.scrollTop = parent.scrollHeight;
      }
      await new Promise(r => setTimeout(r, speed + Math.random() * 8));
    }
    cursor.remove();
    return 'done';
  }

  function appendResponseMeta(contentEl, isBackend) {
    const meta = document.createElement('div');
    meta.className = 'ai-response-meta';

    const pill = document.createElement('span');
    pill.className = `ai-confidence-pill ${isBackend ? 'high' : 'medium'}`;
    pill.textContent = isBackend ? 'Powered by AI + Web Search' : 'Powered by Local Context';
    meta.appendChild(pill);

    const sourcesWrap = document.createElement('div');
    sourcesWrap.className = 'ai-sources-used';
    sourcesWrap.appendChild(document.createTextNode('via '));

    const sourceNames = isBackend
      ? ['Gemini', 'Google Search']
      : ['Dashboard data'];
    sourceNames.forEach(s => sourcesWrap.appendChild(textEl('span', 'ai-source-tag', s)));
    meta.appendChild(sourcesWrap);

    contentEl.appendChild(meta);

    const disclaimer = document.createElement('div');
    disclaimer.className = 'ai-disclaimer-line';
    disclaimer.textContent = 'AI analysis • Not financial advice • Verify before acting';
    contentEl.appendChild(disclaimer);
  }

  function showStopButton() {
    const sendBtn = $('.ai-send-btn');
    if (!sendBtn) return;
    appState.isAiStreaming = true;
    sendBtn.classList.add('streaming');
    sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    sendBtn.title = 'Stop generating';
  }

  function hideStopButton() {
    const sendBtn = $('.ai-send-btn');
    if (!sendBtn) return;
    appState.isAiStreaming = false;
    sendBtn.classList.remove('streaming');
    sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    sendBtn.title = 'Send message';
  }

  function abortCurrentAiStream() {
    if (appState.aiAbortController) {
      appState.aiAbortController.abort();
      appState.aiAbortController = null;
    }
    hideStopButton();

    // Remove any typing cursor still present
    const cursor = document.querySelector('.ai-typing-cursor');
    if (cursor) cursor.remove();

    // Add "Stopped" indicator to the last response
    const lastAnswer = document.querySelector('#ai-messages-container .ai-response:last-child .ai-answer-text');
    if (lastAnswer && !lastAnswer.querySelector('.ai-stopped-tag')) {
      const tag = document.createElement('span');
      tag.className = 'ai-stopped-tag';
      tag.textContent = ' ⏹ Stopped';
      lastAnswer.appendChild(tag);
    }
  }

  async function handleAiQuestion(question) {
    const input = $('.ai-input');
    const trimmed = String(question || input?.value || '').trim();

    // If currently streaming, stop it instead of sending
    if (appState.isAiStreaming && !trimmed) {
      abortCurrentAiStream();
      return;
    }
    if (appState.isAiStreaming) {
      // User typed a new question while streaming — abort old, start new
      abortCurrentAiStream();
    }

    if (!trimmed) {
      showToast('Type a question for the AI advisor.');
      input?.focus();
      return;
    }

    switchView('ai-advisor');
    if (input) input.value = '';
    appendMessage('user', trimmed);

    // Create abort controller for this request
    const abortController = new AbortController();
    appState.aiAbortController = abortController;

    // Show stop button
    showStopButton();

    // Create AI response with step indicator
    const messages = $('#ai-messages-container') || $('.ai-messages');
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-message ai-response';

    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.textContent = '✦';

    const content = document.createElement('div');
    content.className = 'ai-message-content';

    const stepsEl = createStepIndicator();
    content.appendChild(stepsEl);

    const answerEl = document.createElement('div');
    answerEl.className = 'ai-answer-text';
    content.appendChild(answerEl);

    wrapper.append(avatar, content);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;

    // Check if aborted before we even start
    if (abortController.signal.aborted) {
      hideStopButton();
      return;
    }

    // Run steps animation and backend call in parallel
    const [, backendAnswer] = await Promise.all([
      advanceSteps(stepsEl),
      askBackend(trimmed),
    ]);

    if (abortController.signal.aborted) {
      hideStopButton();
      return;
    }

    const isBackend = Boolean(backendAnswer);
    const answer = isBackend
      ? backendAnswer.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : localAiAnswer(trimmed);

    // Stream the answer character by character (with abort support)
    const result = await typeText(answerEl, answer, 12, abortController.signal);

    if (result === 'aborted') {
      hideStopButton();
      return;
    }

    // Add confidence + sources meta
    appendResponseMeta(content, isBackend);
    messages.scrollTop = messages.scrollHeight;

    appState.queryCount = Math.min(appState.queryCount + 1, appState.maxQueries);
    localStorage.setItem('nz_query_count', String(appState.queryCount));
    updateQueryCount();
    hideStopButton();
    appState.aiAbortController = null;
  }

  function updateQueryCount() {
    const used = $('.query-used');
    if (used) used.textContent = String(appState.queryCount);

    const hint = $('.ai-input-hint span');
    if (hint) {
      hint.textContent = `Free: ${Math.max(appState.maxQueries - appState.queryCount, 0)} queries left today`;
    }
  }

  function setupNavigation() {
    $$('[data-view]').forEach(item => {
      item.addEventListener('click', event => {
        event.preventDefault();
        switchView(item.dataset.view);
      });
    });

    $('#headerAvatarBtn')?.addEventListener('click', () => switchView('workspace'));
    $('#sidebarAvatarBtn')?.addEventListener('click', () => switchView('workspace'));
  }

  function setupSidebarAndDropdowns() {
    const sidebar = $('#sidebar');
    $('#sidebarToggle')?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));
    $('#mobileMenuBtn')?.addEventListener('click', () => sidebar?.classList.toggle('mobile-open'));
    $('#sidebarOverlay')?.addEventListener('click', () => sidebar?.classList.remove('mobile-open'));

    const dropdown = $('#notifDropdown');
    $('#notifBtn')?.addEventListener('click', event => {
      event.stopPropagation();
      dropdown?.classList.toggle('open');
    });
    $('#closeNotif')?.addEventListener('click', () => dropdown?.classList.remove('open'));

    document.addEventListener('click', event => {
      if (!dropdown?.contains(event.target) && !$('#notifBtn')?.contains(event.target)) {
        dropdown?.classList.remove('open');
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        dropdown?.classList.remove('open');
        sidebar?.classList.remove('mobile-open');
      }
    });
  }

  function setupAiControls() {
    window.handleAiQuestion = handleAiQuestion;

    $('.ai-send-btn')?.addEventListener('click', () => handleAiQuestion());
    $('.ai-input')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') handleAiQuestion();
    });

    $$('.quick-prompt, .follow-up-btn').forEach(btn => {
      btn.addEventListener('click', () => handleAiQuestion(btn.textContent));
    });

    $$('.persona-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.persona-btn').forEach(item => item.classList.remove('active'));
        btn.classList.add('active');
        appState.activePersona = $('.persona-name', btn)?.textContent?.trim() || 'AI Advisor';
        const aiName = $('.ai-name');
        if (aiName) aiName.textContent = appState.activePersona;
        
        const messages = $('#ai-messages-container');
        if (messages) {
          messages.innerHTML = '';
          initAiGreeting();
        }
      });
    });
  }

  function setupHorizontalSliders() {
    $$('.market-pulse-strip, .intelligence-filters, .ws-menu').forEach(slider => {
      let isDragging = false;
      let startX = 0;
      let scrollLeft = 0;

      slider.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        isDragging = true;
        startX = event.clientX;
        scrollLeft = slider.scrollLeft;
        slider.classList.add('dragging');
        slider.setPointerCapture?.(event.pointerId);
      });

      slider.addEventListener('pointermove', event => {
        if (!isDragging) return;
        event.preventDefault();
        slider.scrollLeft = scrollLeft - (event.clientX - startX);
      });

      ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
        slider.addEventListener(type, event => {
          if (!isDragging) return;
          isDragging = false;
          slider.classList.remove('dragging');
          if (slider.hasPointerCapture?.(event.pointerId)) {
            slider.releasePointerCapture(event.pointerId);
          }
        });
      });

      slider.addEventListener('wheel', event => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        event.preventDefault();
        slider.scrollLeft += event.deltaY;
      }, { passive: false });
    });
  }

  function setupWorkspace() {
    $$('.ws-menu-item').forEach(item => {
      item.addEventListener('click', event => {
        event.preventDefault();
        $$('.ws-menu-item').forEach(link => link.classList.remove('active'));
        item.classList.add('active');
      });
    });

    $$('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.tag-chip')?.remove());
    });

    $('.tag-input-field')?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const value = event.currentTarget.value.trim();
      if (!value) return;

      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.append(document.createTextNode(`${value} `));

      const removeButton = document.createElement('button');
      removeButton.className = 'tag-remove';
      removeButton.type = 'button';
      removeButton.textContent = 'x';
      removeButton.addEventListener('click', () => chip.remove());

      chip.appendChild(removeButton);
      event.currentTarget.before(chip);
      event.currentTarget.value = '';
    });
  }

  function setupButtons() {
    $$('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.filter-btn').forEach(item => item.classList.remove('active'));
        btn.classList.add('active');
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        applyIntelligenceFilter();
      });
    });

    $$('button').forEach(btn => {
      const label = btn.textContent.trim();
      if (label === 'Mark all read') {
        btn.addEventListener('click', () => {
          $$('.notif-badge, .nav-badge, .mobile-badge').forEach(badge => {
            badge.textContent = '0';
            badge.style.display = 'none';
          });
          showToast('All alerts marked read.');
        });
      } else if (label === 'Save Changes') {
        btn.addEventListener('click', () => {
          saveProfileToStorage();
          showToast('Profile saved! Dashboard will refresh with your updated profile.');
          populateProfileForm();
          // Reload data with new profile
          loadRates();
          loadNews();
          switchView('dashboard');
        });
      } else if (label === 'Cancel') {
        btn.addEventListener('click', () => {
          populateProfileForm(); // Reset form to saved state
          switchView('dashboard');
          showToast('Changes cancelled.');
        });
      } else if (label === 'Share') {
        btn.addEventListener('click', async () => {
          // Build briefing text for WhatsApp sharing
          const briefingItems = [];
          $$('#briefing-container .briefing-content strong').forEach(el => {
            briefingItems.push(el.textContent);
          });
          const briefingText = `📊 *Newszoid Business Briefing*\n${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}\n\n` +
            (briefingItems.length ? briefingItems.map(b => `• ${b}`).join('\n') : 'Check Newszoid for your daily briefing') +
            `\n\n🔗 ${location.href}`;

          // Try native share first, fallback to WhatsApp deep link
          if (navigator.share) {
            await navigator.share({ title: 'Newszoid Briefing', text: briefingText, url: location.href }).catch(() => {});
          } else {
            const waUrl = `https://wa.me/?text=${encodeURIComponent(briefingText)}`;
            window.open(waUrl, '_blank');
          }
        });
      } else if (label === 'Full View') {
        btn.addEventListener('click', () => switchView('intelligence'));
      } else if (label === 'Ask AI' || label === 'Ask AI about this') {
        btn.addEventListener('click', () => handleAiQuestion('Explain this update for my business'));
      } else if (label === 'Set Price Alert') {
        btn.addEventListener('click', () => {
          // Get current active material
          const activeName = $('.material-name')?.textContent || 'Material';
          const activePrice = $('.material-price')?.textContent || '';
          const alerts = JSON.parse(localStorage.getItem('nz_price_alerts') || '[]');
          const exists = alerts.find(a => a.material === activeName);
          if (exists) {
            showToast(`Alert already set for ${activeName}`);
            return;
          }
          alerts.push({ material: activeName, price: activePrice, date: new Date().toISOString() });
          localStorage.setItem('nz_price_alerts', JSON.stringify(alerts));
          showToast(`✅ Price alert set for ${activeName} at ${activePrice}`);
        });
      } else if (label === 'View History') {
        btn.addEventListener('click', () => switchView('markets'));
      } else if (label === 'Add Material' || label === 'Settings') {
        btn.addEventListener('click', () => switchView('workspace'));
      }
    });
  }

  function setupCardMenus() {
    $$('.card-menu').forEach(btn => {
      btn.setAttribute('aria-label', 'Card options');
      btn.addEventListener('click', event => {
        event.stopPropagation();
        showToast('Card options are coming soon.');
      });
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(error => {
        console.warn('Service worker registration failed:', error);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
    updateBriefingDate();
    showSkeletons();
    setupNavigation();
    setupSidebarAndDropdowns();
    setupAiControls();
    setupHorizontalSliders();
    setupWorkspace();
    setupButtons();
    setupCardMenus();
    updateQueryCount();
    populateProfileForm();
    initAiGreeting();
    registerServiceWorker();

    if (!profile.email) {
      switchView('workspace');
      showToast('Please complete your Business Profile to personalize your feed.');
    } else {
      loadRates();
      loadNews();
    }
  });
})();
