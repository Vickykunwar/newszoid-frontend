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
    workspace: 'Workspace',
  };

  const appState = {
    queryCount: Number(localStorage.getItem('nz_query_count') || 1),
    maxQueries: 3,
    activePersona: 'Market Analyst',
  };

  let profile = {
    name: 'Vicky S.',
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
    const industry = $('#profileIndustry');
    const location = $('#profileLocation');

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
      if (dot) dot.className = 'freshness-dot';
      el.childNodes.forEach(node => {
        if (node.nodeType === 3) node.textContent = '';
      });
      const timeText = document.createTextNode(` Sample data • API timed out`);
      el.appendChild(timeText);
    }
  }

  const fallbackNews = [
    {
      headline: 'Steel prices rise as import pressure tightens local supply',
      summary: 'MS Sheet and HR Coil buyers should compare quotes before locking weekly inventory. Keep customer quote validity short while rates remain active.',
      source: 'Economic Times',
      time: '2h ago',
      category: 'PRICE',
      impact: 'HIGH',
      sentiment: 'BEARISH',
      signal: 'Buy partial stock',
    },
    {
      headline: 'MSME credit support opens working-capital window',
      summary: 'Manufacturers with active documentation can use credit support as a buffer during volatile material cycles.',
      source: 'Business Standard',
      time: '5h ago',
      category: 'POLICY',
      impact: 'MEDIUM',
      sentiment: 'BULLISH',
      signal: 'Check eligibility',
    },
    {
      headline: 'Uttarakhand infrastructure tenders lift fabrication demand',
      summary: 'Local road and building work can create near-term demand for steel fabricators and suppliers around Haridwar.',
      source: 'Times of India',
      time: 'Today',
      category: 'INDUSTRY',
      impact: 'HIGH',
      sentiment: 'BULLISH',
      signal: 'Prepare rate sheet',
    },
  ];

  const fallbackRates = [
    { material: 'MS Sheet', rate: 58400, change: 1200, pct: 2.1, trend: 'up', market: 'Haridwar' },
    { material: 'HR Coil', rate: 55800, change: -400, pct: -0.7, trend: 'down', market: 'Haridwar' },
    { material: 'Copper Wire', rate: 742000, change: 8500, pct: 1.2, trend: 'up', market: 'Haridwar' },
    { material: 'Diesel', rate: 92.5, change: -0.8, pct: -0.9, trend: 'down', market: 'Haridwar' },
    { material: 'Cement OPC', rate: 380, change: 0, pct: 0, trend: 'flat', market: 'Haridwar' },
  ];

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

    const spark = document.createElement('div');
    spark.className = 'price-sparkline';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 60 20');
    svg.setAttribute('preserveAspectRatio', 'none');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', sparklinePoints(direction));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', sparkColor);
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);
    spark.appendChild(svg);

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

    const statValues = $$('.material-stats .stat-value');
    if (statValues[0]) statValues[0].textContent = formatMoney(rate.rate);
    if (statValues[1]) statValues[1].textContent = formatMoney(Math.max(rate.rate - Math.abs(rate.change || rate.rate * 0.02), 0));
    if (statValues[2]) statValues[2].textContent = `${Math.abs(rate.pct).toFixed(1)}%`;
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

  async function loadRates() {
    let rates = fallbackRates.map(normalizeRate);
    let isLive = false;

    if (API_BASE_URL) {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 18000);
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
        console.warn('Rate feed fallback used:', error);
      }
    }

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
    const wrapper = document.createElement('div');
    wrapper.className = 'news-item';

    const sourceRow = document.createElement('div');
    sourceRow.className = 'news-source';

    const favicon = document.createElement('img');
    favicon.className = 'news-favicon';
    favicon.alt = item.source || 'News';
    favicon.src = `https://www.google.com/s2/favicons?domain=${sourceDomain(item.source)}&sz=32`;
    favicon.addEventListener('error', () => {
      favicon.src = 'favicon.ico';
    }, { once: true });

    sourceRow.append(
      favicon,
      textEl('span', 'news-source-name', item.source || 'News'),
      textEl('span', 'news-time', item.time || 'Today')
    );

    if (item.impact === 'HIGH') {
      sourceRow.appendChild(textEl('span', 'news-badge new', 'New'));
    }

    const headline = textEl('div', 'news-headline', item.headline || 'Industry update');
    const summary = textEl('div', 'news-summary', item.summary || '');
    summary.appendChild(document.createTextNode(' '));
    summary.appendChild(textEl('span', `news-tag ${tagClass(item)}`, item.category || 'News'));

    wrapper.append(sourceRow, headline, summary);
    return wrapper;
  }

  function renderDashboardNews(news) {
    const container = $('#news-container');
    if (!container) return;

    clearNode(container);
    news.slice(0, 3).forEach(item => container.appendChild(createNewsItem(item)));

    const count = $('.news-count');
    if (count) count.textContent = `${Math.min(news.length, 3)} stories curated for you`;
  }

  function createIntelCard(item) {
    const card = document.createElement('div');
    card.className = 'card intel-card';

    const sourceRow = document.createElement('div');
    sourceRow.className = 'intel-source-row';

    const favicon = document.createElement('img');
    favicon.className = 'news-favicon';
    favicon.alt = item.source || 'News';
    favicon.src = `https://www.google.com/s2/favicons?domain=${sourceDomain(item.source)}&sz=32`;
    favicon.addEventListener('error', () => {
      favicon.src = 'favicon.ico';
    }, { once: true });

    sourceRow.append(
      favicon,
      textEl('span', 'intel-source', item.source || 'News'),
      textEl('span', 'intel-time', item.time || 'Today')
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

    const action = document.createElement('button');
    action.className = 'btn btn-ghost btn-sm';
    action.type = 'button';
    action.textContent = 'Ask AI about this';
    action.addEventListener('click', () => handleAiQuestion(`Explain this update: ${item.headline}`));
    footer.appendChild(action);

    card.append(sourceRow, body, tags, footer);
    return card;
  }

  function renderIntelligenceFeed(news) {
    const feed = $('.intelligence-feed');
    if (!feed) return;

    clearNode(feed);
    news.forEach(item => feed.appendChild(createIntelCard(item)));
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
    let news = fallbackNews;

    if (API_BASE_URL) {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 18000);
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
        console.warn('News feed fallback used:', error);
      }
    }

    renderDashboardNews(news);
    renderIntelligenceFeed(news);
    renderAlertSignals(news);
    renderBriefing(news);
  }

  function localAiAnswer(question) {
    const q = question.toLowerCase();
    const { prices, alerts } = getMarketContext();
    const steel = prices.find(item => /steel|ms sheet|hr coil/i.test(item.name || '')) || prices[0];
    const copper = prices.find(item => /copper/i.test(item.name || ''));
    const topAlert = alerts[0] || 'No urgent alerts are open right now.';

    if (/copper/.test(q) && copper) {
      return `Copper is currently ${copper.value} with ${copper.change || 'flat movement'}. Compare two supplier quotes and avoid locking a large order without checking delivery timelines.`;
    }

    if (/alert|risk|scan/.test(q)) {
      return `Top risk: ${topAlert} Watch supplier validity, GST or policy updates, and material availability before committing to new quotes this week.`;
    }

    if (/opportun|tender|export/.test(q)) {
      return 'Best near-term opportunity: refresh your rate sheet and reach local infrastructure or tender buyers while material movement is visible. Keep quote validity short and protect margins.';
    }

    if (/brief|morning|summary/.test(q)) {
      return `Morning brief: ${topAlert} ${steel ? `${steel.name} is at ${steel.value} (${steel.change}).` : ''} Prioritize purchase timing, compliance checks, and one backup vendor today.`;
    }

    if (/buy|steel|price|rate/.test(q) && steel) {
      return `${steel.name} is showing ${steel.value} with ${steel.change}. If you need stock this week, buy a partial quantity now and keep the balance flexible until supplier quotes settle.`;
    }

    return `${appState.activePersona} view: focus on the highest-moving tracked material first, keep customer quotes time-bound, and verify any large purchase with two local suppliers before locking capital.`;
  }

  async function askBackend(question) {
    if (!API_BASE_URL) return null;

    const payload = {
      ...profile,
      question,
      prompt: `Answer this business-owner question in under 90 words with practical action steps: ${question}`,
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
      avatar.textContent = '✦';
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
    avatar.textContent = '✦';

    const content = document.createElement('div');
    content.className = 'ai-message-content';
    content.innerHTML = `<p>${greeting}, ${profile.name.split(' ')[0]}. I'm your <strong>${appState.activePersona}</strong>.</p>
<p>I can help you with price analysis, procurement decisions, risk scanning, and opportunity discovery for your <strong>${profile.businessType}</strong> business in <strong>${profile.city}</strong>.</p>
<p>Ask me anything, or try one of the quick prompts below ↓</p>`;

    wrapper.append(avatar, content);
    messages.appendChild(wrapper);
  }

  async function handleAiQuestion(question) {
    const input = $('.ai-input');
    const trimmed = String(question || input?.value || '').trim();
    if (!trimmed) {
      showToast('Type a question for the AI advisor.');
      input?.focus();
      return;
    }

    switchView('ai-advisor');
    if (input) input.value = '';
    appendMessage('user', trimmed);
    const pending = appendMessage('ai', 'Thinking through your market context...');

    const backendAnswer = await askBackend(trimmed);
    const answer = backendAnswer
      ? backendAnswer.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : localAiAnswer(trimmed);

    if (pending) pending.textContent = answer;

    appState.queryCount = Math.min(appState.queryCount + 1, appState.maxQueries);
    localStorage.setItem('nz_query_count', String(appState.queryCount));
    updateQueryCount();
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

    $('#aiChatBtn')?.addEventListener('click', () => switchView('ai-advisor'));
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
      });
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
        showToast(`Filter applied: ${btn.textContent.trim()}`);
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
        });
      } else if (label === 'Cancel') {
        btn.addEventListener('click', () => showToast('No changes applied.'));
      } else if (label === 'Share') {
        btn.addEventListener('click', async () => {
          const shareData = { title: 'Newszoid', text: 'Newszoid business briefing', url: location.href };
          if (navigator.share) {
            await navigator.share(shareData).catch(() => {});
          } else {
            await navigator.clipboard?.writeText(location.href).catch(() => {});
            showToast('Dashboard link copied.');
          }
        });
      } else if (label === 'Full View') {
        btn.addEventListener('click', () => switchView('intelligence'));
      } else if (label === 'Ask AI' || label === 'Ask AI about this') {
        btn.addEventListener('click', () => handleAiQuestion('Explain this update for my business'));
      } else if (label === 'Set Price Alert') {
        btn.addEventListener('click', () => showToast('Price alert saved for this material.'));
      } else if (label === 'View History') {
        btn.addEventListener('click', () => showToast('Rate history is ready in the Markets view.'));
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
    setupNavigation();
    setupSidebarAndDropdowns();
    setupAiControls();
    setupWorkspace();
    setupButtons();
    setupCardMenus();
    updateQueryCount();
    populateProfileForm();
    initAiGreeting();
    loadRates();
    loadNews();
    registerServiceWorker();
  });
})();
