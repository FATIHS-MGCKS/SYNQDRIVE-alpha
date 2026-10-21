#!/usr/bin/env node
/**
 * R9 scoped DIMO trigger bootstrap — Production ops script.
 * Creates dedicated speed + isIgnitionOn trigger definitions and subscribes eligible cohort.
 * Swagger contract: vehicle-triggers-api (subscribe/{assetDID}, not legacy vehicles/{tokenId}).
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';
import { execSync } from 'child_process';

const R9_SPEED_DISPLAY = 'SynqDrive R9 Speed Wake';
const R9_IGNITION_DISPLAY = 'SynqDrive R9 Ignition Wake';
const LEGACY_STABLE_IDS = new Set(['a257daa23ee5', 'b977124a025a', '1f96faea6569']);

function loadEnv(path) {
  const env = {};
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function stableId(id) {
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '').toLowerCase();
}

function normalizeMetric(name) {
  const raw = String(name || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.includes('.') ? raw.split('.').pop() : raw;
}

function sanitizeWebhook(w) {
  return {
    stableId: stableId(w.id),
    displayName: w.displayName ?? w.name ?? '',
    metricName: w.metricName ?? '',
    status: w.status ?? '',
    failureCount: w.failureCount ?? null,
    callbackMatch: normalizeUrl(w.targetURL ?? w.url ?? '') === state.expectedCallbackNorm,
  };
}

async function getDeveloperJwt(env) {
  const clientId = env.DIMO_CLIENT_ID;
  const privateKey = env.DIMO_PRIVATE_KEY;
  const domain = env.DIMO_REDIRECT_URI || env.DIMO_DOMAIN || 'https://app.synqdrive.eu/auth/dimo/callback';
  if (!clientId || !privateKey) throw new Error('MISSING_DIMO_CREDENTIALS');
  const authUrl = 'https://auth.dimo.zone';
  const timeout = 15000;
  const challengeRes = await axios.post(`${authUrl}/auth/web3/generate_challenge`, null, {
    params: {
      client_id: clientId,
      domain,
      scope: 'openid email',
      response_type: 'code',
      address: clientId,
    },
    headers: { 'Content-Type': 'application/json' },
    timeout,
  });
  const { challenge, state: st } = challengeRes.data || {};
  if (!challenge || !st) throw new Error('CHALLENGE_FAILED');
  const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const signature = await wallet.signMessage(challenge);
  const submitBody = new URLSearchParams({
    client_id: clientId,
    domain,
    grant_type: 'authorization_code',
    response_type: 'code',
    scope: 'openid email',
    state: st,
    signature,
    address: clientId,
  });
  const submitRes = await axios.post(`${authUrl}/auth/web3/submit_challenge`, submitBody.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout,
  });
  const jwt = submitRes.data?.developer_jwt ?? submitRes.data?.access_token ?? submitRes.data?.token;
  if (!jwt) throw new Error('JWT_MISSING');
  return jwt;
}

const state = {
  api: 'https://vehicle-triggers-api.dimo.zone',
  expectedCallback: '',
  expectedCallbackNorm: '',
  contract: '',
  headers: null,
  preState: null,
  created: { speedWebhookId: null, ignitionWebhookId: null },
  subscribed: { speed: [], ignition: [] },
  legacySnapshot: null,
};

async function listWebhooks() {
  const res = await axios.get(`${state.api}/v1/webhooks`, { headers: state.headers, timeout: 15000 });
  const list = res.data?.webhooks ?? res.data ?? [];
  return Array.isArray(list) ? list : [];
}

function getTokenIds() {
  const out = execSync(
    `sudo -u postgres psql -d synqdrive -At -c "SELECT dv.token_id FROM vehicles v INNER JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id WHERE v.dimo_vehicle_id IS NOT NULL AND v.status IN ('AVAILABLE','RENTED') AND dv.connection_status = 'CONNECTED' AND dv.token_id IS NOT NULL ORDER BY dv.token_id;"`,
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((s) => parseInt(s, 10));
  return out;
}

function assetDid(tokenId) {
  return `did:erc721:137:${state.contract}:${tokenId}`;
}

async function getVehicleSubscriptions(tokenId) {
  const subject = assetDid(tokenId);
  const res = await axios.get(`${state.api}/v1/webhooks/vehicles/${subject}`, {
    headers: state.headers,
    timeout: 15000,
  });
  return Array.isArray(res.data) ? res.data : [];
}

async function coverageAudit(webhooks, tokenIds) {
  const byId = new Map(webhooks.map((w) => [String(w.id), w]));
  let subscribedSpeed = 0;
  let subscribedIgnition = 0;
  let subscribedBoth = 0;
  let missingBoth = 0;
  for (const tokenId of tokenIds) {
    const links = await getVehicleSubscriptions(tokenId);
    const linked = links.map((e) => byId.get(String(e.webhookId ?? ''))).filter(Boolean);
    const speed = linked.some((w) => normalizeMetric(w.metricName) === 'speed');
    const ign = linked.some((w) => {
      const m = normalizeMetric(w.metricName);
      return m === 'isignitionon' || m.includes('ignition');
    });
    if (speed) subscribedSpeed += 1;
    if (ign) subscribedIgnition += 1;
    if (speed && ign) subscribedBoth += 1;
    if (!speed && !ign) missingBoth += 1;
  }
  return { subscribedSpeed, subscribedIgnition, subscribedBoth, missingBoth };
}

function findR9Webhook(webhooks, displayName, expectedMetricTail) {
  return webhooks.find((w) => {
    if ((w.displayName ?? '') !== displayName) return false;
    const tail = normalizeMetric(w.metricName);
    if (expectedMetricTail === 'speed') return tail === 'speed';
    if (expectedMetricTail === 'isignitionon') return tail.includes('ignition');
    return false;
  });
}

function assertNoConflictingR9(webhooks) {
  for (const w of webhooks) {
    const tail = normalizeMetric(w.metricName);
    const isR9Metric = tail === 'speed' || tail.includes('ignition');
    if (!isR9Metric) continue;
    const name = w.displayName ?? '';
    if (name === R9_SPEED_DISPLAY || name === R9_IGNITION_DISPLAY) continue;
    if (normalizeUrl(w.targetURL ?? w.url ?? '') === state.expectedCallbackNorm) {
      throw new Error(`CONFLICTING_R9_WEBHOOK:stableId=${stableId(w.id)}:displayName=${name}:metric=${w.metricName}`);
    }
  }
}

async function createWebhook(payload) {
  const res = await axios.post(`${state.api}/v1/webhooks`, payload, {
    headers: state.headers,
    timeout: 30000,
  });
  const id = res.data?.id;
  if (!id) throw new Error(`CREATE_NO_ID:${payload.displayName}`);
  return String(id);
}

function axiosErrorDetail(err) {
  return {
    message: err?.message ?? String(err),
    status: err?.response?.status ?? null,
    data: err?.response?.data ?? null,
  };
}

async function getWebhookFromList(webhookId) {
  const webhooks = await listWebhooks();
  return webhooks.find((w) => String(w.id) === String(webhookId)) ?? null;
}

async function waitForWebhookListed(webhookId, displayName, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const wh = await getWebhookFromList(webhookId);
    if (wh) {
      const status = String(wh?.status ?? '').toLowerCase();
      if (status === 'failed') {
        throw new Error(`WEBHOOK_VERIFICATION_FAILED:${displayName}:failureCount=${wh?.failureCount ?? 'unknown'}`);
      }
      return wh;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`WEBHOOK_LIST_TIMEOUT:${displayName}`);
}

async function subscribeVehicle(webhookId, tokenId) {
  const did = assetDid(tokenId);
  try {
    await axios.post(`${state.api}/v1/webhooks/${webhookId}/subscribe/${encodeURIComponent(did)}`, {}, {
      headers: state.headers,
      timeout: 15000,
    });
  } catch (err) {
    throw new Error(`SUBSCRIBE_FAILED:tokenId=${tokenId}:webhookId=${stableId(webhookId)}:${JSON.stringify(axiosErrorDetail(err))}`);
  }
}

async function unsubscribeVehicle(webhookId, tokenId) {
  const did = encodeURIComponent(assetDid(tokenId));
  await axios.delete(`${state.api}/v1/webhooks/${webhookId}/unsubscribe/${did}`, {
    headers: state.headers,
    timeout: 15000,
  });
}

async function deleteWebhook(webhookId) {
  await axios.delete(`${state.api}/v1/webhooks/${webhookId}`, {
    headers: state.headers,
    timeout: 15000,
  });
}

async function rollback() {
  const errors = [];
  for (const tokenId of state.subscribed.speed) {
    try {
      await unsubscribeVehicle(state.created.speedWebhookId, tokenId);
    } catch (e) {
      errors.push(`unsub_speed_${tokenId}:${e.message}`);
    }
  }
  for (const tokenId of state.subscribed.ignition) {
    try {
      await unsubscribeVehicle(state.created.ignitionWebhookId, tokenId);
    } catch (e) {
      errors.push(`unsub_ign_${tokenId}:${e.message}`);
    }
  }
  if (state.created.speedWebhookId) {
    try {
      await deleteWebhook(state.created.speedWebhookId);
    } catch (e) {
      errors.push(`del_speed:${e.message}`);
    }
  }
  if (state.created.ignitionWebhookId) {
    try {
      await deleteWebhook(state.created.ignitionWebhookId);
    } catch (e) {
      errors.push(`del_ign:${e.message}`);
    }
  }
  return errors;
}

async function snapshotLegacy(webhooks) {
  const matched = webhooks.filter(
    (w) => normalizeUrl(w.targetURL ?? w.url ?? '') === state.expectedCallbackNorm,
  );
  const legacy = matched.filter((w) => LEGACY_STABLE_IDS.has(stableId(w.id)));
  if (legacy.length !== 3) {
    throw new Error(`LEGACY_WEBHOOK_COUNT:${legacy.length}:expected:3`);
  }
  return legacy.map(sanitizeWebhook);
}

async function main() {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
  const env = loadEnv(envPath);
  const webhookBase = (env.DIMO_WEBHOOK_BASE_URL || env.APP_URL || env.BASE_URL || 'https://app.synqdrive.eu').replace(
    /\/+$/,
    '',
  );
  state.expectedCallback = `${webhookBase}/api/v1/webhooks/dimo`;
  state.expectedCallbackNorm = normalizeUrl(state.expectedCallback);
  state.contract =
    env.DIMO_VEHICLE_NFT_CONTRACT ||
    (env.DIMO_ENV === 'dev'
      ? '0x45fbCD3ef7361d156e8b16F5538AE36DEdf61Da8'
      : '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF');
  const verificationToken = (env.DIMO_WEBHOOK_VERIFICATION_TOKEN ?? '').trim();
  if (!verificationToken) throw new Error('MISSING_VERIFICATION_TOKEN');

  const jwt = await getDeveloperJwt(env);
  state.headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  const tokenIds = getTokenIds();
  if (tokenIds.length !== 6) throw new Error(`ELIGIBLE_COHORT:${tokenIds.length}:expected:6`);

  let webhooks = await listWebhooks();
  assertNoConflictingR9(webhooks);
  state.legacySnapshot = await snapshotLegacy(webhooks);
  const preCoverage = await coverageAudit(webhooks, tokenIds);
  state.preState = {
    eligible: tokenIds.length,
    callback: state.expectedCallback,
    legacyWebhooks: state.legacySnapshot,
    coverage: preCoverage,
  };

  const speedPayload = {
    service: 'signals',
    metricName: 'vss.speed',
    condition: 'valueNumber > 3',
    coolDownPeriod: 30,
    description: 'R9 scoped speed wake trigger for SynqDrive Production',
    displayName: R9_SPEED_DISPLAY,
    targetURL: state.expectedCallback,
    status: 'enabled',
    verificationToken,
  };
  const ignitionPayload = {
    service: 'signals',
    metricName: 'vss.isIgnitionOn',
    condition: 'valueNumber == 1',
    coolDownPeriod: 30,
    description: 'R9 scoped ignition wake trigger for SynqDrive Production',
    displayName: R9_IGNITION_DISPLAY,
    targetURL: state.expectedCallback,
    status: 'enabled',
    verificationToken,
  };

  let speedWh = findR9Webhook(webhooks, R9_SPEED_DISPLAY, 'speed');
  let ignWh = findR9Webhook(webhooks, R9_IGNITION_DISPLAY, 'isignitionon');

  if (speedWh) {
    if (speedWh.condition !== speedPayload.condition || normalizeMetric(speedWh.metricName) !== 'speed') {
      throw new Error('CONFLICTING_EXISTING_SPEED_WEBHOOK');
    }
    state.created.speedWebhookId = String(speedWh.id);
  } else {
    state.created.speedWebhookId = await createWebhook(speedPayload);
  }

  if (ignWh) {
    if (ignWh.condition !== ignitionPayload.condition || !normalizeMetric(ignWh.metricName).includes('ignition')) {
      throw new Error('CONFLICTING_EXISTING_IGNITION_WEBHOOK');
    }
    state.created.ignitionWebhookId = String(ignWh.id);
  } else {
    state.created.ignitionWebhookId = await createWebhook(ignitionPayload);
  }

  // Allow DIMO callback verification to complete before vehicle subscribe (probe: ~5s sufficient).
  await new Promise((r) => setTimeout(r, 8000));

  webhooks = await listWebhooks();

  for (const tokenId of tokenIds) {
    const links = await getVehicleSubscriptions(tokenId);
    const linkedIds = new Set(links.map((e) => String(e.webhookId ?? '')));
    if (!linkedIds.has(state.created.speedWebhookId)) {
      await subscribeVehicle(state.created.speedWebhookId, tokenId);
      state.subscribed.speed.push(tokenId);
    }
    if (!linkedIds.has(state.created.ignitionWebhookId)) {
      await subscribeVehicle(state.created.ignitionWebhookId, tokenId);
      state.subscribed.ignition.push(tokenId);
    }
  }

  webhooks = await listWebhooks();
  const postCoverage = await coverageAudit(webhooks, tokenIds);
  const postLegacy = await snapshotLegacy(webhooks);

  const legacyUnchanged =
    JSON.stringify(state.legacySnapshot) === JSON.stringify(postLegacy) &&
    postLegacy.every((w, i) => w.failureCount === state.legacySnapshot[i].failureCount);

  if (
    postCoverage.subscribedSpeed !== 6 ||
    postCoverage.subscribedIgnition !== 6 ||
    postCoverage.subscribedBoth !== 6 ||
    postCoverage.missingBoth !== 0
  ) {
    throw new Error(`POST_VERIFY_FAILED:${JSON.stringify(postCoverage)}`);
  }
  if (!legacyUnchanged) throw new Error('LEGACY_WEBHOOKS_CHANGED');

  console.log(
    JSON.stringify({
      result: 'PASS',
      preState: state.preState,
      createdR9Triggers: {
        speed: { stableId: stableId(state.created.speedWebhookId), displayName: R9_SPEED_DISPLAY, ...speedPayload, verificationToken: '<redacted>' },
        ignition: {
          stableId: stableId(state.created.ignitionWebhookId),
          displayName: R9_IGNITION_DISPLAY,
          ...ignitionPayload,
          verificationToken: '<redacted>',
        },
      },
      subscriptionsAdded: {
        speedCount: state.subscribed.speed.length,
        ignitionCount: state.subscribed.ignition.length,
      },
      postCoverage,
      legacyUnchanged: true,
    }),
  );
}

main().catch(async (err) => {
  const rollbackErrors = await rollback().catch((e) => [`rollback_exception:${e.message}`]);
  console.log(
    JSON.stringify({
      result: 'ROLLED_BACK',
      error: String(err.message || err),
      rollbackErrors,
      partialCreated: {
        speedStableId: state.created.speedWebhookId ? stableId(state.created.speedWebhookId) : null,
        ignitionStableId: state.created.ignitionWebhookId ? stableId(state.created.ignitionWebhookId) : null,
      },
    }),
  );
  process.exit(1);
});
