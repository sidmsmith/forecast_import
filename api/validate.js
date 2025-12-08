// api/validate.js
import fetch from 'node-fetch';

// Home Assistant Configuration
const HA_WEBHOOK_URL = process.env.HA_WEBHOOK_URL || "http://sidmsmith.zapto.org:8123/api/webhook/manhattan_app_usage";
const HA_HEADERS = { "Content-Type": "application/json" };
const APP_NAME = "Import Forecast";
const APP_VERSION = "0.2.0"; // Match version in index.html title

// Forecast app uses sales2 environment (different from other apps)
const AUTH_HOST = process.env.MANHATTAN_AUTH_HOST || "sales2-auth.omni.manh.com";
const API_HOST = process.env.MANHATTAN_API_HOST || "sales2.omni.manh.com";
const CLIENT_ID = "omnicomponent.1.0.0";
// CLIENT_SECRET for sales2 environment
// Set MANHATTAN_SECRET in Vercel environment variables, or it will use the fallback
const CLIENT_SECRET = process.env.MANHATTAN_SECRET || "b4s8rgTyg55XYNun";
const PASSWORD = process.env.MANHATTAN_PASSWORD || "Blu3sk!es2400";
const USERNAME_BASE = "rndadmin@"; // Forecast app uses rndadmin@ instead of sdtadmin@

// Helper: send to HA
async function sendHAMessage(eventName, metadata = {}) {
  try {
    const payload = {
      event_name: eventName,
      app_name: APP_NAME,
      app_version: APP_VERSION,
      timestamp: new Date().toISOString(),
      ...metadata
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    await fetch(HA_WEBHOOK_URL, {
      method: 'POST',
      headers: HA_HEADERS,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
  } catch (error) {
    // Silently fail - don't interrupt user experience
  }
}

// Get OAuth token
async function getToken(org) {
  const url = `https://${AUTH_HOST}/oauth/token`;
  // Postman shows orgid as "SDT-TEST" but username as "rndadmin@sdt-test"
  const normalizedOrg = org.trim().toLowerCase();
  const username = `${USERNAME_BASE}${normalizedOrg}`;
  
  const bodyParams = new URLSearchParams();
  bodyParams.append('grant_type', 'password');
  bodyParams.append('username', username);
  bodyParams.append('password', PASSWORD);
  const bodyString = bodyParams.toString();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
      },
      body: bodyString
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = `Authentication failed (${res.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error_description || errorJson.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const data = await res.json();
    if (!data.access_token) {
      throw new Error('No access token received from authentication server');
    }
    return data.access_token;
  } catch (error) {
    return null;
  }
}

// API call wrapper
async function apiCall(method, path, token, org, body = null) {
  const url = `https://${API_HOST}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    selectedOrganization: org,
    selectedLocation: `${org}-DM1`
  };

  const res = await fetch(url, { 
    method, 
    headers, 
    body: body ? JSON.stringify(body) : undefined 
  });
  return res.ok ? await res.json() : { error: await res.text() };
}

// Export handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, org } = req.body;

  // === HA TRACK EVENT ===
  if (action === 'ha-track') {
    const { event_name, metadata } = req.body;
    sendHAMessage(event_name, metadata);
    return res.json({ success: true });
  }

  // === APP OPENED (NO ORG) ===
  if (action === 'app_opened') {
    return res.json({ success: true });
  }

  // === AUTHENTICATE ===
  if (action === 'auth') {
    const token = await getToken(org);
    if (!token) {
      await sendHAMessage('auth_failed', { org: org || 'unknown' });
      return res.json({ success: false, error: "Authentication failed. Please check Vercel logs for details." });
    }
    await sendHAMessage('auth_success', { org: org || 'unknown' });
    return res.json({ success: true, token });
  }

  // === GET CONDITION CODES ===
  if (action === 'get-codes') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token" });

    const codesRes = await apiCall('GET', '/dcinventory/api/dcinventory/conditionCode?size=50', token, org);
    const items = codesRes.data || [];
    const codes = items
      .map(x => ({ code: x.ConditionCodeId, desc: x.Description }))
      .sort((a, b) => a.code.localeCompare(b.code));
    codes.unshift({ code: '', desc: 'Select Code' });

    return res.json({ codes });
  }

  // === CREATE LOCATION ===
  if (action === 'create-location') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token" });
    
    const { locationData } = req.body;
    if (!locationData) {
      return res.json({ success: false, error: "No location data provided" });
    }

    try {
      const result = await apiCall('POST', '/itemlocation/api/itemlocation/location/save', token, org, locationData);
      return res.json({ success: result.error ? false : true, result });
    } catch (error) {
      await sendHAMessage('upload_locations_failed', { org: org || 'unknown', error: error.message });
      return res.json({ success: false, error: error.message });
    }
  }

  // === SAVE FORECAST ===
  if (action === 'save-forecast') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token" });
    
    const { forecastData } = req.body;
    if (!forecastData) {
      return res.json({ success: false, error: "No forecast data provided" });
    }

    try {
      const result = await apiCall('POST', '/ai-forecast/api/ai-forecast/forecast/save', token, org, forecastData);
      return res.json({ success: result.error ? false : true, result });
    } catch (error) {
      await sendHAMessage('upload_forecast_failed', { org: org || 'unknown', error: error.message });
      return res.json({ success: false, error: error.message });
    }
  }

  // === SAVE FORECAST PROJECTIONS ===
  if (action === 'save-forecast-projections') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token" });
    
    const { projectionData } = req.body;
    if (!projectionData) {
      return res.json({ success: false, error: "No projection data provided" });
    }

    try {
      const result = await apiCall('POST', '/ai-forecast/api/ai-forecast/manualForecastEvent/save', token, org, projectionData);
      return res.json({ success: result.error ? false : true, result });
    } catch (error) {
      return res.json({ success: false, error: error.message });
    }
  }

  // Unknown action
  return res.status(400).json({ error: "Unknown action" });
}

export const config = { api: { bodyParser: true } };