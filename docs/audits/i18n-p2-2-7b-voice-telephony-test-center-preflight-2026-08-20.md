# P2.2.7B — Voice Assistant Telephony + Test Center — Read-Only Pre-Flight / Scope Freeze

**Date:** 2026-08-20  
**Mode:** read-only analysis only — **no implementation**  
**Program baseline (P2.2.7A merged):** `77047cfa48e44968bfe78fbf69f939d324094b5f` on `origin/i18n/production-hardening-p2-2-6-2026-08`  
**PR #1074:** MERGED 2026-08-20T01:36:12Z (squash merge commit `77047cfa`)  
**Audit performed from:** isolated read-only worktree at `77047cfa` (`/tmp/synqdrive-p227b-audit`) + validation runs from `/workspace/frontend` (same file content for P2.2.7B surfaces)  
**Analysis branch for audit artifact:** `cursor/p227b-voice-telephony-test-center-preflight-3c10` @ `77047cfa`

---

## 1. Repository / baseline verification

| Item | Verified value |
|------|----------------|
| **Merged P2.2.7A SHA** | `77047cfa48e44968bfe78fbf69f939d324094b5f` |
| **PR #1074 merge present** | **YES** — `77047cfa feat(i18n): P2.2.7A Voice Assistant presentation localization (#1074)` |
| **Origin i18n branch HEAD** | `77047cfa` (matches merged SHA) |
| **Analysis branch** | `cursor/p227b-voice-telephony-test-center-preflight-3c10` @ `77047cfa` |
| **Prior agent branch (not baseline)** | `cursor/p227a-voice-assistant-i18n-3c10` @ `c9202cea` — contains 7A re-audit doc only; **not** ancestor of `77047cfa` |
| **Working tree at audit start** | **clean** (0 modified tracked files in `/workspace`) |
| **P2.2.7B surfaces modified after #1074** | **NO** — `VoiceTelephonyWizard.tsx` and `VoiceTestCenter.tsx` identical between `77047cfa` and pre-merge agent branch |

### Ancestry

- `77047cfa` is the authoritative P2.2.7A merge commit on the i18n hardening branch.
- No commits after `77047cfa` on `origin/i18n/production-hardening-p2-2-6-2026-08` touch P2.2.7B surfaces.

---

## 2. Recomputed i18n baseline (from `77047cfa`)

Scanner command: `node frontend/scripts/i18n-hardcoded-scan.mjs` (worktree @ `77047cfa`).

| Metric | Value |
|--------|------:|
| **Global hardcoded-copy findings** | **2087** |
| **Rental findings** | **765** |
| **Voice Assistant module findings** | **43** |
| **P2.2.7A enforce-clean findings** | **0** |
| **Global enforce-clean findings** | **0** |
| **Canonical key count** | **6465** |
| **EN keys** | **6465** |
| **DE keys** | **6465** |
| **EN/DE parity** | **100%** |
| **Compat/shim total** | **29** (prod **18**, test **11**) |
| **Production shim consumers** | **18** |
| **Test shim consumers** | **11** |

### Voice Assistant remaining debt (exact)

| File | Findings |
|------|--------:|
| `rental/components/voice-assistant/VoiceTelephonyWizard.tsx` | **24** |
| `rental/components/voice-assistant/VoiceTestCenter.tsx` | **19** |
| **Voice Assistant total** | **43** |

**Other Voice Assistant files with scanner findings:** **none**.

### Delta vs historical P2.2.7A deferral

| Historical (7A PR deferral) | Recomputed (7B pre-flight) | Delta |
|----------------------------|---------------------------|-------|
| VoiceTelephonyWizard: 24 | 24 | **0** |
| VoiceTestCenter: 19 | 19 | **0** |
| Voice total: 43 | 43 | **0** |

**Explanation:** No delta. Post-7A scanner inventory unchanged for deferred surfaces. P2.2.7A cleared 68 enforce-clean findings across 10 other voice files; these two files were intentionally excluded from `P27A_ENFORCE_CLEAN_EXACT`.

### Scanner gap note (non-deferred but relevant)

`rental/components/voice-assistant/voice-test-scenarios.ts` contains extensive operator-facing scenario copy consumed by `VoiceTestCenter`, but reports **0 scanner findings** because the scanner's JSX `TEXT` heuristic does not flag string literals in TypeScript object arrays. This is **not** counted in the historical 43 but affects complete Test Center localization (see §7 and §10).

---

## 3. P2.2.7B ownership boundary (file classification)

### Primary production surfaces

| File | Findings | Class | Canonical i18n today | Legacy shim | String migration isolated? | Risk |
|------|--------:|-------|---------------------|-------------|---------------------------|------|
| `VoiceTelephonyWizard.tsx` | 24 | **A** — presentation-only telephony UI | **NO** (`useLanguage()` absent) | **NO** | **YES** — UI strings only; callbacks/API props unchanged | **HIGH** |
| `VoiceTestCenter.tsx` | 19 | **B** — presentation-only Test Center UI | **NO** | **NO** | **YES** — UI strings only; test session API unchanged | **MEDIUM** |
| `voice-test-scenarios.ts` | 0* | **C** — shared presentation data | **NO** | **NO** | **YES** — static scenario copy; `id`/`fixTab` machine values preserved | **LOW** |

\*Scanner count 0; ~8 scenarios × multi-line copy ≈ **40+ additional user-facing strings** not in enforce-clean debt today.

### Parent / wiring (read-only context — not migration targets)

| File | Class | Findings | Notes |
|------|-------|--------:|-------|
| `VoiceAssistantView.tsx` | **E** — API/state shell | 0 | Passes telephony callbacks; already `useLanguage()` + canonical imports |
| `VoiceOnboardingWizard.tsx` | **A** (7A clean) | 0 | Embeds both 7B surfaces in wizard steps |
| `voice-assistant-i18n.ts` | **C** — shared helper | 0 | Extend with telephony/test label mappers if needed |
| `voice-assistant.ops.ts` | **E** — business logic | 0 | Status label functions; 7A migrated via `voice-assistant-i18n.ts` |
| `VoiceAssistantView` API wiring | **D/E** | 0 | `api.voiceAssistant.phoneNumbers`, `assignPhoneNumber`, `unassignPhoneNumber`, `refreshTelephony`, `updateTelephonySettings`, `testSession` — **must not change** |

### Tests

| File | Class | Covers 7B surfaces? |
|------|-------|---------------------|
| `rental-voice-assistant-localization.test.tsx` | **F** | **NO** — P2.2.7A scope only |
| `voice-assistant-ui.characterization.test.ts` | **F** | Source grep only (`VoiceTestCenter` import in onboarding wizard) |
| `voice-assistant.ops.characterization.test.ts` | **F** | Ops/telephony **label helpers**, not wizard/test center render |
| `voice-assistant-api.contract.characterization.test.ts` | **F** | API route strings only |
| `voice-wizard.ops.test.ts` | **F** | Wizard ops, not telephony UI |
| `voice-permission-groups.ops.test.ts` | **F** | Permission groups only |

### Unrelated (out of scope)

- `master/components/VoiceAssistantAdminView.tsx`, `master/components/voice-control-plane/*`
- Backend voice-assistant services, Twilio/ElevenLabs integration modules
- Finance/Billing, WhatsApp, other Rental debt

**Category E files in implementation scope target:** **0** (no API/state/permission logic files edited).

---

## 4. Telephony business-logic freeze (`VoiceTelephonyWizard`)

### Frozen behavior (must not change)

| Domain | Frozen elements |
|--------|-----------------|
| **Twilio / ElevenLabs** | Provider connection gating via `readinessElevenLabsOk`, `telephonyStatus?.providerConfigured`; ElevenLabs phone number list from `loadPhoneNumbers()` |
| **PSTN / routing** | `telephonyEnabled`, `inboundEnabled`, `outboundEnabled` toggles → `updateTelephonySettings()` payload keys |
| **Phone provisioning** | `assignPhoneNumber(phoneNumberId)`, `unassignPhoneNumber()`, `selectedId` state, `phoneNumbers` list rendering, `assignedToThisAssistant` / `assignedToOther` disable logic |
| **Validation / gating** | Step status derivation (`providerOk`, `agentOk`, `phoneAssigned`); inbound warning when enabled without number; outbound confirm gate (`outboundConfirm`) before enabling |
| **Call / test initiation** | `onNavigateTest()` only — no direct call initiation in wizard |
| **Provider status display** | `telephonyStatus?.label`, `telephonyStatus?.detail` from API snapshot — **display server-provided strings as-is** |
| **Credentials** | No credential UI; admin env var message only |
| **Permissions / org** | `orgId` prop passed but wizard uses parent callbacks — no permission logic inside component |
| **State / async** | `fetchPhones`, `handleRefresh`, `handleAssign`, `handleUnassign`, `handleSettingToggle`, `confirmOutbound` control flow |
| **Error semantics** | `setPhonesError(...)`, `onError(err)` propagation; error string content may be translated without changing catch/rethrow |
| **Disabled states** | All `disabled={...}` predicates preserved |
| **Billing** | No billing logic in component |

### String isolation assessment (scanner-flagged + adjacent unscanned UI)

| String / area | Isolated from machine logic? | Notes |
|---------------|------------------------------|-------|
| Step titles/descriptions (Provider, Agent, Phone, Inbound, Outbound, Test) | **YES** | Props to `WizardStep`; no API payload |
| Toggle labels (Inbound/Telephony/Outbound enabled) | **YES** | Checkbox `checked` uses boolean assistant fields |
| Outbound confirm dialog | **YES** | Confirm still calls `updateTelephonySettings({ outboundEnabled: true })` |
| Phone `<select>` option suffixes `(current)`, `(other agent)` | **YES** | Display only; `value={n.phoneNumberId}` unchanged |
| `phonesError` user messages | **YES** | Set in catch blocks; translate assignment only |
| `telephonyStatus?.label ?? 'Checking status…'` | **PARTIAL** | API label: display as-is; fallback `'Checking status…'`: translate |
| `assistant.elevenLabsAgentId` display | **N/A** | Machine ID — do not translate |
| `assistant.phoneNumber` display | **N/A** | E.164 value — do not translate |
| WizardStep `{status}` raw enum in chip (`pending`, `warning`, `error`) | **DISPLAY MAP** | Map internal step status → translation key (not API values) |
| Setting keys `'telephonyEnabled' \| 'inboundEnabled' \| 'outboundEnabled'` | **DO NOT TRANSLATE** | API payload keys |

**Risk grade:** **HIGH** — highest regression surface due to telephony toggles and outbound confirm, but copy replacement via `t(...)` is mechanically separable if payload keys and callback signatures are untouched.

---

## 5. Test Center business-logic freeze (`VoiceTestCenter`)

### Frozen behavior (must not change)

| Domain | Frozen elements |
|--------|-----------------|
| **Test execution** | `startSession()` → `api.voiceAssistant.testSession(orgId)` |
| **Mic gating** | `micSupported` check before start; error phase on unsupported browser |
| **Session phases** | `SessionPhase` union: `'idle' \| 'starting' \| 'active' \| 'expired' \| 'error' \| 'blocked'` — internal state only |
| **Blocked path** | `res.status === 'blocked'` → `setPhase('blocked')` without throwing |
| **Expiry polling** | 10s interval on `session.expiresAt` → `'expired'` |
| **Success callback** | `onTestPassed()` when session becomes active |
| **Readiness display** | `readinessPct`, `readiness.missing`, `readiness.checks` — API data |
| **Scenario selection** | `setSelectedScenario(scenario)` — local UI only |
| **Verdict recording** | `TestVerdict` `'passed' \| 'needs_review' \| 'failed'` — local only, not persisted |
| **Navigation** | `onNavigateTab(tab)` / `selectedScenario.fixTab` — **tab keys are machine values** |
| **Provider interaction** | `session.instructions`, `session.warnings` from API — display as-is |
| **Reset** | `resetSession()` clears session state |

### Display vs runtime separation

| Value | Internal/API? | UI label? | Action |
|-------|--------------|-----------|--------|
| `SessionPhase` literals | Internal state | Map → `voice.test.phase.*` keys | Translate label only |
| `TestVerdict` ids | Internal state | Map → `voice.test.verdict.*` keys | Translate button labels only |
| `res.status === 'blocked'` | API/runtime | Map blocked phase label | Do not translate `'blocked'` comparison |
| `readiness.checks[].key === 'elevenlabs'` | API key | Do not translate key | Translate row labels separately |
| `assistant.elevenLabsAgentId` truncated display | Machine | Display raw | Do not translate |
| `assistant.voiceName` | Data | Display raw | Do not translate |
| `selectedScenario.permissions[]` | Static scenario data | User-facing | Translate in scenarios module |
| `onNavigateTab('config')` etc. | Machine `VoiceTab` | Tab label via existing `labelVoiceTab()` | Reuse `voice.nav.tab.*` for link text |

**Risk grade:** **MEDIUM** — simpler state machine than telephony; primary risk is accidental change to session start semantics or phase transitions.

---

## 6. Canonical key reuse audit (mandatory pre-implementation)

P2.2.7A added **116** keys in `voice-assistant.{en,de}.ts` plus existing `voice.common.*` / `voice.wizard.*` in canonical `en.ts`.

### Bucket summary (43 scanner-flagged strings)

| Bucket | Count | Description |
|--------|------:|-------------|
| **A — exact canonical reuse** | **3** | Identical EN value already in canonical dictionary |
| **B — semantic canonical reuse** | **9** | Existing key meaning matches; prefer reuse with minor wording harmonization |
| **C — genuinely new keys required** | **24** | No suitable existing key; add under `voice.telephony.*` / `voice.test.*` |
| **D — ambiguous / context-sensitive** | **7** | Reuse possible but risks wrong context or duplicate-trap |

### Bucket A — exact reuse (use existing keys)

| Finding | Reuse key |
|---------|-----------|
| `Phone number` (step title) | `voice.wizard.step.phone` |
| `Cancel` (outbound confirm — unscanned but present) | `common.cancel` |
| `Test Center` (page title) | `voice.nav.tab.test` |

### Bucket B — semantic reuse (prefer existing)

| Finding | Reuse key | Note |
|---------|-----------|------|
| `Refresh status` | `voice.common.retry` or new `voice.telephony.refreshStatus` | "Retry" ≠ "Refresh" — **prefer new telephony-specific key** unless copy harmonized |
| `Agent provisioning` | `voice.checklist.agentProvisioned.label` | Checklist label is shorter; consider dedicated step title key |
| `Run a signed test session…` | `voice.checklist.testCall.description` | Near-duplicate; reuse if copy aligned |
| `Open launch checklist` | `voice.launch.title` | Button vs section title — wording differs |
| `Readiness gaps` | `voice.launch.required` pattern | Related launch copy |
| `Provider` row label | `voice.checklist.elevenlabs.label` / new `voice.test.row.provider` | Partial overlap |
| `Agent not provisioned` | `voice.checklist.agentProvisioned.label` | Empty-state title vs checklist label |
| `Enable outbound telephony?` | `voice.permissions.enableAutonomous` | **Different subject** — do not reuse blindly |
| `Strongly recommended only with suggest-only…` | `voice.permissions.outboundDisabled` | Related tone; not identical |

### Bucket C — new keys required (representative)

New namespace proposal:

- `voice.telephony.setup.title`, `voice.telephony.step.provider.*`, `voice.telephony.step.agent.*`, …
- `voice.telephony.toggle.inbound.*`, `voice.telephony.toggle.outbound.*`, `voice.telephony.error.*`
- `voice.test.header.*`, `voice.test.session.*`, `voice.test.scenario.*`, `voice.test.result.*`, `voice.test.live.*`

**Estimated new canonical keys (scanner scope only):** **~28–32** EN+DE pairs.

**Estimated new keys (full UX including unscanned wizard/test strings + scenarios):** **~55–65** EN+DE pairs.

### Bucket D — ambiguous (decide at implementation)

| Finding | Trap |
|---------|------|
| `Open Test Center` | Same as nav tab vs action verb |
| `Validate greeting, tone…` | Overlaps `voice.launch.subtitle` with different scope |
| `Test session expired…` | Overlaps `voice.checklist.testCall.description` |
| `Telephony setup` vs `voice.nav.tab.telephony` | Nav label vs page heading |
| `Inbound enabled` / `Outbound enabled` / `Telephony enabled` | Toggle labels vs status chips elsewhere |
| `Notes: what worked…` placeholder | Generic vs test-specific |
| `Review in {fixTab} →` | Must use `labelVoiceTab()` not raw tab id |

### Duplicate-key traps

1. **`voice.nav.tab.test`** — already "Test Center"; avoid `voice.test.title` duplicate unless semantically distinct (nav vs H3).
2. **`voice.checklist.testCall.description`** — similar to telephony step 6 body; harmonize or cross-reference.
3. **`voice.launch.subtitle`** vs Test Center subtitle — same semantic domain (pre-live validation).
4. **`voice.permissions.outboundDisabled`** vs outbound toggle helper text — keep permissions matrix copy separate from telephony wizard toggle copy.
5. **`voice.wizard.step.phone`** — step name vs telephony wizard step 3 title.

---

## 7. Machine value / display label separation

### Architecture (required)

```
internal value → presentation mapping → translation key → localized label
```

### Telephony wizard

| Internal value | Used as | Translate? |
|----------------|---------|------------|
| `'telephonyEnabled'`, `'inboundEnabled'`, `'outboundEnabled'` | API payload keys | **NO** |
| `phoneNumberId`, `elevenLabsAgentId` | API / select values | **NO** |
| WizardStep `status`: `'complete' \| 'current' \| 'pending' \| 'warning' \| 'error'` | UI state | **Label only** via `voice.telephony.stepStatus.*` |
| `telephonyStatus.status` (e.g. `'legacy_diagnostic_only'`) | API snapshot | **NO** — use `telephonyStatus.label` from server |
| `'unassign'` in `setAssigningId` | Internal loading token | **NO** |
| PSTN provider `'elevenlabs' \| 'twilio'` | Routing/config | **NO** |

### Test Center

| Internal value | Used as | Translate? |
|----------------|---------|------------|
| `SessionPhase` literals | React state | **Label only** |
| `TestVerdict` ids | Local UI state | **Label only** |
| `res.status === 'blocked'` | API comparison | **NO** |
| `VoiceTab` / `fixTab` | Routing | **NO** — use `labelVoiceTab(locale, tab)` |
| Scenario `id` (`book_vehicle`, etc.) | Stable keys | **NO** |
| `readiness.missing[]` strings | Server-provided | Display as-is (future: server i18n) |
| `session.warnings[]`, `session.instructions` | Server-provided | Display as-is |

### Status words often confused (do NOT translate raw enum where used in logic)

`ACTIVE`, `INACTIVE`, `CONNECTED`, `DISCONNECTED`, `READY`, `FAILED`, `RUNNING`, `PENDING`, `INBOUND`, `OUTBOUND`, `TEST`, `LIVE` — none appear as user-facing literals in these two TSX files except via API-provided `telephonyStatus.label` or phase/state mapping.

---

## 8. Test coverage inventory

### Test files touching Voice Assistant (baseline `77047cfa`)

| Test file | Test count | VoiceTelephonyWizard | VoiceTestCenter | EN i18n | DE i18n | Telephony behavior | Test execution |
|-----------|----------:|:--------------------:|:---------------:|:-------:|:-------:|:------------------:|:--------------:|
| `rental-voice-assistant-localization.test.tsx` | 10 | ✗ | ✗ | Partial (7A) | Partial (7A) | ✗ | ✗ |
| `voice-assistant-ui.characterization.test.ts` | 11 | ✗ | grep only | ✗ | ✗ | ✗ | ✗ |
| `voice-assistant.ops.characterization.test.ts` | 13 | ✗ | ✗ | ✗ | ✗ | Partial (label helpers) | ✗ |
| `voice-assistant-api.contract.characterization.test.ts` | 5 | ✗ | ✗ | ✗ | ✗ | Route strings | ✗ |
| `voice-wizard.ops.test.ts` | 5 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `voice-permission-groups.ops.test.ts` | 3 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**Dedicated component tests for P2.2.7B surfaces:** **0**

### Run results (`/workspace/frontend`, vitest)

```
Test Files  6 passed (6)
Tests       47 passed (47)
```

All voice-assistant unit tests **PASS**. No failures.

### Detection capability assessment

| Regression type | Would current tests detect? |
|-----------------|---------------------------|
| Wrong translation key | **NO** for 7B surfaces |
| Raw hardcoded copy regression | **NO** for 7B surfaces |
| DE wiring regression | **NO** for 7B surfaces |
| Accidental provider/API behavior change | **WEAK** — ops/API characterization only |
| Telephony toggle / outbound confirm regression | **NO** |
| Test session start / phase regression | **NO** |

### Quality grades

| Surface | Grade | Rationale |
|---------|-------|-----------|
| `VoiceTelephonyWizard` | **WEAK** | No render tests; high-risk telephony paths untested at UI level |
| `VoiceTestCenter` | **WEAK** | No render tests; session phase machine untested at UI level |
| Voice Assistant overall (7A scope) | **ACCEPTABLE** | 7A localization tests + enforce-clean guard |

**Implementation must add:** `rental-voice-assistant-telephony-test-center-localization.test.tsx` (or extend 7A test file) with EN/DE render assertions for both surfaces.

---

## 9. Shim / compatibility analysis

### Recomputed baseline

| Metric | P2.2.7A reported | Recomputed @ `77047cfa` | Delta |
|--------|-----------------:|------------------------:|------:|
| Compat total | 29 | **29** | 0 |
| Production | 18 | **18** | 0 |
| Test | 11 | **11** | 0 |

### P2.2.7B surface shim state

| File | `../i18n/` shim | Canonical import target |
|------|:---------------:|-------------------------|
| `VoiceTelephonyWizard.tsx` | **NO** | Add `useLanguage` from `../../../i18n/LanguageContext` |
| `VoiceTestCenter.tsx` | **NO** | Same |
| `voice-test-scenarios.ts` | **NO** | Use `va()` from `voice-assistant-i18n.ts` or pass `t` from parent |

**7B files are not shim consumers today.** P2.2.7A already migrated 8 touched voice files to canonical imports.

### Safe shim reductions (optional, not required for 7B)

No P2.2.7B file contributes to shim count. Optional repo-wide reductions remain in unrelated modules (Finance, Legal, etc.) — **out of 7B scope**.

### Implementation targets

- **Zero new compat consumers**
- **Shim total must not increase** (stay ≤ 29; prefer unchanged)

---

## 10. Scanner / enforce-clean design

### Can P2.2.7B be independently enforce-cleaned?

**YES** — with a narrow exact set mirroring P2.2.7A pattern.

### Proposed `P27B_ENFORCE_CLEAN_EXACT`

```javascript
const P27B_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/voice-assistant/VoiceTelephonyWizard.tsx',
  'rental/components/voice-assistant/VoiceTestCenter.tsx',
]);
```

### Optional extension (recommended for complete Test Center UX)

```javascript
const P27B_ENFORCE_CLEAN_PREFIXES = [
  // Optional phase 7B-follow-up if scenarios migrated:
  // 'rental/components/voice-assistant/voice-test-scenarios.ts',
];
```

**Do not** enforce-clean entire `voice-assistant/` directory — ops/API modules contain machine strings and hidden label functions already migrated via helpers.

### Expected post-implementation counts

| Metric | Before | After (strict 2-file scope) |
|--------|-------:|----------------------------:|
| P2.2.7B scoped findings | 43 | **0** |
| Voice Assistant total | 43 | **0** |
| Global enforce-clean | 0 | **0** |

### Machine/protocol strings that may remain flagged if not handled

If implementation only wraps scanner-flagged JSX text, **residual manual debt** remains in:

- WizardStep status chip fallthrough (`pending`, `warning`, `error` raw)
- Error strings in `setPhonesError(...)` 
- Phase/status labels in Test Center
- **`voice-test-scenarios.ts` entire file**

**Scanner treatment:** extend migration to these adjacent presentation strings in the same PR, or add targeted scanner allowlist entries for verified machine literals only (prefer migration over suppression).

---

## 11. GO / NO-GO verdict

### Selection: **A — GO (both `VoiceTelephonyWizard` + `VoiceTestCenter` together in one P2.2.7B slice)**

| Criterion | Assessment |
|-----------|------------|
| Business-logic isolation | **Acceptable** — string-only changes if discipline maintained |
| Telephony/provider risk | **High** — mitigated by freeze map + no callback edits |
| Test coverage | **Weak today** — must add EN/DE component tests in same slice |
| Scanner cleanliness | **Clean** — 43 → 0 with 2-file exact boundary |
| Key reuse | **Good** — ~12 reuse opportunities; ~28–32 new keys for scanner scope |
| Implementation size | **Moderate** — 2 TSX + dictionary + tests + scanner guard |
| Reviewability | **Acceptable** — single cohesive "deferred 7A" slice |
| Rollback safety | **Good** — revert isolated files + dictionary keys |

**Split alternative (B1/B2)** remains valid if review capacity prefers telephony isolation:

- **P2.2.7B1:** `VoiceTestCenter.tsx` (19 findings, lower risk)
- **P2.2.7B2:** `VoiceTelephonyWizard.tsx` (24 findings, telephony toggles)

**NO-GO (C)** not required — no architectural prerequisite blocking presentation i18n.

---

## 12. Exact implementation plan (for follow-up phase — NOT started)

### IN SCOPE

| Area | Items |
|------|-------|
| **Production** | `VoiceTelephonyWizard.tsx`, `VoiceTestCenter.tsx` |
| **Helpers (optional but recommended)** | `voice-test-scenarios.ts` localized via `va()` / scenario key map; extend `voice-assistant-i18n.ts` for phase/status maps |
| **Dictionary** | `voice-assistant.en.ts`, `voice-assistant.de.ts` (+ registry if needed) |
| **Scanner** | Add `P27B_ENFORCE_CLEAN_EXACT`; `migrationPhaseFor` → `P2.2.7B` |
| **Tests** | New EN/DE render tests for both surfaces; extend enforce-clean guard; keep existing 47 voice tests green |
| **Shim** | Canonical imports only; zero new compat consumers |

### OUT OF SCOPE

- Provider integration refactor (Twilio/ElevenLabs)
- Backend/API changes
- Permission matrix logic changes
- Billing / WhatsApp / Finance / other Rental debt
- Master control plane views
- P2.2.8
- `voice-assistant.ops.ts` label function refactor (already localized via 7A helper)

### Implementation order

1. Add dictionary keys (reuse audit buckets A/B first)
2. `VoiceTestCenter.tsx` — lower risk, validates patterns
3. `VoiceTelephonyWizard.tsx` — telephony copy + status maps
4. `voice-test-scenarios.ts` — scenario copy (same PR if aiming for zero residual UX debt)
5. Scanner `P27B` + guard test update
6. New localization component tests
7. Full validation suite

---

## 13. Acceptance criteria (measurable)

| # | Criterion |
|---|-----------|
| 1 | P2.2.7B scoped scanner findings → **0** |
| 2 | Voice Assistant module findings → **0** (if all remaining UI debt in scope) |
| 3 | Global enforce-clean findings → **0** |
| 4 | EN/DE parity **100%** for new keys |
| 5 | Duplicate-key audit complete; no unnecessary canonical duplicates |
| 6 | **Zero** new compat `../i18n/` consumers |
| 7 | Shim total **≤ 29** (does not increase) |
| 8 | Meaningful component-level EN **and** DE tests for both surfaces |
| 9 | Existing voice tests **PASS** (47+ tests) |
| 10 | `npm run i18n:check` **PASS** |
| 11 | `npm run build` **PASS** |
| 12 | `git diff --check` **PASS** |
| 13 | Business logic unchanged (freeze maps §4–§5) |
| 14 | Twilio/ElevenLabs/PSTN semantics unchanged |
| 15 | Permissions unchanged |
| 16 | API contracts unchanged |
| 17 | Category **E** production files modified = **0** |

---

## 14. Risk grades (summary)

| Surface | Findings | Risk | Primary concern |
|---------|--------:|------|-----------------|
| `VoiceTelephonyWizard` | 24 | **HIGH** | Outbound confirm + telephony setting toggles |
| `VoiceTestCenter` | 19 | **MEDIUM** | Session phase machine + testSession API |
| `voice-test-scenarios.ts` | 0* | **LOW** | Volume of copy; no API |

---

## 15. Audit artifact provenance

| Item | Value |
|------|-------|
| **Audit doc path** | `docs/audits/i18n-p2-2-7b-voice-telephony-test-center-preflight-2026-08-20.md` |
| **Files modified during analysis** | **This audit doc only** |
| **Production files modified** | **NO** |
| **Tests modified** | **NO** |
| **Dictionaries modified** | **NO** |
| **Scanner modified** | **NO** |
| **Implementation started** | **NO** |
| **Merged** | **NO** |
| **Deployed** | **NO** |
| **P2.2.8 started** | **NO** |

### Changes / Architektur docs

Not updated during this read-only pre-flight. Update at P2.2.7B implementation time per project rules.

---

## Appendix A — Exact scanner findings (43)

### `VoiceTelephonyWizard.tsx` (24)

1. TITLE — Agent provisioning  
2. TEXT — Connect the provider first.  
3. TEXT — Enable outbound telephony?  
4. TEXT — I understand — enable outbound  
5. TITLE — Inbound calls  
6. TEXT — Inbound enabled  
7. TEXT — Loading provider numbers…  
8. TEXT — Master switch for phone live mode.  
9. TEXT — No agent provisioned yet. Complete readiness checks and activate the assistant from the command center header.  
10. TEXT — No phone numbers found in your ElevenLabs account. Import or purchase numbers in ElevenLabs, then refresh.  
11. TEXT — Open Test Center  
12. TITLE — Outbound calls  
13. TEXT — Outbound enabled  
14. TITLE — Phone number  
15. TITLE — Provider connection  
16. TEXT — Provision the agent before assigning a number.  
17. TEXT — Refresh status  
18. TEXT — Run a signed test session in the Test Center — no phone charges apply.  
19. TEXT — Select a phone number  
20. TEXT — Strongly recommended only with suggest-only contact permissions and monitoring.  
21. TEXT — Telephony enabled  
22. TEXT — Telephony setup  
23. TEXT — Unassign number  
24. TEXT — Warning: inbound is enabled but no phone number is assigned.

### `VoiceTestCenter.tsx` (19)

1. TITLE — Agent not provisioned  
2. TEXT — Current test scenario  
3. TEXT — Escalate when  
4. TEXT — Expected behavior  
5. TEXT — Live session  
6. TEXT — Microphone not supported in this browser — live voice testing may be unavailable.  
7. TITLE — No active session  
8. PLACEHOLDER — Notes: what worked, what failed, escalation issues…  
9. TEXT — Open launch checklist  
10. TEXT — Readiness gaps  
11. TEXT — Real-time transcript and tool-policy decisions will appear here when live integration is enabled.  
12. TEXT — Record your operator verdict locally. Results are not saved to the server yet.  
13. TEXT — Select a scenario to define expected behavior. No automated simulation — use it as an operator script.  
14. TEXT — Stop / reset  
15. TEXT — Test Center  
16. TEXT — Test result  
17. TEXT — Test scenarios  
18. TEXT — Test session expired. Start a new session to continue testing.  
19. TEXT — Validate greeting, tone, escalation, and permissions before going live on phone.

---

## Appendix B — Adjacent unscanned presentation debt (implement in same slice recommended)

**VoiceTelephonyWizard (~20 additional strings):** WizardStep status labels (`Complete`, `In progress`, …), step descriptions passed as props, provider/agent body copy, `Checking status…`, assign/unassign loading copy, `(current)` / `(other agent)`, outbound confirm body, `Cancel`, error messages (`Failed to load phone numbers`, etc.).

**VoiceTestCenter (~25 additional strings):** Phase status labels (`Session active`, `Starting…`, …), readiness row labels/values, verdict buttons, live session panel labels, navigation arrows, `Starting session…`, `Start test session`, `Readiness {n}%`, etc.

**voice-test-scenarios.ts (~40+ strings):** 8 scenario titles, prompts, expected behavior bullets, escalation lines, permission labels.
