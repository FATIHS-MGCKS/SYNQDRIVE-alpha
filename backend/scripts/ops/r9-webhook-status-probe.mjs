import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';

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
const webhookBase = (env.DIMO_WEBHOOK_BASE_URL || env.APP_URL || 'https://app.synqdrive.eu').replace(/\/+$/, '');
const callback = `${webhookBase}/api/v1/webhooks/dimo`;
const verificationToken = (env.DIMO_WEBHOOK_VERIFICATION_TOKEN ?? '').trim();

const payload = {
  service: 'signals',
  metricName: 'vss.speed',
  condition: 'valueNumber > 3',
  coolDownPeriod: 30,
  description: 'R9 probe webhook - delete me',
  displayName: 'SynqDrive R9 Speed Wake Probe',
  targetURL: callback,
  status: 'enabled',
  verificationToken,
};

const createRes = await axios.post(`${api}/v1/webhooks`, payload, { headers, timeout: 30000 });
const id = createRes.data?.id;
const timeline = [{ t: 0, create: createRes.data }];
for (let i = 1; i <= 15; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const wh = (await axios.get(`${api}/v1/webhooks/${id}`, { headers })).data;
  timeline.push({ t: i * 2, status: wh.status, failureCount: wh.failureCount, keys: Object.keys(wh) });
}
try {
  await axios.delete(`${api}/v1/webhooks/${id}`, { headers });
} catch (e) {
  timeline.push({ cleanupError: e.message });
}
console.log(JSON.stringify({ stableId: stableId(id), timeline }, null, 2));
