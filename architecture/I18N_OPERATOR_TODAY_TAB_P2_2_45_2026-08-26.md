# I18N — Operator Today Tab Chrome (P2.2.45)

**Version:** V4.9.972
**Date:** 2026-08-26
**Baseline:** `31a3c395705d79e303bfc810a276dfb71f508015`

## Overview

Localized host-owned Operator Today tab chrome: stale banner, page header, empty/error states, bucket section titles/subtitles, handover sublabels, alerts/blocked sections, and feed error chrome via `operator-today-i18n.ts`.

## Locale flow

`useLanguage().locale` → `operator-today-i18n.ts` (`otd`, bucket/section helpers); reuses `common.today`, `common.retry`.

## Machine values (frozen)

- Feed buckets: `NOW`, `TODAY`, `UPCOMING`, `PLANNED`, `UNASSIGNED`
- Alert severity: `CRITICAL`, `WARNING`, `INFO` → presentation labels only
- `offline`, `isStale`, `fullyEmpty` predicates unchanged

## Excluded

- `OperatorTaskCard*` row rendering (explicit out-of-scope)
- P216–P244 frozen surfaces

## Guardrails

P2.2.45 enforce-clean exact (4 paths) — 0 findings.

## Tests

`operator-today-localization.test.tsx` (9 tests).

## Semantics

Presentation-only; Category E = 0.
