# TOTP 2FA Auth Architecture (2026-07-03)

## Overview

SynqDrive supports authenticator-app TOTP as an optional second factor. Password login remains unchanged for users without 2FA.

## Data model

- `user_two_factor_credentials` — encrypted TOTP secret, `enabledAt` / `confirmedAt`
- `user_recovery_codes` — bcrypt hashes only; `usedAt` on consumption
- `user_mfa_login_challenges` — opaque login step-up tokens (SHA-256 lookup), TTL + attempt limits

## Setup flow (authenticated)

1. `POST /account/me/2fa/totp/setup` — generates secret, stores encrypted, returns `otpauthUrl`
2. `POST /account/me/2fa/totp/verify` — validates 6-digit code, sets `enabledAt`, returns recovery codes once

## Login flow

1. `POST /auth/login` — password check unchanged
2. If 2FA enabled → `{ mfaRequired: true, mfaChallengeToken, expiresIn }` (no JWT yet)
3. `POST /auth/2fa/verify` — `mfaChallengeToken` + `totpCode` **or** `recoveryCode` → access/refresh tokens

## Crypto

- TOTP secret: AES-256-GCM via `TOTP_ENCRYPTION_KEY` (32 bytes)
- Recovery codes: bcrypt hashes; plain codes returned only at generation
- MFA challenge token: random opaque token; DB stores SHA-256 hash only

## Audit

Events use `ActivityEntity.AUTH_EVENT` with `metaJson.step`: `totp_setup_started`, `totp_enabled`, `totp_disabled`, `recovery_codes_regenerated`, `recovery_code_used`, `mfa_verify_failed`, `mfa_login_success`.

No OTP or recovery plaintext in logs.

## Configuration

See `backend/.env.example`: `TOTP_ENCRYPTION_KEY`, `TOTP_ISSUER`, `MFA_CHALLENGE_TTL_SECONDS`, `MFA_MAX_ATTEMPTS`, `TOTP_RECOVERY_CODE_COUNT`.
