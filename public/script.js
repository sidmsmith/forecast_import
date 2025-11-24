// public/script.js
const orgInput = document.getElementById('org');
const mainUI = document.getElementById('mainUI');
const workspace = document.getElementById('workspace');
const statusEl = document.getElementById('status');
const themeSelectorBtn = document.getElementById('themeSelectorBtn');
const themeModal = new bootstrap.Modal(document.getElementById('themeModal'));
const themeList = document.getElementById('themeList');

// URL Parameters for cross-app integration
const urlParams = new URLSearchParams(window.location.search);
const locationParam = urlParams.get('Location');
const organizationParam = urlParams.get('Organization');
const businessUnitParam = urlParams.get('BusinessUnit');

// Store URL parameters for use
const urlLocation = locationParam || null;
const urlOrg = organizationParam || null;
const urlBusinessUnit = businessUnitParam || null;

// Ensure ORG is blank on load (security) unless from URL
if (urlOrg) {
  orgInput.value = urlOrg.trim();
} else {
  orgInput.value = '';
}

let token = null;

// THEME DEFINITIONS
const themes = {
  'dark': {
    name: 'Dark',
    rootClass: 'theme-dark'
  },
  'manhattan': {
    name: 'Manhattan',
    rootClass: 'theme-manhattan'
  }
};

// THEME FUNCTIONS
function applyTheme(themeKey) {
  const theme = themes[themeKey];
  if (!theme) return;

  const root = document.documentElement;
  
  // Remove all theme classes
  root.classList.remove('theme-dark', 'theme-manhattan');
  
  // Add theme class
  if (theme.rootClass) {
    root.classList.add(theme.rootClass);
  }

  // Save to localStorage
  localStorage.setItem('selectedTheme', themeKey);
}

function loadTheme() {
  const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
  applyTheme(savedTheme);
}

function renderThemeList() {
  themeList.innerHTML = '';
  const currentTheme = localStorage.getItem('selectedTheme') || 'dark';

  Object.entries(themes).forEach(([key, theme]) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `list-group-item list-group-item-action ${key === currentTheme ? 'active' : ''}`;
    item.textContent = theme.name;
    item.onclick = () => {
      applyTheme(key);
      themeModal.hide();
    };
    themeList.appendChild(item);
  });
}

// Theme selector button
if (themeSelectorBtn) {
  themeSelectorBtn.onclick = () => {
    renderThemeList();
    themeModal.show();
  };
}

// Load theme on page load
loadTheme();

function status(text, type = 'info') {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `status text-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'}`;
}

async function api(action, data = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch('/api/validate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...data })
  }).then(r => r.json());
}

// Auth function
async function authenticate() {
  const org = orgInput.value.trim();
  if (!org) {
    status('ORG required', 'error');
    if (mainUI?.style) mainUI.style.display = 'none';
    workspace?.classList.remove('unlocked');
    return;
  }

  status('Authenticating...');
  const res = await api('auth', { org });
  if (!res.success) {
    status(res.error || 'Auth failed', 'error');
    if (mainUI?.style) mainUI.style.display = 'none';
    workspace?.classList.remove('unlocked');
    return;
  }

  token = res.token;
  status(`Authenticated as ${org}`, 'success');
  if (mainUI?.style) mainUI.style.display = 'block';
  workspace?.classList.add('unlocked');
}

orgInput?.addEventListener('keypress', async e => {
  if (e.key !== 'Enter') return;
  await authenticate();
});

// Auto-authenticate if Organization parameter is provided in URL
window.addEventListener('load', async () => {
  try {
    await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'app_opened', org: urlOrg || '' })
    });
  } catch (err) {
    console.error('App init failed', err);
  }
  
  // Auto-authenticate if Organization parameter is provided in URL
  if (urlOrg) {
    // Hide auth section when auto-authenticating
    const authSection = document.getElementById('authSection');
    if (authSection) {
      authSection.style.display = 'none';
    }
    authenticate();
  } else {
    orgInput?.focus();
  }
});