# P2.2.7A Voice Assistant — Independent Read-Only Re-Audit + CI Triage

**Date:** 2026-08-20  
**Mode:** read-only re-audit (no production edits)  
**Subject:** PR #1074 @ `8041eeb0faf64eaf529aa86b595b598fb06a149c`  
**Base:** `i18n/production-hardening-p2-2-6-2026-08` @ `4e09e4cad8d48e3af1918fcd1573655118c75654`  
**Pre-flight reference:** `docs/audits/i18n-p2-2-7-voice-assistant-preflight-2026-08-19.md`

---

## AUDIT 1 — Repository / PR provenance

| Item | Verified value |
|------|----------------|
| **Branch** | `cursor/p227a-voice-assistant-i18n-3c10` |
| **Local HEAD** | `8041eeb0faf64eaf529aa86b595b598fb06a149c` |
| **Origin HEAD** | `8041eeb0faf64eaf529aa86b595b598fb06a149c` |
| **Local == origin** | **YES** |
| **Working tree (pre-audit-artifact)** | **clean** |
| **PR #1074** | OPEN, **DRAFT**, base `i18n/production-hardening-p2-2-6-2026-08`, head `cursor/p227a-voice-assistant-i18n-3c10` |

### Commit lineage (base → HEAD)

```
8041eeb0 feat(i18n): implement P2.2.7A Voice Assistant presentation localization
a6617f56 docs(i18n): add P2.2.7 Voice Assistant read-only pre-flight audit
44a56c14 fix(i18n): P2.2.6 correction — reuse canonical station keys   ← in history only; no diff vs base
```

**Note:** `git diff origin/i18n/production-hardening-p2-2-6-2026-08..HEAD` contains **29 paths** — P2.2.7 pre-flight doc + P2.2.7A implementation only. The P2.2.6 correction commit appears in branch history but its file changes are already present in base `4e09e4ca` (squash merge); **no station files leak into the PR diff**.

### Exact changed-file set (PR diff vs base)

| Path | Role |
|------|------|
| `docs/audits/i18n-p2-2-7-voice-assistant-preflight-2026-08-19.md` | Pre-flight audit artifact |
| `frontend/scripts/i18n-hardcoded-scan.mjs` | P27A enforce-clean |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | P27A guard |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | Scanner output |
| `frontend/src/i18n/translations/voice-assistant.{en,de}.ts` | New fragment |
| `frontend/src/i18n/translations/{en,de}.ts` | Spread imports |
| `frontend/src/rental/components/rental-voice-assistant-localization.test.tsx` | New tests |
| `frontend/src/rental/components/VoiceAssistantView.tsx` | Shim + locale wiring |
| 16× `frontend/src/rental/components/voice-assistant/*` | Presentation i18n |
| `frontend/src/master/components/{ChangesView,ArchitekturView}.tsx` | Architecture records |

**Unrelated commits/files in PR scope:** **0** (Category E)

---

## AUDIT 2 — Full P2.2.7A diff classification

Classification of **8041eeb0 implementation commit** (28 files; excludes pre-flight doc):

| Cat | Count | Files |
|-----|------:|-------|
| **A** — production localization | 18 | All voice-assistant TSX touched + `VoiceAssistantView.tsx`, `voice-assistant-i18n.ts`, `voice-assistant.ops.ts` |
| **B** — dictionary | 4 | `voice-assistant.en.ts`, `voice-assistant.de.ts`, `en.ts`, `de.ts` |
| **C** — localization tests | 1 | `rental-voice-assistant-localization.test.tsx` |
| **D** — scanner/governance | 3 | `i18n-hardcoded-scan.mjs`, `hardcoded-copy-guard.test.ts`, `hardcoded-copy-inventory.json` |
| **E** — unrelated | **0** | — |

**Architecture records (non-E, project rule):** `ChangesView.tsx`, `ArchitekturView.tsx`

### Runtime / business-logic review

| Area | Finding |
|------|---------|
| `voice-assistant.ops.ts` | Label functions delegate to `voice-assistant-i18n.ts` with `DEFAULT_PRODUCT_LOCALE`; control flow preserved |
| `buildLaunchChecklist`, `NAV_GROUPS`, permission ops | Unchanged business logic; presentation localized at render via helpers |
| API calls, routing, telephony, permissions | **No changes** in 7A diff |
| `telephonyStatusLabel` | Still returns raw `assistant.telephonyStatus.label` when API provides it (pre-existing behavior) |

**TSX changes:** presentation/i18n wiring only (`useLanguage`, `t()`, helper labels). **No** state/effect/API semantic changes observed in diff review.

---

## AUDIT 3 — Scanner / enforce-clean integrity

Independently recomputed at audit HEAD (`8041eeb0`):

| Metric | Pre-flight (7A scope) | Re-audit |
|--------|----------------------:|---------:|
| **P2.2.7A exact-scope findings** | 68 | **0** |
| **Voice Assistant module total** | 111 | **43** |
| **Global findings** | 2155 | **2087** |
| **P27A enforce-clean debt** | n/a | **0** |
| **Global enforce-clean** | 0 | **0** |
| **Compat shim total** | 30 | **29** (prod 18, test 11) |
| **New compat consumers** | 0 target | **0** (8 files migrated to canonical `../../../i18n/` / `../../i18n/`) |

### P27A boundary (exact set — verified in scanner)

```
rental/components/VoiceAssistantView.tsx
rental/components/voice-assistant/VoiceAssistantBuilder.tsx
rental/components/voice-assistant/VoiceConversationsPanel.tsx
rental/components/voice-assistant/VoiceAnalyticsView.tsx
rental/components/voice-assistant/VoicePermissionsMatrix.tsx
rental/components/voice-assistant/VoiceCommandHeader.tsx
rental/components/voice-assistant/VoiceSelectorField.tsx
rental/components/voice-assistant/VoiceLaunchChecklist.tsx
rental/components/voice-assistant/VoiceOnboardingWizard.tsx
rental/components/voice-assistant/VoiceSectionNav.tsx
```

**No** new ignore rules, allowlists, exemptions, or inventory manipulation detected. Boundary is **narrow exact-file** (not full `voice-assistant/` prefix) — correct while 7B files retain debt.

### Remaining 43 Voice Assistant findings (strictly 7B)

| File | Findings |
|------|--------:|
| `VoiceTelephonyWizard.tsx` | 24 |
| `VoiceTestCenter.tsx` | 19 |

**Category E absorption:** **0**

---

## AUDIT 4 — Canonical key governance

| Metric | Value |
|--------|------:|
| **Canonical keys (EN)** | **6465** |
| **Canonical keys (DE)** | **6465** |
| **EN/DE parity** | **100%** |
| **Baseline (P2.2.6 merged)** | 6349 |
| **Net new keys (P2.2.7A fragment)** | **116** |

### Existing keys reused in components (7 wiring paths)

| Consumer reuse | Key |
|----------------|-----|
| Save / saving | `voice.common.save`, `voice.common.saving` |
| Section nav aria | `voice.ops.navLabel` |
| Date filters | `serviceCenter.history.dateFrom`, `serviceCenter.history.dateTo` |
| Risk chip | `iam.risk.low` |
| Analytics loading | `evaluations.availability.loading` |

### Duplicate / near-miss findings (non-blocking)

| Type | Count | Notes |
|------|------:|-------|
| New fragment keys with same EN value as *other* existing key | 89 | Mostly cross-namespace (e.g. `Overview`, `Optional`) — context-specific keys acceptable per pre-flight |
| New keys matching existing `voice.*` value | **3** | `voice.nav.tab.overview` ↔ `voice.ops.tab.overview`; `voice.nav.tab.logs` ↔ `voice.ops.tab.conversations`; `voice.status.lastCall.noCalls` ↔ `voice.ops.noCalls` |
| Missed exact reuse opportunity | 1 | `voice.builder.unsavedChanges` duplicates `workflowAutomation.editor.unsavedTitle` / `priceTariffs.editor.unsavedTitle` EN text — new key created instead |

**Material duplicate-key defect:** **None** (parity intact; semantic collisions documented for optional consolidation).

---

## AUDIT 5 — Translation quality

| Check | Result |
|-------|--------|
| EN/DE semantic parity | **Pass** — fragment keys 1:1 |
| German naturalness | **Acceptable** — consistent “Sprachassistent” / “KI-Sprachassistent” vocabulary |
| Placeholder parity | **Pass** — e.g. `Europe/Berlin` kept as locale example in both languages |
| Interpolation | **Pass** — `{complete}/{total}`, `{tab}` mirrored EN/DE |
| English leakage in DE | **None material** in new fragment |
| Over-generic regression | **None material** — e.g. “Conversation Logs” → “Gesprächsprotokolle” preserves “Logs” framing vs `voice.ops.tab.conversations` |

**Material translation issues:** **0**

---

## AUDIT 6 — Component-level test quality

**File:** `frontend/src/rental/components/rental-voice-assistant-localization.test.tsx`

| Criterion | Met? |
|-----------|------|
| Real production components | **Partial** — `VoiceSectionNav`, `VoiceLaunchChecklist`, `VoicePermissionsMatrix` |
| Real `LanguageProvider` | **Yes** |
| DOM output inspection | **Yes** (EN + DE renders) |
| Fails on wrong key wiring | **Yes** for covered surfaces |
| Fails on DE regression | **Yes** for covered surfaces |
| Non-tautological only | **No** — helper unit tests also present (acceptable supplement) |

**Not covered by DOM tests:** `VoiceAssistantBuilder`, `VoiceConversationsPanel`, `VoiceAnalyticsView`, `VoiceCommandHeader`, `VoiceSelectorField`, `VoiceOnboardingWizard` (scanner-clean but not render-tested).

### Grade: **ACCEPTABLE**

Pre-flight rated coverage **WEAK**; this suite is a meaningful step up but not comprehensive. **Does not block P2.2.7A freeze** per pre-flight acceptance criteria (component-level regression added; not required to be STRONG for every surface).

---

## AUDIT 7 — CI failure triage (HEAD `8041eeb0`)

### 1. Legal Documents — Production Readiness CI

| Item | Detail |
|------|--------|
| **Run ID** | 32318918741 |
| **Failing job** | `Typecheck` → `npm ci && npx tsc --noEmit -p tsconfig.json` |
| **Failure** | Backend TS compile errors (not frontend i18n): |
| | • `billing.controller.security.characterization.spec.ts(184,18)` Expected 23 args, got 22 |
| | • `vehicles-security-negative.spec.ts(367/533/569)` Expected 4-5 args, got 3 |
| | • `vehicles.controller.status-patch.spec.ts(25,5)` undefined not assignable to VehiclesOperationalService |
| **P2.2.7A file overlap** | **None** — zero changed backend/legal/vehicle files |
| **Same failure on base lineage?** | **Yes** — fails on `main` (`1c8375d8`, `3a6f23f3`) and P2.2.6 correction branch `44a56c14` |
| **Classification** | **B — pre-existing baseline failure** |

### 2. Vehicle Detail — Production Readiness CI

| Item | Detail |
|------|--------|
| **Run ID** | 32318918722 |
| **Failing jobs** | (1) `Playwright E2E (Vehicle Detail)` — (2) `Backend unit tests` |
| **Playwright failure** | `vehicle-detail-flow.spec.ts:212` — `getByText('Konnektivität')` not visible (device connection loading test) |
| **Backend failure** | Same `vehicles.controller.status-patch.spec.ts(25,5)` TS2345 as Legal Documents workflow |
| **P2.2.7A file overlap** | **None** — no vehicle-detail, fleet-connectivity, or e2e files in PR diff |
| **Same failure on base lineage?** | **Yes** — fails on `main` (`1c8375d8`, `3a6f23f3`) |
| **Classification** | **B — pre-existing baseline failure** |

**P2.2.7A causal CI failures:** **0**

---

## AUDIT 8 — Independent validation (re-run at audit time)

| Command | Result |
|---------|--------|
| `npx vitest run src/rental/components/rental-voice-assistant-localization.test.tsx src/rental/components/voice-assistant src/i18n/hardcoded-copy-guard.test.ts` | **56/56 PASS** (7 files) |
| `npm run i18n:check` | **PASS** — 6465 keys, EN/DE 100%, enforce-clean guarded |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** |
| `git status --short` | **clean** (before audit-doc commit) |
| `node scripts/i18n-hardcoded-scan.mjs` | P27A **0**, Voice Assistant **43**, enforce-clean **0** |

---

## AUDIT 9 — Business-logic preservation

| Domain | Status |
|--------|--------|
| Voice Assistant CRUD/config | **Unchanged** |
| Routing / tabs | **Unchanged** |
| State / effects | **Unchanged** (i18n hooks only) |
| Permission semantics | **Unchanged** |
| Telephony behavior | **Unchanged** (7B files untouched) |
| Launch checklist actions | **Unchanged** (labels localized at render) |
| Analytics API behavior | **Unchanged** |
| Test Center | **Untouched (7B)** |
| API calls / payloads | **Unchanged** in diff |

Existing characterization suite: **37/37 PASS** (included in vitest voice-assistant run).

---

## AUDIT 10 — Freeze decision

### Verdict: **A — READY FOR P2.2.7A FREEZE / MERGE**

**Evidence summary**

- P2.2.7A exact enforce-clean scope: **68 → 0** ✓  
- Voice Assistant remainder **43** = **7B only** ✓  
- Category E: **0** ✓  
- EN/DE parity **100%** (6465 keys) ✓  
- Shim **30 → 29**, no new compat consumers ✓  
- Independent validation **PASS** ✓  
- CI reds **classified B (pre-existing)** — **not caused by P2.2.7A** ✓  

**Non-blocking optional follow-ups (not required for 7A freeze):**

1. Consolidate 3 duplicate-value `voice.nav.*` / `voice.status.lastCall.noCalls` keys with existing `voice.ops.*` where UI context matches  
2. Reuse `workflowAutomation.editor.unsavedTitle` instead of `voice.builder.unsavedChanges`  
3. Expand DOM render tests to builder/conversations surfaces (quality hardening, not scanner debt)

**Explicit stops honored:** no merge, no mark ready, no P2.2.7B work performed in this audit.

---

## Audit artifact provenance

| Item | Value |
|------|-------|
| **Production files modified during audit** | **0** |
| **Audit doc** | `docs/audits/i18n-p2-2-7a-independent-reaudit-2026-08-20.md` |
| **Audit-only commit** | (recorded after push) |
