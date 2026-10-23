# DS4 research archive index (PRs #2140–#2144)

**Archive PR:** consolidates offline research only — no production code, env flags, or DB migrations.

**Merged from `main` at:** `716f93fedd9d5408fa1db2de5b4cd1a786d9685c` (includes production C5.1 hardening #2146).

**Do not close the original open PRs until this archive is reviewed and merged.**

---

## Upstream input dependencies (not duplicated in this archive)

| PR | Directory on `main` / sibling branch | Role |
|----|--------------------------------------|------|
| [#2136](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2136) | `research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/` | Tesla video speed reference, TIG22 pinned snapshots (partial on `main`) |
| [#2139](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2139) | `research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023/` | Four-drive oracle/events, `replay_event_eval.cjs`, TIG22 prod shadow payload |

**Missing in repo `main` today (required for full re-run):**

- Entire `ds4-accel-brake-video-reference-20261023` tree (PR #2139) — C5.1 runner, C4 root-cause traces, PTQ regression, P1 probe summaries reference paths under this tree.
- Most `ds4-speed-video-reference-20261023` inputs beyond what landed on `main` (PR #2136) — see each study `REPRO.md`.
- LDI fixtures: `architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016/*` (TES16) — referenced by #2140/#2141.

Reproduction commands in child `REPRO.md` files assume those paths exist after merging #2136/#2139 or checking out their branch heads.

---

## Archived studies (this PR)

| PR | Head SHA | Directory | Status | Summary |
|----|----------|-----------|--------|---------|
| [#2140](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2140) | `ac3cd9cb32f820f011a4af7b9f30911f0a1bf8ac` | `ds4-c4-speed-root-cause-v1-20261023/` | **COMPLETE (forensics)** | C4 speed root-cause traces TES16 + TIG22; counterfactual summary |
| [#2141](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2141) | `d53582c48c4582d11b336c4cc65ed61600f00675` | `ds4-dimo-p1-temporal-probe-20261023/` | **COMPLETE (probe)** | DIMO P1 temporal evidence probe; `p1_probe_summary.json` |
| [#2142](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2142) | `18067741745bd83774cfd9e04c0ccb97cfb676c7` | `ds4-c5-ptq-v0-20261023/` | **REJECTED / DISCARDED** | C5 PTQ V0 offline experiment — superseded by C5.1 design; retained for audit trail only |
| [#2143](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2143) | `30b3f29b855d777838263e219f57cc71e425d64d` | `ds4-c5-1-gated-repair-design-20261023/` | **DESIGN FROZEN** | C5.1 architecture, eligibility/repair spec, validation gates (pre-implementation) |
| [#2144](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2144) | `c79ecee0472f4c41dd5cc3d4e211286f366262a3` | `ds4-c5-1-gated-repair-20261023/` | **FROZEN OFFLINE V1.2 REFERENCE** | Sealed `outputs/v1_2/*`, baselines, C1–C3 experiment; production port in `backend/` (#2145/#2146) |

### PR stack (research-only, for navigation)

```
main
 └── #2136 ds4-speed-video-reference
 └── #2139 ds4-accel-brake-video-reference
      └── #2140 c4-speed-root-cause
           └── #2141 dimo-p1-temporal-probe
                └── #2142 c5-ptq-v0  [DISCARDED]
                     └── #2143 c5-1-gated-repair-design
                          └── #2144 c5-1-offline-experiment [V1.2 REFERENCE]
```

Production integration (separate): #2145 → `main`; hardening #2146 → `main`.

---

## Quick reproduce (after upstream inputs present)

```bash
# #2140
cd research/driving-intelligence/evaluations/ds4-c4-speed-root-cause-v1-20261023
node scripts/build_traces.cjs --code-root <repo-root> --expect-sha <pinned-di-sha>

# #2141
cd ../ds4-dimo-p1-temporal-probe-20261023
node scripts/p1_dimo_temporal_probe.mjs   # see REPRO.md

# #2142 (historical only)
cd ../ds4-c5-ptq-v0-20261023
node scripts/run_c5_regression.cjs        # see REPRO.md — do not use for product decisions

# #2144 (authoritative offline V1.2)
cd ../ds4-c5-1-gated-repair-20261023
node scripts/c5-1.support.test.cjs
node scripts/c5-1.synthetic.test.cjs
node scripts/run_c5_1_experiment.cjs --code-root <repo-root>
```

---

## Hygiene (archive review)

- **Scope:** 61 files under the five `ds4-*` evaluation directories only; no `backend/`, `frontend/`, or `architecture/` edits in this archive PR.
- **Secrets:** No API keys, tokens, or credentials in archived text/JSON (spot-check + CI).
- **PII / raw GPS:** Trace outputs avoid lat/lon where documented; sealed coordinates remain in upstream #2136/#2139 fixtures (not copied here).
- **Duplicates:** Each directory is a single copy from its PR head; no merge of foreign branch commits.
