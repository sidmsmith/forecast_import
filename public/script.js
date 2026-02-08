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
const orgParam = urlParams.get('ORG'); // Also support ORG parameter
const businessUnitParam = urlParams.get('BusinessUnit');

// Store URL parameters for use
const urlLocation = locationParam || null;
const urlOrg = organizationParam || orgParam || null; // Support both Organization and ORG
const urlBusinessUnit = businessUnitParam || null;

// Ensure ORG is blank on load (security) unless from URL
if (urlOrg) {
  orgInput.value = urlOrg.trim();
} else {
  orgInput.value = '';
}

let token = null;
let forecastFileData = null; // Store parsed forecast file data
let forecastFileHeader = null; // Store forecast file header row
let locationFileData = null; // Store parsed location file data
let locationFileHeader = null; // Store location file header row

// File section elements
const fileSection = document.getElementById('fileSection');
const forecastFileInput = document.getElementById('forecast_file');
const forecastFileDisplay = document.getElementById('forecast_file_display');
const forecastFileLoadBtn = document.getElementById('forecastFileLoadBtn');
const forecastFileStatus = document.getElementById('forecastFileStatus');
const uploadForecastBtn = document.getElementById('uploadForecastBtn');
const locationFileInput = document.getElementById('location_file');
const locationFileDisplay = document.getElementById('location_file_display');
const locationFileLoadBtn = document.getElementById('locationFileLoadBtn');
const locationFileStatus = document.getElementById('locationFileStatus');
const uploadLocationsBtn = document.getElementById('uploadLocationsBtn');
const consoleSection = document.getElementById('consoleSection');
const consoleEl = document.getElementById('console');
const consoleToggleBtn = document.getElementById('consoleToggleBtn');
const consoleToggleContainer = document.getElementById('consoleToggleContainer');
const consoleCloseBtn = document.getElementById('consoleCloseBtn');

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

// HA tracking function
async function trackEvent(eventName, metadata = {}) {
  try {
    await api('ha-track', {
      event_name: eventName,
      metadata: metadata
    });
  } catch (error) {
    // Silently fail - don't interrupt user experience
  }
}

// Auth function
async function authenticate() {
  const org = orgInput.value.trim();
  if (!org) {
    status('ORG required', 'error');
    return false;
  }

  status('Authenticating...');
  const res = await api('auth', { org });
  if (!res.success) {
    status(res.error || 'Auth failed', 'error');
    await trackEvent('auth_failed', { org: org || 'unknown', error: res.error || 'Auth failed' });
    // On auth failure, hide file and console sections, show auth section
    if (fileSection) {
      fileSection.style.display = 'none';
    }
    if (consoleSection) {
      consoleSection.style.display = 'none';
    }
    if (consoleToggleContainer) {
      consoleToggleContainer.style.display = 'none';
    }
    const authSection = document.getElementById('authSection');
    if (authSection) {
      authSection.style.display = 'block';
    }
    return false;
  }

  token = res.token;
  status(`Authenticated as ${org}`, 'success');
  await trackEvent('auth_success', { org: org || 'unknown' });
  
  // Hide auth section on successful authentication
  const authSection = document.getElementById('authSection');
  if (authSection) {
    authSection.style.display = 'none';
  }
  
  // Show file section after authentication
  if (fileSection) {
    fileSection.style.display = 'block';
  }
  // Show console toggle button after authentication (console stays hidden by default)
  if (consoleToggleContainer) {
    consoleToggleContainer.style.display = 'block';
  }
  return true;
}

orgInput?.addEventListener('keypress', async e => {
  if (e.key !== 'Enter') return;
  await authenticate();
});

// Auto-authenticate if Organization or ORG parameter is provided in URL
window.addEventListener('load', async () => {
  // Track app opened
  await trackEvent('app_opened', {});
  
  try {
    await api('app_opened', { org: urlOrg || '' });
  } catch (err) {
    // Silently fail - don't interrupt user experience
  }
  
  // Auto-authenticate if Organization or ORG parameter is provided in URL
  if (urlOrg) {
    // Auto-authenticate (auth section will be hidden on success, shown on failure)
    // File and console sections will only show if auth succeeds
    const authSuccess = await authenticate();
    if (!authSuccess) {
      // Auth failed - keep file and console sections hidden
      if (fileSection) {
        fileSection.style.display = 'none';
      }
      if (consoleSection) {
        consoleSection.style.display = 'none';
      }
      if (consoleToggleContainer) {
        consoleToggleContainer.style.display = 'none';
      }
    }
  } else {
    // No URL parameter - show auth section, hide file/console sections
    const authSection = document.getElementById('authSection');
    if (authSection) {
      authSection.style.display = 'block';
    }
    if (fileSection) {
      fileSection.style.display = 'none';
    }
    if (consoleSection) {
      consoleSection.style.display = 'none';
    }
    if (consoleToggleContainer) {
      consoleToggleContainer.style.display = 'none';
    }
    orgInput?.focus();
  }
});

// Console toggle functionality
if (consoleToggleBtn) {
  consoleToggleBtn.addEventListener('click', () => {
    if (consoleSection) {
      const isHidden = consoleSection.style.display === 'none' || !consoleSection.style.display;
      consoleSection.style.display = isHidden ? 'block' : 'none';
    }
  });
}

if (consoleCloseBtn) {
  consoleCloseBtn.addEventListener('click', () => {
    if (consoleSection) {
      consoleSection.style.display = 'none';
    }
  });
}

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

// Helper function to check if first cell is a header (Item ID, ItemId, or Item_id)
function isHeaderRow(firstCell) {
  if (!firstCell) return false;
  const normalized = String(firstCell).trim().toLowerCase();
  return normalized === 'item id' || normalized === 'itemid' || normalized === 'item_id';
}

// Helper function to check if first cell is a location header (Location ID, LocationId, or Location_id)
function isLocationHeaderRow(firstCell) {
  if (!firstCell) return false;
  const normalized = String(firstCell).trim().toLowerCase();
  return normalized === 'location id' || normalized === 'locationid' || normalized === 'location_id';
}

// Validate forecast file (simple validation - just check extension and if not empty)
async function validateForecastFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  const extension = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'xls', 'xlsx', 'txt'].includes(extension)) {
    return { valid: false, error: 'File must be a CSV, Excel, or TXT file (.csv, .xls, .xlsx, .txt)' };
  }

  try {
    let rows = [];
    
    if (extension === 'csv' || extension === 'txt') {
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

    // Check if first row is a header row (cell A1 contains Item ID, ItemId, or Item_id)
    const hasHeader = rows.length > 0 && isHeaderRow(rows[0][0]);
    const rowCount = hasHeader ? rows.length - 1 : rows.length;

    return { valid: true, rowCount: rowCount, hasHeader: hasHeader };
  } catch (error) {
    return { valid: false, error: `Error reading file: ${error.message}` };
  }
}

// Parse forecast file to get row count
async function parseForecastFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  let rows = [];
  let headerDetected = false;
  let headerRow = null;

  if (extension === 'csv' || extension === 'txt') {
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
      
      // Check if first row is a header row (cell A1 contains Item ID, ItemId, or Item_id)
      if (index === 0 && result.length > 0 && isHeaderRow(result[0])) {
        headerDetected = true;
        headerRow = result; // Store header row
        return; // Skip header row from data
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
      // Check if first row is a header row (cell A1 contains Item ID, ItemId, or Item_id)
      if (index === 0 && rowArray.length > 0 && isHeaderRow(rowArray[0])) {
        headerDetected = true;
        headerRow = rowArray; // Store header row
        return; // Skip header row from data
      }
      if (rowArray.some(cell => cell.length > 0)) {
        rows.push(rowArray);
      }
    });
  }

  return { rows, headerDetected, headerRow };
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
      forecastFileHeader = null;
      e.target.value = '';
      alert(`Invalid file format: ${validation.error}`);
      return;
    }
    
    // File is valid, parse and store data
    try {
      const parseResult = await parseForecastFile(file);
      forecastFileData = parseResult.rows;
      forecastFileHeader = parseResult.headerRow || null;
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
      
      // Log to console
      if (headerDetected) {
        logToConsole(`Forecast file: Header row detected and skipped (${itemCount} data rows)`, 'info');
      } else {
        logToConsole(`Forecast file: ${itemCount} items loaded from file`, 'success');
      }
      
      // Print file contents to console (including header)
      const extension = file.name.split('.').pop().toLowerCase();
      const fileType = extension === 'csv' || extension === 'txt' ? (extension === 'txt' ? 'TXT' : 'CSV') : 'Excel';
      printFileContentsToConsole(forecastFileData, fileName, fileType, forecastFileHeader);
      
      // Track file loaded event
      await trackEvent('forecast_file_loaded', {
        org: orgInput.value.trim() || 'unknown',
        filename: fileName,
        file_type: fileType,
        item_count: itemCount,
        has_header: headerDetected
      });
      
      // Clear the file input value so the same file can be reloaded
      e.target.value = '';
    } catch (error) {
      // File parsing failed - show error and restore red shading
      setForecastFileStatus('');
      
      if (forecastFileDisplay) {
        forecastFileDisplay.value = '';
        forecastFileDisplay.removeAttribute('title');
        // Restore red shading to indicate file needs to be loaded
        updateFileInputShading(forecastFileDisplay, true);
      }
      
      // Clear forecast file data
      forecastFileData = null;
      forecastFileHeader = null;
      e.target.value = '';
      const errorMsg = error.message || 'Failed to parse file. Please ensure the file is a valid CSV, Excel, or TXT file.';
      await trackEvent('file_load_failed', {
        org: orgInput.value.trim() || 'unknown',
        filename: fileName || 'unknown',
        file_type: file ? (file.name.split('.').pop().toLowerCase() === 'txt' ? 'TXT' : file.name.split('.').pop().toLowerCase() === 'csv' ? 'CSV' : 'Excel') : 'unknown',
        error: errorMsg
      });
      alert(`Error loading file: ${errorMsg}`);
    }
  });
}

// Initialize file input shading on load
if (forecastFileDisplay) {
  updateFileInputShading(forecastFileDisplay, true);
}
if (locationFileDisplay) {
  updateFileInputShading(locationFileDisplay, true);
}

// Function to print file contents to console (including header if present)
function printFileContentsToConsole(rows, fileName, fileType = 'CSV', headerRow = null) {
  if (!consoleEl) return;
  
  logToConsole(`\n=== ${fileName} (${fileType}) ===`, 'info');
  
  // Count data rows (excluding header)
  const dataRowCount = headerRow ? rows.length : rows.length;
  logToConsole(`Total rows: ${dataRowCount}`, 'info');
  
  if (headerRow) {
    logToConsole('---', 'info');
    const headerStr = Array.isArray(headerRow) ? headerRow.join(', ') : String(headerRow);
    logToConsole(`Header: ${headerStr}`, 'info');
  }
  
  logToConsole('---', 'info');
  
  // Print first 50 rows to avoid overwhelming the console
  const maxRows = Math.min(50, rows.length);
  for (let i = 0; i < maxRows; i++) {
    const row = rows[i];
    const rowStr = Array.isArray(row) ? row.join(', ') : String(row);
    logToConsole(`Row ${i + 1}: ${rowStr}`, 'info');
  }
  
  if (rows.length > maxRows) {
    logToConsole(`... (${rows.length - maxRows} more rows)`, 'info');
  }
  logToConsole('=== End of file ===\n', 'info');
}

// Function to set location file status message
function setLocationFileStatus(text) {
  if (locationFileStatus) {
    locationFileStatus.textContent = text || '';
  }
}

// Validate location file (checks for LocationId header)
async function validateLocationFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  const extension = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'xls', 'xlsx', 'txt'].includes(extension)) {
    return { valid: false, error: 'File must be a CSV, Excel, or TXT file (.csv, .xls, .xlsx, .txt)' };
  }

  try {
    let rows = [];
    
    if (extension === 'csv' || extension === 'txt') {
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

    // Check if first row is a header row (cell A1 contains Location ID, LocationId, or Location_id)
    const hasHeader = rows.length > 0 && isLocationHeaderRow(rows[0][0]);
    const rowCount = hasHeader ? rows.length - 1 : rows.length;

    return { valid: true, rowCount: rowCount, hasHeader: hasHeader };
  } catch (error) {
    return { valid: false, error: `Error reading file: ${error.message}` };
  }
}

// Parse location file (checks for LocationId header)
async function parseLocationFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  let rows = [];
  let headerDetected = false;
  let headerRow = null;

  if (extension === 'csv' || extension === 'txt') {
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
      
      // Check if first row is a header row (cell A1 contains Location ID, LocationId, or Location_id)
      if (index === 0 && result.length > 0 && isLocationHeaderRow(result[0])) {
        headerDetected = true;
        headerRow = result; // Store header row
        return; // Skip header row from data
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
      // Check if first row is a header row (cell A1 contains Location ID, LocationId, or Location_id)
      if (index === 0 && rowArray.length > 0 && isLocationHeaderRow(rowArray[0])) {
        headerDetected = true;
        headerRow = rowArray; // Store header row
        return; // Skip header row from data
      }
      if (rowArray.some(cell => cell.length > 0)) {
        rows.push(rowArray);
      }
    });
  }

  return { rows, headerDetected, headerRow };
}

// Console logging function
function logToConsole(message, type = 'info') {
  if (!consoleEl) return;
  const timestamp = new Date().toLocaleTimeString();
  const className = type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info';
  consoleEl.innerHTML += `<span class="${className}">[${timestamp}] ${message}</span>\n`;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Location file picker button
if (locationFileLoadBtn && locationFileInput) {
  locationFileLoadBtn.addEventListener('click', () => {
    locationFileInput.click();
  });
}

// Location file change handler
if (locationFileInput) {
  locationFileInput.addEventListener('change', async (e) => {
    if (!e.target.files.length) {
      locationFileData = null;
      locationFileHeader = null;
      setLocationFileStatus('');
      if (locationFileDisplay) {
        locationFileDisplay.value = '';
        updateFileInputShading(locationFileDisplay, true);
      }
      return;
    }
    
    const file = e.target.files[0];
    const fileName = file.name;
    
    // Validate file format before loading
    const validation = await validateLocationFile(file);
    
    if (!validation.valid) {
      // Show error message
      setLocationFileStatus('');
      
      if (locationFileDisplay) {
        locationFileDisplay.value = '';
        locationFileDisplay.removeAttribute('title');
      // Restore red shading to indicate file needs to be loaded
      updateFileInputShading(locationFileDisplay, true);
      }
      
      // Clear location file data
      locationFileData = null;
      locationFileHeader = null;
      e.target.value = '';
      alert(`Invalid file format: ${validation.error}`);
      return;
    }
    
    // File is valid, parse and store data
    try {
      const parseResult = await parseLocationFile(file);
      locationFileData = parseResult.rows;
      locationFileHeader = parseResult.headerRow || null;
      const headerDetected = parseResult.headerDetected;
      
      // Update display textbox - show only filename
      if (locationFileDisplay) {
        locationFileDisplay.value = fileName;
        locationFileDisplay.title = fileName; // Tooltip shows filename on hover
        // Remove red shading when file is loaded
        updateFileInputShading(locationFileDisplay, false);
      }
      
      // Use validation count if available, otherwise use parsed rows count
      const locationCount = validation.rowCount || locationFileData.length;
      const statusMessage = locationCount > 0
        ? headerDetected
          ? `${locationCount} locations loaded (header row detected and skipped)`
          : `${locationCount} locations loaded`
        : 'No data rows detected.';
      setLocationFileStatus(statusMessage);
      
      // Log to console
      if (headerDetected) {
        logToConsole(`Location file: Header row detected and skipped (${locationCount} data rows)`, 'info');
      } else {
        logToConsole(`Location file: ${locationCount} locations loaded from file`, 'success');
      }
      
      // Print file contents to console (including header)
      const extension = file.name.split('.').pop().toLowerCase();
      const fileType = extension === 'csv' || extension === 'txt' ? (extension === 'txt' ? 'TXT' : 'CSV') : 'Excel';
      printFileContentsToConsole(locationFileData, fileName, fileType, locationFileHeader);
      
      // Track file loaded event
      await trackEvent('location_file_loaded', {
        org: orgInput.value.trim() || 'unknown',
        filename: fileName,
        file_type: fileType,
        location_count: locationCount,
        has_header: headerDetected
      });
      
      // Clear the file input value so the same file can be reloaded
      e.target.value = '';
    } catch (error) {
      // File parsing failed - show error and restore red shading
      setLocationFileStatus('');
      
      if (locationFileDisplay) {
        locationFileDisplay.value = '';
        locationFileDisplay.removeAttribute('title');
        // Restore red shading to indicate file needs to be loaded
        updateFileInputShading(locationFileDisplay, true);
      }
      
      // Clear location file data
      locationFileData = null;
      locationFileHeader = null;
      e.target.value = '';
      const errorMsg = error.message || 'Failed to parse file. Please ensure the file is a valid CSV, Excel, or TXT file.';
      await trackEvent('file_load_failed', {
        org: orgInput.value.trim() || 'unknown',
        filename: fileName || 'unknown',
        file_type: file ? (file.name.split('.').pop().toLowerCase() === 'txt' ? 'TXT' : file.name.split('.').pop().toLowerCase() === 'csv' ? 'CSV' : 'Excel') : 'unknown',
        error: errorMsg
      });
      alert(`Error loading file: ${errorMsg}`);
    }
  });
}

// Helper function to map CSV row to forecast API format
function mapForecastRowToAPI(row, headerRow) {
  // Postman collection fields:
  // - ForecastId: "{{Forecast ID}}" (string)
  // - ForecastLevel: {{Current Forecast}} (number, same as CurrentForecast)
  // - CurrentForecast: {{Current Forecast}} (number)
  // - ForecastFactors: array with ForecastLevel and CurrentForecast (both use {{Current Forecast}})
  
  let forecastData = {};
  
  if (headerRow && headerRow.length > 0) {
    // Map by header names
    const headerMap = {};
    headerRow.forEach((header, index) => {
      const normalized = String(header).trim().toLowerCase();
      headerMap[normalized] = index;
    });
    
    // Map fields based on header
    const getValue = (fieldNames) => {
      for (const fieldName of fieldNames) {
        const index = headerMap[fieldName.toLowerCase()];
        if (index !== undefined && row[index] !== undefined) {
          return String(row[index]).trim();
        }
      }
      return '';
    };
    
    const getNumberValue = (fieldNames) => {
      const value = getValue(fieldNames);
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    };
    
    // ForecastId: Map from "Forecast ID" or "Item ID" variations
    forecastData.ForecastId = getValue([
      'Forecast ID', 'ForecastId', 'Forecast_id', 'forecastid', 'forecast id',
      'Item ID', 'ItemId', 'Item_id', 'itemid', 'item id',
      'ForecastID', 'ItemID'
    ]);
    
    // CurrentForecast: Map from "Current Forecast" variations
    forecastData.CurrentForecast = getNumberValue([
      'Current Forecast', 'CurrentForecast', 'Current_forecast', 'currentforecast', 'current forecast',
      'CurrentForecast', 'Forecast', 'forecast'
    ]);
    
    // ForecastLevel: Uses the same value as CurrentForecast (per Postman: {{Current Forecast}})
    forecastData.ForecastLevel = forecastData.CurrentForecast;
  } else {
    // Assume standard order: ForecastId (col 0), CurrentForecast (col 1)
    forecastData.ForecastId = row[0] || '';
    forecastData.CurrentForecast = parseFloat(row[1]) || 0;
    // ForecastLevel: Uses the same value as CurrentForecast (per Postman: {{Current Forecast}})
    forecastData.ForecastLevel = forecastData.CurrentForecast;
  }
  
  // Build ForecastFactors array (both fields use CurrentForecast value per Postman)
  forecastData.ForecastFactors = [
    {
      ForecastLevel: forecastData.CurrentForecast, // Uses CurrentForecast value ({{Current Forecast}})
      CurrentForecast: forecastData.CurrentForecast  // Uses CurrentForecast value ({{Current Forecast}})
    }
  ];
  
  return forecastData;
}

// Helper function to map CSV row to forecast projection API format
function mapForecastProjectionToAPI(row, headerRow, forecastData) {
  // Postman collection fields:
  // - ForecastId: "{{Forecast ID}}" (string, reuses from forecastData)
  // - PeriodStartDate: "{{Projection Start Date}}" (string)
  // - CurrentForecast: {{Current Forecast}} (number, reuses from forecastData)
  // - ManualForecastEventType: "User" (hardcoded)
  
  let projectionData = {
    ForecastId: forecastData.ForecastId,  // Reuses ForecastId from forecastData
    CurrentForecast: forecastData.CurrentForecast,  // Reuses CurrentForecast from forecastData
    ManualForecastEventType: 'User'  // Hardcoded as per Postman
  };
  
  // Try to get PeriodStartDate from the row
  if (headerRow && headerRow.length > 0) {
    const headerMap = {};
    headerRow.forEach((header, index) => {
      const normalized = String(header).trim().toLowerCase();
      headerMap[normalized] = index;
    });
    
    const getValue = (fieldNames) => {
      for (const fieldName of fieldNames) {
        const index = headerMap[fieldName.toLowerCase()];
        if (index !== undefined && row[index] !== undefined) {
          return String(row[index]).trim();
        }
      }
      return '';
    };
    
    // PeriodStartDate: Map from "Projection Start Date" variations
    projectionData.PeriodStartDate = getValue([
      'Projection Start Date', 'PeriodStartDate', 'Period Start Date', 'Period_start_date',
      'periodstartdate', 'projection start date', 'projectionstartdate',
      'StartDate', 'Start Date', 'startdate', 'start date',
      'PeriodStart', 'Period Start', 'periodstart', 'period start'
    ]);
  } else {
    // Assume PeriodStartDate is in column 2 (index 2) if available (after ForecastId and CurrentForecast)
    projectionData.PeriodStartDate = row[2] || '';
  }
  
  // If no PeriodStartDate found, use today's date as default
  if (!projectionData.PeriodStartDate) {
    const today = new Date();
    projectionData.PeriodStartDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
  }
  
  return projectionData;
}

// Upload Forecast button handler
if (uploadForecastBtn) {
  uploadForecastBtn.addEventListener('click', async () => {
    if (!forecastFileData || forecastFileData.length === 0) {
      logToConsole('Error: No forecast file loaded', 'error');
      status('Please load a forecast file first', 'error');
      return;
    }
    
    if (!token) {
      logToConsole('Error: Not authenticated', 'error');
      status('Please authenticate first', 'error');
      return;
    }
    
    const org = orgInput.value.trim();
    if (!org) {
      logToConsole('Error: No ORG specified', 'error');
      status('ORG required', 'error');
      return;
    }
    
    logToConsole(`Starting forecast upload for ${forecastFileData.length} items...`, 'info');
    status('Uploading forecasts...', 'info');
    
    // Track upload attempt
    const forecastFileName = forecastFileDisplay ? forecastFileDisplay.value : 'unknown';
    await trackEvent('upload_forecast_attempt', {
      org: org || 'unknown',
      filename: forecastFileName,
      record_count: forecastFileData.length
    });
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    // Process each forecast
    for (let i = 0; i < forecastFileData.length; i++) {
      const row = forecastFileData[i];
      try {
        const forecastData = mapForecastRowToAPI(row, forecastFileHeader);
        
        if (!forecastData.ForecastId) {
          logToConsole(`Row ${i + 1}: Skipped - missing ForecastId`, 'warning');
          failCount++;
          errors.push(`Row ${i + 1}: Missing ForecastId`);
          continue;
        }
        
        if (!forecastData.CurrentForecast && forecastData.CurrentForecast !== 0) {
          logToConsole(`Row ${i + 1}: Skipped - missing or invalid CurrentForecast`, 'warning');
          failCount++;
          errors.push(`Row ${i + 1}: Missing or invalid CurrentForecast`);
          continue;
        }
        
        logToConsole(`Row ${i + 1}: Saving forecast ${forecastData.ForecastId}...`, 'info');
        
        // Log the raw JSON payload for Save Forecast
        const payload = { org, forecastData };
        logToConsole(`Save Forecast - Request Payload (Row ${i + 1}):\n${JSON.stringify(payload, null, 2)}`, 'info');
        
        const res = await api('save-forecast', payload);
        
        // Log the raw response for Save Forecast
        logToConsole(`Save Forecast - Response (Row ${i + 1}):\n${JSON.stringify(res, null, 2)}`, 'info');
        
        if (res.success) {
          logToConsole(`Row ${i + 1}: Successfully saved forecast ${forecastData.ForecastId}`, 'success');
          
          // Now call Save Forecast Projections API
          logToConsole(`Row ${i + 1}: Saving forecast projections for ${forecastData.ForecastId}...`, 'info');
          
          const projectionData = mapForecastProjectionToAPI(row, forecastFileHeader, forecastData);
          
          // Log the raw JSON payload for Save Forecast Projections
          const projectionPayload = { org, projectionData };
          logToConsole(`Save Forecast Projections - Request Payload (Row ${i + 1}):\n${JSON.stringify(projectionPayload, null, 2)}`, 'info');
          
          const projectionRes = await api('save-forecast-projections', projectionPayload);
          
          // Log the raw response for Save Forecast Projections
          logToConsole(`Save Forecast Projections - Response (Row ${i + 1}):\n${JSON.stringify(projectionRes, null, 2)}`, 'info');
          
          if (projectionRes.success) {
            logToConsole(`Row ${i + 1}: Successfully saved forecast projections for ${forecastData.ForecastId}`, 'success');
            successCount++;
          } else {
            logToConsole(`Row ${i + 1}: Failed to save forecast projections for ${forecastData.ForecastId}: ${projectionRes.error || 'Unknown error'}`, 'error');
            failCount++;
            errors.push(`Row ${i + 1} (${forecastData.ForecastId}): Forecast saved but projections failed - ${projectionRes.error || 'Unknown error'}`);
          }
        } else {
          logToConsole(`Row ${i + 1}: Failed to save forecast ${forecastData.ForecastId}: ${res.error || 'Unknown error'}`, 'error');
          failCount++;
          errors.push(`Row ${i + 1} (${forecastData.ForecastId}): ${res.error || 'Unknown error'}`);
        }
      } catch (error) {
        logToConsole(`Row ${i + 1}: Error - ${error.message}`, 'error');
        failCount++;
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }
    
    // Summary
    logToConsole(`\n=== Upload Complete ===`, 'info');
    logToConsole(`Success: ${successCount}`, 'success');
    logToConsole(`Failed: ${failCount}`, failCount > 0 ? 'error' : 'info');
    
    if (errors.length > 0 && errors.length <= 10) {
      logToConsole('Errors:', 'error');
      errors.forEach(err => logToConsole(`  - ${err}`, 'error'));
    } else if (errors.length > 10) {
      logToConsole(`First 10 errors (${errors.length} total):`, 'error');
      errors.slice(0, 10).forEach(err => logToConsole(`  - ${err}`, 'error'));
    }
    
    // Track upload completion
    if (failCount > 0 && successCount === 0) {
      await trackEvent('upload_forecast_failed', {
        org: org || 'unknown',
        filename: forecastFileName,
        error: errors.length > 0 ? errors[0] : 'Upload failed'
      });
    } else {
      await trackEvent('upload_forecast_completed', {
        org: org || 'unknown',
        filename: forecastFileName,
        record_count: forecastFileData.length,
        success_count: successCount,
        fail_count: failCount
      });
    }
    
    status(`Upload complete: ${successCount} succeeded, ${failCount} failed`, successCount > 0 ? 'success' : 'error');
  });
}

// Helper function to map CSV row to location API format
function mapLocationRowToAPI(row, headerRow) {
  // If we have a header row, map by column names
  // Otherwise, assume standard order: LocationId, LocationName, Description, LocationType, PrimaryDC, Region, District, Address fields
  let locationData = {};
  
  if (headerRow && headerRow.length > 0) {
    // Map by header names
    const headerMap = {};
    headerRow.forEach((header, index) => {
      const normalized = String(header).trim().toLowerCase();
      headerMap[normalized] = index;
    });
    
    // Map fields based on header
    const getValue = (fieldNames) => {
      for (const fieldName of fieldNames) {
        const index = headerMap[fieldName.toLowerCase()];
        if (index !== undefined && row[index] !== undefined) {
          return String(row[index]).trim();
        }
      }
      return '';
    };
    
    locationData.LocationId = getValue(['LocationId', 'Location ID', 'Location_id', 'locationid']);
    locationData.LocationName = getValue(['LocationName', 'Location Name', 'Location_name', 'locationname']);
    locationData.Description = getValue(['Description', 'description']);
    locationData.LocationType = getValue(['LocationType', 'Location Type', 'Location_type', 'locationtype']);
    locationData.PrimaryDC = getValue(['PrimaryDC', 'Primary DC', 'Primary_dc', 'primarydc']);
    locationData.Region = getValue(['Region', 'region']);
    locationData.District = getValue(['District', 'district']);
    
    // Address fields
    locationData.Address = {
      FirstName: getValue(['FirstName', 'First Name', 'First_name', 'firstname', 'Address.FirstName']),
      LastName: getValue(['LastName', 'Last Name', 'Last_name', 'lastname', 'Address.LastName']),
      Address1: getValue(['Address1', 'Address 1', 'Address_1', 'address1', 'Address.Address1']),
      City: getValue(['City', 'city', 'Address.City']),
      State: getValue(['State', 'state', 'Address.State']),
      PostalCode: getValue(['PostalCode', 'Postal Code', 'Postal_code', 'postalcode', 'Zip', 'zip', 'Address.PostalCode']),
      Country: getValue(['Country', 'country', 'Address.Country']),
      Phone: getValue(['Phone', 'phone', 'Address.Phone']),
      Email: getValue(['Email', 'email', 'Address.Email'])
    };
  } else {
    // Assume standard order (first 7 columns, then address fields)
    locationData.LocationId = row[0] || '';
    locationData.LocationName = row[1] || '';
    locationData.Description = row[2] || '';
    locationData.LocationType = row[3] || '';
    locationData.PrimaryDC = row[4] || '';
    locationData.Region = row[5] || '';
    locationData.District = row[6] || '';
    locationData.Address = {
      FirstName: row[7] || '',
      LastName: row[8] || '',
      Address1: row[9] || '',
      City: row[10] || '',
      State: row[11] || '',
      PostalCode: row[12] || '',
      Country: row[13] || '',
      Phone: row[14] || '',
      Email: row[15] || ''
    };
  }
  
  return locationData;
}

// Upload Locations button handler
if (uploadLocationsBtn) {
  uploadLocationsBtn.addEventListener('click', async () => {
    if (!locationFileData || locationFileData.length === 0) {
      logToConsole('Error: No location file loaded', 'error');
      status('Please load a location file first', 'error');
      return;
    }
    
    if (!token) {
      logToConsole('Error: Not authenticated', 'error');
      status('Please authenticate first', 'error');
      return;
    }
    
    const org = orgInput.value.trim();
    if (!org) {
      logToConsole('Error: No ORG specified', 'error');
      status('ORG required', 'error');
      return;
    }
    
    logToConsole(`Starting location upload for ${locationFileData.length} locations...`, 'info');
    status('Uploading locations...', 'info');
    
    // Track upload attempt
    const locationFileName = locationFileDisplay ? locationFileDisplay.value : 'unknown';
    await trackEvent('upload_locations_attempt', {
      org: org || 'unknown',
      filename: locationFileName,
      record_count: locationFileData.length
    });
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    // Process each location
    for (let i = 0; i < locationFileData.length; i++) {
      const row = locationFileData[i];
      try {
        const locationData = mapLocationRowToAPI(row, locationFileHeader);
        
        if (!locationData.LocationId) {
          logToConsole(`Row ${i + 1}: Skipped - missing LocationId`, 'warning');
          failCount++;
          errors.push(`Row ${i + 1}: Missing LocationId`);
          continue;
        }
        
        logToConsole(`Row ${i + 1}: Creating location ${locationData.LocationId}...`, 'info');
        
        // Log the raw JSON payload
        const payload = { org, locationData };
        logToConsole(`Request Payload (Row ${i + 1}):\n${JSON.stringify(payload, null, 2)}`, 'info');
        
        const res = await api('create-location', payload);
        
        // Log the raw response
        logToConsole(`Response (Row ${i + 1}):\n${JSON.stringify(res, null, 2)}`, 'info');
        
        if (res.success) {
          logToConsole(`Row ${i + 1}: Successfully created location ${locationData.LocationId}`, 'success');
          successCount++;
        } else {
          logToConsole(`Row ${i + 1}: Failed to create location ${locationData.LocationId}: ${res.error || 'Unknown error'}`, 'error');
          failCount++;
          errors.push(`Row ${i + 1} (${locationData.LocationId}): ${res.error || 'Unknown error'}`);
        }
      } catch (error) {
        logToConsole(`Row ${i + 1}: Error - ${error.message}`, 'error');
        failCount++;
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }
    
    // Summary
    logToConsole(`\n=== Upload Complete ===`, 'info');
    logToConsole(`Success: ${successCount}`, 'success');
    logToConsole(`Failed: ${failCount}`, failCount > 0 ? 'error' : 'info');
    
    if (errors.length > 0 && errors.length <= 10) {
      logToConsole('Errors:', 'error');
      errors.forEach(err => logToConsole(`  - ${err}`, 'error'));
    } else if (errors.length > 10) {
      logToConsole(`First 10 errors (${errors.length} total):`, 'error');
      errors.slice(0, 10).forEach(err => logToConsole(`  - ${err}`, 'error'));
    }
    
    // Track upload completion
    if (failCount > 0 && successCount === 0) {
      await trackEvent('upload_locations_failed', {
        org: org || 'unknown',
        filename: locationFileName,
        error: errors.length > 0 ? errors[0] : 'Upload failed'
      });
    } else {
      await trackEvent('upload_locations_completed', {
        org: org || 'unknown',
        filename: locationFileName,
        record_count: locationFileData.length,
        success_count: successCount,
        fail_count: failCount
      });
    }
    
    status(`Upload complete: ${successCount} succeeded, ${failCount} failed`, successCount > 0 ? 'success' : 'error');
  });
}