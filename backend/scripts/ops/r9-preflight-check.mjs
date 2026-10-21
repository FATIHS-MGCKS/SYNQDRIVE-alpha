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
const tokenIds = execSync(
  `sudo -u postgres psql -d synqdrive -At -c "SELECT dv.token_id FROM vehicles v INNER JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id WHERE v.dimo_vehicle_id IS NOT NULL AND v.status IN ('AVAILABLE','RENTED') AND dv.connection_status = 'CONNECTED' AND dv.token_id IS NOT NULL ORDER BY dv.token_id;"`,
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((s) => parseInt(s, 10));
const webhooksRes = await axios.get(`${api}/v1/webhooks`, { headers });
const webhooks = webhooksRes.data?.webhooks ?? webhooksRes.data ?? [];
const r9 = webhooks.filter((w) => (w.displayName || '').includes('SynqDrive R9'));
const tokenId = tokenIds[0];
const assetDid = `did:erc721:137:${contract}:${tokenId}`;
const probes = {};
if (r9.length > 0) {
  const whId = r9[0].id;
  const enc = encodeURIComponent(assetDid);
  try {
    await axios.post(`${api}/v1/webhooks/${whId}/subscribe/${enc}`, {}, { headers, timeout: 15000 });
    probes.swaggerEncoded = { ok: true };
  } catch (e) {
    probes.swaggerEncoded = {
      ok: false,
      status: e.response?.status,
      data: e.response?.data,
      path: `/subscribe/${enc}`,
    };
  }
  try {
    await axios.post(`${api}/v1/webhooks/${whId}/subscribe/${assetDid}`, {}, { headers, timeout: 15000 });
    probes.swaggerRaw = { ok: true };
  } catch (e) {
    probes.swaggerRaw = {
      ok: false,
      status: e.response?.status,
      data: e.response?.data,
      path: `/subscribe/${assetDid}`,
    };
  }
}
console.log(
  JSON.stringify(
    {
      tokenIds,
      r9Count: r9.length,
      r9: r9.map((w) => ({
        stableId: stableId(w.id),
        displayName: w.displayName,
        metric: w.metricName,
        status: w.status,
      })),
      probes,
    },
    null,
    2,
  ),
);
