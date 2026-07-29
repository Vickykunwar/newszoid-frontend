(() => {
  const navLinks = [...document.querySelectorAll('.nav-link')];
  const panels = [...document.querySelectorAll('.content')];
  const titles = { overview: 'Overview', users: 'Users', content: 'Content health', alerts: 'Alerts', activity: 'Audit activity', settings: 'Settings' };
  const crumb = document.getElementById('crumbTitle');
  const sidebar = document.getElementById('sidebar');
  const toast = document.getElementById('toast');
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
  }

  function showPanel(name) {
    panels.forEach(panel => panel.classList.toggle('hidden-panel', panel.id !== `panel-${name}`));
    navLinks.forEach(link => link.classList.toggle('active', link.dataset.panel === name));
    crumb.textContent = titles[name] || 'Overview';
    sidebar.classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navLinks.forEach(link => link.addEventListener('click', () => showPanel(link.dataset.panel)));
  document.querySelectorAll('[data-panel-target]').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.panelTarget)));
  document.getElementById('menuButton').addEventListener('click', () => sidebar.classList.toggle('open'));

  document.getElementById('globalSearch').addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.currentTarget.value.trim()) showToast(`Search is ready to connect: “${event.currentTarget.value.trim()}”`);
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      document.getElementById('globalSearch').focus();
    }
  });

  document.getElementById('exportButton').addEventListener('click', () => showToast('Report export queued. Connect the admin API to download real data.'));
  document.getElementById('inviteButton').addEventListener('click', () => showToast('Admin invitation flow is ready for an authenticated admin API.'));
  document.getElementById('addUserButton').addEventListener('click', () => showToast('User creation requires the backend admin endpoint.'));
  document.getElementById('notificationButton').addEventListener('click', () => showPanel('alerts'));
  document.querySelectorAll('.row-action').forEach(button => button.addEventListener('click', () => showToast('Account management controls require an authenticated admin API.')));
  document.querySelectorAll('.attention-item').forEach(button => button.addEventListener('click', () => showPanel('alerts')));

  const rows = [...document.querySelectorAll('#directoryTable tr')];
  const search = document.getElementById('userSearch');
  let selectedFilter = 'all';
  function filterUsers() {
    const query = search.value.trim().toLowerCase();
    rows.forEach(row => {
      const matchesQuery = row.textContent.toLowerCase().includes(query);
      const matchesStatus = selectedFilter === 'all' || row.dataset.status === selectedFilter;
      row.hidden = !(matchesQuery && matchesStatus);
    });
  }
  search.addEventListener('input', filterUsers);
  document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
    selectedFilter = button.dataset.filter;
    document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item === button));
    filterUsers();
  }));
})();
