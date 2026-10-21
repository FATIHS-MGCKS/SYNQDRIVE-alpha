#!/usr/bin/env node
/**
 * R9 five-vehicle canary — Production ops script.
 * Active cohort allowlist only; tokenId 190497 excluded (former fleet vehicle).
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';

const R9_SPEED_DISPLAY = 'SynqDrive R9 Speed Wake';
const R9_IGNITION_DISPLAY = 'SynqDrive R9 Ignition Wake';
const LEGACY_STABLE_IDS = new Set(['a257daa23ee5', 'b977124a025a', '1f96faea6569']);
const ACTIVE_COHORT = [186946, 187336, 187361, 187784, 192922];
const EXCLUDED_FORMER = 190497;
const EXPECTED_CALLBACK = 'https://app.synqdrive.eu/api/v1/webhooks/dimo';

const IDENTITY_QUERY = `
  query VehiclesForDeveloper($clientId: Address!) {
    vehicles(first: 100, filterBy: { privileged: $clientId }) {
      totalCount
      nodes { tokenId }
    }
  }
`;

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
  const challengeRes = await axios.post(`${authUrl}/auth/web3/generate_challenge`, null, {
    params: { client_id: clientId, domain, scope: 'openid email', response_type: 'code', address: clientId },
    timeout: 15000,
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
    timeout: 15000,
  });
  const jwt = submitRes.data?.developer_jwt ?? submitRes.data?.access_token ?? submitRes.data?.token;
  if (!jwt) throw new Error('JWT_MISSING');
  return jwt;
}

const state = {
  api: 'https://vehicle-triggers-api.dimo.zone',
  expectedCallback: EXPECTED_CALLBACK,
  expectedCallbackNorm: normalizeUrl(EXPECTED_CALLBACK),
  contract: '',
  clientId: '',
  headers: null,
  preState: null,
  created: { speedWebhookId: null, ignitionWebhookId: null, speedCreated: false, ignitionCreated: false },
  subscribed: { speed: [], ignition: [] },
  legacySnapshot: null,
};

function parseWebhookList(data) {
  return Array.isArray(data) ? data : data?.webhooks ?? [];
}

async function listWebhooks() {
  const res = await axios.get(`${state.api}/v1/webhooks`, { headers: state.headers, timeout: 15000 });
  return parseWebhookList(res.data);
}

async function fetchPrivilegedTokenIds(clientId) {
  const res = await axios.post(
    'https://identity-api.dimo.zone/query',
    { query: IDENTITY_QUERY, variables: { clientId } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
  );
  const nodes = res.data?.data?.vehicles?.nodes ?? [];
  return nodes.map((n) => Number(n.tokenId)).sort((a, b) => a - b);
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
  const perVehicle = [];
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
    perVehicle.push({ tokenId, speed, ign });
  }
  return { subscribedSpeed, subscribedIgnition, subscribedBoth, missingBoth, perVehicle };
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
  return { message: err?.message ?? String(err), status: err?.response?.status ?? null, data: err?.response?.data ?? null };
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
  await axios.delete(`${state.api}/v1/webhooks/${webhookId}`, { headers: state.headers, timeout: 15000 });
}

async function rollback() {
  const errors = [];
  for (const tokenId of [...new Set([...state.subscribed.speed, ...state.subscribed.ignition])]) {
    if (state.created.speedWebhookId) {
      try {
        await unsubscribeVehicle(state.created.speedWebhookId, tokenId);
      } catch (e) {
        errors.push(`unsub_speed_${tokenId}:${e.message}`);
      }
    }
    if (state.created.ignitionWebhookId) {
      try {
        await unsubscribeVehicle(state.created.ignitionWebhookId, tokenId);
      } catch (e) {
        errors.push(`unsub_ign_${tokenId}:${e.message}`);
      }
    }
  }
  if (state.created.speedWebhookId && state.created.speedCreated) {
    try {
      await deleteWebhook(state.created.speedWebhookId);
    } catch (e) {
      errors.push(`del_speed:${e.message}`);
    }
  }
  if (state.created.ignitionWebhookId && state.created.ignitionCreated) {
    try {
      await deleteWebhook(state.created.ignitionWebhookId);
    } catch (e) {
      errors.push(`del_ign:${e.message}`);
    }
  }
  return errors;
}

async function snapshotLegacy(webhooks) {
  const matched = webhooks.filter((w) => normalizeUrl(w.targetURL ?? w.url ?? '') === state.expectedCallbackNorm);
  const legacy = matched.filter((w) => LEGACY_STABLE_IDS.has(stableId(w.id)));
  if (legacy.length !== 3) throw new Error(`LEGACY_WEBHOOK_COUNT:${legacy.length}:expected:3`);
  return legacy.map(sanitizeWebhook);
}

async function runPreflight(env) {
  const jwt = await getDeveloperJwt(env);
  state.headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  state.clientId = env.DIMO_CLIENT_ID;

  const privileged = await fetchPrivilegedTokenIds(state.clientId);
  const expected = [...ACTIVE_COHORT].sort((a, b) => a - b);
  if (JSON.stringify(privileged) !== JSON.stringify(expected)) {
    throw new Error(`PREFLIGHT_PRIVILEGED_MISMATCH:got=${JSON.stringify(privileged)}:expected=${JSON.stringify(expected)}`);
  }
  if (privileged.includes(EXCLUDED_FORMER)) {
    throw new Error(`PREFLIGHT_EXCLUDED_PRESENT:${EXCLUDED_FORMER}`);
  }

  let webhooks = await listWebhooks();
  const r9Existing = webhooks.filter((w) => (w.displayName ?? '').startsWith('SynqDrive R9'));
  if (r9Existing.length > 0) {
    throw new Error(`PREFLIGHT_R9_EXISTS:${r9Existing.map((w) => stableId(w.id)).join(',')}`);
  }
  assertNoConflictingR9(webhooks);
  state.legacySnapshot = await snapshotLegacy(webhooks);

  if (normalizeUrl(state.expectedCallback) !== state.expectedCallbackNorm) {
    throw new Error('PREFLIGHT_CALLBACK_MISMATCH');
  }

  const preActive = await coverageAudit(webhooks, ACTIVE_COHORT);
  const preFormer = await coverageAudit(webhooks, [EXCLUDED_FORMER]);

  state.preState = {
    activeCohort: ACTIVE_COHORT,
    excludedFormer: EXCLUDED_FORMER,
    privileged,
    callback: state.expectedCallback,
    legacyWebhooks: state.legacySnapshot,
    activeCoverage: preActive,
    formerCoverage: preFormer,
  };
  return webhooks;
}

async function main() {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV || '/opt/synqdrive/shared/backend.env';
  const env = loadEnv(envPath);
  state.contract =
    env.DIMO_VEHICLE_NFT_CONTRACT ||
    (env.DIMO_ENV === 'dev'
      ? '0x45fbCD3ef7361d156e8b16F5538AE36DEdf61Da8'
      : '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF');
  const verificationToken = (env.DIMO_WEBHOOK_VERIFICATION_TOKEN ?? '').trim();
  if (!verificationToken) throw new Error('MISSING_VERIFICATION_TOKEN');

  let webhooks = await runPreflight(env);

  const speedPayload = {
    service: 'signals',
    metricName: 'vss.speed',
    condition: 'valueNumber > 3',
    coolDownPeriod: 30,
    description: 'R9 five-vehicle canary speed wake trigger for SynqDrive Production',
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
    description: 'R9 five-vehicle canary ignition wake trigger for SynqDrive Production',
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
    state.created.speedCreated = true;
  }

  if (ignWh) {
    if (ignWh.condition !== ignitionPayload.condition || !normalizeMetric(ignWh.metricName).includes('ignition')) {
      throw new Error('CONFLICTING_EXISTING_IGNITION_WEBHOOK');
    }
    state.created.ignitionWebhookId = String(ignWh.id);
  } else {
    state.created.ignitionWebhookId = await createWebhook(ignitionPayload);
    state.created.ignitionCreated = true;
  }

  await new Promise((r) => setTimeout(r, 8000));
  webhooks = await listWebhooks();

  for (const tokenId of ACTIVE_COHORT) {
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
  const postActive = await coverageAudit(webhooks, ACTIVE_COHORT);
  const postFormer = await coverageAudit(webhooks, [EXCLUDED_FORMER]);
  const postLegacy = await snapshotLegacy(webhooks);

  const legacyUnchanged =
    JSON.stringify(state.legacySnapshot) === JSON.stringify(postLegacy) &&
    postLegacy.every((w, i) => w.failureCount === state.legacySnapshot[i].failureCount);

  const formerSubscribedR9 = postFormer.perVehicle[0]?.speed || postFormer.perVehicle[0]?.ign;

  if (
    postActive.subscribedSpeed !== 5 ||
    postActive.subscribedIgnition !== 5 ||
    postActive.subscribedBoth !== 5 ||
    postActive.missingBoth !== 0
  ) {
    throw new Error(`POST_VERIFY_ACTIVE_FAILED:${JSON.stringify(postActive)}`);
  }
  if (formerSubscribedR9) throw new Error(`FORMER_VEHICLE_SUBSCRIBED_R9:${EXCLUDED_FORMER}`);
  if (!legacyUnchanged) throw new Error('LEGACY_WEBHOOKS_CHANGED');

  console.log(
    JSON.stringify({
      result: 'PASS',
      activeCohort: ACTIVE_COHORT,
      excludedFormer: EXCLUDED_FORMER,
      preState: state.preState,
      createdR9Triggers: {
        speed: {
          stableId: stableId(state.created.speedWebhookId),
          displayName: R9_SPEED_DISPLAY,
          metricName: speedPayload.metricName,
          condition: speedPayload.condition,
          coolDownPeriod: speedPayload.coolDownPeriod,
          created: state.created.speedCreated,
        },
        ignition: {
          stableId: stableId(state.created.ignitionWebhookId),
          displayName: R9_IGNITION_DISPLAY,
          metricName: ignitionPayload.metricName,
          condition: ignitionPayload.condition,
          coolDownPeriod: ignitionPayload.coolDownPeriod,
          created: state.created.ignitionCreated,
        },
      },
      subscriptionsAdded: {
        speedTokenIds: state.subscribed.speed,
        ignitionTokenIds: state.subscribed.ignition,
      },
      postActiveCoverage: postActive,
      formerVehicleR9Subscribed: formerSubscribedR9,
      legacyUnchanged: true,
    }),
  );
}

main().catch(async (err) => {
  const rollbackErrors = await rollback().catch((e) => [`rollback_exception:${e.message}`]);
  console.log(
    JSON.stringify({
      result: err.message?.startsWith('PREFLIGHT_') ? 'BLOCKED' : 'ROLLED_BACK',
      error: String(err.message || err),
      rollbackErrors,
      partialCreated: {
        speedStableId: state.created.speedWebhookId ? stableId(state.created.speedWebhookId) : null,
        ignitionStableId: state.created.ignitionWebhookId ? stableId(state.created.ignitionWebhookId) : null,
        speedCreated: state.created.speedCreated,
        ignitionCreated: state.created.ignitionCreated,
      },
    }),
  );
  process.exit(1);
});
