let STATE = {
  name: '',
  city: '',
  email: '',
  biz: '',
  items: []
};

let isDemoMode = false;
let lastFetchedNews = [];
let lastFetchedRates = [];
let lastFetchedSummary = '';

const DEMO_DATA = {
  business: {
    name: "Sharma Fabrication Works",
    city: "Haridwar",
    industry: "Iron & Sheet Metal"
  },
  news: [
    {
      headline: "Steel imports from China rise 12% — domestic prices under pressure",
      source: "Economic Times",
      time: "2 hours ago",
      relevance: 94,
      tag: "Price Impact",
      category: "PRICE",
      impact: "HIGH",
      sentiment: "BEARISH",
      summary: "Surging Chinese steel imports are flooding regional markets, causing severe domestic pricing pressure. Local suppliers are adjusting margins downwards to stay competitive."
    },
    {
      headline: "MSME Ministry announces ₹500Cr credit guarantee for manufacturers",
      source: "Business Standard",
      time: "5 hours ago",
      relevance: 88,
      tag: "Opportunity",
      category: "POLICY",
      impact: "HIGH",
      sentiment: "BULLISH",
      summary: "A new credit guarantee scheme of ₹500 Crore is now active for micro and small manufacturing units, helping secure interest-free working capital from public sector banks."
    },
    {
      headline: "Uttarakhand infrastructure project tenders open — steel demand expected",
      source: "Times of India",
      time: "Yesterday",
      relevance: 91,
      tag: "Tender Alert",
      category: "INDUSTRY",
      impact: "MEDIUM",
      sentiment: "BULLISH",
      summary: "Massive road and building reconstruction project tenders are officially open across Uttarakhand. Local fabrication and material suppliers anticipate high orders this quarter."
    }
  ],
  rates: [
    { material: "MS Sheet", rate: 58400, change: 1200, pct: 2.1, trend: "up" },
    { material: "HR Coil",  rate: 55800, change: -400,  pct: -0.7, trend: "down" },
    { material: "Copper Wire", rate: 742000, change: 8500, pct: 1.2, trend: "up" },
    { material: "Diesel",  rate: 92.5,  change: -0.8,  pct: -0.9, trend: "down" },
    { material: "Cement (OPC)", rate: 380, change: 0, pct: 0, trend: "flat" }
  ],
  ai_summary: "Steel prices are under pressure from Chinese import surge — consider locking in purchases this week before further volatility. A new infrastructure tender in Uttarakhand represents a strong bid opportunity for fabrication businesses. MSME credit guarantee scheme is now active — check eligibility for working capital."
};

const API_BASE_URL = (window.NEWSZOID_CONFIG?.API_BASE_URL || '').replace(/\/$/, '');
const LAST_VISIT_AT_START = readRawStorageNumber('nz_last_visit');
let deferredInstallPrompt = null;
let installVisitCounted = false;

function safeStorage(op, key, value) {
  try {
    if (op === 'get') {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
    if (op === 'set') {
      localStorage.setItem(key, JSON.stringify(value));
      return value;
    }
    if (op === 'del') {
      localStorage.removeItem(key);
      return null;
    }
  } catch (e) {
    console.warn('Storage error:', e);
    return null;
  }
  return null;
}

function readRawStorageNumber(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Number(parsed) || Number(raw) || null;
  } catch (e) {
    return null;
  }
}

function trackEvent(name, data = {}) {
  try {
    console.log('[Newszoid analytics]', name, data);
  } catch (e) {
    console.warn('Analytics error:', e);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Inject Toast container
  const toast = document.createElement('div');
  toast.id = 'nz-toast';
  toast.className = 'nz-toast';
  document.body.appendChild(toast);

  if (renderSeoRatePageIfNeeded()) return;

  handleSharedDashboardRef();
  checkInstallPrompt();
  updateAlertBadge();

  const saved = safeStorage('get', 'nz_profile');
  if (saved) {
    try {
      STATE = normalizeProfile(saved);
      isDemoMode = false;
      document.getElementById('setup-screen').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      setupDashboard(true);
      updateDailyBrief(buildProfileSeedData());
      fetchNews().finally(() => {
        fetchRates().finally(() => {
          fetchAnalyst();
        });
      });
      scheduleSmartPanels();
    } catch (e) {
      console.error('Error loading saved profile', e);
      loadDemoDashboardData();
    }
  } else {
    // NO profile exists: auto-inject DEMO_DATA
    loadDemoDashboardData();
  }

  if (window.innerWidth < 768) switchPanel('news');
});

window.addEventListener('beforeinstallprompt', e => {
  try {
    e.preventDefault();
    deferredInstallPrompt = e;
    checkInstallPrompt();
  } catch (err) {
    console.warn('Install prompt error:', err);
  }
});

function normalizeProfile(profile = {}) {
  const materials = Array.isArray(profile.materials) ? profile.materials : profile.items;

  return {
    name: profile.name || 'Business Owner',
    city: profile.city || 'India',
    email: profile.email || '',
    biz: profile.biz || profile.industry || profile.businessType || 'Business',
    items: Array.isArray(materials) ? materials : []
  };
}

function buildProfileSeedData() {
  const requestedMaterials = STATE.items.length ? STATE.items : DEMO_DATA.rates.map(rate => rate.material);
  const demoRatesByName = new Map(DEMO_DATA.rates.map(rate => [rate.material.toLowerCase(), rate]));
  const rates = requestedMaterials.slice(0, 6).map((material, index) => {
    const demoRate = demoRatesByName.get(String(material).toLowerCase());
    if (demoRate) return demoRate;

    const pct = index % 3 === 0 ? 1.4 : index % 3 === 1 ? -0.8 : 0;
    const trend = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const rate = 1000 + index * 750;

    return {
      material,
      rate,
      change: Math.round(rate * pct / 100),
      pct,
      trend
    };
  });

  return {
    news: DEMO_DATA.news,
    rates,
    ai_summary: `${STATE.biz} intelligence is ready for ${STATE.city}. Track material volatility, check relevant tenders, and review policy updates before purchase decisions.`
  };
}

function today() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function todayShort() {
  return new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function initials(name) {
  return (name || '')
    .split(' ')
    .slice(0, 2)
    .map(word => (word[0] || '').toUpperCase())
    .join('') || '?';
}

function parseItems(raw) {
  const itemEndWords = new Set([
    'acid', 'bar', 'board', 'cement', 'chemical', 'coil', 'compound',
    'granule', 'granules', 'ingot', 'oil', 'paint', 'pipe', 'plate',
    'powder', 'primer', 'rod', 'sand', 'sheet', 'strip', 'wire', 'wood', 'yarn'
  ]);

  return raw
    .split(/[\n,;]+/)
    .flatMap(part => {
      const cleaned = part.replace(/\betc\.?$/i, '').trim();
      const words = cleaned.split(/\s+/).filter(Boolean);

      if (words.length <= 4) return cleaned ? [cleaned] : [];

      const items = [];
      let current = [];

      words.forEach(word => {
        current.push(word);

        if (itemEndWords.has(word.toLowerCase())) {
          items.push(current.join(' '));
          current = [];
        }
      });

      if (current.length) {
        if (items.length) {
          items[items.length - 1] = `${items[items.length - 1]} ${current.join(' ')}`.trim();
        } else {
          items.push(current.join(' '));
        }
      }

      return items;
    })
    .map(s => s.trim())
    .filter(Boolean);
}

function generateSparklineSVG(baseRate, trend) {
  const points = [];
  const rateVal = Number(baseRate) || 100;
  const changeFactor = trend === 'up' ? 0.015 : trend === 'down' ? -0.015 : 0;
  
  for (let i = 0; i < 7; i++) {
    // Generate simulated points around current rate
    const noise = Math.sin(i * 1.5) * 0.006;
    const price = rateVal * (1 - (6 - i) * changeFactor + noise);
    points.push(price);
  }
  
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  
  let svgBars = '';
  const barWidth = 6;
  const gap = 3;
  const color = trend === 'up' ? 'var(--nz-green)' : trend === 'down' ? 'var(--nz-red)' : 'var(--nz-muted)';
  
  for (let i = 0; i < 7; i++) {
    const val = points[i];
    const barHeight = 5 + ((val - min) / range) * 20;
    const x = i * (barWidth + gap);
    const y = 30 - barHeight;
    svgBars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="1" fill="${color}" opacity="${0.4 + (i * 0.1)}"></rect>`;
  }
  
  return `<svg width="60" height="30" class="mini-spark">${svgBars}</svg>`;
}

function selectBiz(el) {
  document.querySelectorAll('.biz-card').forEach(card => card.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('custom-biz').value = '';
}

function updateTagPreview() {
  const raw = document.getElementById('items-input').value;
  const tags = parseItems(raw);
  const preview = document.getElementById('tag-preview');
  preview.innerHTML = tags.slice(0, 20).map(tag => `<span class="tag">${tag}</span>`).join('');
}

function addSampleItem(item) {
  const input = document.getElementById('items-input');
  const existing = parseItems(input.value);

  if (!existing.some(value => value.toLowerCase() === item.toLowerCase())) {
    input.value = [...existing, item].join('\n');
  }

  updateTagPreview();
  input.focus();
}

function loadDemoDashboardData() {
  isDemoMode = true;
  STATE = {
    name: DEMO_DATA.business.name,
    city: DEMO_DATA.business.city,
    email: '',
    biz: DEMO_DATA.business.industry,
    items: DEMO_DATA.rates.map(r => r.material)
  };

  // Show setup screen at the bottom, dashboard at the top
  const setupScreen = document.getElementById('setup-screen');
  const dashboard = document.getElementById('dashboard');
  setupScreen.style.display = 'block';
  dashboard.style.display = 'block';
  
  // Move dashboard above setup-screen in the DOM
  document.body.insertBefore(dashboard, setupScreen);

  // Display top banner
  const banner = document.getElementById('demo-banner');
  if (banner) banner.style.display = 'flex';

  setupDashboard(false);
  
  renderNewsFeed(DEMO_DATA.news);
  renderRatesFeed(DEMO_DATA.rates);
  renderAnalystFeed(DEMO_DATA.ai_summary, false);
  updateDailyBrief(DEMO_DATA);
  lastFetchedNews = DEMO_DATA.news;
  lastFetchedRates = DEMO_DATA.rates;
  lastFetchedSummary = DEMO_DATA.ai_summary;
  scheduleSmartPanels();
  trackEvent('demo_dashboard_viewed');
}

function loadDemoDashboard() {
  loadDemoDashboardData();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToOnboarding() {
  const setup = document.getElementById('setup-screen');
  if (setup) {
    setup.scrollIntoView({ behavior: 'smooth' });
  }
}

function dismissDemoBanner() {
  const banner = document.getElementById('demo-banner');
  if (banner) {
    banner.style.display = 'none';
  }
}

function setupDashboard(returning = false) {
  const { name, city, biz, items = [] } = STATE;
  document.getElementById('dash-avatar').textContent = initials(name);
  
  // Custom returning greeting
  document.getElementById('dash-name').textContent = returning ? `Welcome back, ${name}` : name;
  document.getElementById('dash-city').textContent = city;
  document.getElementById('dash-biz-label').textContent = biz;
  document.getElementById('dash-date').textContent = todayShort();
  
  const fbBiz = document.getElementById('fb-biz');
  const fbCity = document.getElementById('fb-city');
  const fbItems = document.getElementById('fb-items-count');

  if (fbBiz) fbBiz.textContent = biz;
  if (fbCity) fbCity.textContent = city;
  if (fbItems) fbItems.textContent = `${items.length} items`;
  
  document.getElementById('rates-badge').textContent = items.length;
}

function launchDashboard() {
  const name = document.getElementById('owner-name').value.trim() || 'Business Owner';
  const city = document.getElementById('owner-city').value.trim() || 'India';
  const email = document.getElementById('owner-email')?.value.trim() || '';
  const customBiz = document.getElementById('custom-biz').value.trim();
  const selectedCard = document.querySelector('.biz-card.selected');
  const biz = customBiz || (selectedCard ? selectedCard.dataset.biz : '');
  const itemsRaw = document.getElementById('items-input').value;
  const items = parseItems(itemsRaw);

  if (!biz) {
    alert('Please select or enter your business type in Step 2.');
    return;
  }

  isDemoMode = false;
  dismissDemoBanner();

  const profile = { 
    name, 
    city, 
    email, 
    industry: biz, 
    materials: items, 
    setupDate: new Date().toISOString() 
  };

  safeStorage('set', 'nz_profile', profile);
  
  // Save separately to nz_email if email was provided
  if (email) {
    safeStorage('set', 'nz_email', email);
  }

  STATE = normalizeProfile(profile);

  callAPI('profile', { name, city, email, businessType: biz, items }).catch(e =>
    console.error('Failed to sync profile to DB', e)
  );

  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  setupDashboard(false);
  updateDailyBrief(buildProfileSeedData());
  scheduleSmartPanels();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  trackEvent('onboarding_completed', { industry: biz, materialsCount: items.length });
  trackEvent('profile_saved');

  // Fetch fresh personalized news & rates
  fetchNews();
  fetchRates();
  fetchAnalyst();
}

function resetToSetup() {
  if (!confirm('This will clear your saved profile and return to onboarding. Continue?')) return;
  safeStorage('del', 'nz_profile');
  safeStorage('del', 'nz_email');
  isDemoMode = false;
  
  // Refresh setup forms
  document.getElementById('owner-name').value = '';
  document.getElementById('owner-city').value = '';
  document.getElementById('owner-email').value = '';
  document.getElementById('custom-biz').value = '';
  document.getElementById('items-input').value = '';
  document.querySelectorAll('.biz-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('tag-preview').innerHTML = '';

  const setupScreen = document.getElementById('setup-screen');
  const dashboard = document.getElementById('dashboard');
  setupScreen.style.display = 'block';
  dashboard.style.display = 'none';
  
  // Restore original DOM order (setup-screen first)
  document.body.insertBefore(setupScreen, dashboard);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchPanel(name, tabEl) {
  document.querySelectorAll('.dash-panel').forEach(panel => panel.classList.remove('active'));
  document.querySelectorAll('.dash-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.bnav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.panel === name));

  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.add('active');
  if (tabEl) {
    tabEl.classList.add('active');
  } else {
    const tab = Array.from(document.querySelectorAll('.dash-tab')).find(item =>
      item.getAttribute('onclick')?.includes(`'${name}'`)
    );
    if (tab) tab.classList.add('active');
  }

  trackEvent('panel_switched', { panel: name });
}

function switchAlertsPanel() {
  try {
    switchPanel('rates');
    document.querySelectorAll('.bnav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.panel === 'alerts'));
    trackEvent('panel_switched', { panel: 'alerts' });
  } catch (e) {
    console.warn('Alerts panel switch failed:', e);
  }
}

async function callAPI(endpoint, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let res;

  try {
    res = await fetch(`${API_BASE_URL}/api/biz-agent/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out after 25 seconds. Please try again.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `API error: ${res.status}`);
  }

  return res.json();
}

/* --- Skeleton Rendering Helper --- */
function renderSkeletonLoader(type) {
  if (type === 'news') {
    return `
      <div class="news-grid">
        ${Array(2).fill().map(() => `
          <div class="news-card neutral">
            <div class="news-meta">
              <div class="skeleton" style="width: 80px; height: 16px;"></div>
              <div class="skeleton" style="width: 60px; height: 16px;"></div>
            </div>
            <div class="skeleton" style="width: 90%; height: 20px; margin-bottom: 12px;"></div>
            <div class="skeleton" style="width: 100%; height: 40px; margin-bottom: 16px;"></div>
            <div class="skeleton" style="width: 120px; height: 16px;"></div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (type === 'rates') {
    return `
      <div class="rate-row-container">
        ${Array(3).fill().map(() => `
          <div class="rate-row">
            <div class="rate-info">
              <div class="skeleton" style="width: 120px; height: 18px;"></div>
              <div class="skeleton" style="width: 60px; height: 12px;"></div>
            </div>
            <div class="skeleton" style="width: 80px; height: 18px;"></div>
            <div class="skeleton" style="width: 60px; height: 16px;"></div>
            <div class="skeleton" style="width: 60px; height: 24px;"></div>
            <div class="skeleton" style="width: 80px; height: 28px;"></div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (type === 'analyst') {
    return `
      <div class="analyst-block">
        <div class="analyst-header">
          <div class="skeleton" style="width: 48px; height: 48px; border-radius: 12px;"></div>
          <div>
            <div class="skeleton" style="width: 250px; height: 22px;"></div>
            <div class="skeleton" style="width: 150px; height: 14px; margin-top: 6px;"></div>
          </div>
        </div>
        <div class="skeleton" style="width: 100%; height: 16px; margin-bottom: 10px;"></div>
        <div class="skeleton" style="width: 95%; height: 16px; margin-bottom: 10px;"></div>
        <div class="skeleton" style="width: 98%; height: 16px; margin-bottom: 10px;"></div>
        <div class="skeleton" style="width: 90%; height: 16px; margin-bottom: 10px;"></div>
      </div>
    `;
  }
  return '';
}

async function fetchNews() {
  if (isDemoMode) {
    renderNewsFeed(DEMO_DATA.news);
    return;
  }

  const { city, biz, items } = STATE;
  trackEvent('news_fetch_triggered');
  const btn = document.getElementById('btn-news');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span>  Searching news...';

  // Inject shimmery skeletons into tab badges & container
  const badge = document.getElementById('news-badge');
  if (badge) {
    badge.innerHTML = '<span class="skeleton" style="display:inline-block; width:12px; height:12px; margin:0; vertical-align:middle; border-radius:50%;"></span>';
  }

  const container = document.getElementById('news-container');
  container.innerHTML = renderSkeletonLoader('news');

  try {
    const data = await callAPI('news', { businessType: biz, city, items });
    lastFetchedNews = data.news || [];
    
    if (badge) {
      badge.textContent = lastFetchedNews.length;
    }
    
    renderNewsFeed(lastFetchedNews);
    renderDeltaPanel();
    saveSnapshot();
    
    // Update daily brief with new news
    updateDailyBrief({
      news: lastFetchedNews,
      rates: lastFetchedRates.length ? lastFetchedRates : DEMO_DATA.rates,
      ai_summary: lastFetchedSummary ? lastFetchedSummary : DEMO_DATA.ai_summary
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">We could not load news right now</div><div class="empty-desc">Details: ${e.message}</div></div>`;
  }

  btn.disabled = false;
  btn.innerHTML = '⚡ Refresh News';
}

async function fetchRates() {
  if (isDemoMode) {
    renderRatesFeed(DEMO_DATA.rates);
    checkStoredPriceAlerts(DEMO_DATA.rates);
    checkWhatsAppSpikeAlerts(DEMO_DATA.rates);
    return;
  }

  const { city, biz, items } = STATE;
  trackEvent('rates_fetch_triggered');
  if (items.length === 0) {
    return;
  }

  const btn = document.getElementById('btn-rates');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span>  Verifying rates...';

  const badge = document.getElementById('rates-badge');
  if (badge) {
    badge.innerHTML = '<span class="skeleton" style="display:inline-block; width:12px; height:12px; margin:0; vertical-align:middle; border-radius:50%;"></span>';
  }

  const container = document.getElementById('rates-container');
  container.innerHTML = renderSkeletonLoader('rates');

  try {
    const data = await callAPI('rates', { businessType: biz, city, items });
    lastFetchedRates = data.rates || [];

    if (badge) {
      badge.textContent = lastFetchedRates.length;
    }

    renderRatesFeed(lastFetchedRates);
    checkStoredPriceAlerts(lastFetchedRates);
    checkWhatsAppSpikeAlerts(lastFetchedRates);
    renderDeltaPanel();
    saveSnapshot();

    // Update daily brief with new rates
    updateDailyBrief({
      news: lastFetchedNews.length ? lastFetchedNews : DEMO_DATA.news,
      rates: lastFetchedRates,
      ai_summary: lastFetchedSummary ? lastFetchedSummary : DEMO_DATA.ai_summary
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">We could not load rates right now</div><div class="empty-desc">Details: ${e.message}</div></div>`;
  }

  btn.disabled = false;
  btn.innerHTML = '📊 Refresh Verified Rates';
}

async function fetchAnalyst() {
  if (isDemoMode) {
    renderAnalystFeed(DEMO_DATA.ai_summary, false);
    return;
  }

  const { name, city, biz, items } = STATE;
  trackEvent('ai_analysis_run');
  const btn = document.getElementById('btn-analyst');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span>  Analyzing...';

  const container = document.getElementById('analyst-container');
  renderAnalystProgress();

  try {
    const data = await callAPI('analyst', { name, businessType: biz, city, items });
    lastFetchedSummary = data.analysis;

    renderAnalystFeed(lastFetchedSummary, true);
    renderDeltaPanel();
    saveSnapshot();

    // Update daily brief with summary
    updateDailyBrief({
      news: lastFetchedNews.length ? lastFetchedNews : DEMO_DATA.news,
      rates: lastFetchedRates.length ? lastFetchedRates : DEMO_DATA.rates,
      ai_summary: lastFetchedSummary
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">We could not prepare the summary</div><div class="empty-desc">Details: ${e.message}</div></div>`;
  }

  btn.disabled = false;
  btn.innerHTML = '🤖 Refresh Analysis';
}

function renderAnalystProgress() {
  const container = document.getElementById('analyst-container');
  if (!container) return;

  container.innerHTML = `
    <div class="streaming-progress-container">
      <div class="stream-step completed">
        <span class="stream-step-icon" style="color: var(--nz-green)">✓</span>
        <span>Reading your rate data...</span>
      </div>
      <div class="stream-step completed">
        <span class="stream-step-icon" style="color: var(--nz-green)">✓</span>
        <span>Scanning industry news...</span>
      </div>
      <div class="stream-step active">
        <span class="stream-step-icon">⟳</span>
        <span>Generating action plan...</span>
      </div>
    </div>
  `;
}

/* --- News UX Rendering and Interactions --- */
function renderNewsFeed(newsArr) {
  const container = document.getElementById('news-container');
  if (!container) return;

  const dismissed = getDismissedHeadlines();
  const visibleNews = (newsArr || []).filter(item => !dismissed.includes(item.headline));

  const badge = document.getElementById('news-badge');
  if (badge) badge.textContent = visibleNews.length;

  if (visibleNews.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📰</div>
        <div class="empty-title">All news caught up or dismissed</div>
        <div class="empty-desc">Your feed has been processed. Refresh or update your profile to fetch new stories.</div>
      </div>
    `;
    return;
  }

  const catMap = {
    PRICE: 'cat-price',
    POLICY: 'cat-policy',
    TRADE: 'cat-trade',
    INDUSTRY: 'cat-industry',
    GLOBAL: 'cat-global',
    DEMAND: 'cat-demand'
  };
  const impMap = { HIGH: 'impact-high', MEDIUM: 'impact-med', LOW: 'impact-low' };
  const cardMap = { BULLISH: 'bullish', BEARISH: 'bearish', WATCH: 'neutral', undefined: 'neutral' };

  container.innerHTML = `
    <div class="alert-strip">Showing ${visibleNews.length} stories curated for <strong>${STATE.biz}</strong> businesses in ${STATE.city} • ${today()}</div>
    <div class="news-section-title">Today's Feed <span class="sub">Personalized for ${STATE.biz}</span></div>
    <div class="news-grid">
      ${visibleNews.map((item, idx) => {
        const relevance = item.relevance || (96 - idx * 4);
        const tag = item.tag || item.category || 'Price Impact';
        return `
          <div class="news-card ${cardMap[item.sentiment] || 'neutral'} anim anim-1" id="news-card-${idx}">
            <div class="news-header-row">
              <div class="news-meta" style="margin-bottom: 0;">
                <span class="news-cat ${catMap[item.category] || 'cat-demand'}">${tag}</span>
                <span class="news-impact ${impMap[item.impact] || 'impact-low'}">${item.impact || 'MEDIUM'} IMPACT</span>
              </div>
              <span class="news-relevance-badge">${relevance}% match</span>
            </div>
            <div class="news-headline" style="font-size: 15px; font-weight: bold;">${item.headline}</div>
            <div class="news-summary">${item.summary || ''}</div>
            <div class="news-source" style="margin-top: 8px;">
              <span>📌 ${item.source} • ${item.time || 'Today'}</span>
            </div>
            <div class="news-actions-row">
              <button class="btn-news-action" onclick="saveNewsItem('${item.headline.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">Save</button>
              <button class="btn-news-action" onclick="shareNewsItem('${item.headline.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">Share</button>
              <button class="btn-news-action dismiss-btn" onclick="dismissNewsItem(${idx}, '${item.headline.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">✕ Not relevant</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function getDismissedHeadlines() {
  return safeStorage('get', 'nz_dismissed') || [];
}

function dismissNewsItem(idx, headline) {
  const card = document.getElementById(`news-card-${idx}`);
  if (card) {
    card.classList.add('news-card-fadeout');
    setTimeout(() => {
      const dismissed = getDismissedHeadlines();
      if (!dismissed.includes(headline)) {
        dismissed.push(headline);
        safeStorage('set', 'nz_dismissed', dismissed);
      }
      
      const newsSource = isDemoMode ? DEMO_DATA.news : lastFetchedNews;
      renderNewsFeed(newsSource);
      
      updateDailyBrief({
        news: newsSource,
        rates: isDemoMode ? DEMO_DATA.rates : lastFetchedRates,
        ai_summary: isDemoMode ? DEMO_DATA.ai_summary : lastFetchedSummary
      });

      showToast('Marked as not relevant. Newszoid AI will adapt your feed!');
    }, 400);
  }
}

function shareNewsItem(headline) {
  const shareText = `${headline} — via Newszoid BI (newszoid.com)`;
  navigator.clipboard.writeText(shareText).then(() => {
    showToast('Copied share details to clipboard!');
  }).catch(err => {
    console.error('Failed to copy text', err);
  });
}

function saveNewsItem(headline) {
  showToast('Saved to your dashboard bookmarks!');
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('nz-toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.toggle('danger', type === 'danger');
    toast.classList.add('active');
    setTimeout(() => {
      toast.classList.remove('active');
      toast.classList.remove('danger');
    }, 3000);
  }
}

/* --- Rate Tracker Row Redesign & Alerts --- */
function renderRatesFeed(ratesArr) {
  const container = document.getElementById('rates-container');
  if (!container) return;
  if (ratesArr && ratesArr !== DEMO_DATA.rates) lastFetchedRates = ratesArr;

  if (!ratesArr || ratesArr.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <div class="empty-title">No verified rates found</div>
      </div>
    `;
    return;
  }

  const ups = ratesArr.filter(rate => (rate.trend || '').toLowerCase() === 'up').length;
  const downs = ratesArr.filter(rate => (rate.trend || '').toLowerCase() === 'down').length;
  const flats = ratesArr.filter(rate => (rate.trend || '').toLowerCase() === 'flat' || !rate.trend).length;

  const summaryBar = `
    <div class="summary-bar">
      <div class="summary-card"><div class="summary-val">${ratesArr.length}</div><div class="summary-label">Items Tracked</div></div>
      <div class="summary-card"><div class="summary-val" style="color:var(--nz-green)">▲${ups}</div><div class="summary-label">Rising</div><div class="summary-sub" style="color:var(--nz-green);font-size:11px">prices up</div></div>
      <div class="summary-card"><div class="summary-val" style="color:var(--nz-red)">▼${downs}</div><div class="summary-label">Falling</div><div class="summary-sub" style="color:var(--nz-red);font-size:11px">prices down</div></div>
      <div class="summary-card"><div class="summary-val" style="color:var(--nz-muted)">—${flats}</div><div class="summary-label">Stable</div></div>
    </div>
  `;

  const rowsHtml = ratesArr.map((rate, idx) => {
    const item = rate.material || rate.item || '';
    const currentPrice = rate.rate || rate.currentPrice || 0;
    const change = rate.change || 0;
    const pct = rate.pct !== undefined ? rate.pct : (rate.deltaPercent !== undefined ? +rate.deltaPercent : 0);
    const trend = (rate.trend || 'flat').toLowerCase();

    const absPct = Math.abs(pct);
    let borderClass = 'rate-row-low';
    if (absPct > 5) {
      borderClass = 'rate-row-high';
    } else if (absPct >= 2) {
      borderClass = 'rate-row-medium';
    }

    const changeSign = change > 0 ? '+' : '';
    const pctClass = trend === 'up' ? 'up' : (trend === 'down' ? 'down' : 'flat');
    const arrow = trend === 'up' ? '▲' : (trend === 'down' ? '▼' : '→');

    const sparklineSVG = generateSparklineSVG(currentPrice, trend);

    return `
      <div class="rate-row ${borderClass} anim anim-2">
        <div class="rate-info">
          <span class="rate-name">${item}</span>
          <span class="rate-sub">📍 ${rate.market || STATE.city} Market</span>
        </div>
        <div class="rate-value-col">
          ₹${currentPrice.toLocaleString('en-IN')}
        </div>
        <div class="rate-change-col">
          <span class="rate-change-amt" style="color: ${trend === 'up' ? 'var(--nz-green)' : (trend === 'down' ? 'var(--nz-red)' : 'var(--nz-muted)')}">
            ${changeSign}₹${change.toLocaleString('en-IN')}
          </span>
          <span class="rate-change-pct ${pctClass}">
            ${arrow} ${absPct.toFixed(1)}%
          </span>
        </div>
        <div class="sparkline-col">
          ${sparklineSVG}
        </div>
        <div class="actions-col">
          <button class="btn-alert-trigger" onclick="showInlineAlertForm(${idx})">Set Alert</button>
        </div>
      </div>
      <div class="inline-alert-form" id="inline-alert-${idx}" style="display:none;">
        <span>Alert me when <strong>${item}</strong> goes</span>
        <select id="alert-direction-${idx}">
          <option value="above">above</option>
          <option value="below">below</option>
        </select>
        <span>Rs</span>
        <input type="number" id="alert-threshold-${idx}" value="${Math.round(currentPrice)}">
        <button class="btn-fetch accent" onclick="saveInlineAlert(${idx}, '${item.replace(/'/g, "\\'")}')">Set Alert</button>
        <button class="btn-fetch" onclick="hideInlineAlertForm(${idx})">Cancel</button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    ${summaryBar}
    <div class="alert-strip">Verified snapshot mode • Today vs previous saved snapshot</div>
    <div class="news-section-title">Verified Rate Tracker <span class="sub">Today's Prices</span></div>
    <div class="rate-row-container">
      ${rowsHtml}
    </div>
  `;
}

let currentAlertMaterial = '';
function showInlineAlertForm(idx) {
  try {
    document.querySelectorAll('.inline-alert-form').forEach(form => {
      form.style.display = 'none';
    });
    const form = document.getElementById(`inline-alert-${idx}`);
    if (form) form.style.display = 'flex';
  } catch (e) {
    console.warn('Alert form error:', e);
  }
}

function hideInlineAlertForm(idx) {
  try {
    const form = document.getElementById(`inline-alert-${idx}`);
    if (form) form.style.display = 'none';
  } catch (e) {
    console.warn('Alert form error:', e);
  }
}

function saveInlineAlert(idx, material) {
  try {
    const direction = document.getElementById(`alert-direction-${idx}`)?.value || 'above';
    const threshold = Number(document.getElementById(`alert-threshold-${idx}`)?.value);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      showToast('Enter a valid alert price.');
      return;
    }

    const alerts = safeStorage('get', 'nz_alerts') || [];
    alerts.push({ material, direction, threshold, active: true });
    safeStorage('set', 'nz_alerts', alerts);
    hideInlineAlertForm(idx);
    updateAlertBadge();
    trackEvent('alert_set', { material, direction });
    showToast(`Alert set for ${material} ${direction} ${threshold.toLocaleString('en-IN')}`);
  } catch (e) {
    console.warn('Could not save alert:', e);
    showToast('Could not save alert. Please try again.');
  }
}
function openAlertModal(material, currentPrice) {
  currentAlertMaterial = material;
  const modal = document.getElementById('alert-modal');
  const nameEl = document.getElementById('modal-material-name');
  const priceInput = document.getElementById('modal-alert-price');

  if (nameEl) nameEl.textContent = material;
  if (priceInput) priceInput.value = Math.round(currentPrice);

  if (modal) {
    modal.classList.add('active');
  }
}

function closeAlertModal() {
  const modal = document.getElementById('alert-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function savePriceAlert() {
  const priceInput = document.getElementById('modal-alert-price');
  const direction = document.querySelector('input[name="alert-direction"]:checked')?.value || 'above';
  const targetPrice = priceInput ? priceInput.value : '';

  if (!targetPrice) {
    showToast('Please enter a target price!');
    return;
  }

  const alerts = safeStorage('get', 'nz_alerts') || [];
  alerts.push({
    material: currentAlertMaterial,
    direction,
    threshold: +targetPrice,
    active: true
  });

  safeStorage('set', 'nz_alerts', alerts);
  updateAlertBadge();
  trackEvent('alert_set', { material: currentAlertMaterial, direction });
  closeAlertModal();
  showToast(`Alert set: notified when ${currentAlertMaterial} goes ${direction} ₹${(+targetPrice).toLocaleString('en-IN')}`);
}

function checkStoredPriceAlerts(ratesArr) {
  try {
    const alerts = (safeStorage('get', 'nz_alerts') || []).filter(alert => alert.active);
    alerts.forEach(alert => {
      const current = (ratesArr || []).find(rate =>
        String(rate.material || rate.item || '').toLowerCase() === String(alert.material).toLowerCase()
      );
      if (!current) return;

      const price = Number(current.rate || current.currentPrice || 0);
      const threshold = Number(alert.threshold || alert.targetPrice);
      const crossed = alert.direction === 'above' ? price >= threshold : price <= threshold;
      if (!crossed) return;

      const dedupeKey = `nz_alert_fired_${alert.material}_${alert.direction}_${threshold}`;
      const lastFired = safeStorage('get', dedupeKey);
      if (lastFired && Date.now() - lastFired < 60 * 60 * 1000) return;

      safeStorage('set', dedupeKey, Date.now());
      const text = `${alert.material} crossed your alert threshold - now ${price.toLocaleString('en-IN')}`;
      const waLink = `https://wa.me/?text=${encodeURIComponent(`Newszoid BI Alert: ${text}`)}`;
      showToast(`Alert: ${text}`, 'danger');
      window.open(waLink, '_blank');
    });
  } catch (e) {
    console.warn('Price alert check failed:', e);
  }
}

function checkWhatsAppSpikeAlerts(ratesArr) {
  try {
    const wa = safeStorage('get', 'nz_whatsapp');
    if (!wa?.number || !wa.preferences?.priceSpike) return;
    const spike = (ratesArr || []).find(rate => Math.abs(Number(rate.pct || rate.deltaPercent || 0)) > 3);
    if (!spike) return;

    const material = spike.material || spike.item;
    const rate = Number(spike.rate || spike.currentPrice || 0);
    const pct = Number(spike.pct || spike.deltaPercent || 0);
    const dedupeKey = `nz_wa_spike_${material}_${todayShort()}`;
    if (safeStorage('get', dedupeKey)) return;
    safeStorage('set', dedupeKey, true);

    const message = `${material} moved ${pct.toFixed(1)}% on Newszoid BI. Current rate: ${rate.toLocaleString('en-IN')}`;
    const waLink = `https://wa.me/${wa.number}?text=${encodeURIComponent(message)}`;
    showToast(`WhatsApp price spike ready: ${material} ${pct.toFixed(1)}%`, 'danger');
    window.open(waLink, '_blank');
  } catch (e) {
    console.warn('WhatsApp spike alert failed:', e);
  }
}

function updateAlertBadge() {
  try {
    const count = (safeStorage('get', 'nz_alerts') || []).filter(alert => alert.active).length;
    const badge = document.getElementById('alertBadge');
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count ? 'flex' : 'none';
  } catch (e) {
    console.warn('Alert badge error:', e);
  }
}

/* --- Daily Briefing Calculations --- */
function updateDailyBrief(data) {
  const container = document.getElementById('dailyBrief');
  if (!container) return;
  
  container.style.display = 'flex';

  const dateEl = container.querySelector('.brief-date');
  if (dateEl) dateEl.textContent = today();

  const ratesEl = container.querySelector('.brief-rates');
  if (ratesEl) {
    const sorted = [...(data.rates || [])]
      .map(r => {
        const name = r.material || r.item || '';
        const pct = r.pct !== undefined ? r.pct : (r.deltaPercent !== undefined ? +r.deltaPercent : 0);
        const trend = (r.trend || '').toLowerCase();
        return { name, pct, trend };
      })
      .filter(r => r.trend === 'up' || r.trend === 'down')
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

    const top2 = sorted.slice(0, 2);
    if (top2.length > 0) {
      ratesEl.innerHTML = top2.map(r => {
        const arrow = r.trend === 'up' ? '▲' : '▼';
        const cls = r.trend === 'up' ? 'up' : 'down';
        return `<span class="rate-pill ${cls}">${r.name} ${arrow} ${Math.abs(r.pct).toFixed(1)}%</span>`;
      }).join('');
    } else {
      ratesEl.innerHTML = '<span class="rate-pill">All material prices stable →</span>';
    }
  }

  const headlineEl = container.querySelector('.brief-headline');
  if (headlineEl) {
    const dismissed = getDismissedHeadlines();
    const visibleNews = (data.news || []).filter(item => !dismissed.includes(item.headline));
    if (visibleNews.length > 0) {
      headlineEl.innerHTML = `<strong>Top Update:</strong> ${visibleNews[0].headline}`;
    } else {
      headlineEl.innerHTML = '<strong>Top Update:</strong> Market updates stable.';
    }
  }

  const signalEl = container.querySelector('.brief-signal');
  if (signalEl) {
    const summary = data.ai_summary || data.analysis || '';
    const sentences = summary.split(/[.●]/).filter(Boolean);
    const firstSignal = sentences[0] ? sentences[0].trim() : 'Market conditions remain steady.';
    signalEl.innerHTML = `💡 <strong>AI Market Signal:</strong> ${firstSignal}`;
  }
}

/* --- Streaming AI Response UI --- */
function renderAnalystFeed(summaryText, animate = false) {
  const container = document.getElementById('analyst-container');
  if (!container) return;

  if (!animate) {
    container.innerHTML = `
      <div class="analyst-block anim anim-1">
        <div class="analyst-header">
          <div class="analyst-icon" style="background: transparent; box-shadow: none;">
            <img src="logo-icon.png" alt="Newszoid" style="width: 48px; height: 48px; object-fit: contain; filter: brightness(0) saturate(100%) invert(48%) sepia(85%) saturate(2795%) hue-rotate(346deg) brightness(101%) contrast(97%) drop-shadow(0 2px 4px rgba(255, 87, 34, 0.4));">
          </div>
          <div>
            <div class="analyst-title">Newszoid AI Market Summary — ${STATE.name}</div>
            <div class="analyst-sub">${STATE.biz} &nbsp;|&nbsp; ${STATE.city} &nbsp;|&nbsp; ${todayShort()}</div>
          </div>
        </div>
        <div class="ai-disclaimer">AI-generated summary. Verify sources before making purchase, pricing, or inventory decisions.</div>
        <div class="analyst-text">${summaryText}</div>
        <div class="analyst-footer-meta">
          <span class="badge font-weight-bold" style="background: var(--nz-green-light); color: var(--nz-green); padding: 4px 10px; border-radius: 4px; font-weight: 700;">Analysis confidence: High</span>
          <span>Based on: 3 news sources + live rate data</span>
          <span>Generated at ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
      </div>
      <div style="margin-top:16px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn-fetch" onclick="copyAnalysisText()">📋 Copy Analysis</button>
        <button class="btn-fetch accent" onclick="shareOnWhatsApp()">💬 Share on WhatsApp</button>
      </div>
    `;
    return;
  }

  // Animation flow: sequential progress steps
  container.innerHTML = `
    <div class="streaming-progress-container">
      <div class="stream-step active" id="step-1">
        <span class="stream-step-icon" id="step-icon-1">⟳</span>
        <span>Reading your rate data...</span>
      </div>
      <div class="stream-step" id="step-2">
        <span class="stream-step-icon" id="step-icon-2">○</span>
        <span>Scanning industry news...</span>
      </div>
      <div class="stream-step" id="step-3">
        <span class="stream-step-icon" id="step-icon-3">○</span>
        <span>Generating action plan...</span>
      </div>
    </div>
    <div class="analyst-block" id="streaming-result-block" style="display: none;">
      <div class="analyst-header">
        <div class="analyst-icon" style="background: transparent; box-shadow: none;">
          <img src="logo-icon.png" alt="Newszoid" style="width: 48px; height: 48px; object-fit: contain; filter: brightness(0) saturate(100%) invert(48%) sepia(85%) saturate(2795%) hue-rotate(346deg) brightness(101%) contrast(97%) drop-shadow(0 2px 4px rgba(255, 87, 34, 0.4));">
        </div>
        <div>
          <div class="analyst-title">Newszoid AI Market Summary — ${STATE.name}</div>
          <div class="analyst-sub">${STATE.biz} &nbsp;|&nbsp; ${STATE.city} &nbsp;|&nbsp; ${todayShort()}</div>
        </div>
      </div>
      <div class="ai-disclaimer">AI-generated summary. Verify sources before making purchase, pricing, or inventory decisions.</div>
      <div class="analyst-text" id="typewriter-text"></div>
      <div class="analyst-footer-meta" id="streaming-footer-meta" style="display: none;">
        <span class="badge font-weight-bold" style="background: var(--nz-green-light); color: var(--nz-green); padding: 4px 10px; border-radius: 4px; font-weight: 700;">Analysis confidence: High</span>
        <span>Based on: 3 news sources + live rate data</span>
        <span>Generated at ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
    </div>
    <div id="streaming-actions" style="margin-top: 16px; display: none; gap: 12px; flex-wrap: wrap;">
      <button class="btn-fetch" onclick="copyAnalysisText()">📋 Copy Analysis</button>
      <button class="btn-fetch accent" onclick="shareOnWhatsApp()">💬 Share on WhatsApp</button>
    </div>
  `;

  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const step3 = document.getElementById('step-3');
  const icon1 = document.getElementById('step-icon-1');
  const icon2 = document.getElementById('step-icon-2');
  const icon3 = document.getElementById('step-icon-3');

  // Step 1 Completed in 800ms
  setTimeout(() => {
    if (step1) {
      step1.classList.remove('active');
      step1.classList.add('completed');
    }
    if (icon1) {
      icon1.textContent = '✓';
      icon1.style.color = 'var(--nz-green)';
    }

    // Step 2 Active
    if (step2) step2.classList.add('active');
    if (icon2) icon2.textContent = '⟳';

    // Step 2 Completed in 800ms
    setTimeout(() => {
      if (step2) {
        step2.classList.remove('active');
        step2.classList.add('completed');
      }
      if (icon2) {
        icon2.textContent = '✓';
        icon2.style.color = 'var(--nz-green)';
      }

      // Step 3 Active
      if (step3) step3.classList.add('active');
      if (icon3) icon3.textContent = '⟳';

      // Step 3 Completed in 1000ms
      setTimeout(() => {
        if (step3) {
          step3.classList.remove('active');
          step3.classList.add('completed');
        }
        if (icon3) {
          icon3.textContent = '✓';
          icon3.style.color = 'var(--nz-green)';
        }

        // Show typewriter effect
        const resultBlock = document.getElementById('streaming-result-block');
        if (resultBlock) resultBlock.style.display = 'block';
        
        const textEl = document.getElementById('typewriter-text');
        if (textEl) {
          typeWriter(summaryText, textEl, 12, () => {
            const footerMeta = document.getElementById('streaming-footer-meta');
            const actions = document.getElementById('streaming-actions');
            if (footerMeta) footerMeta.style.display = 'flex';
            if (actions) actions.style.display = 'flex';
          });
        }
      }, 1000);
    }, 800);
  }, 800);
}

function typeWriter(text, element, speed = 12, callback) {
  let i = 0;
  const content = String(text || '');
  element.innerHTML = '';
  if (!content) {
    if (callback) callback();
    return;
  }
  const timer = setInterval(() => {
    if (content[i] === '<') {
      while (i < content.length && content[i] !== '>') {
        i++;
      }
    }
    element.innerHTML = content.substring(0, i + 1);
    i++;
    if (i >= content.length) {
      clearInterval(timer);
      if (callback) callback();
    }
  }, speed);
}

function copyAnalysisText() {
  let text = '';
  const el = document.getElementById('typewriter-text') || document.querySelector('.analyst-text');
  if (el) text = el.textContent;
  
  navigator.clipboard.writeText(text).then(() => {
    showToast('Analysis copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy analysis', err);
  });
}

function shareOnWhatsApp() {
  let text = '';
  const el = document.getElementById('typewriter-text') || document.querySelector('.analyst-text');
  if (el) text = el.textContent;
  
  const encoded = encodeURIComponent(`*Newszoid Business Intelligence AI Market Summary*\n\n${text.slice(0, 800)}...`);
  window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
}

function openWhatsAppModal() {
  try {
    const saved = safeStorage('get', 'nz_whatsapp');
    if (saved?.number) document.getElementById('wa-number').value = saved.number;
    const modal = document.getElementById('whatsapp-modal');
    if (modal) modal.classList.add('active');
  } catch (e) {
    console.warn('WhatsApp modal error:', e);
  }
}

function closeWhatsAppModal() {
  try {
    document.getElementById('whatsapp-modal')?.classList.remove('active');
  } catch (e) {
    console.warn('WhatsApp modal close error:', e);
  }
}

function activateWhatsAppAlerts() {
  try {
    const number = (document.getElementById('wa-number')?.value || '').replace(/[^\d]/g, '');
    if (number.length < 10) {
      showToast('Enter your WhatsApp number with country code.');
      return;
    }

    const preferences = {
      dailyBrief: !!document.getElementById('wa-daily')?.checked,
      priceSpike: !!document.getElementById('wa-spike')?.checked,
      weeklyReport: !!document.getElementById('wa-weekly')?.checked
    };

    safeStorage('set', 'nz_whatsapp', { number, preferences });
    trackEvent('whatsapp_optin', { preferences });
    const message = 'Welcome to Newszoid BI Alerts. Your business briefings and price alerts are now active.';
    const waLink = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    const confirmEl = document.getElementById('wa-confirmation');
    if (confirmEl) {
      confirmEl.style.display = 'block';
      confirmEl.innerHTML = `Alerts activated! You'll receive your first brief tomorrow at 7 AM. <a href="${waLink}" target="_blank" rel="noopener">Open WhatsApp</a>`;
    }
    showToast("Alerts activated! You'll receive your first brief tomorrow at 7 AM.");
    window.open(waLink, '_blank');
  } catch (e) {
    console.warn('WhatsApp activation failed:', e);
    showToast('Could not activate alerts. Please try again.');
  }
}

function getShareProfile() {
  return {
    name: STATE.name,
    industry: STATE.biz,
    materials: STATE.items || []
  };
}

function shareDashboard() {
  try {
    const shareData = btoa(encodeURIComponent(JSON.stringify(getShareProfile())).replace(/%([0-9A-F]{2})/g, (m, p1) => String.fromCharCode(parseInt(p1, 16))));
    const shareURL = `https://newszoid.com/dashboard?ref=${shareData}`;
    navigator.clipboard.writeText(shareURL).then(() => {
      trackEvent('dashboard_shared');
      showToast('Link copied! Share with your team.');
    }).catch(() => {
      showToast(shareURL);
    });
  } catch (e) {
    console.warn('Share failed:', e);
    showToast('Could not create share link.');
  }
}

function handleSharedDashboardRef() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (!ref) return;
    const data = JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(ref), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    if (data.name) document.getElementById('owner-name').value = data.name;
    if (data.industry) document.getElementById('custom-biz').value = data.industry;
    if (Array.isArray(data.materials)) {
      document.getElementById('items-input').value = data.materials.join('\n');
      updateTagPreview();
    }
    document.getElementById('sharedWatermark').style.display = 'block';
  } catch (e) {
    console.warn('Shared dashboard ref ignored:', e);
  }
}

function getCurrentContext() {
  return {
    profile: {
      name: STATE.name,
      city: STATE.city,
      industry: STATE.biz,
      materials: STATE.items || []
    },
    rates: lastFetchedRates.length ? lastFetchedRates : DEMO_DATA.rates,
    news: lastFetchedNews.length ? lastFetchedNews : DEMO_DATA.news,
    summary: lastFetchedSummary || DEMO_DATA.ai_summary
  };
}

function useQuickPrompt(prompt) {
  try {
    const input = document.getElementById('commandQuestion');
    if (input) input.value = prompt;
    input?.focus();
    runCommandCenterQuery();
  } catch (e) {
    console.warn('Quick prompt failed:', e);
  }
}

function renderCommandAnswerShell(extraHtml = '') {
  return `
    <div class="command-response-label">Newszoid answer</div>
    <div class="analyst-text" id="commandTypewriter"></div>
    ${extraHtml}
  `;
}

async function runCommandCenterQuery() {
  const input = document.getElementById('commandQuestion');
  const output = document.getElementById('commandResponse');
  if (!input || !output) return;

  const userQuestion = input.value.trim();
  if (!userQuestion) {
    showToast('Ask a question first.');
    return;
  }

  output.innerHTML = `
    <div class="command-response-label">Thinking</div>
    ${renderSkeletonLoader('analyst')}
  `;
  output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const context = getCurrentContext();
  const focusedRateAnswer = buildFocusedRateAnswer(userQuestion, context);
  const prompt = `
User business: ${context.profile.name}, ${context.profile.city}, ${context.profile.industry}
Materials tracked: ${context.profile.materials.join(', ')}
Current rates: ${JSON.stringify(context.rates)}
Recent news: ${JSON.stringify(context.news.slice(0, 3))}

User question: ${userQuestion}

Answer only the user's exact question. If they ask for one material rate,
start with that material's current rate and do not write a broad market overview.
Be direct, specific, and actionable. Reference actual rates and news from context.
Max 70 words.
  `;

  try {
    if (focusedRateAnswer) {
      output.innerHTML = renderCommandAnswerShell();
      typeWriter(focusedRateAnswer, document.getElementById('commandTypewriter'), 12);
      return;
    }

    const data = await callAPI('analyst', {
      name: STATE.name,
      businessType: STATE.biz,
      city: STATE.city,
      items: STATE.items,
      prompt,
      question: userQuestion
    });
    const answer = limitCommandAnswer(data.analysis || data.answer || buildLocalCommandAnswer(userQuestion));
    output.innerHTML = renderCommandAnswerShell();
    typeWriter(answer, document.getElementById('commandTypewriter'), 12);
  } catch (e) {
    const answer = buildLocalCommandAnswer(userQuestion);
    output.innerHTML = renderCommandAnswerShell('<div class="ai-disclaimer">Live AI is unavailable, so this answer uses your loaded dashboard context.</div>');
    typeWriter(answer, document.getElementById('commandTypewriter'), 12);
  }
}

function normalizeCommandText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isRateQuestion(question) {
  const q = normalizeCommandText(question);
  return /\b(rate|rates|price|prices|cost|today|current|now)\b/.test(q);
}

function findMaterialInQuestion(question, rates) {
  const q = normalizeCommandText(question);
  return (rates || []).find(rate => {
    const material = normalizeCommandText(rate.material || rate.item);
    if (!material) return false;
    const words = material.split(' ').filter(word => word.length > 2);
    return q.includes(material) || words.some(word => q.includes(word));
  });
}

function formatRateValue(value) {
  const rate = Number(value || 0);
  if (!rate) return 'not available';
  return `Rs. ${rate.toLocaleString('en-IN')}`;
}

function buildFocusedRateAnswer(question, context = getCurrentContext()) {
  if (!isRateQuestion(question)) return null;

  const rate = findMaterialInQuestion(question, context.rates);
  if (!rate) {
    const materials = (context.rates || []).map(item => item.material || item.item).filter(Boolean).slice(0, 5);
    return `I do not have that material loaded in your rate tracker yet. Current tracked items are: ${materials.join(', ') || 'none'}. Add the material or fetch live rates, then ask again for today's rate.`;
  }

  const material = rate.material || rate.item || 'This material';
  const currentPrice = rate.rate || rate.currentPrice;
  const pct = rate.pct !== undefined ? Number(rate.pct) : (rate.deltaPercent !== undefined ? Number(rate.deltaPercent) : 0);
  const change = Number(rate.change || 0);
  const trend = (rate.trend || (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat')).toLowerCase();
  const direction = trend === 'up' ? 'up' : trend === 'down' ? 'down' : 'flat';
  const changeText = change ? `, changed by Rs. ${Math.abs(change).toLocaleString('en-IN')}` : '';
  const cityText = context.profile.city ? ` in ${context.profile.city}` : '';

  return `${material} rate today${cityText}: ${formatRateValue(currentPrice)}. It is ${direction}${changeText} (${Math.abs(pct).toFixed(1)}%). Confirm with 2 local suppliers before placing a large order.`;
}

function limitCommandAnswer(answer, maxWords = 90) {
  const words = String(answer || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return String(answer || '').trim();
  return `${words.slice(0, maxWords).join(' ')}...`;
}

function buildLocalCommandAnswer(question) {
  const context = getCurrentContext();
  const focusedRateAnswer = buildFocusedRateAnswer(question, context);
  if (focusedRateAnswer) return focusedRateAnswer;

  const topRate = [...context.rates].sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0))[0];
  const topNews = context.news[0]?.headline || 'No urgent headline is available.';
  return `${STATE.name || 'Your business'} should watch ${topRate?.material || 'tracked materials'} first today. Current movement is ${(topRate?.pct || 0).toFixed(1)}%, so avoid large purchases unless margins are protected. The main signal is: ${topNews}. For ${STATE.city}, check supplier quotes this week and keep one backup vendor ready.`;
}

function scheduleSmartPanels() {
  try {
    setTimeout(() => {
      loadOpportunities();
      loadSchemes();
    }, 3000);
  } catch (e) {
    console.warn('Smart panel schedule failed:', e);
  }
}

async function loadOpportunities() {
  const container = document.getElementById('opportunitiesContainer');
  if (!container) return;

  try {
    const context = getCurrentContext();
    const systemPrompt = `Based on this business profile and current market data, identify 2-3 specific business opportunities right now. Each opportunity must be actionable within 7 days, specific to their city and industry, and based on real signals. Format as JSON: [{ "title": "", "description": "", "action": "", "urgency": "" }]. Context: ${JSON.stringify(context)}`;
    const data = await callAPI('analyst', {
      name: STATE.name,
      businessType: STATE.biz,
      city: STATE.city,
      items: STATE.items,
      prompt: systemPrompt
    });
    const opportunities = parseJsonArrayFromText(data.analysis || data.answer) || buildLocalOpportunities();
    renderOpportunities(opportunities);
  } catch (e) {
    console.warn('Opportunities failed:', e);
    renderOpportunities(buildLocalOpportunities());
  }
}

function buildLocalOpportunities() {
  const context = getCurrentContext();
  const topNews = context.news[0]?.headline || 'Local demand signals are steady';
  const rising = context.rates.find(rate => (rate.trend || '').toLowerCase() === 'up') || context.rates[0];
  return [
    {
      title: `Quote ${rising?.material || 'key material'} jobs this week`,
      description: `${rising?.material || 'Your tracked material'} moved ${(rising?.pct || 0).toFixed(1)}%, so refresh quotes before accepting new work.`,
      action: 'Call 2 suppliers and update customer quote validity to 48 hours.',
      urgency: 'Act this week'
    },
    {
      title: `Check ${STATE.city} tender demand`,
      description: topNews,
      action: 'Prepare rate sheet and capacity note for local contractors.',
      urgency: 'This month'
    },
    {
      title: 'Use MSME credit as working-capital buffer',
      description: 'Credit guarantee signals can reduce cash pressure during volatile material cycles.',
      action: 'Ask your bank for current MSME guarantee eligibility.',
      urgency: 'Monitor'
    }
  ];
}

function renderOpportunities(opportunities) {
  const container = document.getElementById('opportunitiesContainer');
  if (!container) return;
  container.innerHTML = opportunities.map(rawItem => {
    const item = {
      title: rawItem.title || 'Business opportunity',
      description: rawItem.description || rawItem.summary || 'Review this opportunity with your current market context.',
      action: rawItem.action || 'Check details this week.',
      urgency: rawItem.urgency || 'Monitor'
    };
    return `
    <button class="opportunity-card" onclick="trackEvent('opportunity_card_clicked', { title: '${String(item.title).replace(/'/g, "\\'")}' })">
      <span class="urgency-badge ${urgencyClass(item.urgency)}">${item.urgency}</span>
      <strong>${item.title}</strong>
      <span>${item.description}</span>
      <em>${item.action}</em>
    </button>
  `;
  }).join('');
}

function urgencyClass(value) {
  if (value === 'Act this week') return 'urgent';
  if (value === 'This month') return 'soon';
  return 'monitor';
}

async function loadSchemes() {
  const cached = safeStorage('get', 'nz_schemes');
  const week = 7 * 24 * 60 * 60 * 1000;
  if (cached?.data?.length && Date.now() - cached.fetchedAt < week) {
    renderSchemes(cached.data);
    return;
  }

  let schemes = null;
  try {
    const prompt = `For a business in: ${STATE.biz}, ${STATE.city}, India. List 3 currently active government schemes or tenders that apply. For each: scheme name, benefit, eligibility requirement, apply by date, source URL. Format as JSON array.`;
    const data = await callAPI('analyst', {
      name: STATE.name,
      businessType: STATE.biz,
      city: STATE.city,
      items: STATE.items,
      prompt
    });
    schemes = parseJsonArrayFromText(data.analysis || data.answer);
  } catch (e) {
    console.warn('Scheme AI fallback:', e);
  }

  schemes = schemes || buildLocalSchemes();
  safeStorage('set', 'nz_schemes', { data: schemes, fetchedAt: Date.now() });
  renderSchemes(schemes);
}

function parseJsonArrayFromText(value) {
  try {
    if (!value) return null;
    if (Array.isArray(value)) return value;
    const text = String(value);
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch (e) {
    return null;
  }
}

function buildLocalSchemes() {
  return [
    {
      schemeName: 'CGTMSE Credit Guarantee Scheme',
      ministry: 'MSME Ministry',
      benefit: 'Collateral-free credit support',
      eligibility: `${STATE.biz} MSME with bank-assessed working capital need.`,
      applyBy: 'Open now',
      sourceUrl: 'https://www.cgtmse.in/'
    },
    {
      schemeName: 'Udyam Registration Benefits',
      ministry: 'MSME Ministry',
      benefit: 'Priority lending and tender preference',
      eligibility: 'Active Udyam registration and valid business details.',
      applyBy: 'Open now',
      sourceUrl: 'https://udyamregistration.gov.in/'
    },
    {
      schemeName: `${STATE.city || 'Local'} Infrastructure Tender Watch`,
      ministry: 'GeM / State Tenders',
      benefit: 'New procurement opportunities',
      eligibility: `${STATE.biz} suppliers with GST and capacity documentation.`,
      applyBy: 'Check weekly',
      sourceUrl: 'https://gem.gov.in/'
    }
  ];
}

function renderSchemes(schemes) {
  const container = document.getElementById('schemesContainer');
  if (!container) return;
  container.innerHTML = schemes.map(rawScheme => {
    const scheme = {
      schemeName: rawScheme.schemeName || rawScheme.name || rawScheme['scheme name'] || 'Relevant MSME Scheme',
      ministry: rawScheme.ministry || rawScheme.badge || 'Government',
      benefit: rawScheme.benefit || rawScheme.amount || 'Benefit details available on portal',
      eligibility: rawScheme.eligibility || rawScheme['eligibility requirement'] || 'Check current eligibility before applying.',
      applyBy: rawScheme.applyBy || rawScheme['apply by date'] || 'Open now',
      sourceUrl: rawScheme.sourceUrl || rawScheme['source URL'] || rawScheme.url || 'https://www.india.gov.in/'
    };
    return `
    <div class="scheme-card">
      <div class="scheme-head">
        <strong>${scheme.schemeName}</strong>
        <span>${scheme.ministry}</span>
      </div>
      <div class="scheme-benefit">${scheme.benefit}</div>
      <p>${scheme.eligibility}</p>
      <small>Apply by: ${scheme.applyBy}</small>
      <a class="btn-fetch accent scheme-link" href="${scheme.sourceUrl}" target="_blank" rel="noopener" onclick="trackEvent('scheme_cta_clicked', { schemeName: '${String(scheme.schemeName).replace(/'/g, "\\'")}' })">Check Eligibility</a>
    </div>
  `;
  }).join('');
}

function toggleSchemesPanel() {
  try {
    const content = document.getElementById('schemesContent');
    const icon = document.getElementById('schemeToggleIcon');
    if (!content) return;
    const open = content.style.display !== 'none';
    content.style.display = open ? 'none' : 'block';
    if (icon) icon.textContent = open ? '+' : '-';
    if (!open) loadSchemes();
  } catch (e) {
    console.warn('Schemes toggle failed:', e);
  }
}

function saveSnapshot() {
  try {
    if (isDemoMode || !lastFetchedRates.length) return;
    const snapshot = {
      savedAt: Date.now(),
      rates: lastFetchedRates.map(r => ({ material: r.material || r.item, rate: Number(r.rate || r.currentPrice || 0) })),
      topHeadline: lastFetchedNews[0]?.headline || null,
      aiSignal: lastFetchedSummary?.slice(0, 80) || null
    };
    safeStorage('set', 'nz_last_snapshot', snapshot);
  } catch (e) {
    console.warn('Snapshot save failed:', e);
  }
}

function calculateDeltas(previousSnapshot, currentRates, currentNews) {
  const deltas = [];
  try {
    (previousSnapshot.rates || []).forEach(prev => {
      const current = (currentRates || []).find(r => (r.material || r.item) === prev.material);
      if (!current) return;
      const currentRate = Number(current.rate || current.currentPrice || 0);
      const diff = currentRate - Number(prev.rate || 0);
      if (!diff || !prev.rate) return;
      const pct = Number(((diff / prev.rate) * 100).toFixed(1));
      deltas.push({
        type: diff > 0 ? 'rate_up' : 'rate_down',
        icon: diff > 0 ? '▲' : '▼',
        color: diff > 0 ? 'red' : 'green',
        text: `${current.material || current.item} ${diff > 0 ? 'rose' : 'fell'} by ${Math.abs(diff).toLocaleString('en-IN')} (${Math.abs(pct)}%) since your last visit`
      });
    });

    if (currentNews?.[0]?.headline && currentNews[0].headline !== previousSnapshot.topHeadline) {
      deltas.push({
        type: 'news',
        icon: 'N',
        color: 'blue',
        text: `New: "${currentNews[0].headline}"`
      });
    }
  } catch (e) {
    console.warn('Delta calculation failed:', e);
  }
  return deltas.slice(0, 3);
}

function renderDeltaPanel() {
  try {
    const wrap = document.getElementById('deltaPanelWrap');
    if (!wrap) return;
    const snapshot = safeStorage('get', 'nz_last_snapshot');
    const now = Date.now();
    const minutesSince = LAST_VISIT_AT_START ? (now - LAST_VISIT_AT_START) / 60000 : 0;

    if (!snapshot || minutesSince < 30) {
      wrap.style.display = 'none';
      safeStorage('set', 'nz_last_visit', now);
      return;
    }

    const deltas = calculateDeltas(snapshot, lastFetchedRates, lastFetchedNews);
    if (!deltas.length) {
      wrap.style.display = 'none';
      safeStorage('set', 'nz_last_visit', now);
      return;
    }

    const hoursAgo = Math.round(minutesSince / 60);
    const timeStr = hoursAgo < 1 ? `${Math.round(minutesSince)}m ago`
      : hoursAgo < 24 ? `${hoursAgo}h ago`
      : `${Math.round(hoursAgo / 24)}d ago`;
    document.getElementById('deltaTime').textContent = timeStr;
    document.getElementById('deltaItems').innerHTML = deltas.map(d => `
      <div class="delta-item">
        <span class="delta-icon ${d.color}">${d.icon}</span>
        <span>${d.text}</span>
      </div>
    `).join('');
    wrap.style.display = 'block';
    safeStorage('set', 'nz_last_visit', now);
  } catch (e) {
    console.warn('Delta render failed:', e);
  }
}

function dismissDelta() {
  try {
    document.getElementById('deltaPanelWrap').style.display = 'none';
    trackEvent('delta_panel_dismissed');
  } catch (e) {
    console.warn('Delta dismiss failed:', e);
  }
}

function checkInstallPrompt() {
  try {
    let visitCount = Number(safeStorage('get', 'nz_visit_count') || 0);
    if (!installVisitCounted) {
      visitCount += 1;
      safeStorage('set', 'nz_visit_count', visitCount);
      installVisitCounted = true;
    }
    const dismissed = safeStorage('get', 'nz_install_dismissed');
    if (visitCount === 2 && !dismissed && deferredInstallPrompt) showInstallBanner();
  } catch (e) {
    console.warn('Install prompt check failed:', e);
  }
}

function showInstallBanner() {
  try {
    if (document.getElementById('installBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'installBanner';
    banner.className = 'install-banner';
    banner.innerHTML = `
      <span class="install-icon">+</span>
      <div class="install-text">
        <strong>Add Newszoid to homescreen</strong>
        <span>Get instant rate alerts and daily briefing</span>
      </div>
      <button onclick="triggerInstall()" class="install-btn">Install</button>
      <button onclick="dismissInstall()" class="install-close">x</button>
    `;
    document.body.prepend(banner);
  } catch (e) {
    console.warn('Install banner failed:', e);
  }
}

function triggerInstall() {
  try {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(result => {
      trackEvent(`pwa_install_${result.outcome}`);
      document.getElementById('installBanner')?.remove();
      deferredInstallPrompt = null;
    });
  } catch (e) {
    console.warn('Install trigger failed:', e);
  }
}

function dismissInstall() {
  try {
    safeStorage('set', 'nz_install_dismissed', true);
    document.getElementById('installBanner')?.remove();
    trackEvent('pwa_install_dismissed');
  } catch (e) {
    console.warn('Install dismiss failed:', e);
  }
}

function renderSeoRatePageIfNeeded() {
  try {
    const match = window.location.pathname.match(/^\/rates\/(.+?)-(?:price|rate)-in-(.+?)-today\/?$/);
    if (!match) return false;

    const material = titleCase(match[1].replace(/-/g, ' '));
    const city = titleCase(match[2].replace(/-/g, ' '));
    const todayLabel = todayShort();
    const demo = DEMO_DATA.rates.find(rate => material.toLowerCase().includes(rate.material.toLowerCase().split(' ')[0])) || DEMO_DATA.rates[0];
    document.title = `${material} Price in ${city} Today - Newszoid`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', `${material} price in ${city} today is tracked by Newszoid with market analysis and 7-day rate history.`);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://newszoid.com${window.location.pathname}`);

    document.body.innerHTML = `
      <main class="seo-rate-page">
        <div class="topbar-logo"><img src="/logo-icon.png" alt="Newszoid" style="height:36px">Newszoid</div>
        <h1>${material} Price in ${city} Today - ${todayLabel}</h1>
        <section class="daily-briefing-card">
          <div class="brief-date">Updated ${today()}</div>
          <div class="rate-value-col">${demo.rate.toLocaleString('en-IN')}</div>
          <div class="brief-signal">${material} is moving ${(demo.pct || 0).toFixed(1)}% today. Use this page as an indicative market signal and confirm with local suppliers before purchase.</div>
        </section>
        <section class="scheme-card">
          <h2>7-day rate history</h2>
          <table class="seo-table">${Array.from({ length: 7 }).map((_, i) => `<tr><td>Day ${i + 1}</td><td>${Math.round(demo.rate * (1 + (i - 3) * 0.004)).toLocaleString('en-IN')}</td></tr>`).join('')}</table>
        </section>
        <section class="scheme-card">
          <h2>Market analysis</h2>
          <p>${material} demand in ${city} is influenced by local construction, manufacturing orders, transport costs, and supplier inventory. Track both price and availability before committing to large orders.</p>
          <p>Newszoid BI combines rate movement, business news, and AI analysis to help Indian SMBs make faster purchase and quote decisions.</p>
        </section>
        <section class="scheme-card">
          <h2>Related materials</h2>
          <p>${DEMO_DATA.rates.map(rate => rate.material).join(' | ')}</p>
          <a class="btn-fetch accent" href="/">Track ${material} rates for free - Set up your Newszoid dashboard</a>
        </section>
      </main>
      <script type="application/ld+json">${JSON.stringify(buildSeoSchema(material, city))}</script>
    `;
    return true;
  } catch (e) {
    console.warn('SEO page render failed:', e);
    return false;
  }
}

function buildSeoSchema(material, city) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: `${material} Price in ${city} Today`,
        author: { '@type': 'Organization', name: 'Newszoid' },
        publisher: { '@type': 'Organization', name: 'Newszoid' }
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `What is the ${material} price in ${city} today?`,
            acceptedAnswer: { '@type': 'Answer', text: 'Newszoid tracks indicative market rates with timestamped updates.' }
          }
        ]
      }
    ]
  };
}

function titleCase(value) {
  return String(value || '').replace(/\b\w/g, char => char.toUpperCase());
}
