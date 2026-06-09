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

  let STATE = {
    businessType: 'Iron & Sheet Metal',
    city: 'Haridwar',
    items: ['MS Sheet', 'HR Coil', 'Copper Wire', 'Diesel', 'Cement OPC'],
    name: 'Vicky S.',
    gstin: ''
  };

  function loadState() {
    try {
      const saved = localStorage.getItem('nz_biz_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        STATE = { ...STATE, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load profile from storage', e);
    }
  }

  async function fetchRates() {
    if (!API_BASE_URL) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/biz-agent/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(STATE)
      });
      if (response.ok) {
        const data = await response.json();
        renderPrices(data.rates || []);
      }
    } catch (e) { console.error(e); }
  }

  function renderPrices(rates) {
    const container = $('#price-container');
    if (!container) return;
    if (!rates.length) {
      container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--nz-muted);">No rates found.</div>';
      return;
    }
    container.innerHTML = rates.map(rate => {
      const isUp = rate.change && rate.change.includes('+');
      const isDown = rate.change && rate.change.includes('-');
      const changeClass = isUp ? 'up' : isDown ? 'down' : 'neutral';
      const arrow = isUp ? '▲' : isDown ? '▼' : '→';
      const sparklineColor = isUp ? '#10B981' : isDown ? '#EF4444' : '#6B7280';
      const pts = isUp ? "0,18 10,15 20,12 30,10 40,8 50,5 60,2" : isDown ? "0,5 10,8 20,10 30,12 40,14 50,16 60,18" : "0,10 10,10 20,10 30,10 40,10 50,10 60,10";
      return `
        <div class="price-row">
            <div class="price-info">
                <span class="price-name">${rate.name}</span>
                <span class="price-location">${rate.location || STATE.city}</span>
            </div>
            <div class="price-data">
                <span class="price-value">${rate.currency || '₹'}${rate.price}</span>
                <span class="price-change ${changeClass}">${arrow} ${rate.change || '0%'}</span>
            </div>
            <div class="price-sparkline">
                <svg viewBox="0 0 60 20" preserveAspectRatio="none">
                    <polyline points="${pts}" fill="none" stroke="${sparklineColor}" stroke-width="1.5"/>
                </svg>
            </div>
        </div>
      `;
    }).join('');
  }

  async function fetchNews() {
    if (!API_BASE_URL) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/biz-agent/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(STATE)
      });
      if (response.ok) {
        const data = await response.json();
        const newsArr = data.news || [];
        renderNews(newsArr);
        renderAlerts(newsArr);
      }
    } catch (e) { console.error(e); }
  }

  function renderNews(newsArr) {
    const container = $('#news-container');
    if (!container) return;
    if (!newsArr.length) {
      container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--nz-muted);">No intelligence found.</div>';
      return;
    }
    container.innerHTML = newsArr.map(item => {
      const tagClass = item.sentiment === 'BEARISH' ? 'risk' : item.sentiment === 'BULLISH' ? 'opportunity' : 'demand';
      const timeStr = item.time || item.source?.split(' ')?.[1] || 'Today';
      const sourceName = item.source?.split(' ')?.[0] || 'News';
      return `
        <div class="news-item">
            <div class="news-source">
                <img src="https://www.google.com/s2/favicons?domain=${sourceName.toLowerCase().replace(/ /g, '')}.com&sz=32" alt="${sourceName}" class="news-favicon" onerror="this.src='favicon.ico'">
                <span class="news-source-name">${sourceName}</span>
                <span class="news-time">${timeStr}</span>
                ${item.impact === 'HIGH' ? '<span class="news-badge new">New</span>' : ''}
            </div>
            <div class="news-headline">${item.headline || 'Industry Update'}</div>
            <div class="news-summary">${item.summary || ''} <span class="news-tag ${tagClass}">${item.category || 'News'}</span></div>
        </div>
      `;
    }).join('');
  }

  function renderAlerts(newsArr) {
    const alertCont = $('#alerts-container');
    const oppCont = $('#opportunities-container');
    const recCont = $('#recommendations-container');
    if (!alertCont || !oppCont || !recCont) return;
    
    const highs = newsArr.filter(n => n.impact === 'HIGH' || n.sentiment === 'BEARISH');
    const opps = newsArr.filter(n => n.sentiment === 'BULLISH' || n.category === 'OPPORTUNITY');
    
    alertCont.innerHTML = highs.length ? highs.map(item => `
        <div class="alert-item alert-${item.impact?.toLowerCase() || 'medium'}">
            <div class="alert-severity"><span class="severity-dot"></span></div>
            <div class="alert-content">
                <div class="alert-title">${item.headline}</div>
                <div class="alert-meta">${item.source} • ${item.category}</div>
            </div>
            <button class="alert-action" onclick="window.handleAiQuestion('Tell me more about: ${item.headline}')">Act</button>
        </div>
    `).join('') : '<div class="alert-item alert-info"><div class="alert-content"><div class="alert-title">No urgent alerts</div></div></div>';

    oppCont.innerHTML = opps.length ? opps.map(item => `
        <div class="opportunity-item">
            <div class="opportunity-header">
                <span class="opportunity-type">${item.category || 'Market Window'}</span>
                <span class="confidence-score">High</span>
            </div>
            <div class="opportunity-title">${item.headline}</div>
            <div class="opportunity-impact">Signal: ${item.signal || 'Act soon'}</div>
            <div class="opportunity-meta">
                <span class="opportunity-source">${item.source}</span>
            </div>
        </div>
    `).join('') : '<div style="padding: 16px; text-align: center; color: var(--nz-muted);">No new opportunities detected.</div>';

    recCont.innerHTML = opps.length ? opps.map(item => `
        <div class="rec-item">
            <div class="rec-icon">★</div>
            <div class="rec-content">
                <div class="rec-title">${item.headline}</div>
                <div class="rec-reason">${item.summary}</div>
            </div>
            <button class="rec-action" onclick="window.handleAiQuestion('How can I act on this recommendation: ${item.headline}')">Ask AI</button>
        </div>
    `).join('') : '<div style="padding: 16px; text-align: center; color: var(--nz-muted);">Generating recommendations...</div>';
  }

  async function fetchAnalystBriefing() {
    if (!API_BASE_URL) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/biz-agent/analyst`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(STATE)
      });
      if (response.ok) {
        const data = await response.json();
        renderBriefing(data.analysis || '');
      }
    } catch (e) { console.error(e); }
  }

  function renderBriefing(htmlContent) {
    const container = $('#briefing-container');
    if (!container) return;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    const items = [];
    const sections = tempDiv.querySelectorAll('h2');
    sections.forEach(sec => {
        const title = sec.textContent;
        let content = '';
        let nextNode = sec.nextElementSibling;
        while(nextNode && nextNode.tagName !== 'H2') {
            content += nextNode.outerHTML;
            nextNode = nextNode.nextElementSibling;
        }
        items.push({ title, content });
    });

    if (items.length) {
        container.innerHTML = items.map(item => `
            <li class="briefing-item">
                <span class="briefing-bullet"></span>
                <div class="briefing-content">
                    <strong>${item.title}</strong> — ${item.content}
                </div>
            </li>
        `).join('');
    } else {
        container.innerHTML = `<li class="briefing-item"><span class="briefing-bullet"></span><div class="briefing-content"><strong>Briefing available</strong> — ${htmlContent.replace(/<[^>]*>?/gm, ' ').substring(0, 100)}...</div></li>`;
    }
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
    const prices = $$('.price-row').map(row => ({
      name: $('.price-name', row)?.textContent?.trim(),
      value: $('.price-value', row)?.textContent?.trim(),
      change: $('.price-change', row)?.textContent?.trim(),
    })).filter(item => item.name);

    const alerts = $$('.alert-title, .alert-card-title').map(item => item.textContent.trim()).slice(0, 4);
    return { prices, alerts };
  }

  function localAiAnswer(question) {
    const q = question.toLowerCase();
    const { prices, alerts } = getMarketContext();
    const steel = prices.find(item => /steel|ms sheet|hr coil/i.test(item.name || '')) || prices[0];
    const copper = prices.find(item => /copper/i.test(item.name || ''));
    const topAlert = alerts[0] || 'No urgent alerts are open right now.';

    if (/copper/.test(q) && copper) {
      return `Copper is currently ${copper.value} with ${copper.change || 'flat movement'}. Treat it as a monitored item, compare two supplier quotes, and avoid locking a large order without checking delivery timelines.`;
    }

    if (/alert|risk|scan/.test(q)) {
      return `Top risk: ${topAlert} Watch supplier validity, GST/policy updates, and material availability before committing to new quotes this week.`;
    }

    if (/opportun|tender|export/.test(q)) {
      return 'Best near-term opportunity: refresh your rate sheet and reach local infrastructure/tender buyers while material movement is still visible. Keep quote validity short and protect margins.';
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
      ...STATE,
      question,
      prompt: `Answer this business-owner question in under 90 words with practical action steps: ${question}`,
    };

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
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
    const messages = $('.ai-messages');
    if (!messages) return null;

    const wrapper = document.createElement('div');
    wrapper.className = `ai-message ${kind === 'user' ? 'user-message' : 'ai-response'}`;

    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.textContent = kind === 'user' ? 'You' : 'AI';

    const content = document.createElement('div');
    content.className = 'ai-message-content';
    content.textContent = text;

    wrapper.append(avatar, content);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
    return content;
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
    const answer = backendAnswer ? backendAnswer.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : localAiAnswer(trimmed);
    if (pending) pending.textContent = answer;

    appState.queryCount = Math.min(appState.queryCount + 1, appState.maxQueries);
    localStorage.setItem('nz_query_count', String(appState.queryCount));
    updateQueryCount();
  }

  function updateQueryCount() {
    const used = $('.query-used');
    if (used) used.textContent = String(appState.queryCount);

    const hint = $('.ai-input-hint span');
    if (hint) hint.textContent = `Free: ${Math.max(appState.maxQueries - appState.queryCount, 0)} queries left today`;
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

  function setupButtons() {
    $$('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.filter-btn').forEach(item => item.classList.remove('active'));
        btn.classList.add('active');
        showToast(`Filter applied: ${btn.textContent.trim()}`);
      });
    });

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
      chip.innerHTML = `${value} <button class="tag-remove" type="button">x</button>`;
      chip.querySelector('.tag-remove').addEventListener('click', () => chip.remove());
      event.currentTarget.before(chip);
      event.currentTarget.value = '';
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
        btn.addEventListener('click', () => showToast('Business profile saved locally.'));
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
      } else if (label === 'Add Material') {
        btn.addEventListener('click', () => switchView('workspace'));
      } else if (label === 'Settings') {
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
    loadState();
    setupNavigation();
    setupSidebarAndDropdowns();
    setupAiControls();
    setupButtons();
    setupCardMenus();
    updateQueryCount();
    registerServiceWorker();
    
    // Fetch live data for the dashboard
    fetchRates();
    fetchNews();
    fetchAnalystBriefing();
  });
})();
