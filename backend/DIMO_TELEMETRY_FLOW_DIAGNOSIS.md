# DIMO Authenticated Telemetry Flow — Diagnosis Report

**Date:** 2025-03-11  
**Context:** Non-registered vehicles visible; telemetry snapshots fail. Diagnosis of the authenticated flow only.

---

## 1. Vehicle Listing vs Telemetry — Different Auth Paths

| Flow | Auth | API |
|------|------|-----|
| **Vehicle listing (mirror)** | None | Identity API (GraphQL, public) |
| **Telemetry snapshots** | Developer JWT → Vehicle JWT | Token Exchange API + Telemetry API |

**Evidence:**
- `DimoApiSyncService.fetchAndSyncFromDimoApi()` → `https://identity-api.dimo.zone/query` with `vehicles(filterBy: { privileged: $clientId })` — no `Authorization` header.
- `DimoTelemetryService.fetchLatestVehicleSnapshot()` → `https://telemetry-api.dimo.zone/query` with `Authorization: Bearer {vehicleJwt}`.

---

## 2. Code Paths for Each Step

| Step | Code Path | File(s) |
|------|-----------|---------|
| **Non-registered vehicle listing** | `DimoVehicleSyncService.getNonRegisteredVehicles()` | `dimo-vehicle-sync.service.ts` |
| | Reads from `dimoVehicle` table; no DIMO API call | |
| **Developer JWT** | `DimoAuthService.getDeveloperJwt()` → `fetchAndCacheDeveloperJwt()` | `dimo-auth.service.ts` |
| | Custom axios flow: `generate_challenge` + `submit_challenge` | |
| **Vehicle JWT** | `DimoAuthService.getVehicleJwt(tokenId)` | `dimo-auth.service.ts` |
| | Calls `getDeveloperJwt()` then POST to `token-exchange-api.dimo.zone/v1/tokens/exchange` | |
| **Telemetry snapshots** | `DimoTelemetryService.fetchLatestVehicleSnapshot(vehicleJwt, tokenId)` | `dimo-telemetry.service.ts` |
| | GraphQL POST to `telemetry-api.dimo.zone/query` with `Authorization: Bearer {vehicleJwt}` | |

**Non-registered listing source:** DB only. Vehicles come from `DimoApiSyncService.fetchAndSyncFromDimoApi()` (Identity API, no auth), then `syncMirroredVehicles()` writes to `dimoVehicle`. "Non-registered" = not linked to a SynqDrive `Vehicle` record.

---

## 3. Developer JWT — SDK vs Custom Flow

**Official SDK flow:**
```ts
dimo.auth.getDeveloperJwt({
  client_id,
  domain,
  private_key
})
```

**Our implementation:** Custom axios flow, not `dimo.auth.getDeveloperJwt()`.

| Aspect | SDK | Our Code |
|--------|-----|----------|
| Entry point | `dimo.auth.getDeveloperJwt()` | `DimoAuthService.fetchAndCacheDeveloperJwt()` |
| generate_challenge | SDK `generateChallenge` (query params) | `POST .../generate_challenge?client_id=...&domain=...&scope=openid email&response_type=code&address=...` |
| Signing | SDK `signChallenge({ message, private_key })` | `wallet.signMessage(challenge)` (ethers) |
| submit_challenge | SDK `submitChallenge` (form-urlencoded) | `POST .../submit_challenge` with `application/x-www-form-urlencoded` |

**Conclusion:** We do not use the official SDK `getDeveloperJwt()`. We use a custom flow that mirrors the same endpoints and formats (query params + form-urlencoded). The SDK uses the same `/auth/web3/generate_challenge` and `/auth/web3/submit_challenge` paths.

---

## 4. Token Exchange — Developer JWT Usage

**Our code** (`dimo-auth.service.ts` lines 221–232):
```ts
const response = await axios.post(
  `${tokenExchangeApiUrl}/v1/tokens/exchange`,
  { nftContractAddress, privileges, tokenId },
  {
    headers: {
      Authorization: `Bearer ${developerJwt}`,
      'Content-Type': 'application/json',
    },
    ...
  },
);
```

**Conclusion:** The developer JWT is sent correctly as `Authorization: Bearer {developerJwt}`. The token exchange API expects this format.

---

## 5. Telemetry Only After Valid Vehicle JWT

**Flow in** `DimoNonRegisteredSnapshotProcessor` and `DimoController.debugSnapshot`:
```ts
const vehicleJwt = await this.dimoAuth.getVehicleJwt(dimoTokenId);
const raw = await this.dimoTelemetry.fetchLatestVehicleSnapshot(vehicleJwt, dimoTokenId);
```

**Conclusion:** Telemetry is only called after `getVehicleJwt()` returns. If `getVehicleJwt()` throws, telemetry is never called.

---

## 6. DIMO_CLIENT_ID — Developer License Client ID

**Config:** `dimo.config.ts` → `clientId: process.env.DIMO_CLIENT_ID`

**Expected:** Developer License Client ID (Ethereum address), e.g. `0x8925286246A63A424585320B003F0224E7384668`.

**Check:** In DIMO Console → Create License → the `client_id` shown there must match `DIMO_CLIENT_ID` exactly (including `0x` and checksum).

---

## 7. DIMO_API_KEY vs DIMO_PRIVATE_KEY

| Env Var | Used? | Purpose |
|---------|-------|---------|
| `DIMO_API_KEY` | **No** | Not referenced in `dimo.config.ts` or `dimo-auth.service.ts` |
| `DIMO_PRIVATE_KEY` | **Yes** | Used as the private key for signing challenges |

**Conclusion:** `DIMO_PRIVATE_KEY` is the API key / private key (64 hex chars). It must derive to the same address as `DIMO_CLIENT_ID`. Verify with:
```bash
# From backend/
npx ts-node -e "
const { Wallet } = require('ethers');
const pk = process.env.DIMO_PRIVATE_KEY?.startsWith('0x') ? process.env.DIMO_PRIVATE_KEY : '0x' + process.env.DIMO_PRIVATE_KEY;
console.log('Derived:', new Wallet(pk).address);
console.log('Client:', process.env.DIMO_CLIENT_ID);
console.log('Match:', new Wallet(pk).address.toLowerCase() === process.env.DIMO_CLIENT_ID?.toLowerCase());
"
```

---

## 8. DIMO_REDIRECT_URI — Must Match DIMO Console

**Config:** `dimo-auth.service.ts` line 57:
```ts
const domain = redirectUri || 'https://auth.dimo.zone';
```

**Current value:** `DIMO_REDIRECT_URI=http://localhost:5173/auth/dimo/callback`

**Check:** In DIMO Console → your Developer License → Redirect URIs, the value must match exactly (including scheme, host, path, no trailing slash unless configured).

---

## 9. First Failing Step in the Chain

**Chain:** `list vehicles` → `developer JWT` → `vehicle JWT` → `telemetry`

| Step | Failure symptom |
|------|-----------------|
| List vehicles | N/A — uses Identity API (no auth); already works |
| Developer JWT | `generate_challenge` or `submit_challenge` throws (e.g. 422) |
| Vehicle JWT | Token exchange returns 4xx (e.g. 401, 422) |
| Telemetry | GraphQL returns 4xx (e.g. 401, 403) |

**How to identify the first failing step:**

1. **Use the debug endpoint:**
   ```
   GET /api/v1/admin/dimo/debug-snapshot?dimoVehicleId=<id>
   ```
   The response includes `error` with the thrown message. The message will indicate which step failed (e.g. "DIMO auth failed (submit_challenge)", "DIMO token exchange returned no JWT", or an axios error with status).

2. **Run the developer JWT diagnostic:**
   ```bash
   cd backend && npx ts-node -r tsconfig-paths/register scripts/dimo-developer-jwt-diagnostic.ts
   ```
   This isolates the developer JWT flow.

3. **Run a full-chain diagnostic** (if you add one) that:
   - Step 1: Call `getDeveloperJwt()` → log success/fail
   - Step 2: Call `getVehicleJwt(tokenId)` → log success/fail
   - Step 3: Call `fetchLatestVehicleSnapshot(vehicleJwt, tokenId)` → log success/fail

**Most likely first failure (given prior 422 reports):**
- **Developer JWT (submit_challenge):** 422 if `domain`/`DIMO_REDIRECT_URI` does not match DIMO Console, or if `private_key` does not derive to `client_id`.
- **Token exchange:** 401/422 if developer JWT is invalid or expired, or if the vehicle has not granted the requested privileges.

---

## Diagnostic Run Results (2025-03-11)

Running `scripts/dimo-developer-jwt-diagnostic.ts`:

| Check | Result |
|-------|--------|
| **PRIVATE_KEY → ADDRESS MATCH** | **MISMATCH** |
| Derived address from DIMO_PRIVATE_KEY | `0x4D027c05...168D` |
| DIMO_CLIENT_ID | `0x89252862...4668` |
| SDK-style flow (generate_challenge + submit_challenge) | **OK** — Developer JWT acquired |

**Critical finding:** The private key derives to a different address than `DIMO_CLIENT_ID`. The SDK-style flow still returns a Developer JWT, but that JWT will contain `ethereum_address: 0x4D027c05...` (the signer), not `0x89252862...`.

**Implication:** The Identity API returns vehicles with `filterBy: { privileged: $clientId }` where `clientId = 0x89252862...`. Those vehicles granted access to `0x89252862...`. When we exchange for a Vehicle JWT, we use a Developer JWT that identifies us as `0x4D027c05...`. The token exchange will reject requests for vehicles that did not grant privileges to `0x4D027c05...`.

**First exact failing step:** **Token exchange** — the developer JWT is for the wrong identity (`0x4D027c05...`), while the vehicles in the mirror are privileged to `0x89252862...`. The token exchange API will deny the vehicle JWT request.

**Fix:** Align credentials:
- Either set `DIMO_CLIENT_ID=0x4D027c05432fde5a5100F4DB61a3F2CD6fa1168D` (matches the private key), **or**
- Generate a new API key in DIMO Console for `0x89252862...` and set `DIMO_PRIVATE_KEY` to that key.

---

## 10. Summary Table

| # | Question | Answer |
|---|----------|--------|
| 1 | Different auth paths? | Yes — listing: Identity API (no auth); telemetry: Developer JWT → Vehicle JWT |
| 2 | Code paths | Non-reg: DB; Dev JWT: custom flow; Vehicle JWT: token exchange; Telemetry: GraphQL with vehicle JWT |
| 3 | SDK getDeveloperJwt? | No — custom flow (same endpoints, same format) |
| 4 | Token exchange uses developer JWT correctly? | Yes — `Authorization: Bearer {developerJwt}` |
| 5 | Telemetry only after vehicle JWT? | Yes — sequential calls |
| 6 | DIMO_CLIENT_ID = Developer License Client ID? | Yes — must match DIMO Console |
| 7 | DIMO_API_KEY = private key? | No — `DIMO_PRIVATE_KEY` is used; `DIMO_API_KEY` is not used |
| 8 | DIMO_REDIRECT_URI matches console? | Must be verified manually |
| 9 | First failing step | **Token exchange** — Developer JWT is for `0x4D027c05...` (derived from key) but vehicles are privileged to `0x89252862...` (DIMO_CLIENT_ID). Credentials mismatch. |

---

## Recommended Next Steps

1. Run `GET /api/v1/admin/dimo/debug-snapshot` and inspect the `error` field.
2. Run `scripts/dimo-developer-jwt-diagnostic.ts` to confirm developer JWT succeeds.
3. In DIMO Console, verify `DIMO_REDIRECT_URI` matches the configured Redirect URI exactly.
4. Confirm `DIMO_PRIVATE_KEY` derives to `DIMO_CLIENT_ID` (address match check in diagnostic).
