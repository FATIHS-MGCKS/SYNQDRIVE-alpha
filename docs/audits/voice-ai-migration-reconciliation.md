# Voice AI Migration Reconciliation Audit

| Field | Value |
|-------|-------|
| **Phase** | Prompt 3B of 20 — Prisma migration reconciliation |
| **Date** | 2026-07-18 (UTC) |
| **Branch** | `cursor/voice-build-reproducibility-70b3` |
| **Target migration** | `20260717200000_voice_conversation_pending_outcome` |
| **References** | `architecture/VOICE_AI_REMEDIATION_BASELINE_2026-07-18.md` (§13), `architecture/VOICE_AI_POST_DEPLOYMENT_ACCEPTANCE_AUDIT_2026-07-18.md`, PR #489 (`cursor/voice-migration-enum-fix-70b3`) |
| **Prisma CLI (VPS)** | 5.22.0 |

---

## 1. Executive summary

**Decision: NO-CHANGE — migration history anomaly is explained; database schema is correct; no Prisma resolution action required.**

Production shows **three** `_prisma_migrations` rows related to the voice pending-outcome change: one **rolled-back failed attempt** (pre-split combined SQL) and **two successful applied migrations** (split enum + default). `npx prisma migrate status` reports **“Database schema is up to date!”** Live PostgreSQL matches `schema.prisma` (`PENDING` enum value; `voice_conversations.outcome` default `'PENDING'`).

**Classification:** earlier failed deploy attempt + successful recovery run (PostgreSQL `55P04` enum transaction boundary), **not** checksum drift, partial application, or manual history tampering.

**Staging:** no separate staging database exists in this environment; voice staging is flag-gated on the production VPS. **NO-CHANGE.**

**Production:** schema and migration ledger are already in the target state. **NO-CHANGE** (no `migrate resolve`, no raw `_prisma_migrations` deletes).

---

## 2. Scope and method

### Phase A — read-only

| Source | Method |
|--------|--------|
| Local migration files | Repo inspection + SHA-256 |
| Git history | `git log` / `git show` for split commit `595497d4` |
| Production `_prisma_migrations` | VPS SSH + Prisma `$queryRawUnsafe` |
| Production live schema | VPS enum + `information_schema.columns` |
| `prisma migrate status` | VPS `/opt/synqdrive/current/backend` |
| Runtime health | `GET https://app.synqdrive.eu/api/v1/health` |
| Voice regression | `npm run test:voice:verify` (Cloud Agent, current branch) |
| Prisma procedures | Official `migrate status` / `migrate resolve` semantics (see §7) |

### Phase B — staging

Not executed (no distinct staging DB; see §5).

### Phase C — production

Not executed beyond read-only verification (target state already reached; see §6).

---

## 3. Root cause

Commit `dd97c447` introduced a single migration that combined:

1. `ALTER TYPE "VoiceConversationOutcome" ADD VALUE 'PENDING'`
2. `ALTER TABLE "voice_conversations" ALTER COLUMN "outcome" SET DEFAULT 'PENDING'`

PostgreSQL rejects using a newly added enum value in the **same transaction** as `ADD VALUE` (error `55P04`: *unsafe use of new value … New enum values must be committed before they can be used*).

During VPS deploy on **2026-07-17 ~23:55 UTC**, `prisma migrate deploy` applied the combined file, failed, and Prisma recorded a **rolled-back** row (`applied_steps_count = 0`, `finished_at = NULL`).

Commit `595497d4` (merged as PR #489) split the change into two migrations:

| Migration | Purpose |
|-----------|---------|
| `20260717200000_voice_conversation_pending_outcome` | `ADD VALUE IF NOT EXISTS 'PENDING'` only |
| `20260717200001_voice_conversation_pending_default` | `SET DEFAULT 'PENDING'` in a separate transaction |

A subsequent deploy (~23:57 UTC) applied both successfully. The rolled-back row from the failed attempt **remains** in `_prisma_migrations` — expected Prisma failure-recovery behavior, not a second pending migration.

---

## 4. Evidence

### 4.1 Local migration files (repository)

**`20260717200000_voice_conversation_pending_outcome/migration.sql`**

```sql
ALTER TYPE "VoiceConversationOutcome" ADD VALUE IF NOT EXISTS 'PENDING';
```

| File | SHA-256 |
|------|---------|
| `20260717200000_voice_conversation_pending_outcome/migration.sql` | `daffa2a6e317f6c5463b660b490ffad5777868e9a8b91a72c9751a02fff264c1` |
| `20260717200001_voice_conversation_pending_default/migration.sql` | `8aa27efa866bc93396f98e3f588f3277d7d8be773ed3b744e8497669a689dcd9` |

**Pre-split combined file** (commit `dd97c447`, failed on first deploy):

| Artifact | SHA-256 |
|----------|---------|
| Combined `20260717200000_…/migration.sql` | `0aeb4f983af73f5cbbbd6c18f7a5ccdbb3d79ac354f7883d4b5b5da718346285` |

### 4.2 Expected Prisma schema

```prisma
enum VoiceConversationOutcome {
  PENDING
  RESOLVED
  ESCALATED
  FAILED
  ABANDONED
}

// voice_conversations.outcome @default(PENDING)
```

### 4.3 Production `_prisma_migrations` (2026-07-18 probe)

VPS checkout: `ac85688` · Release tree: `/opt/synqdrive/current`

| # | `migration_name` | `checksum` | `started_at` | `finished_at` | `rolled_back_at` | `applied_steps` |
|---|------------------|------------|--------------|---------------|------------------|-----------------|
| 1 | `20260717200000_voice_conversation_pending_outcome` | `0aeb4f98…` (pre-split) | 2026-07-17 23:55:22Z | `NULL` | 2026-07-17 23:56:20Z | 0 |
| 2 | `20260717200000_voice_conversation_pending_outcome` | `daffa2a6…` (**matches repo**) | 2026-07-17 23:57:16Z | 2026-07-17 23:57:16Z | `NULL` | 1 |
| 3 | `20260717200001_voice_conversation_pending_default` | `8aa27efa…` (**matches repo**) | 2026-07-17 23:57:16Z | 2026-07-17 23:57:16Z | `NULL` | 1 |

**Failure log (row 1, excerpt):**

```
Database error code: 55P04
ERROR: unsafe use of new value "PENDING" of enum type "VoiceConversationOutcome"
HINT: New enum values must be committed before they can be used.
```

**Broader context:** 10 total rows with `rolled_back_at IS NOT NULL` in production (platform-wide historical deploy failures; not voice-specific).

### 4.4 Production live schema

| Check | Result |
|-------|--------|
| `VoiceConversationOutcome` labels | `RESOLVED, ESCALATED, FAILED, ABANDONED, PENDING` |
| `voice_conversations.outcome` default | `'PENDING'::"VoiceConversationOutcome"` |
| VPS migration file checksums | Match repository rows 2–3 |

### 4.5 `prisma migrate status` (production)

```
216 migrations found in prisma/migrations
Database schema is up to date!
```

### 4.6 Deployment history

| Event | Time (UTC) | Outcome |
|-------|------------|---------|
| Deploy with combined migration | ~2026-07-17 23:55 | Failed (`55P04`); row rolled back |
| PR #489 merged (`595497d4`) | 2026-07-17 23:55+ | Split migrations in repo |
| Redeploy / `migrate deploy` | ~2026-07-17 23:57 | Both split migrations applied |
| Current VPS (`ac85688`) | 2026-07-18 | Status clean; 216 migrations |

### 4.7 Runtime and tests (post-audit)

| Check | Result |
|-------|--------|
| `GET /api/v1/health` | **200** |
| `npm run test:voice:verify` | **PASS** (build, typecheck, lint:voice, 115 security + 27 billing/protection) |

---

## 5. Classification matrix

| Hypothesis | Verdict | Rationale |
|------------|---------|-----------|
| Earlier failed attempt + successful re-run | **CONFIRMED** | Rolled-back row checksum = pre-split SQL; success row checksum = post-split SQL; timestamps sequential |
| Duplicate display without schema deviation | **CONFIRMED (subset)** | Two rows share `migration_name` but only one finished; schema matches Prisma |
| Checksum deviation on applied row | **REJECTED** | Applied row checksum matches repo file exactly |
| Partially applied migration | **REJECTED** | Success rows `applied_steps_count = 1`; live schema complete |
| Manually altered history | **NOT EVIDENCED** | Failure log + git history explain all rows |
| Not uniquely verifiable | **REJECTED** | Full chain documented |

---

## 6. Staging action (Phase B)

| Item | Value |
|------|-------|
| **Action** | **NO-CHANGE** |
| **Reason** | No isolated staging PostgreSQL instance. Voice “staging” in SynqDrive is operational (flags, preflight scripts, E2E matrix) on the production VPS host, sharing the production database. Remediation baseline §13 already recorded migrate status clean on VPS. |
| **Backup / restore point** | Not required for no-op |
| **Prisma resolution** | Not invoked |
| **Schema diff** | N/A |
| **Voice regression** | Covered by Cloud Agent `test:voice:verify` on current branch (PASS) |

---

## 7. Production action (Phase C)

| Item | Value |
|------|-------|
| **Action** | **NO-CHANGE** |
| **Reason** | Target schema already applied; `migrate status` clean; successful migration checksums match repository. Prisma does not require removal of rolled-back failure rows. |
| **Backup / restore point** | Existing VPS deploy script creates DB backup before each release (`vps-deploy-release.sh`); no ad-hoc mutation performed in this prompt |
| **Prisma-supported resolution considered** | See §8 |
| **New migration invented** | **No** — history-only anomaly; schema correct |
| **Post-checks** | `migrate status` clean · health 200 · voice verify PASS |

---

## 8. Prisma procedure assessment

Per [Prisma Migrate resolve](https://www.prisma.io/docs/orm/prisma-migrate/workflows/troubleshooting#resolve-migration-history-conflicts):

| Command | When used | Applicable here? |
|---------|-----------|------------------|
| `prisma migrate status` | Detect pending / failed / drift | **Already PASS** — no pending migrations |
| `migrate resolve --rolled-back <name>` | Mark failed migration rolled back so deploy can continue | **Already satisfied** — row 1 has `rolled_back_at` set; deploy continued successfully |
| `migrate resolve --applied <name>` | Record manually applied SQL | **Not needed** — Prisma applied rows 2–3 with `finished_at` set |
| Raw `DELETE FROM _prisma_migrations` | — | **Rejected** — not Prisma-supported; risks history corruption |

**Conclusion:** No `migrate resolve` invocation. Optional P2 hygiene (deleting rolled-back rows) is **out of scope** and **not recommended** without Prisma guidance — rolled-back rows do not block `migrate deploy`.

---

## 9. Before / after (this prompt)

| Dimension | Before (baseline §13) | After (3B verification) |
|-----------|----------------------|---------------------------|
| `_prisma_migrations` rows for `20260717200000` | 2 (1 rolled back + 1 applied) | **Unchanged** — 3 rows total incl. `20260717200001` (documented fully) |
| `prisma migrate status` | Up to date | **Up to date** |
| Live enum + default | Assumed correct | **Verified** `PENDING` + default |
| Applied checksum vs repo | Assumed match | **Verified** `daffa2a6…` / `8aa27efa…` |
| Remediation action | “DBA hygiene review (P2)” | **Deferred** — not blocking; no change this prompt |

---

## 10. Rollback

No database or migration changes were made in this prompt. Rollback is **not applicable**.

If a future operator ever needed to revert the **schema** change (not recommended while Voice AI is in development):

1. Restore from pre-migration backup (standard VPS release backup).
2. Or craft a forward migration to change default / remove enum usage (PostgreSQL cannot drop enum values in use).

The rolled-back `_prisma_migrations` row should **not** be deleted in isolation — it is audit evidence of the failed deploy and does not affect `migrate deploy`.

---

## 11. Final status

| Check | Status |
|-------|--------|
| Anomaly explained | **YES** — PostgreSQL `55P04` + enum split fix (PR #489) |
| Schema aligned with Prisma | **YES** |
| `prisma migrate status` (production) | **PASS** |
| Staging remediation | **NO-CHANGE** (no separate staging DB) |
| Production remediation | **NO-CHANGE** |
| Voice regression | **PASS** |
| Runtime health | **200** |
| Blocking for Voice remediation | **NO** |

**Follow-up (optional, P2):** Platform-wide review of 10 rolled-back `_prisma_migrations` rows for documentation only — not required for voice pending-outcome correctness.

---

## 12. Files touched in this prompt

| Path | Change |
|------|--------|
| `docs/audits/voice-ai-migration-reconciliation.md` | **Created** (this report) |

No migration files, Prisma schema, or database records were modified.
