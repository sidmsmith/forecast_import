// public/script.js
const orgInput = document.getElementById('org');
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
let forecastFileData = null; // Store parsed forecast file data

// File section elements
const fileSection = document.getElementById('fileSection');
const forecastFileInput = document.getElementById('forecast_file');
const forecastFileDisplay = document.getElementById('forecast_file_display');
const forecastFileLoadBtn = document.getElementById('forecastFileLoadBtn');
const forecastFileStatus = document.getElementById('forecastFileStatus');
const uploadForecastBtn = document.getElementById('uploadForecastBtn');
const consoleSection = document.getElementById('consoleSection');
const consoleEl = document.getElementById('console');

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
    return;
  }

  status('Authenticating...');
  const res = await api('auth', { org });
  if (!res.success) {
    status(res.error || 'Auth failed', 'error');
    return;
  }

  token = res.token;
  status(`Authenticated as ${org}`, 'success');
  // Show file section after authentication
  if (fileSection) {
    fileSection.style.display = 'block';
  }
  // Show console section after authentication
  if (consoleSection) {
    consoleSection.style.display = 'block';
  }
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

// Helper function to update red shading on file input textbox
function updateFileInputShading(element, isEmpty) {
  if (!element) return;
  if (isEmpty || !element.value || element.value.trim() === '') {
    // Apply red shading when empty
    element.style.setProperty('background-color', 'rgba(255, 0, 0, 0.1)', 'important');
    element.style.setProperty('border-color', 'rgba(255, 0, 0, 0.3)', 'important');
  } else {
    // Remove red shading when has value
    element.style.setProperty('background-color', '', 'important');
    element.style.setProperty('border-color', '', 'important');
  }
}

// Function to set forecast file status message
function setForecastFileStatus(text) {
  if (forecastFileStatus) {
    forecastFileStatus.textContent = text || '';
  }
}

// Validate forecast file (simple validation - just check extension and if not empty)
async function validateForecastFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  const extension = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'xls', 'xlsx'].includes(extension)) {
    return { valid: false, error: 'File must be a CSV or Excel file (.csv, .xls, .xlsx)' };
  }

  try {
    let rows = [];
    
    if (extension === 'csv') {
      const text = await file.text();
      rows = text.split(/\r?\n/).map(line => {
        // Parse CSV line (handle quoted values)
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      }).filter(row => row.some(cell => cell.length > 0)); // Filter empty rows
    } else {
      // Excel file
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      rows = rows.map(row => Array.isArray(row) ? row.map(cell => String(cell || '').trim()) : []);
      rows = rows.filter(row => row.some(cell => cell.length > 0)); // Filter empty rows
    }

    if (rows.length === 0) {
      return { valid: false, error: 'File is empty or contains no data rows' };
    }

    // Count data rows (excluding potential header)
    const rowCount = rows.length;

    return { valid: true, rowCount: rowCount };
  } catch (error) {
    return { valid: false, error: `Error reading file: ${error.message}` };
  }
}

// Parse forecast file to get row count
async function parseForecastFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  let rows = [];
  let headerDetected = false;

  if (extension === 'csv') {
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      // Parse CSV line (handle quoted values)
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      
      // Check if first row is a header (optional - just for counting)
      if (index === 0 && result.length > 0 && result[0].toLowerCase().includes('header')) {
        headerDetected = true;
        return; // Skip header row
      }
      if (result.some(cell => cell.length > 0)) {
        rows.push(result);
      }
    });
  } else {
    // Excel file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const excelRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    excelRows.forEach((row, index) => {
      const rowArray = Array.isArray(row) ? row.map(cell => String(cell || '').trim()) : [];
      // Check if first row is a header (optional)
      if (index === 0 && rowArray.length > 0 && rowArray[0].toLowerCase().includes('header')) {
        headerDetected = true;
        return; // Skip header row
      }
      if (rowArray.some(cell => cell.length > 0)) {
        rows.push(rowArray);
      }
    });
  }

  return { rows, headerDetected };
}

// Forecast file picker button
if (forecastFileLoadBtn && forecastFileInput) {
  forecastFileLoadBtn.addEventListener('click', () => {
    forecastFileInput.click();
  });
}

// Forecast file change handler
if (forecastFileInput) {
  forecastFileInput.addEventListener('change', async (e) => {
    if (!e.target.files.length) {
      forecastFileData = null;
      setForecastFileStatus('');
      if (forecastFileDisplay) {
        forecastFileDisplay.value = '';
        updateFileInputShading(forecastFileDisplay, true);
      }
      return;
    }
    
    const file = e.target.files[0];
    const fileName = file.name;
    
    // Validate file format before loading
    const validation = await validateForecastFile(file);
    
    if (!validation.valid) {
      // Show error message
      setForecastFileStatus('');
      
      if (forecastFileDisplay) {
        forecastFileDisplay.value = '';
        forecastFileDisplay.removeAttribute('title');
        // Restore red shading to indicate file needs to be loaded
        updateFileInputShading(forecastFileDisplay, true);
      }
      
      // Clear forecast file data
      forecastFileData = null;
      e.target.value = '';
      alert(`Invalid file format: ${validation.error}`);
      return;
    }
    
    // File is valid, parse and store data
    try {
      const parseResult = await parseForecastFile(file);
      forecastFileData = parseResult.rows;
      const headerDetected = parseResult.headerDetected;
      
      // Update display textbox - show only filename
      if (forecastFileDisplay) {
        forecastFileDisplay.value = fileName;
        forecastFileDisplay.title = fileName; // Tooltip shows filename on hover
        // Remove red shading when file is loaded
        updateFileInputShading(forecastFileDisplay, false);
      }
      
      // Use validation count if available, otherwise use parsed rows count
      const itemCount = validation.rowCount || forecastFileData.length;
      const statusMessage = itemCount > 0
        ? headerDetected
          ? `${itemCount} items loaded (header row detected and skipped)`
          : `${itemCount} items loaded`
        : 'No data rows detected.';
      setForecastFileStatus(statusMessage);
    } catch (error) {
      // File parsing failed - show error and restore red shading
      console.error('Error parsing forecast file:', error);
      setForecastFileStatus('');
      
      if (forecastFileDisplay) {
        forecastFileDisplay.value = '';
        forecastFileDisplay.removeAttribute('title');
        // Restore red shading to indicate file needs to be loaded
        updateFileInputShading(forecastFileDisplay, true);
      }
      
      // Clear forecast file data
      forecastFileData = null;
      e.target.value = '';
      alert(`Error loading file: ${error.message || 'Failed to parse file. Please ensure the file is a valid CSV or Excel file.'}`);
    }
  });
}

// Initialize file input shading on load
if (forecastFileDisplay) {
  updateFileInputShading(forecastFileDisplay, true);
}

// Console logging function
function logToConsole(message, type = 'info') {
  if (!consoleEl) return;
  const timestamp = new Date().toLocaleTimeString();
  const className = type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info';
  consoleEl.innerHTML += `<span class="${className}">[${timestamp}] ${message}</span>\n`;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Upload Forecast button handler
if (uploadForecastBtn) {
  uploadForecastBtn.addEventListener('click', () => {
    logToConsole('Upload Forecast button clicked', 'info');
  });
}