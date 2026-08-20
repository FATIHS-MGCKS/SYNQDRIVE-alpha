# P2.2.7 Voice Assistant — Read-Only Pre-Flight / Scope Determination

**Date:** 2026-08-19  
**Mode:** read-only analysis only — no implementation  
**Program baseline (P2.2.6 merged/frozen):** `4e09e4cad8d48e3af1918fcd1573655118c75654` on `i18n/production-hardening-p2-2-6-2026-08`  
**PR #1072:** MERGED 2026-08-19T23:33:47Z (squash merge commit `4e09e4ca`)  
**Origin `main` at audit time:** `3a6f23f30be129acfd137ddb65de1e98bb4e1cb1`  
**Audit performed from:** isolated read-only worktree at `4e09e4ca` (`/tmp/synqdrive-p227-audit`); `/workspace` unmodified  

---

## 1. Repository / baseline provenance

| Item | Verified value |
|------|----------------|
| **Local workspace branch (at audit time)** | `cursor/p226-correction-i18n-reuse-3c10` @ `44a56c1421186a9321cd6097a34ac88d69f11fe9` (pre-merge correction branch; not current program HEAD) |
| **P2.2.6 merged/frozen HEAD** | `4e09e4cad8d48e3af1918fcd1573655118c75654` on `origin/i18n/production-hardening-p2-2-6-2026-08` |
| **PR #1072** | **MERGED** 2026-08-19T23:33:47Z; merge commit `4e09e4ca` (squash of correction work) |
| **Origin `main`** | `3a6f23f30be129acfd137ddb65de1e98bb4e1cb1` |
| **Working tree (`/workspace`)** | **clean** (0 modified files) |
| **Voice file diff `44a56c14` ↔ `4e09e4ca`** | **0 lines** (voice surfaces identical; only merge metadata differs) |

### Ancestry

| Commit | Role |
|--------|------|
| `f312627d` | P2.2.5 checkpoint |
| `2d7a7794` | P2.2.6 implementation |
| `d9fcef61` | P2.2.6 audit/docs checkpoint |
| `4e09e4ca` | P2.2.6 correction merge (#1072) — **current i18n branch HEAD** |

### Commits after #1072 affecting P2.2.7 scope

**None** on the i18n branch. `main` has unrelated work (fleet readiness, notifications, billing) that does **not** touch rental Voice Assistant files.

---

## 2. Current i18n debt (recomputed at `4e09e4ca`)

| Metric | Value |
|--------|------:|
| Global findings | **2155** |
| Rental findings | **833** |
| Enforce-clean findings | **0** |
| Canonical keys | **6349** |
| EN keys | **6349** |
| DE keys | **6349** |
| EN/DE parity | **100%** |
| Compat shim total | **30** (prod **19**, test **11**) |
| New compat consumers (P2.2.6) | **0** |

### Voice Assistant (recomputed — not historical “111” assumed)

| Metric | Value |
|--------|------:|
| **Voice Assistant module findings** | **111** |
| Production files with findings | **11** |
| Test files with findings | **0** |
| Categories | TITLE **18**, TEXT **80**, PLACEHOLDER **10**, ARIA **3** |

### Production file distribution (findings)

| File | Findings |
|------|--------:|
| `VoiceTelephonyWizard.tsx` | 24 |
| `VoiceAssistantBuilder.tsx` | 23 |
| `VoiceTestCenter.tsx` | 19 |
| `VoiceConversationsPanel.tsx` | 18 |
| `VoiceAnalyticsView.tsx` | 9 |
| `VoicePermissionsMatrix.tsx` | 8 |
| `VoiceCommandHeader.tsx` | 3 |
| `VoiceSelectorField.tsx` | 3 |
| `VoiceLaunchChecklist.tsx` | 2 |
| `VoiceOnboardingWizard.tsx` | 1 |
| `VoiceSectionNav.tsx` | 1 |

### Prior-phase movement

Voice Assistant count is unchanged at **111** vs pre-P2.2.6 baseline (stations phase cleared 57 rental findings; Voice Assistant was not touched). Rental total dropped **890 → 833** (−57) entirely from stations.

---

## 3. Voice Assistant ownership boundary

### Primary rental ownership (P2.2.7 target)

```
rental/components/VoiceAssistantView.tsx          (shell — already t()-wired, 0 scanner findings)
rental/components/voice-assistant/**              (35 files)
```

### Adjacent but OUT OF P2.2.7 scope

| Area | Findings | Notes |
|------|----------|-------|
| `master/components/VoiceAssistantAdminView.tsx` | 25 | Master control plane |
| `master/components/voice-control-plane/*` | 3 | Master secure actions |
| `e2e/voice-*.spec.ts` | — | Integration/e2e (6 `test`/`it` blocks in 2 specs) |

### Module inventory summary (rental `voice-assistant/`)

| Class | Files | Scanner findings | i18n state |
|-------|------:|-----------------:|------------|
| **A — Primary presentation (hardcoded)** | 11 TSX | **111** | No `useLanguage()` |
| **A — Primary presentation (partial i18n)** | 7 TSX | **0** | `useLanguage()` via **shim** `../../i18n/` |
| **A — Primary presentation (clean)** | 4 TSX | **0** | No i18n needed / already clean |
| **B — Shared presentation helpers** | `BuilderField.tsx`, `KnowledgeIntegrationHints.tsx` | 0 | Presentational only |
| **C — Business logic / state** | `voice-assistant.ops.ts`, `voice-wizard.ops.ts`, `voice-permission-groups.ops.ts`, `voice-conversation.utils.ts` | 0* | **Hidden EN label strings** in ops (`operatorStatusLabel`, etc.) — *not scanner-flagged* |
| **D — Provider/telephony integration** | API wiring in `VoiceAssistantView.tsx`, `VoiceTelephonyWizard.tsx` | 24 in wizard | Callbacks must not change |
| **E — Tests** | 5 unit + 2 e2e-related | 0 in scanner | 37 unit tests pass |
| **F — Unrelated** | — | — | — |

### Shim consumers (rental Voice Assistant)

| File | Import |
|------|--------|
| `VoiceAssistantView.tsx` | `../i18n/` (shim) |
| 7× `voice-assistant/*.tsx` | `../../i18n/` (shim) |

Safe migration: **import-path-only** to `../../../i18n/` — same pattern as P2.2.6 stations. No runtime behavior change expected.

---

## 4. Business-logic risk analysis

### Must remain untouched

- Org/tenant scoping (`useRentalOrg`, `orgId` on all API calls)
- Permission modes / tool capability matrix semantics (`voice-assistant-permissions.ops.ts`)
- Telephony/PSTN routing (`assignPhoneNumber`, `updateTelephonySettings`, inbound/outbound flags)
- Twilio/ElevenLabs provider status interpretation
- Activation/readiness gating, `operationLock`, save/activate/sync flows
- API payloads and webhook contracts (`api.voiceAssistant.*`)
- Test-call initiation logic in `VoiceTestCenter`
- Characterization-tested behavior contracts (wizard steps, ops tabs, billing endpoints)

### Per-file implementation risk

| File / area | Risk | Why |
|-------------|------|-----|
| `VoiceSectionNav`, `VoiceLaunchChecklist`, `VoiceSelectorField` | **LOW** | Pure labels/chips |
| `VoiceAnalyticsView`, `VoiceConversationsPanel` | **LOW–MEDIUM** | Filters/labels; API calls unchanged |
| `VoiceAssistantBuilder` | **MEDIUM** | Large form; many strings; save/draft logic must not move |
| `VoiceCommandHeader` | **MEDIUM** | Status labels from ops helpers |
| `voice-assistant.ops.ts` label functions | **MEDIUM** | Presentation strings; characterization tests assert English |
| `VoicePermissionsMatrix` | **HIGH** | Permission UX + autonomous mode copy |
| `VoiceOnboardingWizard` (+ steps) | **MEDIUM** | Mostly localized; 1 residual finding |
| `VoiceTelephonyWizard` | **HIGH** | Phone assign/unassign, telephony toggles, provider steps |
| `VoiceTestCenter` | **HIGH** | Test scenarios, agent provisioning UI, call testing |
| `voice-test-scenarios.ts` | **MEDIUM** | English scenario corpus; user-visible in test center |
| `VoiceAssistantView.tsx` | **LOW** | Already localized; shim migration only |

**Blockers:** none architectural — risk is execution discipline on telephony/test surfaces.

---

## 5. Existing canonical key reuse analysis

**134 `voice.*` keys already exist** in EN/DE (wizard, plan, knowledge, permissions, ops, analytics, activation, etc.). Seven presentation files already consume them via `t()`.

### Independent bucketing of 111 scanner findings

| Bucket | Count | Meaning |
|--------|------:|---------|
| **A — Exact canonical reuse** | **8** | String matches existing key (3 `voice.*`, 5 cross-domain e.g. `common.*`, `serviceCenter.*`, `iam.risk.low`) |
| **B — Semantic reuse likely** | **18** | Needs UI-context proof; automated matcher noisy |
| **C — Genuinely new semantics** | **56** | No safe existing key (conversations filters, telephony steps, builder sections) |
| **D — Ambiguous** | **29** | Multiple `voice.*` candidates; decision at implementation time |

### Exact reuse examples (bucket A)

| Sample string | Existing key(s) |
|---------------|-----------------|
| `From date` | `serviceCenter.history.dateFrom` (cross-domain) |
| `To date` | `serviceCenter.history.dateTo` (cross-domain) |
| `Loading analytics…` | `evaluations.availability.loading` (cross-domain) |
| `Low risk` | `iam.risk.low` (cross-domain) |
| `Phone number` | `voice.wizard.step.phone` |
| `Save changes` | `voice.common.save` |
| `Unsaved changes` | `workflowAutomation.editor.unsavedTitle`, `priceTariffs.editor.unsavedTitle` (cross-domain) |
| `Voice assistant sections` | `voice.ops.navLabel` |

### Probable duplicate-key traps (pre-existing in `voice.*`)

| EN value | Duplicate keys |
|----------|----------------|
| `Locations` | `voice.plan.locations`, `voice.knowledge.stations` |
| `Forwarded` | `voice.ops.kpi.forwarded`, `voice.ops.forwarded` |
| `Remaining` | `voice.ops.remaining`, `voice.analytics.remaining` |
| `Consumed` | `voice.ops.consumed`, `voice.analytics.consumed` |

### P2.2.6 lesson applied

Implementation must run a duplicate-key audit before freeze; do not auto-create `voice.*` when `voice.ops.*`, `common.*`, or cross-domain keys fit the **same UI context**.

**Estimated net-new keys:** ~40–70 (many findings should wire existing `voice.*` keys, especially ops/overview/wizard surfaces already keyed).

---

## 6. Translation quality / terminology baseline

| Concept | Current state |
|---------|---------------|
| Voice Assistant (EN) | Mixed: `nav.aiVoiceAssistant` / `view.aiVoiceAssistant` = “AI Voice Assistant”; hardcoded “AI Voice Command Center” |
| Sprachassistent (DE) | Canonical `voice.*` uses **“Sprachassistent”** / **“KI-Sprachassistent”** consistently in dictionary |
| KI-Agent | Not used in canonical `voice.*` |
| Anruf / Telefonnummer | Present in DE `voice.*` (e.g. wizard phone step) |
| Twilio / ElevenLabs / PSTN | **Not in dictionaries** — product/technical labels in code (`providerStatusLabel` returns “Twilio not configured”, “Diagnostic PSTN only”) |
| EN hardcoded in ops helpers | `Active`, `Connected`, `Not configured`, `Draft`, etc. — **DE gap** even after TSX localization unless ops labels are addressed |
| `voice-test-scenarios.ts` | **All English** scenario titles/prompts — user-visible in test center |
| Encoding artifacts | None observed in `voice.*` dictionary samples |

**Product names to keep untranslated:** Twilio, ElevenLabs, PSTN (when used as provider identifiers).

---

## 7. Test provenance and coverage

### Discovered tests (current HEAD)

| Category | Files | Tests | Status |
|----------|------:|------:|--------|
| Characterization / contract | 5 | **37** | **PASS** (run in `/workspace`) |
| E2E voice | 2 specs + fixtures | **6** blocks | Not run (pre-flight) |
| Master voice-control-plane | 1 | — | Out of scope |
| **Localization render tests** | **0** | **0** | — |

### Classification of existing 37 tests

| Type | Count | Notes |
|------|------:|-------|
| Business logic / ops | 13 | `voice-assistant.ops.characterization.test.ts` |
| API contract | 5 | |
| UI characterization (source inspection) | 11 | Asserts `t('voice.*')` **strings exist in source**, not rendered DOM |
| Wizard ops | 5 | |
| Permission groups ops | 3 | |

### Localization regression protection: WEAK

| Would catch… | Evidence |
|--------------|----------|
| EN rendering regression | **No** — no component render tests |
| DE rendering regression | **No** |
| Raw hardcoded regression | **Partial** — scanner + source checks only |
| Wrong canonical key | **No** — would not fail if wrong key returns same English |
| Permission regression | **Yes** — ops/contract characterization |
| Call-state regression | **Partial** — ops tests lock English status strings |
| Provider-config regression | **Partial** — contract tests |

### Critical gap

Same failure mode as pre-P2.2.6 stations — needs `rental-voice-assistant-localization.test.tsx` with real `LanguageProvider` + DOM assertions for top surfaces (wizard, ops header, conversations, telephony labels).

### Surfaces NOT covered by tests

- `VoiceTelephonyWizard`, `VoiceTestCenter`, `VoiceConversationsPanel`, `VoiceAssistantBuilder`, `VoiceAnalyticsView`, `VoicePermissionsMatrix` (render/i18n)
- DE locale output anywhere
- `voice-test-scenarios` localized rendering

---

## 8. Shim / compatibility analysis

| Metric | Value |
|--------|------:|
| Voice Assistant shim consumers | **8** (1 prod shell + 7 voice-assistant TSX) |
| Production | **8** |
| Test | **0** |
| Migration type | **Import-path-only** (`../i18n/` / `../../i18n/` → `../../../i18n/`) |
| Shim budget impact | **0 new**; optional **−8** if all migrated in-scope |
| `VoiceAssistantView.tsx` | Already listed in global compat inventory (prod shim file) |

---

## 9. Scanner / enforce-clean plan (proposal only)

**Narrowest legitimate boundary** (matches scanner module classifier at `i18n-hardcoded-scan.mjs:300`):

```javascript
const P27_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/voice-assistant/',
];
const P27_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/VoiceAssistantView.tsx',
]);
```

| Metric | Before | After (target) |
|--------|-------:|---------------:|
| Voice Assistant findings | **111** | **0** |
| P2.2.7 enforce-clean debt | n/a | **0** |
| Category C/E absorption | — | **0** |

No ignores, exemptions, or inventory manipulation proposed.

**Hidden debt note:** `voice-assistant.ops.ts` label functions and `voice-test-scenarios.ts` are **not scanner-counted** but produce user-visible English. Include in implementation scope for real DE parity.

---

## 10. Recommended implementation boundary

### Decision: B — GO as narrower P2.2.7A presentation slice first

Full module (111 findings + ops labels + scenarios) is feasible in one phase but **telephony + test-call surfaces carry HIGH touch risk**. Recommended phasing:

### P2.2.7A — IN SCOPE (recommended first slice)

**Production files (68 scanner findings → 0)**

- `VoiceAssistantBuilder.tsx` (23)
- `VoiceConversationsPanel.tsx` (18)
- `VoiceAnalyticsView.tsx` (9)
- `VoicePermissionsMatrix.tsx` (8)
- `VoiceCommandHeader.tsx` (3)
- `VoiceSelectorField.tsx` (3)
- `VoiceLaunchChecklist.tsx` (2)
- `VoiceOnboardingWizard.tsx` (1)
- `VoiceSectionNav.tsx` (1)
- Already-localized shim files: migrate imports + verify zero regression:
  - `VoiceOperationsOverview`, `VoiceOpsSectionNav`, `VoicePermissionGroupsPanel`, `VoiceUsageAnalyticsPanel`, `VoiceWizardPlanStep`, `VoiceWizardKnowledgeStep`
- `VoiceAssistantView.tsx` — shim migration only (already 0 findings)

**Presentation helpers (hidden debt, in-scope for DE parity)**

- `voice-assistant.ops.ts` — `operatorStatusLabel`, `providerStatusLabel`, `telephonyStatusLabel`, `lastCallLabel` string returns → `voice-assistant-i18n.ts` helper (mirror `stations-i18n.ts`)
- `voice-test-scenarios.ts` — scenario copy keys (or deferred to 7B if scenarios stay EN-only by product decision)

**Translations**

- Reuse existing **134 `voice.*` keys** aggressively
- Add `voice-assistant.en.ts` / `.de.ts` fragments only for genuinely new strings (bucket C/D)
- Cross-domain reuse where UI context matches (`serviceCenter.history.dateFrom`, `iam.risk.low`, etc.)

**Tests / scanner**

- `P27` enforce-clean prefix + guard test (mirror P2.2.6)
- New `rental-voice-assistant-localization.test.tsx` with component render tests (EN+DE)
- Update characterization tests for ops labels if localized via helper

### P2.2.7B — DEFERRED (second slice)

- `VoiceTelephonyWizard.tsx` (24 findings) — PSTN/phone assign/unassign UI
- `VoiceTestCenter.tsx` (19 findings) — test-call / agent provisioning UI

### EXPLICITLY OUT OF SCOPE

- Master `VoiceAssistantAdminView` + `voice-control-plane` (28 master findings)
- Backend / Twilio / ElevenLabs API changes
- Permission model / telephony behavior / billing semantics
- WhatsApp, Finance, Tasks, Stations, unrelated rental debt
- E2E spec rewrites (unless broken by visible string changes)
- P2.2.8+

---

## 11. Acceptance criteria (measurable)

For each slice (7A then 7B):

- Voice Assistant scanner findings in slice → **0**
- P2.2.7 enforce-clean = **0**
- No Category C/E scope absorption
- EN/DE parity = **100%**
- Document: keys added vs reused (exact/semantic/new)
- Pre-freeze duplicate-key audit (incl. existing `voice.*` value collisions)
- Zero new compat consumers; shim total **≤ 30** (prefer decrease)
- All 37+ existing voice tests **PASS** (update expectations where presentation changes)
- New localization component tests **PASS**
- `npm run i18n:check` **PASS**
- `npm run build` **PASS**
- `git diff --check` **PASS**
- Business logic, permissions, telephony/provider behavior **unchanged** (verified by characterization + contract tests)
- Out-of-scope files **untouched**

---

## 12. GO / NO-GO decision

## B — GO, but only as narrower P2.2.7A presentation slice first

### Evidence for GO

- Clear ownership boundary (`rental/components/voice-assistant/` + shell)
- **134 existing `voice.*` keys** — substantial prior investment; mostly wiring + completion work
- Scanner module already classifies “Voice Assistant” at **111** findings
- Partial migration exists (8 files already on `t()`)
- P2.2.6 pattern (enforce-clean prefix, shim migration, component render tests) applies directly
- Zero enforce-clean debt globally; stable shim budget

### Why not single full P2.2.7 (option A)

- **43/111 findings** (39%) sit in `VoiceTelephonyWizard` + `VoiceTestCenter` — highest behavioral risk
- Ops label helpers carry **hidden DE debt** not in scanner count
- Current localization tests are **WEAK** (source inspection only)
- Characterization tests **lock English** status strings

### Why not NO-GO

- No architectural prerequisite missing; dictionary foundation exists
- No backend changes required for presentation localization

### Recommended exact boundary for approval

Implement **P2.2.7A** as defined in §10, then **P2.2.7B** for telephony/test surfaces after 7A passes read-only re-audit.

---

## 13. Governance / stop condition (audit run)

| Check | Status |
|-------|--------|
| Files modified in `/workspace` during audit | **0** |
| Implementation started | **NO** |
| Commits created (during audit) | **NO** |
| Pushes (during audit) | **NO** |
| Merge / deploy | **NO** |
| P2.2.8 work | **NO** |
| PR created | **NO** |

**STOP — awaiting approval to begin P2.2.7A implementation.**

---

## Appendix A — Near-miss / semantic reuse candidates (pre-flight)

| New/hardcoded string context | Candidate existing key | Pre-flight decision | Reason |
|-----------------------------|------------------------|---------------------|--------|
| `Conversation Logs` | `voice.ops.tab.conversations` | Ambiguous (D) | “Logs” vs “Conversations” — different UI framing |
| `e.g. SynqDrive Rental Assistant` | `voice.wizard.step.assistant` | Ambiguous (D) | Placeholder vs step label |
| `Knowledge gaps` / `Knowledge snippets` | `voice.wizard.step.knowledge` | Ambiguous (D) | Partial word overlap only |
| `Agent not provisioned` / `Agent provisioning` | — | New (C) | Telephony/agent lifecycle copy |
| `All calls` / `All directions` / `All outcomes` | — | New (C) | Conversations filter labels |
| `Enable outbound telephony?` | — | New (C) | Telephony wizard confirmation |
| `Control what the voice assistant may do during calls.` | — | New (C) | Permissions matrix intro |
| `Current test scenario` | — | New (C) | Test center UI |

---

## Appendix B — Validation commands run during pre-flight

| Command | Result |
|---------|--------|
| `node scripts/i18n-hardcoded-scan.mjs` (at `4e09e4ca`) | PASS — Voice Assistant **111**, global **2155**, enforce-clean **0** |
| `node scripts/i18n-shim-inventory.mjs` (at `4e09e4ca`) | PASS — shim total **30** (prod 19, test 11) |
| `npx vitest run src/rental/components/voice-assistant` (workspace) | **37/37 PASS** |
| `npx vitest run src/i18n/translation-registry.test.ts -t "coverage reporting"` | Canonical keys **6349**, EN/DE **100%** |

No production code, tests, dictionaries, or scanner configuration were modified during this pre-flight audit.
