import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';
import { execSync } from 'child_process';

function loadEnv(path) {
  const env = {};
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[line.slice(0, idx).trim()] = val;
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

const LEGACY_STABLE_IDS = new Set(['a257daa23ee5', 'b977124a025a', '1f96faea6569']);
const env = loadEnv('/opt/synqdrive/shared/backend.env');
const clientId = env.DIMO_CLIENT_ID;
const privateKey = env.DIMO_PRIVATE_KEY.startsWith('0x') ? env.DIMO_PRIVATE_KEY : `0x${env.DIMO_PRIVATE_KEY}`;
const domain = env.DIMO_REDIRECT_URI || env.DIMO_DOMAIN;
const authUrl = 'https://auth.dimo.zone';
const challengeRes = await axios.post(`${authUrl}/auth/web3/generate_challenge`, null, {
  params: { client_id: clientId, domain, scope: 'openid email', response_type: 'code', address: clientId },
});
const { challenge, state: st } = challengeRes.data;
const wallet = new Wallet(privateKey);
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
});
const jwt = submitRes.data?.developer_jwt ?? submitRes.data?.access_token;
const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
const api = 'https://vehicle-triggers-api.dimo.zone';
const contract = env.DIMO_VEHICLE_NFT_CONTRACT || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
const callback = `${(env.DIMO_WEBHOOK_BASE_URL || env.APP_URL || 'https://app.synqdrive.eu').replace(/\/+$/, '')}/api/v1/webhooks/dimo`;
const callbackNorm = normalizeUrl(callback);
const tokenIds = execSync(
  `sudo -u postgres psql -d synqdrive -At -c "SELECT dv.token_id FROM vehicles v INNER JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id WHERE v.dimo_vehicle_id IS NOT NULL AND v.status IN ('AVAILABLE','RENTED') AND dv.connection_status = 'CONNECTED' AND dv.token_id IS NOT NULL ORDER BY dv.token_id;"`,
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((s) => parseInt(s, 10));

const webhooksRaw = (await axios.get(`${api}/v1/webhooks`, { headers })).data;
const webhooks = Array.isArray(webhooksRaw) ? webhooksRaw : webhooksRaw?.webhooks ?? [];
const byId = new Map(webhooks.map((w) => [String(w.id), w]));
const legacy = webhooks.filter((w) => LEGACY_STABLE_IDS.has(stableId(w.id)));
const r9 = webhooks.filter((w) => (w.displayName || '').startsWith('SynqDrive R9'));
let subscribedSpeed = 0;
let subscribedIgnition = 0;
let subscribedBoth = 0;
let missingBoth = 0;
const perVehicle = [];

for (const tokenId of tokenIds) {
  const assetDid = `did:erc721:137:${contract}:${tokenId}`;
  const links = await axios.get(`${api}/v1/webhooks/vehicles/${assetDid}`, { headers }).then((r) => (Array.isArray(r.data) ? r.data : []));
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
  perVehicle.push({ tokenId, linkCount: links.length, speed, ign });
}

console.log(
  JSON.stringify(
    {
      callback,
      eligible: tokenIds.length,
      subscribedSpeed,
      subscribedIgnition,
      subscribedBoth,
      missingBoth,
      r9Definitions: r9.map((w) => ({ stableId: stableId(w.id), displayName: w.displayName, metricName: w.metricName, status: w.status })),
      legacyWebhooks: legacy.map((w) => ({
        stableId: stableId(w.id),
        displayName: w.displayName,
        metricName: w.metricName,
        status: w.status,
        failureCount: w.failureCount,
        callbackMatch: normalizeUrl(w.targetURL ?? w.url ?? '') === callbackNorm,
      })),
      perVehicle,
    },
    null,
    2,
  ),
);
