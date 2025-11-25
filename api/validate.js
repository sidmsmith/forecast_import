// api/validate.js
import fetch from 'node-fetch';

const HA_WEBHOOK_URL = "http://sidmsmith.zapto.org:8123/api/webhook/manhattan_forecastimport";
// Forecast app uses sales2 environment (different from other apps)
const AUTH_HOST = process.env.MANHATTAN_AUTH_HOST || "sales2-auth.omni.manh.com";
const API_HOST = process.env.MANHATTAN_API_HOST || "sales2.omni.manh.com";
const CLIENT_ID = "omnicomponent.1.0.0";
// CLIENT_SECRET for sales2 environment
// Set MANHATTAN_SECRET in Vercel environment variables, or it will use the fallback
const CLIENT_SECRET = process.env.MANHATTAN_SECRET || "b4s8rgTyg55XYNun";
const PASSWORD = process.env.MANHATTAN_PASSWORD || "Blu3sk!es2400";
const USERNAME_BASE = "rndadmin@"; // Forecast app uses rndadmin@ instead of sdtadmin@

// Log which values are being used (for debugging)
console.log(`[CONFIG] PASSWORD from env: ${!!process.env.MANHATTAN_PASSWORD}`);
console.log(`[CONFIG] CLIENT_SECRET from env: ${!!process.env.MANHATTAN_SECRET}`);
console.log(`[CONFIG] AUTH_HOST: ${AUTH_HOST}`);
console.log(`[CONFIG] API_HOST: ${API_HOST}`);

// Helper: send to HA
async function sendHA(action, org, success = 0, fail = 0, total = 0) {
  console.log(`[HA] Sending: ${action} | Org: ${org}`);
  try {
    const payload = {
      type: "lpn_action",
      action,
      org: org || "unknown",
      success_count: success,
      fail_count: fail,
      total_count: total
    };
    const response = await fetch(HA_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`[HA] Status: ${response.status}`);
  } catch (e) {
    console.error("[HA] ERROR:", e.message);
  }
}

// Get OAuth token
async function getToken(org) {
  const url = `https://${AUTH_HOST}/oauth/token`;
  // Try both lowercase and original case for org
  // Postman shows orgid as "SDT-TEST" but username as "rndadmin@sdt-test"
  const normalizedOrg = org.trim().toLowerCase();
  const username = `${USERNAME_BASE}${normalizedOrg}`;
  
  // Also try with original case (for debugging)
  const usernameOriginalCase = `${USERNAME_BASE}${org.trim()}`;
  console.log(`[AUTH] Will try username: ${username}`);
  console.log(`[AUTH] Alternative username (original case): ${usernameOriginalCase}`);
  
  // Manually construct body to ensure proper encoding of special characters
  // URLSearchParams should handle this, but being explicit
  const bodyParams = new URLSearchParams();
  bodyParams.append('grant_type', 'password');
  bodyParams.append('username', username);
  bodyParams.append('password', PASSWORD);
  const body = bodyParams;

  console.log(`[AUTH] Attempting authentication for ORG: ${org}`);
  console.log(`[AUTH] Normalized ORG: ${normalizedOrg}`);
  console.log(`[AUTH] URL: ${url}`);
  console.log(`[AUTH] Username: ${username}`);
  console.log(`[AUTH] Password length: ${PASSWORD ? PASSWORD.length : 0}`);
  console.log(`[AUTH] Password first char: ${PASSWORD ? PASSWORD[0] : 'N/A'}`);
  console.log(`[AUTH] Password last char: ${PASSWORD ? PASSWORD[PASSWORD.length - 1] : 'N/A'}`);
  console.log(`[AUTH] Password contains $: ${PASSWORD ? PASSWORD.includes('$') : false}`);
  console.log(`[AUTH] Password contains !: ${PASSWORD ? PASSWORD.includes('!') : false}`);
  console.log(`[AUTH] AUTH_HOST: ${AUTH_HOST}`);
  console.log(`[AUTH] CLIENT_ID: ${CLIENT_ID}`);
  console.log(`[AUTH] CLIENT_SECRET set: ${!!CLIENT_SECRET}`);
  console.log(`[AUTH] CLIENT_SECRET value: ${CLIENT_SECRET ? CLIENT_SECRET.substring(0, 4) + '...' : 'NOT SET'}`);
  
  // Also log the raw password characters for verification (masked)
  const passwordChars = PASSWORD.split('').map((c, i) => {
    if (i === 0 || i === PASSWORD.length - 1) return c;
    if (c === '$') return '$';
    if (c === '!') return '!';
    return '*';
  }).join('');
  console.log(`[AUTH] Password pattern: ${passwordChars}`);

  try {
    // Convert URLSearchParams to string for fetch
    const bodyString = body.toString();
    
    // Log the encoded body to verify encoding
    const passwordMatch = bodyString.match(/password=([^&]+)/);
    const encodedPassword = passwordMatch ? passwordMatch[1] : 'NOT FOUND';
    console.log(`[AUTH] Request body (masked): ${bodyString.replace(/password=[^&]+/, 'password=***')}`);
    console.log(`[AUTH] Username in body: ${bodyString.match(/username=([^&]+)/)?.[1] || 'NOT FOUND'}`);
    console.log(`[AUTH] Password encoded length: ${encodedPassword.length}`);
    console.log(`[AUTH] Password encoded first 10 chars: ${encodedPassword.substring(0, 10)}...`);
    console.log(`[AUTH] Password encoded contains %24 (encoded $): ${encodedPassword.includes('%24')}`);
    console.log(`[AUTH] Password encoded contains %21 (encoded !): ${encodedPassword.includes('%21')}`);
    
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
      console.error(`[AUTH] Failed with status ${res.status}: ${errorMessage}`);
      console.error(`[AUTH] Response headers:`, JSON.stringify(Object.fromEntries(res.headers.entries())));
      throw new Error(errorMessage);
    }
    
    const data = await res.json();
    if (!data.access_token) {
      console.error(`[AUTH] No access_token in response:`, JSON.stringify(data));
      throw new Error('No access token received from authentication server');
    }
    console.log(`[AUTH] Success for ORG: ${org}`);
    return data.access_token;
  } catch (error) {
    console.error(`[AUTH] Exception: ${error.message}`);
    console.error(`[AUTH] Stack: ${error.stack}`);
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
  console.log(`[API] ${req.method} ${req.url}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, org, lpn, code } = req.body;

  // === APP OPENED (NO ORG) ===
  if (action === 'app_opened') {
    await sendHA("app_opened", "unknown");
    return res.json({ success: true });
  }

  // === AUTHENTICATE ===
  if (action === 'auth') {
    try {
      const token = await getToken(org);
      if (!token) {
        await sendHA("auth_failed", org);
        return res.json({ success: false, error: "Authentication failed. Please check Vercel logs for details." });
      }
      await sendHA("auth_success", org);
      return res.json({ success: true, token });
    } catch (error) {
      console.error(`[AUTH] Error during authentication:`, error.message);
      await sendHA("auth_failed", org);
      return res.json({ success: false, error: error.message || "Authentication failed. Please check Vercel logs for details." });
    }
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
      return res.json({ success: false, error: error.message });
    }
  }

  // === Need token ===
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "No token" });

  const lpns = lpn?.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean) || [];
  if (!lpns.length) return res.json({ error: "No LPNs" });

  let success = 0, fail = 0;
  const results = {};

  for (const l of lpns) {
    const searchRes = await apiCall('POST', '/dcinventory/api/dcinventory/inventory/search', token, org, {
      Query: `InventoryContainerId = '${l}'`, Size: 1, Page: 0
    });
    const exists = searchRes?.header?.totalCount > 0;
    if (!exists) {
      results[l] = { error: "LPN does not exist" };
      fail++;
      continue;
    }

    if (action === 'lock') {
      if (!code) { results[l] = { error: "No code" }; fail++; continue; }
      const current = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/search', token, org, {
        Query: `InventoryContainerId = ${l} and InventoryContainerTypeId = ILPN`, Page: 0
      });
      const hasCode = current.data?.some(x => x.ConditionCode === code);
      if (hasCode) {
        results[l] = { error: `Already locked with ${code}` };
        fail++;
      } else {
        const lockRes = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/save', token, org, {
          InventoryContainerTypeId: "ILPN",
          CreatedBy: `sdtadmin@${org.toLowerCase()}`,
          ConditionCode: code,
          OrgId: org,
          FacilityId: `${org}-DM1`,
          UpdatedBy: `sdtadmin@${org.toLowerCase()}`,
          InventoryContainerId: l
        });
        results[l] = lockRes;
        if (lockRes.success !== false) success++; else fail++;
      }
    }

    if (action === 'unlock') {
      const current = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/search', token, org, {
        Query: `InventoryContainerId = ${l} and InventoryContainerTypeId = ILPN`, Page: 0
      });
      const codes = current.data?.map(x => x.ConditionCode) || [];
      if (!codes.length) {
        results[l] = { error: "No condition codes" };
        fail++;
        continue;
      }

      if (!code) {
        for (const c of codes) {
          if (!c) continue;
          const delRes = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/deleteContainerConditions', token, org, {
            InventoryContainerTypeId: "ILPN",
            CreatedBy: `sdtadmin@${org.toLowerCase()}`,
            ConditionCode: c,
            OrgId: org,
            FacilityId: `${org}-DM1`,
            UpdatedBy: `sdtadmin@${org.toLowerCase()}`,
            InventoryContainerId: l
          });
          results[`${l} (remove ${c})`] = delRes;
          if (delRes.success !== false) success++; else fail++;
        }
      } else {
        if (!codes.includes(code)) {
          results[l] = { error: `Not locked with ${code}` };
          fail++;
        } else {
          const delRes = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/deleteContainerConditions', token, org, {
            InventoryContainerTypeId: "ILPN",
            CreatedBy: `sdtadmin@${org.toLowerCase()}`,
            ConditionCode: code,
            OrgId: org,
            FacilityId: `${org}-DM1`,
            UpdatedBy: `sdtadmin@${org.toLowerCase()}`,
            InventoryContainerId: l
          });
          results[l] = delRes;
          if (delRes.success !== false) success++; else fail++;
        }
      }
    }
  }

  await sendHA(action, org, success, fail, lpns.length);
  res.json({ results, success, fail, total: lpns.length });
}

export const config = { api: { bodyParser: true } };