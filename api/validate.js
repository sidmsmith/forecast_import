// api/validate.js
import fetch from 'node-fetch';

const HA_WEBHOOK_URL = "http://sidmsmith.zapto.org:8123/api/webhook/manhattan_lpnlock";
const AUTH_HOST = "salep-auth.sce.manh.com";
const API_HOST = "salep.sce.manh.com";
const CLIENT_ID = "omnicomponent.1.0.0";
const CLIENT_SECRET = "b4s8rgTyg55XYNun";
const PASSWORD = "Blu3sk!es2300";
const USERNAME_BASE = "sdtadmin@";

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
  const username = `${USERNAME_BASE}${org.toLowerCase()}`;
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password: PASSWORD
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    },
    body
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
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
    const token = await getToken(org);
    if (!token) {
      await sendHA("auth_failed", org);
      return res.json({ success: false, error: "Auth failed" });
    }
    await sendHA("auth_success", org);  // ← FIXED
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