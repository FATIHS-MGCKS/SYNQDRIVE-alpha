# P2.2.50 — Rental Invoice Detail Primary Implementation Audit

**Date:** 2026-08-26  
**Baseline:** `e0aa79d3135866eb9f890c2666165f15a1411c0b`  
**Branch:** `cursor/p2250-rental-invoice-detail-primary-i18n-3c10`  
**Pre-flight:** `docs/audits/i18n-p2-2-50-rental-invoice-detail-primary-preflight-2026-08-26.md` (PR #1335 — not merged into implementation branch)

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.50 RE-AUDIT**

P2.2.50 implementation is ready for independent re-audit.

## Topology

| Check | Result |
|-------|--------|
| merge-base | `e0aa79d3135866eb9f890c2666165f15a1411c0b` |
| rev-list count from baseline | 1 (implementation commit) |
| #1335 ancestry | NO |
| current-main absorbed | NO |

## Scope delivered

Localized host-owned presentation in:

1. `InvoiceDetailHeader.tsx` — paid/outstanding labels, invoice date, PDF button
2. `InvoiceHeaderMoreMenu.tsx` — menu trigger + action labels (reuses `common.edit` / `common.cancel`)
3. `InvoiceRelations.tsx` — heading + template label
4. `invoiceDetail.mapper.ts` — gate reasons, status/type/money/date via adapters
5. `invoiceRelations.mapper.ts` — relation labels, fallbacks, permissions, rental period chrome
6. `invoiceUtils.ts` — locale-threaded formatters
7. `rental-invoice-detail-primary-i18n.ts` — new bounded adapter

## Key accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| EN keys | 8760 | 8802 |
| DE keys | 8760 | 8802 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |
| New keys | — | 42 |
| Reused keys (call sites) | — | ~26 |

**Key budget note:** Pre-flight estimated ~24–28; actual 42 because pre-flight §26 identified 20 distinct gate-reason HOST PRESENTATION strings in `invoiceDetail.mapper.ts` requiring bounded `rental.invoice.detail.primary.gate.*` keys.

## Negative certifications

| Surface | Diff |
|---------|------|
| P249 Secondary | ZERO |
| P223 Documents panel | ZERO |
| Invoice Payments | ZERO |
| Invoice Line Items | ZERO |
| Financial calculations | ZERO |
| Tax semantics | ZERO |
| Payment semantics | ZERO |
| Category E | 0 |

## Validation

| Check | Result |
|-------|--------|
| P250 focused tests (11) | PASS |
| P249 regression (11) | PASS |
| P214 invoice list (17) | PASS |
| P221 create dialog (13) | PASS |
| P222 send dialog (11) | PASS |
| P223 documents localization (11) | PASS |
| `invoiceDetail.mapper.test.ts` (12) | PASS |
| `invoiceRelations.mapper.test.ts` (13) | PASS |
| Global i18n suite | 465 passed |
| `npm run i18n:check` | PASS |
| `npm run check:surface` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| P250 enforce-clean | 0 |
| P249–P216 | 0 |
| Global enforce-clean | 0 |

## Adapter classification

`rental-invoice-detail-primary-i18n.ts` — **CANONICAL**

Exports are presentation-only (static keys, gate reasons, relation chrome). No financial, eligibility, routing, or mutation logic.

## Same-mount locale switch

DE→EN and EN→DE on `InvoiceDetailHeader` preserve invoice number, raw cents, status machine IDs, and action eligibility. Gate reasons localize; `.allowed` unchanged.

## Collision / drift

| Check | Level |
|-------|-------|
| Active PR collision (#1336, #1331, etc.) | NONE on P250 paths |
| Current main drift on P250 paths | LOW (constants deletion excluded) |

## P251 forecast

**P251 FORECAST CONFIRMED** — Invoice Payments panel + `invoicePayments.mapper.ts`

## Rental campaign progress (approximate)

- P250 closed ~55–65 manual debt units (header + relations primary chrome)
- Remaining Rental findings: ~290–300 (post-P250 estimate)
- Global completion: ~93.3% (confidence: medium-high)
