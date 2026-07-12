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
    'ai-advisor': 'Newszoid Intelligence Advisor',
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
    currentRates: [],
    profileResearchAbortController: null,
    profileResearchTimer: null,
    profileResearchKey: '',
    profileResearchResult: null,
  };

  let profile = {
    name: 'Vicky S.',
    email: '',
    companyRole: 'Manufacturer',
    businessType: 'Iron & Sheet Metal',
    city: 'Haridwar',
    items: ['MS Sheet', 'HR Coil', 'Copper Wire', 'Diesel', 'Cement OPC'],
    whatsapp: '',
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
    const companyRole = $('#profileBusinessType');
    const industry = $('#profileIndustry');
    const location = $('#profileLocation');
    const turnover = $('#profileTurnover');
    const items = getTrackedItems();

    if (name) profile.name = name.value.trim() || profile.name;
    if (email) profile.email = email.value.trim();
    if (companyRole) profile.companyRole = companyRole.value;
    if (industry) profile.businessType = industry.value;
    if (location) {
      const cityVal = location.value.trim();
      profile.city = cityVal || profile.city;
    }
    if (turnover) profile.turnover = turnover.value;
    profile.items = items;

    const whatsappInput = $('#profileWhatsapp');
    if (whatsappInput) {
      // Strip everything except digits so wa.me gets a clean number.
      profile.whatsapp = whatsappInput.value.replace(/\D/g, '');
    }

    localStorage.setItem('nz_biz_profile', JSON.stringify(profile));
    return profile;
  }

  function populateProfileForm() {
    const name = $('#profileName');
    const email = $('#profileEmail');
    const companyRole = $('#profileBusinessType');
    const industry = $('#profileIndustry');
    const location = $('#profileLocation');
    const turnover = $('#profileTurnover');

    if (name) name.value = profile.name === 'Vicky S.' || profile.name === 'Business Owner' ? '' : profile.name;
    if (email) email.value = profile.email || '';
    if (companyRole && profile.companyRole) companyRole.value = profile.companyRole;
    if (turnover && profile.turnover) turnover.value = profile.turnover;
    const whatsappInput = $('#profileWhatsapp');
    if (whatsappInput) whatsappInput.value = profile.whatsapp || '';

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
    renderTrackedItems(profile.items || []);

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

  function getTrackedItems() {
    return $$('.tag-input .tag-chip')
      .map(chip => chip.dataset.value || chip.firstChild?.textContent?.trim() || '')
      .map(item => item.trim())
      .filter(Boolean);
  }

  function addTrackedItemChip(value) {
    const input = $('.tag-input-field');
    const cleanValue = String(value || '').trim();
    if (!input || !cleanValue) return false;

    const alreadyTracked = getTrackedItems().some(
      item => item.toLowerCase() === cleanValue.toLowerCase()
    );
    if (alreadyTracked) return false;

    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.dataset.value = cleanValue;
    chip.append(document.createTextNode(`${cleanValue} `));

    const removeButton = document.createElement('button');
    removeButton.className = 'tag-remove';
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `Remove ${cleanValue}`);
    removeButton.textContent = '×';

    chip.appendChild(removeButton);
    input.before(chip);
    return true;
  }

  function renderTrackedItems(items) {
    $$('.tag-input .tag-chip').forEach(chip => chip.remove());
    (Array.isArray(items) ? items : []).forEach(addTrackedItemChip);
  }

  function getProfileResearchInput() {
    return {
      name: $('#profileName')?.value.trim() || '',
      city: $('#profileLocation')?.value.trim() || '',
      companyRole: $('#profileBusinessType')?.value || '',
      businessType: $('#profileIndustry')?.value || '',
      items: getTrackedItems(),
    };
  }

  function getProfileResearchKey(input) {
    return [
      input.name,
      input.city,
      input.companyRole,
      input.businessType,
      ...input.items.slice().sort(),
    ]
      .join('|')
      .toLowerCase();
  }

  function setProfileResearchState(state, message) {
    const status = $('#profileResearchStatus');
    const badge = $('#profileResearchBadge');
    const loading = $('#profileResearchLoading');
    const content = $('#profileResearchContent');

    if (status) status.textContent = message;
    if (badge) {
      badge.className = `profile-research-badge${state === 'idle' ? '' : ` ${state}`}`;
      badge.textContent = {
        idle: 'Ready',
        searching: 'Searching',
        found: 'Found',
        error: 'Try again',
      }[state] || 'Ready';
    }
    if (loading) loading.hidden = state !== 'searching';
    if (content && state !== 'found') content.hidden = true;
  }

  function renderProfileResearch(enrichment) {
    const content = $('#profileResearchContent');
    const summary = $('#profileResearchSummary');
    const industry = $('#profileResearchIndustry');
    const location = $('#profileResearchLocation');
    const confidence = $('#profileResearchConfidence');
    const context = $('#profileResearchContext');
    const suggestions = $('#profileSuggestionList');
    const sources = $('#profileResearchSources');
    const applyButton = $('#applyProfileResearch');

    if (!content || !enrichment) return;

    if (summary) {
      summary.textContent =
        enrichment.summary || 'Search complete. Review the suggested profile details below.';
    }
    if (industry) industry.textContent = `Industry: ${enrichment.industry || 'Unconfirmed'}`;
    if (location) {
      location.textContent = `Market: ${enrichment.resolvedLocation || 'Unconfirmed'}`;
    }
    if (confidence) {
      confidence.textContent = `Confidence: ${enrichment.confidence || 'LOW'}`;
    }
    if (context) context.textContent = enrichment.localContext || '';

    clearNode(suggestions);
    (enrichment.suggestedItems || []).forEach(item => {
      suggestions?.appendChild(textEl('span', 'profile-suggestion', item));
    });

    clearNode(sources);
    (enrichment.sources || []).forEach((source, index) => {
      if (!source.url) return;
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title || `Source ${index + 1}`;
      sources?.appendChild(link);
    });
    if (sources && !sources.childElementCount) {
      sources.appendChild(textEl('span', 'form-hint', 'No public source link returned'));
    }

    if (applyButton) {
      applyButton.disabled = !(enrichment.suggestedItems || []).length;
    }

    content.hidden = false;
  }

  function cacheProfileResearch(key, enrichment) {
    try {
      localStorage.setItem(
        'nz_profile_research',
        JSON.stringify({ key, enrichment, savedAt: new Date().toISOString() })
      );
    } catch (error) {
      console.warn('Could not cache profile research:', error);
    }
  }

  function restoreCachedProfileResearch() {
    try {
      const cached = JSON.parse(localStorage.getItem('nz_profile_research') || 'null');
      const currentKey = getProfileResearchKey(getProfileResearchInput());
      if (!cached?.enrichment || cached.key !== currentKey) return false;

      appState.profileResearchKey = currentKey;
      appState.profileResearchResult = cached.enrichment;
      setProfileResearchState('found', 'Previous public business research restored.');
      renderProfileResearch(cached.enrichment);
      return true;
    } catch {
      return false;
    }
  }

  async function researchBusinessProfile({ force = false } = {}) {
    const input = getProfileResearchInput();
    const key = getProfileResearchKey(input);

    if (input.name.length < 2 || input.city.length < 2) {
      appState.profileResearchAbortController?.abort();
      appState.profileResearchAbortController = null;
      setProfileResearchState(
        'idle',
        'Enter a company or owner name and location to begin.'
      );
      return null;
    }

    if (!API_BASE_URL) {
      setProfileResearchState('error', 'Connect the Newszoid API to research this profile.');
      return null;
    }

    if (!force && key === appState.profileResearchKey && appState.profileResearchResult) {
      setProfileResearchState('found', 'Previous public business research restored.');
      renderProfileResearch(appState.profileResearchResult);
      return appState.profileResearchResult;
    }

    appState.profileResearchAbortController?.abort();
    const controller = new AbortController();
    appState.profileResearchAbortController = controller;
    setProfileResearchState(
      'searching',
      `Searching public business and local market information for ${input.name}…`
    );

    const timeout = window.setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${API_BASE_URL}/api/biz-agent/profile/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.enrichment) {
        throw new Error(data.error || `Profile research failed (${response.status})`);
      }

      if (appState.profileResearchAbortController !== controller) return null;

      appState.profileResearchKey = key;
      appState.profileResearchResult = data.enrichment;
      cacheProfileResearch(key, data.enrichment);
      setProfileResearchState(
        'found',
        data.enrichment.confidence === 'LOW'
          ? 'Search complete, but the public match is uncertain. Please review it.'
          : 'Public business match found. Review the location-based suggestions.'
      );
      renderProfileResearch(data.enrichment);
      return data.enrichment;
    } catch (error) {
      window.clearTimeout(timeout);
      if (
        error.name === 'AbortError' &&
        appState.profileResearchAbortController !== controller
      ) {
        return null;
      }
      console.warn('Profile research unavailable:', error);
      setProfileResearchState(
        'error',
        error.name === 'AbortError'
          ? 'The search took too long. Editing the details will retry it.'
          : 'Automatic research is temporarily unavailable. Editing the details will retry it.'
      );
      return null;
    }
  }

  function scheduleProfileResearch(delay = 1100) {
    window.clearTimeout(appState.profileResearchTimer);
    appState.profileResearchTimer = window.setTimeout(
      () => researchBusinessProfile(),
      delay
    );
  }

  function applyProfileResearch() {
    const enrichment = appState.profileResearchResult;
    if (!enrichment) return;

    let added = 0;
    (enrichment.suggestedItems || []).forEach(item => {
      if (addTrackedItemChip(item)) added += 1;
    });

    const location = $('#profileLocation');
    if (
      location &&
      enrichment.resolvedLocation &&
      ['HIGH', 'MEDIUM'].includes(enrichment.confidence)
    ) {
      location.value = enrichment.resolvedLocation;
    }

    const industry = $('#profileIndustry');
    if (industry && enrichment.industry) {
      const matchingOption = Array.from(industry.options).find(
        option => option.value.toLowerCase() === enrichment.industry.toLowerCase()
      );
      if (matchingOption) industry.value = matchingOption.value;
    }

    showToast(
      added
        ? `${added} relevant item${added === 1 ? '' : 's'} added. Review and save your profile.`
        : 'Suggestions are already in your tracked materials.'
    );
  }

  function setupProfileResearch() {
    ['#profileName', '#profileLocation'].forEach(selector => {
      $(selector)?.addEventListener('input', () => scheduleProfileResearch());
    });
    ['#profileBusinessType', '#profileIndustry'].forEach(selector => {
      $(selector)?.addEventListener('change', () => scheduleProfileResearch(300));
    });
    $('#applyProfileResearch')?.addEventListener('click', applyProfileResearch);

    if (!restoreCachedProfileResearch()) {
      scheduleProfileResearch(350);
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
  let rssRefreshTask = null;

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

  // Skeleton-style retry state: keeps the loading look (no harsh ⚠️ error)
  // and offers a Retry that re-runs the given loader. Used in place of
  // showErrorState for live data areas so users see a skeleton, per UX fix.
  function showSkeletonWithRetry(container, message, retryFn) {
    if (!container) return;
    clearNode(container);

    const wrap = document.createElement('div');
    wrap.className = 'skeleton-retry-state';
    wrap.style.cssText = 'text-align:center; padding: var(--space-4); color: var(--color-text-muted);';

    // Show multiple skeleton shimmer rows to look like loading content
    for (let i = 0; i < 3; i++) {
      const shimmer = document.createElement('div');
      shimmer.className = 'skeleton skeleton-block';
      shimmer.style.cssText = 'height: 56px; margin-bottom: var(--space-3); border-radius: var(--radius-sm);';
      wrap.appendChild(shimmer);
    }

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size: 0.8rem; font-weight: 500; color: var(--color-text-secondary); margin-bottom: var(--space-2);';
    msg.textContent = message;
    wrap.appendChild(msg);

    container.appendChild(wrap);
  }

  // Wrap an async loader so that on failure it auto-retries (keeping the
  // skeleton on screen). Returns the loader's resolved value or [] / null
  // after all attempts are exhausted.
  async function withRetry(loaderFn, { retries = 1, delay = 1500 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const value = await loaderFn();
        return value;
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        if (attempt >= retries) throw err;
        console.warn(`Retrying after error (attempt ${attempt + 1}/${retries + 1}):`, err.message);
        await new Promise(r => setTimeout(r, delay));
      }
    }
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

    // Preserve the LIVE history series from the backend so charts/stats
    // show REAL tracked prices instead of simulated/fake data.
    const history = Array.isArray(raw.history)
      ? raw.history
          .map(point => ({
            date: point.date || point.snapshotDate || '',
            rate: Number(point.price ?? point.rate ?? point.currentPrice ?? 0),
            delta: Number(point.delta ?? 0),
            pct: Number(point.deltaPercent ?? point.pct ?? 0),
            source: point.sourceName || '',
          }))
          .filter(point => Number.isFinite(point.rate) && point.rate > 0)
      : [];

    return {
      material: raw.material || raw.item || raw.itemName || 'Material',
      rate: Number(raw.rate ?? raw.currentPrice ?? raw.price ?? 0),
      change,
      pct,
      trend,
      market: raw.market || raw.location || profile.city,
      unit: raw.unit || '',
      // Live data provenance
      confidence: raw.confidence || '',
      sourceName: raw.sourceName || raw.source || '',
      sourceUrl: raw.sourceUrl || '',
      sourceDate: raw.sourceDate || '',
      sourceVerified: raw.sourceVerified === true,
      // A source URL alone is not proof. Only the backend's server-side page
      // verification may turn on the verified marker.
      verified: raw.sourceVerified === true && raw.verified === true,
      fetchedAt: raw.fetchedAt || '',
      // Real history points (oldest -> newest)
      history,
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

    // Sparkline from REAL history. If only one snapshot exists, draw a
    // flat marker instead of a fake trend.
    const spark = document.createElement('div');
    spark.className = 'price-sparkline';

    const chartData = buildHistoryData(rate);
    const W = 120, H = 36;

    if (chartData.length >= 2) {
      const ratesArr = chartData.map(d => d.rate);
      const minR = Math.min(...ratesArr);
      const maxR = Math.max(...ratesArr);
      const rangeR = maxR - minR || 1;
      const lastIdx = chartData.length - 1;

      const pts = chartData.map((d, i) => {
        const x = Math.round((i / lastIdx) * W);
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
    } else {
      // Single live point — no fabricated trend.
      spark.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="${sparkColor}" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.5"/>
        <circle cx="${W-2}" cy="${H/2}" r="2.5" fill="${sparkColor}"/>
      </svg>`;
    }

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

  // Returns the REAL history series for a rate (oldest -> newest).
  // No simulation, no random data. If only the current live price exists
  // (no tracked history yet), it returns a single point so the UI shows
  // the live value rather than a fabricated trend.
  function buildHistoryData(rate) {
    if (!rate) return [];

    // Prefer the live history array carried from the backend.
    if (Array.isArray(rate.history) && rate.history.length) {
      const points = rate.history.map(point => ({
        date: point.date || '',
        rate: Number(point.rate),
        source: point.source || '',
      })).filter(p => Number.isFinite(p.rate) && p.rate > 0);

      if (points.length) {
        // Make sure the most recent point matches the current live rate.
        points[points.length - 1].rate = rate.rate;
        return points;
      }
    }

    // No tracked history yet — show ONLY the current live point. Do NOT
    // fabricate a fake 7-day curve.
    const today = new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    return rate.rate > 0 ? [{ date: today, rate: rate.rate, source: rate.sourceName || '' }] : [];
  }

  // Backward-compatible alias kept for any callers; delegates to real data.
  function generate7DayData(rate) {
    return buildHistoryData(rate);
  }

  function renderDynamicChart(rate) {
    const chartPlaceholder = $('.chart-placeholder');
    if (!chartPlaceholder) return;

    const data = buildHistoryData(rate);

    // Not enough live history to draw a trend line.
    if (!data.length) {
      chartPlaceholder.innerHTML = `<div style="text-align:center; padding: var(--space-5); color: var(--color-text-muted); font-size: 0.8rem;">No tracked history yet. Live price will appear once more snapshots are saved.</div>`;
      return;
    }
    if (data.length === 1) {
      chartPlaceholder.innerHTML = `<div style="text-align:center; padding: var(--space-5); color: var(--color-text-muted); font-size: 0.8rem;">First live snapshot: <strong style="color: var(--color-text-primary)">${formatMoney(data[0].rate)}</strong> on ${data[0].date}.<br>Trend chart builds as more daily snapshots are saved.</div>`;
      return;
    }

    const direction = rateDirection(rate);
    const strokeColor = direction === 'up' ? '#10B981' : direction === 'down' ? '#EF4444' : '#6B7280';

    const rates = data.map(d => d.rate);
    const minRate = Math.min(...rates);
    const maxRate = Math.max(...rates);
    const range = maxRate - minRate || 1;
    const last = data.length - 1;

    // Map rates to SVG Y coordinates (10 top to 110 bottom); X scales to count.
    const svgPoints = data.map((d, i) => {
      const x = Math.round((i / last) * 400);
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
        ${svgPoints.map((pt) => {
          const [cx, cy] = pt.split(',');
          return `<circle cx="${cx}" cy="${cy}" r="3" fill="${strokeColor}" stroke="#0D1321" stroke-width="1.5"/>`;
        }).join('')}
      </svg>
      <div class="chart-labels">
        ${data.filter((_, i) => i % 2 === 0 || i === last).map(d => `<span>${d.date}</span>`).join('')}
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

    // Update stats from REAL history (no fabricated data).
    const dataHist = buildHistoryData(rate);
    const ratesHist = dataHist.map(d => d.rate);
    const statValues = $$('.material-stats .stat-value');

    if (ratesHist.length >= 2) {
      const high = Math.max(...ratesHist);
      const low = Math.min(...ratesHist);
      const volatility = low > 0 ? ((high - low) / low * 100).toFixed(1) : '0.0';
      if (statValues[0]) statValues[0].textContent = formatMoney(high);
      if (statValues[1]) statValues[1].textContent = formatMoney(low);
      if (statValues[2]) statValues[2].textContent = `${volatility}%`;
    } else {
      // Not enough tracked history yet — be honest, don't fake numbers.
      if (statValues[0]) statValues[0].textContent = '—';
      if (statValues[1]) statValues[1].textContent = '—';
      if (statValues[2]) statValues[2].textContent = '—';
    }

    // Render dynamic chart from real history
    renderDynamicChart(rate);
    // Show the saved alert target for this material (if any).
    refreshPriceAlertStatus(rate.material);
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

    // Briefing skeletons
    const briefingContainer = $('#briefing-container');
    if (briefingContainer) {
      clearNode(briefingContainer);
      for (let i = 0; i < 3; i++) {
        const item = document.createElement('div');
        item.className = 'skeleton-news-item';
        item.innerHTML = `
          <div class="skeleton-row"><div class="skeleton skeleton-circle"></div><div class="skeleton skeleton-text md"></div><div class="skeleton skeleton-text sm"></div></div>
          <div class="skeleton skeleton-headline"></div>
          <div class="skeleton skeleton-body short"></div>`;
        briefingContainer.appendChild(item);
      }
    }

    // Alerts and Opportunities skeletons
    const alertsContainer = $('#alerts-container');
    if (alertsContainer) {
      clearNode(alertsContainer);
      for (let i = 0; i < 2; i++) {
        const item = document.createElement('div');
        item.className = 'skeleton-news-item';
        item.innerHTML = `
          <div class="skeleton-row"><div class="skeleton skeleton-text md"></div><div class="skeleton skeleton-text sm"></div></div>
          <div class="skeleton skeleton-headline"></div>`;
        alertsContainer.appendChild(item);
      }
    }

    const oppContainer = $('#opportunities-container');
    if (oppContainer) {
      clearNode(oppContainer);
      for (let i = 0; i < 2; i++) {
        const item = document.createElement('div');
        item.className = 'skeleton-news-item';
        item.innerHTML = `
          <div class="skeleton-row"><div class="skeleton skeleton-text md"></div><div class="skeleton skeleton-text sm"></div></div>
          <div class="skeleton skeleton-headline"></div>`;
        oppContainer.appendChild(item);
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

    // Market list skeletons
    const materialList = $('.material-list');
    if (materialList) {
      clearNode(materialList);
      for (let i = 0; i < 4; i++) {
        const row = document.createElement('div');
        row.className = 'skeleton-price-row';
        row.style.padding = '12px 16px';
        row.style.borderBottom = '1px solid var(--color-border-subtle)';
        row.innerHTML = `
          <div class="skeleton-price-info"><div class="skeleton skeleton-text md"></div><div class="skeleton skeleton-text sm" style="margin-top:4px"></div></div>
          <div class="skeleton skeleton-price-value"></div>`;
        materialList.appendChild(row);
      }
    }

    // Material detail skeleton
    const materialDetail = $('#material-detail');
    if (materialDetail) {
      const header = materialDetail.querySelector('.material-header');
      if (header) header.innerHTML = `
        <div class="material-info">
          <div class="skeleton skeleton-text lg" style="margin-bottom:8px"></div>
          <div class="skeleton skeleton-text sm"></div>
        </div>
        <div class="material-price-block">
          <div class="skeleton skeleton-text md" style="height:28px"></div>
        </div>`;
      const chart = materialDetail.querySelector('.chart-placeholder');
      if (chart) chart.innerHTML = '<div class="skeleton skeleton-block" style="height: 120px; border-radius: 8px; width: 100%;"></div>';
    }
  }

  // Unified dashboard loader: begins cache-backed rate/news refreshes in
  // parallel and independently asks the brief endpoint for RSS guidance.
  //
  // SELF-CONTAINED: Each loader has its own fallback chain:
  //   loadRates: Backend API → localStorage cache → skeletons
  //   loadNews:  Backend API → Google News RSS → localStorage cache → skeletons
  // So the site always shows real data even if the backend is completely down.
  async function loadDashboardData() {
    // Each loader renders its localStorage cache before its first await, so
    // stale content is never replaced by a blank screen during refresh.
    const briefTask = loadBrief(profile);
    const ratesTask = loadRatesWithFallback(profile);
    const newsTask = loadNewsWithFallback(profile);

    const briefState = await briefTask;
    const rssPriorityTask = briefState.suggestRssFallback
      ? refreshNewsFromRss(profile)
      : Promise.resolve(false);

    await Promise.allSettled([ratesTask, newsTask, rssPriorityTask]);
  }

  async function loadBrief(profile) {
    if (!API_BASE_URL) return { suggestRssFallback: false };

    const cachedRates = getRatesCache();
    const cachedNews = getNewsCache();
    const briefProfile = {
      ...profile,
      currentRates: appState.currentRates.length ? appState.currentRates : (cachedRates?.rates || []),
      recentNews: currentNewsData.length ? currentNewsData : (cachedNews?.items || []),
    };

    try {
      const briefData = await fetchWithTimeout(`${API_BASE_URL}/api/brief`, briefProfile, 8000);
      if (briefData?.brief) {
        const briefing = $('#briefing-container');
        if (briefing) {
          // /api/brief sanitizes this small HTML allowlist before returning it.
          briefing.innerHTML = briefData.brief;
          briefing.dataset.aiLoaded = 'true';
        }
      }
      return {
        suggestRssFallback: Boolean(briefData?.bothAiFailed || briefData?.suggestRssFallback),
      };
    } catch (error) {
      console.warn('[Brief] API failed:', error.message);
      return { suggestRssFallback: false };
    }
  }

  // Manual retry — re-runs the full fallback chain for both rates and news.
  // Bound to the "↻ Refresh now" button in the header. Replaces the old
  // 30s auto-retry loop with an explicit, user-triggered refresh.
  async function retryAllData() {
    const btn = $('#nzRetryBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Refreshing…';
    }
    try {
      await loadDashboardData();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '↻ Refresh now';
      }
    }
  }

  // ── Unified fetch-with-fallback logic (V2) ──
  function safeStorage(action, key, value = null) {
    try {
      if (action === 'set') {
        localStorage.setItem(key, JSON.stringify(value));
      } else if (action === 'get') {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } else if (action === 'remove') {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('safeStorage failed:', e);
      return null;
    }
  }

  async function fetchWithTimeout(url, body, ms = 6000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
      const opts = body
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal }
        : { signal: controller.signal };
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function renderStaleLabel(cachedAt, warning = false, expired = false) {
    const mins = Math.round((Date.now() - cachedAt) / 60000);
    const timeStr = mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
    if (expired) return `⚠️ Data may be outdated (last updated ${timeStr}) — tap refresh`;
    if (warning) return `Showing cached data from ${timeStr} — reconnecting…`;
    return `Updated ${timeStr}`;
  }

  // ── Rate caching helpers ──
  function cacheRates(rates) {
    const verifiedRates = (Array.isArray(rates) ? rates : []).filter(
      rate => rate.sourceVerified === true && rate.verified === true
    );
    safeStorage('set', 'nz_rates_cache', { rates: verifiedRates, savedAt: Date.now() });
  }

  function getRatesCache() {
    // Keep the previous key as a one-time read migration for existing users.
    const cached = safeStorage('get', 'nz_rates_cache') || safeStorage('get', 'nz_rates_v2');
    if (!cached?.rates?.length) return null;

    const verifiedRates = cached.rates.filter(
      rate => rate?.sourceVerified === true && rate?.verified === true
    );
    return verifiedRates.length ? { ...cached, rates: verifiedRates } : null;
  }

  async function loadRatesWithFallback(profile) {
    let rates = [];
    const cached = getRatesCache();
    if (cached?.rates?.length) {
      renderRatesUI(cached.rates, { stale: true, cachedAt: cached.savedAt });
    }

    if (API_BASE_URL) {
      try {
        const backendRates = await fetchWithTimeout(`${API_BASE_URL}/api/biz-agent/rates`, profile, 12000);
        if (backendRates?.rates?.length) {
          rates = backendRates.rates.map(normalizeRate);
          cacheRates(rates);
          renderRatesUI(rates);
          return;
        }
      } catch (e) {
        console.log('[Rates] Backend failed:', e.message);
      }
    }

    const cacheAgeHours = cached ? (Date.now() - cached.savedAt) / 3600000 : Infinity;
    if (cached?.rates?.length && cacheAgeHours < 24) {
      renderRatesUI(cached.rates, {
        stale: true,
        cachedAt: cached.savedAt,
        warning: true,
      });
    } else if (cached?.rates?.length) {
      renderRatesUI(cached.rates, {
        stale: true,
        cachedAt: cached.savedAt,
        warning: true,
        expired: true,
      });
    } else {
      showSkeletonWithRetry($('#price-container'), 'Waiting for live prices…', () => loadRatesWithFallback(profile));
      showSkeletonWithRetry($('#material-detail'), 'Waiting for market detail…', () => loadRatesWithFallback(profile));
      showSkeletonWithRetry($('.material-list'), 'Waiting for materials…', () => loadRatesWithFallback(profile));
      const countEl = $('.material-count');
      if (countEl) countEl.textContent = '0 items tracked';
      updateFreshness(false);
    }
  }

  function renderRatesUI(rates, state = {}) {
    const options = typeof state === 'boolean' ? { stale: state } : state;
    const { stale = false, cachedAt, warning = false, expired = false } = options;
    appState.currentRates = rates;
    renderPriceTable(rates);
    renderMarketList(rates);
    setActiveRate(rates[0]);
    updatePulseStrip(rates);

    if (!stale) {
      updateFreshness(true);
    } else {
      updateFreshness(false);
    }

    const header = document.querySelector('.rates-header');
    if (header) {
      let badge = header.querySelector('.stale-label');
      if (stale) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'stale-label';
          header.appendChild(badge);
        }
        badge.classList.toggle('warning', warning || expired);
        badge.textContent = cachedAt
          ? renderStaleLabel(cachedAt, warning, expired)
          : 'Showing cached rates - reconnecting...';
      } else if (badge) {
        badge.remove();
      }
    }
    
    // Evaluate price alerts against the freshly-loaded rates.
    checkPriceAlerts(rates);
    refreshPriceAlertStatus(rates[0]?.material);
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
    askBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline></svg> Ask Newszoid Intelligence';
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
    
    let filtered = currentNewsData || [];
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

  // ── News caching helpers ──
  function cacheNews(items) {
    safeStorage('set', 'nz_news_cache', { items, savedAt: Date.now() });
  }

  function getNewsCache() {
    // Keep the previous key as a one-time read migration for existing users.
    return safeStorage('get', 'nz_news_cache') || safeStorage('get', 'nz_news_v2');
  }

  // ── Self-Hosted RSS News Fetcher ──
  // Calls our OWN backend's /api/news-proxy, which fetches Google News RSS
  // server-side, parses the XML, and sanitizes it. Replaces the old
  // rss2json.com third-party dependency.
  async function fetchGoogleNewsRSS(profile) {
    if (!API_BASE_URL) return [];
    try {
      const params = new URLSearchParams({
        industry: profile.businessType || '',
        city: profile.city || '',
        materials: (profile.items || []).join(' '),
      });
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      let response;
      try {
        response = await fetch(`${API_BASE_URL}/api/news-proxy?${params.toString()}`, {
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.news) && data.news.length) {
          return data.news.map(normalizeRssItem);
        }
      }
    } catch (proxyErr) {
      console.warn('[news] Self-hosted RSS proxy unavailable:', proxyErr.message);
    }
    return [];
  }

  // Normalizes a /api/news-proxy item into the exact shape the dashboard uses.
  // The proxy already classifies + sanitizes; this just guarantees field names.
  function normalizeRssItem(item) {
    const title = (item.headline || item.title || '').trim();
    const sourceName = item.source || 'Google News';
    const pubDate = item.time || item.pubDate || '';
    return {
      headline: title,
      summary: item.summary || title,
      category: item.category || classifyNewsCategory(title),
      impact: item.impact || classifyNewsImpact(title),
      sentiment: item.sentiment || classifyNewsSentiment(title),
      signal: item.signal || `Read more from ${sourceName}`,
      source: pubDate
        ? `${sourceName} (${new Date(pubDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })})`
        : sourceName,
      relevantItem: item.relevantItem || findRelevantItem(title),
      url: item.url || item.link || '',
    };
  }

  // ── News auto-classification helpers ──
  function classifyNewsCategory(text) {
    const t = text.toLowerCase();
    if (/price|cost|rate|₹|rupee|tariff|duty|hike|drop|surge/.test(t)) return 'PRICE';
    if (/policy|gst|tax|regulation|government|ministry|circular|budget/.test(t)) return 'POLICY';
    if (/trade|import|export|dumping|shipment|customs/.test(t)) return 'TRADE';
    if (/demand|infrastructure|project|construction|road|highway|housing/.test(t)) return 'DEMAND';
    return 'INDUSTRY';
  }
  function classifyNewsImpact(text) {
    const t = text.toLowerCase();
    if (/surge|spike|crash|ban|crisis|alert|critical|emergency|record/.test(t)) return 'HIGH';
    if (/drop|rise|change|update|new|plan|announce/.test(t)) return 'MEDIUM';
    return 'LOW';
  }
  function classifyNewsSentiment(text) {
    const t = text.toLowerCase();
    if (/drop|crash|decline|fall|risk|ban|negative|concern|worry|slump/.test(t)) return 'BEARISH';
    if (/rise|grow|boost|opportunity|positive|expansion|invest|record high/.test(t)) return 'BULLISH';
    return 'WATCH';
  }
  function findRelevantItem(text) {
    const t = text.toLowerCase();
    const items = profile.items || [];
    const matches = items.filter(item => t.includes(item.toLowerCase()));
    return matches.length ? matches.join(', ') : 'General';
  }

  function refreshNewsFromRss(profile) {
    if (rssRefreshTask) return rssRefreshTask;

    rssRefreshTask = (async () => {
      try {
        const proxyNews = await fetchGoogleNewsRSS(profile);
        if (!proxyNews.length) return false;
        cacheNews(proxyNews);
        renderNewsUI(proxyNews);
        return true;
      } catch (error) {
        console.log('[News] RSS proxy failed:', error.message);
        return false;
      } finally {
        rssRefreshTask = null;
      }
    })();

    return rssRefreshTask;
  }

  async function loadNewsWithFallback(profile) {
    const cached = getNewsCache();
    if (cached?.items?.length) {
      renderNewsUI(cached.items, { stale: true, cachedAt: cached.savedAt });
    }

    if (API_BASE_URL) {
      try {
        const backendNews = await fetchWithTimeout(`${API_BASE_URL}/api/biz-agent/news`, profile, 6000);
        if (backendNews?.news?.length) {
          cacheNews(backendNews.news);
          renderNewsUI(backendNews.news);
          return;
        }
      } catch (e) {
        console.log('[News] Backend failed:', e.message);
      }
    }

    if (await refreshNewsFromRss(profile)) return;

    if (cached?.items?.length) {
      renderNewsUI(cached.items, {
        stale: true,
        cachedAt: cached.savedAt,
        warning: true,
      });
    } else {
      showSkeletonWithRetry($('#news-container'), 'Waiting for live news…', () => loadNewsWithFallback(profile));
      showSkeletonWithRetry($('#briefing-container'), 'Waiting for briefing…', () => loadNewsWithFallback(profile));
      showSkeletonWithRetry($('#alerts-feed'), 'Waiting for alerts…', () => loadNewsWithFallback(profile));
      showSkeletonWithRetry($('.intelligence-feed'), 'Waiting for intelligence…', () => loadNewsWithFallback(profile));
    }
  }

  function renderNewsUI(news, state = {}) {
    if (!news || !news.length) return;
    const options = typeof state === 'boolean' ? { stale: state } : state;
    const { stale = false, cachedAt, warning = false, expired = false } = options;
    currentNewsData = news;
    renderDashboardNews(news);
    applyIntelligenceFilter();
    renderAlertSignals(news);
    renderAlertsView(news);
    updateAiContext(news);
    renderBriefing(news);
    updateLiveMetrics(news);

    const feedHeader = document.querySelector('.news-feed-header');
    if (feedHeader) {
      let badge = feedHeader.querySelector('.stale-label');
      if (stale) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'stale-label';
          feedHeader.appendChild(badge);
        }
        badge.classList.toggle('warning', warning || expired);
        badge.textContent = cachedAt
          ? renderStaleLabel(cachedAt, warning, expired)
          : 'Showing cached news - reconnecting...';
      } else if (badge) {
        badge.remove();
      }
    }
  }

  // ── Update all UI counters/badges/notifications from live data ──
  function updateLiveMetrics(news) {
    if (!Array.isArray(news) || !news.length) return;

    // 1. Notification badges — count HIGH impact items
    const highAlerts = news.filter(n => n.impact === 'HIGH' || n.sentiment === 'BEARISH');
    const badgeCount = highAlerts.length;
    $$('.notif-badge, .nav-badge, .mobile-badge').forEach(badge => {
      badge.textContent = badgeCount > 0 ? String(badgeCount) : '';
      badge.style.display = badgeCount > 0 ? '' : 'none';
    });

    // 2. Notification dropdown — populate from real alerts
    const dropdownBody = document.querySelector('#notifDropdown .dropdown-body');
    if (dropdownBody) {
      clearNode(dropdownBody);
      const notifItems = highAlerts.slice(0, 5);
      if (!notifItems.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding: 24px 16px; text-align: center; color: var(--color-text-muted); font-size: 0.85rem;';
        empty.textContent = 'No new alerts right now.';
        dropdownBody.appendChild(empty);
      } else {
        notifItems.forEach(item => {
          const notif = document.createElement('div');
          notif.className = `notif-item notif-${item.impact === 'HIGH' ? 'high' : 'medium'}`;

          const dot = document.createElement('div');
          dot.className = 'notif-dot';

          const content = document.createElement('div');
          content.className = 'notif-content';
          content.appendChild(textEl('div', 'notif-title', item.headline || 'Alert'));
          content.appendChild(textEl('div', 'notif-desc', item.signal || item.summary || ''));
          content.appendChild(textEl('div', 'notif-time', item.source || 'Now'));

          notif.append(dot, content);
          dropdownBody.appendChild(notif);
        });
      }
    }

    // 3. Alert summary badges — count from real categories
    const alertSummary = document.querySelector('.alert-summary');
    if (alertSummary) {
      clearNode(alertSummary);
      const highCount = news.filter(n => n.impact === 'HIGH').length;
      const medCount = news.filter(n => n.impact === 'MEDIUM').length;
      const infoCount = news.filter(n => n.sentiment === 'BULLISH').length;

      if (highCount) alertSummary.appendChild(textEl('span', 'summary-badge high', `🔴 ${highCount} High`));
      if (medCount) alertSummary.appendChild(textEl('span', 'summary-badge medium', `🟡 ${medCount} Med`));
      if (infoCount) alertSummary.appendChild(textEl('span', 'summary-badge info', `🟢 ${infoCount} Info`));
      if (!highCount && !medCount && !infoCount) {
        alertSummary.appendChild(textEl('span', 'summary-badge info', '🟢 No alerts'));
      }
    }

    // 4. Source count
    const sourceCount = document.querySelector('.source-count');
    if (sourceCount) {
      sourceCount.textContent = `${news.length} sources analyzed`;
    }

    // 5. Opportunity count
    const oppCount = document.querySelector('.opportunity-count');
    if (oppCount) {
      const signals = news.filter(n => n.sentiment === 'BULLISH').length;
      oppCount.textContent = `${signals} signal${signals !== 1 ? 's' : ''} detected today`;
    }
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

  // OFFLINE FALLBACK — used ONLY when the live AI backend is unreachable.
  // IMPORTANT: this must NEVER invent prices or numbers. It may only echo
  // data that is already visible on the screen (loaded from the live API),
  // otherwise it says it cannot answer and tells the user to retry. No
  // hardcoded briefings, no fabricated rates.
  function localAiAnswer(question) {
    const q = String(question || '').toLowerCase();
    const { prices } = getMarketContext();

    // Real, on-screen prices only (no fabrication).
    const livePrices = prices.filter(p => p && p.name && p.value);

    const matchedMaterial = livePrices.find(p => {
      const name = (p.name || '').toLowerCase();
      return q.includes(name) || name.split(/\s+/).some(word => word.length > 2 && q.includes(word));
    });

    // Price / rate / cost question — answer ONLY if we have a real on-screen price.
    if (/price|rate|cost|kitn|kitna|dam|kya bhav/.test(q)) {
      if (matchedMaterial) {
        return `${matchedMaterial.name}: ${matchedMaterial.value} (${matchedMaterial.change || 'stable'}) — shown on your dashboard. Tap Retry for the latest live quote.`;
      }
      if (livePrices.length) {
        const top = livePrices[0];
        return `${top.name}: ${top.value} (${top.change || 'stable'}) is on your dashboard. Tap Retry for live rates.`;
      }
      return 'Live rate data is unavailable right now. Tap Retry — I will fetch the current price as soon as the connection is back.';
    }

    return 'I am offline right now and cannot reach live market data. Please tap Retry in a moment — I will answer your question with current data.';
  }

  async function askBackend(question, signal) {
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
      // Keep the prompt minimal — the backend enforces brevity strictly.
      // We only pass profile + question + context so Gemini Search can find
      // live data. The backend's system prompt controls length/format.
      prompt: `${personaContext} User runs a ${profile.businessType} in ${profile.city}, India. Question: "${question}". Answer with live, current data (prices/rates with units). Be specific and numeric.`,
    };

    try {
      return await withRetry(async () => {
        if (signal?.aborted) {
          const abortError = new Error('Advisor request aborted');
          abortError.name = 'AbortError';
          throw abortError;
        }

        const controller = new AbortController();
        let timedOut = false;
        const timeout = window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, 30000);
        const abortRequest = () => controller.abort();
        signal?.addEventListener('abort', abortRequest, { once: true });

        try {
          const response = await fetch(`${API_BASE_URL}/api/biz-agent/analyst`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          if (!response.ok) throw new Error(`Analyst API ${response.status}`);
          const data = await response.json();
          const text = data.analysis || data.answer || null;
          if (!text) throw new Error('Analyst API empty response');
          return text;
        } catch (error) {
          if (timedOut && !signal?.aborted) {
            throw new Error('Analyst request timed out');
          }
          throw error;
        } finally {
          window.clearTimeout(timeout);
          signal?.removeEventListener('abort', abortRequest);
        }
      }, { retries: 1, delay: 2000 });
    } catch (error) {
      if (error?.name === 'AbortError') return null;
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
    pill.textContent = isBackend ? 'Powered by Newszoid Intelligence + Web Search' : 'Powered by Local Context';
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
    disclaimer.textContent = 'Newszoid Intelligence analysis • Not financial advice • Verify before acting';
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
      askBackend(trimmed, abortController.signal),
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

    $('.tag-input')?.addEventListener('click', event => {
      const removeButton = event.target.closest('.tag-remove');
      if (!removeButton) return;
      removeButton.closest('.tag-chip')?.remove();
      scheduleProfileResearch(500);
    });

    $('.tag-input-field')?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const value = event.currentTarget.value.trim();
      if (!value) return;

      if (addTrackedItemChip(value)) {
        event.currentTarget.value = '';
        scheduleProfileResearch(500);
      } else {
        showToast('That material is already being tracked.');
      }
    });
  }

  // ── Price Alert system (range-based, WhatsApp auto-notify) ──
  // Each alert: { material, lower, upper, setAt, breachUpper, breachLower, lastNotified }
  // breach flags make notifications ONE-SHOT per crossing (won't spam).

  function getPriceAlerts() {
    try {
      return JSON.parse(localStorage.getItem('nz_price_alerts') || '[]');
    } catch {
      return [];
    }
  }

  function savePriceAlerts(alerts) {
    localStorage.setItem('nz_price_alerts', JSON.stringify(alerts));
  }

  // Normalize a WhatsApp number: digits only, default to India (+91) if 10 digits.
  function normalizeWaNumber(raw) {
    let n = String(raw || '').replace(/\D/g, '');
    if (!n) return '';
    if (n.length === 10) n = '91' + n; // assume India
    return n;
  }

  function promptForPriceRange(material, currentPrice, existing) {
    return new Promise((resolve) => {
      const cur = currentPrice > 0 ? formatMoney(currentPrice) : 'n/a';
      const defUpper = existing?.upper || (currentPrice > 0 ? Math.round(currentPrice * 1.03) : '');
      const defLower = existing?.lower || (currentPrice > 0 ? Math.round(currentPrice * 0.97) : '');

      const modal = $('#price-alert-modal');
      const upperInput = $('#alert-upper-input');
      const lowerInput = $('#alert-lower-input');
      const cancelBtn = $('#cancel-alert-btn');
      const saveBtn = $('#save-alert-btn');
      const closeBtn = $('#close-alert-modal');

      $('#alert-modal-material').textContent = material;
      $('#alert-modal-current').textContent = cur;
      
      upperInput.value = defUpper || '';
      lowerInput.value = defLower || '';

      modal.classList.remove('hidden');

      function close(result) {
        modal.classList.add('hidden');
        cleanup();
        resolve(result);
      }

      function handleSave() {
        const upperRaw = upperInput.value;
        const lowerRaw = lowerInput.value;
        const upper = upperRaw.trim() === '' ? null : Number(upperRaw.replace(/[^0-9.]/g, ''));
        const lower = lowerRaw.trim() === '' ? null : Number(lowerRaw.replace(/[^0-9.]/g, ''));

        if (upper === null && lower === null) {
          showToast('Please enter at least one price limit.');
          return;
        }
        if (upper !== null && lower !== null && upper <= lower) {
          showToast('Upper limit must be greater than lower limit.');
          return;
        }
        if ((upper !== null && (!Number.isFinite(upper) || upper <= 0)) ||
            (lower !== null && (!Number.isFinite(lower) || lower <= 0))) {
          showToast('Please enter valid price amounts.');
          return;
        }

        close({ upper, lower });
      }

      const onCancel = () => close(null);
      const onSave = () => handleSave();

      function cleanup() {
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onCancel);
        saveBtn.removeEventListener('click', onSave);
      }

      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      saveBtn.addEventListener('click', onSave);
    });
  }

  function upsertPriceAlert(material, range) {
    const alerts = getPriceAlerts();
    const idx = alerts.findIndex(a => a.material === material);
    const entry = {
      material,
      upper: range.upper,
      lower: range.lower,
      setAt: new Date().toISOString(),
      breachUpper: false,
      breachLower: false,
      lastNotified: null,
    };
    if (idx >= 0) alerts[idx] = entry;
    else alerts.push(entry);
    savePriceAlerts(alerts);
    return entry;
  }

  function removePriceAlert(material) {
    const alerts = getPriceAlerts().filter(a => a.material !== material);
    savePriceAlerts(alerts);
  }

  // Update the small "Alert" stat in the Markets detail card.
  function refreshPriceAlertStatus(material) {
    const statusEl = $('#price-alert-status');
    if (!statusEl) return;
    const alert = getPriceAlerts().find(a => a.material === material);
    if (alert) {
      const parts = [];
      if (alert.upper != null) parts.push(`↑ ${formatMoney(alert.upper)}`);
      if (alert.lower != null) parts.push(`↓ ${formatMoney(alert.lower)}`);
      const hit = alert.breachUpper || alert.breachLower;
      statusEl.textContent = (parts.join(' / ') || 'Set') + (hit ? ' • HIT' : '');
      statusEl.style.color = hit ? 'var(--color-success, #10B981)' : '';
    } else {
      statusEl.textContent = 'Not set';
      statusEl.style.color = '';
    }
  }

  // Price alerts are always shown in the app. Automatic WhatsApp delivery is
  // intentionally disabled in the public browser until an authenticated,
  // opt-in subscription service is configured on the server.
  function sendWhatsAppAlert({ alert, rate, direction }) {
    const waNumber = normalizeWaNumber(profile.whatsapp);
    if (!waNumber) return false;
    console.info('[WhatsApp] Automatic delivery is not enabled for this browser session.', {
      material: alert.material,
      rate: rate.rate,
      direction,
    });
    showToast('Price alert detected. Automatic WhatsApp delivery is not enabled yet.');
    return false;
  }

  // Check every saved alert against the freshly-loaded LIVE rates.
  // Fires an in-app toast when a bound is newly crossed (one-shot per
  // crossing; resets when price re-enters range).
  function checkPriceAlerts(liveRates) {
    if (!Array.isArray(liveRates) || !liveRates.length) return;
    const alerts = getPriceAlerts();
    if (!alerts.length) return;

    let changed = false;

    alerts.forEach(alert => {
      const match = liveRates.find(r => r.material === alert.material);
      if (!match || match.rate <= 0) return;

      const aboveUpper = alert.upper != null && match.rate >= alert.upper;
      const belowLower = alert.lower != null && match.rate <= alert.lower;

      // Upper bound newly crossed → notify once.
      if (aboveUpper && !alert.breachUpper) {
        alert.breachUpper = true;
        alert.lastNotified = new Date().toISOString();
        changed = true;
        showToast(`📈 ${alert.material} rose to ${formatMoney(match.rate)} (limit ${formatMoney(alert.upper)})`);
        sendWhatsAppAlert({ alert, rate: match, direction: 'up' });
      } else if (!aboveUpper && alert.breachUpper) {
        alert.breachUpper = false; // re-arm when price comes back inside range
        changed = true;
      }

      // Lower bound newly crossed → notify once.
      if (belowLower && !alert.breachLower) {
        alert.breachLower = true;
        alert.lastNotified = new Date().toISOString();
        changed = true;
        showToast(`📉 ${alert.material} dropped to ${formatMoney(match.rate)} (limit ${formatMoney(alert.lower)})`);
        sendWhatsAppAlert({ alert, rate: match, direction: 'down' });
      } else if (!belowLower && alert.breachLower) {
        alert.breachLower = false; // re-arm
        changed = true;
      }
    });

    if (changed) savePriceAlerts(alerts);

    const activeName = $('.material-name')?.textContent;
    if (activeName) refreshPriceAlertStatus(activeName);
  }

  // ── Background polling: refetch rates on an interval so price alerts
  // evaluate automatically while the tab is open. They always create in-app
  // alerts; no background WhatsApp message is claimed or simulated.
  let pollTimer = null;
  const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  function startAlertPolling() {
    if (pollTimer) return; // already running
    pollTimer = window.setInterval(async () => {
      // Only poll if the user has at least one alert set; otherwise skip.
      if (!getPriceAlerts().length) return;
      console.log('[alerts] polling live rates for alert evaluation…');
      try {
        await loadRatesWithFallback(profile);
      } catch (e) {
        console.warn('[alerts] poll failed:', e.message);
      }
    }, POLL_INTERVAL_MS);
  }

  // Build a WhatsApp-friendly briefing from LIVE rates + news. Includes real
  // prices, change %, source attribution, and top headlines — not just titles.
  function buildShareableBriefing() {
    const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    const lines = [];
    lines.push(`📊 *Newszoid Business Briefing*`);
    lines.push(`${dateStr} • ${profile.businessType} • ${profile.city}`);
    lines.push('');

    // Live prices section (real data only).
    const rates = Array.isArray(appState.currentRates) ? appState.currentRates : [];
    if (rates.length) {
      lines.push(`💰 *Live Prices*`);
      rates.slice(0, 6).forEach(r => {
        const arrow = r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '→';
        const changeTxt = r.pct ? ` ${arrow} ${Math.abs(r.pct).toFixed(1)}%` : '';
        const unit = r.unit ? `/${r.unit.replace(/^Rs\/?/i, '')}`.replace(/^\.$/, '') : '';
        const verifiedTag = r.verified ? ' ✓' : '';
        lines.push(`• ${r.material}: ${formatMoney(r.rate)}${unit}${changeTxt}${verifiedTag}`);
      });
      const topSource = rates.find(r => r.sourceName)?.sourceName;
      if (topSource) lines.push(`Source: ${topSource}`);
      lines.push('');
    }

    // Top headlines section (from live news).
    const news = Array.isArray(currentNewsData) ? currentNewsData : [];
    if (news.length) {
      lines.push(`📰 *Top Updates*`);
      news.slice(0, 4).forEach(n => {
        lines.push(`• ${n.headline}`);
      });
      lines.push('');
    }

    if (!rates.length && !news.length) {
      lines.push('Live market data is loading. Open Newszoid for full details.');
      lines.push('');
    }

    lines.push(`🔗 ${location.href}`);
    return lines.join('\n');
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
          // Reload data with new profile (parallel + skeletons)
          loadDashboardData();
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
          const briefingText = buildShareableBriefing();

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
        btn.addEventListener('click', async () => {
          const activeName = $('.material-name')?.textContent?.trim() || '';
          if (!activeName || activeName === 'Loading...') {
            showToast('Select a material first.');
            return;
          }

          const liveRate = (appState.currentRates || []).find(r => r.material === activeName);
          const currentPrice = liveRate ? liveRate.rate : 0;
          const existing = getPriceAlerts().find(a => a.material === activeName);

          if (!profile.whatsapp) {
            showToast('Tip: add a WhatsApp number only when your verified notification service is enabled.');
          }

          const range = await promptForPriceRange(activeName, currentPrice, existing);
          if (!range) return; // cancelled / invalid

            upsertPriceAlert(activeName, range);
            startAlertPolling();
            refreshPriceAlertStatus(activeName);

          const parts = [];
          if (range.upper != null) parts.push(`↑ ${formatMoney(range.upper)}`);
          if (range.lower != null) parts.push(`↓ ${formatMoney(range.lower)}`);
          showToast(`✅ Alert set for ${activeName}: ${parts.join(' / ')}`);

          if (liveRate) checkPriceAlerts([liveRate]); // check immediately
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
    if (!getRatesCache()?.rates?.length && !getNewsCache()?.items?.length) {
      showSkeletons();
    }
    setupNavigation();
    setupSidebarAndDropdowns();
    setupAiControls();
    setupHorizontalSliders();
    setupWorkspace();
    setupButtons();
    setupCardMenus();
    updateQueryCount();
    populateProfileForm();
    setupProfileResearch();
    initAiGreeting();
    registerServiceWorker();
    if (getPriceAlerts().length) startAlertPolling();

    if (!profile.email) {
      switchView('workspace');
      showToast('Please complete your Business Profile to personalize your feed.');
    } else {
      loadDashboardData();
    }

    const retryBtn = $('#nzRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', retryAllData);
    }
  });
})();
