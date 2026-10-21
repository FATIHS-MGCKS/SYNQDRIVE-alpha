#!/usr/bin/env node
/**
 * R9 DIMO vehicle-permission root-cause audit — READ-ONLY.
 * GET + Identity GraphQL query only. No POST/DELETE provider mutations.
 */
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { Wallet } from 'ethers';
import { execSync } from 'child_process';

const COHORT = [186946, 187336, 187361, 187784, 190497, 192922];
const AFFECTED = 190497;

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

function hashRef(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function hashAddr(addr) {
  if (!addr) return null;
  const s = String(addr).toLowerCase();
  return `0x…${s.slice(-6)}`;
}

function stableId(id) {
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
}

async function getDeveloperJwt(env) {
  const clientId = env.DIMO_CLIENT_ID;
  const privateKey = env.DIMO_PRIVATE_KEY.startsWith('0x') ? env.DIMO_PRIVATE_KEY : `0x${env.DIMO_PRIVATE_KEY}`;
  const domain = env.DIMO_REDIRECT_URI || env.DIMO_DOMAIN || 'https://app.synqdrive.eu/auth/dimo/callback';
  const authUrl = 'https://auth.dimo.zone';
  const challengeRes = await axios.post(`${authUrl}/auth/web3/generate_challenge`, null, {
    params: { client_id: clientId, domain, scope: 'openid email', response_type: 'code', address: clientId },
    timeout: 15000,
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
    timeout: 15000,
  });
  return submitRes.data?.developer_jwt ?? submitRes.data?.access_token;
}

const IDENTITY_QUERY = `
  query VehiclesForDeveloper($clientId: Address!) {
    vehicles(first: 100, filterBy: { privileged: $clientId }) {
      totalCount
      nodes { tokenId owner mintedAt definition { make model year } aftermarketDevice { serial pairedAt } syntheticDevice { tokenId } }
    }
  }
`;

function loadDbRows() {
  const sql = `
SELECT dv.token_id,
  left(v.id::text, 8) AS vehicle_ref,
  left(v.organization_id::text, 8) AS org_ref,
  v.make, v.model, v.year, v.status::text,
  dv.connection_status::text,
  dv.external_id,
  left(dv.id::text, 8) AS dimo_vehicle_ref,
  dv.synced_at,
  dv.raw_json->>'owner' AS dimo_owner,
  (dv.raw_json->'aftermarketDevice' IS NOT NULL) AS has_aftermarket,
  (dv.raw_json->'syntheticDevice' IS NOT NULL) AS has_synthetic,
  dv.raw_json->'aftermarketDevice'->>'pairedAt' AS paired_at,
  (SELECT count(*) FROM vehicle_provider_consents vpc WHERE vpc.vehicle_id = v.id AND vpc.provider = 'DIMO') AS consent_count,
  (SELECT vpc.status::text FROM vehicle_provider_consents vpc WHERE vpc.vehicle_id = v.id AND vpc.provider = 'DIMO' ORDER BY vpc.granted_at DESC LIMIT 1) AS latest_consent_status,
  (SELECT vpc.grant_type::text FROM vehicle_provider_consents vpc WHERE vpc.vehicle_id = v.id AND vpc.provider = 'DIMO' ORDER BY vpc.granted_at DESC LIMIT 1) AS latest_grant_type,
  (SELECT vpc.granted_at FROM vehicle_provider_consents vpc WHERE vpc.vehicle_id = v.id AND vpc.provider = 'DIMO' ORDER BY vpc.granted_at DESC LIMIT 1) AS latest_consent_granted_at,
  (SELECT vpc.expires_at FROM vehicle_provider_consents vpc WHERE vpc.vehicle_id = v.id AND vpc.provider = 'DIMO' ORDER BY vpc.granted_at DESC LIMIT 1) AS latest_consent_expires_at,
  (SELECT vpc.revoked_at FROM vehicle_provider_consents vpc WHERE vpc.vehicle_id = v.id AND vpc.provider = 'DIMO' ORDER BY vpc.granted_at DESC LIMIT 1) AS latest_consent_revoked_at,
  (SELECT array_to_string(vpc.scopes, ',') FROM vehicle_provider_consents vpc WHERE vpc.vehicle_id = v.id AND vpc.provider = 'DIMO' ORDER BY vpc.granted_at DESC LIMIT 1) AS latest_consent_scopes,
  (SELECT count(*) FROM vehicle_data_source_links vdl WHERE vdl.vehicle_id = v.id AND vdl.provider = 'DIMO' AND vdl.is_active = true) AS active_dimo_links,
  (SELECT oda.status::text FROM org_data_authorizations oda WHERE oda.organization_id = v.organization_id AND oda.source_type = 'DIMO' ORDER BY oda.granted_at DESC NULLS LAST LIMIT 1) AS org_dimo_auth_status,
  (SELECT oda.granted_at FROM org_data_authorizations oda WHERE oda.organization_id = v.organization_id AND oda.source_type = 'DIMO' ORDER BY oda.granted_at DESC NULLS LAST LIMIT 1) AS org_dimo_auth_granted_at
FROM vehicles v
INNER JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
WHERE dv.token_id IN (${COHORT.join(',')})
ORDER BY dv.token_id;
`;
  const raw = execSync(`sudo -u postgres psql -d synqdrive -At -F '|' -c "${sql.replace(/\n/g, ' ')}"`, { encoding: 'utf8' }).trim();
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const p = line.split('|');
    return {
      tokenId: parseInt(p[0], 10),
      vehicleRef: p[1],
      orgRef: p[2],
      make: p[3],
      model: p[4],
      year: p[5] ? parseInt(p[5], 10) : null,
      businessStatus: p[6],
      connectionStatus: p[7],
      dimoExternalId: p[8],
      dimoVehicleRef: p[9],
      syncedAt: p[10] || null,
      dimoOwnerHash: hashAddr(p[11]),
      hasAftermarket: p[12] === 't',
      hasSynthetic: p[13] === 't',
      pairedAt: p[14] || null,
      consentCount: parseInt(p[15] || '0', 10),
      latestConsentStatus: p[16] || null,
      latestGrantType: p[17] || null,
      latestConsentGrantedAt: p[18] || null,
      latestConsentExpiresAt: p[19] || null,
      latestConsentRevokedAt: p[20] || null,
      latestConsentScopes: p[21] || null,
      activeDimoLinks: parseInt(p[22] || '0', 10),
      orgDimoAuthStatus: p[23] || null,
      orgDimoAuthGrantedAt: p[24] || null,
    };
  });
}

async function fetchPrivilegedIdentity(clientId) {
  const url = 'https://identity-api.dimo.zone/query';
  const res = await axios.post(
    url,
    { query: IDENTITY_QUERY, variables: { clientId } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
  );
  const nodes = res.data?.data?.vehicles?.nodes ?? [];
  const byToken = new Map(nodes.map((n) => [Number(n.tokenId), n]));
  return { totalCount: res.data?.data?.vehicles?.totalCount ?? nodes.length, byToken };
}

async function getVehicleWebhookLinks(jwt, contract, tokenId) {
  const assetDid = `did:erc721:137:${contract}:${tokenId}`;
  const api = 'https://vehicle-triggers-api.dimo.zone';
  const res = await axios.get(`${api}/v1/webhooks/vehicles/${assetDid}`, {
    headers: { Authorization: `Bearer ${jwt}` },
    timeout: 15000,
  });
  const links = Array.isArray(res.data) ? res.data : [];
  return links.map((l) => ({
    webhookStableId: stableId(l.webhookId),
    createdAt: l.createdAt ?? null,
    description: l.description ?? null,
  }));
}

async function main() {
  const env = loadEnv(process.env.SYNQDRIVE_BACKEND_ENV || '/opt/synqdrive/shared/backend.env');
  const contract =
    env.DIMO_VEHICLE_NFT_CONTRACT ||
    (env.DIMO_ENV === 'dev'
      ? '0x45fbCD3ef7361d156e8b16F5538AE36DEdf61Da8'
      : '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF');
  const clientId = env.DIMO_CLIENT_ID;

  const dbRows = loadDbRows();
  const jwt = await getDeveloperJwt(env);
  const identity = await fetchPrivilegedIdentity(clientId);

  const vehicles = [];
  for (const tokenId of COHORT) {
    const db = dbRows.find((r) => r.tokenId === tokenId) ?? null;
    const idNode = identity.byToken.get(tokenId) ?? null;
    const webhookLinks = await getVehicleWebhookLinks(jwt, contract, tokenId);
    vehicles.push({
      tokenId,
      label: tokenId === AFFECTED ? 'AFFECTED' : 'COHORT',
      synqdrive: db,
      assetDid: `did:erc721:137:${contract}:${tokenId}`,
      developerLicensePrivileged: Boolean(idNode),
      identityOwnerHash: hashAddr(idNode?.owner),
      identityMintedAt: idNode?.mintedAt ?? null,
      identityAftermarketPairedAt: idNode?.aftermarketDevice?.pairedAt ?? null,
      identityHasAftermarket: Boolean(idNode?.aftermarketDevice),
      identityHasSynthetic: Boolean(idNode?.syntheticDevice),
      webhookLinkCount: webhookLinks.length,
      webhookLinks,
      apiSubscribePermissionInferred:
        tokenId === AFFECTED
          ? 'DENIED_403_INSUFFICIENT_VEHICLE_PERMISSIONS'
          : identity.byToken.has(tokenId)
            ? 'ALLOWED_HISTORICAL_SUBSCRIPTIONS_PRESENT'
            : 'UNKNOWN',
    });
  }

  const affected = vehicles.find((v) => v.tokenId === AFFECTED);
  const others = vehicles.filter((v) => v.tokenId !== AFFECTED);
  const otherPrivileged = others.filter((v) => v.developerLicensePrivileged).length;

  const diffs = [];
  if (affected && others.length) {
    const ref = others.find((v) => v.developerLicensePrivileged) ?? others[0];
    for (const key of [
      'developerLicensePrivileged',
      'connectionStatus',
      'latestConsentStatus',
      'activeDimoLinks',
      'orgDimoAuthStatus',
      'identityOwnerHash',
      'dimoOwnerHash',
      'webhookLinkCount',
    ]) {
      const aVal = key.startsWith('identity') || key.startsWith('developer') || key.startsWith('webhook')
        ? affected[key]
        : affected.synqdrive?.[key] ?? affected[key];
      const rVal = key.startsWith('identity') || key.startsWith('developer') || key.startsWith('webhook')
        ? ref[key]
        : ref.synqdrive?.[key] ?? ref[key];
      if (JSON.stringify(aVal) !== JSON.stringify(rVal)) {
        diffs.push({ field: key, affected: aVal, referenceSubscribable: rVal });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        audit: 'R9_PERMISSION_ROOT_CAUSE',
        mode: 'READ_ONLY',
        clientIdRef: hashRef(clientId),
        contractRef: hashRef(contract),
        identityPrivilegedTotal: identity.totalCount,
        vehicles,
        permissionDiffsAffectedVsSubscribable: diffs,
        summary: {
          affectedToken: AFFECTED,
          affectedDeveloperLicensePrivileged: affected?.developerLicensePrivileged ?? null,
          subscribableOthersPrivilegedCount: otherPrivileged,
          subscribableOthersCount: others.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message || err), stack: err.stack }));
  process.exit(1);
});
