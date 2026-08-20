# P2.2.7B Independent Read-Only Re-Audit — Voice Assistant Telephony + Test Center

**Date:** 2026-08-20
**Mode:** READ-ONLY adversarial independent recompute
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha
**PR:** [#1076](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1076)
**Implementation HEAD:** `a704bad36bacffcdc7a854bd7516bbc9df508998`
**Base (merged P2.2.7A):** `77047cfa48e44968bfe78fbf69f939d324094b5f` on `i18n/production-hardening-p2-2-6-2026-08`
**Auditor:** Cursor Cloud Agent (independent re-audit)

---

## 1. Repository / PR Provenance

| Check | Result |
|-------|--------|
| PR #1076 exists | ✅ OPEN |
| `isDraft` | ✅ `true` |
| Base branch | ✅ `i18n/production-hardening-p2-2-6-2026-08` |
| Base SHA | ✅ `77047cfa48e44968bfe78fbf69f939d324094b5f` |
| Implementation HEAD | ✅ `a704bad36bacffcdc7a854bd7516bbc9df508998` |
| `local HEAD == origin` branch SHA | ✅ match |
| Working tree clean (pre-audit commit) | ✅ clean at `a704bad3` |
| Commits after implementation HEAD before audit | ✅ none |

### Commit lineage (`77047cfa` → HEAD pre-audit)

```
77047cfa  (P2.2.7A merged baseline)
  └─ e18a6cdf  docs(i18n): P2.2.7B voice telephony + test center pre-flight audit
       └─ a704bad3  feat(i18n): P2.2.7B Voice Assistant telephony + test center localization
```

No unrelated commits in lineage.

---

## 2. Full PR Diff Classification (`77047cfa..a704bad3`)

| Category | Count | Paths |
|----------|------:|-------|
| **A** — production presentation localization | **4** | `VoiceTelephonyWizard.tsx`, `VoiceTestCenter.tsx`, `voice-test-scenarios.ts`, `voice-assistant-i18n.ts` |
| **B** — canonical dictionary | **2** | `voice-assistant.en.ts`, `voice-assistant.de.ts` |
| **C** — tests | **2** | `rental-voice-assistant-telephony-test-center-localization.test.tsx`, `hardcoded-copy-guard.test.ts` |
| **D** — scanner/governance | **2** | `i18n-hardcoded-scan.mjs`, `hardcoded-copy-inventory.json` |
| **E** — unrelated/out-of-scope | **0** | — |
| **F** — documentation/audit/architecture | **4** | `architecture/I18N_RENTAL_VOICE_ASSISTANT_P2_2_7B_2026-08-20.md`, `ChangesView.tsx`, `ArchitekturView.tsx`, `docs/audits/i18n-p2-2-7b-voice-telephony-test-center-preflight-2026-08-20.md` |

Implementation-only commit (`e18a6cdf..a704bad3`) = **13 files** (matches implementation report; preflight audit doc is prior commit).

**Category E = 0** — no backend, API, schema, migration, or routing-contract paths.

---

## 3. Business-Logic Preservation — Telephony (`VoiceTelephonyWizard.tsx`)

Adversarial diff review vs `77047cfa`:

| Area | Verdict |
|------|---------|
| `loadPhoneNumbers()` / `assignPhoneNumber()` / `unassignPhoneNumber()` / `refreshTelephony()` / `updateTelephonySettings()` | Unchanged call sites and argument shapes |
| API payload keys (`telephonyEnabled`, `inboundEnabled`, `outboundEnabled`) | Preserved |
| `phoneNumberId` / `selectedId` select value semantics | Preserved |
| Outbound confirmation gating (`confirmOutbound` → `{ outboundEnabled: true }`) | Preserved |
| Control flow, disabled predicates, loading states | Preserved |
| Twilio / ElevenLabs / PSTN machine semantics | Unchanged |

**Presentation-only refactors (not counted as business/runtime modifications):**

1. `phonesError: string | null` → `phonesErrorCode: TelephonyErrorCode | null` with `labelTelephonyError()` at render — same failure trigger points (`loadNumbers` / `refresh` / `assign`), localized display only.
2. Step status labels extracted to `labelWizardStepStatus()` — display only.

**business/runtime modifications = 0** (target: 0) ✅

---

## 4. Business-Logic Preservation — Test Center (`VoiceTestCenter.tsx`)

| Area | Verdict |
|------|---------|
| `api.voiceAssistant.testSession(orgId)` | Unchanged |
| `res.status === 'blocked'` gating | Preserved |
| Mic gating (`navigator.mediaDevices?.getUserMedia`) | Preserved |
| Phase transitions (`idle` → `starting` → `active` / `blocked` / `error` / `expired`) | Preserved |
| Expiry polling interval (10s) | Preserved |
| `onTestPassed()` after successful non-blocked session | Preserved |
| `VoiceTab` navigation keys (`fixTab`, `onNavigateTab`) | Preserved |
| Verdict ids (`passed`, `needs_review`, `failed`) | Preserved |

**Scenario selection change (`selectedScenario` object → `selectedScenarioId` + `useMemo` lookup):**

- Selection identity remains scenario `id` (machine value unchanged).
- Locale switch: previously stored object could retain stale localized strings until re-click; now `selectedScenario` re-resolves from `localizedVoiceTestScenarios(locale, …)` while `selectedScenarioId` stays stable.
- **Classification:** presentation/state-shape improvement; does **not** change API calls, persisted state, or routing.
- No material semantics regression identified.

**business/runtime modifications = 0** (target: 0) ✅

---

## 5. Scenario Localization Audit (`voice-test-scenarios.ts`)

| Check | Result |
|-------|--------|
| User-facing titles/descriptions via `titleKey` / `promptKey` / `expectedBehaviorKeys` / etc. | ✅ All 8 scenarios keyed |
| Raw English operator copy literals in definitions | ✅ Removed (verified by test + source inspection) |
| Scenario `id` values | ✅ Unchanged (`book_vehicle`, `modify_booking`, …) |
| `fixTab` values | ✅ Unchanged |
| Module-init static locale resolution | ✅ None — resolution via `localizedVoiceTestScenarios(locale, …)` at runtime |
| Scanner blind spot closed | ✅ File in `P27B_ENFORCE_CLEAN_EXACT` |

No hidden literal strings found consumed by `VoiceTestCenter` beyond intentional machine ids / tab keys.

---

## 6. Scanner Findings — Independent Recomputation

Scanner re-run at `a704bad3` (`node scripts/i18n-hardcoded-scan.mjs`):

| Metric | Baseline (`77047cfa` inventory) | Implementation claim | Independently recomputed |
|--------|-------------------------------:|---------------------:|-------------------------:|
| VoiceTelephonyWizard | 24 | 0 | **0** |
| VoiceTestCenter | 19 | 0 | **0** |
| voice-test-scenarios | 0 | 0 | **0** |
| Voice Assistant total | 43 | 0 | **0** |
| Rental total | 765 | 722 | **722** |
| Global total | 2087 | 2044 | **2044** |
| P2.2.7B enforce-clean scope | 43 | 0 | **0** |
| Global enforce-clean | 0 | 0 | **0** |

All implementation scanner claims **verified**.

---

## 7. Scanner / Governance Integrity

Changes to `i18n-hardcoded-scan.mjs`, `hardcoded-copy-inventory.json`, `hardcoded-copy-guard.test.ts`:

| Risk | Finding |
|------|---------|
| Broad ignore rules | ❌ None added |
| Path exclusions / heuristic weakening | ❌ None |
| Allowlists hiding P2.2.7B copy | ❌ None |
| Inventory-only debt suppression | ❌ None observed |

**Scanner diff:** adds `P27B_ENFORCE_CLEAN_EXACT` (3 paths) + `isP27BEnforceCleanPath()` wired into enforce-clean surface check and migration phase label — **boundary is real**, not a bypass.

### Inventory JSON delta explanation

- Git stat: `717 ++--` (57 insertions, 660 deletions) — large line churn from **regenerated compact inventory**, not silent unrelated deletion.
- Finding-level diff (id-based): **95 removed**, **52 added**, net **−43** = exact Voice Assistant finding clearance.
- Voice-assistant removed findings: **43** (= Telephony 24 + Test Center 19).
- P27B telephony+test removed: **43** (100% alignment).
- Remaining 52 removals are inventory regeneration artifacts (re-indexing / dedup), not P2.2.7B scope debt hiding.

---

## 8. Canonical Key Accounting

| Metric | Baseline | Implementation claim | Independently recomputed |
|--------|----------|---------------------|-------------------------|
| Canonical keys | 6465 | 6625 | **6625** |
| EN keys | 6465 | 6625 | **6625** |
| DE keys | 6465 | 6625 | **6625** |
| EN/DE parity | 100% | 100% | **100%** |
| New keys (delta) | — | +160 | **+160** |
| `voice-assistant.en.ts` key rows | 116 | 276 | **276 (+160)** |

### New key buckets (voice.* additions, EN value analysis vs baseline full dictionary)

| Bucket | Count | Notes |
|--------|------:|-------|
| **A** — definitely new semantic concept | ~156 | Telephony wizard, test center UI, 8× scenario copy sets |
| **B** — legitimate same-string/different-context | 0 | — |
| **C** — exact reusable canonical key existed (duplicate EN value) | **4** | See below |
| **D** — likely semantic reuse existed | 0 | Not elevated without stronger context match |
| **E** — ambiguous | 0 | — |

**Category C entries (minor duplicate-key governance debt, non-blocking):**

| New key | EN value | Existing key(s) with same EN |
|---------|----------|------------------------------|
| `voice.telephony.stepStatus.error` | Error | `voice.status.operator.error`, `voice.status.provider.error` |
| `voice.test.phase.error` | Error | same |
| `voice.test.row.providerConnected` | ElevenLabs connected | `voice.checklist.elevenlabs.label` |
| `voice.test.row.notConnected` | Not connected | `voice.status.telephony.notConnected` |

Justification for +160: ~43 scanner-visible UI strings + ~117 scanner-invisible scenario copy (8 scenarios × multi-field arrays) — **proportionate**.

---

## 9. Reuse Claim Verification

| Claimed reuse | Consumer | Verified |
|---------------|----------|----------|
| `voice.nav.tab.test` | `VoiceTestCenter.tsx` title | ✅ |
| `voice.wizard.step.phone` | `VoiceTelephonyWizard.tsx` step 3 title | ✅ (canonical `en.ts` / `de.ts`) |
| `common.cancel` | Outbound confirm cancel button | ✅ |

**Additional reuse opportunities reviewed:** `voice.telephony.openTestCenter` vs `voice.nav.tab.test` — correctly split (action verb vs nav label). `voice.test.subtitle` vs `voice.launch.subtitle` — distinct context. No blocking missed reuse identified.

---

## 10. Translation Semantics (German)

| Severity | Items |
|----------|-------|
| **BLOCKING** | None |
| **NON-BLOCKING** | `Testcenter` (one word) vs mixed `Test-Center` elsewhere in industry — consistent within module |
| **STYLE ONLY** | Em dash in `Verstanden — ausgehend aktivieren` matches EN tone; `Operator-Skript` appropriate |

Terminology checks:

- ✅ Telefonie, eingehende/ausgehende Anrufe, Telefonnummer, Assistent
- ✅ ElevenLabs / ELEVENLABS_API_KEY not translated
- ✅ Machine values (`blocked`, phase ids, verdict ids) not translated

---

## 11. Component Test Quality

**Harness:** Real `LanguageProvider`, production `VoiceTelephonyWizard` / `VoiceTestCenter`, `document.body.textContent` EN/DE assertions, scenario localization loop, source grep for machine payload keys, P2.2.7B enforce-clean guard.

| Surface | Grade | Rationale |
|---------|-------|-----------|
| Telephony | **ACCEPTABLE** | EN/DE DOM + machine-key grep; no outbound-confirm interaction test; `act(...)` warnings in stderr |
| Test Center | **ACCEPTABLE** | EN/DE DOM + scenario copy + blocked-source grep; no explicit locale-switch rerender test |

Neither **MISLEADING** — tests exercise production components through canonical i18n wiring.

---

## 12. Test / Validation Re-Run (independent)

| Command | Result |
|---------|--------|
| P2.2.7B component tests | **10/10 PASS** |
| P2.2.7A voice localization tests | **10/10 PASS** |
| P2.2.7B + P2.2.7A + guard (3 files) | **30/30 PASS** |
| `hardcoded-copy-guard.test.ts` (full file) | **10/10 PASS** (included above) |
| `npm run i18n:check` | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check 77047cfa..a704bad3` | **FAIL** — trailing whitespace in markdown docs only (preflight audit + architecture doc); no production code |

---

## 13. CI Workflow Triage (implementation HEAD)

| Workflow | Status | Classification |
|----------|--------|----------------|
| Legal Documents — Production Readiness CI | FAIL (backend `tsc`) | **B — pre-existing baseline** |
| Vehicle Detail — Production Readiness CI | FAIL (same `tsc`) | **B — pre-existing baseline** |

Failing files (not in PR diff):

- `billing.controller.security.characterization.spec.ts`
- `vehicles-security-negative.spec.ts`
- `vehicles.controller.status-patch.spec.ts`

Proof: `vehicles.controller.status-patch.spec.ts` is **identical** at `77047cfa` and `a704bad3` (pre-existing constructor arity mismatch). No P2.2.7B frontend files in backend typecheck errors.

**P2.2.7B-caused CI failures: 0** ✅

---

## 14. Shim / Compatibility Accounting

| Metric | Baseline claim | Recomputed |
|--------|---------------:|-----------:|
| Production shim | 18 | **18** |
| Test shim | 11 | **11** |
| **Total** | 29 | **29** |
| New compat consumers (Telephony/Test Center) | 0 | **0** |

P2.2.7B surfaces import `../../../i18n/LanguageContext` (canonical) — no `../i18n/` shim imports.

---

## 15. Business Contract Verification

Modified paths outside presentation/i18n/test/scanner/docs: **0**

No changes to backend, API schemas, REST routes, Twilio/ElevenLabs contracts, permissions, billing, org scoping, DB, migrations, or auth.

---

## 16. Documentation / Architecture

| Artifact | Updated in implementation? | Matches code? |
|----------|---------------------------|---------------|
| `ChangesView.tsx` | ✅ | ✅ |
| `ArchitekturView.tsx` | ✅ | ✅ |
| `architecture/I18N_RENTAL_VOICE_ASSISTANT_P2_2_7B_2026-08-20.md` | ✅ | ✅ |

Docs are descriptive only; not used as proof of correctness.

---

## 17. Independent Final Recomputation Table

| Metric | Baseline | Implementation claim | Independently recomputed |
|--------|----------|---------------------|-------------------------|
| Canonical keys | 6465 | 6625 | **6625** |
| EN keys | 6465 | 6625 | **6625** |
| DE keys | 6465 | 6625 | **6625** |
| EN/DE parity | 100% | 100% | **100%** |
| Telephony findings | 24 | 0 | **0** |
| Test Center findings | 19 | 0 | **0** |
| Voice Assistant findings | 43 | 0 | **0** |
| Rental findings | 765 | 722 | **722** |
| Global findings | 2087 | 2044 | **2044** |
| P2.2.7B enforce-clean | 43 | 0 | **0** |
| Global enforce-clean | 0 | 0 | **0** |
| Shim total | 29 | 29 | **29** |
| New compat consumers | 0 | 0 | **0** |
| New keys | +160 | +160 | **+160** |
| Exact reuse | 3 | 3 | **3** |
| Exact duplicate debt (C bucket) | — | — | **4** |
| Category E | 0 | 0 | **0** |
| P2.2.7B tests | 10/10 | 10/10 | **10/10** |
| Voice tests (P2.2.7A+P2.2.7B) | — | — | **20/20** |
| Build | — | PASS | **PASS** |
| i18n:check | — | PASS | **PASS** |
| git diff --check | — | — | **FAIL (docs whitespace only)** |
| business/runtime modifications | 0 | 0 | **0** |

---

## 18. Final Verdict

### **B — READY WITH NON-BLOCKING OBSERVATIONS**

P2.2.7B implementation at `a704bad3` independently verifies:

- Genuine **43 → 0** Voice Assistant hardcoded-copy clearance
- No scanner weakening; real `P27B_ENFORCE_CLEAN_EXACT` boundary
- **100%** EN/DE parity on **+160** new keys
- **Zero** material business-logic / API contract changes
- **Zero** P2.2.7B-caused CI failures
- **Category E = 0**
- Meaningful (if not exhaustive) component tests

### Non-blocking observations (do not block freeze)

1. **4 exact-duplicate EN key candidates** (Category C) — optional consolidation in a follow-up hygiene pass.
2. **Test quality ACCEPTABLE** — consider adding outbound-confirm interaction + locale-switch rerender tests before P2.2.8 hardening.
3. **`git diff --check`** trailing whitespace in preflight audit + architecture markdown (cosmetic).
4. **Pre-existing backend `tsc` CI failures** on base — unrelated to P2.2.7B; track separately.

### Smallest correction scope (if pursuing A-grade freeze polish)

- Optional: deduplicate 4 Category-C keys (~4 call sites + dictionary edits).
- Optional: strip trailing whitespace in doc markdown files.
- Optional: strengthen tests (outbound confirm + locale rerender) — test-only diff.

**No production-code corrections required for P2.2.7B freeze.**

---

## 19. Audit Provenance

| HEAD | SHA | Description |
|------|-----|-------------|
| Implementation | `a704bad36bacffcdc7a854bd7516bbc9df508998` | P2.2.7B localization commit |
| Audit document | *(this commit)* | Independent re-audit artifact only |

---

*End of independent re-audit.*
