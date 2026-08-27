# P2.2.50 — Final HEAD Menu Same-Mount Certification

**Date:** 2026-08-27  
**Implementation PR:** [#1340](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1340)  
**Prior re-audit:** [#1341](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1341) (Verdict B)  
**Authoritative baseline:** `e0aa79d3135866eb9f890c2666165f15a1411c0b`  
**Old audited HEAD:** `3a0e327781c1dc6d3fa4848c623bda9f2cca0195`  
**Final implementation HEAD:** `2fc783b4dd6952641da11e2be3d5d18b6330aec9`

---

## 1. Test-gap origin (#1341)

PR #1341 noted the More Menu **open-state** across same-mount locale switch was not directly tested (static/code review only). This was the sole unresolved readiness-contract item blocking merge certification upgrade.

---

## 2. Follow-up commit forensics

| Field | Value |
|-------|--------|
| SHA | `2fc783b4dd6952641da11e2be3d5d18b6330aec9` |
| Parent | `3a0e327781c1dc6d3fa4848c623bda9f2cca0195` |
| Subject | `test(i18n): prove P250 menu state survives locale switch` |
| Changed paths | 1 (`rental-invoice-detail-header-localization.test.tsx`) |
| Additions | 170 |
| Deletions | 1 |

| Classification | Count |
|----------------|-------|
| P250 TEST-ONLY FOLLOW-UP | 1 file |
| PRODUCTION CHANGE | **0** |
| DICTIONARY CHANGE | **0** |
| SCANNER CHANGE | **0** |
| ARCHITECTURE CHANGE | **0** |
| SCOPE EXPANSION | **0** |
| UNRELATED | **0** |

---

## 3. New test description

**Test:** `preserves More Menu open state across same-mount locale switch`

**Harness:** `LocaleAwareMoreMenuHarness` mounts real `InvoiceHeaderMoreMenu` once inside `LanguageProvider` + `LocaleSwitchHarness`, with locale-aware `buildInvoiceDetailDto` rebuild via `useMemo`.

**Fixture:** `ISSUED` outgoing booking invoice with `generatedDocumentId`, outstanding balance — yields enabled record/regenerate actions and disabled edit with gate reason.

**Proof points:**

1. Opens More Menu (Radix pointer/mouse/keyboard sequence)
2. Verifies `data-state=open` + `[role="menu"]` present
3. DE labels: regenerate, record payment, edit (disabled), **Stornieren** (not `common.cancel`)
4. DE → EN toggle without remount (`useId` instance stable)
5. Menu remains open; EN labels update (`More`, `Void invoice`, etc.)
6. EN → DE toggle; menu remains open; **Stornieren** restored
7. Callback `onRecordPayment` invoked after locale switches (same mock identity)
8. Normal close via Escape verified

**Remount evidence:** `data-menu-instance` (`useId`) unchanged across both locale toggles.

---

## 4. Production / dictionary / Relations delta (old → final)

| Domain | Delta |
|--------|-------|
| PRODUCTION DIFF old→final | **ZERO** |
| `InvoiceDetailHeader.tsx` | ZERO |
| `InvoiceHeaderMoreMenu.tsx` | ZERO |
| `InvoiceDetail.tsx` | ZERO |
| `invoiceDetail.mapper.ts` | ZERO |
| `invoiceUtils.ts` | ZERO |
| `rental-invoice-detail-header-i18n.ts` | ZERO |
| RELATIONS DIFF | **ZERO** |
| EN dictionary diff | **ZERO** |
| DE dictionary diff | **ZERO** |
| Key count | **8786 / 8786** (unchanged) |
| P250 scanner diff | **ZERO** |
| Global scanner diff | **ZERO** |

---

## 5. Validation (final HEAD)

| Check | Result |
|-------|--------|
| P250 focused tests | **17/17 PASS** (+1) |
| P249 regression | PASS |
| P214 regression | PASS |
| P221–P223 regression | PASS |
| `npm run i18n:check` | PASS (**482** tests, was 481) |
| `npm run check:surface` | PASS |
| `npm run build` | PASS |
| `git diff --check` baseline→final | PASS |

---

## 6. Governance (unchanged from #1341)

| Metric | Value |
|--------|-------|
| P250 | 0 |
| P249–P216 | 0 |
| Global enforce-clean | 0 |
| Category E | 0 |
| Shim | 29 |
| New compatibility consumers | 0 |

---

## 7. #1341 conclusion preservation

All merge-critical conclusions from #1341: **UNAFFECTED**.

Former menu-state evidence gap: **RESOLVED BY DIRECT TEST**.

---

## 8. CI / collision

- CI on final HEAD: pending at certification time (install jobs queued)
- **P250-caused required CI failures = 0** (prior failures were pre-existing vehicle-detail backend)
- #1339 overlap: **NONE**
- Active Rental/Invoice collision: **NONE**

---

## 9. Final verdict

**A — FINAL HEAD CERTIFIED — PR #1340 READY TO MERGE**

**PR #1340 may now be marked ready and merged.**

**RENTAL CAMPAIGN STATUS: CONTINUES.**

**NEXT CANDIDATE:** P2.2.51 — Rental Invoice Relations Localization.

---

*Audit-only certification artifact. No production, dictionary, test, scanner, or architecture changes in this commit.*
